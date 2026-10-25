import { ref, watch, onScopeDispose } from 'vue';
import { useSocket } from './useSocket';
import { useGeolocation } from './useGeolocation';
import type { SharingStatus } from '@/types';

/**
 * Composable for managing the sharer's location sharing workflow.
 */
export function useSharing() {
  const { socket, connectionStatus, isConnected, connect, disconnect, emit, on, off } = useSocket();
  const { currentPosition, error: geoError, isWatching, startWatching, stopWatching, checkPermission } = useGeolocation();

  const status = ref<SharingStatus>('idle');
  const sessionId = ref<string | null>(null);
  const expiresAt = ref<number | null>(null);
  const error = ref<string | null>(null);

  let _pairingCode: string | null = null;

  /**
   * Show the consent screen.
   */
  function grantConsent(): void {
    status.value = 'entering-code';
  }

  /**
   * Begin sharing: connect socket, join session, start geolocation.
   */
  async function startSharing(pairingCode: string): Promise<void> {
    if (status.value === 'sharing') return;

    _pairingCode = pairingCode;
    error.value = null;
    status.value = 'connecting';

    // Check permission first
    await checkPermission();

    connect();

    // Wait for connection, then emit join
    const onConnect = () => {
      emit('sharer:join', { pairingCode, consent: true });
    };

    if (isConnected.value) {
      onConnect();
    } else {
      socket.once('connect', onConnect);
    }
  }

  /**
   * Stop sharing entirely — always stops geolocation immediately.
   */
  function stopSharing(): void {
    // ALWAYS stop geolocation watcher first, regardless of connection state
    stopWatching();

    // Attempt to notify server
    if (isConnected.value) {
      emit('sharer:stop', {});
    }

    disconnect();

    sessionId.value = null;
    expiresAt.value = null;
    _pairingCode = null;
    status.value = 'stopped';
  }

  // --- Socket event handlers ---

  function onSessionJoined(data: { sessionId: string; expiresAt: number }) {
    sessionId.value = data.sessionId;
    expiresAt.value = data.expiresAt;
    status.value = 'sharing';
    startWatching();
  }

  function onSessionExpired() {
    stopWatching();
    disconnect();
    status.value = 'expired';
    sessionId.value = null;
    expiresAt.value = null;
  }

  function onSessionError(data: { message: string; code: string }) {
    error.value = data.message;
    status.value = 'error';
    stopWatching();
  }

  // Register socket event listeners
  on('session:joined', onSessionJoined);
  on('session:expired', onSessionExpired);
  on('session:error', onSessionError);

  // Attempt to rejoin on reconnect
  socket.io.on('reconnect', () => {
    if (_pairingCode && (status.value === 'sharing' || status.value === 'connecting')) {
      emit('sharer:join', { pairingCode: _pairingCode, consent: true });
    }
  });

  // Watch geolocation position and emit location updates
  watch(currentPosition, (pos) => {
    if (pos && status.value === 'sharing' && isConnected.value) {
      emit('sharer:location', {
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
        timestamp: pos.timestamp,
      });
    }
  });

  // Watch geolocation errors
  watch(geoError, (err) => {
    if (err && status.value === 'sharing') {
      error.value = err.message;
    }
  });

  // Cleanup
  onScopeDispose(() => {
    stopWatching();
    off('session:joined', onSessionJoined);
    off('session:expired', onSessionExpired);
    off('session:error', onSessionError);
    disconnect();
  });

  return {
    status,
    sessionId,
    expiresAt,
    error,
    connectionStatus,
    isConnected,
    currentPosition,
    geoError,
    isWatching,
    startSharing,
    stopSharing,
    grantConsent,
  };
}
