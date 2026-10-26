/* Phan loai lai danh muc theo luat hien hanh (chi ap cac thay doi do luat UU TIEN moi gay ra, kiem soat duoc)
 * Dung: node collector/reclassify.js [--dry]   (c) 2026 Nguyen Duy Dien (KK-2026) */
'use strict';
const fs = require('fs'), path = require('path');
const F = require('./feeds');
const API = path.join(__dirname, '..', 'site', 'api');
const dry = process.argv.includes('--dry');
const full = JSON.parse(fs.readFileSync(path.join(API, 'catalog-full.json'), 'utf8'));
const g2c = {}; for (const p of full) g2c[p.grp] = [p.category_id, p.category_name];
const nd = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
let moved = 0, dropped = 0; const log = {};
const keep = [];
for (const p of full) {
  if (/\b(buyback|cam ket gia thu)\b/.test(nd(p.name))) { dropped++; continue; }    // dich vu thu cu - khong phai hang hoa
  const g = F.classifyPriority ? F.classifyPriority(p.name) : null;
  if (g && g !== p.grp && g2c[g]) {
    const [cid, cname] = g2c[g]; const k = p.grp + ' -> ' + g; log[k] = (log[k] || 0) + 1;
    if (!dry) {
      p.grp = g; p.category_id = cid; p.category_name = cname;
      const f = path.join(API, 'products', p.sku + '.json');
      try { const d = JSON.parse(fs.readFileSync(f, 'utf8')); d.grp = g; d.category_id = cid; d.category_name = cname; fs.writeFileSync(f, JSON.stringify(d)); } catch { }
    }
    moved++;
  }
  keep.push(p);
}
if (!dry) fs.writeFileSync(path.join(API, 'catalog-full.json'), JSON.stringify(keep));
console.log(`${dry ? '[THU] ' : ''}Phan loai lai: ${moved} SP · loai ${dropped} dich vu khong phai hang hoa`);
for (const [k, v] of Object.entries(log).sort((a, b) => b[1] - a[1])) console.log('  ' + v + ' ' + k);
