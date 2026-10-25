import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp, type AppContext } from '../src/app.js';

describe('REST API', () => {
  let ctx: AppContext;
  let adminToken: string;

  beforeAll(() => {
    ctx = createApp({
      adminPassword: 'test-password-123',
      jwtSecret: 'test-jwt-secret-for-api-tests',
      sessionTtlMs: 3600000,
      loginRateLimitMax: 100,
    });
  });

  afterAll(() => {
    ctx.sessionManager.cleanup();
    ctx.io.close();
    ctx.server.close();
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const res = await request(ctx.app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(typeof res.body.uptime).toBe('number');
      expect(typeof res.body.activeSessions).toBe('number');
    });
  });

  describe('POST /api/admin/login', () => {
    it('should return a token with correct password', async () => {
      const res = await request(ctx.app)
        .post('/api/admin/login')
        .send({ password: 'test-password-123' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(typeof res.body.token).toBe('string');
      expect(res.body.expiresAt).toBeDefined();

      adminToken = res.body.token;
    });

    it('should reject wrong password with 401', async () => {
      const res = await request(ctx.app)
        .post('/api/admin/login')
        .send({ password: 'wrong-password' });

      expect(res.status).toBe(401);
    });

    it('should reject missing password with 400', async () => {
      const res = await request(ctx.app)
        .post('/api/admin/login')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should rate-limit login attempts', async () => {
      const rateCtx = createApp({
        adminPassword: 'test-rate-password',
        jwtSecret: 'test-rate-secret',
        loginRateLimitMax: 3,
      });

      // Make 5 requests (limit is 3/min)
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          request(rateCtx.app)
            .post('/api/admin/login')
            .send({ password: 'wrong' })
        );
      }

      const results = await Promise.all(promises);
      const tooMany = results.filter((r) => r.status === 429);
      expect(tooMany.length).toBeGreaterThanOrEqual(1);

      rateCtx.sessionManager.cleanup();
      rateCtx.io.close();
      rateCtx.server.close();
    });
  });

  describe('POST /api/admin/sessions', () => {
    it('should require authentication', async () => {
      const res = await request(ctx.app)
        .post('/api/admin/sessions')
        .send({});

      expect(res.status).toBe(401);
    });

    it('should create a session with valid auth', async () => {
      // First login to get a fresh token
      const loginRes = await request(ctx.app)
        .post('/api/admin/login')
        .send({ password: 'test-password-123' });
      const token = loginRes.body.token;

      const res = await request(ctx.app)
        .post('/api/admin/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({ label: 'Test Session' });

      expect(res.status).toBe(201);
      expect(res.body.sessionId).toBeDefined();
      expect(res.body.pairingCode).toBeDefined();
      expect(res.body.pairingCode).toMatch(/^[A-Z0-9]{6}$/);
      expect(res.body.expiresAt).toBeDefined();
      expect(res.body.label).toBe('Test Session');
    });
  });

  describe('GET /api/admin/sessions', () => {
    it('should require authentication', async () => {
      const res = await request(ctx.app).get('/api/admin/sessions');
      expect(res.status).toBe(401);
    });

    it('should list sessions with valid auth', async () => {
      const loginRes = await request(ctx.app)
        .post('/api/admin/login')
        .send({ password: 'test-password-123' });
      const token = loginRes.body.token;

      const res = await request(ctx.app)
        .get('/api/admin/sessions')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.sessions)).toBe(true);
    });
  });

  describe('DELETE /api/admin/sessions/:id', () => {
    it('should delete an existing session', async () => {
      const loginRes = await request(ctx.app)
        .post('/api/admin/login')
        .send({ password: 'test-password-123' });
      const token = loginRes.body.token;

      // Create a session first
      const createRes = await request(ctx.app)
        .post('/api/admin/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({ label: 'To Delete' });

      const sessionId = createRes.body.sessionId;

      // Delete it
      const res = await request(ctx.app)
        .delete(`/api/admin/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent session', async () => {
      const loginRes = await request(ctx.app)
        .post('/api/admin/login')
        .send({ password: 'test-password-123' });
      const token = loginRes.body.token;

      const res = await request(ctx.app)
        .delete('/api/admin/sessions/non-existent-id')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/share/validate', () => {
    it('should validate a correct pairing code', async () => {
      const loginRes = await request(ctx.app)
        .post('/api/admin/login')
        .send({ password: 'test-password-123' });
      const token = loginRes.body.token;

      const createRes = await request(ctx.app)
        .post('/api/admin/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      const pairingCode = createRes.body.pairingCode;

      const res = await request(ctx.app)
        .post('/api/share/validate')
        .send({ pairingCode });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.sessionId).toBeDefined();
    });

    it('should reject invalid pairing code', async () => {
      const res = await request(ctx.app)
        .post('/api/share/validate')
        .send({ pairingCode: 'ZZZZZZ' });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
    });
  });

  describe('Expired token rejection', () => {
    it('should reject an expired/invalid token', async () => {
      const res = await request(ctx.app)
        .get('/api/admin/sessions')
        .set('Authorization', 'Bearer invalid-token-here');

      expect(res.status).toBe(401);
    });
  });
});
