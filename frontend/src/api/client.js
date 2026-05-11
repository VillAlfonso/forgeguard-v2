/**
 * API client for Revelator backend.
 * Handles auth tokens automatically.
 */

const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api';

function getToken() {
  return localStorage.getItem('fg_access_token');
}

function getRefreshToken() {
  return localStorage.getItem('fg_refresh_token');
}

function saveTokens(access, refresh) {
  localStorage.setItem('fg_access_token', access);
  localStorage.setItem('fg_refresh_token', refresh);
}

function clearTokens() {
  localStorage.removeItem('fg_access_token');
  localStorage.removeItem('fg_refresh_token');
  localStorage.removeItem('fg_user');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };

  if (token && !options.noAuth) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // If 401, try refreshing the token once
  if (res.status === 401 && !options._retried) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${getToken()}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers, _retried: true });
    } else {
      clearTokens();
      window.dispatchEvent(new CustomEvent('fg:session-expired'));
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }

  return res.json();
}

async function tryRefresh() {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    saveTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

// ── Public API ──────────────────────────────────────

export const api = {
  // Auth
  register(email, username, password, full_name) {
    return request('/auth/register', {
      method: 'POST', noAuth: true,
      body: JSON.stringify({ email, username, password, full_name }),
    });
  },

  login(email, password) {
    return request('/auth/login', {
      method: 'POST', noAuth: true,
      body: JSON.stringify({ email, password }),
    });
  },

  googleLogin(idToken) {
    return request('/auth/google', {
      method: 'POST', noAuth: true,
      body: JSON.stringify({ id_token: idToken }),
    });
  },

  getMe() {
    return request('/auth/me');
  },

  updateMe(data) {
    return request('/auth/me', { method: 'PUT', body: JSON.stringify(data) });
  },

  setApiKey(apiKey) {
    return request('/auth/api-key', { method: 'PUT', body: JSON.stringify({ api_key: apiKey }) });
  },

  // Multi-key management
  listApiKeys() {
    return request('/auth/api-keys');
  },
  addApiKey(apiKey, label) {
    return request('/auth/api-keys', { method: 'POST', body: JSON.stringify({ api_key: apiKey, label }) });
  },
  deleteApiKey(keyId) {
    return request(`/auth/api-keys/${keyId}`, { method: 'DELETE' });
  },
  activateApiKey(keyId) {
    return request(`/auth/api-keys/${keyId}/activate`, { method: 'PUT' });
  },
  updateApiKey(keyId, patch) {
    return request(`/auth/api-keys/${keyId}`, { method: 'PUT', body: JSON.stringify(patch) });
  },

  // Analysis
  getCategories() {
    return request('/categories');
  },

  analyze(file, category, documentType, extras = {}, signal) {
    const form = new FormData();
    form.append('imageFile', file);
    if (category) form.append('category', category);
    if (documentType) form.append('document_type', documentType);
    if (extras.suspicionReason) form.append('suspicion_reason', extras.suspicionReason);
    if (extras.areaOfConcern) form.append('area_of_concern', extras.areaOfConcern);
    if (extras.imageSource) form.append('image_source', extras.imageSource);
    if (extras.isForgedBelief) form.append('is_forged_belief', extras.isForgedBelief);
    if (extras.shotType) form.append('shot_type', extras.shotType);
    if (extras.lighting) form.append('lighting', extras.lighting);
    if (extras.physicalClues) form.append('physical_clues', extras.physicalClues);
    return request('/analyze', { method: 'POST', body: form, signal });
  },

  getDocumentTypes() {
    return request('/document-types', { noAuth: true });
  },

  preliminary(file) {
    const form = new FormData();
    form.append('imageFile', file);
    return request('/preliminary', { method: 'POST', body: form });
  },

  // History
  getHistory(limit = 50, offset = 0) {
    return request(`/history?limit=${limit}&offset=${offset}`);
  },

  getScanDetail(scanId) {
    return request(`/history/${scanId}`);
  },

  getScanImageUrl(scanId) {
    const token = getToken();
    return `${API_BASE}/history/${encodeURIComponent(scanId)}/image?token=${encodeURIComponent(token || '')}`;
  },

  // Payments
  getPlans() {
    return request('/payments/plans');
  },

  createCheckout(plan, paymentMethod = 'stripe') {
    if (paymentMethod === 'paymongo') {
      return request('/payments/paymongo-checkout', {
        method: 'POST', body: JSON.stringify({ plan, payment_method: 'paymongo' }),
      });
    }
    return request('/payments/create-checkout', {
      method: 'POST', body: JSON.stringify({ plan, payment_method: 'stripe' }),
    });
  },

  getPaymongoPublicKey() {
    return request('/payments/paymongo-public-key', { noAuth: true });
  },

  verifySession(sessionId, provider = 'stripe') {
    const params = new URLSearchParams({ provider });
    if (sessionId) params.set('session_id', sessionId);
    return request(`/payments/verify-session?${params.toString()}`);
  },

  cancelSubscription() {
    return request('/payments/cancel', { method: 'POST' });
  },

  // Admin
  adminListUsers({ q = '', plan = '', role = '', limit = 50, offset = 0 } = {}) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (plan) params.set('plan', plan);
    if (role) params.set('role', role);
    params.set('limit', limit);
    params.set('offset', offset);
    return request(`/admin/users?${params.toString()}`);
  },

  // Roles
  listRoles() {
    return request('/roles');
  },
  createRole(payload) {
    return request('/roles', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateRole(roleId, patch) {
    return request(`/roles/${roleId}`, { method: 'PUT', body: JSON.stringify(patch) });
  },
  deleteRole(roleId) {
    return request(`/roles/${roleId}`, { method: 'DELETE' });
  },
  assignUserRole(userId, role) {
    return request(`/roles/users/${userId}/role`, { method: 'PUT', body: JSON.stringify({ role }) });
  },

  adminGetUser(userId) {
    return request(`/admin/users/${userId}`);
  },

  adminUpdateUser(userId, patch) {
    return request(`/admin/users/${userId}`, { method: 'PUT', body: JSON.stringify(patch) });
  },

  adminDeleteUser(userId) {
    return request(`/admin/users/${userId}`, { method: 'DELETE' });
  },

  adminStats() {
    return request('/admin/stats');
  },

  // Admin actions (ban/unban users)
  adminBanUser(userId) {
    return request(`/admin/users/${userId}/ban`, { method: 'POST' });
  },

  adminUnbanUser(userId) {
    return request(`/admin/users/${userId}/unban`, { method: 'POST' });
  },

  adminPromoteAdmin(userId) {
    return request(`/admin/users/${userId}/promote-admin`, { method: 'POST' });
  },

  adminDemoteAdmin(userId) {
    return request(`/admin/users/${userId}/demote-admin`, { method: 'POST' });
  },

  // Audit logs (admin + super admin)
  adminViewLogs(limit = 100, offset = 0, kind = null) {
    const params = new URLSearchParams();
    params.set('limit', limit);
    params.set('offset', offset);
    if (kind) params.set('kind', kind);
    return request(`/admin/super/logs?${params.toString()}`);
  },

  adminScanImageUrl(scanId) {
    const token = getToken();
    return `${API_BASE}/admin/scans/${encodeURIComponent(scanId)}/image?token=${encodeURIComponent(token || '')}`;
  },

  adminGeminiStatus() {
    return request('/admin/gemini-status');
  },

  getAbout() {
    return request('/about', { noAuth: true });
  },

  getPromptAnalysis() {
    return request('/prompt-analysis', { noAuth: true });
  },

  // Health
  health() {
    return request('/health', { noAuth: true });
  },

  // Token helpers
  saveTokens,
  clearTokens,
  getToken,
};
