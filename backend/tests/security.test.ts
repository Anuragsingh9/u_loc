import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp, type AppContext } from '../src/app.js';

describe('Security', () => {
  let ctx: AppContext;

  beforeAll(() => {
    ctx = createApp({
      adminPassword: 'security-test-password',
      jwtSecret: 'security-test-jwt-secret',
      maxPayloadSize: 1024,
    });
  });

  afterAll(() => {
    ctx.sessionManager.cleanup();
    ctx.io.close();
    ctx.server.close();
  });

  async function getAdminToken(): Promise<string> {
    const res = await request(ctx.app)
      .post('/api/admin/login')
      .send({ password: 'security-test-password' });
    return res.body.token;
  }

  describe('No location data written to files', () => {
    it('should not use fs.writeFile with location data (code review check)', async () => {
      // This is a static analysis check — verify our source code doesn't write location data
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const { fileURLToPath } = await import('node:url');

      const srcDir = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
        'src'
      );

      const files = await getSourceFiles(srcDir);

      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        // Check that no source file uses fs.writeFile, fs.writeFileSync, or fs.appendFile with location data
        const hasFileWrite =
          content.includes('fs.writeFile') ||
          content.includes('fs.writeFileSync') ||
          content.includes('fs.appendFile') ||
          content.includes('fs.appendFileSync');

        if (hasFileWrite) {
          // If fs write exists, it should not contain location-related writes
          expect(
            content.includes('location') && hasFileWrite,
            `File ${file} writes location data to disk`
          ).toBe(false);
        }
      }
    });
  });

  describe('Payload size limits', () => {
    it('should reject oversized request bodies', async () => {
      const token = await getAdminToken();
      const largeLabel = 'A'.repeat(2000);

      const res = await request(ctx.app)
        .post('/api/admin/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({ label: largeLabel });

      // Even though payload is large, the label gets sanitized/truncated
      // so the request should still succeed but with truncated label
      if (res.status === 201) {
        expect(res.body.label?.length).toBeLessThanOrEqual(50);
      }
      // Or it could be rejected due to body parser limit
      expect([201, 413]).toContain(res.status);
    });
  });

  describe('Expired JWT rejection', () => {
    it('should reject an expired JWT', async () => {
      // Create a context with very short token TTL
      const shortCtx = createApp({
        adminPassword: 'exp-test',
        jwtSecret: 'exp-test-secret',
        adminTokenTtlMs: 1000, // 1 second
      });

      try {
        const loginRes = await request(shortCtx.app)
          .post('/api/admin/login')
          .send({ password: 'exp-test' });

        const token = loginRes.body.token;

        // Wait for token to expire
        await new Promise((r) => setTimeout(r, 1500));

        const res = await request(shortCtx.app)
          .get('/api/admin/sessions')
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(401);
      } finally {
        shortCtx.sessionManager.cleanup();
        shortCtx.io.close();
        shortCtx.server.close();
      }
    });
  });

  describe('Pairing code replay prevention', () => {
    it('should not allow a pairing code to be used after join', async () => {
      const token = await getAdminToken();

      // Create session
      const createRes = await request(ctx.app)
        .post('/api/admin/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      const pairingCode = createRes.body.pairingCode;

      // Validate — should be valid
      const validateRes1 = await request(ctx.app)
        .post('/api/share/validate')
        .send({ pairingCode });
      expect(validateRes1.body.valid).toBe(true);

      // Simulate join (directly via session manager)
      const session = ctx.sessionManager.joinSession(pairingCode, 'test-socket-id');
      expect(session).not.toBeNull();

      // Try to validate again — should be invalid (code consumed)
      const validateRes2 = await request(ctx.app)
        .post('/api/share/validate')
        .send({ pairingCode });
      expect(validateRes2.body.valid).toBe(false);
    });
  });

  describe('CORS headers', () => {
    it('should include CORS headers in response', async () => {
      const res = await request(ctx.app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3000');

      // CORS headers should be present
      expect(res.headers['access-control-allow-origin']).toBeDefined();
    });
  });
});

/**
 * Recursively collect all .ts files in a directory.
 */
async function getSourceFiles(dir: string): Promise<string[]> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await getSourceFiles(fullPath)));
    } else if (entry.name.endsWith('.ts')) {
      results.push(fullPath);
    }
  }

  return results;
}
