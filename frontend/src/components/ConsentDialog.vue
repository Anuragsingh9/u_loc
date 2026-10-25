<script setup lang="ts">
defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  agree: [];
  cancel: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="overlay" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div class="consent-dialog card">
        <div class="consent-header">
          <span class="consent-icon" aria-hidden="true">🔒</span>
          <h2 id="consent-title" class="consent-title">Location Sharing Consent</h2>
        </div>

        <div class="consent-body">
          <p class="consent-description">
            Before we begin, please review what will happen when you share your location:
          </p>

          <ul class="consent-list">
            <li class="consent-item">
              <span class="consent-item-icon" aria-hidden="true">📍</span>
              <span>Your <strong>current location</strong> will be shared in real-time</span>
            </li>
            <li class="consent-item">
              <span class="consent-item-icon" aria-hidden="true">🗑️</span>
              <span>Location data is <strong>not stored permanently</strong></span>
            </li>
            <li class="consent-item">
              <span class="consent-item-icon" aria-hidden="true">🛑</span>
              <span>You can <strong>stop sharing at any time</strong></span>
            </li>
            <li class="consent-item">
              <span class="consent-item-icon" aria-hidden="true">🔐</span>
              <span>Only the session admin can see your location</span>
            </li>
          </ul>
        </div>

        <div class="consent-actions">
          <button
            class="btn btn-outline btn-block"
            @click="emit('cancel')"
            aria-label="Cancel location sharing"
          >
            Cancel
          </button>
          <button
            class="btn btn-success btn-block"
            @click="emit('agree')"
            aria-label="Agree to share location"
          >
            I Agree
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.consent-dialog {
  width: 100%;
  max-width: 420px;
  padding: var(--space-6);
  animation: dialog-enter 0.25s ease-out;
}

@keyframes dialog-enter {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.consent-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
}

.consent-icon {
  font-size: 2.5rem;
}

.consent-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text);
  text-align: center;
}

.consent-body {
  margin-bottom: var(--space-6);
}

.consent-description {
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
  margin-bottom: var(--space-4);
  text-align: center;
}

.consent-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.consent-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--color-bg);
  border-radius: var(--radius-md);
  font-size: 0.9375rem;
  line-height: 1.4;
}

.consent-item-icon {
  flex-shrink: 0;
  font-size: 1.125rem;
}

.consent-actions {
  display: flex;
  gap: var(--space-3);
}
</style>
