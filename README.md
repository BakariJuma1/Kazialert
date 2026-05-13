# Kazi Alert

AI-powered job matching Chrome extension. Monitors job boards and company career pages, matches listings against your CV using Groq AI, and emails you only the jobs you actually fit.

Built by **Isaac Bakari Juma** · Jaribu Tech Solutions

---

## What it does

- Scrapes **Tier 1** job boards (PSC Kenya, Fuzu, BrighterMonday, Jobmag, RemoteOK, We Work Remotely, Himalayas, Wellfound) on a schedule
- Scrapes **Tier 2** curated company career pages (Safaricom, KCB, Andela, Google, GitLab, and 30+ others)
- Scrapes **Tier 3** any career page URL you add manually
- **Passively reads** any job page you browse to (LinkedIn, Indeed, anywhere)
- Sends job + CV to **Groq (Llama 3)** — returns a match score, why you fit, and honest gaps
- Emails alerts via **EmailJS** — only jobs above your match threshold

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

### EmailJS (free — 200 emails/month)

1. Sign up at [emailjs.com](https://www.emailjs.com)
2. Add an email service (connect Gmail or Outlook) → copy the **Service ID**
3. Create two email templates (one per-job, one for digest mode — see below) → copy each **Template ID**
4. Copy your **Public Key** from Account → API Keys

Paste all three into **Options → API Keys**.

#### Per-job email template variables

```
{{to_email}}  {{job_title}}  {{company}}  {{source}}
{{match_score}}  {{why_fit}}  {{gaps}}  {{recommendation}}
{{deadline}}  {{apply_link}}  {{location}}  {{job_type}}  {{posted_at}}
```

Subject: `Kazi Alert — {{match_score}} match: {{job_title}} at {{company}}`

#### Digest email template variables

```
{{to_email}}  {{match_count}}  {{jobs_list}}
```

Subject: `Kazi Alert — {{match_count}} new job matches`

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

---

## Job sources

| Tier | Type | Examples |
|---|---|---|
| 1 | Active scraping — job boards | PSC Kenya, Fuzu, BrighterMonday, Jobmag, Himalayas, RemoteOK, We Work Remotely, Wellfound |
| 2 | Active scraping — company pages | Safaricom, KCB, Equity, Andela, KRA, IRC, Google, Microsoft, Meta, GitLab, Stripe, and more |
| 3 | Active scraping — user-added URLs | Any careers page you paste in Options |
| 4 | Passive reading | Any job page you browse to (LinkedIn, Indeed, etc.) |

---

## Folder structure

```
kazi-alert/
├── manifest.json              # MV3 config
├── popup/                     # Extension popup — status, Check Now button
├── options/                   # Settings page — CV, email, API keys, preferences
├── background/
│   ├── service-worker.js      # Orchestrates scans, alarms, message bus
│   ├── scraper.js             # Active scraping — tiers 1, 2, 3
│   ├── groq-matcher.js        # AI CV matching via Groq
│   ├── email-sender.js        # EmailJS integration — per-job and digest
│   └── deduplicator.js        # Never alerts on the same job twice
├── content-scripts/
│   ├── job-extractor.js       # Generic passive reader — any job page
│   └── linkedin-reader.js     # LinkedIn SPA passive reader
├── sites/
│   ├── job-boards.js          # Tier 1 board configs and parsers
│   ├── company-pages.js       # Tier 2 curated company career pages
│   └── selector-detector.js   # Auto-detects job listings on unknown pages
└── utils/
    ├── storage.js             # chrome.storage helpers and key constants
    ├── cv-parser.js           # PDF and text CV extraction
    └── job-parser.js          # Job data normalisation
```

---

## Privacy

Your CV is stored only in `chrome.storage.local` on your device. It is sent to Groq solely for job matching — no other third party receives it. EmailJS receives only the job alert content and your alert email address.

---

## Roadmap

- **v1** — Chrome Web Store free release (current)
- **v2** — Flask backend, WhatsApp alerts via Africa's Talking, application tracker, multi-CV profiles, freemium model
