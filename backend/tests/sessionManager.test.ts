import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../src/services/sessionManager.js';
import type { Config } from '../src/types/index.js';

function createTestConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 3001,
    adminPassword: 'test-password',
    jwtSecret: 'test-secret-key-for-testing',
    sessionTtlMs: 3600000,
    staleTresholdMs: 30000,
    maxPayloadSize: 1024,
    maxLocationRateMs: 1000,
    allowedOrigins: ['http://localhost:3000'],
    pairingCodeLength: 6,
    adminTokenTtlMs: 3600000,
    ...overrides,
  };
}

describe('SessionManager', () => {
  let manager: SessionManager;
  let config: Config;

  beforeEach(() => {
    config = createTestConfig();
    manager = new SessionManager(config);
  });

  afterEach(() => {
    manager.cleanup();
  });

  describe('createSession', () => {
    it('should generate a session with valid ID, pairing code, and expiry', () => {
      const session = manager.createSession('Test Session');

      expect(session.sessionId).toBeDefined();
      expect(session.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(session.pairingCode).toBeDefined();
      expect(session.pairingCode).toMatch(/^[A-Z0-9]{6}$/);
      expect(session.label).toBe('Test Session');
      expect(session.expiresAt).toBeGreaterThan(Date.now());
      expect(session.isSharerConnected).toBe(false);
      expect(session.createdAt).toBeLessThanOrEqual(Date.now());
    });

    it('should create sessions without a label', () => {
      const session = manager.createSession();
      expect(session.label).toBeUndefined();
    });

    it('should generate unique pairing codes for each session', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const session = manager.createSession();
        codes.add(session.pairingCode);
      }
      expect(codes.size).toBe(20);
    });
  });

  describe('validatePairingCode', () => {
    it('should return the session for a valid pairing code', () => {
      const session = manager.createSession();
      const found = manager.validatePairingCode(session.pairingCode);

      expect(found).not.toBeNull();
      expect(found!.sessionId).toBe(session.sessionId);
    });

    it('should return null for an invalid pairing code', () => {
      const result = manager.validatePairingCode('XXXXXX');
      expect(result).toBeNull();
    });

    it('should be case-insensitive', () => {
      const session = manager.createSession();
      const found = manager.validatePairingCode(session.pairingCode.toLowerCase());

      expect(found).not.toBeNull();
      expect(found!.sessionId).toBe(session.sessionId);
    });
  });

  describe('joinSession', () => {
    it('should link a sharer to a session', () => {
      const session = manager.createSession();
      const joined = manager.joinSession(session.pairingCode, 'socket-123');

      expect(joined).not.toBeNull();
      expect(joined!.isSharerConnected).toBe(true);
      expect(joined!.sharerSocketId).toBe('socket-123');
    });

    it('should allow sharer to reconnect with pairing code and update socket ID', () => {
      const session = manager.createSession();
      const code = session.pairingCode;

      // First join should succeed
      const joined = manager.joinSession(code, 'socket-1');
      expect(joined).not.toBeNull();
      expect(joined!.sharerSocketId).toBe('socket-1');
      expect(joined!.isSharerConnected).toBe(true);

      // Reconnecting with same code (network toggle / Wi-Fi) updates socket and remains connected
      const reconnected = manager.joinSession(code, 'socket-2');
      expect(reconnected).not.toBeNull();
      expect(reconnected!.sharerSocketId).toBe('socket-2');
      expect(reconnected!.isSharerConnected).toBe(true);
    });

    it('should invalidate pairing code once session is ended by admin', () => {
      const session = manager.createSession();
      const code = session.pairingCode;

      manager.endSession(session.sessionId);
      const result = manager.joinSession(code, 'socket-1');
      expect(result).toBeNull();
    });

    it('should return null for invalid pairing code', () => {
      const result = manager.joinSession('INVALID', 'socket-1');
      expect(result).toBeNull();
    });
  });

  describe('session expiry', () => {
    it('should expire sessions after TTL', async () => {
      const shortConfig = createTestConfig({ sessionTtlMs: 100 });
      const shortManager = new SessionManager(shortConfig);

      const session = shortManager.createSession();
      const sessionId = session.sessionId;

      // Session should exist immediately
      expect(shortManager.getSession(sessionId)).not.toBeNull();

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Session should be gone
      expect(shortManager.getSession(sessionId)).toBeNull();

      shortManager.cleanup();
    });

    it('should return null for expired sessions from getSession', async () => {
      const shortConfig = createTestConfig({ sessionTtlMs: 50 });
      const shortManager = new SessionManager(shortConfig);

      const session = shortManager.createSession();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(shortManager.getSession(session.sessionId)).toBeNull();

      shortManager.cleanup();
    });

    it('should NOT expire once a session is started by sharer and works until admin ends it', async () => {
      const shortConfig = createTestConfig({ sessionTtlMs: 100 });
      const shortManager = new SessionManager(shortConfig);

      const session = shortManager.createSession();
      // Sharer joins and starts the session
      const joined = shortManager.joinSession(session.pairingCode, 'socket-sharer');
      expect(joined).not.toBeNull();
      expect(joined!.expiresAt).toBeNull();

      // Wait past the original TTL
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Session MUST still be alive and active
      const activeSession = shortManager.getSession(session.sessionId);
      expect(activeSession).not.toBeNull();
      expect(activeSession!.isSharerConnected).toBe(true);

      // Only ends when admin explicitly deletes / ends it
      shortManager.endSession(session.sessionId);
      expect(shortManager.getSession(session.sessionId)).toBeNull();

      shortManager.cleanup();
    });
  });

  describe('updateLocation', () => {
    it('should update location for a valid session and socket', () => {
      const session = manager.createSession();
      manager.joinSession(session.pairingCode, 'socket-1');

      const updated = manager.updateLocation(session.sessionId, 'socket-1', {
        lat: 40.7128,
        lng: -74.006,
        accuracy: 10,
        timestamp: Date.now(),
      });

      expect(updated).toBe(true);

      const updatedSession = manager.getSession(session.sessionId);
      expect(updatedSession!.lastLocation).toBeDefined();
      expect(updatedSession!.lastLocation!.lat).toBe(40.7128);
    });

    it('should reject update from wrong socket', () => {
      const session = manager.createSession();
      manager.joinSession(session.pairingCode, 'socket-1');

      const updated = manager.updateLocation(session.sessionId, 'socket-wrong', {
        lat: 40.7128,
        lng: -74.006,
        accuracy: 10,
        timestamp: Date.now(),
      });

      expect(updated).toBe(false);
    });

    it('should rate-limit updates', () => {
      const rateConfig = createTestConfig({ maxLocationRateMs: 500 });
      const rateManager = new SessionManager(rateConfig);

      const session = rateManager.createSession();
      rateManager.joinSession(session.pairingCode, 'socket-1');

      const location = {
        lat: 40.7128,
        lng: -74.006,
        accuracy: 10,
        timestamp: Date.now(),
      };

      // First update should succeed
      expect(rateManager.updateLocation(session.sessionId, 'socket-1', location)).toBe(true);

      // Immediate second update should be rate-limited
      expect(rateManager.updateLocation(session.sessionId, 'socket-1', location)).toBe(false);

      rateManager.cleanup();
    });

    it('should reject update for non-existent session', () => {
      const updated = manager.updateLocation('non-existent', 'socket-1', {
        lat: 40.7128,
        lng: -74.006,
        accuracy: 10,
        timestamp: Date.now(),
      });

      expect(updated).toBe(false);
    });
  });

  describe('sharer disconnect', () => {
    it('should mark sharer as disconnected and return sessionId', () => {
      const session = manager.createSession();
      manager.joinSession(session.pairingCode, 'socket-1');

      const sessionId = manager.disconnectSharer('socket-1');
      expect(sessionId).toBe(session.sessionId);

      const updatedSession = manager.getSession(session.sessionId);
      expect(updatedSession!.isSharerConnected).toBe(false);
      expect(updatedSession!.sharerSocketId).toBeUndefined();
    });

    it('should return null for unknown socket', () => {
      const result = manager.disconnectSharer('unknown-socket');
      expect(result).toBeNull();
    });

    it('should mark last location as stale on disconnect', () => {
      const session = manager.createSession();
      manager.joinSession(session.pairingCode, 'socket-1');
      manager.updateLocation(session.sessionId, 'socket-1', {
        lat: 40.7128,
        lng: -74.006,
        accuracy: 10,
        timestamp: Date.now(),
      });

      manager.disconnectSharer('socket-1');

      const updatedSession = manager.getSession(session.sessionId);
      expect(updatedSession!.lastLocation!.isStale).toBe(true);
    });
  });

  describe('admin subscription', () => {
    it('should subscribe admin to session', () => {
      const session = manager.createSession();
      const result = manager.subscribeAdmin(session.sessionId, 'admin-socket-1');
      expect(result).toBe(true);
    });

    it('should return false for non-existent session', () => {
      const result = manager.subscribeAdmin('non-existent', 'admin-socket-1');
      expect(result).toBe(false);
    });

    it('should unsubscribe admin from session', () => {
      const session = manager.createSession();
      manager.subscribeAdmin(session.sessionId, 'admin-socket-1');
      manager.unsubscribeAdmin(session.sessionId, 'admin-socket-1');
      // No error means success — internal subscribers set is updated
    });

    it('should remove admin from all sessions on disconnect', () => {
      const session1 = manager.createSession();
      const session2 = manager.createSession();

      manager.subscribeAdmin(session1.sessionId, 'admin-socket-1');
      manager.subscribeAdmin(session2.sessionId, 'admin-socket-1');

      manager.disconnectAdmin('admin-socket-1');
      // No error means success
    });
  });

  describe('multiple concurrent sessions', () => {
    it('should keep sessions isolated', () => {
      const session1 = manager.createSession('Session 1');
      const session2 = manager.createSession('Session 2');

      manager.joinSession(session1.pairingCode, 'socket-1');
      manager.joinSession(session2.pairingCode, 'socket-2');

      // Update location on session 1
      manager.updateLocation(session1.sessionId, 'socket-1', {
        lat: 40.7128,
        lng: -74.006,
        accuracy: 10,
        timestamp: Date.now(),
      });

      // Session 2 should have no location
      const s2 = manager.getSession(session2.sessionId);
      expect(s2!.lastLocation).toBeUndefined();

      // Session 1 should have location
      const s1 = manager.getSession(session1.sessionId);
      expect(s1!.lastLocation).toBeDefined();
    });

    it('should not allow cross-session location updates', () => {
      const session1 = manager.createSession();
      const session2 = manager.createSession();

      manager.joinSession(session1.pairingCode, 'socket-1');
      manager.joinSession(session2.pairingCode, 'socket-2');

      // Socket-1 tries to update session-2
      const result = manager.updateLocation(session2.sessionId, 'socket-1', {
        lat: 40.7128,
        lng: -74.006,
        accuracy: 10,
        timestamp: Date.now(),
      });

      expect(result).toBe(false);
    });
  });

  describe('endSession', () => {
    it('should clear all session data', () => {
      const session = manager.createSession();
      const code = session.pairingCode;
      manager.joinSession(code, 'socket-1');
      manager.subscribeAdmin(session.sessionId, 'admin-1');

      manager.endSession(session.sessionId);

      expect(manager.getSession(session.sessionId)).toBeNull();
      expect(manager.validatePairingCode(code)).toBeNull();
    });

    it('should be idempotent', () => {
      const session = manager.createSession();
      manager.endSession(session.sessionId);
      manager.endSession(session.sessionId); // Should not throw
    });
  });

  describe('getAllSessions', () => {
    it('should return sanitized session list', () => {
      manager.createSession('Session A');
      manager.createSession('Session B');

      const sessions = manager.getAllSessions();
      expect(sessions).toHaveLength(2);

      // Should not expose adminSubscribers
      for (const s of sessions) {
        expect((s as any).adminSubscribers).toBeUndefined();
      }
    });
  });

  describe('getSessionBySocketId', () => {
    it('should find session by sharer socket', () => {
      const session = manager.createSession();
      manager.joinSession(session.pairingCode, 'socket-1');

      const found = manager.getSessionBySocketId('socket-1');
      expect(found).not.toBeNull();
      expect(found!.sessionId).toBe(session.sessionId);
    });

    it('should return null for unknown socket', () => {
      const found = manager.getSessionBySocketId('unknown');
      expect(found).toBeNull();
    });
  });
});
