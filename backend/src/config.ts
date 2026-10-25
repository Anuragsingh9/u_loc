import crypto from 'node:crypto';
import fs from 'node:fs';
import type { Config } from './types/index.js';

/**
 * Load application configuration from environment variables with sensible defaults.
 * Throws in production if critical secrets are missing.
 */
export function loadConfig(overrides: Partial<Config> = {}): Config {
  if (fs.existsSync('.env') && typeof (process as any).loadEnvFile === 'function') {
    try {
      (process as any).loadEnvFile('.env');
    } catch {}
  }

  const isProduction = process.env.NODE_ENV === 'production';

  let adminPassword = process.env.ADMIN_PASSWORD ?? '';
  if (!adminPassword && isProduction) {
    throw new Error('ADMIN_PASSWORD environment variable is required in production');
  }
  if (!adminPassword) {
    adminPassword = 'admin-dev-password';
  }

  let jwtSecret = process.env.JWT_SECRET ?? '';
  if (!jwtSecret && isProduction) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  if (!jwtSecret) {
    jwtSecret = crypto.randomBytes(64).toString('hex');
  }

  const config: Config = {
    port: parseInt(process.env.PORT ?? '3001', 10),
    adminPassword,
    jwtSecret,
    sessionTtlMs: parseInt(process.env.SESSION_TTL_MS ?? '3600000', 10),
    staleTresholdMs: parseInt(process.env.STALE_THRESHOLD_MS ?? '30000', 10),
    maxPayloadSize: parseInt(process.env.MAX_PAYLOAD_SIZE ?? '1024', 10),
    maxLocationRateMs: parseInt(process.env.MAX_LOCATION_RATE_MS ?? '1000', 10),
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    pairingCodeLength: parseInt(process.env.PAIRING_CODE_LENGTH ?? '6', 10),
    adminTokenTtlMs: parseInt(process.env.ADMIN_TOKEN_TTL_MS ?? '3600000', 10),
    loginRateLimitMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX ?? '5', 10),
    ...overrides,
  };

  return config;
}
