import { Storage, STORAGE_KEYS } from '../utils/storage.js';

export async function logJobToSheet(job) {
  const sheetsUrl = await Storage.getOne(STORAGE_KEYS.SHEETS_URL);
  if (!sheetsUrl) throw new Error('No Apps Script URL configured.');

  const date = job.date || new Date().toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  // 11 columns matching the user's sheet format:
  // Company | Job | Date | Reached Out | Follow up | 4 weeks Later rule out
  // | Test | Interview | Passed | Failed | Ghosted
  // Use GET + URL params — POST redirects (302) become GET and lose the body,
  // but GET redirects stay GET and Apps Script preserves query params.
  const url = new URL(sheetsUrl);
  url.searchParams.set('company', job.company || '');
  url.searchParams.set('job',     job.title   || '');
  url.searchParams.set('date',    date);

  const response = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json().catch(() => ({ ok: true }));
  if (data.ok === false) throw new Error(data.e || 'Script returned an error');
  return true;
}

export async function markApplied(job) {
  const applied = await Storage.getOne(STORAGE_KEYS.APPLIED_JOBS, {});
  applied[job.id] = { appliedAt: new Date().toISOString(), loggedToSheet: false };
  await Storage.setOne(STORAGE_KEYS.APPLIED_JOBS, applied);

  try {
    await logJobToSheet(job);
    applied[job.id].loggedToSheet = true;
    await Storage.setOne(STORAGE_KEYS.APPLIED_JOBS, applied);
  } catch {
    // Logged locally even if sheet sync fails
  }

  return applied[job.id];
}
