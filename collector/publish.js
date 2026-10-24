'use strict';
/*
 * KK-MALL PUBLISH - xuat du lieu cong khai (dung chung cho collect.js va trust-pass.js)
 * catalog-full / cat/<nganh> / catalog-pack / sdui-home / meta / ledger-verify / ledger-roots / ledger-recent
 * Tuyet doi khong ghi nguon, gia nguon hay phan gia noi bo ra cac file nay.
 * (c) Nguyen Duy Dien (KK-2026). All rights reserved.
 */
const fs = require('fs');
const path = require('path');
const T = require('./trust');

const DEAL_BLOCK = T.FL.HOLD | T.FL.USED | T.FL.REF_INFLATED | T.FL.NO_SOURCE;
const isDeal = r => r.in_stock && (r.disc || 0) >= 5 && !((r.fl || 0) & DEAL_BLOCK);

function publish({ API, pub, meta, now, seq, mk, recent, log = console.log }) {
  const wj = (f, d) => fs.writeFileSync(path.join(API, f), JSON.stringify(d));
  const rj = f => JSON.parse(fs.readFileSync(path.join(API, f), 'utf8'));

  wj('catalog-full.json', pub);

  /* ---- tach theo nganh ---- */
  fs.mkdirSync(path.join(API, 'cat'), { recursive: true });
  const byCat = {}; for (const p of pub) (byCat[p.category_id] = byCat[p.category_id] || []).push(p);
  for (const f of fs.readdirSync(path.join(API, 'cat'))) if (f !== 'index.json' && !byCat[f.replace(/\.json$/, '')]) fs.unlinkSync(path.join(API, 'cat', f));
  const catIdx = [];
  for (const [cid, rows] of Object.entries(byCat)) {
    wj('cat/' + cid + '.json', rows);
    catIdx.push({ id: cid, name: rows[0].category_name, n: rows.length, groups: [...new Set(rows.map(r => r.grp))] });
  }
  wj('cat/index.json', { v: now, total: pub.length, cats: catIdx });
  for (const c of (meta.categories || [])) { const b = byCat[c.id] || []; c.count = b.length; for (const g of new Set(b.map(r => r.grp))) if (!c.groups.includes(g)) c.groups.push(g); }
  meta.totalProducts = pub.length;

  /* ---- chi muc gon: [sku,name,brand,cat,catName,grp,kk,stock,rating,sold,disc,fl] ---- */
  meta.packV = now;
  wj('catalog-pack.json', { v: now, cols: ['sku', 'name', 'brand', 'cat', 'catName', 'grp', 'kk', 'stock', 'rating', 'sold', 'disc', 'fl'],
    rows: pub.map(r => [r.sku, r.name, r.brand, r.category_id, r.category_name, r.grp, r.kk_price, r.in_stock, r.rating, r.sold, r.disc || 0, r.fl || 0]) });

  /* ---- SDUI trang chu: ke "Giam sau" CHI lay deal da qua Bo loc Tin cay ---- */
  const sdui = rj('sdui-home.json');
  const ok = r => !((r.fl || 0) & (T.FL.HOLD | T.FL.NO_SOURCE));
  for (const sct of sdui.sections) {
    if (sct.type !== 'shelf') continue;
    if (/Giảm sâu/.test(sct.title)) sct.items = pub.filter(isDeal).sort((a, b) => (b.disc - a.disc) || (b.sold - a.sold)).slice(0, 12);
    else if (/Bán chạy/.test(sct.title)) sct.items = pub.filter(r => r.in_stock && ok(r)).sort((a, b) => b.sold - a.sold).slice(0, 12);
    else if (sct.cat) sct.items = pub.filter(r => r.category_id === sct.cat && ok(r)).sort((a, b) => (b.in_stock - a.in_stock) || (b.sold - a.sold)).slice(0, 12);
  }
  sdui.v = now; wj('sdui-home.json', sdui);

  /* ---- thong ke bo loc tin cay (cong khai: chi so luong) ---- */
  const st = { hold: 0, used: 0, refInflated: 0, low: 0, deals: 0 };
  for (const r of pub) { const f = r.fl || 0; if (f & T.FL.HOLD) st.hold++; if (f & T.FL.USED) st.used++; if (f & T.FL.REF_INFLATED) st.refInflated++; if (f & T.FL.LOW) st.low++; if (isDeal(r)) st.deals++; }
  meta.trust = { ...st, rule: 'Giảm giá chỉ hiển thị khi đã xác minh với giá tham chiếu tin cậy, tối đa 50%; offer thấp hơn 50% trung vị lịch sử/nguồn bị loại trước khi định giá.', at: now };

  /* ---- so cai: head cam ket Merkle root ---- */
  const headHash = T.sha('HEAD|' + seq + '|' + mk.root + '|' + now);
  meta.lastSync = now; meta.ledgerHead = { seq, hash: headHash, root: mk.root, n: mk.n, at: now };
  delete meta.installment;                                   // tam bo tra gop
  wj('meta.json', meta);
  wj('ledger-verify.json', { ok: true, checked: seq, head_seq: seq, head_hash: headHash, merkle_root: mk.root, leaves: mk.n, at: now,
    algo: { entry: 'sha256(seq|sku|kk_price|in_stock|at|prev_hash)', leaf: 'sha256(LEAF|sku|last_entry_hash)', node: 'sha256(left+right), nút lẻ nhân đôi', head: 'sha256(HEAD|seq|merkle_root|at)' },
    note: 'Mỗi sản phẩm có chuỗi băm riêng; đầu chuỗi của toàn bộ sản phẩm được gộp thành Merkle root. Tự kiểm chứng: products/<SKU>.json (ledger, mp = Merkle proof, mr = root).' });
  let roots = []; try { roots = rj('ledger-roots.json'); } catch { }
  if (!roots.length || roots[roots.length - 1].root !== mk.root) roots.push({ seq, root: mk.root, head: headHash, n: mk.n, at: now });
  wj('ledger-roots.json', roots.slice(-500));
  if (recent) wj('ledger-recent.json', { at: now, items: recent.slice(0, 60) });
  log(`Xuat ban: ${pub.length} SP · deal tin cay ${st.deals} · tam giu ${st.hold} · hang cu ${st.used} · gia goc ao ${st.refInflated} · day gia ${st.low} · Merkle ${mk.root.slice(0, 12)}…`);
  return { headHash, stats: st };
}

module.exports = { publish, isDeal, DEAL_BLOCK };
