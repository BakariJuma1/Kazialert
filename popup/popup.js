import { Storage, STORAGE_KEYS, DEFAULTS } from '../utils/storage.js';

const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  await loadStatus();
  bindEvents();
});

// ── Status load ───────────────────────────────────────────────────────────────

async function loadStatus() {
  try {
    const [status, email] = await Promise.all([
      sendMessage({ type: 'GET_STATUS' }),
      Storage.getOne(STORAGE_KEYS.EMAIL),
    ]);
    renderStatus(status, email);
  } catch {
    // Service worker sleeping — read storage directly as fallback
    const [cv, email, lastCheck, stats] = await Promise.all([
      Storage.getOne(STORAGE_KEYS.CV),
      Storage.getOne(STORAGE_KEYS.EMAIL),
      Storage.getOne(STORAGE_KEYS.LAST_CHECK),
      Storage.getOne(STORAGE_KEYS.STATS, { ...DEFAULTS.STATS }),
    ]);
    renderStatus({ hasCV: !!cv, hasEmail: !!email, lastCheck, stats }, email);
  }
}

function renderStatus({ hasCV, hasEmail, lastCheck, stats }, email) {
  // CV indicator
  if (hasCV) {
    $('cvDot').className = 'dot dot--on';
    $('cvLabel').textContent = 'CV uploaded';
  } else {
    $('cvDot').className = 'dot dot--off';
    $('cvLabel').textContent = 'No CV uploaded';
  }

  // Alert email
  $('emailValue').textContent = email || 'Not set';

  // Stats
  $('statTotal').textContent = stats?.totalMatched ?? 0;
  $('statWeek').textContent = stats?.emailsSentWeek ?? 0;
  $('statLastCheck').textContent = timeAgo(lastCheck);

  // Setup banner
  $('setupBanner').classList.toggle('hidden', hasCV && hasEmail);

  // Check Now only usable when fully configured
  $('checkBtn').disabled = !hasCV || !hasEmail;
}

// ── Events ────────────────────────────────────────────────────────────────────

function bindEvents() {
  const openOptions = e => { e?.preventDefault(); chrome.runtime.openOptionsPage(); };

  $('settingsBtn').addEventListener('click', openOptions);
  $('setupLink').addEventListener('click', openOptions);
  $('cvBtn').addEventListener('click', openOptions);

  $('checkBtn').addEventListener('click', async () => {
    setScanning(true);
    try {
      await sendMessage({ type: 'MANUAL_SCAN' });
    } catch (err) {
      console.error('[Kazi Alert] Manual scan failed:', err.message);
    }
    setScanning(false);
    await loadStatus();
  });
}

function setScanning(active) {
  $('checkBtn').disabled = active;
  $('checkLabel').textContent = active ? 'Scanning…' : 'Check Now';
  $('checkSpinner').classList.toggle('hidden', !active);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  if (!iso) return '—';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'Now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, response => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}
