// ── AUTH MODULE ────────────────────────────────────────────
let currentUser = null;

function showAuthPage() {
  document.getElementById('app-page').classList.add('hidden');
  document.getElementById('auth-page').classList.remove('hidden');
}

function showAppPage(user) {
  currentUser = user;
  document.getElementById('auth-page').classList.add('hidden');
  document.getElementById('app-page').classList.remove('hidden');
  document.getElementById('nav-username').textContent = user.username || user.email || 'Dresseur';
  document.getElementById('hero-username').textContent = user.username || user.email?.split('@')[0] || 'Dresseur';
  loadHomeStats();
}

function showLogin() {
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('register-form').classList.add('hidden');
}

function showRegister() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('register-form').classList.remove('hidden');
}

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  btn.textContent = isHidden ? '🙈' : '👁️';
}

// Password strength indicator
document.addEventListener('DOMContentLoaded', () => {
  const pwInput = document.getElementById('reg-password');
  if (pwInput) {
    pwInput.addEventListener('input', () => {
      const v = pwInput.value;
      const bar = document.getElementById('pw-strength');
      if (!v) { bar.className = 'password-strength'; return; }
      const strong = v.length >= 12 && /[A-Z]/.test(v) && /[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v);
      const medium = v.length >= 8 && (/[A-Z]/.test(v) || /[0-9]/.test(v));
      bar.className = `password-strength ${strong ? 'strong' : medium ? 'medium' : 'weak'}`;
    });
  }
});

async function handleLogin() {
  const identifier = document.getElementById('login-identifier').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');

  if (!identifier || !password) {
    errEl.textContent = 'Veuillez remplir tous les champs.';
    errEl.classList.remove('hidden');
    return;
  }

  showLoader();
  try {
    const res = await API.post('/api/auth/login', { identifier, password });
    if (!res) return;
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error;
      errEl.classList.remove('hidden');
      return;
    }
    showToast('Bienvenue, Dresseur ! ⚡', 'success');
    showAppPage(data.user);
  } catch {
    errEl.textContent = 'Erreur de connexion. Réessayez.';
    errEl.classList.remove('hidden');
  } finally {
    hideLoader();
  }
}

async function handleRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm = document.getElementById('reg-confirm').value;
  const errEl = document.getElementById('register-error');
  errEl.classList.add('hidden');

  if (!username && !email && !phone) {
    errEl.textContent = 'Veuillez fournir au moins un identifiant (nom, email ou téléphone).';
    errEl.classList.remove('hidden');
    return;
  }
  if (!password) {
    errEl.textContent = 'Le mot de passe est requis.';
    errEl.classList.remove('hidden');
    return;
  }
  if (password.length < 8) {
    errEl.textContent = 'Le mot de passe doit contenir au moins 8 caractères.';
    errEl.classList.remove('hidden');
    return;
  }
  if (password !== confirm) {
    errEl.textContent = 'Les mots de passe ne correspondent pas.';
    errEl.classList.remove('hidden');
    return;
  }

  showLoader();
  try {
    const res = await API.post('/api/auth/register', {
      username: username || undefined,
      email: email || undefined,
      phone: phone || undefined,
      password,
    });
    if (!res) return;
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error;
      errEl.classList.remove('hidden');
      return;
    }
    showToast('Compte créé ! L\'aventure commence ! 🎉', 'success');
    showAppPage(data.user);
  } catch {
    errEl.textContent = 'Erreur lors de l\'inscription. Réessayez.';
    errEl.classList.remove('hidden');
  } finally {
    hideLoader();
  }
}

async function handleLogout() {
  await API.post('/api/auth/logout');
  currentUser = null;
  showToast('À bientôt, Dresseur !', 'info');
  showAuthPage();
}
