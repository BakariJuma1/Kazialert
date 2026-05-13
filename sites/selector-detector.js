// Auto-detects job listings on any career page for Tier 2 and Tier 3 URLs

const JOB_PATTERN = /job|position|vacancy|role|opening|career|opportunity|hire|recruit/i;

const CONTAINER_SELECTORS = [
  '[class*="job-list"] > *',
  '[class*="jobs-list"] > *',
  '[class*="vacancy-list"] > *',
  '[class*="opening-list"] > *',
  '[class*="job-card"]',
  '[class*="vacancy-card"]',
  '[class*="position-card"]',
  'article[class*="job"]',
  'li[class*="job"]',
  'li[class*="vacancy"]',
  '[data-job-id]',
  '[data-position]',
  '[data-vacancy]',
  '.job',
  '.vacancy',
  '.opening',
];

const TITLE_SELECTORS = ['h2', 'h3', 'h4', '[class*="title"]', '[class*="position"]', '[class*="role"]'];
const COMPANY_SELECTORS = ['[class*="company"]', '[class*="employer"]', '[class*="organization"]', '[itemprop="hiringOrganization"]'];
const LOCATION_SELECTORS = ['[class*="location"]', '[class*="city"]', '[class*="country"]', '[itemprop="jobLocation"]'];

export function detectJobListings(doc, sourceUrl = '') {
  const containers = findJobContainers(doc);
  if (containers.length > 0) {
    return extractFromContainers(containers, sourceUrl);
  }
  // Fallback: find job-like links on the page
  return extractFromLinks(doc, sourceUrl);
}

function findJobContainers(doc) {
  const seen = new Set();
  const results = [];

  for (const sel of CONTAINER_SELECTORS) {
    try {
      doc.querySelectorAll(sel).forEach(el => {
        if (seen.has(el)) return;
        seen.add(el);
        const text = el.textContent || '';
        // Must have some text and look job-related
        if (text.length > 20 && JOB_PATTERN.test(text)) {
          results.push(el);
        }
      });
    } catch {
      // Skip invalid selectors
    }
  }

  return results;
}

function extractFromContainers(containers, baseUrl) {
  return containers.map(el => {
    const titleEl = findFirst(el, TITLE_SELECTORS) || el.querySelector('a');
    const linkEl = el.querySelector('a[href]');

    const title = titleEl?.textContent.trim() || '';
    if (!title || title.length > 200) return null;

    return {
      title,
      company: findFirst(el, COMPANY_SELECTORS)?.textContent.trim() || '',
      description: el.querySelector('p, [class*="description"], [class*="summary"]')?.textContent.trim() || '',
      location: findFirst(el, LOCATION_SELECTORS)?.textContent.trim() || '',
      jobType: el.querySelector('[class*="type"], [class*="contract"], [class*="employment"]')?.textContent.trim() || '',
      applyUrl: resolveUrl(linkEl?.getAttribute('href') || '', baseUrl),
      deadline: extractDeadlineText(el.textContent),
    };
  }).filter(j => j && j.title.length > 3);
}

function extractFromLinks(doc, baseUrl) {
  const JOB_LINK_PATTERN = /\/jobs?\/|\/careers?\/|\/vacancies?\/|\/positions?\/|\/openings?\/|\/apply\//i;
  const seen = new Set();
  const jobs = [];

  doc.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    const url = resolveUrl(href, baseUrl);
    if (!url || seen.has(url) || !JOB_LINK_PATTERN.test(url)) return;

    const title = a.textContent.trim();
    if (title.length < 5 || title.length > 200) return;
    if (!JOB_PATTERN.test(title) && !JOB_LINK_PATTERN.test(url)) return;

    seen.add(url);
    jobs.push({
      title,
      company: '',
      description: '',
      location: '',
      jobType: '',
      applyUrl: url,
      deadline: null,
    });
  });

  return jobs;
}

function findFirst(el, selectors) {
  for (const sel of selectors) {
    try {
      const found = el.querySelector(sel);
      if (found) return found;
    } catch {
      // Skip
    }
  }
  return null;
}

function extractDeadlineText(text) {
  const m = text.match(/(?:deadline|closing date|apply by|close)[:\s]+([A-Za-z]+ \d{1,2},? \d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
  return m ? m[1] : null;
}

function resolveUrl(href, base) {
  if (!href) return '';
  try { return new URL(href, base || 'https://example.com').href; } catch { return href; }
}
