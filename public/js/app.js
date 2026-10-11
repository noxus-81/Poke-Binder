// ── APP MAIN MODULE ─────────────────────────────────────────
// Navigation entre les sections
function navigate(pageName) {
  document.querySelectorAll('.app-section').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById(`page-${pageName}`)?.classList.remove('hidden');
  document.querySelector(`[data-page="${pageName}"]`)?.classList.add('active');

  // Load data on navigation
  if (pageName === 'collection') loadCollection();
  if (pageName === 'home') loadHomeStats();
}

function showAuthPage() {
  document.getElementById('app-page').classList.add('hidden');
  document.getElementById('auth-page').classList.remove('hidden');
  document.getElementById('loader')?.classList.add('hidden');
}

// ── INIT ──────────────────────────────────────────────────
async function init() {
  // Check if user is already logged in via cookie
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      showAppPage(data.user);
    } else {
      showAuthPage();
    }
  } catch {
    showAuthPage();
  } finally {
    hideLoader();
  }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  if (e.ctrlKey && e.key === 'f') {
    e.preventDefault();
    navigate('search');
    document.getElementById('search-input')?.focus();
  }
});

// Start the app
init();
