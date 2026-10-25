import type { Server, Socket } from 'socket.io';
import type { SessionManager } from './services/sessionManager.js';
import type { AuthService } from './services/authService.js';
import type { Config } from './types/index.js';
import { validateLocation, validatePairingCode, validatePayloadSize } from './middleware/validation.js';

/** Socket metadata stored on socket.data */
interface SocketData {
  role?: 'sharer' | 'admin';
  sessionId?: string;
  isAdmin?: boolean;
  tokenId?: string;
}

/**
 * Set up all Socket.IO event handlers for sharer and admin communication.
 */
export function setupSocketHandlers(
  io: Server,
  sessionManager: SessionManager,
  authService: AuthService,
  config: Config
): void {
  io.on('connection', (socket: Socket) => {
    // Log connection without sensitive data
    console.log(`[Socket] Connected: ${socket.id}`);

    // Initialize socket data
    socket.data = {} as SocketData;

    // ---- Sharer Events ----

    socket.on('sharer:join', (data: any, callback?: Function) => {
      try {
        // Validate payload size
        if (!validatePayloadSize(data, config.maxPayloadSize)) {
          socket.emit('session:error', { message: 'Payload too large', code: 'PAYLOAD_TOO_LARGE' });
          return;
        }

        if (!data || typeof data !== 'object') {
          socket.emit('session:error', { message: 'Invalid data', code: 'INVALID_DATA' });
          return;
        }

        // Consent must be explicitly true
        if (data.consent !== true) {
          socket.emit('session:error', { message: 'Consent required', code: 'CONSENT_REQUIRED' });
          return;
        }

        // Validate pairing code format
        const pairingCode = validatePairingCode(data.pairingCode, config.pairingCodeLength);
        if (!pairingCode) {
          socket.emit('session:error', { message: 'Invalid pairing code', code: 'INVALID_CODE' });
          return;
        }

        // Cleanly disconnect any lingering old socket if reconnecting with a new socket ID
        const existingSession = sessionManager.validatePairingCode(pairingCode);
        if (existingSession && existingSession.sharerSocketId && existingSession.sharerSocketId !== socket.id) {
          const oldSocket = io.sockets.sockets.get(existingSession.sharerSocketId);
          if (oldSocket) {
            oldSocket.leave(`session:${existingSession.sessionId}`);
            oldSocket.disconnect(true);
          }
        }

        // Join the session
        const session = sessionManager.joinSession(pairingCode, socket.id);
        if (!session) {
          socket.emit('session:error', { message: 'Invalid or expired pairing code', code: 'INVALID_CODE' });
          return;
        }

        // Store socket metadata
        socket.data.role = 'sharer';
        socket.data.sessionId = session.sessionId;

        // Join the Socket.IO room
        const room = `session:${session.sessionId}`;
        socket.join(room);

        // Notify the sharer
        socket.emit('session:joined', {
          sessionId: session.sessionId,
          expiresAt: session.expiresAt,
        });

        // Notify subscribed admins and all admin dashboards
        io.to(room).to('admins').emit('sharer:connected', { sessionId: session.sessionId });

        if (typeof callback === 'function') {
          callback({ success: true });
        }
      } catch (err) {
        console.error('[Socket] Error in sharer:join handler');
        socket.emit('session:error', { message: 'Internal error', code: 'INTERNAL_ERROR' });
      }
    });

    socket.on('sharer:location', (data: any) => {
      try {
        // Must be a sharer with an active session
        if (socket.data.role !== 'sharer' || !socket.data.sessionId) {
          socket.emit('session:error', { message: 'Not in a session', code: 'NOT_IN_SESSION' });
          return;
        }

        // Validate payload size
        if (!validatePayloadSize(data, config.maxPayloadSize)) {
          socket.emit('session:error', { message: 'Payload too large', code: 'PAYLOAD_TOO_LARGE' });
          return;
        }

        // Validate location data
        const location = validateLocation(data);
        if (!location) {
          socket.emit('session:error', { message: 'Invalid location data', code: 'INVALID_LOCATION' });
          return;
        }

        // Update session with rate limiting
        const updated = sessionManager.updateLocation(socket.data.sessionId, socket.id, location);
        if (!updated) {
          // Could be rate limited or session ended — don't spam errors for rate limiting
          return;
        }

        // Broadcast to admin subscribers and all authenticated admins
        const room = `session:${socket.data.sessionId}`;
        io.to(room).to('admins').emit('location:update', {
          sessionId: socket.data.sessionId,
          lat: location.lat,
          lng: location.lng,
          accuracy: location.accuracy,
          timestamp: location.timestamp,
          isStale: false,
        });
      } catch (err) {
        console.error('[Socket] Error in sharer:location handler');
      }
    });

    socket.on('sharer:stop', () => {
      try {
        if (socket.data.role !== 'sharer' || !socket.data.sessionId) {
          return;
        }

        const sessionId = socket.data.sessionId;
        const room = `session:${sessionId}`;

        // Mark sharer disconnected on server, but keep session alive unless admin cancels/deletes
        const session = sessionManager.getSession(sessionId);
        if (session) {
          session.isSharerConnected = false;
          session.sharerSocketId = undefined;
          if (session.lastLocation) {
            session.lastLocation.isStale = true;
          }
        }

        // Notify admins that the sharer stopped broadcasting
        io.to(room).to('admins').emit('sharer:disconnected', { sessionId });

        // Leave the room
        socket.leave(room);

        // Clear socket data
        socket.data.role = undefined;
        socket.data.sessionId = undefined;
      } catch (err) {
        console.error('[Socket] Error in sharer:stop handler');
      }
    });

    // ---- Admin Events ----

    socket.on('admin:auth', (data: any) => {
      try {
        if (!data || typeof data !== 'object' || typeof data.token !== 'string') {
          socket.emit('admin:auth-error', { message: 'Token required' });
          return;
        }

        const result = authService.verifyAdminToken(data.token);
        if (!result.valid || !result.tokenId) {
          socket.emit('admin:auth-error', { message: 'Invalid or expired token' });
          return;
        }

        // Mark socket as authenticated admin
        socket.data.role = 'admin';
        socket.data.isAdmin = true;
        socket.data.tokenId = result.tokenId;
        socket.join('admins');

        socket.emit('admin:authenticated', { success: true });
      } catch (err) {
        console.error('[Socket] Error in admin:auth handler');
        socket.emit('admin:auth-error', { message: 'Authentication failed' });
      }
    });

    socket.on('admin:create-session', (data: any) => {
      try {
        if (!socket.data.isAdmin) {
          socket.emit('session:error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });
          return;
        }

        const label = data?.label;
        const session = sessionManager.createSession(
          typeof label === 'string' ? label.substring(0, 50) : undefined
        );

        socket.emit('admin:session-created', {
          sessionId: session.sessionId,
          pairingCode: session.pairingCode,
          expiresAt: session.expiresAt,
          label: session.label,
        });
      } catch (err) {
        console.error('[Socket] Error in admin:create-session handler');
        socket.emit('session:error', { message: 'Failed to create session', code: 'INTERNAL_ERROR' });
      }
    });

    socket.on('admin:subscribe', (data: any) => {
      try {
        if (!socket.data.isAdmin) {
          socket.emit('session:error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });
          return;
        }

        if (!data || typeof data.sessionId !== 'string') {
          socket.emit('session:error', { message: 'Session ID required', code: 'INVALID_DATA' });
          return;
        }

        const subscribed = sessionManager.subscribeAdmin(data.sessionId, socket.id);
        if (!subscribed) {
          socket.emit('session:error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' });
          return;
        }

        // Join the Socket.IO room to receive broadcasts
        socket.join(`session:${data.sessionId}`);

        // Immediately emit latest location if available
        const session = sessionManager.getSession(data.sessionId);
        if (session && session.lastLocation) {
          socket.emit('location:update', {
            sessionId: data.sessionId,
            lat: session.lastLocation.lat,
            lng: session.lastLocation.lng,
            accuracy: session.lastLocation.accuracy,
            timestamp: session.lastLocation.timestamp,
            isStale: session.lastLocation.isStale,
          });
        }
      } catch (err) {
        console.error('[Socket] Error in admin:subscribe handler');
      }
    });

    socket.on('admin:unsubscribe', (data: any) => {
      try {
        if (!data || typeof data.sessionId !== 'string') {
          return;
        }

        sessionManager.unsubscribeAdmin(data.sessionId, socket.id);
        socket.leave(`session:${data.sessionId}`);
      } catch (err) {
        console.error('[Socket] Error in admin:unsubscribe handler');
      }
    });

    socket.on('admin:list-sessions', () => {
      try {
        if (!socket.data.isAdmin) {
          socket.emit('session:error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });
          return;
        }

        const sessions = sessionManager.getAllSessions();
        socket.emit('admin:sessions-list', { sessions });
      } catch (err) {
        console.error('[Socket] Error in admin:list-sessions handler');
      }
    });

    // ---- Disconnect ----

    socket.on('disconnect', () => {
      try {
        console.log(`[Socket] Disconnected: ${socket.id}`);

        if (socket.data.role === 'sharer' && socket.data.sessionId) {
          const sessionId = sessionManager.disconnectSharer(socket.id);
          if (sessionId) {
            // Notify admins that the sharer disconnected
            io.to(`session:${sessionId}`).to('admins').emit('sharer:disconnected', { sessionId });
          }
        }

        if (socket.data.isAdmin) {
          sessionManager.disconnectAdmin(socket.id);
        }
      } catch (err) {
        console.error('[Socket] Error in disconnect handler');
      }
    });
  });
}
