import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDeviceDiagnostics } from '@/composables/useDeviceDiagnostics';

describe('useDeviceDiagnostics composable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with default diagnostics structure', () => {
    const { storage, memory, battery, device, systemHealth } = useDeviceDiagnostics();

    expect(storage.value).toBeDefined();
    expect(storage.value.percentage).toBeGreaterThanOrEqual(0);
    expect(storage.value.usedFormatted).toBeDefined();

    expect(memory.value).toBeDefined();
    expect(memory.value.percentage).toBeGreaterThanOrEqual(0);

    expect(battery.value).toBeDefined();

    expect(device.value).toBeDefined();
    expect(device.value.os).toBeDefined();
    expect(device.value.cores).toBeGreaterThanOrEqual(1);

    expect(systemHealth.value).toBeDefined();
    expect(systemHealth.value.score).toBeGreaterThanOrEqual(70);
    expect(systemHealth.value.status).toBeDefined();
  });

  it('provides a refreshDiagnostics function that updates scanning state', async () => {
    const { isScanning, refreshDiagnostics } = useDeviceDiagnostics();

    expect(isScanning.value).toBe(false);
    const refreshPromise = refreshDiagnostics();
    expect(isScanning.value).toBe(true);

    await refreshPromise;
  });
});
