import { ref, onMounted, computed } from 'vue';

export interface StorageInfo {
  usedBytes: number;
  totalBytes: number;
  usedFormatted: string;
  totalFormatted: string;
  freeFormatted: string;
  percentage: number;
  supported: boolean;
}

export interface MemoryInfo {
  deviceMemoryGb: number | null;
  usedHeapMb: number | null;
  totalHeapMb: number | null;
  percentage: number;
  isEstimate: boolean;
  supported: boolean;
}

export interface BatteryInfo {
  level: number | null; // 0 - 100
  charging: boolean | null;
  supported: boolean;
}

export interface DeviceInfo {
  os: string;
  browser: string;
  cores: number;
  screenResolution: string;
  networkType: string;
  online: boolean;
}

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function useDeviceDiagnostics() {
  const storage = ref<StorageInfo>({
    usedBytes: 0,
    totalBytes: 0,
    usedFormatted: 'Calculating…',
    totalFormatted: 'Calculating…',
    freeFormatted: 'Calculating…',
    percentage: 0,
    supported: false,
  });

  const memory = ref<MemoryInfo>({
    deviceMemoryGb: null,
    usedHeapMb: null,
    totalHeapMb: null,
    percentage: 42, // default baseline estimate
    isEstimate: true,
    supported: false,
  });

  const battery = ref<BatteryInfo>({
    level: null,
    charging: null,
    supported: false,
  });

  const device = ref<DeviceInfo>({
    os: 'Unknown OS',
    browser: 'Unknown Browser',
    cores: 4,
    screenResolution: '1920 × 1080',
    networkType: '4G / Wi-Fi',
    online: true,
  });

  const isScanning = ref(false);

  // Detect OS & Browser from userAgent
  function detectDeviceInfo(): void {
    if (typeof window === 'undefined') return;

    const ua = navigator.userAgent;
    let os = 'Unknown OS';
    if (/android/i.test(ua)) {
      const match = ua.match(/Android\s([0-9.]+)/i);
      os = match ? `Android ${match[1]}` : 'Android';
    } else if (/iphone|ipad|ipod/i.test(ua)) {
      os = 'iOS';
    } else if (/windows/i.test(ua)) {
      os = 'Windows';
    } else if (/macintosh|mac os x/i.test(ua)) {
      os = 'macOS';
    } else if (/linux/i.test(ua)) {
      os = 'Linux';
    }

    let browser = 'Web Browser';
    if (/chrome|crios/i.test(ua) && !/edge|edg|opr\//i.test(ua)) {
      browser = 'Chrome Mobile';
    } else if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
      browser = 'Safari Mobile';
    } else if (/firefox|fxios/i.test(ua)) {
      browser = 'Firefox';
    } else if (/edg/i.test(ua)) {
      browser = 'Microsoft Edge';
    } else if (/samsungbrowser/i.test(ua)) {
      browser = 'Samsung Internet';
    }

    const cores = navigator.hardwareConcurrency || 4;
    const width = window.screen?.width || window.innerWidth || 360;
    const height = window.screen?.height || window.innerHeight || 800;
    const dpr = window.devicePixelRatio || 1;
    const screenResolution = `${Math.round(width * dpr)} × ${Math.round(height * dpr)} px`;

    const navAny = navigator as any;
    const connection = navAny.connection || navAny.mozConnection || navAny.webkitConnection;
    const networkType = connection?.effectiveType
      ? `${connection.effectiveType.toUpperCase()} (${connection.type || 'Connected'})`
      : navigator.onLine
      ? 'Wi-Fi / Mobile Data'
      : 'Offline';

    device.value = {
      os,
      browser,
      cores,
      screenResolution,
      networkType,
      online: navigator.onLine ?? true,
    };
  }

  // Detect Storage via navigator.storage.estimate()
  async function detectStorage(): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
      try {
        const estimate = await navigator.storage.estimate();
        const used = estimate.usage || 0;
        const total = estimate.quota || 0;
        const free = Math.max(0, total - used);
        const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

        storage.value = {
          usedBytes: used,
          totalBytes: total,
          usedFormatted: formatBytes(used),
          totalFormatted: formatBytes(total),
          freeFormatted: formatBytes(free),
          percentage: percent,
          supported: true,
        };
        return;
      } catch {
        // Fallback below
      }
    }

    // Default estimate if Storage API is restricted
    storage.value = {
      usedBytes: 12 * 1024 * 1024 * 1024,
      totalBytes: 64 * 1024 * 1024 * 1024,
      usedFormatted: '12.4 GB (Estimate)',
      totalFormatted: '64.0 GB',
      freeFormatted: '51.6 GB',
      percentage: 19,
      supported: false,
    };
  }

  // Detect Memory via deviceMemory and performance.memory
  function detectMemory(): void {
    const navAny = navigator as any;
    const perfAny = typeof performance !== 'undefined' ? (performance as any) : null;

    const deviceMemory = navAny.deviceMemory || null; // In GB (approx: 2, 4, 8)
    let usedHeapMb: number | null = null;
    let totalHeapMb: number | null = null;
    let percentage = 45;

    if (perfAny && perfAny.memory) {
      usedHeapMb = Math.round(perfAny.memory.usedJSHeapSize / (1024 * 1024));
      totalHeapMb = Math.round(perfAny.memory.totalJSHeapSize / (1024 * 1024));
      if (totalHeapMb > 0) {
        percentage = Math.min(100, Math.round((usedHeapMb / totalHeapMb) * 100));
      }
    } else if (deviceMemory) {
      percentage = 48; // Typical baseline OS utilization
    }

    memory.value = {
      deviceMemoryGb: deviceMemory,
      usedHeapMb,
      totalHeapMb,
      percentage,
      isEstimate: !perfAny?.memory,
      supported: Boolean(deviceMemory || perfAny?.memory),
    };
  }

  // Detect Battery via navigator.getBattery()
  async function detectBattery(): Promise<void> {
    const navAny = navigator as any;
    if (typeof navAny !== 'undefined' && typeof navAny.getBattery === 'function') {
      try {
        const batt = await navAny.getBattery();
        const updateBatt = () => {
          battery.value = {
            level: Math.round(batt.level * 100),
            charging: batt.charging,
            supported: true,
          };
        };
        updateBatt();

        batt.addEventListener('levelchange', updateBatt);
        batt.addEventListener('chargingchange', updateBatt);
        return;
      } catch {
        // Battery API not permitted
      }
    }

    battery.value = {
      level: null,
      charging: null,
      supported: false,
    };
  }

  // Run full refresh
  async function refreshDiagnostics(): Promise<void> {
    isScanning.value = true;
    detectDeviceInfo();
    detectMemory();
    await Promise.all([detectStorage(), detectBattery()]);
    setTimeout(() => {
      isScanning.value = false;
    }, 600);
  }

  // Overall system health status
  const systemHealth = computed(() => {
    let score = 98;
    if (storage.value.percentage > 85) score -= 15;
    if (memory.value.percentage > 80) score -= 10;
    if (battery.value.supported && battery.value.level !== null && battery.value.level < 20) score -= 8;

    return {
      score: Math.max(70, score),
      status: score >= 90 ? 'Excellent' : score >= 80 ? 'Good' : 'Needs Optimization',
      tagColor: score >= 90 ? '#10b981' : '#f59e0b',
    };
  });

  onMounted(() => {
    refreshDiagnostics();
  });

  return {
    storage,
    memory,
    battery,
    device,
    isScanning,
    systemHealth,
    refreshDiagnostics,
  };
}
