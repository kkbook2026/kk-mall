'use strict';
/*
 * TRUST PASS - chay doc lap: ap Bo loc Tin cay + lich su 90 ngay + Merkle root len du lieu dang co,
 * KHONG doi gia, KHONG them ban ghi so cai. Dung khi nang cap thuat toan giua 2 lan thu thap.
 *   node collector/trust-pass.js
 */
const fs = require('fs');
const path = require('path');
const T = require('./trust');
const { publish } = require('./publish');

const API = path.join(__dirname, '..', 'site', 'api');
const rj = f => JSON.parse(fs.readFileSync(path.join(API, f), 'utf8'));
const now = new Date().toISOString();
const meta = rj('meta.json');
const pub = rj('catalog-full.json');
const seq = (meta.ledgerHead && meta.ledgerHead.seq) || 0;
const FIDX = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'feed-index.json'), 'utf8')); } catch { return { origin: {} }; } })();
const docs = new Map(), leaves = [], recent = [];
for (const p of pub) {
  const f = path.join(API, 'products', p.sku + '.json');
  if (!fs.existsSync(f)) continue;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const cn = T.cleanText(d.name); if (cn !== d.name || cn !== p.name) { d.name = cn; p.name = cn; }
  if (!Array.isArray(d.d90) || !d.d90.length) d.d90 = T.seedD90(d);
  const ev = T.evaluate(d);
  if ((p.fl || 0) & T.FL.NO_SOURCE) ev.fl |= T.FL.NO_SOURCE;
  if (!FIDX.origin[p.sku] && (p.sold || d.sold)) { p.sold = 0; d.sold = 0; } // so 'da ban' du lieu mau cu khong xac thuc // giu dung ket luan cua bo thu thap (feed hien hanh + nguon goc)
  d.trust = { disc: ev.disc, fl: ev.fl, why: ev.why };
  if ((ev.fl & T.FL.USED) && /mới 100%/i.test(d.description || '')) d.description = String(d.description).replace(/chính hãng, mới 100%(, đầy đủ phụ kiện)?/i, 'đã qua sử dụng, tình trạng đúng như tên gọi').replace(/mới 100%/ig, 'đã qua sử dụng');
  p.disc = ev.disc; p.fl = ev.fl;
  leaves.push({ sku: p.sku, head: d.ledger && d.ledger.length ? d.ledger[d.ledger.length - 1].hash : 'GENESIS-' + p.sku });
  const L = d.ledger || []; if (L.length) { const e = L[L.length - 1]; recent.push({ sku: p.sku, name: p.name, kk: e.kk_price, prev: L.length > 1 ? L[L.length - 2].kk_price : null, s: e.s, seq: e.seq, hash: e.hash, at: e.at }); }
  docs.set(p.sku, { f, d });
}
const mk = T.merkle(leaves);
let bad = 0;
for (const [sku, { f, d }] of docs) {
  d.mp = mk.proofs[sku]; d.mr = mk.root; d.mat = now;
  if (Math.random() < 0.01 && !T.verifyProof(sku, leaves.find(l => l.sku === sku).head, d.mp, mk.root)) bad++;
  fs.writeFileSync(f, JSON.stringify(d));
}
if (bad) { console.error('MERKLE PROOF SAI:', bad); process.exit(1); }
// giu nguyen thoi diem dong bo gia that (pass nay khong thu thap gia)
const keepSync = meta.lastSync;
const r = publish({ API, pub, meta, now, seq, mk, recent: recent.sort((a, b) => b.seq - a.seq) });
meta.lastSync = keepSync; fs.writeFileSync(path.join(API, 'meta.json'), JSON.stringify(meta));
console.log('Trust pass xong:', r.stats, 'root', mk.root);
