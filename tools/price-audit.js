'use strict';
/*
 * KIEM TOAN GIA (chay tay tren GitHub Actions) - thu du lieu that de ra soat "KK-MALL co re nhat + phi nen tang khong".
 * - Dem tong so SP moi san tren AccessTrade datafeed, tai feed (tran AUDIT_MAX/san), thu API tim kiem TikTok Shop.
 * - Giai ma goi quan tri (offer tung SP) + bo nho dem gia ban le.
 * - TOAN BO ket qua duoc MA HOA bang khoa cong khai RSA cua phien kiem toan (AUDIT_PUBKEY, base64 PEM):
 *   AES-256-GCM ngau nhien, khoa AES boc bang RSA-OAEP-SHA256. Log cong khai chi in so dem, khong in gia/nguon.
 * Dung: AUDIT_PUBKEY=... ACCESSTRADE_KEY=... ADMIN_PORTAL_KEY=... node tools/price-audit.js out.enc.json
 * (c) 2026 Nguyen Duy Dien
 */
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const ULOG = require('../collector/update-log');
const FEEDS = require('../collector/feeds');
const RETAIL = require('../collector/retail');

const AT = 'https://api.accesstrade.vn';
const DOMAINS = { 'tiki.vn': 'tiki', 'shopee.vn': 'shopee', 'lazada.vn': 'lazada', 'sendo.vn': 'sendo', 'tiktok.com': 'tiktok',
  'thegioididong.com': 'thegioididong', 'dienmayxanh.com': 'dienmayxanh', 'fptshop.com.vn': 'fptshop', 'cellphones.com.vn': 'cellphones', 'dienmaycholon.vn': 'dienmaycholon' };
const KEY = String(process.env.ACCESSTRADE_KEY || '').trim();
const MAX = parseInt(process.env.AUDIT_MAX || '30000', 10);

async function atGet(url) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 60000);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { Authorization: 'Token ' + KEY, 'Content-Type': 'application/json' } });
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt.replace(/:\s*(NaN|-?Infinity|undefined)\b/g, ': null')); } catch { }
    return { status: r.status, j, head: j ? '' : txt.slice(0, 300) };
  } catch (e) { return { status: 0, j: null, head: String(e.message || e).slice(0, 200) }; }
  finally { clearTimeout(t); }
}
const slim = d => ({ n: d.name, p: d.price, d: d.discount, i: d.image, u: d.url, c: d.cate, s: d.sku || d.product_id, t: d.update_time, m: d.merchant || d.campaign, sd: d.status_discount });

(async () => {
  const out = { at: new Date().toISOString(), totals: {}, feed: {}, probes: {} };
  const log = (...a) => console.log(...a);
  if (KEY) {
    /* 1) Tong so SP tung san */
    for (const dom of Object.keys(DOMAINS)) {
      const r = await atGet(`${AT}/v1/datafeeds?domain=${dom}&page=1&limit=1`);
      out.totals[dom] = { status: r.status, total: r.j && r.j.total, head: r.head };
      log('total', dom, r.status, r.j && r.j.total);
    }
    /* 2) Tai feed (moi san tuan tu tung trang, 4 san song song) */
    const doms = Object.keys(DOMAINS); let k = 0;
    await Promise.all(Array.from({ length: 4 }, async () => { while (k < doms.length) { const dom = doms[k++]; const arr = []; let errs = 0;
      const tot = Math.min(MAX, (out.totals[dom] && out.totals[dom].total) || MAX);
      for (let page = 1; arr.length < tot && errs < 3; page++) {
        const r = await atGet(`${AT}/v1/datafeeds?domain=${dom}&page=${page}&limit=200`);
        const data = (r.j && r.j.data) || [];
        if (r.status !== 200) { errs++; page--; await new Promise(z => setTimeout(z, 3000)); continue; }
        for (const d of data) arr.push(slim(d));
        if (data.length < 200) break;
      }
      out.feed[dom] = arr; log('feed', dom, arr.length);
    } }));
    /* 3) Thu API tim kiem theo tu khoa (TikTok Shop v2/v1) */
    const kws = ['nồi chiên không dầu philips', 'tai nghe bluetooth', 'iphone 15 128gb', 'sữa rửa mặt cerave'];
    for (const kw of kws) {
      const q = encodeURIComponent(kw);
      const r2 = await atGet(`${AT}/v2/tiktokshop_product_feeds?title_keywords=${q}&sort_field=LOW_PRICE&limit=20`);
      const r1 = await atGet(`${AT}/v1/tiktokshop_product_feeds?title_keywords=${q}&limit=20`);
      out.probes[kw] = { v2: { status: r2.status, j: r2.j, head: r2.head }, v1: { status: r1.status, j: r1.j, head: r1.head } };
      log('probe', kw, 'v2', r2.status, r2.j && r2.j.data && r2.j.data.products ? r2.j.data.products.length : '-', 'v1', r1.status);
    }
    const r3 = await atGet(`${AT}/v1/top_products?merchant=shopee`);
    out.probes.top_shopee = { status: r3.status, n: r3.j && r3.j.data ? r3.j.data.length : null, j: r3.j };
    const r4 = await atGet(`${AT}/v1/campaigns?approval=successful&limit=100`);
    out.probes.campaigns = { status: r4.status, j: r4.j };
    log('top_products', r3.status, 'campaigns', r4.status);
  } else log('Thieu ACCESSTRADE_KEY');
  /* 4) Goi quan tri (offer tung SP) */
  const AKEY = String(process.env.ADMIN_PORTAL_KEY || '').trim();
  const adm = AKEY ? ULOG.decryptFile(path.join(__dirname, '..', 'site', 'admin', 'data.enc'), AKEY) : null;
  out.admin = adm ? { rows: adm.rows, updates: (adm.updates || []).slice(-5) } : null;
  log('admin rows', adm ? adm.rows.length : 0);
  /* 5) Gia ban le */
  try { out.retail = [...RETAIL.rows(FEEDS)].map(r => ({ n: r.name, p: r.price, src: r.src, u: r.url, st: r.stale ? 1 : 0, c: r.cat })); } catch (e) { out.retail = []; out.retailErr = String(e.message || e); }
  log('retail', out.retail.length);
  out.pricing = String(process.env.PRICING_TIERS || '');
  /* 6) Ma hoa lai */
  const pub = Buffer.from(String(process.env.AUDIT_PUBKEY || ''), 'base64').toString('utf8');
  if (!/BEGIN PUBLIC KEY/.test(pub)) throw new Error('Thieu AUDIT_PUBKEY');
  const plain = zlib.gzipSync(Buffer.from(JSON.stringify(out)));
  const aes = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', aes, iv);
  const ct = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
  const ek = crypto.publicEncrypt({ key: pub, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, aes);
  fs.writeFileSync(process.argv[2] || 'audit.enc.json', JSON.stringify({ v: 1, ek: ek.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64') }));
  log('Da ma hoa', (ct.length / 1048576).toFixed(1) + 'MB');
})().catch(e => { console.error('AUDIT LOI:', e.message); process.exit(1); });
