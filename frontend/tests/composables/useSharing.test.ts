import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Mock socket
const mockSocketEmitter = new EventEmitter();
const mockIoEmitter = new EventEmitter();
const mockSocket = {
  connected: false,
  connect: vi.fn(() => {
    mockSocket.connected = true;
    mockSocketEmitter.emit('connect');
  }),
  disconnect: vi.fn(() => {
    mockSocket.connected = false;
    mockSocketEmitter.emit('disconnect');
  }),
  emit: vi.fn(),
  on: vi.fn((event, cb) => mockSocketEmitter.on(event, cb)),
  off: vi.fn((event, cb) => mockSocketEmitter.off(event, cb)),
  once: vi.fn((event, cb) => mockSocketEmitter.once(event, cb)),
  io: {
    on: vi.fn((event, cb) => mockIoEmitter.on(event, cb)),
  },
};

vi.mock('@/services/socket', () => ({
  createSocket: () => mockSocket,
}));

// Mock geolocation
const mockWatchPosition = vi.fn();
const mockClearWatch = vi.fn();

Object.defineProperty(globalThis.navigator, 'geolocation', {
  value: {
    watchPosition: mockWatchPosition,
    clearWatch: mockClearWatch,
  },
  writable: true,
  configurable: true,
});

import { useSharing } from '@/composables/useSharing';

describe('useSharing composable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocketEmitter.removeAllListeners();
    mockIoEmitter.removeAllListeners();
    mockSocket.connected = false;
  });

  it('initializes with idle status', () => {
    const { status, sessionId, expiresAt, error } = useSharing();
    expect(status.value).toBe('idle');
    expect(sessionId.value).toBeNull();
    expect(expiresAt.value).toBeNull();
    expect(error.value).toBeNull();
  });

  it('updates status to entering-code upon grantConsent', () => {
    const { status, grantConsent } = useSharing();
    grantConsent();
    expect(status.value).toBe('entering-code');
  });

  it('connects socket and emits sharer:join when startSharing is called', async () => {
    const { startSharing, status } = useSharing();

    await startSharing('ABC123');

    expect(mockSocket.connect).toHaveBeenCalled();
    expect(mockSocket.emit).toHaveBeenCalledWith('sharer:join', {
      pairingCode: 'ABC123',
      consent: true,
    });
  });

  it('transitions to sharing status when session:joined event received', async () => {
    const { startSharing, status, sessionId, expiresAt } = useSharing();

    await startSharing('ABC123');

    // Simulate server emitting session:joined
    mockSocketEmitter.emit('session:joined', {
      sessionId: 'test-session-id',
      expiresAt: 1700000000000,
    });

    expect(status.value).toBe('sharing');
    expect(sessionId.value).toBe('test-session-id');
    expect(expiresAt.value).toBe(1700000000000);
    expect(mockWatchPosition).toHaveBeenCalled();
  });

  it('stops sharing and clears state when stopSharing is called', async () => {
    const { startSharing, stopSharing, status, sessionId, expiresAt } = useSharing();

    await startSharing('ABC123');
    mockSocketEmitter.emit('session:joined', {
      sessionId: 'test-session-id',
      expiresAt: 1700000000000,
    });

    stopSharing();

    expect(status.value).toBe('stopped');
    expect(sessionId.value).toBeNull();
    expect(expiresAt.value).toBeNull();
    expect(mockSocket.emit).toHaveBeenCalledWith('sharer:stop', {});
    expect(mockSocket.disconnect).toHaveBeenCalled();
    expect(mockClearWatch).toHaveBeenCalled();
  });

  it('handles session:expired event', async () => {
    const { startSharing, status, sessionId } = useSharing();

    await startSharing('ABC123');
    mockSocketEmitter.emit('session:joined', {
      sessionId: 'test-session-id',
      expiresAt: 1700000000000,
    });

    mockSocketEmitter.emit('session:expired', {});

    expect(status.value).toBe('expired');
    expect(sessionId.value).toBeNull();
    expect(mockSocket.disconnect).toHaveBeenCalled();
    expect(mockClearWatch).toHaveBeenCalled();
  });

  it('handles session:error event', async () => {
    const { startSharing, status, error } = useSharing();

    await startSharing('ABC123');
    mockSocketEmitter.emit('session:joined', {
      sessionId: 'test-session-id',
      expiresAt: 1700000000000,
    });

    mockSocketEmitter.emit('session:error', {
      message: 'Location error occurred',
      code: 'LOCATION_ERROR',
    });

    expect(status.value).toBe('error');
    expect(error.value).toBe('Location error occurred');
    expect(mockClearWatch).toHaveBeenCalled();
  });
});
