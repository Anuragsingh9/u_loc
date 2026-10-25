import { ref, onScopeDispose } from 'vue';
import { useSocket } from './useSocket';
import * as api from '@/services/api';
import type { SessionInfo, LocationUpdate } from '@/types';

const AUTH_TOKEN_KEY = 'u-loc-admin-token';

/**
 * Composable for admin dashboard functionality.
 */
export function useAdmin() {
  const { socket, connectionStatus, isConnected, connect, disconnect, emit, on, off } = useSocket();

  const isAuthenticated = ref(false);
  const sessions = ref<SessionInfo[]>([]);
  const token = ref<string | null>(null);
  const selectedSession = ref<string | null>(null);
  const authError = ref<string | null>(null);

  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Log in with the admin password.
   */
  async function login(password: string): Promise<void> {
    authError.value = null;
    try {
      const result = await api.adminLogin(password);
      token.value = result.token;
      sessionStorage.setItem(AUTH_TOKEN_KEY, result.token);
      isAuthenticated.value = true;

      // Connect socket and authenticate
      connect();
      const onConnect = () => {
        emit('admin:auth', { token: result.token });
      };
      if (isConnected.value) {
        onConnect();
      } else {
        socket.once('connect', onConnect);
      }
    } catch (err: any) {
      authError.value = err.message || 'Login failed';
      throw err;
    }
  }

  /**
   * Restore an existing session from sessionStorage.
   */
  function restoreSession(): boolean {
    const stored = sessionStorage.getItem(AUTH_TOKEN_KEY);
    if (stored) {
      token.value = stored;
      isAuthenticated.value = true;
      connect();
      socket.once('connect', () => {
        emit('admin:auth', { token: stored });
      });
      return true;
    }
    return false;
  }

  /**
   * Log out and clean up.
   */
  function logout(): void {
    token.value = null;
    isAuthenticated.value = false;
    sessions.value = [];
    selectedSession.value = null;
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    disconnect();
    stopAutoRefresh();
  }

  /**
   * Create a new sharing session.
   */
  function createSession(label?: string): void {
    emit('admin:create-session', { label });
  }

  /**
   * Delete a session via REST API.
   */
  async function deleteSessionById(sessionId: string): Promise<void> {
    if (!token.value) return;
    await api.deleteSession(token.value, sessionId);
    sessions.value = sessions.value.filter((s) => s.sessionId !== sessionId);
  }

  /**
   * Subscribe to a session's real-time updates.
   */
  function subscribeSession(sessionId: string): void {
    selectedSession.value = sessionId;
    emit('admin:subscribe', { sessionId });
  }

  /**
   * Unsubscribe from a session's updates.
   */
  function unsubscribeSession(sessionId: string): void {
    if (selectedSession.value === sessionId) {
      selectedSession.value = null;
    }
    emit('admin:unsubscribe', { sessionId });
  }

  /**
   * Request the sessions list from the server.
   */
  function refreshSessions(): void {
    emit('admin:list-sessions', {});
  }

  /**
   * Start auto-refreshing sessions list every 30 seconds.
   */
  function startAutoRefresh(): void {
    stopAutoRefresh();
    refreshSessions();
    refreshInterval = setInterval(refreshSessions, 30_000);
  }

  /**
   * Stop auto-refreshing.
   */
  function stopAutoRefresh(): void {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  // --- Socket event handlers ---

  function onAuthenticated(data: { success: boolean }) {
    if (data.success) {
      isAuthenticated.value = true;
      startAutoRefresh();
    }
  }

  function onAuthError(data: { message: string }) {
    authError.value = data.message;
    isAuthenticated.value = false;
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  }

  function onSessionCreated(data: SessionInfo) {
    sessions.value = [data, ...sessions.value];
  }

  function onSessionsList(data: { sessions: SessionInfo[] }) {
    sessions.value = data.sessions;
  }

  function onLocationUpdate(data: LocationUpdate) {
    const idx = sessions.value.findIndex((s) => s.sessionId === data.sessionId);
    if (idx !== -1) {
      sessions.value[idx] = {
        ...sessions.value[idx],
        lastLocation: {
          lat: data.lat,
          lng: data.lng,
          accuracy: data.accuracy,
          timestamp: data.timestamp,
          isStale: data.isStale,
        },
      };
      // Trigger full reactivity
      sessions.value = [...sessions.value];
    }
  }

  function onSharerConnected(data: { sessionId: string }) {
    const idx = sessions.value.findIndex((s) => s.sessionId === data.sessionId);
    if (idx !== -1) {
      sessions.value[idx] = { ...sessions.value[idx], isSharerConnected: true };
    }
  }

  function onSharerDisconnected(data: { sessionId: string }) {
    const idx = sessions.value.findIndex((s) => s.sessionId === data.sessionId);
    if (idx !== -1) {
      sessions.value[idx] = { ...sessions.value[idx], isSharerConnected: false };
    }
  }

  function onSessionExpired(data: { sessionId: string }) {
    sessions.value = sessions.value.filter((s) => s.sessionId !== data.sessionId);
  }

  // Register listeners
  on('admin:authenticated', onAuthenticated);
  on('admin:auth-error', onAuthError);
  on('admin:session-created', onSessionCreated);
  on('admin:sessions-list', onSessionsList);
  on('location:update', onLocationUpdate);
  on('sharer:connected', onSharerConnected);
  on('sharer:disconnected', onSharerDisconnected);
  on('session:expired', onSessionExpired);

  // Re-auth on connect / reconnect
  function attemptAdminAuth(): void {
    if (token.value) {
      emit('admin:auth', { token: token.value });
      if (selectedSession.value) {
        emit('admin:subscribe', { sessionId: selectedSession.value });
      }
      refreshSessions();
    }
  }

  socket.on('connect', attemptAdminAuth);
  socket.io.on('reconnect', attemptAdminAuth);

  function handleAdminOnline(): void {
    if (token.value) {
      if (!socket.connected) {
        connect();
      } else {
        attemptAdminAuth();
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleAdminOnline);
  }

  // Cleanup
  onScopeDispose(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleAdminOnline);
    }
    stopAutoRefresh();
    off('admin:authenticated', onAuthenticated);
    off('admin:auth-error', onAuthError);
    off('admin:session-created', onSessionCreated);
    off('admin:sessions-list', onSessionsList);
    off('location:update', onLocationUpdate);
    off('sharer:connected', onSharerConnected);
    off('sharer:disconnected', onSharerDisconnected);
    off('session:expired', onSessionExpired);
    disconnect();
  });

  return {
    isAuthenticated,
    sessions,
    token,
    selectedSession,
    authError,
    connectionStatus,
    login,
    restoreSession,
    logout,
    createSession,
    deleteSession: deleteSessionById,
    subscribeSession,
    unsubscribeSession,
    refreshSessions,
    startAutoRefresh,
    stopAutoRefresh,
  };
}
