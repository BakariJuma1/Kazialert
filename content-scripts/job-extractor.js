(function () {
  'use strict';

  // Passive Tier-4 reader — runs on every non-LinkedIn page

  const URL_JOB_PATTERN = /\/jobs?\/|\/careers?\/|\/vacancies?\/|\/positions?\/|\/openings?\//i;
  const BODY_SIGNALS = [
    /job description|responsibilities|requirements|qualifications/i,
    /apply\s+now|submit.*application|how to apply/i,
    /salary|compensation|package|benefits/i,
  ];

  function isJobPage() {
    if (!URL_JOB_PATTERN.test(location.href)) return false;
    const text = document.body?.innerText || '';
    return BODY_SIGNALS.filter(p => p.test(text)).length >= 2;
  }

  function hashStr(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) ^ str.charCodeAt(i);
      h = h >>> 0;
    }
    return h.toString(36);
  }

  function extractTitle() {
    const selectors = [
      'h1[class*="job"], h1[class*="position"], h1[class*="title"]',
      '[class*="job-title"] h1, [class*="position-title"] h1',
      '[itemprop="title"]',
      'h1',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const t = el.textContent.trim();
        if (t.length > 3 && t.length < 200) return t;
      }
    }
    // Fall back to og:title or page title
    const og = document.querySelector('meta[property="og:title"]');
    if (og) return og.getAttribute('content')?.split('|')[0].trim() || '';
    return document.title.split(/[|\-–]/)[0].trim();
  }

  function extractCompany() {
    const selectors = [
      '[class*="company-name"], [class*="employer-name"]',
      '[itemprop="hiringOrganization"] [itemprop="name"]',
      '[class*="company"] a, [class*="employer"] a',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) { const t = el.textContent.trim(); if (t.length > 1) return t; }
    }
    const og = document.querySelector('meta[property="og:site_name"]');
    if (og) return og.getAttribute('content') || '';
    return location.hostname.replace(/^www\./, '').replace(/\.(co\.\w+|\w+)$/, '');
  }

  function extractDescription() {
    const selectors = [
      '[class*="job-description"]',
      '[id*="job-description"]',
      '[class*="job-detail"]',
      '[class*="description"]',
      '[id*="description"]',
      'article',
      'main',
      '[role="main"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 100) return el.innerText.trim();
    }
    return document.body?.innerText.trim() || '';
  }

  function extractLocation() {
    const el = document.querySelector(
      '[class*="location"], [itemprop="jobLocation"] [itemprop="addressLocality"], [class*="city"]'
    );
    return el?.textContent.trim() || '';
  }

  function extractJobType() {
    const el = document.querySelector(
      '[itemprop="employmentType"], [class*="employment-type"], [class*="job-type"]'
    );
    return el?.textContent.trim() || '';
  }

  function extractDeadline() {
    const text = document.body?.innerText || '';
    const m = text.match(/(?:deadline|closing date|apply by)[:\s]+([A-Za-z]+ \d{1,2},? \d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
    return m ? m[1] : null;
  }

  function run() {
    if (!isJobPage()) return;

    const title = extractTitle();
    const description = extractDescription();
    if (!title || description.length < 80) return;

    const job = {
      id: hashStr(`${title}||${extractCompany()}||${location.href}`),
      title,
      company: extractCompany(),
      description: description.slice(0, 3000),
      location: extractLocation(),
      jobType: extractJobType(),
      applyUrl: location.href,
      deadline: extractDeadline(),
      source: `Passive: ${location.hostname}`,
      postedAt: new Date().toISOString(),
    };

    chrome.runtime.sendMessage({ type: 'PASSIVE_JOB', job }).catch(() => {});
  }

  // Delay to allow SPA content to render
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(run, 2500));
  } else {
    setTimeout(run, 2500);
  }
})();
