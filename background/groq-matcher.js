import { Storage, STORAGE_KEYS } from '../utils/storage.js';

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `You are an expert job-CV matching AI for Kenyan and global job seekers.

Given a CV and a job description, assess fit precisely. Return ONLY valid JSON — no markdown, no preamble:

{
  "score": <integer 0–100>,
  "why_fit": "<2–3 sentences highlighting matching skills and experience>",
  "gaps": "<1–2 sentences on missing requirements — be honest but encouraging>",
  "recommendation": "<apply|consider|skip>"
}`;

export async function matchJobToCV(cv, job) {
  const apiKey = await Storage.getOne(STORAGE_KEYS.GROQ_KEY);
  if (!apiKey) throw new Error('Groq API key not set. Configure it in Options.');

  const jobText = [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Location: ${job.location || 'Not specified'}`,
    `Type: ${job.jobType || 'Not specified'}`,
    `Description:\n${(job.description || '').slice(0, 2000)}`,
  ].join('\n');

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(GROQ_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `CV:\n${cv.slice(0, 2500)}\n\nJob:\n${jobText}\n\nRespond with JSON only.` },
        ],
        temperature: 0.2,
        max_tokens: 350,
        response_format: { type: 'json_object' },
      }),
    });

    if (response.status === 429) {
      const wait = parseInt(response.headers.get('retry-after') || '15', 10) * 1000;
      await sleep(wait);
      continue;
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Groq ${response.status}: ${err.slice(0, 200)}`);
    }

    const data    = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';

    try {
      return JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
      return { score: 0, why_fit: '', gaps: 'Could not parse AI response.', recommendation: 'skip' };
    }
  }

  throw new Error('Groq rate limit — retries exhausted. Try again later.');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
