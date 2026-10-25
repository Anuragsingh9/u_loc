export interface LocationData {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

export interface SessionInfo {
  sessionId: string;
  pairingCode: string;
  label?: string;
  createdAt: number;
  expiresAt?: number | null;
  isSharerConnected: boolean;
  lastLocation?: {
    lat: number;
    lng: number;
    accuracy: number;
    timestamp: number;
    isStale: boolean;
  };
}

export interface LocationUpdate extends LocationData {
  sessionId: string;
  isStale: boolean;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export type SharingStatus =
  | 'idle'
  | 'consenting'
  | 'entering-code'
  | 'connecting'
  | 'sharing'
  | 'stopped'
  | 'error'
  | 'expired';

export interface GeolocationError {
  code: number;
  message: string;
}
