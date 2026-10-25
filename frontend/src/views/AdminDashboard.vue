<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAdmin } from '@/composables/useAdmin';
import SessionCard from '@/components/SessionCard.vue';
import StatusIndicator from '@/components/StatusIndicator.vue';

const router = useRouter();
const {
  isAuthenticated,
  sessions,
  connectionStatus,
  login,
  restoreSession,
  logout,
  createSession,
  deleteSession,
  subscribeSession,
  unsubscribeSession,
  startAutoRefresh,
} = useAdmin();

const showCreateForm = ref(false);
const newSessionLabel = ref('');
const expandedSessionId = ref<string | null>(null);
const isCreating = ref(false);

onMounted(() => {
  const restored = restoreSession();
  if (!restored) {
    router.push({ name: 'admin-login' });
  }
});

function onLogout(): void {
  logout();
  router.push({ name: 'admin-login' });
}

function toggleCreateForm(): void {
  showCreateForm.value = !showCreateForm.value;
  newSessionLabel.value = '';
}

function onCreateSession(): void {
  isCreating.value = true;
  createSession(newSessionLabel.value.trim() || undefined);
  newSessionLabel.value = '';
  showCreateForm.value = false;
  // isCreating will be reset when the session appears via socket event
  setTimeout(() => (isCreating.value = false), 2000);
}

async function onDeleteSession(sessionId: string): Promise<void> {
  if (!confirm('Are you sure you want to end this session?')) return;
  try {
    await deleteSession(sessionId);
    if (expandedSessionId.value === sessionId) {
      expandedSessionId.value = null;
    }
  } catch (err: any) {
    alert(`Failed to delete session: ${err.message}`);
  }
}

function onExpandSession(sessionId: string): void {
  expandedSessionId.value = sessionId;
}

function onCollapseSession(): void {
  expandedSessionId.value = null;
}

function onSubscribeSession(sessionId: string): void {
  subscribeSession(sessionId);
}

function onUnsubscribeSession(sessionId: string): void {
  unsubscribeSession(sessionId);
}
</script>

<template>
  <div class="dashboard-view">
    <!-- Dashboard navbar -->
    <div class="dashboard-nav">
      <div class="dashboard-nav-content">
        <div class="flex gap-3" style="align-items: center;">
          <h1 class="dashboard-title">Dashboard</h1>
          <StatusIndicator :status="connectionStatus" />
        </div>
        <button class="btn btn-outline" @click="onLogout" aria-label="Log out">
          Logout
        </button>
      </div>
    </div>

    <div class="dashboard-content container-lg">
      <!-- Actions bar -->
      <div class="dashboard-actions">
        <button
          class="btn btn-primary"
          @click="toggleCreateForm"
          aria-label="Create a new sharing session"
        >
          {{ showCreateForm ? '✕ Cancel' : '+ New Session' }}
        </button>
      </div>

      <!-- Create session form -->
      <div v-if="showCreateForm" class="create-form card">
        <h3 class="font-semibold mb-4">Create New Session</h3>
        <div class="create-form-fields">
          <label for="session-label" class="text-sm font-medium">
            Label <span class="text-secondary">(optional)</span>
          </label>
          <input
            id="session-label"
            type="text"
            class="input"
            v-model="newSessionLabel"
            placeholder="e.g., John's delivery"
            maxlength="100"
          />
          <button
            class="btn btn-success"
            @click="onCreateSession"
            :disabled="isCreating"
            aria-label="Create session"
          >
            <span v-if="isCreating" class="spinner" aria-hidden="true" />
            <span v-else>Create Session</span>
          </button>
        </div>
      </div>

      <!-- Sessions list -->
      <div v-if="sessions.length > 0" class="sessions-list">
        <SessionCard
          v-for="session in sessions"
          :key="session.sessionId"
          :session="session"
          :is-expanded="expandedSessionId === session.sessionId"
          @expand="onExpandSession(session.sessionId)"
          @collapse="onCollapseSession"
          @delete="onDeleteSession(session.sessionId)"
          @subscribe="onSubscribeSession(session.sessionId)"
          @unsubscribe="onUnsubscribeSession(session.sessionId)"
        />
      </div>

      <!-- Empty state -->
      <div v-else class="empty-state">
        <span class="empty-icon" aria-hidden="true">📭</span>
        <h3 class="font-semibold">No Active Sessions</h3>
        <p class="text-sm text-secondary mt-2">
          Create a session to generate a pairing code, then share it with someone.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

.dashboard-nav {
  background: var(--color-card);
  border-bottom: 1px solid var(--color-border);
  padding: 0 var(--space-4);
  height: 56px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.dashboard-nav-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
}

.dashboard-title {
  font-size: 1.125rem;
  font-weight: 700;
}

.dashboard-content {
  flex: 1;
  padding-top: var(--space-6);
  padding-bottom: var(--space-6);
}

.dashboard-actions {
  margin-bottom: var(--space-4);
}

.create-form {
  padding: var(--space-5);
  margin-bottom: var(--space-4);
}

.create-form-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.sessions-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12) var(--space-4);
  text-align: center;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: var(--space-4);
}
</style>
