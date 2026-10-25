const DEFAULT_BASE_URL = '';

/**
 * Admin login — POST /api/admin/login
 */
export async function adminLogin(
  password: string,
  baseUrl: string = DEFAULT_BASE_URL
): Promise<{ token: string; expiresAt: number }> {
  const res = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(body.error || body.message || `Login failed (${res.status})`);
  }

  return res.json();
}

/**
 * Create a sharing session — POST /api/admin/sessions
 */
export async function createSession(
  token: string,
  label?: string,
  baseUrl: string = DEFAULT_BASE_URL
): Promise<any> {
  const res = await fetch(`${baseUrl}/api/admin/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ label }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: 'Failed to create session' }));
    throw new Error(body.message || `Failed to create session (${res.status})`);
  }

  return res.json();
}

/**
 * List active sessions — GET /api/admin/sessions
 */
export async function listSessions(
  token: string,
  baseUrl: string = DEFAULT_BASE_URL
): Promise<any[]> {
  const res = await fetch(`${baseUrl}/api/admin/sessions`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: 'Failed to list sessions' }));
    throw new Error(body.message || `Failed to list sessions (${res.status})`);
  }

  return res.json();
}

/**
 * Delete a session — DELETE /api/admin/sessions/:id
 */
export async function deleteSession(
  token: string,
  sessionId: string,
  baseUrl: string = DEFAULT_BASE_URL
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/admin/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: 'Failed to delete session' }));
    throw new Error(body.message || `Failed to delete session (${res.status})`);
  }
}

/**
 * Validate a pairing code — POST /api/share/validate
 */
export async function validatePairingCode(
  code: string,
  baseUrl: string = DEFAULT_BASE_URL
): Promise<{ valid: boolean; sessionId?: string }> {
  const res = await fetch(`${baseUrl}/api/share/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairingCode: code }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: 'Validation failed' }));
    throw new Error(body.message || `Validation failed (${res.status})`);
  }

  return res.json();
}
