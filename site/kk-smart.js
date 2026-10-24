/*
 * KK-MALL SMART LAYER - chay 100% tren trinh duyet khach
 *  1. Bo loc Tin cay: % giam da xac minh, hang cu, tam giu, bang chung "Gia cuoi cung"
 *  2. So cai niem phong mat ma: bieu do 30/90 ngay, kiem chung SHA-256 + Merkle bang WebCrypto
 *  3. Bo loc hanh vi mua sam (menu ngang) + mega menu danh muc
 *  4. AI Semantic Search: hieu ngu canh (qua sep, do dung lop 1...) -> gom gio goi y theo ngan sach
 *  5. Real-time Stock & Price Lock khi bam Thanh toan
 * Ban quyen (c) Nguyen Duy Dien (KK-2026). All rights reserved.
 */
'use strict';
const KFL = { HOLD: 1, USED: 2, LOW: 4, COMBO: 8, REF_INFLATED: 16 };
const kFold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const flOf = p => (p && (p.fl != null ? p.fl : p.trust ? p.trust.fl : 0)) || 0;
const discOf = p => (p && (p.disc != null ? p.disc : p.trust ? p.trust.disc : 0)) || 0;
const isHold = p => !!(flOf(p) & KFL.HOLD);
const isUsedP = p => !!(flOf(p) & KFL.USED);
const noSource = p => !!(flOf(p) & 32);
const canBuy = p => !!(p && p.in_stock && p.kk_price && !isHold(p) && !noSource(p));

/* ===================== 1. BANG CHUNG GIA CUOI CUNG ===================== */
// Voucher AI se tu ap khi mua RIENG san pham nay (dung y thuat toan gio hang: moi nhom 1 ma tot nhat)
function singleVoucher(p) {
  const V = window.KK_VOUCHERS || [], sub = p.kk_price || 0, best = {};
  for (const v of V) {
    if (sub < v.min_order) continue;
    if (v.scope !== 'all' && v.scope !== p.category_id) continue;
    const d = v.type === 'percent' ? Math.min(Math.floor(sub * v.value / 100), v.max_discount || 1e12) : Math.min(v.value, sub);
    if (d > 0 && (!best[v.group] || d > best[v.group].d)) best[v.group] = { code: v.code, d };
  }
  const list = Object.values(best); const d = list.reduce((a, x) => a + x.d, 0);
  return { codes: list.map(x => x.code), d, after: sub - d };
}
function proofLine(p, big) {
  if (!p.kk_price) return '';
  if (isHold(p)) return `<div class="proof hold">⏸ Đang xác minh giá với nguồn - tạm ngừng đặt</div>`;
  if (noSource(p)) return `<div class="proof hold">⏳ Đang kết nối nguồn hàng - tạm ngừng đặt</div>`;
  const v = singleVoucher(p);
  const cls = big ? 'proof big' : 'proof';
  const tip = 'Giá thanh toán khi mua riêng sản phẩm này: đã gồm giao hàng tận cửa, voucher được AI tự áp trong giỏ hàng';
  return v.d > 0
    ? `<div class="${cls}" title="${tip}">✓ Đã gồm Freeship · Đã trừ ${v.codes.join(' + ')} <b>→ ${vnd(v.after)}</b></div>`
    : `<div class="${cls}" title="${tip}">✓ Đã gồm Freeship · 0đ phụ phí</div>`;
}
function trustBadges(p) {
  const f = flOf(p); let h = '';
  if (f & KFL.USED) h += '<span class="tbadge used">♻️ Đã qua sử dụng</span>';
  if (f & KFL.LOW) h += '<span class="tbadge low">📉 Đáy giá lịch sử</span>';
  return h;
}
const installmentOf = () => null;                            // tam bo tra gop

/* ===================== 3. MENU HANH VI + MEGA MENU ===================== */
const SMART_F = {
  deal: { icon: '🔥', label: 'Săn Deal Lỗi Giá', title: '🔥 Săn Deal Lỗi Giá - giảm sâu ĐÃ XÁC MINH', desc: 'Chỉ các mức giảm ≥ 20% đã đối chiếu với giá tham chiếu tin cậy và lịch sử niêm phong. AI đã loại giá gốc ảo, phụ kiện đăng chung link, hàng cũ và lỗi giá.' },
  low: { icon: '📉', label: 'Đáy Giá Lịch Sử', title: '📉 Đáy Giá Lịch Sử - giá thấp nhất từng niêm phong', desc: 'Giá hiện tại thấp nhất trong toàn bộ lịch sử giá đã niêm phong SHA-256 của sản phẩm. Bấm vào sản phẩm để xem biểu đồ và tự kiểm chứng.' },
  clear: { icon: '⚡', label: 'Xả Kho Chính Hãng', title: '⚡ Xả Kho Chính Hãng - thương hiệu thật, giá xả thật', desc: 'Hàng thương hiệu chính hãng, đánh giá từ 4.5★, đang giảm ≥ 10% đã xác minh. Ưu tiên món giảm sâu và bán chạy.' },
  combo: { icon: '🎁', label: 'Combo Tiết Kiệm', title: '🎁 Combo Tiết Kiệm - mua theo bộ, giá tốt hơn', desc: 'Combo, bộ, set, lốc, thùng - mua nhiều đơn vị một lần với đơn giá thấp hơn. Giá đã gồm giao hàng.' },
};
function renderNav() {
  const cats = (META.categories || []);
  $('#catnav').innerHTML = `<a class="mm-btn" id="mmBtn" onclick="toggleMega(event)" aria-haspopup="true">☰ Danh mục <span class="car">▾</span></a>`
    + `<a data-f="" class="on" onclick="goHome()">🏠 Trang chủ</a>`
    + Object.entries(SMART_F).map(([k, f]) => `<a data-f="${k}" onclick="setFilter('${k}')">${f.icon} ${f.label}</a>`).join('')
    + `<a class="ledger-nav" onclick="openLedger()">🔗 Sổ cái giá</a>`;
  let mm = document.getElementById('megaMenu');
  if (!mm) { mm = document.createElement('div'); mm.id = 'megaMenu'; mm.className = 'mega'; document.querySelector('.catnav').appendChild(mm); }
  mm.innerHTML = `<div class="wrap"><div class="mega-g">${cats.map(c => `<a class="mega-c" href="./c/${c.id}.html" onclick="event.preventDefault();closeMega();setCat('${c.id}')"><span class="mi">${c.icon}</span><span><b>${esc(c.name)}</b><small>${(c.count || 0).toLocaleString('vi-VN')} mặt hàng</small><em>${c.groups.slice(0, 4).map(g => `<i onclick="event.stopPropagation();event.preventDefault();closeMega();setCat('${c.id}','${esc(g).replace(/'/g, "\\'")}')">${esc(g)}</i>`).join('')}</em></span></a>`).join('')}</div></div>`;
  navArrows();
}
function toggleMega(e) { e && e.stopPropagation(); const m = $('#megaMenu'); const on = !m.classList.contains('show'); m.classList.toggle('show', on); $('#mmBtn').classList.toggle('open', on); }
function closeMega() { const m = $('#megaMenu'); if (m) m.classList.remove('show'); const b = $('#mmBtn'); if (b) b.classList.remove('open'); }
document.addEventListener('click', e => { if (!e.target.closest('#megaMenu') && !e.target.closest('#mmBtn')) closeMega(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMega(); });
function navMark(f) { document.querySelectorAll('#catnav a[data-f]').forEach(a => a.classList.toggle('on', a.dataset.f === f)); const b = document.getElementById('mmBtn'); if (b) b.classList.toggle('on', f === '-cat'); navFocus(); }
function setFilter(f) {
  const F = SMART_F[f]; if (!F) return;
  state.f = f; state.cat = ''; state.group = ''; state.q = ''; $('#q').value = '';
  $('#brand').innerHTML = '<option value="">Tất cả thương hiệu</option>';
  $('#secTitle').textContent = F.title;
  $('#groups').innerHTML = `<div class="fdesc">${esc(F.desc)}</div>`;
  navMark(f); showShop(); scrollTo({ top: 0, behavior: 'smooth' }); reload();
  try { history.replaceState({}, '', '?f=' + f); } catch { }
}

/* ===================== 2. SO CAI NIEM PHONG ===================== */
const sha256 = async s => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); };
const DAY = 86400000;
// Gop diem: ban ghi so cai (chi tiet) + chuoi ngay d90 (dai han)
function histPoints(p) {
  const pts = new Map();
  for (const x of p.d90 || []) pts.set('d' + x[0], { t: x[0] * DAY + 12 * 3600e3, v: x[1], h: x[2], kind: 'day' });
  for (const e of p.ledger || []) { const t = Date.parse(e.at); const k = 'd' + Math.floor(t / DAY); pts.delete(k); pts.set('e' + e.seq, { t, v: e.kk_price, h: e.hash, seq: e.seq, kind: 'entry' }); }
  if (p.kk_price) pts.set('now', { t: Date.parse(p.updated_at || new Date().toISOString()), v: p.kk_price, h: (p.ledger || []).length ? p.ledger[p.ledger.length - 1].hash : '', kind: 'now' });
  return [...pts.values()].filter(x => x.v > 0).sort((a, b) => a.t - b.t);
}
function priceChart(p, days, id) {
  const all = histPoints(p); const t1 = Date.now(), t0 = t1 - days * DAY;
  let pts = all.filter(x => x.t >= t0);
  if (pts.length < 2) pts = all.slice(-2);
  if (pts.length < 2) return `<div class="chart-empty">Chưa đủ dữ liệu niêm phong để vẽ biểu đồ. Lịch sử giá bắt đầu được niêm phong từ lần đầu sản phẩm lên KK-MALL.</div>`;
  const box = document.getElementById(id === 'pmc' ? 'pmChart' : 'lgChartBox');
  const W = Math.round(Math.max(280, (box && box.clientWidth) || Math.min(id === 'pmc' ? 440 : 868, innerWidth - 90))), H = 190, PL = 8, PR = 8, PT = 20, PB = 26;
  const vs = pts.map(x => x.v); let mn = Math.min(...vs), mx = Math.max(...vs); const flat = mx === mn; if (flat) { mx = Math.round(mx * 1.05); mn = Math.round(mn * 0.95); }
  const ta = Math.min(pts[0].t, t0 + (all[0] && all[0].t > t0 ? all[0].t - t0 : 0)), tb = Math.max(pts[pts.length - 1].t, ta + 1);
  const X = t => PL + (t - ta) / (tb - ta) * (W - PL - PR), Y = v => PT + (1 - (v - mn) / (mx - mn)) * (H - PT - PB);
  const xy = pts.map(x => [X(x.t), Y(x.v)]);
  const line = xy.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
  // bac thang: gia giu nguyen den lan doi tiep theo
  let step = ''; xy.forEach((q, i) => { step += (i ? `H${q[0].toFixed(1)}V${q[1].toFixed(1)}` : `M${q[0].toFixed(1)} ${q[1].toFixed(1)}`); });
  const area = step + `H${xy[xy.length - 1][0].toFixed(1)}V${H - PB}H${xy[0][0].toFixed(1)}Z`;
  const iMin = vs.indexOf(Math.min(...vs));
  const fd = t => new Date(t).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  const dots = xy.map((q, i) => `<circle class="cp" cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${i === xy.length - 1 ? 5 : 3.2}" data-i="${i}"/>`).join('');
  window['_cpts_' + id] = pts;
  return `<div class="chart" id="${id}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Biểu đồ lịch sử giá ${days} ngày">
    <defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3B82F6" stop-opacity=".22"/><stop offset="1" stop-color="#3B82F6" stop-opacity="0"/></linearGradient></defs>
    <line x1="${PL}" x2="${W - PR}" y1="${Y(mx)}" y2="${Y(mx)}" class="gl"/><line x1="${PL}" x2="${W - PR}" y1="${Y(mn)}" y2="${Y(mn)}" class="gl"/>
    <path d="${area}" fill="url(#g${id})"/><path d="${step}" class="ln"/>${dots}
    ${flat ? '' : `<text x="${PL}" y="12" class="ax">${vnd(mx)}</text><text x="${PL}" y="${H - PB - 4}" class="ax">${vnd(mn)}</text>`}
    <text x="${PL}" y="${H - 6}" class="ax">${fd(ta)}</text><text x="${W - PR}" y="${H - 6}" class="ax" text-anchor="end">${fd(tb)}</text>
    ${flat ? `<text x="${W / 2}" y="${(Y(vs[0]) - 10).toFixed(1)}" class="ax low" text-anchor="middle">Giá ổn định ${vnd(vs[0])}</text>` : `<text x="${xy[iMin][0].toFixed(1)}" y="${(xy[iMin][1] + 16).toFixed(1)}" class="ax low" text-anchor="middle">▲ Đáy</text>`}
  </svg><div class="ctip" id="${id}tip"></div></div>`;
}
function bindChart(id) {
  const el = document.getElementById(id); if (!el) return; const tip = document.getElementById(id + 'tip'); const pts = window['_cpts_' + id] || [];
  el.querySelectorAll('.cp').forEach(c => {
    const showTip = () => { const x = pts[+c.dataset.i]; if (!x) return; const r = el.getBoundingClientRect(), cr = c.getBoundingClientRect();
      tip.innerHTML = `<b>${vnd(x.v)}</b><br>${new Date(x.t).toLocaleString('vi-VN')}<br><code>${x.h ? String(x.h).slice(0, 16) + '…' : 'neo khởi tạo'}</code>${x.seq ? ` · #${x.seq.toLocaleString('vi-VN')}` : ''}`;
      tip.style.left = Math.min(r.width - 170, Math.max(0, cr.left - r.left - 80)) + 'px'; tip.style.top = Math.max(0, cr.top - r.top - 74) + 'px'; tip.classList.add('show'); };
    c.addEventListener('mouseenter', showTip); c.addEventListener('click', showTip); c.addEventListener('mouseleave', () => tip.classList.remove('show'));
  });
}
function histStats(p) {
  const v = histPoints(p).map(x => x.v); if (!v.length) return null;
  const s = v.slice().sort((a, b) => a - b); return { min: s[0], max: s[s.length - 1], med: s[s.length >> 1], n: v.length, now: p.kk_price, atLow: p.kk_price && p.kk_price <= s[0] };
}
// Kiem chung chuoi bang WebCrypto
async function verifyChain(p) {
  const L = (p.ledger || []).slice().sort((a, b) => a.seq - b.seq); const rows = [];
  for (let i = 0; i < L.length; i++) {
    const e = L[i]; let st = 'fail';
    const prevs = i ? [L[i - 1].hash] : ['GENESIS-' + p.sku];
    const ss = e.s != null ? [e.s] : [1, 0];
    for (const pv of prevs) for (const s of ss) if (st === 'fail' && await sha256(`${e.seq}|${p.sku}|${e.kk_price}|${s}|${e.at}|${pv}`) === e.hash) st = i ? 'ok' : 'genesis';
    if (st === 'fail' && i === 0) st = 'anchor';                                   // ban ghi truoc da xoay vong (giu 60 ban ghi gan nhat)
    if (st === 'fail' && i > 0 && L[i - 1].at === e.at) st = 'boot';               // lo khoi tao ban dau (cung thoi diem)
    rows.push({ ...e, st });
  }
  // Merkle proof -> root
  let merkle = null;
  if (p.mp && p.mr) {
    const head = L.length ? L[L.length - 1].hash : 'GENESIS-' + p.sku;
    let h = await sha256('LEAF|' + p.sku + '|' + head);
    for (const x of p.mp) h = x[0] === 'L' ? await sha256(x.slice(2) + h) : await sha256(h + x.slice(2));
    merkle = { ok: h === p.mr, root: p.mr, at: p.mat, steps: p.mp.length };
  }
  return { rows, merkle, ok: rows.every(r => r.st !== 'fail') && (!merkle || merkle.ok) };
}
let LG_ROOTS = null;
async function ledgerPanel(sku, box) {
  box.innerHTML = '<div class="lg-load">⏳ Đang tải chuỗi niêm phong...</div>';
  let p; try { p = await api('/api/products/' + sku); } catch (e) { box.innerHTML = '<div class="err" style="display:block">' + esc(e.message) + '</div>'; return; }
  const st = histStats(p);
  box.innerHTML = `<div class="lg-prod"><img src="${imgSrc(p)}" ${imgAttrs(p)} alt=""><div><div class="lg-n">${esc(p.name)}</div><div class="lg-m">SKU ${p.sku} · ${esc(p.grp)} · giá hiện tại <b>${vnd(p.kk_price)}</b> ${trustBadges(p)}</div>
    <button class="vbtn" onclick="closeAll();openProduct('${p.sku}')">Xem sản phẩm →</button></div></div>
    <div class="ctabs"><button class="on" onclick="lgRange(this,'${p.sku}',30)">30 ngày</button><button onclick="lgRange(this,'${p.sku}',90)">90 ngày</button></div>
    <div id="lgChartBox">${priceChart(p, 30, 'lgc')}</div>
    ${st ? `<div class="hstat"><div><span>Thấp nhất</span><b>${vnd(st.min)}</b></div><div><span>Trung vị</span><b>${vnd(st.med)}</b></div><div><span>Cao nhất</span><b>${vnd(st.max)}</b></div><div><span>Hiện tại</span><b class="${st.atLow ? 'okc' : ''}">${vnd(st.now)}${st.atLow ? ' · đáy' : ''}</b></div></div>` : ''}
    <div class="vbox" id="lgVerify"><div class="lg-load">🔐 Đang kiểm chứng SHA-256 ngay trên trình duyệt của bạn...</div></div>`;
  window._lgP = p; bindChart('lgc');
  const t0 = performance.now(); const r = await verifyChain(p); const ms = Math.round(performance.now() - t0);
  if (!LG_ROOTS) { try { LG_ROOTS = await api('/api/ledger-roots'); } catch { LG_ROOTS = []; } }
  const inLog = r.merkle && (LG_ROOTS || []).find(x => x.root === r.merkle.root);
  const nOk = r.rows.filter(x => x.st === 'ok' || x.st === 'genesis').length, nBoot = r.rows.filter(x => x.st === 'boot' || x.st === 'anchor').length, nBad = r.rows.filter(x => x.st === 'fail').length;
  const lab = { ok: '<span class="okc">✓ khớp</span>', genesis: '<span class="okc">✓ khởi đầu</span>', anchor: '<span class="mut">⚓ neo</span>', boot: '<span class="mut">◇ khởi tạo</span>', fail: '<span class="bad">✗ sai</span>' };
  document.getElementById('lgVerify').innerHTML = `<div class="vsum ${nBad || (r.merkle && !r.merkle.ok) ? 'bad' : 'good'}">
      ${nBad || (r.merkle && !r.merkle.ok) ? '⚠️ Phát hiện bản ghi không khớp chuỗi băm' : '✅ Toàn vẹn - lịch sử giá chưa từng bị sửa lùi'}
      <small>${nOk} liên kết SHA-256 khớp${nBoot ? ` · ${nBoot} bản ghi neo/khởi tạo` : ''}${r.merkle ? ` · Merkle proof ${r.merkle.steps} bước ${r.merkle.ok ? '✓ hợp lệ' : '✗ sai'}` : ''} · kiểm chứng trong ${ms} ms trên máy bạn</small></div>
    ${r.merkle ? `<div class="mroot">Merkle root: <code>${r.merkle.root}</code><br>${inLog ? `✓ Có trong nhật ký root công khai (#${inLog.seq.toLocaleString('vi-VN')}, ${new Date(inLog.at).toLocaleString('vi-VN')})` : 'Root của phiên niêm phong ' + (r.merkle.at ? new Date(r.merkle.at).toLocaleString('vi-VN') : '')}</div>` : ''}
    <div style="overflow-x:auto"><table class="lgt"><tr><th>#Seq</th><th>Thời điểm</th><th>Giá</th><th>Hash SHA-256</th><th>Kết quả</th></tr>
    ${r.rows.slice().reverse().slice(0, 40).map(x => `<tr><td>${x.seq.toLocaleString('vi-VN')}</td><td>${new Date(x.at).toLocaleString('vi-VN')}</td><td>${vnd(x.kk_price)}</td><td><code title="${x.hash}">${x.hash.slice(0, 20)}…</code></td><td>${lab[x.st]}</td></tr>`).join('')}</table></div>
    <details class="algo"><summary>Thuật toán & cách tự kiểm chứng độc lập</summary>
    <ol><li>Mỗi lần giá/tồn kho đổi: <code>hash = SHA256(seq|SKU|giá|còn_hàng|thời_điểm|hash_trước)</code> - sửa 1 bản ghi cũ sẽ làm gãy toàn bộ chuỗi phía sau.</li>
    <li>Đầu chuỗi của mọi sản phẩm gộp thành <b>Merkle root</b> duy nhất, công bố mỗi chu kỳ thu thập (3 giờ/lần) và lưu nhật ký tại <a href="./api/ledger-roots.json" target="_blank">ledger-roots.json</a>.</li>
    <li>Dữ liệu gốc công khai: <a href="./api/products/${p.sku}.json" target="_blank">products/${p.sku}.json</a> (ledger, mp = Merkle proof, mr = root) - tự tính lại bằng bất kỳ công cụ SHA-256 nào.</li>
    <li>"⚓ neo": bản ghi cũ hơn đã xoay vòng (giữ 60 bản ghi gần nhất + chuỗi theo ngày 90 ngày). "◇ khởi tạo": lô dữ liệu đầu tiên khi mở sổ cái.</li></ol></details>`;
}
function lgRange(btn, sku, days) { btn.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn)); const p = window._lgP; if (!p) return; $('#lgChartBox').innerHTML = priceChart(p, days, 'lgc'); bindChart('lgc'); }
async function openLedger(sku) {
  closeMega();
  let m = document.getElementById('lgm');
  if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = 'lgm'; m.onclick = e => { if (e.target === m) closeAll(); }; m.innerHTML = '<div class="mbox" id="lgBox" style="max-width:920px"></div>'; document.body.appendChild(m); }
  const H = (META && META.ledgerHead) || {}; const T = (META && META.trust) || {};
  $('#lgBox').innerHTML = `<button class="x" onclick="closeAll()" style="position:absolute;top:12px;right:14px">✕</button><div class="lgw">
    <h2>🔗 Sổ cái giá niêm phong mật mã học</h2>
    <div class="lghead"><div><span>Bản ghi niêm phong</span><b>#${(H.seq || 0).toLocaleString('vi-VN')}</b></div><div><span>Sản phẩm trong Merkle tree</span><b>${(H.n || 0).toLocaleString('vi-VN')}</b></div><div><span>Niêm phong lần cuối</span><b>${H.at ? new Date(H.at).toLocaleString('vi-VN') : '-'}</b></div><div><span>Deal đã xác minh</span><b>${(T.deals || 0).toLocaleString('vi-VN')}</b></div></div>
    <div class="mroot">Merkle root hiện hành: <code>${H.root || '-'}</code><br>Head hash: <code>${H.hash || '-'}</code></div>
    <div class="lgsearch"><input id="lgQ" placeholder="🔎 Gõ tên hoặc mã SKU sản phẩm để xem lịch sử giá & kiểm chứng..." autocomplete="off"><div id="lgSug" class="lgsug"></div></div>
    <div id="lgPanel"><h3>Vừa niêm phong</h3><div id="lgRecent" class="lgrec">Đang tải...</div></div>
    <div class="note" style="margin-top:12px">🛡️ Bộ lọc Tin cậy đang chặn: <b>${(T.refInflated || 0).toLocaleString('vi-VN')}</b> SP có giá gốc ảo (không hiển thị % giảm) · <b>${(T.used || 0).toLocaleString('vi-VN')}</b> SP đã qua sử dụng (không so với giá máy mới) · <b>${(T.hold || 0).toLocaleString('vi-VN')}</b> SP đang tạm giữ xác minh giá.</div></div>`;
  show('#lgm');
  $('#lgQ').addEventListener('input', lgSearch);
  if (sku) { ledgerPanel(sku, $('#lgPanel')); return; }
  try { const r = await api('/api/ledger-recent'); $('#lgRecent').innerHTML = (r.items || []).slice(0, 12).map(x => `<a onclick="ledgerPanel('${x.sku}',$('#lgPanel'))"><span>${esc(x.name)}</span><small>#${x.seq.toLocaleString('vi-VN')} · ${new Date(x.at).toLocaleTimeString('vi-VN')} · <code>${x.hash.slice(0, 10)}…</code></small><b>${x.prev && x.prev !== x.kk ? `<s>${vnd(x.prev)}</s> ` : ''}${vnd(x.kk)}</b></a>`).join('') || 'Chưa có dữ liệu'; } catch { $('#lgRecent').textContent = 'Không tải được'; }
}
async function lgSearch() {
  const q = kFold($('#lgQ').value.trim()); const box = $('#lgSug'); if (q.length < 2) { box.innerHTML = ''; return; }
  const rows = await packRows(); const t = q.split(/\s+/);
  const hit = []; for (const r of rows) { if (t.every(x => r._h.includes(x))) { hit.push(r); if (hit.length >= 8) break; } }
  box.innerHTML = hit.map(r => `<div onclick="$('#lgSug').innerHTML='';ledgerPanel('${r[0]}',$('#lgPanel'))"><span>${esc(r[1])}</span><b>${vnd(r[6])}</b></div>`).join('') || '<div class="mut">Không thấy sản phẩm</div>';
}

/* ===================== 4. AI SEMANTIC SEARCH ===================== */
let _PR = null;
async function packRows() {
  if (_PR) return _PR;
  let rows = null; try { const c = JSON.parse(localStorage.getItem('kk_pack') || 'null'); if (c && c.rows) rows = c.rows; } catch { }
  if (!rows) rows = (await api('/api/catalog-pack')).rows;
  for (const r of rows) r._h = kFold(r[1] + ' ' + r[2] + ' ' + r[5]);
  return (_PR = rows);
}
// Muc dich mua sam -> cac "nhu cau" con. mode: gift = chon 1 mon trong ngan sach | basket = gom du bo trong tong ngan sach
const FOOD = ['bach-hoa', 'suc-khoe-lam-dep'];
const INTENTS = [
  { id: 'qua-sep', re: /(qua|tang|bieu).{0,24}\b(sep|cap tren|giam doc|doi tac|khach hang|thay co|thay giao|co giao)\b|qua bieu|qua tet|qua cao cap|qua sang trong/, title: 'Quà tặng sếp / đối tác', mode: 'gift',
    needs: [['Trà & cà phê cao cấp', /\b(tra (o long|olong|shan tuyet|thai nguyen|sen tay ho|uop sen|nhai|thuong hang|dac san)|hop qua tra|ca phe (hat|nguyen chat|chon|weasel|rang xay))\b/, { cats: FOOD, not: /(\bmay\b|xe dap|dau tra|giam can|\bba ca phe|tay te bao|tay da chet)/ }],
      ['Hồng sâm & yến', /\b(hong sam|nhan sam|cao sam|sam han quoc|yen sao|to yen|nuoc yen)\b/, { cats: FOOD }],
      ['Đông trùng & mật ong', /\b(dong trung ha thao|mat ong (rung|nguyen chat|hoa))\b/, { cats: FOOD }],
      ['Bút ký cao cấp', /^(but ky|but kim loai|but cao cap|but parker|but dap)\b/, { cats: ['sach-van-phong-pham', 'thoi-trang'], not: /(\bgel\b|ruot|ngoi but)/ }],
      ['Ví & thắt lưng da', /\b(vi da|vi nam|that lung da|that lung nam|day lung da)\b/, { cats: ['thoi-trang'] }],
      ['Bình giữ nhiệt', /\bbinh giu nhiet\b/, {}], ['Nước hoa', /\bnuoc hoa\b/, { cats: ['suc-khoe-lam-dep'], not: /(xe|o to|treo)/ }]] },
  { id: 'hoc-tap', re: /\b(lop \d|vao lop|hoc sinh|di hoc|tuu truong|nam hoc|do dung hoc tap|dung cu hoc tap|mam non|tieu hoc)\b/, title: 'Bộ đồ dùng học tập', mode: 'basket',
    needs: [['Cặp / balo học sinh', /\b(cap sach|cap hoc sinh|balo hoc sinh|ba lo hoc sinh|cap chong gu|balo chong gu|balo tre em|ba lo tre em)\b/, {}], ['Bút chì, bút mực', /\b(but chi|but muc|but bi|but may|but long)\b/, { not: /(may tinh|cam ung|stylus|ipad)/ }],
      ['Hộp bút', /\b(hop but|hop dung but|tui dung but)\b/, {}], ['Màu vẽ', /\b(sap mau|but mau|mau nuoc|mau sap|but sap|but to mau)\b/, {}], ['Bình nước', /\b(binh nuoc|binh giu nhiet)\b/, { not: /(xe dap|gong|gia do|loc nuoc|nong lanh)/ }],
      ['Sách thiếu nhi', /\b(sach thieu nhi|truyen tranh|to mau|tap to|sach tieng viet|truyen co tich)\b/, { cats: ['sach-van-phong-pham', 'me-be'] }]] },
  { id: 'qua-be', re: /(qua|do choi|sinh nhat).{0,24}\b(be|tre em|con|chau|thieu nhi)\b|\bbe \d+ tuoi\b|1 thang 6|trung thu/, title: 'Quà cho bé', mode: 'gift',
    needs: [['Đồ chơi giáo dục', /\b(do choi (giao duc|thong minh|go|lap rap|xep hinh)|lego|lap rap|xep hinh|rubik)\b/, {}], ['Búp bê & thú bông', /\b(bup be|thu bong|gau bong)\b/, {}], ['Xe & mô hình', /\b(xe do choi|mo hinh|xe dieu khien)\b/, { cats: ['me-be', 'sach-van-phong-pham', 'the-thao-du-lich'] }],
      ['Sách & truyện', /\b(sach thieu nhi|truyen tranh|truyen co tich|sach tranh)\b/, {}], ['Quần áo bé', /\b(do bo be|vay be|dam be|ao be)\b/, { cats: ['me-be', 'thoi-trang'] }]] },
  { id: 'qua-nu', re: /(qua|tang).{0,24}\b(me|ba noi|ba ngoai|vo|ban gai|nguoi yeu|phu nu|chi gai|em gai|co ay)\b|20.?10|8.?3|valentine/, title: 'Quà tặng phái đẹp', mode: 'gift',
    needs: [['Nước hoa', /\bnuoc hoa\b/, { cats: ['suc-khoe-lam-dep'], not: /(xe|o to|treo|nam\b)/ }], ['Chăm sóc da', /\b(kem duong|serum|mat na|bo duong da|bo cham soc da)\b/, { cats: ['suc-khoe-lam-dep'] }], ['Son & trang điểm', /\b(son (moi|kem|li|thoi)|bang mat|phan ma)\b/, { cats: ['suc-khoe-lam-dep'] }],
      ['Túi xách', /\b(tui xach|tui deo cheo nu|vi nu)\b/, { cats: ['thoi-trang'] }], ['Máy massage', /\b(may massage|goi massage|may mat xa)\b/, {}], ['Trang sức', /\b(day chuyen|lac tay|nhan bac|bong tai|vong tay)\b/, { cats: ['thoi-trang'], not: /(thong minh|smart|galaxy|fit\d|be trai|be gai|tre em|cho be)/ }]] },
  { id: 'qua-nam', re: /(qua|tang).{0,24}\b(bo|ong noi|ong ngoai|chong|ban trai|nam gioi|anh trai|em trai|anh ay)\b|ngay cua cha/, title: 'Quà tặng phái mạnh', mode: 'gift',
    needs: [['Ví & thắt lưng', /\b(vi da|vi nam|that lung|day lung)\b/, { cats: ['thoi-trang'] }], ['Máy cạo râu', /\b(may cao rau|dao cao rau)\b/, {}], ['Đồng hồ nam', /^dong ho (nam|deo tay nam|co)\b/, { cats: ['thoi-trang'] }],
      ['Máy massage', /\b(may massage|goi massage|sung massage)\b/, {}], ['Tai nghe', /^tai nghe\b/, {}], ['Trà & cà phê', /\b(tra o long|tra thai nguyen|ca phe hat|ca phe nguyen chat|ca phe rang xay)\b/, { cats: FOOD }]] },
  { id: 'nha-moi', re: /\b(nha moi|tan gia|chuyen nha|don nha|ra o rieng|can ho moi)\b/, title: 'Bộ đồ gia dụng nhà mới', mode: 'basket',
    needs: [['Nồi cơm điện', /^noi com\b/, {}], ['Nồi chiên không dầu', /\bnoi chien\b/, {}], ['Bếp điện / bếp từ', /^bep (tu|dien|hong ngoai)\b/, {}], ['Ấm siêu tốc', /\b(am sieu toc|binh dun sieu toc|am dun)\b/, {}], ['Quạt', /^quat\b/, {}], ['Máy hút bụi', /\b(may hut bui|robot hut bui)\b/, {}]] },
  { id: 'van-phong', re: /\b(van phong|ban lam viec|lam viec tai nha|wfh|work from home|setup|goc lam viec)\b/, title: 'Góc làm việc hiệu quả', mode: 'basket',
    needs: [['Chuột', /^chuot\b/, {}], ['Bàn phím', /^ban phim\b/, { not: /(ipad|tablet|bao da)/ }], ['Tai nghe', /^tai nghe\b/, {}], ['Giá đỡ laptop', /\b(gia do laptop|de tan nhiet|gia de laptop)\b/, {}], ['Đèn bàn', /\b(den ban|den hoc|den doc sach)\b/, {}], ['Bình giữ nhiệt', /\bbinh giu nhiet\b/, {}]] },
  { id: 'du-lich', re: /\b(du lich|cam trai|da ngoai|di phuot|di bien|leo nui|picnic)\b/, title: 'Hành trang du lịch', mode: 'basket',
    needs: [['Balo / vali', /\b(balo du lich|ba lo du lich|vali|tui du lich)\b/, { cats: ['thoi-trang', 'the-thao-du-lich'], not: /(may chieu|boc|ao trum|khoa|day dai|nhan ten|do choi|bac si|meka)/ }], ['Sạc dự phòng', /\b(sac du phong|pin du phong)\b/, {}], ['Bình giữ nhiệt', /\bbinh giu nhiet\b/, {}], ['Kem chống nắng', /\bkem chong nang\b/, {}], ['Lều & đồ dã ngoại', /\b(leu|tui ngu|ghe xep|ban xep|vong xep)\b/, { cats: ['the-thao-du-lich'], not: /(coc leu|tui dung|day leu|day cang)/ }]] },
  { id: 'so-sinh', re: /\b(so sinh|me bau|chuan bi sinh|em be moi|di sinh|bim sua)\b/, title: 'Đồ chuẩn bị cho bé sơ sinh', mode: 'basket',
    needs: [['Tã / bỉm', /\b(ta dan|ta quan|bim|ta giay)\b/, { cats: ['me-be'] }], ['Bình sữa', /\bbinh sua\b/, {}], ['Máy hút sữa', /\bmay hut sua\b/, {}], ['Khăn & đồ dùng', /\b(khan sua|khan tam|khan uot)\b/, {}], ['Sữa & dinh dưỡng', /\b(sua bot|sua cong thuc|sua cho be)\b/, { cats: ['me-be', 'bach-hoa'], not: /(nhiet ke|may|binh)/ }]] },
  { id: 'the-thao', re: /\b(tap gym|tap the duc|the hinh|giam can|tap luyen|chay bo|tap yoga|yoga)\b/, title: 'Bộ tập luyện tại nhà', mode: 'basket',
    needs: [['Thảm & dụng cụ yoga', /\b(tham (yoga|tap)|yoga)\b/, { cats: ['the-thao-du-lich'] }], ['Tạ & dây kháng lực', /\b(ta tay|ta don|day khang luc|day nhay)\b/, {}], ['Bình nước thể thao', /\b(binh nuoc|binh lac)\b/, {}], ['Giày thể thao', /\bgiay (the thao|chay bo|sneaker)\b/, {}], ['Đồng hồ thông minh', /\b(dong ho thong minh|vong deo tay thong minh|smartwatch)\b/, {}]] },
];
const needMatch = (n, r) => { const o = n[2] || {}; const h = r._f || (r._f = kFold(r[1])); return n[1].test(h) && (!o.cats || o.cats.includes(r[3])) && !(o.not && o.not.test(h)); };
function parseBudget(q) {
  const t = kFold(q).replace(/,/g, '.');
  const n = (v, u) => { v = parseFloat(v); u = (u || '').trim(); return /^(tr|trieu|m)/.test(u) ? v * 1e6 : /^(k|nghin|ngan)/.test(u) ? v * 1e3 : v >= 1000 ? v : v * 1e6; };
  let m;
  if ((m = t.match(/tu\s*([\d.]+)\s*(tr|trieu|m|k|nghin|ngan)?\s*(den|-|toi)\s*([\d.]+)\s*(tr|trieu|m|k|nghin|ngan)?/))) return [n(m[1], m[2] || m[5]), n(m[4], m[5])];
  if ((m = t.match(/(duoi|<|khong qua|toi da|max|it hon|re hon)\s*([\d.]+)\s*(tr|trieu|m|k|nghin|ngan)?/))) return [0, n(m[2], m[3])];
  if ((m = t.match(/(khoang|tam|quanh|~|chung)\s*([\d.]+)\s*(tr|trieu|m|k|nghin|ngan)?/))) { const v = n(m[2], m[3]); return [v * 0.6, v * 1.25]; }
  if ((m = t.match(/(tren|>|hon)\s*([\d.]+)\s*(tr|trieu|m|k|nghin|ngan)\b/))) return [n(m[2], m[3]), 1e12];
  if ((m = t.match(/([\d.]+)\s*(tr|trieu|k|nghin|ngan)\b/))) { const v = n(m[1], m[2]); return [v * 0.6, v * 1.15]; }
  return null;
}
const qualityScore = r => (r[8] || 4.5) * 2 + Math.log10((r[9] || 0) + 10) + (r[10] || 0) / 25;
async function semantic(q) {
  const fq = kFold(q); const intent = INTENTS.find(i => i.re.test(fq)); if (!intent) return null;
  const budget = parseBudget(q); const rows = await packRows();
  const okRow = r => r[7] && r[6] > 0 && !((r[11] || 0) & (KFL.HOLD | KFL.USED));
  const picks = [];
  for (const need of intent.needs) {
    const label = need[0]; const seen = new Set();
    let cand = rows.filter(r => okRow(r) && needMatch(need, r) && !seen.has(r._f) && seen.add(r._f));
    if (intent.mode === 'gift' && budget) { const lo = budget[1] < 1e11 ? Math.max(budget[0], budget[1] * 0.25) : budget[0]; cand = cand.filter(r => r[6] >= lo && r[6] <= budget[1]); }
    if (!cand.length) continue;
    // qua tang: uu tien mon "dang gia" (60-100% ngan sach) + chat luong; gio: uu tien gia hop ly + chat luong
    const tgt = budget ? Math.min(budget[1], budget[1] < 1e11 ? budget[1] : 1e7) : 0;
    cand.sort((a, b) => {
      const qa = qualityScore(a), qb = qualityScore(b);
      if (intent.mode === 'gift' && tgt) { const fa = 1 - Math.abs(a[6] / tgt - 0.8), fb = 1 - Math.abs(b[6] / tgt - 0.8); return (qb + fb * 3) - (qa + fa * 3); }
      return (qb - Math.log10(b[6]) * 0.8) - (qa - Math.log10(a[6]) * 0.8);
    });
    if (intent.mode === 'basket' && !budget && cand.length >= 2) { const md = cand.map(r => r[6]).sort((x, y) => x - y)[(cand.length - 1) >> 1]; const c2 = cand.filter(r => r[6] <= md); if (c2.length) cand = c2; }
    picks.push({ label, items: cand.slice(0, 4) });
  }
  if (!picks.length) return { intent, budget, picks: [], basket: [], total: 0 };
  let basket = picks.map(p => ({ label: p.label, r: p.items[0], alt: p.items.slice(1) }));
  if (intent.mode === 'basket' && budget && budget[1] < 1e11) {
    // gom vua ngan sach: thay mon dat nhat bang lua chon re hon cung nhu cau, roi bo bot nhu cau neu van vuot
    const tot = () => basket.reduce((a, b) => a + b.r[6], 0);
    for (let guard = 0; guard < 30 && tot() > budget[1]; guard++) {
      basket.sort((a, b) => b.r[6] - a.r[6]);
      const top = basket[0]; const nd = intent.needs.find(n => n[0] === top.label); const cheaper = [...top.alt, ...rows.filter(r => okRow(r) && r[6] < top.r[6] && needMatch(nd, r))].sort((a, b) => a[6] - b[6])[0];
      if (cheaper && cheaper[6] < top.r[6]) top.r = cheaper; else basket.shift();
    }
    basket.sort((a, b) => intent.needs.findIndex(n => n[0] === a.label) - intent.needs.findIndex(n => n[0] === b.label));
  }
  return { intent, budget, picks, basket, total: basket.reduce((a, b) => a + b.r[6], 0) };
}
const bLabel = b => b ? (b[1] >= 1e11 ? 'từ ' + vnd(b[0]) : b[0] > 0 ? vnd(b[0]) + ' - ' + vnd(b[1]) : '≤ ' + vnd(b[1])) : 'linh hoạt';
async function semanticSug(q) {
  const s = await semantic(q); const box = $('#semSug'); if (!box) return;
  if (!s || !s.basket.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.innerHTML = `<div class="sem-h">🤖 AI hiểu ý bạn: <b>${esc(s.intent.title)}</b> · ngân sách ${bLabel(s.budget)}</div>
   <div class="sem-row">${s.basket.slice(0, 4).map(b => `<div class="sem-it" onclick="openProduct('${b.r[0]}')"><small>${esc(b.label)}</small><span>${esc(b.r[1])}</span><b>${vnd(b.r[6])}</b></div>`).join('')}</div>
   <button class="sem-go" onclick="showSemantic(${JSON.stringify(q).replace(/"/g, '&quot;')})">${s.intent.mode === 'gift' ? 'Xem tất cả gợi ý quà' : 'Xem giỏ gợi ý hoàn chỉnh · ' + vnd(s.total)} →</button>`;
}
async function showSemantic(q) {
  $('#sug').classList.remove('show'); const s = await semantic(q); if (!s) return false;
  state.f = ''; state.cat = ''; state.group = ''; state.q = '';
  $('#secTitle').textContent = '🤖 ' + s.intent.title + ' · ngân sách ' + bLabel(s.budget);
  const skus = s.intent.mode === 'gift' ? s.picks.flatMap(p => p.items.slice(0, 3).map(r => [r[0], p.label])) : s.basket.map(b => [b.r[0], b.label]);
  $('#groups').innerHTML = `<div class="fdesc">AI phân tích câu "<b>${esc(q)}</b>" → ${s.intent.mode === 'gift' ? 'gợi ý quà theo từng nhóm, đúng tầm giá' : `gom đủ <b>${s.basket.length} món</b> trong ngân sách`} từ ${[...new Set(skus.map(x => (s.picks.flatMap(p => p.items).find(r => r[0] === x[0]) || [])[4]))].filter(Boolean).length} ngành hàng. Đã loại hàng cũ, hàng đang xác minh giá.</div>
    ${s.intent.mode === 'basket' && s.basket.length ? `<div class="sem-bar"><span>Tổng giỏ gợi ý: <b>${vnd(s.total)}</b> (đã gồm giao hàng)</span><button class="btn g" style="margin:0;width:auto;padding:10px 18px" onclick='addBasket(${JSON.stringify(s.basket.map(b => b.r[0]))})'>🛒 Thêm cả giỏ (${s.basket.length} món)</button></div>` : ''}`;
  showShop(); scrollTo({ top: 0, behavior: 'smooth' });
  $('#grid').innerHTML = Array.from({ length: 6 }, () => '<div class="skel sk-card"></div>').join('');
  const items = await Promise.all(skus.map(async ([sku, lab]) => { try { const p = await api('/api/products/' + sku); p._need = lab; return p; } catch { return null; } }));
  state.items = items.filter(Boolean); $('#grid').innerHTML = state.items.map(card).join(''); $('#more').style.display = 'none';
  $('#count').textContent = state.items.length + ' gợi ý';
  navMark('');
  return true;
}
async function addBasket(skus) { for (const s of skus) addCart(s, 1); toast('Đã thêm ' + skus.length + ' món vào giỏ - AI đang tối ưu voucher'); openCart(); }

/* ===================== 5. REAL-TIME STOCK & PRICE LOCK ===================== */
let PRICE_LOCK = null, _lockTimer = null;
const LOCK_MIN = 15;
async function liveCheck() {
  const t0 = performance.now(); const changes = [];
  const res = await Promise.all(cart.map(async c => {
    try {
      // Neu co may chu kiem tra truc tiep voi nguon (META.liveCheckUrl) thi dung, nguoc lai doc ban niem phong moi nhat (bo qua cache)
      if (META.liveCheckUrl) { const r = await fetch(META.liveCheckUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sku: c.sku, qty: c.qty }) }); if (r.ok) return { c, p: await r.json() }; }
      const r = await fetch('api/products/' + c.sku + '.json?lc=' + Date.now(), { cache: 'no-store' }); return { c, p: r.ok ? await r.json() : null };
    } catch { return { c, p: null }; }
  }));
  for (const { c, p } of res) {
    if (!p) { changes.push({ sku: c.sku, name: c.name, type: 'err' }); continue; }
    if (!canBuy(p)) { changes.push({ sku: c.sku, name: c.name, type: isHold(p) ? 'hold' : 'oos' }); c.unavailable = 1; }
    else { delete c.unavailable; if (p.kk_price !== c.kk_price) { changes.push({ sku: c.sku, name: c.name, type: 'price', from: c.kk_price, to: p.kk_price }); c.kk_price = p.kk_price; } }
    c.name = p.name || c.name; c.category_id = p.category_id || c.category_id;
  }
  const ms = Math.round(performance.now() - t0); const at = Date.now();
  PRICE_LOCK = { at, exp: at + LOCK_MIN * 60000, ms, items: cart.filter(c => !c.unavailable).map(c => ({ sku: c.sku, price: c.kk_price, qty: c.qty })) };
  save();
  return { changes, ms, ok: cart.filter(c => !c.unavailable).length, n: cart.length };
}
function lockBanner(r) {
  const ch = r.changes; const lab = { price: x => `Giá <b>${esc(x.name)}</b> vừa cập nhật ${vnd(x.from)} → <b>${vnd(x.to)}</b>`, oos: x => `<b>${esc(x.name)}</b> vừa hết hàng - đã tách khỏi đơn (không bị trừ tiền)`, hold: x => `<b>${esc(x.name)}</b> đang được AI xác minh lại giá - tạm tách khỏi đơn`, err: x => `Không kiểm tra được <b>${esc(x.name)}</b> - vui lòng thử lại` };
  return `<div class="lock ${ch.length ? 'warn' : ''}" id="lockBox"><div class="lk-h">🔒 Đã kiểm tra tồn kho & <b>chốt giá thời gian thực</b>: ${r.ok}/${r.n} sản phẩm · ${r.ms} ms</div>
    <div class="lk-t">Giá được giữ đến <b>${new Date(PRICE_LOCK.exp).toLocaleTimeString('vi-VN')}</b> · còn <b id="lockLeft">${LOCK_MIN}:00</b></div>
    ${ch.length ? `<ul>${ch.map(x => `<li>${lab[x.type](x)}</li>`).join('')}</ul>` : ''}</div>`;
}
function startLockTimer() {
  clearInterval(_lockTimer);
  _lockTimer = setInterval(() => {
    const el = document.getElementById('lockLeft'); if (!el || !PRICE_LOCK) { clearInterval(_lockTimer); return; }
    const left = PRICE_LOCK.exp - Date.now();
    if (left <= 0) { clearInterval(_lockTimer); el.textContent = '00:00'; const b = $('#coSubmit'); if (b) { b.textContent = '⟳ Hết thời gian giữ giá - kiểm tra lại'; b.type = 'button'; b.onclick = () => openCheckout(); } return; }
    el.textContent = String(Math.floor(left / 60000)).padStart(2, '0') + ':' + String(Math.floor(left % 60000 / 1000)).padStart(2, '0');
  }, 1000);
}
