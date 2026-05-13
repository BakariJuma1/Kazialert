import { Storage, STORAGE_KEYS, DEFAULTS } from '../utils/storage.js';
import { scrapeAll } from './scraper.js';
import { matchJobToCV } from './groq-matcher.js';
import { sendJobAlert, sendDigestAlert } from './email-sender.js';
import { Deduplicator } from './deduplicator.js';

const ALARM_NAME = 'kazi-alert-scan';

// ── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await initAlarms();
  if (reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
  console.log('[Kazi Alert] Ready.');
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await runScan().catch(err => console.error('[Kazi Alert] Scan error:', err));
  }
});

// ── Message bus ──────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case 'PASSIVE_JOB':
      handlePassiveJob(msg.job).catch(console.error);
      sendResponse({ ok: true });
      break;

    case 'MANUAL_SCAN':
      runScan()
        .then(() => sendResponse({ ok: true }))
        .catch(err => sendResponse({ error: err.message }));
      return true; // keep channel open for async response

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
  }
});

// ── Core scan ────────────────────────────────────────────────────────────────

async function runScan() {
  console.log('[Kazi Alert] Scan started.');

  const [cv, threshold, groqKey, digestMode] = await Promise.all([
    Storage.getOne(STORAGE_KEYS.CV),
    Storage.getOne(STORAGE_KEYS.MATCH_THRESHOLD, DEFAULTS.MATCH_THRESHOLD),
    Storage.getOne(STORAGE_KEYS.GROQ_KEY),
    Storage.getOne(STORAGE_KEYS.DIGEST_MODE, DEFAULTS.DIGEST_MODE),
  ]);

  await Storage.setOne(STORAGE_KEYS.LAST_CHECK, new Date().toISOString());

  if (!cv) {
    console.warn('[Kazi Alert] No CV stored — skipping scan.');
    return;
  }
  if (!groqKey) {
    console.warn('[Kazi Alert] No Groq API key — skipping matching.');
    return;
  }

  let jobs = await scrapeAll();
  console.log(`[Kazi Alert] Scraped ${jobs.length} total jobs.`);

  jobs = await Deduplicator.filterNew(jobs);
  console.log(`[Kazi Alert] ${jobs.length} new (unseen) jobs to evaluate.`);

  const allIds = jobs.map(j => j.id);
  let alertCount = 0;
  const digestQueue = [];

  for (const job of jobs) {
    try {
      const match = await matchJobToCV(cv, job);
      if (match.score >= threshold) {
        if (digestMode) {
          digestQueue.push({ job, match });
        } else {
          await sendJobAlert(job, match);
        }
        await saveMatchedJob(job, match);
        alertCount++;
      }
    } catch (err) {
      console.error(`[Kazi Alert] Error on "${job.title}":`, err.message);
    }
  }

  if (digestMode && digestQueue.length > 0) {
    try {
      await sendDigestAlert(digestQueue);
    } catch (err) {
      console.error('[Kazi Alert] Digest send failed:', err.message);
    }
  }

  // Mark all scraped jobs as seen regardless of match — prevents re-checking same jobs
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

  console.log(`[Kazi Alert] Scan done. ${alertCount} alerts sent.`);
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
    }
    await Deduplicator.markSeen([jobData.id]);
  } catch (err) {
    console.error('[Kazi Alert] Passive job error:', err.message);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function initAlarms() {
  const hours = await Storage.getOne(STORAGE_KEYS.CHECK_INTERVAL, DEFAULTS.CHECK_INTERVAL);
  await chrome.alarms.clearAll();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: hours * 60 });
  console.log(`[Kazi Alert] Alarm set — every ${hours}h.`);
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

async function getStatus() {
  const [lastCheck, stats, cv, email] = await Promise.all([
    Storage.getOne(STORAGE_KEYS.LAST_CHECK),
    Storage.getOne(STORAGE_KEYS.STATS, DEFAULTS.STATS),
    Storage.getOne(STORAGE_KEYS.CV),
    Storage.getOne(STORAGE_KEYS.EMAIL),
  ]);
  return { lastCheck, stats, hasCV: !!cv, hasEmail: !!email };
}
