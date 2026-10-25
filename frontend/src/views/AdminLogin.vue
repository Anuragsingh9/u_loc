<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAdmin } from '@/composables/useAdmin';

const router = useRouter();
const { login, authError } = useAdmin();

const password = ref('');
const isLoading = ref(false);
const localError = ref('');

async function onLogin(): Promise<void> {
  if (!password.value.trim()) {
    localError.value = 'Please enter a password.';
    return;
  }

  isLoading.value = true;
  localError.value = '';

  try {
    await login(password.value);
    router.push({ name: 'admin-dashboard' });
  } catch (err: any) {
    localError.value = authError.value || err.message || 'Login failed.';
  } finally {
    isLoading.value = false;
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    onLogin();
  }
}
</script>

<template>
  <div class="login-view">
    <div class="login-card card">
      <div class="login-header">
        <span class="login-icon" aria-hidden="true">🔐</span>
        <h1 class="login-title">Admin Login</h1>
        <p class="login-subtitle text-sm text-secondary">
          Enter your admin password to manage sharing sessions.
        </p>
      </div>

      <div class="login-form">
        <label for="admin-password" class="sr-only">Admin Password</label>
        <input
          id="admin-password"
          type="password"
          class="input"
          v-model="password"
          placeholder="Enter admin password"
          @keydown="onKeydown"
          :disabled="isLoading"
          autocomplete="current-password"
          autofocus
        />

        <div v-if="localError" class="login-error" role="alert">
          ❌ {{ localError }}
        </div>

        <button
          class="btn btn-primary btn-block btn-lg"
          @click="onLogin"
          :disabled="isLoading || !password.trim()"
          aria-label="Log in"
        >
          <span v-if="isLoading" class="spinner" aria-hidden="true" />
          <span v-else>Log In</span>
        </button>
      </div>

      <div class="login-footer">
        <router-link to="/" class="text-sm text-secondary">
          ← Back to sharing
        </router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-view {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
}

.login-card {
  width: 100%;
  max-width: 400px;
  padding: var(--space-8);
}

.login-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: var(--space-6);
}

.login-icon {
  font-size: 2.5rem;
  margin-bottom: var(--space-3);
}

.login-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: var(--space-2);
}

.login-subtitle {
  max-width: 280px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.login-error {
  padding: var(--space-3);
  background: #fee2e2;
  color: #991b1b;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 500;
}

.login-footer {
  margin-top: var(--space-6);
  text-align: center;
}
</style>
