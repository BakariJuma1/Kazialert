import { Storage } from './storage.js';

const LOGS_KEY = 'scan_logs';
const MAX_LOGS = 150;

export const Logger = {
  info(msg)  { this._write('info',  msg); console.log(`[Kazi Alert] ${msg}`); },
  warn(msg)  { this._write('warn',  msg); console.warn(`[Kazi Alert] ${msg}`); },
  error(msg) { this._write('error', msg); console.error(`[Kazi Alert] ${msg}`); },

  _write(level, msg) {
    const entry = { ts: new Date().toISOString(), level, msg };
    Storage.getOne(LOGS_KEY, [])
      .then(logs => {
        logs.unshift(entry);
        return Storage.setOne(LOGS_KEY, logs.slice(0, MAX_LOGS));
      })
      .catch(() => {});
  },

  async getLogs()  { return Storage.getOne(LOGS_KEY, []); },
  async clearLogs(){ return Storage.setOne(LOGS_KEY, []); },
};
