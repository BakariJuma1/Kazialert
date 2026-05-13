import { Storage, STORAGE_KEYS, DEFAULTS } from '../utils/storage.js';
import { extractCVText } from '../utils/cv-parser.js';

const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();
  bindEvents();
});

// ── Load all settings ─────────────────────────────────────────────────────────

async function loadAll() {
  const data = await Storage.get([
    STORAGE_KEYS.CV,
    STORAGE_KEYS.EMAIL,
    STORAGE_KEYS.GROQ_KEY,
    STORAGE_KEYS.EMAILJS_SERVICE,
    STORAGE_KEYS.EMAILJS_TEMPLATE,
    STORAGE_KEYS.EMAILJS_DIGEST_TEMPLATE,
    STORAGE_KEYS.EMAILJS_USER,
    STORAGE_KEYS.CHECK_INTERVAL,
    STORAGE_KEYS.MATCH_THRESHOLD,
    STORAGE_KEYS.LOCATION_FILTER,
    STORAGE_KEYS.JOB_TYPE_FILTER,
    STORAGE_KEYS.DIGEST_MODE,
    STORAGE_KEYS.CUSTOM_URLS,
    STORAGE_KEYS.MATCHED_JOBS,
  ]);

  renderCvStatus(!!data[STORAGE_KEYS.CV]);
  if (data[STORAGE_KEYS.CV]) $('cvText').value = data[STORAGE_KEYS.CV];

  $('alertEmail').value       = data[STORAGE_KEYS.EMAIL]            || '';
  $('groqKey').value          = data[STORAGE_KEYS.GROQ_KEY]         || '';
  $('emailjsService').value        = data[STORAGE_KEYS.EMAILJS_SERVICE]         || '';
  $('emailjsTemplate').value       = data[STORAGE_KEYS.EMAILJS_TEMPLATE]        || '';
  $('emailjsDigestTemplate').value = data[STORAGE_KEYS.EMAILJS_DIGEST_TEMPLATE] || '';
  $('emailjsUser').value           = data[STORAGE_KEYS.EMAILJS_USER]            || '';

  $('checkInterval').value   = String(data[STORAGE_KEYS.CHECK_INTERVAL]  ?? DEFAULTS.CHECK_INTERVAL);
  $('locationFilter').value  = data[STORAGE_KEYS.LOCATION_FILTER]        ?? DEFAULTS.LOCATION_FILTER;
  $('jobTypeFilter').value   = data[STORAGE_KEYS.JOB_TYPE_FILTER]        ?? DEFAULTS.JOB_TYPE_FILTER;
  $('digestMode').checked    = data[STORAGE_KEYS.DIGEST_MODE]            ?? DEFAULTS.DIGEST_MODE;

  const threshold = data[STORAGE_KEYS.MATCH_THRESHOLD] ?? DEFAULTS.MATCH_THRESHOLD;
  $('matchThreshold').value = threshold;
  setThresholdDisplay(threshold);

  renderUrlList(data[STORAGE_KEYS.CUSTOM_URLS] || []);
  renderHistory(data[STORAGE_KEYS.MATCHED_JOBS] || []);
}

// ── CV ────────────────────────────────────────────────────────────────────────

function renderCvStatus(hasCV) {
  $('cvDot').className        = `dot ${hasCV ? 'dot--on' : 'dot--off'}`;
  $('cvStatusText').textContent = hasCV ? 'CV stored on this device' : 'No CV stored';
  $('cvBadgeWarn').classList.toggle('hidden', hasCV);
  $('cvBadgeOk').classList.toggle('hidden', !hasCV);
  $('clearCvBtn').classList.toggle('hidden', !hasCV);
}

async function saveCV(text) {
  if (!text || text.trim().length < 50) {
    toast('CV is too short — paste or upload the full text', 'error');
    return;
  }
  setBusy('saveCvBtn', 'saveCvLabel', 'saveCvSpinner', true, 'Saving…');
  await Storage.setOne(STORAGE_KEYS.CV, text.trim());
  renderCvStatus(true);
  setBusy('saveCvBtn', 'saveCvLabel', 'saveCvSpinner', false, 'Save CV');
  toast('CV saved');
}

// ── Bind all events ───────────────────────────────────────────────────────────

function bindEvents() {
  // CV drop zone
  const dropZone = $('dropZone');
  const fileInput = $('cvFile');

  $('browseLink').addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('click', e => { if (e.target.id !== 'browseLink') fileInput.click(); });
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', async e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) await handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', async () => {
    if (fileInput.files[0]) await handleFile(fileInput.files[0]);
  });

  $('saveCvBtn').addEventListener('click', () => saveCV($('cvText').value));
  $('clearCvBtn').addEventListener('click', async () => {
    await Storage.remove([STORAGE_KEYS.CV]);
    $('cvText').value = '';
    renderCvStatus(false);
    toast('CV removed');
  });

  // Auto-save text inputs on blur (only when value changed)
  autoSaveInput('alertEmail',            STORAGE_KEYS.EMAIL);
  autoSaveInput('groqKey',               STORAGE_KEYS.GROQ_KEY);
  autoSaveInput('emailjsService',        STORAGE_KEYS.EMAILJS_SERVICE);
  autoSaveInput('emailjsTemplate',       STORAGE_KEYS.EMAILJS_TEMPLATE);
  autoSaveInput('emailjsDigestTemplate', STORAGE_KEYS.EMAILJS_DIGEST_TEMPLATE);
  autoSaveInput('emailjsUser',           STORAGE_KEYS.EMAILJS_USER);

  $('digestMode').addEventListener('change', async () => {
    await Storage.setOne(STORAGE_KEYS.DIGEST_MODE, $('digestMode').checked);
    toast($('digestMode').checked ? 'Digest mode on' : 'Digest mode off');
  });

  // Selects
  $('locationFilter').addEventListener('change', () => autoSaveSelect('locationFilter', STORAGE_KEYS.LOCATION_FILTER));
  $('jobTypeFilter').addEventListener('change',  () => autoSaveSelect('jobTypeFilter',  STORAGE_KEYS.JOB_TYPE_FILTER));
  $('checkInterval').addEventListener('change',  async () => {
    await Storage.setOne(STORAGE_KEYS.CHECK_INTERVAL, parseInt($('checkInterval').value, 10));
    chrome.runtime.sendMessage({ type: 'REINIT_ALARM' }).catch(() => {});
    toast('Saved — alarm rescheduled');
  });

  // Threshold slider
  $('matchThreshold').addEventListener('input',  () => setThresholdDisplay($('matchThreshold').value));
  $('matchThreshold').addEventListener('change', async () => {
    await Storage.setOne(STORAGE_KEYS.MATCH_THRESHOLD, parseInt($('matchThreshold').value, 10));
    toast('Saved');
  });

  // Custom URLs
  $('addUrlBtn').addEventListener('click', addCustomUrl);
  $('urlInput').addEventListener('keydown', e => { if (e.key === 'Enter') addCustomUrl(); });

  // History
  $('clearHistoryBtn').addEventListener('click', async () => {
    await Storage.remove([STORAGE_KEYS.MATCHED_JOBS]);
    renderHistory([]);
    toast('History cleared');
  });
}

async function handleFile(file) {
  setBusy('saveCvBtn', 'saveCvLabel', 'saveCvSpinner', true, 'Reading…');
  try {
    const text = await extractCVText(file);
    $('cvText').value = text;
    await saveCV(text);
  } catch (err) {
    toast(err.message || 'Could not read file', 'error');
    setBusy('saveCvBtn', 'saveCvLabel', 'saveCvSpinner', false, 'Save CV');
  }
}

async function addCustomUrl() {
  const label = $('urlLabel').value.trim();
  const url   = $('urlInput').value.trim();

  if (!url)               { toast('Enter a URL', 'error'); return; }
  if (!isValidUrl(url))   { toast('Enter a valid URL starting with https://', 'error'); return; }

  const existing = await Storage.getOne(STORAGE_KEYS.CUSTOM_URLS, []);
  if (existing.some(e => e.url === url)) { toast('This URL is already added', 'error'); return; }

  const updated = [...existing, { url, label: label || new URL(url).hostname }];
  await Storage.setOne(STORAGE_KEYS.CUSTOM_URLS, updated);

  $('urlLabel').value = '';
  $('urlInput').value = '';
  renderUrlList(updated);
  toast('Career page added');
}

// ── Render helpers ────────────────────────────────────────────────────────────

function renderUrlList(urls) {
  const list = $('urlList');
  if (!urls.length) {
    list.innerHTML = '<div class="url-empty">No custom pages added yet</div>';
    return;
  }
  list.innerHTML = urls.map((entry, i) => `
    <div class="url-item${entry.paused ? ' url-item--paused' : ''}">
      <div class="url-item-info">
        <span class="url-item-label">${esc(entry.label || entry.url)}${entry.paused ? ' <em>(paused)</em>' : ''}</span>
        <span class="url-item-url">${esc(entry.url)}</span>
      </div>
      <div class="url-item-actions">
        <button class="btn btn--ghost btn--sm" data-idx="${i}" data-action="pause">${entry.paused ? 'Resume' : 'Pause'}</button>
        <button class="btn btn--danger btn--sm" data-idx="${i}" data-action="remove">Remove</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-idx]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const existing = await Storage.getOne(STORAGE_KEYS.CUSTOM_URLS, []);
      if (btn.dataset.action === 'pause') {
        existing[idx] = { ...existing[idx], paused: !existing[idx].paused };
        await Storage.setOne(STORAGE_KEYS.CUSTOM_URLS, existing);
        renderUrlList(existing);
        toast(existing[idx].paused ? 'Paused' : 'Resumed');
      } else {
        const updated = existing.filter((_, i) => i !== idx);
        await Storage.setOne(STORAGE_KEYS.CUSTOM_URLS, updated);
        renderUrlList(updated);
        toast('Removed');
      }
    });
  });
}

function renderHistory(jobs) {
  const list = $('historyList');
  if (!jobs.length) {
    list.innerHTML = '<div class="history-empty">No matches yet — run a scan to find jobs</div>';
    return;
  }
  list.innerHTML = jobs.slice(0, 50).map(job => {
    const cls  = job.score >= 80 ? 'high' : job.score >= 60 ? 'mid' : 'low';
    const date = job.matchedAt
      ? new Date(job.matchedAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
      : '';
    const applyLink = safeUrl(job.applyUrl)
      ? `<a href="${esc(safeUrl(job.applyUrl))}" target="_blank">Apply →</a>`
      : '';
    return `
      <div class="history-item">
        <div class="history-item-main">
          <div class="history-title">${esc(job.title)} — ${esc(job.company || 'Unknown')}</div>
          <div class="history-meta">
            ${esc(job.source || '')}${date ? ' · ' + date : ''}${applyLink ? ' · ' + applyLink : ''}
          </div>
        </div>
        <span class="score-badge score-badge--${cls}">${job.score}%</span>
      </div>
    `;
  }).join('');
}

// ── Utility ───────────────────────────────────────────────────────────────────

function autoSaveInput(id, key) {
  const el = $(id);
  let prev = el.value;
  el.addEventListener('focus', () => { prev = el.value; });
  el.addEventListener('blur', async () => {
    if (el.value.trim() === prev.trim()) return;
    await Storage.setOne(key, el.value.trim());
    toast('Saved');
  });
}

async function autoSaveSelect(id, key) {
  await Storage.setOne(key, $(id).value);
  toast('Saved');
}

function setThresholdDisplay(val) {
  $('thresholdLabel').textContent = `${val}%`;
  $('thresholdValue').textContent = `${val}%`;
}

function setBusy(btnId, labelId, spinnerId, active, labelText) {
  $(btnId).disabled = active;
  $(labelId).textContent = labelText;
  $(spinnerId).classList.toggle('hidden', !active);
}

let toastTimer;
function toast(msg, type = 'success') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast toast--${type} toast--show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('toast--show'), 2200);
}

function isValidUrl(str) {
  try { return ['http:', 'https:'].includes(new URL(str).protocol); } catch { return false; }
}

function safeUrl(str) {
  try {
    const u = new URL(str);
    return ['http:', 'https:'].includes(u.protocol) ? str : '';
  } catch { return ''; }
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
