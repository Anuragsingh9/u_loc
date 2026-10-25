import type { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * Create a simple in-memory rate limiter for Express routes.
 * Tracks requests by IP address with automatic cleanup.
 */
export function createRateLimiter(windowMs: number, maxRequests: number) {
  const clients: Map<string, RateLimitEntry> = new Map();

  // Periodic cleanup of expired entries
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of clients) {
      if (now > entry.resetTime) {
        clients.delete(ip);
      }
    }
  }, windowMs);

  // Don't prevent process exit
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  const middleware = (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();

    let entry = clients.get(ip);

    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + windowMs };
      clients.set(ip, entry);
    }

    entry.count++;

    if (entry.count > maxRequests) {
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
      return;
    }

    next();
  };

  // Attach cleanup function for testing
  (middleware as any).cleanup = () => {
    clearInterval(cleanupInterval);
    clients.clear();
  };

  return middleware;
}
