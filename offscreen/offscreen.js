// Offscreen document — full browser API access.
// Handles DOM parsing for job boards (service worker has no DOMParser)
// and PDF text extraction (options page can't reliably run pdf.js workers).

import { JOB_BOARDS }       from '../sites/job-boards.js';
import { detectJobListings } from '../sites/selector-detector.js';
import * as pdfjsLib         from '../pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  '../pdfjs/pdf.worker.min.mjs',
  import.meta.url
).href;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'offscreen') return false;

  handleMessage(msg)
    .then(sendResponse)
    .catch(err => sendResponse({ ok: false, error: err.message }));

  return true; // keep channel open for async response
});

async function handleMessage(msg) {
  switch (msg.type) {

    case 'PARSE_BOARD': {
      const board = JOB_BOARDS.find(b => b.name === msg.boardName);
      if (!board) throw new Error(`Board "${msg.boardName}" not found`);
      const mime = board.type === 'rss' ? 'text/xml' : 'text/html';
      const doc  = new DOMParser().parseFromString(msg.html, mime);
      return { ok: true, jobs: board.parse(doc) };
    }

    case 'PARSE_CAREER': {
      const doc  = new DOMParser().parseFromString(msg.html, 'text/html');
      return { ok: true, jobs: detectJobListings(doc, msg.url) };
    }

    case 'PARSE_PDF': {
      const bytes = Uint8Array.from(atob(msg.base64), c => c.charCodeAt(0));
      const text  = await extractPDFText(bytes);
      return { ok: true, text };
    }

    default:
      throw new Error(`Unknown message type: ${msg.type}`);
  }
}

async function extractPDFText(bytes) {
  const pdf      = await pdfjsLib.getDocument({ data: bytes }).promise;
  const allLines = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Group text items by y-position to restore reading order.
    // PDF coordinate system has y=0 at the bottom, so sort descending.
    const byY = new Map();
    for (const item of content.items) {
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y).push(item.str);
    }

    const pageLines = [...byY.keys()]
      .sort((a, b) => b - a)
      .map(y => byY.get(y).join(' '));

    allLines.push(...pageLines, '');
  }

  return allLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
