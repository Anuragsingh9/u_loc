<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    status: string;
    label?: string;
  }>(),
  {
    label: undefined,
  }
);

const dotColor = computed(() => {
  switch (props.status) {
    case 'connected':
    case 'active':
    case 'sharing':
      return 'var(--color-success)';
    case 'connecting':
    case 'warning':
    case 'waiting':
      return 'var(--color-warning)';
    case 'disconnected':
    case 'error':
    case 'stopped':
      return 'var(--color-danger)';
    case 'idle':
    case 'expired':
    default:
      return 'var(--color-text-tertiary)';
  }
});

const shouldPulse = computed(() => {
  return props.status === 'connected' || props.status === 'sharing' || props.status === 'active';
});
</script>

<template>
  <span class="status-indicator" role="status" :aria-label="`Status: ${label || status}`">
    <span
      class="status-dot"
      :class="{ 'status-dot--pulse': shouldPulse }"
      :style="{ backgroundColor: dotColor }"
      aria-hidden="true"
    />
    <span v-if="label" class="status-label">{{ label }}</span>
  </span>
</template>

<style scoped>
.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background-color var(--transition-normal);
}

.status-dot--pulse {
  animation: pulse 2s ease-in-out infinite;
}

.status-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}
</style>
