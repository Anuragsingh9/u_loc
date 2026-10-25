<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import type { SessionInfo } from '@/types';
import StatusIndicator from './StatusIndicator.vue';
import LocationMap from './LocationMap.vue';

const props = defineProps<{
  session: SessionInfo;
  isExpanded: boolean;
}>();

const emit = defineEmits<{
  expand: [];
  collapse: [];
  delete: [];
  subscribe: [];
  unsubscribe: [];
}>();

const copied = ref(false);
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

const sessionDuration = computed(() => {
  const elapsed = Math.max(0, now.value - props.session.createdAt);
  const minutes = Math.floor(elapsed / 60_000);
  const seconds = Math.floor((elapsed % 60_000) / 1000);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
});

const statusText = computed(() => {
  if (props.session.isSharerConnected) return 'connected';
  return 'waiting';
});

const statusBadgeClass = computed(() => {
  if (props.session.isSharerConnected) return 'badge-success';
  return 'badge-warning';
});

async function copyCode(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.session.pairingCode);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    // Fallback: select text
    const input = document.createElement('input');
    input.value = props.session.pairingCode;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  }
}

function toggleExpand(): void {
  if (props.isExpanded) {
    emit('unsubscribe');
    emit('collapse');
  } else {
    emit('subscribe');
    emit('expand');
  }
}
</script>

<template>
  <div class="session-card card" :class="{ 'session-card--expanded': isExpanded }">
    <div class="session-card-header" @click="toggleExpand" role="button" tabindex="0" :aria-expanded="isExpanded" :aria-label="`Session ${session.label || session.pairingCode}`">
      <div class="session-card-info">
        <div class="session-card-top">
          <span v-if="session.label" class="session-label font-semibold">{{ session.label }}</span>
          <span class="badge" :class="statusBadgeClass">
            <StatusIndicator :status="statusText" />
            {{ statusText }}
          </span>
        </div>

        <button
          class="pairing-code"
          @click.stop="copyCode"
          :aria-label="`Copy pairing code ${session.pairingCode}`"
          :title="copied ? 'Copied!' : 'Click to copy'"
        >
          <span class="font-mono">{{ session.pairingCode }}</span>
          <span class="copy-icon">{{ copied ? '✓' : '📋' }}</span>
        </button>

        <div class="session-meta">
          <span class="text-xs text-secondary">
            ⏱️ Active {{ sessionDuration }}
          </span>
          <span v-if="session.lastLocation" class="text-xs text-secondary">
            📍 Last update: {{ new Date(session.lastLocation.timestamp).toLocaleTimeString() }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="isExpanded" class="session-card-body">
      <div class="session-map-container">
        <LocationMap
          :lat="session.lastLocation?.lat"
          :lng="session.lastLocation?.lng"
          :accuracy="session.lastLocation?.accuracy"
          :is-stale="session.lastLocation?.isStale"
          :interactive="true"
        />
      </div>

      <div class="session-card-actions">
        <button
          class="btn btn-danger btn-block"
          @click="emit('delete')"
          aria-label="End this session"
        >
          🛑 End Session
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.session-card {
  overflow: hidden;
  transition: box-shadow var(--transition-normal);
}

.session-card--expanded {
  box-shadow: var(--shadow-lg);
}

.session-card-header {
  padding: var(--space-4);
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.session-card-header:hover {
  background: var(--color-bg);
}

.session-card-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.session-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.session-label {
  font-size: 0.9375rem;
  color: var(--color-text);
}

.pairing-code {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 1.25rem;
  letter-spacing: 0.15em;
  cursor: pointer;
  transition: background var(--transition-fast);
  min-height: 44px;
}

.pairing-code:hover {
  background: var(--color-border);
}

.copy-icon {
  font-size: 0.875rem;
}

.session-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.session-card-body {
  border-top: 1px solid var(--color-border);
}

.session-map-container {
  height: 300px;
}

.session-card-actions {
  padding: var(--space-4);
}
</style>
