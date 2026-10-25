import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import cors from 'cors';
import helmet from 'helmet';
import { Server as SocketIOServer } from 'socket.io';
import type { Config } from './types/index.js';
import { loadConfig } from './config.js';
import { SessionManager } from './services/sessionManager.js';
import { AuthService } from './services/authService.js';
import { createRequireAdmin } from './middleware/auth.js';
import { createRateLimiter } from './middleware/rateLimiter.js';
import { validatePairingCode, sanitizeLabel } from './middleware/validation.js';
import { setupSocketHandlers } from './socketHandler.js';

export interface AppContext {
  app: express.Application;
  server: http.Server;
  io: SocketIOServer;
  sessionManager: SessionManager;
  authService: AuthService;
  config: Config;
}

/**
 * Factory function to create a fully configured app with HTTP server and Socket.IO.
 * Accepts optional config overrides for testing.
 */
export function createApp(configOverrides: Partial<Config> = {}): AppContext {
  const config = loadConfig(configOverrides);
  const app = express();
  const server = http.createServer(app);

  // Socket.IO setup
  const io = new SocketIOServer(server, {
    cors: {
      origin: config.allowedOrigins,
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: config.maxPayloadSize * 10, // Allow some overhead for Socket.IO framing
  });

  // Services
  const sessionManager = new SessionManager(config);
  const authService = new AuthService(config);

  // Middleware
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: [
            "'self'",
            'data:',
            'blob:',
            'https://*.tile.openstreetmap.org',
            'https://*.openstreetmap.org',
            'https://*.basemaps.cartocdn.com',
            'https://*.cartocdn.com',
            'https://basemaps.cartocdn.com',
          ],
          connectSrc: ["'self'", 'ws:', 'wss:', 'http:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: {
        policy: 'strict-origin-when-cross-origin',
      },
    })
  );
  app.use(
    cors({
      origin: config.allowedOrigins,
      methods: ['GET', 'POST', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );
  app.use(express.json({ limit: `${config.maxPayloadSize}b` }));

  // Rate limiters
  const loginRateLimiter = createRateLimiter(60000, config.loginRateLimitMax ?? 5); // configurable for tests

  // Auth middleware
  const requireAdmin = createRequireAdmin(authService);

  // ---- REST Routes ----

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      activeSessions: sessionManager.getAllSessions().length,
    });
  });

  // Admin login
  app.post('/api/admin/login', loginRateLimiter, (req, res) => {
    const { password } = req.body;

    if (!password || typeof password !== 'string') {
      res.status(400).json({ error: 'Password required' });
      return;
    }

    const result = authService.generateAdminToken(password);
    if (!result) {
      res.status(401).json({ error: 'Invalid password' });
      return;
    }

    res.json({ token: result.token, expiresAt: result.expiresAt });
  });

  // Create session
  app.post('/api/admin/sessions', requireAdmin, (req, res) => {
    const label = sanitizeLabel(req.body?.label);
    const session = sessionManager.createSession(label);

    res.status(201).json({
      sessionId: session.sessionId,
      pairingCode: session.pairingCode,
      expiresAt: session.expiresAt,
      label: session.label,
    });
  });

  // List sessions
  app.get('/api/admin/sessions', requireAdmin, (_req, res) => {
    const sessions = sessionManager.getAllSessions();
    res.json({ sessions });
  });

  // Delete/end session
  app.delete('/api/admin/sessions/:id', requireAdmin, (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const session = sessionManager.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Notify connected clients and admin dashboards before ending
    io.to(`session:${id}`).to('admins').emit('session:expired', { sessionId: id });

    sessionManager.endSession(id);
    res.json({ success: true });
  });

  // Validate pairing code
  app.post('/api/share/validate', (req, res) => {
    const code = validatePairingCode(req.body?.pairingCode, config.pairingCodeLength);

    if (!code) {
      res.json({ valid: false });
      return;
    }

    const session = sessionManager.validatePairingCode(code);
    if (!session) {
      res.json({ valid: false });
      return;
    }

    res.json({ valid: true, sessionId: session.sessionId });
  });

  // Setup Socket.IO handlers
  setupSocketHandlers(io, sessionManager, authService, config);

  // Serve built frontend assets if present (production / single-service deployment)
  const candidatePaths = [
    path.resolve(process.cwd(), '../frontend/dist'),
    path.resolve(process.cwd(), 'frontend/dist'),
    path.resolve(process.cwd(), 'dist/public'),
    path.resolve(process.cwd(), 'public'),
  ];
  const staticPath = candidatePaths.find((p) => fs.existsSync(path.join(p, 'index.html')));

  if (staticPath) {
    app.use(express.static(staticPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        return next();
      }
      res.sendFile(path.join(staticPath, 'index.html'));
    });
  }

  return { app, server, io, sessionManager, authService, config };
}
