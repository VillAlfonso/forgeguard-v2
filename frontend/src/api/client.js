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

  // Analysis
  getCategories() {
    return request('/categories');
  },

  getAbout() {
    return request('/about', { noAuth: true });
  },

  analyze(file, category) {
    const form = new FormData();
    form.append('imageFile', file);
    if (category) form.append('category', category);
    return request('/analyze', { method: 'POST', body: form });
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

  createCheckout(plan) {
    return request('/payments/create-checkout', {
      method: 'POST', body: JSON.stringify({ plan }),
    });
  },

  cancelSubscription() {
    return request('/payments/cancel', { method: 'POST' });
  },

  // Admin
  adminListUsers({ q = '', plan = '', limit = 50, offset = 0 } = {}) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (plan) params.set('plan', plan);
    params.set('limit', limit);
    params.set('offset', offset);
    return request(`/admin/users?${params.toString()}`);
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

  // Health
  health() {
    return request('/health', { noAuth: true });
  },

  // Token helpers
  saveTokens,
  clearTokens,
  getToken,
};
