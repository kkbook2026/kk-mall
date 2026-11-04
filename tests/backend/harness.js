/*
 * KK-MALL - Bo moi truong gia lap Google Apps Script de kiem thu backend/Code.gs bang Node (khong can trien khai).
 * Gia lap: PropertiesService, CacheService, LockService, Utilities, SpreadsheetApp (bang tinh trong bo nho),
 * MailApp (ghi vao hop thu gia), UrlFetchApp, ScriptApp, DriveApp, ContentService, Logger.
 * Dung: const { load } = require('./harness'); const gas = load(); gas.fn('policy_')()
 * (c) 2026 Nguyen Duy Dien. All rights reserved.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

function makeEnv(opts = {}) {
  const props = Object.assign({ SHEET_ID: 'sheet-test', WEBHOOK_KEY: 'wh-test', STATS_KEY: 'st-test', PEPPER: 'pepper-test', PRICING_TIERS: '500001:32000,200000:26000,0:18000' }, opts.props || {});
  const cache = new Map(); // key -> { v, exp }
  let now = opts.now || Date.now();
  const clock = { now: () => now, set: t => { now = t; }, add: ms => { now += ms; } };
  const mails = [];
  const sheets = {}; // name -> rows (array of arrays), row 0 = header

  const Sheet = name => ({
    getName: () => name,
    appendRow: r => { sheets[name].push(r.slice()); },
    setFrozenRows: () => {},
    getDataRange: () => ({ getValues: () => sheets[name].map(r => r.slice()) }),
    getLastRow: () => sheets[name].length,
    getRange: (row, col, nrow, ncol) => ({
      getValues: () => sheets[name].slice(row - 1, row - 1 + (nrow || 1)).map(r => { const out = []; for (let j = 0; j < (ncol || r.length); j++) out.push(r[col - 1 + j] === undefined ? '' : r[col - 1 + j]); return out; }),
      setValues: vals => { vals.forEach((v, i) => { const r = sheets[name][row - 1 + i] = sheets[name][row - 1 + i] || []; v.forEach((x, j) => { r[col - 1 + j] = x; }); }); },
      setValue: v => { (sheets[name][row - 1] = sheets[name][row - 1] || [])[col - 1] = v; },
      getValue: () => (sheets[name][row - 1] || [])[col - 1]
    }),
    deleteRow: r => { sheets[name].splice(r - 1, 1); },
    clear: () => { sheets[name] = sheets[name].slice(0, 1); }
  });
  const Spreadsheet = {
    getSheetByName: n => sheets[n] ? Sheet(n) : null,
    insertSheet: n => { sheets[n] = sheets[n] || []; return Sheet(n); },
    getSheets: () => Object.keys(sheets).map(Sheet),
    getUrl: () => 'https://sheets.test/' + props.SHEET_ID, getId: () => props.SHEET_ID
  };
  const hex = buf => Buffer.from(buf).toString('hex');
  const bytes = buf => Array.from(Buffer.from(buf)).map(b => (b > 127 ? b - 256 : b)); // GAS tra byte co dau
  const g = {
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (props[k] === undefined ? null : String(props[k])), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; }, getProperties: () => Object.assign({}, props) }) },
    CacheService: { getScriptCache: () => ({
      get: k => { const e = cache.get(k); if (!e) return null; if (e.exp && e.exp < clock.now()) { cache.delete(k); return null; } return e.v; },
      put: (k, v, sec) => { cache.set(k, { v: String(v), exp: sec ? clock.now() + sec * 1000 : 0 }); },
      remove: k => { cache.delete(k); }
    }) },
    LockService: { getScriptLock: () => ({ waitLock: () => true, tryLock: () => true, releaseLock: () => {}, hasLock: () => true }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => bytes(crypto.createHash(alg).update(String(s), 'utf8').digest()),
      computeHmacSha256Signature: (msg, key) => bytes(crypto.createHmac('sha256', String(key)).update(String(msg), 'utf8').digest()),
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, tz, fmt) => {
        const dt = new Date(d); const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(dt);
        const m = {}; p.forEach(x => { m[x.type] = x.value; }); if (m.hour === '24') m.hour = '00';
        return fmt.replace('yyyy', m.year).replace('MM', m.month).replace('dd', m.day).replace('HH', m.hour).replace('mm', m.minute).replace('ss', m.second);
      },
      base64Encode: s => Buffer.from(s).toString('base64'), base64Decode: s => bytes(Buffer.from(s, 'base64')), base64DecodeWebSafe: s => bytes(Buffer.from(s, 'base64url')),
      newBlob: (d, t, n) => ({ getBytes: () => d, getContentType: () => t, getName: () => n, getDataAsString: () => String(d) }), sleep: () => {}
    },
    SpreadsheetApp: { openById: () => Spreadsheet, create: () => Spreadsheet },
    MailApp: { sendEmail: m => { mails.push(m); }, getRemainingDailyQuota: () => 100 },
    GmailApp: { search: () => [] },
    UrlFetchApp: { fetch: (url, o) => ({ getResponseCode: () => 200, getContentText: () => '{}' }) },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.test/exec' }), getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyHours: () => ({ create: () => {} }), everyMinutes: () => ({ create: () => {} }), atHour: () => ({ everyDays: () => ({ create: () => {} }) }) }) }), deleteTrigger: () => {} },
    DriveApp: { createFolder: () => ({ getId: () => 'f', createFolder: () => ({ getId: () => 'f2' }) }), getFolderById: () => ({ createFile: () => ({ getId: () => 'x' }), getFiles: () => ({ hasNext: () => false }) }), getFileById: () => ({ moveTo: () => {} }) },
    ContentService: { createTextOutput: s => ({ setMimeType: () => ({ text: s }), text: s }), MimeType: { JSON: 'json' } },
    Logger: { log: () => {} },
    Date: class extends Date { constructor(...a) { if (!a.length) super(clock.now()); else super(...a); } static now() { return clock.now(); } }
  };
  g.globalThis = g;
  return { g, props, cache, clock, mails, sheets, Sheet };
}

function load(opts = {}) {
  const env = makeEnv(opts);
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'backend', 'Code.gs'), 'utf8');
  const ctx = vm.createContext(env.g);
  vm.runInContext(src, ctx, { filename: 'Code.gs' });
  // khoi tao bang nhu setup(): tao cac sheet voi dong tieu de
  const SHEETS = vm.runInContext('SHEETS', ctx);
  Object.keys(SHEETS).forEach(n => { env.sheets[n] = [SHEETS[n].slice()]; });
  const fn = name => vm.runInContext(name, ctx);
  return Object.assign(env, { ctx, fn, call: (name, ...args) => fn(name)(...args) });
}

module.exports = { load, makeEnv };
