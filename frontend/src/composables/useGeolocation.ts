import { ref, onScopeDispose } from 'vue';
import type { LocationData, GeolocationError } from '@/types';

/**
 * Composable for reactive browser geolocation access.
 */
export function useGeolocation() {
  const currentPosition = ref<LocationData | null>(null);
  const error = ref<GeolocationError | null>(null);
  const isWatching = ref(false);
  const permissionStatus = ref<PermissionState | 'unknown'>('unknown');

  let watchId: number | null = null;

  /**
   * Check the geolocation permission state via the Permissions API.
   */
  async function checkPermission(): Promise<PermissionState | 'unknown'> {
    if (!navigator.permissions) {
      permissionStatus.value = 'unknown';
      return 'unknown';
    }
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      permissionStatus.value = result.state;

      result.addEventListener('change', () => {
        permissionStatus.value = result.state;
      });

      return result.state;
    } catch {
      permissionStatus.value = 'unknown';
      return 'unknown';
    }
  }

  /**
   * Start watching the user's position with high accuracy.
   */
  function startWatching(): void {
    if (isWatching.value) return;

    if (!navigator.geolocation) {
      error.value = {
        code: 2,
        message: 'Geolocation is not supported by this browser',
      };
      return;
    }

    error.value = null;

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        let ts = position.timestamp;
        if (!ts || ts < 1e11) {
          ts = ts && ts > 1e8 ? ts * 1000 : Date.now();
        }
        currentPosition.value = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy || 10,
          timestamp: ts,
        };
        error.value = null;
      },
      (err) => {
        error.value = {
          code: err.code,
          message: getErrorMessage(err.code),
        };
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    );

    isWatching.value = true;
  }

  /**
   * Stop watching the user's position.
   */
  function stopWatching(): void {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    isWatching.value = false;
  }

  /**
   * Map GeolocationPositionError codes to human-readable messages.
   */
  function getErrorMessage(code: number): string {
    switch (code) {
      case 1:
        return 'Location permission denied. Please enable location access in your browser settings.';
      case 2:
        return 'Location information is unavailable. Please check your device settings.';
      case 3:
        return 'Location request timed out. Please try again.';
      default:
        return 'An unknown geolocation error occurred.';
    }
  }

  // Cleanup on scope disposal
  onScopeDispose(() => {
    stopWatching();
  });

  return {
    currentPosition,
    error,
    isWatching,
    permissionStatus,
    startWatching,
    stopWatching,
    checkPermission,
  };
}
