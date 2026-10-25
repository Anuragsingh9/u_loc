import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type { Config, LocationData, SessionInfo, SharingSession } from '../types/index.js';

/**
 * Manages all sharing sessions, pairing codes, and admin subscriptions in memory.
 */
export class SessionManager {
  private sessions: Map<string, SharingSession> = new Map();
  private pairingCodes: Map<string, string> = new Map(); // code → sessionId
  private cleanupTimers: Map<string, NodeJS.Timeout> = new Map();
  private lastLocationTime: Map<string, number> = new Map(); // socketId → last update time

  constructor(private config: Config) {}

  /**
   * Create a new sharing session with a unique pairing code.
   */
  createSession(label?: string): SharingSession {
    const sessionId = uuidv4();
    const pairingCode = this.generatePairingCode();
    const now = Date.now();

    const session: SharingSession = {
      sessionId,
      pairingCode,
      label: label ?? undefined,
      createdAt: now,
      expiresAt: this.config.sessionTtlMs > 0 ? now + this.config.sessionTtlMs : null,
      isSharerConnected: false,
      adminSubscribers: new Set(),
    };

    this.sessions.set(sessionId, session);
    this.pairingCodes.set(pairingCode, sessionId);

    // Schedule auto-cleanup only before session is started
    if (this.config.sessionTtlMs > 0) {
      const timer = setTimeout(() => {
        this.endSession(sessionId);
      }, this.config.sessionTtlMs);

      if (timer.unref) {
        timer.unref();
      }

      this.cleanupTimers.set(sessionId, timer);
    }

    return session;
  }

  /**
   * Validate a pairing code and return the associated session.
   */
  validatePairingCode(code: string): SharingSession | null {
    const normalized = code.toUpperCase().trim();
    const sessionId = this.pairingCodes.get(normalized);
    if (!sessionId) return null;

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.pairingCodes.delete(normalized);
      return null;
    }

    // Check if expired (if an expiration was set)
    if (session.expiresAt && Date.now() > session.expiresAt) {
      this.endSession(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Get a session by ID. Returns null if expired or not found.
   */
  getSession(sessionId: string): SharingSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (session.expiresAt && Date.now() > session.expiresAt) {
      this.endSession(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Get all active sessions as sanitized SessionInfo objects.
   */
  getAllSessions(): SessionInfo[] {
    const now = Date.now();
    const result: SessionInfo[] = [];

    for (const [id, session] of this.sessions) {
      if (session.expiresAt && now > session.expiresAt) {
        this.endSession(id);
        continue;
      }

      result.push({
        sessionId: session.sessionId,
        pairingCode: session.pairingCode,
        label: session.label,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        isSharerConnected: session.isSharerConnected,
        lastLocation: session.lastLocation,
      });
    }

    return result;
  }

  /**
   * Link a sharer to a session via pairing code.
   * Cancels any cleanup timers so the session remains active indefinitely.
   */
  joinSession(pairingCode: string, socketId: string): SharingSession | null {
    const normalized = pairingCode.toUpperCase().trim();
    const sessionId = this.pairingCodes.get(normalized);
    if (!sessionId) return null;

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.pairingCodes.delete(normalized);
      return null;
    }

    if (session.expiresAt && Date.now() > session.expiresAt) {
      this.endSession(sessionId);
      return null;
    }

    // If someone is already connected, reject
    if (session.isSharerConnected && session.sharerSocketId) {
      return null;
    }

    // Cancel any cleanup timer — session does not expire once started
    const timer = this.cleanupTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(sessionId);
    }
    session.expiresAt = null;

    session.isSharerConnected = true;
    session.sharerSocketId = socketId;

    // Remove pairing code so it cannot be reused
    this.pairingCodes.delete(normalized);

    return session;
  }

  /**
   * Update location for a session. Validates ownership and rate limits.
   */
  updateLocation(sessionId: string, socketId: string, location: LocationData): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Verify the sender owns this session
    if (session.sharerSocketId !== socketId) return false;

    // Check expiry
    if (session.expiresAt && Date.now() > session.expiresAt) {
      this.endSession(sessionId);
      return false;
    }

    // Rate limiting
    if (this.isRateLimited(socketId)) return false;

    // Update last location time for rate limiting
    this.lastLocationTime.set(socketId, Date.now());

    // Store location with stale flag
    session.lastLocation = {
      ...location,
      isStale: false,
    };

    return true;
  }

  /**
   * Subscribe an admin socket to a session's updates.
   */
  subscribeAdmin(sessionId: string, adminSocketId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (session.expiresAt && Date.now() > session.expiresAt) {
      this.endSession(sessionId);
      return false;
    }

    session.adminSubscribers.add(adminSocketId);
    return true;
  }

  /**
   * Unsubscribe an admin socket from a session's updates.
   */
  unsubscribeAdmin(sessionId: string, adminSocketId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.adminSubscribers.delete(adminSocketId);
    }
  }

  /**
   * End a session and clear all associated data.
   */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Clear the cleanup timer
    const timer = this.cleanupTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(sessionId);
    }

    // Clear rate limit tracking for the sharer
    if (session.sharerSocketId) {
      this.lastLocationTime.delete(session.sharerSocketId);
    }

    // Remove pairing code mapping
    this.pairingCodes.delete(session.pairingCode);

    // Remove session
    this.sessions.delete(sessionId);
  }

  /**
   * Handle sharer disconnection. Returns the sessionId if found.
   * Marks the session as disconnected but doesn't immediately end it.
   */
  disconnectSharer(socketId: string): string | null {
    for (const [sessionId, session] of this.sessions) {
      if (session.sharerSocketId === socketId) {
        session.isSharerConnected = false;
        session.sharerSocketId = undefined;
        this.lastLocationTime.delete(socketId);

        // Mark last location as stale
        if (session.lastLocation) {
          session.lastLocation.isStale = true;
        }

        return sessionId;
      }
    }
    return null;
  }

  /**
   * Handle admin socket disconnection. Removes admin from all session subscriptions.
   */
  disconnectAdmin(socketId: string): void {
    for (const session of this.sessions.values()) {
      session.adminSubscribers.delete(socketId);
    }
  }

  /**
   * Check if a socket is rate-limited for location updates.
   */
  isRateLimited(socketId: string): boolean {
    const lastTime = this.lastLocationTime.get(socketId);
    if (!lastTime) return false;
    return Date.now() - lastTime < this.config.maxLocationRateMs;
  }

  /**
   * Clean up all sessions and timers. Used for graceful shutdown.
   */
  cleanup(): void {
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();
    this.sessions.clear();
    this.pairingCodes.clear();
    this.lastLocationTime.clear();
  }

  /**
   * Find a session by the sharer's socket ID.
   */
  getSessionBySocketId(socketId: string): SharingSession | null {
    for (const session of this.sessions.values()) {
      if (session.sharerSocketId === socketId) {
        if (session.expiresAt && Date.now() > session.expiresAt) {
          this.endSession(session.sessionId);
          return null;
        }
        return session;
      }
    }
    return null;
  }

  /**
   * Called when a session expires (for external notification hooks).
   */
  private onSessionExpired?: (sessionId: string) => void;

  setExpiryCallback(callback: (sessionId: string) => void): void {
    this.onSessionExpired = callback;
  }

  /**
   * Generate a cryptographically random alphanumeric pairing code.
   */
  private generatePairingCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code: string;

    do {
      const bytes = crypto.randomBytes(this.config.pairingCodeLength);
      code = Array.from(bytes)
        .map((b) => chars[b % chars.length])
        .join('');
    } while (this.pairingCodes.has(code));

    return code;
  }
}
