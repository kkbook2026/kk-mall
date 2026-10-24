'use strict';
/*
 * IndexNow - bao ngay cho Bing, Coc Coc*, Yandex, Seznam, Naver... cac trang vua thay doi gia/ton kho.
 * Chay SAU buoc deploy trong GitHub Actions. Danh sach URL lay tu collector/.changed.json (collect.js ghi).
 * INDEXNOW_ALL=1: gui toan bo URL trong sitemap (dung 1 lan khi khoi tao / sau thay doi lon).
 * (*) cac cong cu tham gia giao thuc IndexNow; Google khong dung IndexNow ma doc sitemap.
 */
const fs = require('fs');
const path = require('path');
const HOST = 'www.kk-mall.com', KEY = 'f95c52dddecf69dd6416845c5cdfd364';
const SITE = path.join(__dirname, '..', 'site');
(async () => {
  let urls = [];
  if (process.env.INDEXNOW_ALL === '1' || process.env.INDEXNOW_ALL === 'true') {
    for (const f of fs.readdirSync(SITE)) if (/^sitemap-.*\.xml$/.test(f)) urls.push(...(fs.readFileSync(path.join(SITE, f), 'utf8').match(/<loc>[^<]+<\/loc>/g) || []).map(s => s.slice(5, -6)));
  } else {
    const f = path.join(__dirname, '.changed.json');
    if (fs.existsSync(f)) urls = JSON.parse(fs.readFileSync(f, 'utf8')).map(s => 'https://' + HOST + '/p/' + s + '.html');
    if (urls.length) urls.unshift('https://' + HOST + '/');
  }
  urls = [...new Set(urls)];
  if (!urls.length) return console.log('IndexNow: khong co URL thay doi');
  let ok = 0;
  for (let i = 0; i < urls.length; i += 10000) {
    const batch = urls.slice(i, i + 10000);
    try {
      const r = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ host: HOST, key: KEY, keyLocation: 'https://' + HOST + '/' + KEY + '.txt', urlList: batch }) });
      console.log('IndexNow lo ' + (i / 10000 + 1) + ': ' + batch.length + ' URL -> HTTP ' + r.status);
      if (r.status < 300) ok += batch.length;
    } catch (e) { console.log('IndexNow loi mang:', e.message); }
  }
  console.log('IndexNow: da bao ' + ok + '/' + urls.length + ' URL');
})();
