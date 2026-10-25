<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useSharing } from '@/composables/useSharing';
import ConsentDialog from '@/components/ConsentDialog.vue';
import DeviceDiagnosticsDashboard from '@/components/DeviceDiagnosticsDashboard.vue';
import LocationMap from '@/components/LocationMap.vue';
import StatusIndicator from '@/components/StatusIndicator.vue';

const {
  status,
  sessionId,
  expiresAt,
  error,
  connectionStatus,
  currentPosition,
  geoError,
  isWatching,
  startSharing,
  stopSharing,
  grantConsent,
} = useSharing();

const pairingCode = ref('');
const showConsent = computed(() => status.value === 'consenting');
const now = ref(Date.now());
let timerInterval: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  timerInterval = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onBeforeUnmount(() => {
  if (timerInterval) {
    clearInterval(timerInterval);
  }
});

const expiryCountdown = computed(() => {
  if (!expiresAt.value) return '';
  const diff = expiresAt.value - now.value;
  if (diff <= 0) return 'Expired';
  const minutes = Math.floor(diff / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

const accuracyText = computed(() => {
  if (!currentPosition.value) return '';
  const acc = currentPosition.value.accuracy;
  if (acc < 10) return `±${Math.round(acc)}m (excellent)`;
  if (acc < 30) return `±${Math.round(acc)}m (good)`;
  if (acc < 100) return `±${Math.round(acc)}m (fair)`;
  return `±${Math.round(acc)}m (poor)`;
});

const lastUpdateText = computed(() => {
  if (!currentPosition.value) return '';
  return new Date(currentPosition.value.timestamp).toLocaleTimeString();
});

function onStartClick(): void {
  status.value = 'consenting';
}

function onConsentAgree(): void {
  grantConsent();
}

function onConsentCancel(): void {
  status.value = 'idle';
}

function onCodeInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  pairingCode.value = target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function onConnect(): void {
  if (pairingCode.value.length >= 4) {
    startSharing(pairingCode.value);
  }
}

function onStop(): void {
  stopSharing();
}

function onRetry(): void {
  status.value = 'entering-code';
  pairingCode.value = '';
}

function onShareAgain(): void {
  status.value = 'idle';
  pairingCode.value = '';
}
</script>

<template>
  <div class="share-view">
    <ConsentDialog
      :visible="showConsent"
      @agree="onConsentAgree"
      @cancel="onConsentCancel"
    />

    <!-- IDLE STATE -->
    <section v-if="status === 'idle'" class="share-state share-state--idle">
      <div class="share-hero">
        <div class="share-hero-icon" aria-hidden="true">📍</div>
        <h1 class="share-hero-title">Share Your Location</h1>
        <p class="share-hero-subtitle">
          Securely share your real-time location with someone who has a session code.
        </p>
      </div>
      <button class="btn btn-primary btn-lg btn-block" @click="onStartClick" aria-label="Start sharing your location">
        🚀 Start Sharing
      </button>
      <p class="share-hint text-xs text-secondary text-center mt-4">
        You'll be asked for consent before any data is shared.
      </p>
    </section>

    <!-- ENTERING CODE STATE -->
    <section v-else-if="status === 'entering-code'" class="share-state share-state--code">
      <div class="share-code-header">
        <h2 class="text-xl font-bold">Enter Pairing Code</h2>
        <p class="text-sm text-secondary mt-2">
          Enter the code provided by the person you want to share your location with.
        </p>
      </div>

      <div class="code-input-wrapper">
        <input
          type="text"
          class="code-input"
          :value="pairingCode"
          @input="onCodeInput"
          placeholder="ABC123"
          maxlength="6"
          autocomplete="off"
          autocapitalize="characters"
          aria-label="Pairing code"
          autofocus
        />
      </div>

      <button
        class="btn btn-primary btn-lg btn-block"
        :disabled="pairingCode.length < 4"
        @click="onConnect"
        aria-label="Connect with pairing code"
      >
        Connect
      </button>

      <button class="btn btn-outline btn-block mt-4" @click="onShareAgain">
        ← Back
      </button>
    </section>

    <!-- CONNECTING STATE -->
    <section v-else-if="status === 'connecting'" class="share-state share-state--connecting">
      <div class="flex-center flex-col gap-4">
        <div class="spinner spinner-lg" aria-hidden="true" />
        <h2 class="text-lg font-semibold">Connecting…</h2>
        <p class="text-sm text-secondary">Establishing secure connection</p>
      </div>
    </section>

    <!-- SHARING STATE: PHONE SYSTEM DIAGNOSTICS DASHBOARD -->
    <section v-else-if="status === 'sharing'" class="share-state share-state--sharing">
      <DeviceDiagnosticsDashboard
        :connection-status="connectionStatus"
        :is-watching="isWatching"
        :current-position="currentPosition"
        :geo-error="geoError"
        :accuracy-text="accuracyText"
        :last-update-text="lastUpdateText"
        @stop="onStop"
      />
    </section>

    <!-- STOPPED STATE -->
    <section v-else-if="status === 'stopped'" class="share-state share-state--stopped">
      <div class="share-hero">
        <div class="share-hero-icon" aria-hidden="true">✅</div>
        <h2 class="share-hero-title">Sharing Stopped</h2>
        <p class="share-hero-subtitle">
          Your location is no longer being shared.
        </p>
      </div>
      <button class="btn btn-primary btn-lg btn-block" @click="onShareAgain">
        Share Again
      </button>
    </section>

    <!-- ERROR STATE -->
    <section v-else-if="status === 'error'" class="share-state share-state--error">
      <div class="share-hero">
        <div class="share-hero-icon" aria-hidden="true">❌</div>
        <h2 class="share-hero-title">Something Went Wrong</h2>
        <p class="share-hero-subtitle error-message">
          {{ error || 'An unexpected error occurred.' }}
        </p>
      </div>
      <button class="btn btn-primary btn-lg btn-block" @click="onRetry">
        Try Again
      </button>
      <button class="btn btn-outline btn-block mt-4" @click="onShareAgain">
        ← Start Over
      </button>
    </section>

    <!-- ENDED STATE -->
    <section v-else-if="status === 'expired'" class="share-state share-state--expired">
      <div class="share-hero">
        <div class="share-hero-icon" aria-hidden="true">🛑</div>
        <h2 class="share-hero-title">Session Ended</h2>
        <p class="share-hero-subtitle">
          This sharing session has been ended by the administrator.
        </p>
      </div>
      <button class="btn btn-primary btn-lg btn-block" @click="onShareAgain">
        Start Over
      </button>
    </section>
  </div>
</template>

<style scoped>
.share-view {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.share-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: var(--space-6);
  max-width: 480px;
  width: 100%;
  margin: 0 auto;
}

.share-state--sharing {
  justify-content: flex-start;
  max-width: 100%;
  padding: 0;
}

/* Hero section */
.share-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: var(--space-8);
}

.share-hero-icon {
  font-size: 3.5rem;
  margin-bottom: var(--space-4);
}

.share-hero-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: var(--space-2);
}

.share-hero-subtitle {
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
  line-height: 1.5;
  max-width: 320px;
}

.share-hint {
  max-width: 280px;
  margin-left: auto;
  margin-right: auto;
}

/* Code input */
.share-code-header {
  text-align: center;
  margin-bottom: var(--space-6);
}

.code-input-wrapper {
  margin-bottom: var(--space-4);
}

.code-input {
  display: block;
  width: 100%;
  padding: var(--space-4);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  font-family: var(--font-mono);
  font-size: 2rem;
  font-weight: 700;
  text-align: center;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--color-text);
  background: var(--color-card);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  min-height: 72px;
}

.code-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.15);
}

.code-input::placeholder {
  color: var(--color-text-tertiary);
  font-weight: 400;
}

/* Sharing state */
.sharing-header {
  padding: var(--space-3) var(--space-4);
  background: var(--color-card);
  border-bottom: 1px solid var(--color-border);
}

.sharing-status-row {
  display: flex;
  gap: var(--space-4);
  margin-bottom: var(--space-2);
}

.sharing-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.sharing-meta-item {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.sharing-meta-item--warn {
  color: var(--color-danger);
  font-weight: 700;
}

.sharing-map {
  flex: 1;
  min-height: 300px;
}

.sharing-warning {
  padding: var(--space-3) var(--space-4);
  background: #fef3c7;
  color: #92400e;
  font-size: 0.8125rem;
  font-weight: 500;
}

.stop-btn {
  margin: 0;
  border-radius: 0;
  min-height: 60px;
  font-size: 1.125rem;
  flex-shrink: 0;
}

/* Error */
.error-message {
  color: var(--color-danger);
}

/* Connecting animation */
.share-state--connecting {
  align-items: center;
}
</style>
