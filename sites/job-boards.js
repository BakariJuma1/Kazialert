import { extractDeadline } from '../utils/job-parser.js';

// Each board defines: name, url, type (json|rss|html), location (kenya|remote|both), parse(data|doc)

export const JOB_BOARDS = [
  {
    name: 'RemoteOK',
    url: 'https://remoteok.com/api',
    type: 'json',
    location: 'remote',
    headers: { 'Accept': 'application/json' },
    parse(data) {
      if (!Array.isArray(data)) return [];
      return data.slice(1).filter(j => j.position).map(j => ({
        title: j.position || '',
        company: j.company || '',
        description: (j.description || '').replace(/<[^>]+>/g, ' '),
        location: 'Remote',
        jobType: 'full-time',
        applyUrl: j.url || `https://remoteok.com/jobs/${j.id}`,
        deadline: null,
        postedAt: j.date ? new Date(j.date * 1000).toISOString() : null,
        source: 'RemoteOK',
      }));
    },
  },

  {
    name: 'We Work Remotely',
    url: 'https://weworkremotely.com/remote-jobs.rss',
    type: 'rss',
    location: 'remote',
    parse(doc) {
      return Array.from(doc.querySelectorAll('item')).map(item => {
        const title = cdataText(item.querySelector('title'));
        const desc = cdataText(item.querySelector('description'));
        const link = item.querySelector('link')?.nextSibling?.textContent?.trim()
          || item.querySelector('guid')?.textContent?.trim() || '';
        return {
          title,
          company: cdataText(item.querySelector('author')) || extractCompanyFromTitle(title),
          description: desc.replace(/<[^>]+>/g, ' '),
          location: 'Remote',
          jobType: 'full-time',
          applyUrl: link,
          deadline: null,
          postedAt: item.querySelector('pubDate')?.textContent || null,
          source: 'We Work Remotely',
        };
      }).filter(j => j.title.length > 3);
    },
  },

  {
    name: 'Himalayas',
    url: 'https://himalayas.app/jobs/api?limit=50',
    type: 'json',
    location: 'remote',
    parse(data) {
      const jobs = data.jobs || data;
      if (!Array.isArray(jobs)) return [];
      return jobs.map(j => ({
        title: j.title || '',
        company: j.company?.name || j.companyName || '',
        description: (j.description || j.descriptionHtml || '').replace(/<[^>]+>/g, ' '),
        location: 'Remote',
        jobType: j.jobType || 'full-time',
        applyUrl: j.applicationLink || j.url || '',
        deadline: null,
        postedAt: j.publishedAt || null,
        source: 'Himalayas',
      }));
    },
  },

  {
    name: 'BrighterMonday Kenya',
    url: 'https://www.brightermonday.co.ke/listings',
    type: 'html',
    location: 'kenya',
    parse(doc) {
      const jobs = [];
      // Try multiple selector patterns as BrighterMonday may change markup
      const cards = doc.querySelectorAll('article.search-result, .job-listing, [class*="job-card"], li[class*="job"]');
      cards.forEach(card => {
        const titleEl = card.querySelector('h2 a, h3 a, [class*="title"] a, a[title]');
        const companyEl = card.querySelector('[class*="company"], [class*="employer"], .recruiter');
        const locEl = card.querySelector('[class*="location"], .job-location');
        if (!titleEl) return;
        jobs.push({
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent.trim() || '',
          description: card.querySelector('p, [class*="summary"]')?.textContent.trim() || '',
          location: locEl?.textContent.trim() || 'Kenya',
          jobType: card.querySelector('[class*="type"]')?.textContent.trim() || '',
          applyUrl: absoluteUrl(titleEl.getAttribute('href'), 'https://www.brightermonday.co.ke'),
          deadline: extractDeadline(card.textContent),
          source: 'BrighterMonday Kenya',
        });
      });
      // Fallback: scrape job links directly
      if (jobs.length === 0) {
        doc.querySelectorAll('a[href*="/listings/"]').forEach(a => {
          const t = a.textContent.trim();
          if (t.length > 5 && t.length < 200) {
            jobs.push({ title: t, company: '', description: '', location: 'Kenya', jobType: '', applyUrl: absoluteUrl(a.getAttribute('href'), 'https://www.brightermonday.co.ke'), deadline: null, source: 'BrighterMonday Kenya' });
          }
        });
      }
      return jobs;
    },
  },

  {
    name: 'Fuzu Kenya',
    url: 'https://fuzu.com/kenya/jobs',
    type: 'html',
    location: 'kenya',
    parse(doc) {
      const jobs = [];
      doc.querySelectorAll('[class*="job-card"], [class*="JobCard"], [data-cy="job-card"], [class*="listing-card"]').forEach(el => {
        const titleEl = el.querySelector('h2, h3, [class*="title"]');
        const linkEl = el.querySelector('a');
        if (!titleEl && !linkEl) return;
        jobs.push({
          title: (titleEl || linkEl).textContent.trim(),
          company: el.querySelector('[class*="company"], [class*="employer"], [class*="organization"]')?.textContent.trim() || '',
          description: el.querySelector('[class*="description"], [class*="summary"], p')?.textContent.trim() || '',
          location: el.querySelector('[class*="location"], [class*="city"]')?.textContent.trim() || 'Kenya',
          jobType: el.querySelector('[class*="type"], [class*="contract"]')?.textContent.trim() || '',
          applyUrl: linkEl ? absoluteUrl(linkEl.getAttribute('href'), 'https://fuzu.com') : '',
          deadline: null,
          source: 'Fuzu Kenya',
        });
      });
      return jobs;
    },
  },

  {
    name: 'Jobmag Kenya',
    url: 'https://jobmag.co.ke/jobs/',
    type: 'html',
    location: 'kenya',
    parse(doc) {
      const jobs = [];
      doc.querySelectorAll('.job_listing, .job-list-item, article[class*="job"]').forEach(el => {
        const titleEl = el.querySelector('h3 a, h2 a, .position a, .job-title a');
        if (!titleEl) return;
        jobs.push({
          title: titleEl.textContent.trim(),
          company: el.querySelector('.company, .employer, [class*="company"]')?.textContent.trim() || '',
          description: el.querySelector('.description, p, [class*="summary"]')?.textContent.trim() || '',
          location: el.querySelector('.location, .job-location, [class*="location"]')?.textContent.trim() || 'Kenya',
          jobType: el.querySelector('.job-type, .type, [class*="type"]')?.textContent.trim() || '',
          applyUrl: absoluteUrl(titleEl.getAttribute('href'), 'https://jobmag.co.ke'),
          deadline: extractDeadline(el.textContent),
          source: 'Jobmag Kenya',
        });
      });
      return jobs;
    },
  },

  {
    name: 'Wellfound',
    url: 'https://wellfound.com/jobs',
    type: 'html',
    location: 'remote',
    parse(doc) {
      const jobs = [];
      doc.querySelectorAll('[data-test="job-card"], [class*="JobCard"], [class*="job-card"], [class*="startup-job"]').forEach(el => {
        const titleEl = el.querySelector('h2, h3, [class*="title"], [class*="role"]');
        const companyEl = el.querySelector('[class*="company"], [class*="startup-name"], [class*="organization"]');
        const linkEl = el.querySelector('a[href*="/jobs/"], a[href*="/l/"]');
        if (!titleEl && !linkEl) return;
        jobs.push({
          title: (titleEl || linkEl).textContent.trim(),
          company: companyEl?.textContent.trim() || '',
          description: el.querySelector('p, [class*="description"]')?.textContent.trim() || '',
          location: el.querySelector('[class*="location"], [class*="remote"]')?.textContent.trim() || 'Remote',
          jobType: el.querySelector('[class*="type"], [class*="employment"]')?.textContent.trim() || '',
          applyUrl: linkEl ? absoluteUrl(linkEl.getAttribute('href'), 'https://wellfound.com') : '',
          deadline: null,
          source: 'Wellfound',
        });
      });
      // Fallback: job links
      if (jobs.length === 0) {
        doc.querySelectorAll('a[href*="/jobs/"], a[href*="/l/"]').forEach(a => {
          const t = a.textContent.trim();
          if (t.length > 5 && t.length < 200) {
            jobs.push({ title: t, company: '', description: '', location: 'Remote', jobType: '', applyUrl: absoluteUrl(a.getAttribute('href'), 'https://wellfound.com'), deadline: null, source: 'Wellfound' });
          }
        });
      }
      return jobs;
    },
  },

  {
    name: 'PSC Kenya',
    url: 'https://www.publicservice.go.ke/index.php/vacancies',
    type: 'html',
    location: 'kenya',
    parse(doc) {
      const jobs = [];
      const JOB_WORDS = /officer|manager|director|analyst|engineer|clerk|assistant|coordinator|secretary|inspector|superintendent/i;
      doc.querySelectorAll('table tr, .vacancy, li, p').forEach(el => {
        const linkEl = el.querySelector('a');
        if (!linkEl) return;
        const title = linkEl.textContent.trim();
        if (title.length < 5 || !JOB_WORDS.test(title)) return;
        jobs.push({
          title,
          company: 'Public Service Commission Kenya',
          description: el.textContent.trim(),
          location: 'Kenya',
          jobType: 'full-time',
          applyUrl: absoluteUrl(linkEl.getAttribute('href'), 'https://www.publicservice.go.ke'),
          deadline: extractDeadline(el.textContent),
          source: 'PSC Kenya',
        });
      });
      return jobs;
    },
  },
];

function cdataText(el) {
  if (!el) return '';
  return el.textContent.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
}

function extractCompanyFromTitle(title) {
  const m = title.match(/\bat\s+([A-Z][A-Za-z\s&]+?)(?:\s*[-|]|$)/);
  return m ? m[1].trim() : '';
}

function absoluteUrl(href, base) {
  if (!href) return '';
  try { return new URL(href, base).href; } catch { return href; }
}
