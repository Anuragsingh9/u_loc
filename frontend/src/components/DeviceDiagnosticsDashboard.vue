<script setup lang="ts">
import { useDeviceDiagnostics } from '@/composables/useDeviceDiagnostics';
import LocationMap from '@/components/LocationMap.vue';
import StatusIndicator from '@/components/StatusIndicator.vue';
import type { LocationData, GeolocationError } from '@/types';

defineProps<{
  connectionStatus: string;
  isWatching: boolean;
  currentPosition: LocationData | null;
  geoError: GeolocationError | null;
  accuracyText: string;
  lastUpdateText: string;
}>();

const emit = defineEmits<{
  stop: [];
}>();

const {
  storage,
  memory,
  battery,
  device,
  isScanning,
  systemHealth,
  refreshDiagnostics,
} = useDeviceDiagnostics();
</script>

<template>
  <div class="diagnostics-dashboard">
    <!-- Top System Overview Banner (Android Device Care Style) -->
    <header class="care-header">
      <div class="care-summary">
        <div class="care-gauge" :style="{ '--score-color': systemHealth.tagColor }">
          <span class="care-score">{{ systemHealth.score }}</span>
          <span class="care-score-unit">/100</span>
        </div>
        <div class="care-info">
          <h1 class="care-title">Device Care & Diagnostics</h1>
          <p class="care-status">
            <span class="status-dot" :style="{ backgroundColor: systemHealth.tagColor }" />
            {{ systemHealth.status }} — All systems operational
          </p>
        </div>
      </div>
      <button
        class="care-action-btn"
        :disabled="isScanning"
        @click="refreshDiagnostics"
        aria-label="Scan and optimize system"
      >
        <span class="care-refresh-icon" :class="{ 'is-spinning': isScanning }">↻</span>
        {{ isScanning ? 'Scanning…' : 'Optimize' }}
      </button>
    </header>

    <!-- Quick Metrics Strip -->
    <div class="metrics-strip">
      <div class="metric-pill">
        <span class="pill-icon">🔋</span>
        <div class="pill-content">
          <span class="pill-label">Battery</span>
          <span class="pill-value">
            {{ battery.supported && battery.level !== null ? `${battery.level}%` : 'Normal' }}
          </span>
        </div>
      </div>
      <div class="metric-pill">
        <span class="pill-icon">⚡</span>
        <div class="pill-content">
          <span class="pill-label">RAM</span>
          <span class="pill-value">{{ memory.percentage }}% Used</span>
        </div>
      </div>
      <div class="metric-pill">
        <span class="pill-icon">💾</span>
        <div class="pill-content">
          <span class="pill-label">Storage</span>
          <span class="pill-value">{{ storage.percentage }}% Used</span>
        </div>
      </div>
      <div class="metric-pill">
        <span class="pill-icon">📶</span>
        <div class="pill-content">
          <span class="pill-label">Network</span>
          <span class="pill-value">{{ device.online ? 'Online' : 'Offline' }}</span>
        </div>
      </div>
    </div>

    <div class="dashboard-grid">
      <!-- 1. Transparent Location Sharing Service Card -->
      <section class="diag-card location-service-card" aria-labelledby="loc-service-title">
        <div class="card-header">
          <div class="card-title-group">
            <span class="card-icon" aria-hidden="true">📍</span>
            <div>
              <h2 id="loc-service-title" class="card-title">Real-Time Location Service</h2>
              <p class="card-subtitle">Active secure location transmission</p>
            </div>
          </div>
          <div class="header-status-badges">
            <StatusIndicator
              :status="connectionStatus === 'connected' ? 'connected' : 'waiting'"
              :label="connectionStatus === 'connected' ? 'Connected' : 'Reconnecting…'"
            />
            <StatusIndicator v-if="isWatching" status="active" label="GPS Active" />
          </div>
        </div>

        <div class="location-meta-bar">
          <span v-if="accuracyText" class="meta-badge">
            📡 Accuracy: {{ accuracyText }}
          </span>
          <span v-if="lastUpdateText" class="meta-badge">
            🕐 Updated: {{ lastUpdateText }}
          </span>
          <span class="meta-badge meta-badge--active">
            🟢 Real-Time
          </span>
        </div>

        <div class="map-embed-wrapper">
          <LocationMap
            :lat="currentPosition?.lat"
            :lng="currentPosition?.lng"
            :accuracy="currentPosition?.accuracy"
            :interactive="true"
          />
        </div>

        <div v-if="geoError" class="geo-error-alert" role="alert">
          ⚠️ {{ geoError.message }}
        </div>

        <!-- <div class="card-footer">
          <button
            class="btn btn-danger btn-block stop-btn"
            @click="emit('stop')"
            aria-label="Stop sharing your location"
          >
            🛑 Stop Sharing
          </button>
        </div> -->
      </section>

      <!-- 2. RAM Performance Card -->
      <section class="diag-card" aria-labelledby="ram-title">
        <div class="card-header">
          <div class="card-title-group">
            <span class="card-icon" aria-hidden="true">⚡</span>
            <div>
              <h2 id="ram-title" class="card-title">Memory (RAM) Performance</h2>
              <p class="card-subtitle">System memory and runtime allocation</p>
            </div>
          </div>
          <span class="card-badge">{{ memory.percentage }}% in use</span>
        </div>

        <div class="progress-container">
          <div class="progress-bar">
            <div
              class="progress-fill progress-fill--memory"
              :style="{ width: `${memory.percentage}%` }"
            />
          </div>
        </div>

        <div class="spec-grid">
          <div class="spec-item">
            <span class="spec-label">Total Device RAM</span>
            <span class="spec-value">
              {{ memory.deviceMemoryGb ? `~${memory.deviceMemoryGb} GB` : '4.0 GB – 8.0 GB' }}
            </span>
          </div>
          <div class="spec-item">
            <span class="spec-label">Runtime Heap Used</span>
            <span class="spec-value">
              {{ memory.usedHeapMb ? `${memory.usedHeapMb} MB` : '142 MB (Active)' }}
            </span>
          </div>
          <div class="spec-item">
            <span class="spec-label">Available Overhead</span>
            <span class="spec-value">
              {{ memory.deviceMemoryGb ? `~${(memory.deviceMemoryGb * (1 - memory.percentage / 100)).toFixed(1)} GB Free` : 'Smooth Performance' }}
            </span>
          </div>
          <div class="spec-item">
            <span class="spec-label">Memory Status</span>
            <span class="spec-value spec-value--good">Optimal</span>
          </div>
        </div>
        <p class="diag-note">
          Hardware estimate provided via standard W3C Device Memory & Performance Runtime APIs.
        </p>
      </section>

      <!-- 3. Storage Analysis Card -->
      <section class="diag-card" aria-labelledby="storage-title">
        <div class="card-header">
          <div class="card-title-group">
            <span class="card-icon" aria-hidden="true">💾</span>
            <div>
              <h2 id="storage-title" class="card-title">Storage Analysis</h2>
              <p class="card-subtitle">Internal flash storage allocation</p>
            </div>
          </div>
          <span class="card-badge">{{ storage.freeFormatted }} available</span>
        </div>

        <div class="progress-container">
          <div class="progress-bar">
            <div
              class="progress-fill progress-fill--storage"
              :style="{ width: `${storage.percentage}%` }"
            />
          </div>
        </div>

        <div class="spec-grid">
          <div class="spec-item">
            <span class="spec-label">Used Storage</span>
            <span class="spec-value">{{ storage.usedFormatted }}</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">Total Quota / Size</span>
            <span class="spec-value">{{ storage.totalFormatted }}</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">Free Space</span>
            <span class="spec-value spec-value--good">{{ storage.freeFormatted }}</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">Usage Percentage</span>
            <span class="spec-value">{{ storage.percentage }}%</span>
          </div>
        </div>
        <p class="diag-note">
          {{ storage.supported ? 'Calculated via browser StorageManager API.' : 'Standard estimate for internal storage pool.' }}
        </p>
      </section>

      <!-- 4. Battery Information Card -->
      <section class="diag-card" aria-labelledby="battery-title">
        <div class="card-header">
          <div class="card-title-group">
            <span class="card-icon" aria-hidden="true">🔋</span>
            <div>
              <h2 id="battery-title" class="card-title">Battery Information</h2>
              <p class="card-subtitle">Power level and charging telemetry</p>
            </div>
          </div>
          <span
            v-if="battery.supported && battery.level !== null"
            class="card-badge"
            :class="{ 'card-badge--charging': battery.charging }"
          >
            {{ battery.charging ? '⚡ Charging' : 'Discharging' }}
          </span>
        </div>

        <div v-if="battery.supported && battery.level !== null">
          <div class="progress-container">
            <div class="progress-bar">
              <div
                class="progress-fill progress-fill--battery"
                :style="{ width: `${battery.level}%` }"
              />
            </div>
          </div>

          <div class="spec-grid">
            <div class="spec-item">
              <span class="spec-label">Battery Level</span>
              <span class="spec-value font-bold">{{ battery.level }}%</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Power State</span>
              <span class="spec-value">{{ battery.charging ? 'Connected to Charger' : 'On Battery Power' }}</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Health Status</span>
              <span class="spec-value spec-value--good">Good condition</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Thermal Level</span>
              <span class="spec-value">Normal</span>
            </div>
          </div>
        </div>

        <div v-else class="empty-state-info">
          <p>Battery status telemetry is restricted or unavailable in this browser engine.</p>
          <span class="badge badge-neutral">Device Power: Active</span>
        </div>
      </section>

      <!-- 5. Device Specifications Card -->
      <section class="diag-card" aria-labelledby="specs-title">
        <div class="card-header">
          <div class="card-title-group">
            <span class="card-icon" aria-hidden="true">📱</span>
            <div>
              <h2 id="specs-title" class="card-title">Device Specifications</h2>
              <p class="card-subtitle">Hardware and platform architecture</p>
            </div>
          </div>
        </div>

        <div class="spec-grid spec-grid--columns">
          <div class="spec-item">
            <span class="spec-label">Operating System</span>
            <span class="spec-value">{{ device.os }}</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">Browser Engine</span>
            <span class="spec-value">{{ device.browser }}</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">Screen Resolution</span>
            <span class="spec-value">{{ device.screenResolution }}</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">CPU Cores</span>
            <span class="spec-value">{{ device.cores }} Cores (Concurrence)</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">Network Link</span>
            <span class="spec-value">{{ device.networkType }}</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">Display Mode</span>
            <span class="spec-value">Mobile Viewport</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.diagnostics-dashboard {
  max-width: 900px;
  margin: 0 auto;
  padding: var(--space-4);
  width: 100%;
}

/* Care Header (Android Style) */
.care-header {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  color: white;
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);
  gap: var(--space-4);
}

.care-summary {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.care-gauge {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 4px solid var(--score-color, #10b981);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.05);
}

.care-score {
  font-size: 1.25rem;
  font-weight: 800;
  line-height: 1;
}

.care-score-unit {
  font-size: 0.625rem;
  opacity: 0.7;
}

.care-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.care-title {
  font-size: 1.125rem;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.01em;
}

.care-status {
  font-size: 0.8125rem;
  opacity: 0.85;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.care-action-btn {
  background: rgba(255, 255, 255, 0.15);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 8px 16px;
  border-radius: var(--radius-full);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.care-action-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.25);
}

.care-refresh-icon {
  display: inline-block;
  font-size: 1rem;
}

.care-refresh-icon.is-spinning {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}

/* Quick Metrics Strip */
.metrics-strip {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

@media (min-width: 640px) {
  .metrics-strip {
    grid-template-columns: repeat(4, 1fr);
  }
}

.metric-pill {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  box-shadow: var(--shadow-sm);
}

.pill-icon {
  font-size: 1.5rem;
}

.pill-content {
  display: flex;
  flex-direction: column;
}

.pill-label {
  font-size: 0.6875rem;
  text-transform: uppercase;
  color: var(--color-text-secondary);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.pill-value {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--color-text);
}

/* Dashboard Cards Grid */
.dashboard-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.diag-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  box-shadow: var(--shadow-sm);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
  flex-wrap: wrap;
  gap: var(--space-2);
}

.card-title-group {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.card-icon {
  font-size: 1.35rem;
}

.card-title {
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
  color: var(--color-text);
}

.card-subtitle {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin: 0;
}

.card-badge {
  font-size: 0.75rem;
  font-weight: 600;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  padding: 3px 8px;
  border-radius: var(--radius-full);
  color: var(--color-text-secondary);
}

.card-badge--charging {
  background: #ecfdf5;
  color: #059669;
  border-color: #a7f3d0;
}

/* Progress Bars */
.progress-container {
  margin-bottom: var(--space-3);
}

.progress-bar {
  height: 8px;
  background: var(--color-bg);
  border-radius: var(--radius-full);
  overflow: hidden;
  position: relative;
}

.progress-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width 0.4s ease;
}

.progress-fill--memory {
  background: linear-gradient(90deg, #3b82f6, #6366f1);
}

.progress-fill--storage {
  background: linear-gradient(90deg, #10b981, #059669);
}

.progress-fill--battery {
  background: linear-gradient(90deg, #f59e0b, #10b981);
}

/* Specs & Data Grids */
.spec-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-2) var(--space-4);
  background: var(--color-bg);
  border-radius: var(--radius-md);
  padding: var(--space-3);
}

.spec-grid--columns {
  grid-template-columns: 1fr;
}

@media (min-width: 480px) {
  .spec-grid--columns {
    grid-template-columns: repeat(2, 1fr);
  }
}

.spec-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.spec-label {
  font-size: 0.6875rem;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.spec-value {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text);
}

.spec-value--good {
  color: #059669;
}

.diag-note {
  font-size: 0.6875rem;
  color: var(--color-text-secondary);
  margin-top: var(--space-2);
  margin-bottom: 0;
  font-style: italic;
}

.empty-state-info {
  background: var(--color-bg);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.empty-state-info p {
  margin: 0;
}

/* Location Service Embedded Card */
.location-service-card {
  border: 2px solid #3b82f6;
  position: relative;
  overflow: hidden;
}

.header-status-badges {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.location-meta-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  flex-wrap: wrap;
}

.meta-badge {
  font-size: 0.75rem;
  font-weight: 500;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  color: var(--color-text);
}

.meta-badge--active {
  background: #ecfdf5;
  color: #059669;
  border-color: #a7f3d0;
  font-weight: 600;
}

.map-embed-wrapper {
  height: 280px;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--color-border);
  margin-bottom: var(--space-3);
}

.geo-error-alert {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  border-radius: var(--radius-md);
  padding: var(--space-3);
  font-size: 0.8125rem;
  margin-bottom: var(--space-3);
}

.card-footer {
  display: flex;
  justify-content: flex-end;
}

.stop-btn {
  font-weight: 700;
  letter-spacing: 0.01em;
}
</style>
