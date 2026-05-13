export const STORAGE_KEYS = {
  CV: 'cv_text',
  EMAIL: 'alert_email',
  GROQ_KEY: 'groq_api_key',
  EMAILJS_SERVICE: 'emailjs_service_id',
  EMAILJS_TEMPLATE: 'emailjs_template_id',
  EMAILJS_USER: 'emailjs_user_id',
  CHECK_INTERVAL: 'check_interval_hours',
  MATCH_THRESHOLD: 'match_threshold_pct',
  LOCATION_FILTER: 'location_filter',
  JOB_TYPE_FILTER: 'job_type_filter',
  CUSTOM_URLS: 'custom_urls',
  DIGEST_MODE: 'digest_mode',
  EMAILJS_DIGEST_TEMPLATE: 'emailjs_digest_template_id',
  SEEN_JOBS: 'seen_job_ids',
  MATCHED_JOBS: 'matched_jobs',
  LAST_CHECK: 'last_check_time',
  STATS: 'stats',
};

export const DEFAULTS = {
  CHECK_INTERVAL: 6,
  MATCH_THRESHOLD: 60,
  LOCATION_FILTER: 'both',
  JOB_TYPE_FILTER: 'all',
  DIGEST_MODE: false,
  CUSTOM_URLS: [],
  STATS: { totalMatched: 0, emailsSentWeek: 0, weekStart: null },
};

export const Storage = {
  async get(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(result);
      });
    });
  },

  async set(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  },

  async getOne(key, defaultValue = null) {
    const result = await this.get([key]);
    return result[key] !== undefined ? result[key] : defaultValue;
  },

  async setOne(key, value) {
    return this.set({ [key]: value });
  },

  async remove(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  },
};
