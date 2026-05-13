import { Storage, STORAGE_KEYS } from '../utils/storage.js';

const EMAILJS_API = 'https://api.emailjs.com/api/v1.0/email/send';

export async function sendDigestAlert(matches) {
  const [serviceId, templateId, userId, alertEmail] = await Promise.all([
    Storage.getOne(STORAGE_KEYS.EMAILJS_SERVICE),
    Storage.getOne(STORAGE_KEYS.EMAILJS_DIGEST_TEMPLATE),
    Storage.getOne(STORAGE_KEYS.EMAILJS_USER),
    Storage.getOne(STORAGE_KEYS.EMAIL),
  ]);

  if (!serviceId || !templateId || !userId || !alertEmail) {
    throw new Error('Digest template not configured. Add digest template ID in Options → API Keys.');
  }

  const jobsList = matches.map(({ job, match }, i) => [
    `${i + 1}. ${job.title} — ${job.company || 'Unknown'}`,
    `   Match: ${match.score}%  |  Source: ${job.source || '—'}`,
    `   Why you fit: ${match.why_fit || '—'}`,
    `   Gaps: ${match.gaps || 'None identified'}`,
    `   Deadline: ${job.deadline || 'Not specified'}`,
    `   Apply: ${job.applyUrl || 'N/A'}`,
  ].join('\n')).join('\n\n──────────────────────\n\n');

  const response = await fetch(EMAILJS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: userId,
      template_params: {
        to_email: alertEmail,
        match_count: matches.length,
        jobs_list: jobsList,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`EmailJS digest ${response.status}: ${text.slice(0, 200)}`);
  }

  return true;
}

export async function sendJobAlert(job, matchResult) {
  const [serviceId, templateId, userId, alertEmail] = await Promise.all([
    Storage.getOne(STORAGE_KEYS.EMAILJS_SERVICE),
    Storage.getOne(STORAGE_KEYS.EMAILJS_TEMPLATE),
    Storage.getOne(STORAGE_KEYS.EMAILJS_USER),
    Storage.getOne(STORAGE_KEYS.EMAIL),
  ]);

  if (!serviceId || !templateId || !userId || !alertEmail) {
    throw new Error('EmailJS not fully configured. Complete setup in Options.');
  }

  const postedDate = job.postedAt ? new Date(job.postedAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recently';

  const templateParams = {
    to_email: alertEmail,
    job_title: job.title,
    company: job.company || 'Unknown company',
    source: job.source || 'Unknown source',
    match_score: `${matchResult.score}%`,
    why_fit: matchResult.why_fit || 'Strong profile alignment detected.',
    gaps: matchResult.gaps || 'No significant gaps identified.',
    recommendation: matchResult.recommendation || 'apply',
    deadline: job.deadline || 'Not specified',
    apply_link: job.applyUrl || '#',
    location: job.location || 'Not specified',
    job_type: job.jobType || 'Not specified',
    posted_at: postedDate,
  };

  const response = await fetch(EMAILJS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: userId,
      template_params: templateParams,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`EmailJS ${response.status}: ${text.slice(0, 200)}`);
  }

  return true;
}
