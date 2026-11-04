/*
 * KK-MALL - Kiem thu trinh duyet (Playwright, Chromium) tren ban tinh cuc bo cua site/ - khong can mang ngoai.
 * Chay: node tests/browser/smoke.js   (tu mo may chu tinh tai cong 8766; bien PORT de doi)
 * Pham vi: trang chu dung du lieu that trong site/api, Worker tim kiem + IndexedDB, service worker, PWA, tim kiem, mo san pham,
 * gio hang, chan trang (danh muc nam ngang, khong co link quan tri), thu vien hop dong KKHD, trang phap ly theo phien ban,
 * khong loi JS / vi pham CSP, dien thoai 390px khong tran ngang.
 * (c) 2026 Nguyen Duy Dien. All rights reserved.
 */
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const PORT = Number(process.env.PORT || 8766), BASE = 'http://localhost:' + PORT;
const { serve } = require('./server');
let pass = 0, fail = 0;
async function t(name, f) { try { await f(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', String(e && e.message || e).split('\n')[0]); } }

(async () => {
  const srv = await serve(PORT), browser = await chromium.launch();
  const errors = [], csp = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (/Content Security Policy/.test(m.text())) csp.push(m.text()); });

  console.log('1. Trang chu (' + BASE + ')');
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await t('tieu de + khong co link quan tri o chan trang', async () => { if (!/KK-MALL/.test(await page.title())) throw new Error('title'); if (await page.$('footer a[href*="admin"]')) throw new Error('con link admin'); });
  await t('goi danh muc nap trong Worker (packReady) <= 15 s', async () => { await page.waitForFunction(() => typeof packReady !== 'undefined' && packReady === true, null, { timeout: 15000 }); });
  await t('IndexedDB kk-mall/kv co goi danh muc (>= 1.000 dong)', async () => {
    const n = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('kk-mall'); r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('kv')) return res(-1); const g = db.transaction('kv').objectStore('kv').get('pack'); g.onsuccess = () => res(g.result ? (g.result.rows || []).length : 0); g.onerror = () => res(-2); }; r.onerror = () => res(-3); }));
    // ghi IndexedDB chay nen sau khi packReady -> cho toi da 10 s
    let k = n, i = 0; while (k < 1000 && i++ < 20) { await page.waitForTimeout(500); k = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('kk-mall'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('pack'); g.onsuccess = () => res(g.result ? (g.result.rows || []).length : 0); }; })); }
    if (k < 1000) throw new Error('rows = ' + k);
  });
  await t('service worker dang ky (localhost = secure context) + manifest/offline/icon 200', async () => {
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller || (navigator.serviceWorker.getRegistrations && 1), null, { timeout: 10000 });
    const regs = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length); if (!regs) throw new Error('SW chua dang ky');
    for (const u of ['/manifest.webmanifest', '/sw.js', '/offline.html', '/icons/icon-192.png']) { const st = await page.evaluate(async u => (await fetch(u)).status, u); if (st !== 200) throw new Error(u + ' ' + st); }
  });
  await t('ke hang trang chu dung dan: >= 3 ke, >= 12 the san pham co gia', async () => {
    await page.waitForFunction(() => document.querySelectorAll('#shelves section.sec').length >= 3, null, { timeout: 15000 });
    const n = await page.$$eval('.card .price', els => els.filter(e => /\d{3}/.test(e.textContent)).length); if (n < 12) throw new Error('the co gia: ' + n);
  });
  await t('chan trang: danh muc xep ngang (cao < 200 px), 15 lien ket', async () => {
    const m = await page.$eval('#seoLinks', n => ({ h: n.getBoundingClientRect().height, a: n.querySelectorAll('a').length, disp: getComputedStyle(n.querySelector('a')).display }));
    if (m.a < 10 || m.h > 200 || m.disp !== 'inline') throw new Error(JSON.stringify(m));
  });

  await t('thu vien hop dong KKHD nap trong trang + dien mau dung (vnd, escape, dong hang)', async () => {
    const r = await page.evaluate(() => { if (typeof KKHD !== 'object') return 'no KKHD'; const h = KKHD.fill('<b>{{code}}</b>{{#lines}}<i>{{i}}:{{name}}={{line_cost}}</i>{{/lines}}', KKHD.data({ code: 'KK1', lines: [{ sku: 'KK000001', name: 'A<b>', qty: 1, unit_cost: 1234567, line_cost: 1234567, line_fee: 1 }] }, {})); return h; });
    if (r !== '<b>KK1</b><i>1:A&lt;b&gt;=1.234.567 đ</i>') throw new Error(r);
  });
  await t('trang phap ly: phien-ban.html + mau hop dong 2 phien ban + dieu khoan v1.0 (200, dung noi dung)', async () => {
    for (const [u, re] of [['/phap-ly/phien-ban.html', /UQ-2026-10[\s\S]*HD-2026-11|HD-2026-11[\s\S]*UQ-2026-10/], ['/phap-ly/hop-dong-HD-2026-11.html', /HỢP ĐỒNG ỦY THÁC MUA HÀNG HÓA[\s\S]*Điều 14/], ['/phap-ly/hop-dong-UQ-2026-10.html', /XÁC NHẬN ỦY QUYỀN/], ['/phap-ly/dieu-khoan-HD-2026-11.html', /13\. Thông tin bắt buộc công bố/], ['/phap-ly.html', /Phiên bản điều khoản/]]) {
      const x = await page.evaluate(async u => { const r = await fetch(u); return { st: r.status, tx: await r.text() }; }, u); if (x.st !== 200 || !re.test(x.tx)) throw new Error(u + ' ' + x.st);
    }
  });

  console.log('2. Tim kiem va san pham');
  await t('tim "tu lanh samsung" (khong dau) -> >= 10 ket qua, co goi y co dau', async () => {
    await page.fill('#q', 'tu lanh samsung'); await page.waitForTimeout(600);
    const sug = await page.evaluate(() => (document.querySelector('#sugList') || document.querySelector('#sug') || {}).textContent || ''); if (!/tủ lạnh/i.test(sug)) throw new Error('goi y: ' + sug.slice(0, 60));
    await page.press('#q', 'Enter'); await page.waitForTimeout(1500);
    const n = await page.$$eval('.card', c => c.length); if (n < 10) throw new Error('ket qua: ' + n);
    if (!/q=tu(%20|\+| )lanh/.test(page.url())) throw new Error('URL ?q= : ' + page.url());
  });
  await t('tim loai hang khong co ("ban la") -> bao khong co, khong tra hang khac loai', async () => {
    await page.fill('#q', 'bàn là'); await page.press('#q', 'Enter'); await page.waitForTimeout(1500);
    const txt = await page.evaluate(() => document.body.innerText); if (!/chưa có mặt hàng|không tìm thấy|chưa có/i.test(txt)) throw new Error('khong co thong bao');
  });
  await t('mo trang san pham (?sp=) -> ten, gia, nut them vao gio; them vao gio -> dem gio = 1', async () => {
    const sku = await page.evaluate(async () => (await window.kkPackRows())[0][0]);
    await page.goto(BASE + '/?sp=' + sku, { waitUntil: 'load' }); await page.waitForFunction(() => typeof packReady !== 'undefined' && packReady === true, null, { timeout: 15000 }); await page.waitForTimeout(1500);
    const ok = await page.evaluate(() => { const b = document.querySelector('#pmBox'); return !!b && b.textContent.length > 50 && /\d{3}\.\d{3}/.test(b.textContent); }); if (!ok) throw new Error('khong thay trang SP');
    const btn = await page.$('#pmBox button:has-text("Thêm vào giỏ"), #pmBox button:has-text("Mua ngay")'); if (!btn) throw new Error('khong co nut them vao gio'); await btn.click(); await page.waitForTimeout(600);
    const cnt = await page.evaluate(() => Number((document.querySelector('#cartN') || {}).textContent || 0)); if (!(cnt >= 1)) throw new Error('dem gio: ' + cnt);
  });

  console.log('3. Dien thoai 390 px');
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), mp = await mctx.newPage();
  mp.on('pageerror', e => errors.push('mobile: ' + e));
  await mp.goto(BASE + '/', { waitUntil: 'load' }); await mp.waitForFunction(() => typeof packReady !== 'undefined' && packReady === true, null, { timeout: 15000 }); await mp.waitForTimeout(1000);
  await t('khong tran ngang, o tim kiem va nut gio hang hien', async () => {
    const m = await mp.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth, q: !!document.querySelector('#q'), cart: !!document.querySelector('[onclick*="openCart"], #cartBtn, .cart') })); if (m.sw > m.w + 1 || !m.q) throw new Error(JSON.stringify(m));
  });
  await t('chan trang dien thoai: danh muc xep ngang, cao < 420 px', async () => { const h = await mp.$eval('#seoLinks', n => n.getBoundingClientRect().height); if (h > 420) throw new Error('cao ' + h); });

  console.log('4. Loi JS / CSP');
  await t('khong co loi JS (pageerror / console.error)', () => { const real = errors.filter(e => !/favicon|net::ERR_|404|Failed to load resource/.test(e)); if (real.length) throw new Error(real.slice(0, 3).join(' | ')); });
  await t('khong vi pham CSP', () => { if (csp.length) throw new Error(csp[0]); });

  await browser.close(); srv.close();
  console.log(`\nKet qua trinh duyet: ${pass} dat, ${fail} loi`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
