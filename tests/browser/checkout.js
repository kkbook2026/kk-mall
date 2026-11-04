/*
 * KK-MALL - Kiem thu DAU-CUOI luong dat hang + hop dong dien tu: trinh duyet that (Chromium) + may chu Apps Script GIA LAP trong cung tien trinh
 * (tests/backend/harness.js chay backend/Code.gs). Moi goi den script.google.com duoc chan va dua vao doGet/doPost cua Code.gs that.
 * Chay: node tests/browser/checkout.js   (tu mo may chu tinh tai cong 8767; bien PORT de doi)
 * Pham vi: cau hinh/terms tu may chu, mo checkout, 2 o tich (hop dong bat buoc / tiep thi), xem truoc hop dong da dien, dat hang ->
 * ban chot luu Contracts + bam + email dinh kem, man hinh thanh toan co dong hop dong, tai ve file HTML, trang theo doi don co nut hop dong.
 * (c) 2026 Nguyen Duy Dien. All rights reserved.
 */
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const { serve } = require('./server');
const { load } = require('../backend/harness');
const PORT = Number(process.env.PORT || 8767), BASE = 'http://localhost:' + PORT, SITE = path.join(__dirname, '..', '..', 'site');
let pass = 0, fail = 0;
async function t(name, f) { try { await f(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', String(e && e.message || e).split('\n')[0]); } }

(async () => {
  // may chu gia lap: san pham doc tu site/api/products (nhu UrlFetchApp goi www.kk-mall.com)
  const gas = load();
  gas.setFetch(url => { const m = /\/api\/products\/(KK\d{6})\.json/.exec(url); const f = m && path.join(SITE, 'api', 'products', m[1] + '.json'); return f && fs.existsSync(f) ? { code: 200, body: fs.readFileSync(f, 'utf8') } : { code: 404, body: '' }; });
  gas.props.BANK_BIN = '970436'; gas.props.BANK_ACC = '0011002233'; gas.props.BANK_NAME = 'CONG TY TNHH KK-MALL'; gas.props.BANK_LABEL = 'Vietcombank';
  gas.props.COMPANY_JSON = JSON.stringify({ name: 'CÔNG TY TNHH KK-MALL', short: 'KK-MALL', address: 'Xóm 4, Thôn Phù Yên, Xã Phú Nghĩa, Hà Nội', phone: '0900000000', email: 'cskh@kk-mall.com' });
  const srv = await serve(PORT), browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }), page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.route(/https:\/\/script\.google(usercontent)?\.com\/.*/, async route => {
    const req = route.request(), u = new URL(req.url()); let out;
    try {
      if (req.method() === 'POST') out = gas.call('doPost', { parameter: Object.fromEntries(u.searchParams), postData: { contents: req.postData() || '{}' } });
      else out = gas.call('doGet', { parameter: Object.fromEntries(u.searchParams) });
    } catch (e) { out = { text: JSON.stringify({ error: String(e && e.message || e), code: 500 }) }; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: out.text });
  });

  console.log('1. Cau hinh tu may chu gia lap + gio hang');
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof packReady !== 'undefined' && packReady === true, null, { timeout: 20000 });
  await t('trang nhan cau hinh may chu (phien ban dieu khoan dang ap dung UQ-2026-10)', async () => {
    const c = await page.evaluate(async () => { await KKB.ready; return KKB.cfg; }); if (!c || c.terms.active !== 'UQ-2026-10' || c.version !== '1.9.0') throw new Error(JSON.stringify(c && { v: c.version, t: c.terms }));
  });
  let sku;
  await t('them 1 san pham con hang vao gio', async () => {
    // chon SKU co file JSON va con hang (nhu may chu doc tu www.kk-mall.com/api/products)
    const files = fs.readdirSync(path.join(SITE, 'api', 'products')).slice(0, 400);
    sku = files.map(f => f.replace('.json', '')).find(k => { const d = JSON.parse(fs.readFileSync(path.join(SITE, 'api', 'products', k + '.json'), 'utf8')); return d.in_stock && d.kk_price > 0 && !((d.trust || {}).fl & 3); });
    if (!sku) throw new Error('khong tim thay SKU con hang');
    await page.goto(BASE + '/?sp=' + sku, { waitUntil: 'load' }); await page.waitForFunction(() => typeof packReady !== 'undefined' && packReady === true, null, { timeout: 20000 }); await page.waitForTimeout(1500);
    const btn = await page.$('#pmBox button:has-text("Thêm vào giỏ"), #pmBox button:has-text("Mua ngay")'); if (!btn) throw new Error('khong co nut them vao gio'); await btn.click(); await page.waitForTimeout(500);
    const n = await page.evaluate(() => Number((document.querySelector('#cartN') || {}).textContent || 0)); if (n < 1) throw new Error('gio = ' + n);
  });

  console.log('2. Checkout: 2 o tich, xem truoc hop dong da dien');
  await t('mo checkout -> form co o dong y hop dong (bat buoc) va o tiep thi (tuy chon, khong tich san)', async () => {
    await page.evaluate(() => { closeAll(); openCheckout(); });
    await page.waitForSelector('#coBox form [name=consent]', { timeout: 20000 });
    const st = await page.evaluate(() => ({ c: document.querySelector('[name=consent]').required, m: document.querySelector('[name=marketing]').checked, txt: document.querySelector('[name=consent]').closest('.consent').textContent }));
    if (!st.c || st.m || !/UQ-2026-10/.test(st.txt) || !/Hợp đồng ủy quyền/.test(st.txt)) throw new Error(JSON.stringify(st).slice(0, 200));
  });
  await t('dien thong tin -> "Xem ... da dien" mo ban xem truoc co ten khach, ma [cap khi dat hang], tong tien; dong lai', async () => {
    await page.fill('#coBox [name=name]', 'Nguyễn Kiểm Thử'); await page.fill('#coBox [name=phone]', '0912345678'); await page.fill('#coBox [name=email]', 'kiemthu@test.vn'); await page.fill('#coBox [name=address]', '12 Phố Huế, Phường Hàng Bài, Quận Hoàn Kiếm, Hà Nội');
    await page.click('#coBox button:has-text("Xem")'); await page.waitForSelector('#hdOv', { timeout: 10000 });
    const txt = await page.$eval('#hdOv', n => n.textContent);
    if (!/XÁC NHẬN ỦY QUYỀN/.test(txt) || !/Nguyễn Kiểm Thử/.test(txt) || !/\[cấp khi đặt hàng\]/.test(txt) || !/0011002233/.test(txt)) throw new Error(txt.slice(0, 300));
    await page.click('#hdOv button:has-text("Đóng")'); if (await page.$('#hdOv')) throw new Error('chua dong');
  });

  console.log('3. Dat hang -> ban chot + email + man hinh thanh toan');
  let code, hash;
  await t('tich dong y + tiep thi -> dat hang: don tao, Contracts 1 dong, email dinh kem, man hinh thanh toan co dong hop dong + ma bam', async () => {
    await page.check('#coBox [name=consent]'); await page.check('#coBox [name=marketing]'); await page.click('#coSubmit');
    await page.waitForSelector('#coBox :text("đã lưu kèm đơn")', { timeout: 20000 });
    const txt = await page.$eval('#coBox', n => n.textContent); const m = /Đơn\s*(KK[0-9A-F]+)/.exec(txt); if (!m) throw new Error(txt.slice(0, 200)); code = m[1];
    const row = gas.sheets.Contracts.slice(1).find(x => x[0] === code); if (!row) throw new Error('khong co dong Contracts'); hash = row[2]; if (row[4] !== 1) throw new Error('marketing != 1');
    if (!txt.includes(hash.slice(0, 20))) throw new Error('man hinh khong co ma bam');
    const mail = gas.mails.find(x => x.to === 'kiemthu@test.vn'); if (!mail || !mail.attachments || mail.attachments[0].getName() !== 'KK-MALL-' + code + '-hop-dong.html') throw new Error('email thieu dinh kem');
    if (!gas.sheets.Chain.slice(1).some(x => x[2] === 'contract' && x[3] === code)) throw new Error('chuoi bam thieu mat xich contract');
  });
  await t('nut "Tai ve" -> file HTML doc lap chua ma don + ma bam; nut "Xem" mo cua so moi', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#coBox button:has-text("Tải về")')]);
    const p = await dl.path(); const html = fs.readFileSync(p, 'utf8'); if (!html.includes(code) || !html.includes(hash) || !html.includes('<!doctype html')) throw new Error('noi dung file sai');
    if (dl.suggestedFilename() !== 'KK-MALL-' + code + '-hop-dong.html') throw new Error(dl.suggestedFilename());
    const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 15000 }), page.click('#coBox button:has-text("Xem")')]); await pop.waitForLoadState(); await pop.waitForFunction(() => document.body && /SHA-256/.test(document.body.textContent), null, { timeout: 10000 });
    const ptxt = await pop.evaluate(() => document.body.textContent); if (!ptxt.includes(code) || !ptxt.includes(hash)) throw new Error('cua so xem thieu ma don/ma bam'); await pop.close();
  });
  await t('trang theo doi don (ma don + SDT) co dong hop dong + nut Xem / Tai ve', async () => {
    await page.evaluate((c) => { closeAll(); showTrack(c, '0912345678'); }, code); await page.waitForSelector('#tBox :text("đã lưu kèm đơn")', { timeout: 15000 });
    const n = await page.$$eval('#tBox button', bs => bs.filter(b => /Tải về|Xem/.test(b.textContent)).length); if (n < 2) throw new Error('thieu nut');
  });
  await t('khong tich o dong y -> trinh duyet chan gui (required); gui thang den may chu khong dong y -> tu choi', async () => {
    const r = JSON.parse(gas.call('doPost', { postData: { contents: JSON.stringify({ a: 'order.create', items: [{ sku, qty: 1 }], customer: { name: 'Khach X', phone: '0912345679', email: 'x@test.vn', address: '1 A, Phường B, Quận C, Hà Nội' }, consent: false, consent_version: 'UQ-2026-10' }) } }).text);
    if (!r.error || !/đồng ý/.test(r.error)) throw new Error(JSON.stringify(r).slice(0, 200));
  });
  await t('khong co loi JS trong suot luong', () => { const real = errors.filter(e => !/favicon|net::ERR_|404/.test(e)); if (real.length) throw new Error(real.slice(0, 3).join(' | ')); });

  await browser.close(); srv.close();
  console.log(`\nKet qua dau-cuoi: ${pass} dat, ${fail} loi`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
