import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGeolocation } from '@/composables/useGeolocation';

describe('useGeolocation composable', () => {
  let mockWatchPosition: ReturnType<typeof vi.fn>;
  let mockClearWatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockWatchPosition = vi.fn();
    mockClearWatch = vi.fn();

    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: {
        watchPosition: mockWatchPosition,
        clearWatch: mockClearWatch,
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default state', () => {
    const { currentPosition, error, isWatching, permissionStatus } = useGeolocation();

    expect(currentPosition.value).toBeNull();
    expect(error.value).toBeNull();
    expect(isWatching.value).toBe(false);
    expect(permissionStatus.value).toBe('unknown');
  });

  it('starts watching position and invokes navigator.geolocation.watchPosition', () => {
    mockWatchPosition.mockReturnValue(42);
    const { startWatching, isWatching } = useGeolocation();

    startWatching();

    expect(isWatching.value).toBe(true);
    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
    expect(mockWatchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      })
    );
  });

  it('updates currentPosition when position update callback fires', () => {
    let successCb: (pos: any) => void = () => {};
    mockWatchPosition.mockImplementation((success) => {
      successCb = success;
      return 101;
    });

    const { startWatching, currentPosition, error } = useGeolocation();
    startWatching();

    // Trigger position update
    const sampleCoords = {
      coords: {
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: 15,
      },
      timestamp: 1672531199000,
    };
    successCb(sampleCoords);

    expect(currentPosition.value).toEqual({
      lat: 37.7749,
      lng: -122.4194,
      accuracy: 15,
      timestamp: 1672531199000,
    });
    expect(error.value).toBeNull();
  });

  it('handles permission denied error (code 1)', () => {
    let errorCb: (err: any) => void = () => {};
    mockWatchPosition.mockImplementation((_, err) => {
      errorCb = err;
      return 102;
    });

    const { startWatching, currentPosition, error } = useGeolocation();
    startWatching();

    errorCb({ code: 1, message: 'User denied Geolocation' });

    expect(currentPosition.value).toBeNull();
    expect(error.value).not.toBeNull();
    expect(error.value?.code).toBe(1);
    expect(error.value?.message).toContain('permission denied');
  });

  it('stops watching and invokes clearWatch', () => {
    mockWatchPosition.mockReturnValue(999);
    const { startWatching, stopWatching, isWatching } = useGeolocation();

    startWatching();
    expect(isWatching.value).toBe(true);

    stopWatching();
    expect(isWatching.value).toBe(false);
    expect(mockClearWatch).toHaveBeenCalledWith(999);
  });
});
