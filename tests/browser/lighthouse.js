/*
 * KK-MALL - Ngan sach Lighthouse (di dong, mo phong 4G) tren ban tinh cuc bo: hieu nang >= 80, tiep can >= 90, SEO >= 90, thuc hanh tot >= 80.
 * Chay: node tests/browser/lighthouse.js   (can lighthouse + Chromium cua Playwright; CHROME_PATH de chi dinh Chrome khac)
 * (c) 2026 Nguyen Duy Dien. All rights reserved.
 */
'use strict';
const { spawn } = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const { serve } = require('./server');
const PORT = Number(process.env.PORT || 8767), URL_ = 'http://localhost:' + PORT + '/';
const BUDGET = { performance: 0.8, accessibility: 0.9, seo: 0.9, 'best-practices': 0.8 };
(async () => {
  const srv = await serve(PORT);
  let chrome = process.env.CHROME_PATH; if (!chrome) { try { chrome = require('playwright').chromium.executablePath(); } catch (e) { } }
  const out = path.join(os.tmpdir(), 'kk-lh-' + Date.now() + '.json');
  let cli; try { cli = require.resolve('lighthouse/cli/index.js'); } catch (e) { console.error('Chua cai lighthouse (npm i lighthouse)'); srv.close(); process.exit(2); }
  // spawn BAT DONG BO: may chu tinh chay cung tien trinh, spawnSync se chan vong lap su kien -> Chrome khong tai duoc trang
  const status = await new Promise(res => { const ch = spawn(process.execPath, [cli, URL_, '--quiet', '--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage', '--output=json', '--output-path=' + out, '--only-categories=performance,accessibility,best-practices,seo', '--form-factor=mobile', '--screenEmulation.mobile', '--throttling-method=simulate'],
    { env: Object.assign({}, process.env, chrome ? { CHROME_PATH: chrome } : {}), stdio: 'inherit' }); const tm = setTimeout(() => { ch.kill('SIGKILL'); res(-1); }, 300000); ch.on('close', c => { clearTimeout(tm); res(c); }); });
  srv.close();
  if (status !== 0 || !fs.existsSync(out)) { console.error('Lighthouse khong chay duoc (ma ' + status + ')'); process.exit(1); }
  const j = JSON.parse(fs.readFileSync(out, 'utf8')), c = j.categories, a = j.audits, g = k => Math.round((c[k].score || 0) * 100);
  console.log('Lighthouse di dong: hieu nang ' + g('performance') + ' · tiep can ' + g('accessibility') + ' · thuc hanh tot ' + g('best-practices') + ' · SEO ' + g('seo'));
  console.log('  FCP ' + a['first-contentful-paint'].displayValue + ' · LCP ' + a['largest-contentful-paint'].displayValue + ' · TBT ' + a['total-blocking-time'].displayValue + ' · CLS ' + a['cumulative-layout-shift'].displayValue);
  const bad = Object.keys(BUDGET).filter(k => (c[k].score || 0) < BUDGET[k]);
  if (bad.length) { console.error('VUOT NGAN SACH: ' + bad.map(k => k + ' ' + g(k) + ' < ' + BUDGET[k] * 100).join(', ')); process.exit(1); }
  console.log('Ngan sach Lighthouse: dat');
})();
