import { io, type Socket } from 'socket.io-client';

/**
 * Create a new Socket.IO client instance.
 * @param url - Server URL. Defaults to window.location.origin (works with Vite proxy).
 */
export function createSocket(url?: string): Socket {
  const socket = io(url ?? '/', {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    transports: ['websocket', 'polling'],
  });

  return socket;
}

/** Singleton socket for general use (lazy — only created when first imported) */
let _defaultSocket: Socket | null = null;

export function getDefaultSocket(): Socket {
  if (!_defaultSocket) {
    _defaultSocket = createSocket();
  }
  return _defaultSocket;
}

export type { Socket };
