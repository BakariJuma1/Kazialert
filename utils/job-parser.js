export function normalizeJob(raw = {}) {
  return {
    id: generateId(raw.title, raw.company, raw.applyUrl),
    title: (raw.title || '').trim(),
    company: (raw.company || '').trim(),
    description: (raw.description || '').trim(),
    location: (raw.location || '').trim(),
    jobType: raw.jobType || '',
    deadline: raw.deadline || null,
    applyUrl: (raw.applyUrl || raw.url || '').trim(),
    source: raw.source || '',
    postedAt: raw.postedAt || new Date().toISOString(),
    scrapedAt: new Date().toISOString(),
  };
}

export function generateId(title = '', company = '', url = '') {
  const str = `${title}||${company}||${url}`.toLowerCase().replace(/\s+/g, '');
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(36);
}

export function extractDeadline(text = '') {
  const patterns = [
    /(?:deadline|closing date|close date|apply by)[:\s]+([A-Za-z]+ \d{1,2},? \d{4})/i,
    /(?:deadline|closing date|close date|apply by)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}
