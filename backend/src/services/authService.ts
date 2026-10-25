import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import type { Config } from '../types/index.js';

/**
 * Handles admin authentication: password verification and JWT token management.
 */
export class AuthService {
  constructor(private config: Config) {}

  /**
   * Generate an admin JWT token after verifying the password.
   * Uses timing-safe comparison to prevent timing attacks.
   */
  generateAdminToken(password: string): { token: string; expiresAt: number } | null {
    // Timing-safe password comparison
    const passwordBuffer = Buffer.from(password);
    const expectedBuffer = Buffer.from(this.config.adminPassword);

    // Lengths must match for timingSafeEqual
    if (passwordBuffer.length !== expectedBuffer.length) {
      // Still do a comparison to maintain constant-ish time
      const paddedExpected = Buffer.alloc(passwordBuffer.length, 0);
      expectedBuffer.copy(paddedExpected, 0, 0, Math.min(expectedBuffer.length, paddedExpected.length));
      crypto.timingSafeEqual(passwordBuffer, paddedExpected);
      return null;
    }

    if (!crypto.timingSafeEqual(passwordBuffer, expectedBuffer)) {
      return null;
    }

    const tokenId = uuidv4();
    const expiresAt = Date.now() + this.config.adminTokenTtlMs;
    const expiresInSeconds = Math.floor(this.config.adminTokenTtlMs / 1000);

    const token = jwt.sign(
      {
        sub: 'admin',
        jti: tokenId,
      },
      this.config.jwtSecret,
      {
        expiresIn: expiresInSeconds,
      }
    );

    return { token, expiresAt };
  }

  /**
   * Verify a JWT token and return its validity and token ID.
   */
  verifyAdminToken(token: string): { valid: boolean; tokenId?: string } {
    try {
      const decoded = jwt.verify(token, this.config.jwtSecret) as jwt.JwtPayload;

      if (decoded.sub !== 'admin' || !decoded.jti) {
        return { valid: false };
      }

      return { valid: true, tokenId: decoded.jti };
    } catch {
      return { valid: false };
    }
  }
}
