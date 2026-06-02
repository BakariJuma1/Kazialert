# Kazi Alert

AI-powered job matching Chrome extension. Monitors job boards and company career pages, matches listings against your CV using Groq AI, and emails you only the jobs you actually fit — then logs every application straight to your Google Sheet.

Built by **Isaac Bakari Juma** · Jaribu Tech Solutions

---

## What it does

- Scrapes **Tier 1** job boards (BrighterMonday, Jobmag, RemoteOK, We Work Remotely, and more) on a schedule
- Scrapes **Tier 2** curated company career pages (Safaricom, KCB, Equity Bank, GitLab, Stripe, and 25+ others)
- Scrapes **Tier 3** any career page URL you add manually
- **Passively reads** any job page you browse to (LinkedIn, Indeed, anywhere)
- Sends job + CV to **Groq (Llama 3.3)** — returns a match score, why you fit, and honest gaps
- Emails alerts via **Resend** — beautiful HTML emails, only jobs above your match threshold
- **Job Tracker** — one click logs any application to your Google Sheet with Company, Job Title, and Date

---

## Installation (local)

1. Clone the repo
2. Open Chrome → `chrome://extensions/` → enable **Developer mode**
3. Click **Load unpacked** → select the project folder
4. Click the extension icon → **Open Settings** → fill in your CV, email, and API keys

---

## Setup

### Groq API key (free)

1. Sign up at [console.groq.com](https://console.groq.com)
2. Create an API key (starts with `gsk_…`)
3. Paste it into **Options → API Keys → Groq API Key**

### Resend (free — 3,000 emails/month)

1. Sign up at [resend.com](https://resend.com)
2. Create an API key (starts with `re_…`)
3. Paste it into **Options → API Keys → Resend API Key**
4. Leave the "From email" blank to use `onboarding@resend.dev`, or add your own verified domain

No templates to set up — emails are built-in HTML.

### Job Tracker (optional — Google Sheets)

Log every application to a Google Sheet automatically.

1. Open your Google Sheet → **Extensions → Apps Script**
2. Delete the default code, paste the script from **Options → Job Tracker → Copy**, and save (`Ctrl+S`)
3. Click **Deploy → New deployment → Web App**
4. Set "Execute as: Me" and "Who has access: Anyone" → Deploy
5. Copy the `/exec` URL and paste it into **Options → Job Tracker**
6. Click **Test** — a test row should appear in your sheet

After setup, click **Mark Applied** on any match in history to log it, or use the **manual log form** for jobs you applied to outside the extension.

Your sheet columns should be: `Company | Job | Date | Reached Out | Follow up | 4 weeks Later | Test | Interview | Passed | Failed | Ghosted`

---

## Options

| Setting | Description | Default |
|---|---|---|
| Check interval | How often to scan — 2h, 6h, 12h, 24h | 6h |
| Match threshold | Minimum AI score to trigger an alert | 60% |
| Location scope | Kenya only, Remote only, or Both | Both |
| Job type | Full time, Part time, Internship, Contract, All | All |
| Digest mode | One batched email per scan instead of per-job alerts | Off |
| Custom career pages | Add any company careers URL to monitor | — |
| Google Apps Script URL | Endpoint for automatic sheet logging | — |

---

## Job sources

| Tier | Type | Examples |
|---|---|---|
| 1 | Active scraping — job boards | BrighterMonday Kenya, Jobmag, RemoteOK, We Work Remotely |
| 2 | Active scraping — company pages | Safaricom, KCB, Equity, NCBA, KRA, Cellulant, GitLab, Stripe, Vercel, and more |
| 3 | Active scraping — user-added URLs | Any careers page you paste in Options |
| 4 | Passive reading | Any job page you browse to (LinkedIn, Indeed, etc.) |

---

## Folder structure

```
kazi-alert/
├── manifest.json
├── popup/                        # Extension popup — stats, Scan Now button
├── options/                      # Settings page — CV, email, API keys, tracker
├── offscreen/                    # Offscreen document for DOM-based HTML/RSS parsing
├── background/
│   ├── service-worker.js         # Orchestrates scans, alarms, message bus
│   ├── scraper.js                # Active scraping — tiers 1, 2, 3
│   ├── groq-matcher.js           # AI CV matching via Groq (rate-limited, retries)
│   ├── email-sender.js           # Resend integration — per-job and digest HTML emails
│   ├── sheets-logger.js          # Google Sheets job tracker via Apps Script
│   └── deduplicator.js           # Never alerts on the same job twice
├── content-scripts/
│   ├── job-extractor.js          # Generic passive reader — any job page
│   └── linkedin-reader.js        # LinkedIn SPA passive reader
├── sites/
│   ├── job-boards.js             # Tier 1 board configs and parsers
│   ├── company-pages.js          # Tier 2 curated company career pages
│   └── selector-detector.js      # Auto-detects job listings on unknown pages
└── utils/
    ├── storage.js                # chrome.storage helpers and key constants
    ├── cv-parser.js              # PDF extraction (incl. FlateDecode compressed PDFs)
    ├── job-parser.js             # Job data normalisation
    └── logger.js                 # Persistent scan log written to storage
```

---

## Technical notes

- **PDF parsing** — uses `DecompressionStream` (Chrome native) to handle FlateDecode-compressed PDFs, so modern Word/Google Docs exports work in the drop zone
- **HTML/RSS scraping** — runs in an offscreen document (`offscreen/`) which has full DOM access, solving the `DOMParser is not defined` issue in MV3 service workers
- **Groq rate limiting** — keywords from your CV are used to pre-rank all scraped jobs; only the top 40 most relevant go to Groq, with a 5-second delay between calls to stay under the free-tier 12k TPM limit
- **Google Sheets** — uses GET requests with URL params to avoid the 302 redirect stripping POST bodies; Apps Script reads `e.parameter` in `doGet`

---

## Privacy

Your CV is stored only in `chrome.storage.local` on your device. It is sent to Groq solely for job matching — no other third party receives it. Resend receives only the job alert content and your alert email address. Your Google Sheet is accessed only via your own Apps Script — no third party touches it.

---

## Roadmap

- **v1** — Chrome Web Store free release (current)
- **v2** — WhatsApp alerts via Africa's Talking, multi-CV profiles, freemium model
