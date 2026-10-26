/*!
 * KK-SEARCH - bộ máy tìm kiếm tiếng Việt chạy hoàn toàn trên thiết bị (Web Worker / trình duyệt / Node)
 * - Chuẩn hóa: bỏ dấu, đ→d, gộp số + đơn vị (256 GB → 256gb, 1,5 HP → 1.5hp, 55" → 55inch)
 * - Chỉ mục ngược theo TỪ NGUYÊN VẸN (không còn khớp chuỗi con: "sac" không còn ra "sách")
 * - Trọng số trường (thương hiệu > tên > nhóm hàng > ngành) × IDF × chuẩn hóa độ dài tên
 * - Từ đồng nghĩa / viết tắt (dt, tv, đh, ip, ss, laptop ↔ máy tính xách tay...)
 * - Gõ dở (tiền tố), sửa lỗi gõ (khoảng cách Damerau-Levenshtein 1-2), hiểu giá ("dưới 5 triệu", "5-7tr")
 * - Ưu tiên máy chính hơn phụ kiện khi người dùng không hỏi phụ kiện; ưu tiên cụm từ đúng thứ tự
 * - 0 kết quả → tự nới điều kiện (khớp phần lớn từ khóa) và báo rõ
 * (c) 2026 Nguyễn Duy Điển (KK-2026). All rights reserved.
 */
(function (root) {
  'use strict';
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const UNIT = '(gb|tb|mb|hp|inch|in|lit|l|kg|g|ml|w|kw|mah|hz|mm|cm|m|v|btu|cc|mp|k|tr|trieu|ngan|nghin)';
  function norm(s) {
    let t = fold(s).replace(/[″”“"]/g, ' inch ').replace(/(\d),(\d)/g, '$1.$2');
    t = t.replace(new RegExp('(\\d+(?:\\.\\d+)?)\\s*' + UNIT + '\\b', 'g'), '$1$2');
    t = t.replace(/(\d+(?:\.\d+)?)(?:in)\b/g, '$1inch').replace(/(\d+(?:\.\d+)?)(?:lit)\b/g, '$1l');
    return t.replace(/[^a-z0-9.+]+/g, ' ').replace(/(^|\s)\.+|\.+(\s|$)/g, ' ').trim();
  }
  const toks = s => norm(s).split(' ').filter(Boolean);

  /* ---------- từ đồng nghĩa / viết tắt (đã bỏ dấu) - mỗi khái niệm là tập các cách viết tương đương ---------- */
  const SYN = [
    ['dien thoai', 'dt', 'dtdd', 'smartphone', 'dien thoai thong minh'],
    ['iphone', 'ip'], ['samsung', 'ss'], ['xiaomi', 'mi'],
    ['tivi', 'tv', 'ti vi', 'smart tivi'],
    ['may lanh', 'dieu hoa', 'dh', 'maylanh', 'dieuhoa'],
    ['tu lanh', 'tl', 'tulanh'], ['tu dong', 'tu dong lanh'],
    ['may giat', 'mg', 'maygiat'],
    ['laptop', 'may tinh xach tay', 'notebook', 'lap top'],
    ['may tinh bang', 'tablet', 'mtb'],
    ['tai nghe', 'headphone', 'earphone', 'earbuds', 'tainghe'],
    ['khong day', 'bluetooth', 'wireless', 'true wireless', 'tws'],
    ['sac du phong', 'pin du phong', 'powerbank', 'power bank'],
    ['dong ho thong minh', 'smartwatch', 'smart watch'],
    ['man hinh', 'monitor', 'manhinh'], ['chuot', 'mouse'], ['ban phim', 'keyboard'],
    ['ban phim co', 'mechanical keyboard'],
    ['loa', 'speaker'], ['may hut bui', 'hut bui', 'vacuum'], ['robot hut bui', 'robot lau nha'],
    ['noi chien khong dau', 'noi chien', 'air fryer'], ['noi com dien', 'noi com'],
    ['may loc nuoc', 'loc nuoc'], ['may loc khong khi', 'loc khong khi'],
    ['bim', 'ta', 'ta dan', 'ta quan'], ['sua bot', 'sua cong thuc'],
    ['kem chong nang', 'chong nang', 'sunscreen'], ['son', 'son moi', 'lipstick'],
    ['giay the thao', 'sneaker'], ['ao thun', 'ao phong', 't shirt', 'tshirt'],
    ['xe dap dien', 'e bike'], ['tre em', 'cho be', 'tre con', 'kid', 'kids'],
    ['may anh', 'camera'], ['camera', 'cam'], ['router', 'bo phat wifi', 'cuc phat wifi'],
    ['airpods', 'airpod'], ['apple watch', 'aw'], ['macbook', 'mac book', 'mbp', 'mba'],
    ['ipad', 'i pad'], ['playstation', 'ps5', 'ps4'], ['nintendo switch', 'switch'],
    ['may say toc', 'say toc'], ['ban ui', 'ban ui hoi nuoc', 'ban ui kho'], ['quat dieu hoa', 'quat hoi nuoc'],
    ['op lung', 'op', 'case'], ['cuong luc', 'kinh cuong luc', 'dan man hinh'],
  ];
  // viet tat: chi mo rong khi KHACH tu go (khong dung de khop nguoc vao ten SP - tranh dinh ma model nhu "TL-WN823N")
  const ABBR = new Set(['dt', 'dtdd', 'ip', 'ss', 'mi', 'tv', 'dh', 'tl', 'mg', 'mtb', 'aw', 'mba', 'mbp', 'cam', 'op', 'ta', 'case', 'switch', 'tws', 'mouse', 'speaker', 'monitor', 'kid', 'kids', 'e bike', 'ps4', 'ps5', 'lap top', 'mac book', 'i pad', 'maylanh', 'dieuhoa', 'tulanh', 'maygiat', 'tainghe', 'manhinh']);
  const STOP = new Set(['cho', 'va', 'cua', 'loai', 'hang', 'chinh', 'hang chinh hang', 'gia', 're', 'tot', 'nhat', 'mua', 'ban', 'moi', 'cai', 'chiec', 'con', 'mot', 'nhung', 'cac', 'voi', 'co', 'the', 'la', 'o', 'tai', 'kk', 'mall', 'sp', 'san', 'pham']);
  const ACC_Q = /\b(op|op lung|bao da|cap|day sac|cu sac|sac|cuong luc|mieng dan|dan|day deo|gia do|phu kien|tui|vo|case|cover|remote|dieu khien|linh kien|thay the|pin thay|ron|khay|loc thay)\b/;
  const ACC_DOC = /^(day (the thao|deo|silicon|da|thep|nylon|vai)|op|bao da|vo bao|cap|day sac|cu sac|cu cap|sac |mieng dan|dan |kinh cuong luc|cuong luc|day deo|gia do|gia treo|phu kien|tui |hop dung|nut|de sac|remote|dieu khien|bo dieu khien|linh kien|ron|khay|loi loc|mang loc|chan de|ke |op lung|tua vit|bo dan|bao ve|tham lot|vo |s buyback|buyback)|\b(danh cho|tuong thich|thay the|cho may|cho tu|cho dieu hoa|op lung|bao da|tui da|tui chong soc|cap da|mieng dan|dan bao ve|dan man hinh|dan camera|dan full|cuong luc|day deo|cu sac|cap sac|buyback|thu cu)\b|\bcho (iphone|ipad|macbook|samsung|galaxy|airpods|apple watch|laptop|dien thoai|may tinh|tivi|tv)\b/;
  const ACC_GRP = new Set(['op lung phu kien', 'pin du phong sac']);

  /* ---------- giá trong câu truy vấn ---------- */
  // so doc bang chu (tim bang giong noi): "nam trieu" -> "5 trieu", "muoi lam trieu" -> "15 trieu", "nam tram nghin" -> "500 nghin"
  const DIG = { khong: 0, mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, lam: 5, sau: 6, bay: 7, tam: 8, chin: 9 };
  function words2num(qn) {
    const W = '(khong|mot|hai|ba|bon|tu|nam|lam|sau|bay|tam|chin|muoi|tram|ruoi)';
    qn = qn.replace(new RegExp('\\b((?:' + W + '\\s+)*' + W + ')\\s+(trieu|tr|nghin|ngan|k)\\b', 'g'), (m, seq, a, b, unit) => {
      let t = seq.split(/\s+/), lead = '';
      while (t.length > 1 && (t[0] === 'tam' || t[0] === 'tu')) { lead += t.shift() + ' '; }   // "tam"=tầm (khoảng), "tu"=từ - khong phai so 8, 4
      let v = 0, cur = 0, ok = true;
      for (const w of t) {
        if (w === 'muoi') cur = (cur || 1) * 10;
        else if (w === 'tram') { v += (cur || 1) * 100; cur = 0; }
        else if (w === 'ruoi') cur += 0.5;
        else if (w in DIG) cur = cur >= 10 && cur % 10 === 0 ? cur + DIG[w] : (cur ? cur * 10 + DIG[w] : DIG[w]);
        else { ok = false; break; } }
      v += cur; return ok && v > 0 ? lead + v + unit : m;
    });
    // "tu nam den bay trieu": ve dau khoang chua co don vi -> doi so chu thanh so
    qn = qn.replace(new RegExp('\\b(tu\\s+)?((?:' + W + '\\s+)*' + W + ')\\s+(den|toi)\\s+(?=\\d)', 'g'), (m, tu, seq) => {
      let v = 0, cur = 0; for (const w of seq.split(/\s+/)) { if (w === 'muoi') cur = (cur || 1) * 10; else if (w === 'tram') { v += (cur || 1) * 100; cur = 0; } else if (w === 'ruoi') cur += 0.5; else if (w in DIG) cur = cur >= 10 && cur % 10 === 0 ? cur + DIG[w] : (cur ? cur * 10 + DIG[w] : DIG[w]); else return m; }
      return (tu || '') + (v + cur) + ' den '; });
    return qn.replace(/(\d+(?:\.\d+)?)\s*(trieu|tr)\s+ruoi\b/g, (m, v, u) => (parseFloat(v) + 0.5) + u)   // "7 trieu ruoi" -> 7.5trieu
      .replace(/(\d+(?:\.\d+)?)\s+(trieu|tr|nghin|ngan)\b/g, '$1$2');                                   // gop so + don vi nhu norm()
  }
  function parsePrice(qn) {
    qn = words2num(qn);
    const num = (v, u) => { v = parseFloat(String(v).replace(/\.(?=\d{3}\b)/g, '')); u = u || ''; if (/^(tr|trieu|m)$/.test(u)) return v * 1e6; if (/^(k|ngan|nghin)$/.test(u)) return v * 1e3; return v < 1000 ? v * 1e6 : v; };
    const U = '(trieu|tr|nghin|ngan|m|k)?';
    const pats = [
      [new RegExp('(?:tu\\s*)?(\\d+(?:\\.\\d+)?)' + U + '\\s*(?:den|toi|-|~)\\s*(\\d+(?:\\.\\d+)?)' + U), m => [num(m[1], m[2] || m[4]), num(m[3], m[4])]],
      [new RegExp('(?:duoi|<|khong qua|toi da|it hon|re hon|max)\\s*(\\d+(?:\\.\\d+)?)' + U), m => [0, num(m[1], m[2])]],
      [new RegExp('(?:tren|>|hon|tu|it nhat|min)\\s*(\\d+(?:\\.\\d+)?)' + U + '(?=\\s|$)'), m => (m[2] ? [num(m[1], m[2]), 1e12] : null)],
      [new RegExp('(?:khoang|tam|quanh|chung|~)\\s*(\\d+(?:\\.\\d+)?)' + U), m => { const v = num(m[1], m[2]); return [v * 0.75, v * 1.25]; }],
      [/(\d+(?:\.\d+)?)(tr|trieu)\b/, m => { const v = num(m[1], m[2]); return [v * 0.75, v * 1.2]; }],
    ];
    for (const [re, fn] of pats) { const m = qn.match(re); if (m) { const r = fn(m); if (r && r[1] >= 1e4) return { range: r, text: m[0] }; } }
    return null;
  }

  /* ---------- khoảng cách sửa lỗi (Damerau-Levenshtein, có ngưỡng) ---------- */
  function dl(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const n = a.length, m = b.length; let p2 = null, p = Array.from({ length: m + 1 }, (_, j) => j);
    for (let i = 1; i <= n; i++) {
      const c = [i]; let best = i;
      for (let j = 1; j <= m; j++) {
        let v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
        c.push(v); if (v < best) best = v;
      }
      if (best > max) return max + 1; p2 = p; p = c;
    }
    return p[m];
  }

  /* ================= XÂY CHỈ MỤC ================= */
  // rows: [sku,name,brand,cat,catName,grp,kk,stock,rating,sold,disc,fl]
  function build(rows) {
    const N = rows.length, post = new Map(), nameTok = new Array(N), nameLen = new Uint16Array(N), acc = new Uint8Array(N), toy = new Uint8Array(N), grpTok = new Array(N);
    const FW = { b: 4, n: 3, g: 2.2, c: 1 };
    for (let i = 0; i < N; i++) {
      const r = rows[i], nt = toks(r[1]); nameTok[i] = nt; nameLen[i] = nt.length;
      const brand = /^(kk select|no ?brand|oem|generic|combo|set)$/i.test(String(r[2] || '').trim()) ? [] : toks(r[2]);
      const w = new Map();
      const add = (t, fw) => { if (!(w.get(t) >= fw)) w.set(t, fw); };
      for (const t of nt) add(t, FW.n);
      for (const t of brand) add(t, FW.b);
      for (const t of toks(r[5])) add(t, FW.g);
      for (const t of toks(r[4])) add(t, FW.c);
      for (const [t, fw] of w) { let a = post.get(t); if (!a) post.set(t, a = []); a.push(i, fw); }
      grpTok[i] = toks(r[5]); const nf = nt.join(' '), gf = grpTok[i].join(' ');
      acc[i] = (ACC_DOC.test(nf) || ACC_GRP.has(gf)) ? 1 : 0;
      toy[i] = (/\b(do choi|mo hinh|lego)\b/.test(nf) || gf === 'do choi giao duc') ? 1 : 0;
    }
    const vocab = [...post.keys()].sort();
    const idf = new Map(); for (const [t, a] of post) idf.set(t, Math.log(1 + N / (a.length / 2)));
    const syn = new Map(); for (const g of SYN) for (const v of g) { const k = toks(v).join(' '); syn.set(k, (syn.get(k) || []).concat(g.map(x => toks(x)).filter(x => x.length))); }
    for (const [k, v] of syn) syn.set(k, uniq(v));
    return { rows, N, post, vocab, idf, nameTok, nameLen, acc, toy, syn, grpTok };
  }
  function uniq(arr) { const s = new Set(), o = []; for (const a of arr) { const k = a.join(' '); if (!s.has(k)) { s.add(k); o.push(a); } } return o; }

  /* tìm các từ trong từ điển khớp 1 token truy vấn: chính xác / tiền tố / sửa lỗi */
  function expandTok(ix, t, isLast, fix) {
    const out = [];
    if (ix.post.has(t)) out.push([t, 1]);
    const isNum = /^\d+(\.\d+)?$/.test(t);
    if (isNum) { // "55" khớp "55inch", "9" khớp "9kg" (số + đơn vị), không khớp "5500mah"
      const lo = lowerBound(ix.vocab, t);
      for (let k = lo; k < ix.vocab.length && ix.vocab[k].startsWith(t) && out.length < 40; k++) { const v = ix.vocab[k]; if (v !== t && /^[a-z]/.test(v.slice(t.length))) out.push([v, 0.95]); }
      return out;
    }
    if ((isLast && t.length >= 2) || t.length >= 4) { // go do / tien to
      const lo = lowerBound(ix.vocab, t); let n = 0;
      for (let k = lo; k < ix.vocab.length && ix.vocab[k].startsWith(t) && n < 60; k++) { const v = ix.vocab[k]; if (v !== t) { out.push([v, isLast ? 0.85 : 0.6]); n++; } }
    }
    if (!out.length && t.length >= 4 && !/\d/.test(t)) { // sua loi go
      const max = t.length >= 8 ? 2 : 1; let best = [];
      for (const v of ix.vocab) {
        if (v.length < t.length - max || v.length > t.length + max || v[0] !== t[0] || /\d/.test(v)) continue;
        const d = dl(t, v, max); if (d <= max) best.push([v, d, ix.post.get(v).length]);
      }
      best.sort((a, b) => a[1] - b[1] || b[2] - a[2]); best = best.slice(0, 4);
      for (const [v, d] of best) out.push([v, d === 1 ? 0.7 : 0.5]);
      if (best.length) fix.push([t, best[0][0]]);
    }
    return out;
  }
  function phraseIn(nt, alt) { for (let i = 0; i + alt.length <= nt.length; i++) { let ok = true; for (let j = 0; j < alt.length; j++) if (!nt[i + j].startsWith(alt[j])) { ok = false; break; } if (ok) return true; } return false; }
  function lowerBound(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; }

  /* tách truy vấn thành các KHÁI NIỆM (ưu tiên cụm dài trong từ điển đồng nghĩa) */
  function concepts(ix, qt) {
    const out = [];
    for (let i = 0; i < qt.length;) {
      let hit = null;
      for (let L = Math.min(4, qt.length - i); L >= 1; L--) { const k = qt.slice(i, i + L).join(' '); if (ix.syn.has(k)) { hit = [k, L]; break; } }
      if (hit) { const alts = ix.syn.get(hit[0]).filter(a => { const k = a.join(' '); return k === hit[0] || !ABBR.has(k); }); out.push({ text: hit[0], orig: hit[0], alts, last: i + hit[1] === qt.length }); i += hit[1]; }
      else { if (!STOP.has(qt[i]) || qt.length === 1) out.push({ text: qt[i], orig: qt[i], alts: [[qt[i]]], last: i === qt.length - 1 }); i++; }
    }
    return out;
  }

  /* ================= TRUY VẤN ================= */
  function query(ix, q, opt) {
    opt = opt || {};
    let qn = words2num(norm(q)); const price = parsePrice(qn); if (price) qn = qn.replace(norm(price.text), ' ').replace(/(^|\s)gia(\s|$)/g, ' ');
    const qt = qn.split(' ').filter(Boolean);
    const wantAcc = ACC_Q.test(qt.join(' '));
    const wantToy = /\b(do choi|be|tre em|cho be|tre con|kid|kids|mo hinh|lego)\b/.test(qt.join(' ')), toy = ix.toy;
    const C = concepts(ix, qt);
    const fix = [];
    // diem moi doc theo tung khai niem
    const per = C.map(c => {
      const m = new Map();
      for (const alt of c.alts) {
        // moi alt: AND cac token cua no; diem = tong (fw*idf*heso)
        let acc = null; const typed = alt.join(' ') === c.orig;
        alt.forEach((t, j) => {
          const ex = typed ? expandTok(ix, t, c.last && j === alt.length - 1, alt.length === 1 ? fix : []) : (ix.post.has(t) ? [[t, 0.95]] : []); // tu dong nghia: chi khop chinh xac
          const cur = new Map();
          for (const [v, k] of ex) { const P = ix.post.get(v), w = ix.idf.get(v) * k; for (let p = 0; p < P.length; p += 2) { const s = P[p + 1] * w; if (!(cur.get(P[p]) >= s)) cur.set(P[p], s); } }
          if (acc === null) acc = cur; else { const nx = new Map(); for (const [d, s] of cur) if (acc.has(d)) nx.set(d, acc.get(d) + s); acc = nx; }
        });
        if (acc) for (const [d, s] of acc) { const sc = alt.length > 1 ? (phraseIn(ix.nameTok[d], alt) || phraseIn(ix.grpTok[d], alt) ? s * 1.1 : typed ? s * 0.45 : 0) : s; if (!sc) continue; if (!(m.get(d) >= sc)) m.set(d, sc); } // cum nhieu tu: phai lien nhau trong ten
      }
      return m;
    });
    const need = C.length;
    let relaxed = false, score = new Map(), hits = new Map();
    const tally = () => { score = new Map(); hits = new Map(); per.forEach(m => { for (const [d, s] of m) { score.set(d, (score.get(d) || 0) + s); hits.set(d, (hits.get(d) || 0) + 1); } }); };
    tally();
    const minHit = need;
    let cand = need ? [...hits].filter(([d, h]) => h >= minHit).map(([d]) => d) : [];
    if (!cand.length && need >= 2) { relaxed = true; const mh = Math.max(1, Math.ceil(need * 0.6)); cand = [...hits].filter(([d, h]) => h >= mh).map(([d]) => d); }
    if (!need && price) cand = ix.rows.map((_, i) => i); // chi co gia: loc theo gia
    // loc gia
    if (price) cand = cand.filter(d => { const v = ix.rows[d][6]; return v >= price.range[0] && v <= price.range[1]; });
    // xep hang
    const qPhr = C.filter(c => c.alts[0].length === 1).map(c => c.alts[0][0]);
    const ranked = cand.map(d => {
      const r = ix.rows[d]; let s = score.get(d) || 0;
      s *= (hits.get(d) || 0) / Math.max(1, need);                       // phat khop thieu (che do noi long)
      s /= 1 + 0.035 * Math.max(0, ix.nameLen[d] - 10);                     // ten qua dai/nhoi tu khoa
      // cum tu dung thu tu trong ten
      if (qPhr.length >= 2) { const nt = ix.nameTok[d]; for (let i = 0; i + 1 < nt.length; i++) for (let j = 0; j + 1 < qPhr.length; j++) if (nt[i].startsWith(qPhr[j]) && nt[i + 1].startsWith(qPhr[j + 1])) s *= 1.12; }
      // ten bat dau bang tu khoa chinh (vd "iphone ..." uu tien hon "op lung iphone ...")
      if (C[0]) { const nt0 = ix.nameTok[d].slice(0, 3).join(' '); if (C[0].alts.some(a => nt0.startsWith(a.join(' ')))) s *= 1.15; }
      // y dinh nhom hang: khai niem trung ten NHOM cua SP (vd "may lanh" -> nhom "May lanh / Dieu hoa") -> uu tien
      let gi = 0; for (const c of C) if (c.alts.some(a => phraseIn(ix.grpTok[d], a))) gi++; if (gi) s *= 1 + 0.6 * gi / Math.max(1, need);
      if (ix.acc[d] && !wantAcc) s *= 0.3;
      if (toy[d] && !wantToy) s *= 0.4;                                      // do choi mo phong ("do choi tu lanh") khi khach khong tim do choi                                  // khong hoi phu kien -> day phu kien xuong
      if (!ix.acc[d] && wantAcc) s *= 0.85;
      const fl = r[11] || 0;
      if (!r[7]) s *= 0.55; if (fl & 1) s *= 0.4; if (fl & 2) s *= 0.85;
      s *= 1 + Math.log10((r[9] || 0) + 1) * 0.04 + Math.max(0, (r[8] || 0) - 4) * 0.03;
      return [d, s];
    }).sort((a, b) => b[1] - a[1]);
    // nhom hang noi bat (goi y loc)
    const gc = new Map(); for (const [d, sc] of ranked.slice(0, 200)) if (sc >= (ranked[0] ? ranked[0][1] : 0) * 0.35) { const r = ix.rows[d], k = r[3] + '|' + r[5]; gc.set(k, (gc.get(k) || 0) + 1); }
    const groups = [...gc].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => { const [cat, grp] = k.split('|'); return { cat, grp, n }; });
    const lim = opt.limit || 60, top = ranked.length ? ranked[0][1] : 1;
    const R2 = ranked.filter(x => x[1] >= top * 0.08);                       // cat duoi ket qua qua yeu (rac)
    return { ids: R2.slice(0, lim).map(x => x[0]), skus: R2.slice(0, lim).map(x => ix.rows[x[0]][0]), rel: R2.slice(0, lim).map(x => Math.round(x[1] / top * 100) / 100), total: R2.length, relaxed, fix: uniq(fix.map(f => [f[0], f[1]])).filter(f => f[0] !== f[1]), price: price ? price.range : null, groups, concepts: C.map(c => c.text) };
  }

  const API = { build, query, norm, fold, parsePrice, words2num, version: '1.1.0' };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.KKS = API;
})(typeof self !== 'undefined' ? self : this);
