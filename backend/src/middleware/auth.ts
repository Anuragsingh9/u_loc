import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService.js';
import type { Config } from '../types/index.js';

/**
 * Create Express middleware that requires a valid admin JWT token.
 * Extracts the Bearer token from the Authorization header and
 * attaches the tokenId to the request object.
 */
export function createRequireAdmin(authService: AuthService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization required' });
      return;
    }

    const token = authHeader.slice(7); // Remove 'Bearer '

    if (!token) {
      res.status(401).json({ error: 'Token required' });
      return;
    }

    const result = authService.verifyAdminToken(token);

    if (!result.valid || !result.tokenId) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    req.tokenId = result.tokenId;
    next();
  };
}
