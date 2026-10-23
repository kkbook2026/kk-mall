'use strict';
/*
 * NHAT KY CAP NHAT HANG HOA - dung chung cho bo thu thap 3 gio va cong cu phat hanh thu cong.
 * Lich su nam TRONG goi quan tri ma hoa (site/admin/data.enc): moi lan chay giai ma goi cu,
 * noi them 1 ban ghi, ma hoa lai. Nguoi ngoai khong doc duoc.
 * (c) Nguyen Duy Dien (KK-2026). All rights reserved.
 */
const fs = require('fs');
const crypto = require('crypto');

const MAX_ENTRIES = 1500;   // ~6 thang o chu ky 3 gio
const KEEP_TOP = 96;        // giu danh sach "thay doi lon nhat" cho 96 ban ghi gan nhat (~2 ngay)

function encrypt(obj, key) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const k = crypto.pbkdf2Sync(key, salt, 300000, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj), 'utf8')), c.final(), c.getAuthTag()]);
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: 300000, salt: salt.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64') };
}

function decryptFile(file, key) {
  try {
    if (!file || !fs.existsSync(file)) return null;
    const e = JSON.parse(fs.readFileSync(file, 'utf8'));
    const k = crypto.pbkdf2Sync(key, Buffer.from(e.salt, 'base64'), e.iter || 300000, 32, 'sha256');
    const buf = Buffer.from(e.ct, 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(e.iv, 'base64'));
    d.setAuthTag(buf.subarray(buf.length - 16));
    return JSON.parse(Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString('utf8'));
  } catch { return null; }   // khoa doi / goi hong -> bat dau lich su moi
}

/* Noi ban ghi moi vao lich su (moi nhat dung dau), gioi han kich thuoc */
function append(prev, entries) {
  const list = [...[].concat(entries).filter(Boolean), ...(Array.isArray(prev) ? prev : [])];
  const seen = new Set();
  const out = list.filter(e => { const id = e.t + '|' + e.at; if (seen.has(id)) return false; seen.add(id); return true; })
    .sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, MAX_ENTRIES);
  out.forEach((e, i) => { if (i >= KEEP_TOP && e.top) delete e.top; });
  return out;
}

/* Bo dem cho 1 lan quet tu dong */
function newRun() {
  return { cats: {}, grps: {}, top: [], n: 0, up: 0, down: 0, oos: 0, back: 0 };
}
function track(run, p, oldPrice, newPrice, oldStock, newStock) {
  const cat = p.category_name || p.catName || 'Khác', grp = p.grp || 'Khác';
  const c = run.cats[cat] = run.cats[cat] || [0, 0, 0, 0, 0]; // [quet, tang, giam, het hang, co hang lai]
  run.n++; c[0]++;
  let ch = false;
  if (newPrice > oldPrice) { run.up++; c[1]++; ch = true; }
  else if (newPrice < oldPrice) { run.down++; c[2]++; ch = true; }
  if (oldStock && !newStock) { run.oos++; c[3]++; ch = true; }
  if (!oldStock && newStock) { run.back++; c[4]++; ch = true; }
  if (ch) run.grps[grp] = (run.grps[grp] || 0) + 1;
  if (newPrice !== oldPrice && oldPrice > 0) run.top.push([p.sku, p.name, grp, oldPrice, newPrice]);
}
function finish(run, extra) {
  run.top = run.top.sort((a, b) => Math.abs(b[4] - b[3]) / b[3] - Math.abs(a[4] - a[3]) / a[3]).slice(0, 15);
  return Object.assign({ t: 'auto' }, extra, run);
}

module.exports = { encrypt, decryptFile, append, newRun, track, finish };
