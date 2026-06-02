import { Storage, STORAGE_KEYS, DEFAULTS } from '../utils/storage.js';

const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  await loadStatus();
  bindEvents();
});

async function loadStatus() {
  try {
    const [status, email, appliedJobs] = await Promise.all([
      sendMessage({ type: 'GET_STATUS' }),
      Storage.getOne(STORAGE_KEYS.EMAIL),
      Storage.getOne(STORAGE_KEYS.APPLIED_JOBS, {}),
    ]);
    renderStatus(status, email, appliedJobs);
  } catch {
    const [cv, email, lastCheck, stats, appliedJobs] = await Promise.all([
      Storage.getOne(STORAGE_KEYS.CV),
      Storage.getOne(STORAGE_KEYS.EMAIL),
      Storage.getOne(STORAGE_KEYS.LAST_CHECK),
      Storage.getOne(STORAGE_KEYS.STATS, { ...DEFAULTS.STATS }),
      Storage.getOne(STORAGE_KEYS.APPLIED_JOBS, {}),
    ]);
    renderStatus({ hasCV: !!cv, hasEmail: !!email, lastCheck, stats }, email, appliedJobs);
  }
}

function renderStatus({ hasCV, hasEmail, lastCheck, stats }, email, appliedJobs) {
  $('cvDot').className   = `dot ${hasCV ? 'dot--on' : 'dot--off'}`;
  $('cvLabel').textContent = hasCV ? 'CV uploaded' : 'No CV uploaded';

  $('emailValue').textContent = email || 'Not set';

  $('statTotal').textContent     = stats?.totalMatched    ?? 0;
  $('statWeek').textContent      = stats?.emailsSentWeek  ?? 0;
  $('statApplied').textContent   = Object.keys(appliedJobs || {}).length;
  $('statLastCheck').textContent = timeAgo(lastCheck);

  $('setupBanner').classList.toggle('hidden', hasCV && hasEmail);
  $('checkBtn').disabled = !hasCV || !hasEmail;
}

function bindEvents() {
  const openOptions = e => { e?.preventDefault(); chrome.runtime.openOptionsPage(); };

  $('settingsBtn').addEventListener('click', openOptions);
  $('setupLink').addEventListener('click', openOptions);
  $('cvBtn').addEventListener('click', openOptions);

  $('checkBtn').addEventListener('click', async () => {
    setScanning(true);
    try { await sendMessage({ type: 'MANUAL_SCAN' }); } catch {}
    setScanning(false);
    await loadStatus();
  });
}

function setScanning(active) {
  $('checkBtn').disabled   = active;
  $('checkLabel').textContent = active ? 'Scanning…' : 'Scan Now';
  $('checkSpinner').classList.toggle('hidden', !active);
}

function timeAgo(iso) {
  if (!iso) return '—';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'Now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, response => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}
