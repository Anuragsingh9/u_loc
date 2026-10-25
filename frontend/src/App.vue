<script setup lang="ts">
import { useRoute } from 'vue-router';
import { computed } from 'vue';

const route = useRoute();

const routeContext = computed(() => {
  switch (route.name) {
    case 'share':
      return '';
    case 'admin-login':
      return 'Admin';
    case 'admin-dashboard':
      return 'Dashboard';
    default:
      return '';
  }
});
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="app-header-content">
        <router-link to="/" class="app-logo" aria-label="Your Phone Health Home">
          <span class="app-logo-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="5" y="2" width="14" height="20" rx="3" ry="3" />
              <line x1="12" y1="18" x2="12.01" y2="18" stroke-width="2.5" />
              <line x1="10" y1="5" x2="14" y2="5" />
            </svg>
          </span>
          <span class="app-logo-text">Your Phone Health</span>
        </router-link>
        <span v-if="routeContext" class="app-route-context">{{ routeContext }}</span>
      </div>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
}

.app-header {
  background: var(--color-primary);
  color: white;
  padding: 0 var(--space-4);
  height: 48px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
  z-index: 100;
}

.app-header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

.app-logo {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: white;
  text-decoration: none;
  font-weight: 700;
  font-size: 1.125rem;
}

.app-logo:hover {
  opacity: 0.9;
}

.app-logo-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.app-logo-icon svg {
  display: block;
}

.app-logo-text {
  letter-spacing: -0.02em;
}

.app-route-context {
  font-size: 0.8125rem;
  opacity: 0.8;
  font-weight: 500;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
</style>
