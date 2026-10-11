// ── API CLIENT ──────────────────────────────────────────────
// Gestion automatique des tokens avec refresh silencieux
const API = {
  async request(method, url, body = null, retry = true) {
    const opts = {
      method,
      credentials: 'include', // Envoie les cookies HttpOnly automatiquement
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);

    // Auto-refresh si token expiré
    if (res.status === 401 && retry) {
      const data = await res.json();
      if (data.code === 'TOKEN_EXPIRED') {
        const refreshed = await this.refresh();
        if (refreshed) return this.request(method, url, body, false);
      }
      // Not authenticated anymore
      showAuthPage();
      return null;
    }

    return res;
  },

  async refresh() {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      return res.ok;
    } catch {
      return false;
    }
  },

  async get(url) { return this.request('GET', url); },
  async post(url, body) { return this.request('POST', url, body); },
  async put(url, body) { return this.request('PUT', url, body); },
  async delete(url) { return this.request('DELETE', url); },
};

// ── TOAST NOTIFICATIONS ────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
  document.getElementById('toast-container').appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── LOADER ────────────────────────────────────────────────
function showLoader() { document.getElementById('loader').style.display = 'flex'; }
function hideLoader() { document.getElementById('loader').style.display = 'none'; }
