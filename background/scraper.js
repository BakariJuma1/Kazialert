import { JOB_BOARDS } from '../sites/job-boards.js';
import { COMPANY_PAGES } from '../sites/company-pages.js';
import { detectJobListings } from '../sites/selector-detector.js';
import { normalizeJob } from '../utils/job-parser.js';
import { Storage, STORAGE_KEYS, DEFAULTS } from '../utils/storage.js';

const FETCH_TIMEOUT_MS = 20000;

export async function scrapeAll() {
  const [locationFilter, customUrls] = await Promise.all([
    Storage.getOne(STORAGE_KEYS.LOCATION_FILTER, DEFAULTS.LOCATION_FILTER),
    Storage.getOne(STORAGE_KEYS.CUSTOM_URLS, []),
  ]);

  const [tier1, tier2, tier3] = await Promise.all([
    scrapeTier1(locationFilter),
    scrapeTier2(locationFilter),
    scrapeTier3(customUrls),
  ]);

  return [...tier1, ...tier2, ...tier3];
}

async function scrapeTier1(locationFilter) {
  const boards = JOB_BOARDS.filter(b => matchesLocationFilter(b.location, locationFilter));
  const results = await Promise.allSettled(boards.map(b => scrapeBoard(b)));
  const jobs = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') jobs.push(...r.value);
    else console.warn(`[Kazi Alert] ${boards[i].name} scrape failed:`, r.reason?.message);
  });
  return jobs;
}

async function scrapeTier2(locationFilter) {
  const pages = COMPANY_PAGES.filter(p => matchesLocationFilter(p.region, locationFilter));
  // Batch to avoid overwhelming the network — 5 at a time
  const jobs = [];
  for (let i = 0; i < pages.length; i += 5) {
    const batch = pages.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(p => scrapeCareerPage(p.url, p.name)));
    results.forEach((r, j) => {
      if (r.status === 'fulfilled') jobs.push(...r.value);
      else console.warn(`[Kazi Alert] ${batch[j].name} scrape failed:`, r.reason?.message);
    });
  }
  return jobs;
}

async function scrapeTier3(customUrls) {
  const active = customUrls.filter(e => !e.paused);
  if (!active.length) return [];
  const results = await Promise.allSettled(
    active.map(entry => scrapeCareerPage(entry.url, entry.label || entry.url))
  );
  const jobs = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') jobs.push(...r.value);
    else console.warn(`[Kazi Alert] Custom URL "${active[i].label}" failed:`, r.reason?.message);
  });
  return jobs;
}

async function scrapeBoard(board) {
  const html = await fetchPage(board.url, board.headers);

  let rawJobs;
  if (board.type === 'json') {
    rawJobs = board.parse(JSON.parse(html));
  } else if (board.type === 'rss') {
    const doc = new DOMParser().parseFromString(html, 'text/xml');
    rawJobs = board.parse(doc);
  } else {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    rawJobs = board.parse(doc);
  }

  return rawJobs.map(j => normalizeJob({ ...j, source: j.source || board.name }));
}

async function scrapeCareerPage(url, sourceName) {
  const html = await fetchPage(url);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rawJobs = detectJobListings(doc, url);
  return rawJobs.map(j => normalizeJob({ ...j, source: sourceName }));
}

async function fetchPage(url, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KaziAlert/1.0)',
        ...extraHeaders,
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

function matchesLocationFilter(source, filter) {
  if (filter === 'both') return true;
  if (filter === 'kenya') return source === 'kenya' || source === 'both';
  if (filter === 'remote') return source === 'remote' || source === 'both';
  return true;
}
