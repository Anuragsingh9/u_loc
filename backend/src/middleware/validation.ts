import type { LocationData } from '../types/index.js';

/**
 * Validate location data. Returns sanitized LocationData or null if invalid.
 */
export function validateLocation(data: any): LocationData | null {
  if (!data || typeof data !== 'object') return null;

  const { lat, lng, accuracy } = data;
  let { timestamp } = data;

  // All fields must be numbers
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    typeof accuracy !== 'number' ||
    typeof timestamp !== 'number'
  ) {
    return null;
  }

  // Check for NaN / Infinity
  if (!isFinite(lat) || !isFinite(lng) || !isFinite(accuracy) || !isFinite(timestamp)) {
    return null;
  }

  // Latitude: -90 to 90
  if (lat < -90 || lat > 90) return null;

  // Longitude: -180 to 180
  if (lng < -180 || lng > 180) return null;

  // Accuracy must be positive
  if (accuracy <= 0) return null;

  // Handle timestamps passed in seconds (10 digits) instead of milliseconds (13 digits)
  if (timestamp > 1e8 && timestamp < 1e11) {
    timestamp = timestamp * 1000;
  }

  // Timestamp check: if relative or significantly skewed, normalize to server time
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  if (Math.abs(now - timestamp) > fiveMinutes) {
    timestamp = now;
  }

  return { lat, lng, accuracy, timestamp };
}

/**
 * Validate a pairing code. Returns normalized code or null if invalid.
 */
export function validatePairingCode(code: any, expectedLength: number = 6): string | null {
  if (typeof code !== 'string') return null;

  const normalized = code.trim().toUpperCase();

  if (normalized.length !== expectedLength) return null;

  // Must be alphanumeric only
  if (!/^[A-Z0-9]+$/.test(normalized)) return null;

  return normalized;
}

/**
 * Check if a payload exceeds the maximum allowed size.
 */
export function validatePayloadSize(data: any, maxSize: number): boolean {
  try {
    const serialized = JSON.stringify(data);
    return serialized.length <= maxSize;
  } catch {
    return false;
  }
}

/**
 * Sanitize a label string: strip HTML tags and limit length.
 */
export function sanitizeLabel(label: any): string | undefined {
  if (label === undefined || label === null) return undefined;
  if (typeof label !== 'string') return undefined;

  // Strip HTML tags
  const stripped = label.replace(/<[^>]*>/g, '');

  // Trim and limit length
  const trimmed = stripped.trim();
  if (trimmed.length === 0) return undefined;

  return trimmed.substring(0, 50);
}
