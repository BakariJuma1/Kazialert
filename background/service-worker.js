import { Storage, STORAGE_KEYS, DEFAULTS } from '../utils/storage.js';
import { scrapeAll } from './scraper.js';
import { matchJobToCV } from './groq-matcher.js';
import { sendJobAlert, sendDigestAlert } from './email-sender.js';
import { Deduplicator } from './deduplicator.js';
import { Logger } from '../utils/logger.js';
import { logJobToSheet, markApplied } from './sheets-logger.js';

const ALARM_NAME         = 'kazi-alert-scan';
const MAX_JOBS_PER_SCAN  = 40;   // keyword-pre-filtered cap before Groq
const GROQ_CALL_DELAY_MS = 5000; // 5 s between calls ≈ 10-11 calls/min, well under 12k TPM

// ── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await initAlarms();
  if (reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
  Logger.info('Extension ready.');
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await runScan().catch(err => Logger.error(`Scan error: ${err.message}`));
  }
});

// ── Message bus ──────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case 'PASSIVE_JOB':
      handlePassiveJob(msg.job).catch(err => Logger.error(`Passive job error: ${err.message}`));
      sendResponse({ ok: true });
      break;

    case 'MANUAL_SCAN':
      runScan()
        .then(() => sendResponse({ ok: true }))
        .catch(err => sendResponse({ error: err.message }));
      return true;

    case 'GET_STATUS':
      getStatus()
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;

    case 'REINIT_ALARM':
      initAlarms()
        .then(() => sendResponse({ ok: true }))
        .catch(err => sendResponse({ error: err.message }));
      return true;

    // Sheets calls route through the service worker so they bypass CORS preflight
    case 'MARK_APPLIED':
      markApplied(msg.job)
        .then(result => sendResponse({ ok: true, result }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;

    case 'LOG_TO_SHEET':
      logJobToSheet(msg.job)
        .then(() => sendResponse({ ok: true }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;

    case 'TEST_SHEET': {
      const testUrl = new URL(msg.url);
      testUrl.searchParams.set('company', 'Kazi Alert');
      testUrl.searchParams.set('job', '✓ Test row — connection working');
      testUrl.searchParams.set('date', new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }));
      fetch(testUrl.toString(), { method: 'GET', redirect: 'follow' })
        .then(r => r.json().catch(() => ({ ok: r.ok })))
        .then(data => sendResponse({ ok: data.ok !== false, written: data.written, error: data.e }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
    }
  }
});

// ── Core scan ────────────────────────────────────────────────────────────────

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existing.length === 0) {
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('offscreen/offscreen.html'),
      reasons: ['DOM_PARSER'],
      justification: 'Parse HTML/RSS job boards — DOMParser unavailable in service workers',
    });
  }
}

async function runScan() {
  await ensureOffscreen();
  Logger.info('Scan started.');

  const [cv, threshold, groqKey, digestMode] = await Promise.all([
    Storage.getOne(STORAGE_KEYS.CV),
    Storage.getOne(STORAGE_KEYS.MATCH_THRESHOLD, DEFAULTS.MATCH_THRESHOLD),
    Storage.getOne(STORAGE_KEYS.GROQ_KEY),
    Storage.getOne(STORAGE_KEYS.DIGEST_MODE, DEFAULTS.DIGEST_MODE),
  ]);

  await Storage.setOne(STORAGE_KEYS.LAST_CHECK, new Date().toISOString());

  if (!cv) {
    Logger.warn('No CV stored — skipping scan.');
    return;
  }
  if (!groqKey) {
    Logger.warn('No Groq API key — skipping matching.');
    return;
  }

  let jobs = await scrapeAll();
  Logger.info(`Scraped ${jobs.length} total jobs.`);

  jobs = await Deduplicator.filterNew(jobs);
  Logger.info(`${jobs.length} new (unseen) jobs to evaluate.`);

  if (jobs.length === 0) {
    Logger.info('No new jobs this scan — all already seen.');
  }

  const allIds = jobs.map(j => j.id);

  // Keyword pre-filter — rank by relevance to CV, cap at MAX_JOBS_PER_SCAN
  // so we stay within Groq's free-tier rate limit on large scans.
  const keywords = extractCVKeywords(cv);
  let toEvaluate = jobs;
  if (jobs.length > MAX_JOBS_PER_SCAN) {
    toEvaluate = rankByRelevance(jobs, keywords).slice(0, MAX_JOBS_PER_SCAN);
    Logger.info(`Pre-filtered to top ${toEvaluate.length} relevant jobs from ${jobs.length} total.`);
  }

  let alertCount = 0;
  const digestQueue = [];

  for (let i = 0; i < toEvaluate.length; i++) {
    const job = toEvaluate[i];
    try {
      const match = await matchJobToCV(cv, job);
      Logger.info(`"${job.title}" scored ${match.score}% (threshold ${threshold}%).`);
      if (match.score >= threshold) {
        if (digestMode) {
          digestQueue.push({ job, match });
        } else {
          await sendJobAlert(job, match);
          Logger.info(`Alert sent for "${job.title}".`);
        }
        await saveMatchedJob(job, match);
        alertCount++;
      }
    } catch (err) {
      Logger.error(`Error on "${job.title}": ${err.message}`);
    }
    // Rate-limit Groq — pause between every call except the last
    if (i < toEvaluate.length - 1) await sleep(GROQ_CALL_DELAY_MS);
  }

  if (digestMode && digestQueue.length > 0) {
    try {
      await sendDigestAlert(digestQueue);
      Logger.info(`Digest sent — ${digestQueue.length} matches.`);
    } catch (err) {
      Logger.error(`Digest send failed: ${err.message}`);
    }
  }

  await Deduplicator.markSeen(allIds);

  if (alertCount > 0) {
    await bumpWeeklyStats(alertCount);
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: '../icons/icon48.png',
      title: 'Kazi Alert',
      message: `${alertCount} job match${alertCount > 1 ? 'es' : ''} found and emailed to you!`,
    });
  }

  Logger.info(`Scan done — ${alertCount} alert${alertCount !== 1 ? 's' : ''} sent.`);
}

async function handlePassiveJob(jobData) {
  const [cv, threshold, groqKey] = await Promise.all([
    Storage.getOne(STORAGE_KEYS.CV),
    Storage.getOne(STORAGE_KEYS.MATCH_THRESHOLD, DEFAULTS.MATCH_THRESHOLD),
    Storage.getOne(STORAGE_KEYS.GROQ_KEY),
  ]);

  if (!cv || !groqKey) return;
  if (!(await Deduplicator.isNew(jobData.id))) return;

  try {
    const match = await matchJobToCV(cv, jobData);
    if (match.score >= threshold) {
      await sendJobAlert(jobData, match);
      await saveMatchedJob(jobData, match);
      await bumpWeeklyStats(1);
      Logger.info(`Passive alert sent for "${jobData.title}" (${match.score}%).`);
    }
    await Deduplicator.markSeen([jobData.id]);
  } catch (err) {
    Logger.error(`Passive job error: ${err.message}`);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function initAlarms() {
  const hours = await Storage.getOne(STORAGE_KEYS.CHECK_INTERVAL, DEFAULTS.CHECK_INTERVAL);
  await chrome.alarms.clearAll();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: hours * 60 });
  Logger.info(`Alarm set — every ${hours}h.`);
}

async function saveMatchedJob(job, match) {
  const MAX = 200;
  const history = await Storage.getOne(STORAGE_KEYS.MATCHED_JOBS, []);
  history.unshift({
    id: job.id,
    title: job.title,
    company: job.company,
    source: job.source,
    location: job.location,
    applyUrl: job.applyUrl,
    deadline: job.deadline,
    score: match.score,
    whyFit: match.why_fit,
    gaps: match.gaps,
    matchedAt: new Date().toISOString(),
  });
  await Storage.setOne(STORAGE_KEYS.MATCHED_JOBS, history.slice(0, MAX));
}

async function bumpWeeklyStats(count) {
  const stats = await Storage.getOne(STORAGE_KEYS.STATS, { ...DEFAULTS.STATS });
  const now = Date.now();
  const weekMs = 7 * 24 * 3600 * 1000;

  if (!stats.weekStart || now - new Date(stats.weekStart).getTime() > weekMs) {
    stats.weekStart = new Date().toISOString();
    stats.emailsSentWeek = 0;
  }

  stats.totalMatched = (stats.totalMatched || 0) + count;
  stats.emailsSentWeek = (stats.emailsSentWeek || 0) + count;
  await Storage.setOne(STORAGE_KEYS.STATS, stats);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractCVKeywords(cv) {
  const RE = /\b(javascript|typescript|python|java|c\+\+|c#|ruby|php|swift|kotlin|golang|rust|react|angular|vue|svelte|nextjs|nuxtjs|nodejs|express|django|flask|fastapi|spring|rails|laravel|jquery|redux|graphql|sql|mysql|postgresql|mongodb|redis|docker|kubernetes|aws|gcp|azure|git|linux|bash|terraform|machine learning|deep learning|data science|tensorflow|pytorch|pandas|numpy|flutter|android|ios|firebase|rest api|microservices|devops|agile|scrum|wordpress|figma|excel|power bi|tableau|salesforce|sap|html|css|sass|tailwind|bootstrap)\b/gi;
  const found = new Set();
  let m;
  while ((m = RE.exec(cv)) !== null) found.add(m[0].toLowerCase());
  return [...found];
}

function rankByRelevance(jobs, keywords) {
  if (!keywords.length) return jobs;
  return [...jobs].sort((a, b) => {
    const score = j => {
      const text = `${j.title} ${j.description || ''}`.toLowerCase();
      return keywords.reduce((n, kw) => n + (text.includes(kw) ? 1 : 0), 0);
    };
    return score(b) - score(a);
  });
}

async function getStatus() {
  const [lastCheck, stats, cv, email] = await Promise.all([
    Storage.getOne(STORAGE_KEYS.LAST_CHECK),
    Storage.getOne(STORAGE_KEYS.STATS, DEFAULTS.STATS),
    Storage.getOne(STORAGE_KEYS.CV),
    Storage.getOne(STORAGE_KEYS.EMAIL),
  ]);
  return { lastCheck, stats, hasCV: !!cv, hasEmail: !!email };
}
