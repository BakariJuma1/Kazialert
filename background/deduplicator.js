import { Storage, STORAGE_KEYS } from '../utils/storage.js';

const MAX_SEEN = 10000;

export const Deduplicator = {
  async getSeenIds() {
    return Storage.getOne(STORAGE_KEYS.SEEN_JOBS, []);
  },

  async isNew(jobId) {
    const seen = await this.getSeenIds();
    return !seen.includes(jobId);
  },

  async filterNew(jobs) {
    const seen = new Set(await this.getSeenIds());
    return jobs.filter(j => j.id && !seen.has(j.id));
  },

  async markSeen(jobIds) {
    if (!jobIds.length) return;
    const seen = await this.getSeenIds();
    const updated = [...new Set([...seen, ...jobIds])];
    await Storage.setOne(STORAGE_KEYS.SEEN_JOBS, updated.slice(-MAX_SEEN));
  },
};
