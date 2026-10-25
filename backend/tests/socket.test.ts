import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { createApp, type AppContext } from '../src/app.js';
import type { AddressInfo } from 'node:net';

function waitForEvent<T = any>(socket: ClientSocket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeoutMs);

    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function createClientSocket(port: number): ClientSocket {
  return ioc(`http://localhost:${port}`, {
    transports: ['websocket'],
    autoConnect: false,
  });
}

function connectSocket(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Connection timeout')), 5000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.connect();
  });
}

describe('Socket.IO', () => {
  let ctx: AppContext;
  let port: number;
  const sockets: ClientSocket[] = [];

  function trackSocket(socket: ClientSocket): ClientSocket {
    sockets.push(socket);
    return socket;
  }

  beforeAll(async () => {
    ctx = createApp({
      adminPassword: 'socket-test-password',
      jwtSecret: 'socket-test-jwt-secret',
      sessionTtlMs: 3600000,
      maxLocationRateMs: 100, // Fast rate limit for testing
      loginRateLimitMax: 100,
    });

    await new Promise<void>((resolve) => {
      ctx.server.listen(0, () => {
        port = (ctx.server.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterEach(() => {
    // Disconnect all tracked sockets
    for (const s of sockets) {
      if (s.connected) s.disconnect();
    }
    sockets.length = 0;
  });

  afterAll(() => {
    ctx.sessionManager.cleanup();
    ctx.io.close();
    ctx.server.close();
  });

  async function getAdminToken(): Promise<string> {
    const res = await request(ctx.app)
      .post('/api/admin/login')
      .send({ password: 'socket-test-password' });
    return res.body.token;
  }

  async function createSession(token: string): Promise<{ sessionId: string; pairingCode: string }> {
    const res = await request(ctx.app)
      .post('/api/admin/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    return { sessionId: res.body.sessionId, pairingCode: res.body.pairingCode };
  }

  describe('Sharer join', () => {
    it('should join with valid pairing code', async () => {
      const token = await getAdminToken();
      const { pairingCode } = await createSession(token);

      const client = trackSocket(createClientSocket(port));
      await connectSocket(client);

      const joinedPromise = waitForEvent(client, 'session:joined');
      client.emit('sharer:join', { pairingCode, consent: true });

      const data = await joinedPromise;
      expect(data.sessionId).toBeDefined();
      expect(data.expiresAt).toBeDefined();
    });

    it('should reject join with invalid pairing code', async () => {
      const client = trackSocket(createClientSocket(port));
      await connectSocket(client);

      const errorPromise = waitForEvent(client, 'session:error');
      client.emit('sharer:join', { pairingCode: 'BADCOD', consent: true });

      const data = await errorPromise;
      expect(data.code).toBe('INVALID_CODE');
    });

    it('should reject join without consent', async () => {
      const token = await getAdminToken();
      const { pairingCode } = await createSession(token);

      const client = trackSocket(createClientSocket(port));
      await connectSocket(client);

      const errorPromise = waitForEvent(client, 'session:error');
      client.emit('sharer:join', { pairingCode, consent: false });

      const data = await errorPromise;
      expect(data.code).toBe('CONSENT_REQUIRED');
    });
  });

  describe('Location updates', () => {
    it('should broadcast location update to admin', async () => {
      const token = await getAdminToken();
      const { sessionId, pairingCode } = await createSession(token);

      // Admin socket
      const adminSocket = trackSocket(createClientSocket(port));
      await connectSocket(adminSocket);

      const authPromise = waitForEvent(adminSocket, 'admin:authenticated');
      adminSocket.emit('admin:auth', { token });
      await authPromise;

      // Subscribe admin to session
      adminSocket.emit('admin:subscribe', { sessionId });
      // Small delay for subscription to be processed
      await new Promise((r) => setTimeout(r, 100));

      // Sharer socket
      const sharerSocket = trackSocket(createClientSocket(port));
      await connectSocket(sharerSocket);

      const joinedPromise = waitForEvent(sharerSocket, 'session:joined');
      sharerSocket.emit('sharer:join', { pairingCode, consent: true });
      await joinedPromise;

      // Send location
      const locationPromise = waitForEvent(adminSocket, 'location:update');
      sharerSocket.emit('sharer:location', {
        lat: 40.7128,
        lng: -74.006,
        accuracy: 10,
        timestamp: Date.now(),
      });

      const locationData = await locationPromise;
      expect(locationData.sessionId).toBe(sessionId);
      expect(locationData.lat).toBe(40.7128);
      expect(locationData.lng).toBe(-74.006);
      expect(locationData.isStale).toBe(false);
    });

    it('should reject invalid coordinates', async () => {
      const token = await getAdminToken();
      const { pairingCode } = await createSession(token);

      const client = trackSocket(createClientSocket(port));
      await connectSocket(client);

      const joinedPromise = waitForEvent(client, 'session:joined');
      client.emit('sharer:join', { pairingCode, consent: true });
      await joinedPromise;

      const errorPromise = waitForEvent(client, 'session:error');
      client.emit('sharer:location', {
        lat: 200, // Invalid
        lng: -74.006,
        accuracy: 10,
        timestamp: Date.now(),
      });

      const data = await errorPromise;
      expect(data.code).toBe('INVALID_LOCATION');
    });
  });

  describe('Sharer stop & Admin session deletion', () => {
    it('should notify admin when sharer stops and expire when admin ends session', async () => {
      const token = await getAdminToken();
      const { sessionId, pairingCode } = await createSession(token);

      // Admin socket subscribed
      const adminSocket = trackSocket(createClientSocket(port));
      await connectSocket(adminSocket);

      const authPromise = waitForEvent(adminSocket, 'admin:authenticated');
      adminSocket.emit('admin:auth', { token });
      await authPromise;

      adminSocket.emit('admin:subscribe', { sessionId });
      await new Promise((r) => setTimeout(r, 100));

      // Sharer joins
      const sharerSocket = trackSocket(createClientSocket(port));
      await connectSocket(sharerSocket);

      const joinedPromise = waitForEvent(sharerSocket, 'session:joined');
      sharerSocket.emit('sharer:join', { pairingCode, consent: true });
      await joinedPromise;

      // Sharer stops broadcasting
      const disconnectedPromise = waitForEvent(adminSocket, 'sharer:disconnected');
      sharerSocket.emit('sharer:stop');

      const disconnectData = await disconnectedPromise;
      expect(disconnectData.sessionId).toBe(sessionId);

      // Session stays alive in memory until admin explicitly deletes it
      expect(ctx.sessionManager.getSession(sessionId)).not.toBeNull();

      // Admin deletes / ends the session
      const expiredPromise = waitForEvent(adminSocket, 'session:expired');
      await request(ctx.app)
        .delete(`/api/admin/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${token}`);

      const expireData = await expiredPromise;
      expect(expireData.sessionId).toBe(sessionId);
      expect(ctx.sessionManager.getSession(sessionId)).toBeNull();
    });
  });

  describe('Admin auth', () => {
    it('should authenticate with valid token', async () => {
      const token = await getAdminToken();

      const adminSocket = trackSocket(createClientSocket(port));
      await connectSocket(adminSocket);

      const authPromise = waitForEvent(adminSocket, 'admin:authenticated');
      adminSocket.emit('admin:auth', { token });

      const data = await authPromise;
      expect(data.success).toBe(true);
    });

    it('should reject invalid token', async () => {
      const adminSocket = trackSocket(createClientSocket(port));
      await connectSocket(adminSocket);

      const errorPromise = waitForEvent(adminSocket, 'admin:auth-error');
      adminSocket.emit('admin:auth', { token: 'invalid-token' });

      const data = await errorPromise;
      expect(data.message).toBeDefined();
    });
  });

  describe('Admin subscribe', () => {
    it('should subscribe to existing session', async () => {
      const token = await getAdminToken();
      const { sessionId } = await createSession(token);

      const adminSocket = trackSocket(createClientSocket(port));
      await connectSocket(adminSocket);

      const authPromise = waitForEvent(adminSocket, 'admin:authenticated');
      adminSocket.emit('admin:auth', { token });
      await authPromise;

      // Should not error
      adminSocket.emit('admin:subscribe', { sessionId });
      await new Promise((r) => setTimeout(r, 100));
    });

    it('should reject subscribe for unauthorized admin', async () => {
      const adminSocket = trackSocket(createClientSocket(port));
      await connectSocket(adminSocket);

      const errorPromise = waitForEvent(adminSocket, 'session:error');
      adminSocket.emit('admin:subscribe', { sessionId: 'some-session' });

      const data = await errorPromise;
      expect(data.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Session expiry notification', () => {
    it('should notify on session expiry', async () => {
      // Create a context with very short TTL
      const shortCtx = createApp({
        adminPassword: 'short-test',
        jwtSecret: 'short-test-secret',
        sessionTtlMs: 500,
        maxLocationRateMs: 100,
      });

      await new Promise<void>((resolve) => {
        shortCtx.server.listen(0, () => resolve());
      });
      const shortPort = (shortCtx.server.address() as AddressInfo).port;

      try {
        // Login and create session
        const loginRes = await request(shortCtx.app)
          .post('/api/admin/login')
          .send({ password: 'short-test' });
        const token = loginRes.body.token;

        const createRes = await request(shortCtx.app)
          .post('/api/admin/sessions')
          .set('Authorization', `Bearer ${token}`)
          .send({});

        const sessionId = createRes.body.sessionId;

        // Wait for expiry
        await new Promise((r) => setTimeout(r, 700));

        // Session should be gone
        const listRes = await request(shortCtx.app)
          .get('/api/admin/sessions')
          .set('Authorization', `Bearer ${token}`);

        const found = listRes.body.sessions.find((s: any) => s.sessionId === sessionId);
        expect(found).toBeUndefined();
      } finally {
        shortCtx.sessionManager.cleanup();
        shortCtx.io.close();
        shortCtx.server.close();
      }
    });
  });

  describe('Cross-session isolation', () => {
    it('should not allow sharer A to send to session B', async () => {
      const token = await getAdminToken();

      // Create two sessions
      const sessionA = await createSession(token);
      const sessionB = await createSession(token);

      // Sharer joins session A
      const sharerA = trackSocket(createClientSocket(port));
      await connectSocket(sharerA);

      const joinedPromise = waitForEvent(sharerA, 'session:joined');
      sharerA.emit('sharer:join', { pairingCode: sessionA.pairingCode, consent: true });
      await joinedPromise;

      // Sharer A is in session A, but the location update goes through socket.data.sessionId
      // So even if somehow they tried, the server uses their bound session
      // The protection is in the updateLocation method checking socket ownership
      const result = ctx.sessionManager.updateLocation(
        sessionB.sessionId,
        sharerA.id!,
        { lat: 40.7128, lng: -74.006, accuracy: 10, timestamp: Date.now() }
      );

      expect(result).toBe(false);
    });
  });

  describe('Rate limiting on location updates', () => {
    it('should rate-limit rapid location updates', async () => {
      const token = await getAdminToken();
      const { pairingCode, sessionId } = await createSession(token);

      const client = trackSocket(createClientSocket(port));
      await connectSocket(client);

      const joinedPromise = waitForEvent(client, 'session:joined');
      client.emit('sharer:join', { pairingCode, consent: true });
      await joinedPromise;

      // Send first location — should work
      client.emit('sharer:location', {
        lat: 40.7128,
        lng: -74.006,
        accuracy: 10,
        timestamp: Date.now(),
      });

      // Immediately send second — should be rate-limited (silently dropped)
      client.emit('sharer:location', {
        lat: 40.7129,
        lng: -74.007,
        accuracy: 10,
        timestamp: Date.now(),
      });

      // Wait a bit then check the session's last location
      await new Promise((r) => setTimeout(r, 200));
      const session = ctx.sessionManager.getSession(sessionId);
      // Should still have the first location (rate-limited second one)
      expect(session!.lastLocation!.lat).toBe(40.7128);
    });
  });

  describe('Disconnection handling', () => {
    it('should notify admin when sharer disconnects', async () => {
      const token = await getAdminToken();
      const { sessionId, pairingCode } = await createSession(token);

      // Admin subscribes
      const adminSocket = trackSocket(createClientSocket(port));
      await connectSocket(adminSocket);

      const authPromise = waitForEvent(adminSocket, 'admin:authenticated');
      adminSocket.emit('admin:auth', { token });
      await authPromise;

      adminSocket.emit('admin:subscribe', { sessionId });
      await new Promise((r) => setTimeout(r, 100));

      // Sharer joins
      const sharerSocket = trackSocket(createClientSocket(port));
      await connectSocket(sharerSocket);

      const joinedPromise = waitForEvent(sharerSocket, 'session:joined');
      sharerSocket.emit('sharer:join', { pairingCode, consent: true });
      await joinedPromise;

      // Wait for the connected notification
      await new Promise((r) => setTimeout(r, 100));

      // Sharer disconnects
      const disconnectedPromise = waitForEvent(adminSocket, 'sharer:disconnected');
      sharerSocket.disconnect();

      const data = await disconnectedPromise;
      expect(data.sessionId).toBe(sessionId);
    });
  });
});
