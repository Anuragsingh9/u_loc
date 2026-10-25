/** Core location data payload */
export interface LocationData {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

/** Public session information (sanitized for API responses) */
export interface SessionInfo {
  sessionId: string;
  pairingCode: string;
  label?: string;
  createdAt: number;
  expiresAt?: number | null;
  isSharerConnected: boolean;
  lastLocation?: LocationData & { isStale: boolean };
  sharerSocketId?: string;
}

/** Admin authentication token metadata */
export interface AdminToken {
  token: string;
  expiresAt: number;
  socketIds: Set<string>;
}

/** Internal sharing session with admin subscriber tracking */
export interface SharingSession extends SessionInfo {
  adminSubscribers: Set<string>;
}

/** Application configuration */
export interface Config {
  port: number;
  adminPassword: string;
  jwtSecret: string;
  sessionTtlMs: number;
  staleTresholdMs: number;
  maxPayloadSize: number;
  maxLocationRateMs: number;
  allowedOrigins: string[];
  pairingCodeLength: number;
  adminTokenTtlMs: number;
  loginRateLimitMax?: number;
}

/** Augment Express Request to carry admin token info */
declare global {
  namespace Express {
    interface Request {
      tokenId?: string;
    }
  }
}
