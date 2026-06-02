import { Storage, STORAGE_KEYS, DEFAULTS } from '../utils/storage.js';
import { extractCVText } from '../utils/cv-parser.js';
import { Logger } from '../utils/logger.js';

const $ = id => document.getElementById(id);

const APPS_SCRIPT_CODE = `function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  if (p.job) {
    try {
      SpreadsheetApp.getActiveSpreadsheet()
        .getActiveSheet()
        .appendRow([
          p.company||'', p.job||'', p.date||'',
          '','','','','','','',''
        ]);
      return _json({ok:true, written:true});
    } catch(err) {
      return _json({ok:false, e:err.toString()});
    }
  }
  return _json({ok:true, written:false, service:'Kazi Alert'});
}
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.job) {
      SpreadsheetApp.getActiveSpreadsheet()
        .getActiveSheet()
        .appendRow([d.company||'', d.job||'', d.date||'',
          '','','','','','','','']);
      return _json({ok:true, written:true});
    }
  } catch(_) {}
  return doGet(e);
}
function _json(d) {
  return ContentService
    .createTextOutput(JSON.stringify(d))
    .setMimeType(ContentService.MimeType.JSON);
}`;

document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();
  bindEvents();
  initPrivacyNotice();
});

async function initPrivacyNotice() {
  const dismissed = await Storage.getOne('privacy_notice_dismissed', false);
  if (dismissed) $('privacyNotice').classList.add('hidden');
}


// ── Load ──────────────────────────────────────────────────────────────────────

async function loadAll() {
  const data = await Storage.get([
    STORAGE_KEYS.CV,
    STORAGE_KEYS.EMAIL,
    STORAGE_KEYS.GROQ_KEY,
    STORAGE_KEYS.RESEND_KEY,
    STORAGE_KEYS.RESEND_FROM,
    STORAGE_KEYS.CHECK_INTERVAL,
    STORAGE_KEYS.MATCH_THRESHOLD,
    STORAGE_KEYS.LOCATION_FILTER,
    STORAGE_KEYS.JOB_TYPE_FILTER,
    STORAGE_KEYS.DIGEST_MODE,
    STORAGE_KEYS.CUSTOM_URLS,
    STORAGE_KEYS.MATCHED_JOBS,
    STORAGE_KEYS.APPLIED_JOBS,
    STORAGE_KEYS.SHEETS_URL,
  ]);

  renderCvStatus(!!data[STORAGE_KEYS.CV]);
  if (data[STORAGE_KEYS.CV]) $('cvText').value = data[STORAGE_KEYS.CV];

  $('alertEmail').value = data[STORAGE_KEYS.EMAIL]      || '';
  $('groqKey').value    = data[STORAGE_KEYS.GROQ_KEY]   || '';
  $('resendKey').value  = data[STORAGE_KEYS.RESEND_KEY] || '';
  $('resendFrom').value = data[STORAGE_KEYS.RESEND_FROM] || '';

  $('checkInterval').value  = String(data[STORAGE_KEYS.CHECK_INTERVAL] ?? DEFAULTS.CHECK_INTERVAL);
  $('locationFilter').value = data[STORAGE_KEYS.LOCATION_FILTER]       ?? DEFAULTS.LOCATION_FILTER;
  $('jobTypeFilter').value  = data[STORAGE_KEYS.JOB_TYPE_FILTER]       ?? DEFAULTS.JOB_TYPE_FILTER;
  $('digestMode').checked   = data[STORAGE_KEYS.DIGEST_MODE]           ?? DEFAULTS.DIGEST_MODE;

  const threshold = data[STORAGE_KEYS.MATCH_THRESHOLD] ?? DEFAULTS.MATCH_THRESHOLD;
  $('matchThreshold').value = threshold;
  setThresholdDisplay(threshold);

  const sheetsUrl = data[STORAGE_KEYS.SHEETS_URL] || '';
  $('sheetsUrl').value = sheetsUrl;
  $('trackerConnected').classList.toggle('hidden', !sheetsUrl);

  $('manualDate').value = new Date().toISOString().split('T')[0];

  renderUrlList(data[STORAGE_KEYS.CUSTOM_URLS] || []);
  renderHistory(
    data[STORAGE_KEYS.MATCHED_JOBS]  || [],
    data[STORAGE_KEYS.APPLIED_JOBS]  || {},
  );
  await renderLogs();
}

// ── CV ─────────────────────────────────────────────────────────────────────

function renderCvStatus(hasCV) {
  $('cvDot').className          = `dot ${hasCV ? 'dot--on' : 'dot--off'}`;
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

// ── Logs ────────────────────────────────────────────────────────────────────

async function renderLogs() {
  const logs = await Logger.getLogs();
  const list = $('logsList');
  if (!logs.length) {
    list.innerHTML = '<div class="list-empty">No logs yet — logs appear here after each scan</div>';
    return;
  }
  list.innerHTML = logs.map(entry => {
    const d    = new Date(entry.ts);
    const time = d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const date = d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
    return `<div class="log-entry log-entry--${entry.level}">
      <span class="log-time">${date} ${time}</span>
      <span class="log-msg">${esc(entry.msg)}</span>
    </div>`;
  }).join('');
}

// ── History with tracker ─────────────────────────────────────────────────────

function renderHistory(jobs, appliedJobs) {
  const list = $('historyList');
  if (!jobs.length) {
    list.innerHTML = '<div class="list-empty">No matches yet — run a scan to find jobs</div>';
    return;
  }
  list.innerHTML = jobs.slice(0, 50).map(job => {
    const cls     = job.score >= 80 ? 'high' : job.score >= 60 ? 'mid' : 'low';
    const date    = job.matchedAt ? new Date(job.matchedAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) : '';
    const applied = appliedJobs[job.id];

    const applyBtn = safeUrl(job.applyUrl)
      ? `<a class="btn btn--ghost btn--sm" href="${esc(safeUrl(job.applyUrl))}" target="_blank">
           <svg class="icon icon-xs" aria-hidden="true"><use href="#ic-external"/></svg> Apply
         </a>`
      : '';

    const trackerBtn = applied
      ? `<span class="applied-badge">
           <svg class="icon icon-xs" aria-hidden="true"><use href="#ic-check"/></svg>
           Applied ${formatDate(applied.appliedAt)}${applied.loggedToSheet ? ' · In sheet' : ''}
         </span>`
      : `<button class="btn btn--ghost btn--sm mark-applied-btn" data-job='${escAttr(JSON.stringify({ id: job.id, title: job.title, company: job.company, applyUrl: job.applyUrl }))}'>
           <svg class="icon icon-xs" aria-hidden="true"><use href="#ic-check-sq"/></svg>
           Mark Applied
         </button>`;

    return `
      <div class="history-item${applied ? ' history-item--applied' : ''}" id="hi-${esc(job.id)}">
        <div class="history-item-top">
          <div class="history-item-main">
            <div class="history-title">${esc(job.title)} — ${esc(job.company || 'Unknown')}</div>
            <div class="history-meta">${esc(job.source || '')}${date ? ' · ' + date : ''}</div>
          </div>
          <span class="score-badge score-badge--${cls}">${job.score}%</span>
        </div>
        <div class="history-item-actions">
          ${applyBtn}
          ${trackerBtn}
        </div>
      </div>`;
  }).join('');

  // Wire up Mark Applied buttons
  list.querySelectorAll('.mark-applied-btn').forEach(btn => {
    btn.addEventListener('click', () => handleMarkApplied(btn));
  });
}

async function handleMarkApplied(btn) {
  const jobData = JSON.parse(btn.dataset.job);
  btn.disabled = true;
  btn.textContent = 'Logging…';

  try {
    const response = await sendMsg({ type: 'MARK_APPLIED', job: jobData });
    if (!response.ok) throw new Error(response.error || 'Unknown error');

    const result = response.result;
    const card = document.getElementById(`hi-${jobData.id}`);
    if (card) {
      const badge = document.createElement('span');
      badge.className = 'applied-badge';
      badge.innerHTML = `<svg class="icon icon-xs" aria-hidden="true"><use href="#ic-check"/></svg> Applied ${formatDate(result.appliedAt)}${result.loggedToSheet ? ' · In sheet' : ''}`;
      btn.replaceWith(badge);
      card.classList.add('history-item--applied');
    }
    toast(
      result.loggedToSheet ? 'Marked applied & logged to sheet' : 'Marked applied (sheet sync failed — check URL)',
      result.loggedToSheet ? 'success' : 'info',
    );
  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = `<svg class="icon icon-xs" aria-hidden="true"><use href="#ic-check-sq"/></svg> Mark Applied`;
    toast(err.message || 'Failed to mark applied', 'error');
  }
}

// ── Bind events ──────────────────────────────────────────────────────────────

function bindEvents() {
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

  autoSaveInput('alertEmail', STORAGE_KEYS.EMAIL);
  autoSaveInput('groqKey',    STORAGE_KEYS.GROQ_KEY);
  autoSaveInput('resendKey',  STORAGE_KEYS.RESEND_KEY);
  autoSaveInput('resendFrom', STORAGE_KEYS.RESEND_FROM);

  autoSaveInput('sheetsUrl', STORAGE_KEYS.SHEETS_URL, val => {
    $('trackerConnected').classList.toggle('hidden', !val);
  });

  $('digestMode').addEventListener('change', async () => {
    await Storage.setOne(STORAGE_KEYS.DIGEST_MODE, $('digestMode').checked);
    toast($('digestMode').checked ? 'Digest mode on' : 'Digest mode off');
  });

  $('locationFilter').addEventListener('change', () => autoSaveSelect('locationFilter', STORAGE_KEYS.LOCATION_FILTER));
  $('jobTypeFilter').addEventListener('change',  () => autoSaveSelect('jobTypeFilter',  STORAGE_KEYS.JOB_TYPE_FILTER));
  $('checkInterval').addEventListener('change',  async () => {
    await Storage.setOne(STORAGE_KEYS.CHECK_INTERVAL, parseInt($('checkInterval').value, 10));
    chrome.runtime.sendMessage({ type: 'REINIT_ALARM' }).catch(() => {});
    toast('Saved — alarm rescheduled');
  });

  $('matchThreshold').addEventListener('input',  () => setThresholdDisplay($('matchThreshold').value));
  $('matchThreshold').addEventListener('change', async () => {
    await Storage.setOne(STORAGE_KEYS.MATCH_THRESHOLD, parseInt($('matchThreshold').value, 10));
    toast('Saved');
  });

  $('addUrlBtn').addEventListener('click', addCustomUrl);
  $('urlInput').addEventListener('keydown', e => { if (e.key === 'Enter') addCustomUrl(); });

  $('clearHistoryBtn').addEventListener('click', async () => {
    await Storage.remove([STORAGE_KEYS.MATCHED_JOBS]);
    renderHistory([], await Storage.getOne(STORAGE_KEYS.APPLIED_JOBS, {}));
    toast('History cleared');
  });

  $('privacyDismiss').addEventListener('click', async () => {
    $('privacyNotice').classList.add('hidden');
    await Storage.setOne('privacy_notice_dismissed', true);
  });

  $('clearLogsBtn').addEventListener('click', async () => {
    await Logger.clearLogs();
    await renderLogs();
    toast('Logs cleared');
  });

  // Test sheet connection — tries service worker first, falls back to direct fetch
  $('testSheetBtn').addEventListener('click', async () => {
    const url = $('sheetsUrl').value.trim();
    if (!url) { toast('Paste your Apps Script URL first', 'error'); return; }
    const btn = $('testSheetBtn');
    btn.disabled = true;
    btn.textContent = 'Testing…';

    const testUrl = new URL(url);
    testUrl.searchParams.set('company', 'Kazi Alert');
    testUrl.searchParams.set('job', '✓ Test row — connection working');
    testUrl.searchParams.set('date', new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }));

    let ok = false, written = false, errorMsg = '';

    try {
      // Primary: via service worker
      const res = await sendMsg({ type: 'TEST_SHEET', url });
      ok = res.ok; written = !!res.written; errorMsg = res.error || '';
    } catch (swErr) {
      // Fallback: direct GET fetch from the options page
      try {
        const r = await fetch(testUrl.toString(), { method: 'GET', redirect: 'follow' });
        const data = await r.json().catch(() => ({ ok: r.ok }));
        ok = data.ok !== false; written = !!data.written;
        errorMsg = data.e || (!r.ok ? `HTTP ${r.status}` : '');
      } catch (fetchErr) {
        ok = false;
        errorMsg = `SW: ${swErr.message} | Fetch: ${fetchErr.message}`;
      }
    }

    if (!ok)        toast(`Failed: ${errorMsg || 'Check URL & deployment'}`, 'error');
    else if (written) toast('Test row sent — check your sheet!', 'success');
    else            toast('Script reachable but params not received — paste the new script code, save, then redeploy as a new version', 'error');
    btn.disabled = false;
    btn.textContent = 'Test';
  });

  // Copy Apps Script code
  $('copyScriptBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_CODE);
      const btn = $('copyScriptBtn');
      btn.innerHTML = `<svg class="icon icon-xs" aria-hidden="true"><use href="#ic-check"/></svg> Copied!`;
      setTimeout(() => {
        btn.innerHTML = `<svg class="icon icon-xs" aria-hidden="true"><use href="#ic-copy"/></svg> Copy`;
      }, 1800);
    } catch {
      toast('Copy failed — select and copy manually', 'error');
    }
  });

  // Manual job log
  $('manualLogBtn').addEventListener('click', handleManualLog);
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

async function handleManualLog() {
  const company = $('manualCompany').value.trim();
  const job     = $('manualJob').value.trim();
  const dateVal = $('manualDate').value;

  if (!company || !job) { toast('Enter company and job title', 'error'); return; }

  const sheetsUrl = await Storage.getOne(STORAGE_KEYS.SHEETS_URL);
  if (!sheetsUrl)  { toast('Add your Apps Script URL first', 'error'); return; }

  const btn = $('manualLogBtn');
  btn.disabled = true;

  const date = dateVal
    ? new Date(dateVal).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

  try {
    let ok = false, errMsg = '';
    try {
      const res = await sendMsg({ type: 'LOG_TO_SHEET', job: { company, title: job, date } });
      ok = res.ok;
      errMsg = res.error || '';
    } catch {
      // Fallback: direct GET fetch from the options page
      const logUrl = new URL(sheetsUrl);
      logUrl.searchParams.set('company', company);
      logUrl.searchParams.set('job', job);
      logUrl.searchParams.set('date', date);
      const r = await fetch(logUrl.toString(), { method: 'GET', redirect: 'follow' });
      const data = await r.json().catch(() => ({ ok: r.ok }));
      ok = data.ok !== false;
      errMsg = data.e || (!r.ok ? `HTTP ${r.status}` : '');
    }

    if (!ok) throw new Error(errMsg || 'Script returned an error');
    $('manualCompany').value = '';
    $('manualJob').value     = '';
    $('manualDate').value    = new Date().toISOString().split('T')[0];
    toast(`Logged "${job}" to sheet`);
  } catch (err) {
    toast(err.message || 'Failed to log job', 'error');
  }
  btn.disabled = false;
}

async function addCustomUrl() {
  const label = $('urlLabel').value.trim();
  const url   = $('urlInput').value.trim();

  if (!url)             { toast('Enter a URL', 'error'); return; }
  if (!isValidUrl(url)) { toast('Enter a valid URL starting with https://', 'error'); return; }

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
    list.innerHTML = '<div class="list-empty">No custom pages added yet</div>';
    return;
  }
  list.innerHTML = urls.map((entry, i) => `
    <div class="url-item${entry.paused ? ' url-item--paused' : ''}">
      <div class="url-item-info">
        <span class="url-item-label">${esc(entry.label || entry.url)}${entry.paused ? ' <em style="color:var(--text-muted)">(paused)</em>' : ''}</span>
        <span class="url-item-url">${esc(entry.url)}</span>
      </div>
      <div class="url-item-actions">
        <button class="btn btn--ghost btn--sm" data-idx="${i}" data-action="pause">
          <svg class="icon icon-xs" aria-hidden="true"><use href="#ic-${entry.paused ? 'play' : 'pause'}"/></svg>
          ${entry.paused ? 'Resume' : 'Pause'}
        </button>
        <button class="btn btn--danger btn--sm" data-idx="${i}" data-action="remove">
          <svg class="icon icon-xs" aria-hidden="true"><use href="#ic-trash"/></svg>
          Remove
        </button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-idx]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx      = parseInt(btn.dataset.idx, 10);
      const existing = await Storage.getOne(STORAGE_KEYS.CUSTOM_URLS, []);
      if (btn.dataset.action === 'pause') {
        existing[idx] = { ...existing[idx], paused: !existing[idx].paused };
        await Storage.setOne(STORAGE_KEYS.CUSTOM_URLS, existing);
        renderUrlList(existing);
        toast(existing[idx].paused ? 'Paused' : 'Resumed');
      } else {
        const updated = existing.filter((_, j) => j !== idx);
        await Storage.setOne(STORAGE_KEYS.CUSTOM_URLS, updated);
        renderUrlList(updated);
        toast('Removed');
      }
    });
  });
}

// ── Utility ───────────────────────────────────────────────────────────────────

function autoSaveInput(id, key, callback) {
  const el = $(id);
  let prev = el.value;
  el.addEventListener('focus', () => { prev = el.value; });
  el.addEventListener('blur', async () => {
    if (el.value.trim() === prev.trim()) return;
    await Storage.setOne(key, el.value.trim());
    callback?.(el.value.trim());
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
  toastTimer = setTimeout(() => el.classList.remove('toast--show'), 2400);
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sendMsg(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, response => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}
