'use strict';
/*
 * KIEM DINH BO SAN GIA (chay tay, tam thoi): xuat bo nho dem san gia de ra soat do khop ma (ten tren website <-> san pham KK-MALL) truoc khi cho
 * nguon moi tham gia dinh gia. Ket qua MA HOA bang khoa cong khai cua phien kiem dinh (RSA-OAEP-SHA256 + AES-256-GCM + gzip): nguoi ngoai khong doc duoc.
 * Nhat ky cong khai chi co so dem. Dung: AUDIT_PUBKEY=<PEM base64> node tools/hunt-audit.js <tep_ra>
 * (c) 2026 Nguyen Duy Dien. All rights reserved.
 */
const fs = require('fs'), zlib = require('zlib'), crypto = require('crypto'), path = require('path');
const HUNT = require(path.join(__dirname, '..', 'collector', 'hunt.js'));
const out = process.argv[2] || 'hunt-audit.enc.json';
const pub = Buffer.from(String(process.env.AUDIT_PUBKEY || ''), 'base64').toString('utf8');
if (!/BEGIN PUBLIC KEY/.test(pub)) { console.error('Thieu AUDIT_PUBKEY'); process.exit(1); }
const C = HUNT.loadAll(process.env), SITES = HUNT.sitesOf(process.env), now = Date.now(), rows = [], live = {};
for (const [k, o] of Object.entries(C.offers)) { const i = k.indexOf('|'), src = k.slice(0, i), p = k.slice(i + 1), S = SITES[src], st = C.sites[src] || {}; if (!S) continue;
  if (S.mode === 'feed') { const T = (st.t || {})[p]; if (!T) continue; const e = live[src] = live[src] || { n: 0, cheaper: 0, same: 0, up: 0, gone: 0, miss: 0, rows: [] };
    e.n++; if (o.e) e.miss++; else if (o.g) e.gone++; else if (o.p < T[3]) e.cheaper++; else if (o.p > T[3]) e.up++; else e.same++;
    if (e.rows.length < 4000) e.rows.push([p, T[0], T[3], o.p || 0, o.s || 0, o.g || 0, o.e || '', T[4]]); }
  else rows.push([src, p, o.n || '', o.p || 0, o.s || 0, o.e || '', Math.round((now - o.at) / 3600e3), (st.m || {})[p] || []]); }
const data = { at: new Date(now).toISOString(), stat: HUNT.siteStat(process.env), rows, live };
const plain = zlib.gzipSync(JSON.stringify(data)), aes = crypto.randomBytes(32), iv = crypto.randomBytes(12);
const c = crypto.createCipheriv('aes-256-gcm', aes, iv), ct = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
const ek = crypto.publicEncrypt({ key: pub, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, aes);
fs.writeFileSync(out, JSON.stringify({ v: 1, alg: 'RSA-OAEP-SHA256+AES-256-GCM+gzip', ek: ek.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64') }));
console.log(`Kiem dinh san gia: ${rows.length} trang che do 'map' · ${Object.values(live).reduce((a, e) => a + e.n, 0)} trang che do 'feed' · goi ma hoa ${(ct.length / 1024).toFixed(0)} KB`);
