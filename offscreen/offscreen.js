// This page runs in an extension offscreen document — it has full DOM access.
// The service worker sends HTML/XML here for parsing since DOMParser isn't
// available in service workers.

import { JOB_BOARDS } from '../sites/job-boards.js';
import { detectJobListings } from '../sites/selector-detector.js';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'offscreen') return false;

  try {
    if (msg.type === 'PARSE_BOARD') {
      const board = JOB_BOARDS.find(b => b.name === msg.boardName);
      if (!board) { sendResponse({ ok: false, error: `Board "${msg.boardName}" not found` }); return true; }

      const mime = board.type === 'rss' ? 'text/xml' : 'text/html';
      const doc  = new DOMParser().parseFromString(msg.html, mime);
      const jobs = board.parse(doc);
      sendResponse({ ok: true, jobs });

    } else if (msg.type === 'PARSE_CAREER') {
      const doc  = new DOMParser().parseFromString(msg.html, 'text/html');
      const jobs = detectJobListings(doc, msg.url);
      sendResponse({ ok: true, jobs });

    } else {
      sendResponse({ ok: false, error: `Unknown type: ${msg.type}` });
    }
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }

  return true; // keep channel open for async response
});
