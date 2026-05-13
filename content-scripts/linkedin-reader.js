(function () {
  'use strict';

  // LinkedIn-specific passive reader — handles SPA navigation

  if (!location.hostname.includes('linkedin.com')) return;

  function hashStr(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) ^ str.charCodeAt(i);
      h = h >>> 0;
    }
    return h.toString(36);
  }

  function isJobViewPage() {
    return location.pathname.includes('/jobs/view/') || location.pathname.includes('/jobs/collections/');
  }

  function extractLinkedInJob() {
    // LinkedIn updates their classes often — we try multiple known patterns
    const titleEl = document.querySelector([
      '.job-details-jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title',
      '.topcard__title',
      'h1.t-24',
      'h1[class*="job"]',
      'h1',
    ].join(', '));

    const companyEl = document.querySelector([
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__primary-description a',
      '.topcard__org-name-link',
      '[data-tracking-control-name="public_jobs_topcard-org-name"]',
    ].join(', '));

    const descEl = document.querySelector([
      '.jobs-description__content .jobs-box__html-content',
      '.description__text',
      '#job-details',
      '[class*="jobs-description"]',
    ].join(', '));

    const locationEl = document.querySelector([
      '.job-details-jobs-unified-top-card__bullet',
      '.topcard__flavor--bullet',
      '[class*="jobs-unified-top-card__bullet"]',
    ].join(', '));

    const title = titleEl?.textContent.trim() || '';
    if (!title) return null;

    return {
      id: hashStr(`linkedin||${title}||${location.href}`),
      title,
      company: companyEl?.textContent.trim() || '',
      description: (descEl?.innerText || descEl?.textContent || '').trim().slice(0, 3000),
      location: locationEl?.textContent.trim() || '',
      jobType: '',
      applyUrl: location.href.split('?')[0], // strip tracking params
      deadline: null,
      source: 'LinkedIn (Passive)',
      postedAt: new Date().toISOString(),
    };
  }

  function tryExtract() {
    if (!isJobViewPage()) return;
    const job = extractLinkedInJob();
    if (job && job.title && job.description.length > 50) {
      chrome.runtime.sendMessage({ type: 'PASSIVE_JOB', job }).catch(() => {});
    }
  }

  // LinkedIn is a React SPA — watch for URL changes via popstate and pushState intercept
  let lastUrl = location.href;

  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(tryExtract, 3000);
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Also fire on initial load
  setTimeout(tryExtract, 3000);
})();
