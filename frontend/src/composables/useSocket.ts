import { ref, computed, onScopeDispose } from 'vue';
import { createSocket, type Socket } from '@/services/socket';
import type { ConnectionStatus } from '@/types';

/**
 * Composable for managing a Socket.IO connection with reactive status.
 */
export function useSocket(url?: string) {
  const socket: Socket = createSocket(url);
  const connectionStatus = ref<ConnectionStatus>('disconnected');

  const isConnected = computed(() => connectionStatus.value === 'connected');

  function setupListeners(): void {
    socket.on('connect', () => {
      connectionStatus.value = 'connected';
    });

    socket.on('disconnect', () => {
      connectionStatus.value = 'disconnected';
    });

    socket.on('connect_error', () => {
      connectionStatus.value = 'error';
    });

    socket.io.on('reconnect_attempt', () => {
      connectionStatus.value = 'connecting';
    });

    socket.io.on('reconnect', () => {
      connectionStatus.value = 'connected';
    });

    socket.io.on('reconnect_failed', () => {
      connectionStatus.value = 'error';
    });
  }

  function connect(): void {
    if (!socket.connected) {
      connectionStatus.value = 'connecting';
      socket.connect();
    }
  }

  function disconnect(): void {
    socket.disconnect();
    connectionStatus.value = 'disconnected';
  }

  function emit(event: string, data?: any): void {
    socket.emit(event, data);
  }

  function on(event: string, callback: (...args: any[]) => void): void {
    socket.on(event, callback);
  }

  function off(event: string, callback?: (...args: any[]) => void): void {
    if (callback) {
      socket.off(event, callback);
    } else {
      socket.off(event);
    }
  }

  // Setup listeners immediately
  setupListeners();

  // Cleanup on scope disposal
  onScopeDispose(() => {
    socket.removeAllListeners();
    socket.disconnect();
  });

  return {
    socket,
    connectionStatus,
    isConnected,
    connect,
    disconnect,
    emit,
    on,
    off,
  };
}
