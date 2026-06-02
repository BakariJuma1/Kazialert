import { Storage, STORAGE_KEYS } from '../utils/storage.js';

const RESEND_API = 'https://api.resend.com/emails';

// ── Public API ────────────────────────────────────────────────────────────────

export async function sendJobAlert(job, matchResult) {
  const { apiKey, from, to } = await getResendConfig();
  const postedDate = job.postedAt
    ? new Date(job.postedAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Recently';

  return resendSend(apiKey, {
    from,
    to: [to],
    subject: `${matchResult.score}% match: ${job.title} at ${job.company || 'Unknown'}`,
    html: buildJobHTML(job, matchResult, postedDate),
  });
}

export async function sendDigestAlert(matches) {
  const { apiKey, from, to } = await getResendConfig();

  return resendSend(apiKey, {
    from,
    to: [to],
    subject: `Kazi Alert: ${matches.length} job match${matches.length !== 1 ? 'es' : ''} found`,
    html: buildDigestHTML(matches),
  });
}

// ── Resend HTTP call ──────────────────────────────────────────────────────────

async function getResendConfig() {
  const [apiKey, from, to] = await Promise.all([
    Storage.getOne(STORAGE_KEYS.RESEND_KEY),
    Storage.getOne(STORAGE_KEYS.RESEND_FROM, 'onboarding@resend.dev'),
    Storage.getOne(STORAGE_KEYS.EMAIL),
  ]);
  if (!apiKey || !to) {
    throw new Error('Resend not configured — add API key and alert email in Options.');
  }
  return { apiKey, from, to };
}

async function resendSend(apiKey, payload) {
  const response = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend ${response.status}: ${text.slice(0, 200)}`);
  }
  return true;
}

// ── HTML builders ─────────────────────────────────────────────────────────────

function buildJobHTML(job, match, postedDate) {
  const scoreColor = match.score >= 80 ? '#3fb950' : match.score >= 60 ? '#d29922' : '#8b949e';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e6edf3;">
<div style="max-width:560px;margin:0 auto;background:#161b22;border:1px solid #30363d;border-radius:10px;overflow:hidden;">

  <div style="background:#00d084;padding:16px 24px;">
    <div style="font-size:18px;font-weight:700;color:#0d1117;">⚡ Kazi Alert</div>
    <div style="font-size:12px;color:#064e3b;margin-top:2px;">New job match found</div>
  </div>

  <div style="padding:24px;">
    <div style="font-size:22px;font-weight:700;margin-bottom:4px;">${esc(job.title)}</div>
    <div style="font-size:14px;color:#8b949e;margin-bottom:16px;">
      ${esc(job.company || 'Unknown')} · ${esc(job.location || 'Not specified')} · ${esc(job.source || '')}
    </div>

    <div style="display:inline-block;background:${scoreColor}22;border:1px solid ${scoreColor};color:${scoreColor};font-size:20px;font-weight:700;padding:8px 20px;border-radius:8px;margin-bottom:20px;">
      ${match.score}% match
    </div>

    <div style="background:#1c2128;border:1px solid #30363d;border-radius:8px;padding:16px;margin-bottom:12px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#8b949e;margin-bottom:6px;">Why you fit</div>
      <div style="font-size:14px;">${esc(match.why_fit || 'Strong profile alignment detected.')}</div>
    </div>

    ${match.gaps ? `
    <div style="background:#1c2128;border:1px solid #30363d;border-radius:8px;padding:16px;margin-bottom:12px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#8b949e;margin-bottom:6px;">Potential gaps</div>
      <div style="font-size:14px;">${esc(match.gaps)}</div>
    </div>` : ''}

    <div style="background:#1c2128;border:1px solid #30363d;border-radius:8px;padding:16px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;width:50%;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#8b949e;">Type</div>
            <div style="font-size:13px;margin-top:2px;">${esc(job.jobType || 'Not specified')}</div>
          </td>
          <td style="padding:6px 0;width:50%;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#8b949e;">Posted</div>
            <div style="font-size:13px;margin-top:2px;">${esc(postedDate)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#8b949e;">Deadline</div>
            <div style="font-size:13px;margin-top:2px;">${esc(job.deadline || 'Not specified')}</div>
          </td>
          <td style="padding:6px 0;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#8b949e;">Source</div>
            <div style="font-size:13px;margin-top:2px;">${esc(job.source || '—')}</div>
          </td>
        </tr>
      </table>
    </div>

    ${job.applyUrl && isSafeUrl(job.applyUrl) ? `
    <a href="${esc(job.applyUrl)}" style="display:block;background:#00d084;color:#0d1117;text-align:center;padding:13px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
      Apply Now →
    </a>` : ''}
  </div>

  <div style="padding:12px 24px;border-top:1px solid #30363d;font-size:11px;color:#484f58;text-align:center;">
    Kazi Alert · Your personal AI job scout
  </div>
</div>
</body>
</html>`;
}

function buildDigestHTML(matches) {
  const rows = matches.map(({ job, match }, i) => {
    const scoreColor = match.score >= 80 ? '#3fb950' : match.score >= 60 ? '#d29922' : '#8b949e';
    return `
    <div style="background:#1c2128;border:1px solid #30363d;border-radius:8px;padding:16px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <div style="font-size:15px;font-weight:600;">${i + 1}. ${esc(job.title)}</div>
          <div style="font-size:13px;color:#8b949e;margin-top:2px;">${esc(job.company || 'Unknown')} · ${esc(job.source || '')}</div>
        </div>
        <div style="flex-shrink:0;background:${scoreColor}22;border:1px solid ${scoreColor};color:${scoreColor};font-size:13px;font-weight:700;padding:4px 10px;border-radius:6px;">
          ${match.score}%
        </div>
      </div>
      <div style="font-size:13px;color:#c9d1d9;margin-top:10px;">${esc(match.why_fit || '')}</div>
      ${job.applyUrl && isSafeUrl(job.applyUrl) ? `
      <div style="margin-top:10px;">
        <a href="${esc(job.applyUrl)}" style="font-size:13px;color:#00d084;text-decoration:none;font-weight:600;">Apply →</a>
        ${job.deadline ? `<span style="font-size:12px;color:#8b949e;margin-left:12px;">Deadline: ${esc(job.deadline)}</span>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e6edf3;">
<div style="max-width:560px;margin:0 auto;background:#161b22;border:1px solid #30363d;border-radius:10px;overflow:hidden;">

  <div style="background:#00d084;padding:16px 24px;">
    <div style="font-size:18px;font-weight:700;color:#0d1117;">⚡ Kazi Alert</div>
    <div style="font-size:12px;color:#064e3b;margin-top:2px;">${matches.length} job match${matches.length !== 1 ? 'es' : ''} from latest scan</div>
  </div>

  <div style="padding:24px;">
    ${rows}
  </div>

  <div style="padding:12px 24px;border-top:1px solid #30363d;font-size:11px;color:#484f58;text-align:center;">
    Kazi Alert · Your personal AI job scout
  </div>
</div>
</body>
</html>`;
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isSafeUrl(str) {
  try { return ['http:', 'https:'].includes(new URL(str).protocol); } catch { return false; }
}
