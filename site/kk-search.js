/*!
 * KK-SEARCH 2 - bộ máy tìm kiếm tiếng Việt chạy hoàn toàn trên thiết bị (Web Worker / trình duyệt / Node)
 * - Chuẩn hóa: bỏ dấu, đ→d, gộp số + đơn vị (256 GB → 256gb, 1,5 HP → 1.5hp, 1.5 ngựa → 1.5hp, 55" → 55inch, 12.000 BTU → 12000btu)
 * - Hiểu dấu khi khách CÓ gõ dấu: "giày" ≠ "giấy", "đèn" ≠ "đen", "bàn" ≠ "bản" (không phân biệt kiểu bỏ dấu hoà/hòa)
 * - Chỉ mục ngược theo TỪ NGUYÊN VẸN, ưu tiên khớp chính xác; chỉ mở rộng tiền tố khi từ chưa gõ xong
 * - Trọng số trường (thương hiệu > tên > nhóm hàng > ngành) × IDF × chuẩn hóa độ dài tên
 * - Hiểu LOẠI HÀNG khách cần (từ chính của câu): ưu tiên SP có tên bắt đầu bằng loại hàng đó, đẩy phụ kiện / đồ chơi mô phỏng xuống
 * - Đồng nghĩa 2 chiều + mở rộng 1 chiều (ổ cứng → SSD/HDD) + viết tắt (dt, tv, đh, ip, ss, lap...) + tương đương đơn vị (12000BTU ↔ 1.5HP)
 * - Gõ dính chữ ("noichien"), sửa lỗi gõ (Damerau-Levenshtein 1-2), sót phím Telex, hiểu giá ("dưới 5 triệu", "5-7tr", "tầm 500k")
 * - 0 kết quả → nới dần điều kiện, giữ loại hàng chính, báo rõ từ khóa đã bỏ qua
 * - Gợi ý khi gõ: hoàn thành cụm từ (có dấu), nhóm hàng, thương hiệu, sản phẩm; bộ lọc thuộc tính (GB, inch, HP, kg, lít...) + khoảng giá
 * (c) 2026 Nguyễn Duy Điển (KK-2026). All rights reserved.
 */
(function (root) {
  'use strict';
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const UNIT = '(gb|tb|mb|hp|ngua|inch|in|lit|l|kg|g|ml|w|kw|mah|hz|mm|cm|m|v|btu|cc|mp|k|tr|trieu|ngan|nghin)';
  const UNIT_RE = new RegExp('(\\d+(?:\\.\\d+)?)\\s*' + UNIT + '\\b', 'g');
  function norm(s) {
    let t = fold(s).replace(/[″”“"]/g, ' inch ').replace(/(\d),(\d)/g, '$1.$2');
    t = t.replace(/(\d)\.(\d{3})(?=\s*(btu|mah|w)\b)/g, '$1$2');                     // 12.000 BTU -> 12000 BTU
    t = t.replace(/(\d+)\.0+(?![\d.])/g, '$1');                                             // 1.0 HP = 1 HP, 2.0hp = 2hp
    t = t.replace(/(\d+(?:\.\d+)?)\s*ngua\s+ruoi\b/g, (m, v) => (parseFloat(v) + 0.5) + 'hp'); // 1 ngua ruoi -> 1.5hp
    t = t.replace(/(\d+)\s*in\s*(\d+)\b/g, '$1in$2');                                   // "2 in 1" giu nguyen nghia
    t = t.replace(UNIT_RE, '$1$2');
    t = t.replace(/(\d+(?:\.\d+)?)(?:in)\b/g, '$1inch').replace(/(\d+(?:\.\d+)?)(?:lit)\b/g, '$1l').replace(/(\d+(?:\.\d+)?)(?:ngua)\b/g, '$1hp');
    t = t.replace(/(\d)\.(\d)/g, '$1\u0001$2').replace(/\./g, ' ').replace(/\u0001/g, '.');            // dau cham chi giu trong so thap phan ("TM.VH1009HP" -> "tm vh1009hp")
    return t.replace(/[^a-z0-9.+]+/g, ' ').replace(/(^|\s)\.+|\.+(\s|$)/g, ' ').trim();
  }
  const toks = s => norm(s).split(' ').filter(Boolean);
  /* khóa có dấu chuẩn hóa: giữ chữ â ă ê ô ơ ư đ + số thanh điệu (không phụ thuộc vị trí bỏ dấu: hoà = hòa) */
  const TONES = '\u0300\u0301\u0303\u0309\u0323', TONE_RE = /[\u0300\u0301\u0303\u0309\u0323]/g;
  const _vk = new Map();
  function vkey(w) { let k = _vk.get(w); if (k) return k; const d = w.normalize('NFD'); let t = 0; k = d.replace(TONE_RE, m => { t = TONES.indexOf(m) + 1; return ''; }).normalize('NFC') + t; if (_vk.size < 2e5) _vk.set(w, k); return k; }
  const words = s => String(s || '').toLowerCase().normalize('NFC').split(/[^\p{L}]+/u).filter(w => w.length > 1);
  const _fw = new Map(); const foldW = w => { let f = _fw.get(w); if (f === undefined) { f = fold(w); if (_fw.size < 3e5) _fw.set(w, f); } return f; };
  const _bt = new Map(); const toksB = b => { let t = _bt.get(b); if (!t) { t = toks(b); _bt.set(b, t); } return t; };

  /* ---------- từ đồng nghĩa (2 chiều) - mỗi khái niệm là tập các cách viết tương đương (đã bỏ dấu) ---------- */
  const SYN = [
    ['dien thoai', 'dt', 'dtdd', 'smartphone', 'dien thoai thong minh'],
    ['iphone', 'ip'], ['samsung', 'ss'], ['xiaomi', 'mi'],
    ['tivi', 'tv', 'ti vi', 'smart tivi'],
    ['may lanh', 'dieu hoa', 'dh', 'maylanh', 'dieuhoa'],
    ['tu lanh', 'tl', 'tulanh'], ['tu dong', 'tu dong lanh'],
    ['may giat', 'mg', 'maygiat'],
    ['laptop', 'may tinh xach tay', 'notebook', 'lap top', 'lap'],
    ['may tinh bang', 'tablet', 'mtb'],
    ['tai nghe', 'headphone', 'earphone', 'earbuds', 'tainghe', 'tai phone', 'headset'],
    ['khong day', 'bluetooth', 'wireless', 'true wireless', 'tws'],
    ['sac du phong', 'pin du phong', 'powerbank', 'power bank', 'pin sac du phong'],
    ['dong ho thong minh', 'smartwatch', 'smart watch'],
    ['vong deo tay thong minh', 'smart band', 'smartband', 'vong tay thong minh'],
    ['man hinh', 'monitor', 'manhinh'], ['chuot', 'mouse'], ['ban phim', 'keyboard'],
    ['ban phim co', 'mechanical keyboard'],
    ['loa', 'speaker'], ['loa thanh', 'soundbar'], ['may hut bui', 'hut bui', 'vacuum'], ['robot hut bui', 'robot lau nha', 'robot vacuum', 'robot hut bui lau nha'],
    ['noi chien khong dau', 'noi chien', 'air fryer'], ['noi com dien', 'noi com'],
    ['may loc nuoc', 'loc nuoc'], ['may loc khong khi', 'loc khong khi', 'air purifier'],
    ['bim', 'ta', 'ta dan', 'ta quan'], ['sua bot', 'sua cong thuc'],
    ['kem chong nang', 'chong nang', 'sunscreen'], ['son', 'son moi', 'lipstick'],
    ['giay the thao', 'sneaker', 'giay sneaker'], ['ao thun', 'ao phong', 't shirt', 'tshirt'],
    ['xe dap dien', 'e bike'], ['tre em', 'cho be', 'tre con', 'kid', 'kids'],
    ['may anh', 'camera'], ['camera', 'cam'], ['router', 'bo phat wifi', 'cuc phat wifi', 'modem wifi'],
    ['airpods', 'airpod'], ['apple watch', 'aw'], ['macbook', 'mac book', 'mbp', 'mba'],
    ['ipad', 'i pad'], ['playstation 5', 'ps5'], ['playstation 4', 'ps4'], ['nintendo switch', 'switch'],
    ['may say toc', 'say toc', 'hair dryer'], ['ban ui', 'ban la'], ['quat dieu hoa', 'quat hoi nuoc'],
    ['op lung', 'op', 'case'], ['cuong luc', 'kinh cuong luc', 'dan man hinh'],
    ['may chieu', 'projector'], ['ghe gaming', 'gaming chair', 'ghe choi game', 'ghe game'], ['ghe cong thai hoc', 'ergonomic', 'ghe ergonomic'],
    ['may nuoc nong', 'binh nong lanh', 'binh nuoc nong', 'binh tam nong lanh', 'may tam nuoc nong'],
    ['am sieu toc', 'binh dun sieu toc', 'am dun sieu toc', 'am dun nuoc', 'am dun', 'binh sieu toc'],
    ['ca phe', 'cafe', 'coffee', 'caphe'], ['may pha ca phe', 'may pha cafe', 'may espresso', 'coffee maker'],
    ['balo', 'ba lo', 'backpack'], ['the nho', 'memory card', 'micro sd', 'microsd'],
    ['chong nuoc', 'waterproof', 'ipx7', 'ip67', 'ip68', 'ipx5', 'ipx4', 'ipx6'], ['chong on', 'anc', 'noise cancelling'],
    ['xe day', 'xe day em be'], ['ban hoc', 'ban hoc sinh'], ['nuoc hoa', 'perfume'], ['sua rua mat', 'cleanser'],
    ['cu sac', 'bo sac', 'adapter sac', 'cuc sac'], ['cap sac', 'day sac'], ['2 canh', '2 cua', 'hai canh', 'hai cua', 'ngan da tren', 'ngan da duoi'], ['1 chieu', 'mot chieu'], ['2 chieu', 'hai chieu'],
  ];
  // viet tat: chi mo rong khi KHACH tu go (khong dung de khop nguoc vao ten SP - tranh dinh ma model nhu "TL-WN823N")
  const ABBR = new Set(['dt', 'dtdd', 'ip', 'ss', 'mi', 'tv', 'dh', 'tl', 'mg', 'mtb', 'aw', 'mba', 'mbp', 'cam', 'op', 'ta', 'case', 'switch', 'tws', 'mouse', 'speaker', 'monitor', 'kid', 'kids', 'e bike', 'ps4', 'ps5', 'lap top', 'lap', 'mac book', 'i pad', 'maylanh', 'dieuhoa', 'tulanh', 'maygiat', 'tainghe', 'manhinh', 'anc', 'caphe', 'tai phone', 'cuc sac']);
  // mo rong 1 chieu: khach go tu trai -> tim them cac cach goi cu the ben phai (khong nguoc lai)
  const ONEWAY = { 'o cung': ['ssd', 'hdd'], 'do choi': ['lego', 'xep hinh'], 'pc': ['may tinh de ban', 'pc gaming', 'may bo'], 'may tinh de ban': ['pc'], 'xe dien': ['xe dap dien', 'xe may dien'], 'dong ho thong minh': ['vong deo tay thong minh'], 'giay': ['sneaker'] };
  // tuong duong don vi (dieu hoa: 9000BTU ~ 1HP ...)
  const EQ = [['9000btu', '1hp'], ['12000btu', '1.5hp'], ['18000btu', '2hp'], ['24000btu', '2.5hp'], ['1tb', '1000gb'], ['2tb', '2000gb']];
  const EQM = new Map(); for (const [a, b] of EQ) { EQM.set(a, b); EQM.set(b, a); }
  const STOP = new Set(['cho', 'va', 'cua', 'loai', 'hang', 'chinh', 'gia', 're', 'tot', 'nhat', 'mua', 'moi', 'cai', 'chiec', 'con', 'mot', 'nhung', 'cac', 'voi', 'co', 'the', 'la', 'o', 'kk', 'mall', 'sp', 'san', 'pham', 'nao', 'gi', 'dang', 'can', 'tim', 'muon', 'hay', 'dep', 'xin', 'hot', 'sale']);
  const STOP_PHRASE = ['hang chinh hang', 'chinh hang', 'gia re', 'gia tot', 'cao cap', 'hang moi', 'moi nhat', 'khuyen mai', 'giam gia', 'free ship', 'freeship', 'san pham', 'gia bao nhieu', 'bao nhieu tien'].map(s => s.split(' '));
  const USED_Q = new Set(['cu', 'like new', 'da qua su dung', '2nd', 'second hand', 'likenew']);
  const ACC_Q = /\b(op|op lung|bao da|cap|day sac|cu sac|sac|cuong luc|mieng dan|dan|day deo|gia do|phu kien|tui|vo|case|cover|remote|dieu khien|linh kien|thay the|pin thay|ron|khay|loc thay|balo|ba lo|tay cam|day|quai|vo lang|can so)\b/;
  const ACC_DOC = /^(day (the thao|deo|silicon|da|thep|nylon|vai|cao su|kim loai|milanese|nhua|dong ho)|op|bao da|vo bao|cap|day sac|cu sac|cu cap|sac |mieng dan|dan |kinh cuong luc|cuong luc|day deo|gia do|gia treo|phu kien|tui |hop dung|nut|de sac|remote|dieu khien|bo dieu khien|linh kien|ron|khay|loi loc|mang loc|chan de|ke |op lung|tua vit|bo dan|bao ve|tham lot|vo |s buyback|buyback|tay cam|quai|(mat )?vo lang|can so)|\b(danh cho|tuong thich|thay the|cho may|cho tu|cho dieu hoa|op lung|bao da|tui da|tui chong soc|cap da|mieng dan|dan bao ve|dan man hinh|dan camera|dan full|cuong luc|day deo|cu sac|cap sac|buyback|thu cu)\b|\bcho (iphone|ipad|macbook|samsung|galaxy|airpods|apple watch|laptop|dien thoai|may tinh|tivi|tv|ps5|ps4|playstation|switch)\b|^(balo|ba lo|tui) .*\b(ps5|ps4|playstation|switch|may anh|camera|flycam)\b/;
  const ACC_GRP = new Set(['op lung phu kien', 'pin du phong sac']);
  const PART_OF = /^(?!xe dap|xe may|xe dien|xe day|xe tre|xe can|xe choi|xe scooter|xe cho|o to|xe hoi|may )(\S+ ){1,4}(xe dap|xe may|o to|xe hoi)\b/;   // do/linh kien "... xe dap" (yen, den, mu, khoa...) = phu kien cua xe
  const ACC_HEAD = new Set(['op lung', 'op', 'phu kien', 'pin du phong', 'sac du phong', 'pin sac du phong', 'sac', 'cu sac', 'cap sac', 'cuong luc']);   // khach tim dung nhom phu kien
  const ATTR_W = new Set(['mini', 'inverter', 'gaming', 'pro', 'max', 'plus', 'ultra', 'slim', 'lite', 'oled', 'qled', 'led', '4k', '8k', 'wifi', '5g', 'cam ung', 'chong nuoc', 'chong on', 'khong day', 'co day', 'tu dong', 'thong minh', 'smart', 'cao cap', 'gia dinh', 'van phong', 'du lich', 'xach tay', 'cam tay', 'mau den', 'mau trang', 'den', 'trang', 'do', 'xanh', 'hong', 'vang', 'xam', 'bac']);   // rang buoc kieu thuoc tinh co the noi long
  const SMALL = new Set(['mini', 'nho', 'nho gon', 'size nho', 'loai nho', 'compact']);
  const HARD = new Set(['nam', 'nu', 'tre em', 'be trai', 'be gai', 'unisex', 'nguoi lon', 'cho be', 'tre con', 'kid', 'kids']);
  const HEAD_SKIP = new Set(['combo', 'bo', 'set', 'hop', 'goi', 'loc', 'thung', 'cap', 'chinh', 'hang', 'new', 'moi', 'hot', 'sale', 'freeship', 'ha', 'noi', 'tphcm', 'hcm', 'date']);
  const KNOWN = new Set(['lego', 'nike', 'adidas', 'puma', 'gucci', 'chanel', 'dior', 'rolex', 'zara', 'uniqlo', 'ikea', 'dyson', 'bose', 'garmin', 'huawei', 'vivo', 'realme', 'nokia', 'sharp', 'hitachi', 'electrolux', 'bosch', 'tefal', 'lock', 'nestle', 'vinamilk', 'omo', 'ariel', 'tide', 'lavie', 'pepsi', 'coca', 'starbucks', 'nescafe', 'trung nguyen', 'highlands']);
  const GENERIC_BRAND = /^(kk select|no ?brand|oem|generic|combo|set|khac|khác|không thương hiệu|khong thuong hieu|sandal|attp|vsattp|decal|sticker|xe|led|view|nam|nữ|nu|tinh|cao|matcha|lifestyle|google|android|smart|mini|pro|plus|vn|vnxk|hàng việt nam|việt nam|viet nam|)$/i;
  const ATTR = /^(\d+(?:\.\d+)?)(gb|tb|inch|hp|btu|kg|l|w|mah|hz)$/;
  const ATTR_FAM = { gb: 'mem', tb: 'mem', inch: 'inch', hp: 'hp', btu: 'hp', kg: 'kg', l: 'l', w: 'w', mah: 'mah', hz: 'hz' };
  const DEV_GRP = new Set(['Điện thoại thông minh', 'Laptop văn phòng', 'Laptop gaming', 'MacBook', 'Máy tính bảng', 'PC & Linh kiện', 'Điện thoại phổ thông']);
  const ATTR_LABEL = { ram: 'RAM', rom: 'Bộ nhớ trong', mem: 'Dung lượng', inch: 'Kích thước', hp: 'Công suất lạnh', kg: 'Khối lượng', l: 'Dung tích', w: 'Công suất', mah: 'Dung lượng pin', hz: 'Tần số quét' };

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
  function lowerBound(a, x, key) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if ((key ? a[m][0] : a[m]) < x) lo = m + 1; else hi = m; } return lo; }
  function hasSorted(a, x) { let lo = 0, hi = a.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m] === x) return true; if (a[m] < x) lo = m + 1; else hi = m - 1; } return false; }
  function uniq(arr) { const s = new Set(), o = []; for (const a of arr) { const k = a.join(' '); if (!s.has(k)) { s.add(k); o.push(a); } } return o; }

  /* ================= XÂY CHỈ MỤC ================= */
  // rows: [sku,name,brand,cat,catName,grp,kk,stock,rating,sold,disc,fl]
  function build(rows) {
    const N = rows.length, post = new Map(), nameTok = new Array(N), nameLen = new Uint16Array(N), acc = new Uint8Array(N), toy = new Uint8Array(N), grpOf = new Uint16Array(N), brandOf = new Array(N);
    const groups = [], gIdx = new Map(), brandSet = new Set(), big = new Map(), tid = new Map(), tname = [], headIdx = new Uint8Array(N), brandCnt = new Map();
    const id = t => { let k = tid.get(t); if (k === undefined) { k = tname.length; tid.set(t, k); tname.push(t); } return k; };
    const FW = { b: 4, n: 3, g: 2.2, c: 1 };
    for (let i = 0; i < N; i++) {
      const r = rows[i], nt = toks(r[1]); nameTok[i] = nt; nameLen[i] = nt.length;
      const gk = r[3] + '|' + r[5]; let gi = gIdx.get(gk);
      if (gi === undefined) { gi = groups.length; gIdx.set(gk, gi); groups.push({ cat: r[3], grp: r[5], tok: toks(r[5]), segs: String(r[5] || '').split(/[,&/]/).map(toks).filter(x => x.length), ctok: toks(r[4]) }); }
      grpOf[i] = gi; const G = groups[gi];
      const generic = GENERIC_BRAND.test(String(r[2] || '').trim()), brand = generic ? [] : toksB(String(r[2])); brandOf[i] = generic ? '' : String(r[2]).trim();
      if (brand.length) { brandSet.add(brand.join(' ')); for (const t of new Set(brand)) brandCnt.set(t, (brandCnt.get(t) || 0) + 1); }
      const w = new Map();
      const add = (t, fw) => { if (!(w.get(t) >= fw)) w.set(t, fw); };
      for (let j = 0; j < nt.length; j++) {
        const t = nt[j]; add(t, FW.n);
        if (j + 1 < nt.length && /^[a-z]{1,4}$/.test(t) && (/[a-z]/.test(nt[j + 1]) && /\d{3}/.test(nt[j + 1]) || /^\d{4,}$/.test(nt[j + 1]))) add(t + nt[j + 1], FW.n * 0.9);  // ma model "VH-1209HP" ~ "vh1209hp"
        if (j + 1 < nt.length) { const k = id(t) * 1048576 + id(nt[j + 1]); big.set(k, (big.get(k) || 0) + 1); }   // dem cum 2 tu (tu dong nhan dien cum tu co dinh)
      }
      { const bs = new Set(brand); let h = 0; while (h < nt.length - 1 && h < 6 && (HEAD_SKIP.has(nt[h]) || bs.has(nt[h]) || /^\d+$/.test(nt[h]))) h++; headIdx[i] = h; }  // vi tri "dau ten" sau tu dem (Combo/Bo/Set), thuong hieu, so luong
      for (const t of brand) add(t, FW.b);
      for (const t of G.tok) add(t, FW.g);
      for (const t of G.ctok) add(t, FW.c);
      for (const [t, fw] of w) { let a = post.get(t); if (!a) post.set(t, a = []); a.push(i, fw); }
      const nf = nt.join(' '), gf = G.tok.join(' ');
      acc[i] = (ACC_DOC.test(nf) || ACC_GRP.has(gf) || PART_OF.test(nf)) ? 1 : 0;
      toy[i] = (/\b(do choi|mo hinh|lego)\b/.test(nf) || gf === 'do choi giao duc') ? 1 : 0;
    }
    const vocab = [...post.keys()].sort();
    const idf = new Map(); for (const [t, a] of post) idf.set(t, Math.log(1 + N / (a.length / 2)));
    const syn = new Map(); for (const g of SYN) for (const v of g) { const k = toks(v).join(' '); syn.set(k, (syn.get(k) || []).concat(g.map(x => toks(x)).filter(x => x.length))); }
    for (const [k, v] of syn) syn.set(k, uniq(v));
    const gHead = new Set(); for (const G of groups) for (const sg of G.segs) gHead.add(sg[0]);                 // tu dau ten nhom hang (loa, tu, may...) la LOAI HANG, khong phai thuong hieu du nguon ghi nham
    const brandTok = new Set(); for (const [t, c] of brandCnt) if (c >= 2 && t.length >= 2 && !/^\d+$/.test(t) && !gHead.has(t) && c / (post.get(t).length / 2) >= 0.3) brandTok.add(t);   // tu thuc su la thuong hieu (khong phai tu thuong lot vao ten hang)
    const BIG = new Set(), PHR = new Map();
    for (const [k, c] of big) { if (c < 6) continue; const a = tname[Math.floor(k / 1048576)], b = tname[k % 1048576], ab = a + ' ' + b; if (STOP.has(a) || STOP.has(b)) BIG.add(ab);
      else if (c >= 8 && !/^\d/.test(a) && !/^\d/.test(b) && !brandTok.has(a) && !brandTok.has(b)) { const da = post.get(a).length / 2, db = post.get(b).length / 2; const coh = c / Math.min(da, db); if (coh >= 0.05 || c >= 25) PHR.set(ab, coh); } }
    const isBrand = text => text.split(' ').every(t => brandTok.has(t));
    return { rows, N, post, vocab, idf, nameTok, nameLen, acc, toy, syn, groups, grpOf, brandOf, brandSet, brandTok, isBrand, BIG, PHR, headIdx, accC: new Map() };
  }

  /* từ đa nghĩa theo dấu (giày/giấy, đèn/đen, bàn/bản...): tính khi cần cho đúng từ khách gõ có dấu, lưu đệm */
  function accInfo(ix, f) {
    if (ix.accC.has(f)) return ix.accC.get(f);
    const P = ix.post.get(f); let out = null;
    if (P) {
      const by = new Map(); let tot = 0;
      for (let p = 0; p < P.length; p += 2) { const d = P[p], r = ix.rows[d], seen = new Set(); for (const w of words(r[1] + ' ' + r[5])) { if (foldW(w) !== f) continue; const k = vkey(w); if (seen.has(k)) continue; seen.add(k); let S = by.get(k); if (!S) by.set(k, S = new Set()); S.add(d); tot++; } }
      const big = [...by.values()].filter(S => S.size >= Math.max(3, tot * 0.04)).length;
      if (big >= 2) out = { by };                                            // chi loc khi tu nay THUC SU da nghia trong danh muc
    }
    if (ix.accC.size > 500) ix.accC.clear(); ix.accC.set(f, out); return out;
  }
  /* tìm các từ trong từ điển khớp 1 token truy vấn: chính xác / tiền tố (khi chưa gõ xong) / tách dính chữ / sửa lỗi */
  function expandTok(ix, t, isLast, typing, fix) {
    const out = [], exact = ix.post.has(t);
    if (exact) out.push([t, 1]);
    if (EQM.has(t) && ix.post.has(EQM.get(t))) out.push([EQM.get(t), 0.95]);
    if (/^\d+(\.\d+)?$/.test(t)) { // "55" khớp "55inch", "9" khớp "9kg" (số + đơn vị), không khớp "5500mah"
      const lo = lowerBound(ix.vocab, t);
      for (let k = lo; k < ix.vocab.length && ix.vocab[k].startsWith(t) && out.length < 40; k++) { const v = ix.vocab[k]; if (v !== t && /^[a-z]/.test(v.slice(t.length))) out.push([v, 0.95]); }
      return out;
    }
    // tien to: tu chua co trong tu dien (dang go do / ma model) - hoac dang go tu cuoi khi goi y
    const pw = !exact ? (isLast ? 0.85 : 0.6) : (isLast && typing && t.length >= 3 ? 0.4 : 0);
    if (pw && (t.length >= 2 && (isLast || t.length >= 3))) {
      const lo = lowerBound(ix.vocab, t), cand = [];
      for (let k = lo; k < ix.vocab.length && ix.vocab[k].startsWith(t) && cand.length < 400; k++) { const v = ix.vocab[k]; if (v !== t && !(exact && /^\d/.test(v.slice(t.length)))) cand.push(v); }   // "den" khong mo rong thanh ma "den42"
      cand.sort((a, b) => ix.post.get(b).length - ix.post.get(a).length);
      const dfx = exact ? ix.post.get(t).length : 0;
      for (const v of cand.slice(0, 60)) out.push([v, exact && ix.post.get(v).length > 3 * dfx ? 0.9 : pw]);   // "sam" dang go -> "samsung" pho bien hon han "sam" (sam)
    }
    if (out.length || /\d/.test(t)) return out;
    // sot phim Telex o cuoi tu ngan ("tur" -> "tu")
    if (t.length === 3 && /[sfrxj]$/.test(t) && ix.post.has(t.slice(0, 2))) { fix.push([t, t.slice(0, 2)]); return [[t.slice(0, 2), 0.8]]; }
    if (t.length >= 4) { // sua loi go
      if (KNOWN.has(t)) return out;                                           // ten that (vd LEGO) nhung danh muc chua co: khong "sua" thanh tu khac
      const max = t.length >= 8 ? 2 : 1, lmin = t.length === 4 ? 4 : t.length - max, lmax = t.length === 4 ? 4 : t.length + max; let best = [];
      for (const v of ix.vocab) {
        if (v.length < lmin || v.length > lmax || v[0] !== t[0] || /\d/.test(v)) continue;
        const d = dl(t, v, max); if (d <= max) best.push([v, d, ix.post.get(v).length]);
      }
      best.sort((a, b) => a[1] - b[1] || b[2] - a[2]); best = best.slice(0, 4);
      for (const [v, d] of best) out.push([v, d === 1 ? 0.7 : 0.5]);
      if (best.length) fix.push([t, best[0][0]]);
    }
    return out;
  }
  // go dinh chu: "noichien" -> "noi chien" (2 tu deu co trong tu dien)
  function splitTok(ix, t, depth) {
    if (t.length < 5 || /\d/.test(t) || ix.post.has(t)) return null;
    const lo = lowerBound(ix.vocab, t); if (lo < ix.vocab.length && ix.vocab[lo].startsWith(t)) return null;   // dang go do 1 tu co that ("iphon" -> iphone), khong tach
    let best = null;
    for (let i = 3; i <= t.length - 3; i++) {
      const a = t.slice(0, i), b = t.slice(i), pa = ix.post.get(a); if (!pa) continue;
      let parts = ix.post.has(b) ? [b] : null, sc = parts ? Math.min(pa.length, ix.post.get(b).length) : 0;
      if (!parts && depth !== 1) { const sub = splitTok(ix, b, 1); if (sub) { parts = sub; sc = Math.min(pa.length, ...sub.map(x => ix.post.get(x).length)); } }   // dinh 3 tu: "maylocnuoc"
      if (parts && (!best || sc > best[1])) best = [[a, ...parts], sc];
    }
    return best && best[1] >= 6 ? best[0] : null;
  }
  function phraseAt(nt, alt, pfxLast) { for (let i = 0; i + alt.length <= nt.length; i++) { let ok = true; for (let j = 0; j < alt.length; j++) { const a = alt[j], b = nt[i + j]; if (!(b === a || (pfxLast && j === alt.length - 1 && b.startsWith(a)))) { ok = false; break; } } if (ok) return i; } return -1; }

  /* tách truy vấn thành các KHÁI NIỆM (ưu tiên cụm dài trong từ điển đồng nghĩa) */
  function concepts(ix, qt, fix) {
    const out = []; let used = false;
    // sot phim Telex/VNI dinh cuoi tu ("tur lanh", "tu3 lanh") -> bo neu thanh cum tu co nghia voi tu ben canh
    for (let i = 0; i < qt.length; i++) { const t = qt[i]; if (t.length < 2 || t.length > 7 || !/^[a-z]+[sfrxj1-5]$/.test(t)) continue; const st = t.slice(0, -1); if (!ix.post.has(st)) continue;
      const common = ix.post.has(t) && ix.post.get(t).length > 40, bg = [i > 0 ? qt[i - 1] + ' ' + st : '', i + 1 < qt.length ? st + ' ' + qt[i + 1] : ''];
      const ok = bg.some(b => b && (ix.syn.has(b) || (!common && ix.PHR.has(b))));
      if (ok) { fix.push([t, st]); qt[i] = st; } }
    const isStopPhrase = i => { for (const p of STOP_PHRASE) { if (i + p.length <= qt.length && p.every((w, j) => qt[i + j] === w)) return p.length; } return 0; };
    for (let i = 0; i < qt.length;) {
      const last = n => i + n === qt.length;
      let sp = isStopPhrase(i); if (sp && qt.length > sp) { i += sp; continue; }
      let hit = null;
      for (let L = Math.min(4, qt.length - i); L >= 1; L--) { const k = qt.slice(i, i + L).join(' '); if (ix.syn.has(k)) { hit = [k, L]; break; } }
      if (hit) {
        const alts = ix.syn.get(hit[0]).filter(a => { const k = a.join(' '); return k === hit[0] || !ABBR.has(k); }).map(a => ({ t: a, typed: a.join(' ') === hit[0], exact: true }));
        for (const x of (ONEWAY[hit[0]] || [])) alts.push({ t: toks(x), typed: false, exact: true });
        out.push({ text: hit[0], alts, last: last(hit[1]), syn: true }); i += hit[1]; continue;
      }
      const t = qt[i];
      const two = i + 1 < qt.length ? t + ' ' + qt[i + 1] : '';
      if (two && USED_Q.has(two)) { used = true; i += 2; continue; }
      if (USED_Q.has(t) && !(two && ix.BIG.has(two)) && (qt.length > 1)) { used = true; i++; continue; }
      if (STOP.has(t) && qt.length > 1) {
        if (two && ix.BIG.has(two) && !STOP.has(qt[i + 1])) { out.push({ text: two, alts: [{ t: [t, qt[i + 1]], typed: true, exact: true }], last: last(2) }); i += 2; continue; }
        if (out.length && i > 0 && ix.BIG.has(qt[i - 1] + ' ' + t) && out[out.length - 1].alts.length === 1 && out[out.length - 1].alts[0].t.length === 1) { const p = out[out.length - 1]; p.text += ' ' + t; p.alts[0].t = [p.alts[0].t[0], t]; p.alts[0].exact = true; p.last = last(1); i++; continue; }
        i++; continue;
      }
      // cum 2 tu hay di lien nhau trong ten SP ("dong ho", "day da", "chay bo", "cua ngang") -> 1 khai niem
      const nx = i + 2 < qt.length ? qt[i + 1] + ' ' + qt[i + 2] : '';   // 2 cum chong nhau ("cap type c"): lay cum gan ket hon ("type c")
      if (two && !STOP.has(qt[i + 1]) && ix.PHR.has(two) && !(nx && (ix.PHR.get(nx) || 0) > ix.PHR.get(two)) && !(i + 2 < qt.length && [2, 3].some(L => i + 1 + L <= qt.length && ix.syn.has(qt.slice(i + 1, i + 1 + L).join(' '))))) { out.push({ text: two, alts: [{ t: [t, qt[i + 1]], typed: true, exact: true }], last: last(2), phrase: true }); i += 2; continue; }
      if (ONEWAY[t]) { out.push({ text: t, alts: [{ t: [t], typed: true }].concat(ONEWAY[t].map(x => ({ t: toks(x), typed: false, exact: true }))), last: last(1) }); i++; continue; }
      const sp2 = splitTok(ix, t);
      if (sp2) { out.push({ text: sp2.join(' '), alts: [{ t: sp2, typed: true, exact: true }], last: last(1), split: [t, sp2.join(' ')] }); i++; continue; }
      out.push({ text: t, alts: [{ t: [t], typed: true }], last: last(1) }); i++;
    }
    return { C: out, used };
  }

  /* ================= TRUY VẤN ================= */
  function query(ix, q, opt) {
    opt = opt || {};
    const typing = !!opt.typing;
    let qn = words2num(norm(q)); const price = parsePrice(qn); if (price) qn = qn.replace(norm(price.text), ' ').replace(/(^|\s)gia(\s|$)/g, ' ');
    const qt = qn.split(' ').filter(Boolean);
    if (typing && qt.length > 1 && /^[a-z]$/.test(qt[qt.length - 1])) qt.pop();   // dang go chu dau cua tu moi ("tai nghe b") -> chua dung de loc SP
    const qs = qt.join(' ');
    const wantToy = /\b(do choi|be|tre em|cho be|tre con|kid|kids|mo hinh|lego)\b/.test(qs), toy = ix.toy;
    const fix = [];
    const { C, used } = concepts(ix, qt, fix);
    // khai niem "loai hang" (tu chinh): khai niem dau tien khong phai thuong hieu / ma model / con so
    let ti = C.findIndex(c => !ix.isBrand(c.text) && !/\d/.test(c.text));
    const headQ = ti >= 0 ? C.slice(ti).map(c => c.text).join(' ') : qs;
    const wantAcc = ACC_Q.test(ti >= 0 ? C[ti].text : '') || ACC_DOC.test(headQ) || (ti >= 0 && C[ti].alts.some(a => ACC_HEAD.has(a.t.join(' '))));   // khach tim chinh 1 loai phu kien ("op lung...", "gia treo xe dap") - khong phai "dong ho day da"
    for (const c of C) if (c.split) fix.push(c.split);
    // dau khach go: chi ap khi tu do da nghia theo dau trong danh muc
    const pref = new Map();
    for (const w of words(q)) { const f = fold(w); if (w !== f) { const A = accInfo(ix, f); const a = A && A.by.get(vkey(w)); if (a && a.size) pref.set(f, a); } }
    // diem moi doc theo tung khai niem
    const per = C.map(c => {
      const m = new Map(), pos = new Map(), isSyn = c.alts.length > 1;
      const own = isSyn ? new Set(ix.groups.map((G, g) => c.alts.some(a => G.segs.some(sg => sg.length >= a.t.length && a.t.every((x, j) => sg[j] === x))) ? g : -1).filter(g => g >= 0)) : null;   // khai niem nhieu cach viet: dung chung 1 IDF (theo tap hop) - tu dong nghia hiem khong lan at cach khach go
      for (const alt of c.alts) {
        let accm = null;
        alt.t.forEach((t, j) => {
          const isLast = c.last && j === alt.t.length - 1;
          const ex = alt.typed && !alt.exact ? expandTok(ix, t, isLast, typing, alt.t.length === 1 ? fix : []) : (ix.post.has(t) ? [[t, alt.typed ? 1 : 0.95]] : []);
          if (alt.typed && alt.exact && EQM.has(t) && ix.post.has(EQM.get(t))) ex.push([EQM.get(t), 0.95]);
          const cur = new Map(), pa = pref.get(t);
          for (const [v, k] of ex) { const P = ix.post.get(v), w = (isSyn ? 1 : ix.idf.get(v)) * k; for (let p = 0; p < P.length; p += 2) { let s = P[p + 1] * w; if (pa && v === t && !pa.has(P[p])) continue; if (!(cur.get(P[p]) >= s)) cur.set(P[p], s); } }   // khach go co dau ("đèn") -> bo SP chi co cach viet khac ("đen")
          if (accm === null) accm = cur; else { const nx = new Map(); for (const [d, s] of cur) if (accm.has(d)) nx.set(d, accm.get(d) + s); accm = nx; }
        });
        if (!accm) continue;
        const L = alt.t.length, multi = L > 1, pfx = alt.typed && !alt.exact && c.last, norm1 = multi ? (1 + 0.1 * (L - 1)) / L : 1;
        for (const [d, s] of accm) {
          const nt = ix.nameTok[d], ps = phraseAt(nt, alt.t, pfx);
          let sc = s * norm1;                                                  // cum nhieu tu = 1 khai niem (khong cong don theo so tu)
          if (!alt.typed && own.size && !own.has(ix.grpOf[d])) sc *= 0.5;        // dong nghia khop o nganh khac (vd "dieu hoa noi tiet" khi go "may lanh") -> yeu
          if (multi && ps < 0) {
            if (phraseAt(ix.groups[ix.grpOf[d]].tok, alt.t, false) >= 0) sc *= 1;   // dung ten nhom hang
            else if (alt.typed && !c.syn && alt.t.every((x, j) => nt.some(y => y === x || (pfx && j === L - 1 && y.startsWith(x))))) sc *= 0.5;   // du tu trong ten nhung khong lien nhau
            else sc = 0;                                                       // tu nam rai rac o cac truong khac (vd "tu" o ten + "lanh" o nganh "Dien lanh") -> khong tinh
          } else if (multi) sc *= 1.1;
          if (!sc) continue;
          if (!(m.get(d) >= sc)) { m.set(d, sc); }
          if (ps >= 0 && !(pos.get(d) <= ps)) pos.set(d, ps);
        }
      }
      if (HARD.has(c.text)) for (const [d, s] of m) m.set(d, s * 2.5);       // doi tuong dung (nam/nu/tre em) la rang buoc manh khi phai noi long
      if (isSyn) { let df = 0; for (const v of m.values()) if (v >= 1.9) df++; const idfC = Math.log(1 + ix.N / Math.max(1, df || m.size)); for (const [d, s] of m) m.set(d, s * idfC); }
      return { m, pos };
    });
    // khai niem "loai hang" (tu chinh): khai niem dau tien khong phai thuong hieu / con so
    const need = C.length;
    let relaxed = false; const score = new Map(), hits = new Map();
    per.forEach(({ m }) => { for (const [d, s] of m) { score.set(d, (score.get(d) || 0) + s); hits.set(d, (hits.get(d) || 0) + 1); } });
    if (price) for (const d of [...hits.keys()]) { const v = ix.rows[d][6]; if (!(v >= price.range[0] && v <= price.range[1])) hits.delete(d); }   // loc gia TRUOC khi noi long
    let cand = [], partial = 0, missing = []; const tier = new Map();
    const TM = ti >= 0 ? per[ti].m : null;
    if (need && TM && !TM.size) missing = [C[ti].text];                            // loai hang khach can khong co trong danh muc -> bao that, khong tra hang khac loai
    else if (need) {
      const isMain = d => wantAcc || !ix.acc[d];
      const strict = [...hits].filter(([, n]) => n === need).map(([d]) => d), main = strict.filter(isMain);
      if (main.length >= 6 || need < 2) cand = strict;
      else {
        // khop du qua it HANG CHINH (vd 1 dien thoai + vai op lung, hoac chi co remote): them hang cung loai khop gan du,
        // giu loai hang + thuong hieu khach chon (chi bo bot model/thuoc tinh), xep TRUOC phu kien
        const gs = main.length ? new Set(main.map(d => ix.grpOf[d])) : null, inC = new Set(strict);
        const BR = per.filter((p, k) => ix.isBrand(C[k].text)).map(p => p.m);
        // khi DA co hang khop du: chi bo bot rang buoc kieu thuoc tinh/model ("a56", "chong nuoc", "2 canh") - khong bo tu trong ten rieng ("dac nhan tam")
        const drop = C.map(c => /\d/.test(c.text) || !!c.syn || ATTR_W.has(c.text));
        const okMiss = d => !main.length || per.every((p, k) => drop[k] || p.m.has(d));
        const pick = (h, keepBrand, onlyMain) => [...hits].filter(([d, n]) => n >= h && n < need && !inC.has(d) && (!TM || TM.has(d)) && (!gs || gs.has(ix.grpOf[d])) && (!keepBrand || BR.every(m => m.has(d))) && (!onlyMain || isMain(d)) && okMiss(d)).map(([d]) => d);
        let extra = [];
        const lo = main.length ? need - 1 : Math.max(1, Math.ceil(need / 2));
        outer: for (const [kb, om] of (main.length ? [[true, true]] : strict.length ? [[true, true], [false, true]] : [[true, true], [false, true], [true, false], [false, false]])) for (let h = need - 1; h >= lo; h--) { extra = pick(h, kb, om); if (extra.length) break outer; }
        if (!main.length && !extra.length) cand = strict;
        else {
          cand = strict.concat(extra); partial = main.length ? extra.length : 0; relaxed = !main.length;
          for (const d of extra) tier.set(d, main.length ? 1 : 0); for (const d of strict) if (!isMain(d)) tier.set(d, 2);
        }
      }
    }
    if (!need && price) cand = ix.rows.map((_, i) => i).filter(d => hitsOk(d)); // chi co gia: loc theo gia
    if (!need && !price && used) cand = ix.rows.map((_, i) => i).filter(i => (ix.rows[i][11] || 0) & 2);
    function hitsOk(d) { const v = ix.rows[d][6]; return v >= price.range[0] && v <= price.range[1]; }
    // tu khoa bi bo qua khi noi long
    let dropped = missing.slice();
    // xep hang
    const qPhr = C.filter(c => c.alts[0].t.length === 1).map(c => c.alts[0].t[0]);
    const T = ti >= 0 ? C[ti] : null;
    // "mini / nho gon" ma danh muc khong co dung chu: uu tien SP nho (gia thap hon trong cung loai)
    const ks = C.findIndex(c => SMALL.has(c.text)), pr = ks >= 0 ? cand.map(d => ix.rows[d][6]).filter(v => v > 0).sort((a, b) => a - b) : null;
    const pct = v => { let lo = 0, hi = pr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (pr[m] < v) lo = m + 1; else hi = m; } return pr.length ? lo / pr.length : 0.5; };
    const ranked = cand.map(d => {
      const r = ix.rows[d], nt = ix.nameTok[d], G = ix.groups[ix.grpOf[d]]; let s = score.get(d) || 0;
      const h = hits.get(d) || 0; s *= Math.pow(h / Math.max(1, need), 2);   // phat khop thieu (che do noi long)
      s /= 1 + 0.035 * Math.max(0, ix.nameLen[d] - 10);                     // ten qua dai/nhoi tu khoa
      // cum tu dung thu tu trong ten
      if (qPhr.length >= 2) { for (let i = 0; i + 1 < nt.length; i++) for (let j = 0; j + 1 < qPhr.length; j++) if (nt[i] === qPhr[j] && nt[i + 1].startsWith(qPhr[j + 1])) s *= 1.12; }
      // LOAI HANG: ten bat dau bang loai hang khach can > co trong ten > chi khop nhom hang > khong co
      if (T) {
        let p = per[ti].pos.get(d); if (p !== undefined) p = Math.max(0, p - ix.headIdx[d]);
        const segHead = T.alts.some(a => G.segs.some(sg => sg.length >= a.t.length && a.t.every((x, j) => sg[j] === x)));
        if (p === 0) s *= 1.4; else if (p !== undefined && p <= 2) s *= 1.05; else if (p !== undefined) s *= 0.95; else if (segHead) s *= 1.1; else if (per[ti].m.has(d)) s *= 0.4; else s *= 0.35;   // chi khop o ten NGANH (vd "Laptop & May tinh" chua ca man hinh) -> yeu
      }
      // y dinh nhom hang: khai niem trung DAU 1 doan ten NHOM cua SP (vd "may lanh" -> "May lanh / Dieu hoa"; "ca phe" KHONG an theo "May pha ca phe")
      let gi = 0; for (const c of C) if (c.alts.some(a => G.segs.some(sg => sg.length >= a.t.length && a.t.every((x, j) => sg[j] === x)))) gi++;
      if (gi) s *= 1 + 0.5 * gi / Math.max(1, need);
      if (ix.acc[d] && !wantAcc) s *= 0.3;                                   // khong hoi phu kien -> day phu kien xuong
      if (toy[d] && !wantToy) s *= 0.4;                                      // do choi mo phong ("do choi tu lanh") khi khach khong tim do choi
      if (!ix.acc[d] && wantAcc) s *= 0.85;
      const fl = r[11] || 0;
      if (!r[7]) s *= 0.55; if (fl & 1) s *= 0.4; if (fl & 32) s *= 0.6;
      if (fl & 2) s *= used ? 1.6 : 0.85;
      if (r[8] > 0) s *= 1 + Math.max(0, r[8] - 4) * 0.03;                   // danh gia that cua nguoi da mua
      if (pr && pr.length && !per[ks].m.has(d)) s *= 1.3 - 0.6 * pct(r[6]);
      return [d, s, tier.get(d) || 0];
    }).sort((a, b) => a[2] - b[2] || b[1] - a[1]);
    // tu khoa bi bo qua khi noi long: vang mat o phan lon ket qua dau trang ma khach nhin thay
    if (relaxed && ranked.length) { const T30 = ranked.filter(x => !x[2]).slice(0, 30).map(x => x[0]); C.forEach((c, k) => { let n = 0; for (const d of T30) if (per[k].m.has(d)) n++; if (n < T30.length * 0.5) dropped.push(c.text); }); }
    const lim = opt.limit || 60, top = ranked.length ? ranked[0][1] : 1;
    const R1 = ranked.filter(x => x[1] >= top * (x[2] ? 0.03 : 0.08));      // cat duoi ket qua qua yeu (rac)
    // loc thuoc tinh khach chon (bo loc "55 inch", "256GB"...): SP phai co dung gia tri trong ten (tinh ca tuong duong 12000BTU = 1.5HP)
    const must = (opt.must || []).map(t => norm(t)).filter(Boolean);
    const R2 = must.length ? R1.filter(([d]) => must.every(t => ix.nameTok[d].includes(t) || (EQM.has(t) && ix.nameTok[d].includes(EQM.get(t))))) : R1;
    // nhom hang noi bat (goi y loc)
    const gc = new Map(); for (const [d, sc] of R2.slice(0, 300)) if (sc >= top * 0.3) { const g = ix.grpOf[d]; gc.set(g, (gc.get(g) || 0) + 1); }
    const groups = [...gc].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g, n]) => ({ cat: ix.groups[g].cat, grp: ix.groups[g].grp, n }));
    const out = { ids: R2.slice(0, lim).map(x => x[0]), skus: R2.slice(0, lim).map(x => ix.rows[x[0]][0]), rel: R2.slice(0, lim).map(x => Math.round(x[1] / top * 100) / 100), total: R2.length, relaxed, dropped, missing, partial, fix: uniq(fix.map(f => [f[0], f[1]])).filter(f => f[0] !== f[1]), price: price ? price.range : null, groups, concepts: C.map(c => c.text), used };
    if (opt.facets) Object.assign(out, facets(ix, R1, top, qt));
    return out;
  }

  /* ---------- bộ lọc sau tìm kiếm: thuộc tính (GB, inch, HP...), thương hiệu, khoảng giá ---------- */
  function niceRound(v) { if (v <= 0) return 0; const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m < 1.5 ? 1 : m < 2.5 ? 2 : m < 4 ? 3 : m < 7.5 ? 5 : 10) * p; }
  function facets(ix, R2, top, qt) {
    const strong = R2.filter(x => x[1] >= top * 0.3).slice(0, 1500).map(x => x[0]);
    const inQ = new Set(qt), fam = new Map(), bc = new Map(), prices = [];
    const accTop = strong.filter(d => ix.acc[d]).length > strong.length / 2;
    const dev = strong.filter(d => DEV_GRP.has(ix.groups[ix.grpOf[d]].grp)).length > strong.length / 2;   // dien thoai / laptop: GB nho = RAM, GB lon = bo nho trong   // ket qua chu yeu la phu kien -> giu; nguoc lai thuong hieu chi tinh tren hang chinh
    for (const d of strong) {
      const r = ix.rows[d]; if (r[6] > 0) prices.push(r[6]);
      const b = ix.brandOf[d]; if (b && (accTop || !ix.acc[d]) && !/\d/.test(b) && ix.isBrand(toksB(b).join(' '))) bc.set(b, (bc.get(b) || 0) + 1);
      const seen = new Set();
      for (const t of ix.nameTok[d]) { const m = t.match(ATTR); if (!m || seen.has(t) || inQ.has(t)) continue; seen.add(t); let f = ATTR_FAM[m[2]]; if (f === 'mem' && dev) f = m[2] === 'gb' && parseFloat(m[1]) < 100 ? 'ram' : 'rom'; let a = fam.get(f); if (!a) fam.set(f, a = new Map()); a.set(t, (a.get(t) || 0) + 1); }
    }
    const val = t => { const m = t.match(ATTR); const v = parseFloat(m[1]); return m[2] === 'tb' ? v * 1000 : m[2] === 'btu' ? v / 9000 : v; };
    const attrs = [...fam].map(([f, a]) => ({ f, label: ATTR_LABEL[f], v: [...a].filter(([, n]) => n >= Math.max(2, strong.length * 0.02)).sort((x, y) => val(x[0]) - val(y[0])).slice(0, 10) }))
      .filter(x => x.v.length >= 2 && x.v.reduce((s, [, n]) => s + n, 0) >= strong.length * 0.4 && x.v.some(([, n]) => n >= Math.max(3, strong.length * 0.08))).sort((a, b) => b.v.reduce((s, [, n]) => s + n, 0) - a.v.reduce((s, [, n]) => s + n, 0)).slice(0, 3);
    const brands = [...bc].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([brand, n]) => ({ brand, n }));
    let buckets = [];
    if (prices.length >= 12) {
      prices.sort((a, b) => a - b); const q = p => prices[Math.min(prices.length - 1, Math.floor(prices.length * p))];
      const cuts = [...new Set([q(0.25), q(0.5), q(0.75)].map(niceRound))].filter(v => v > prices[0] && v < prices[prices.length - 1]).sort((a, b) => a - b);
      const edges = [0, ...cuts, 1e12];
      for (let k = 0; k + 1 < edges.length; k++) { const lo = edges[k], hi = edges[k + 1]; const n = prices.filter(v => v >= lo && v < hi).length; if (n) buckets.push({ min: lo, max: hi >= 1e12 ? 0 : hi, n }); }
      if (buckets.length < 2) buckets = [];
    }
    return { attrs, brands, buckets };
  }

  /* ---------- gợi ý khi gõ: hoàn thành cụm từ có dấu ---------- */
  function buildComp(ix) {
    const cnt = new Map(), surf = new Map();
    const put = (key, s, w) => { if (!key) return; cnt.set(key, (cnt.get(key) || 0) + w); if (!surf.has(key)) surf.set(key, s); };
    const clean = w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+]+$/gu, '');
    for (let i = 0; i < ix.N; i++) {
      const r = ix.rows[i]; if (!r[7] && (r[11] || 0) & 1) continue;
      const ws = String(r[1] || '').toLowerCase().normalize('NFC').split(/\s+/).map(clean).filter(Boolean);
      const seen = new Set(); let stop = Math.min(ws.length, 4); const fw = [];
      for (let k = 0; k < stop; k++) { const w = ws[k], f = foldW(w); if (/\d/.test(w) && /[a-z]/.test(f) && w.length >= 5 || /[/(),|]/.test(w)) { stop = k; break; } fw.push(f); }
      let key = '', sf = '';
      for (let L = 0; L < stop; L++) { key = L ? key + ' ' + fw[L] : fw[0]; sf = L ? sf + ' ' + ws[L] : ws[0]; if (!seen.has(key)) { seen.add(key); put(key, sf, 1); } }
      const b = ix.brandOf[i]; if (b) { const bf = foldW(b.toLowerCase()), k = fw.indexOf(bf); if (k >= 1 && k <= 3) { const s2 = b.toLowerCase() + ' ' + ws.slice(0, k).join(' '), k2 = bf + ' ' + fw.slice(0, k).join(' '); if (!seen.has(k2)) { seen.add(k2); put(k2, s2, 1); } } }
    }
    for (const g of ix.groups) for (const sg of String(g.grp).split(/[,&/]/)) { const s = sg.trim().toLowerCase(); if (s) put(fold(s), s, 3); }
    const arr = [];
    // bo cum dang do: "noi chien khong" gan nhu luon di voi "dau" -> chi goi y "noi chien khong dau"
    const half = new Set(); for (const [k, c] of cnt) { const j = k.lastIndexOf(' '); if (j > 0) { const par = k.slice(0, j), pc = cnt.get(par); if (pc && c >= pc * 0.75) half.add(par); } }
    for (const [k, c] of cnt) { if (c < 3 || k.length < 2 || half.has(k)) continue; const L = k.split(' ').length; if (c >= (L === 1 ? 6 : 3)) arr.push([k, c, surf.get(k)]); }
    arr.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return arr;
  }
  function completions(ix, q, n) {
    if (!ix.comp) ix.comp = buildComp(ix);
    const p = fold(q).replace(/[^a-z0-9.+ ]+/g, ' ').replace(/\s+/g, ' ').trim(); if (!p) return [];
    const pw = p.split(' ').length, A = ix.comp, out = [];
    for (let k = lowerBound(A, p, true); k < A.length && A[k][0].startsWith(p); k++) {
      const [key, c, s] = A[k]; if (key === p) continue;
      const extra = key.split(' ').length - pw + (A[k][0][p.length] === ' ' ? 0 : 1);
      if (extra > 3) continue;
      out.push({ t: s, n: c, sc: c / (1 + 0.5 * Math.max(0, extra - 1)) });
    }
    out.sort((a, b) => b.sc - a.sc);
    const res = []; for (const o of out) { if (res.some(x => x.t === o.t)) continue; res.push({ t: o.t, n: o.n }); if (res.length >= n) break; }
    return res;
  }
  function suggest(ix, q, opt) {
    opt = opt || {};
    const r = query(ix, q, { limit: opt.limit || 6, typing: true, facets: true });
    let done = completions(ix, q, opt.done || 6);
    if (!done.length && r.fix.length) { let qq = fold(q); for (const [a, b] of r.fix) qq = qq.replace(new RegExp('\\b' + a + '\\b'), b); done = completions(ix, qq, opt.done || 6); }
    return { done, ids: r.ids, total: r.total, groups: r.groups, brands: r.brands.slice(0, 5), fix: r.fix, price: r.price, relaxed: r.relaxed, dropped: r.dropped };
  }

  const API = { build, query, suggest, completions, norm, fold, parsePrice, words2num, vkey, version: '2.0.0' };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.KKS = API;
})(typeof self !== 'undefined' ? self : this);
