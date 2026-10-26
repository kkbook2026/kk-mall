'use strict';
/*
 * BO NAP DATAFEED CHINH THUC - chay song song trong bo thu thap 3 gio/lan.
 * Nguon hop phap: file/API danh sach san pham ma san TMDT / mang affiliate cap cho doi tac
 * (AccessTrade, Shopee/Lazada/Tiki/TikTok Affiliate, feed doi tac B2B cua TGDD/DMX/FPT/CellphoneS...).
 * KHONG quet trang web cua san bang bot.
 *
 * Cau hinh (GitHub Secret FEED_URLS) - moi dong 1 feed:  <ma-nguon>|<url>
 *   vd:  tiki|https://.../tiki-datafeed.csv
 *        shopee|https://.../shopee-feed.json
 *        lazada|https://.../google-shopping.xml
 * Ma nguon thuoc 10 nguon noi bo (dienmayxanh, thegioididong, fptshop, cellphones, dienmaycholon,
 * tiki, shopee, tiktok, lazada, sendo). Ho tro CSV/TSV, JSON, Google Shopping XML/RSS.
 * (c) Nguyen Duy Dien (KK-2026). All rights reserved.
 */

const SOURCES = ['dienmayxanh', 'thegioididong', 'fptshop', 'cellphones', 'dienmaycholon', 'tiki', 'shopee', 'tiktok', 'lazada', 'sendo', 'hoangha', 'phucanh', 'anphat'];
const CONCURRENCY = 4, TIMEOUT_MS = 90000, MAX_BYTES = 80 * 1024 * 1024;

/* ---------- cau hinh ---------- */
function feedList(env) {
  const out = [];
  for (const line of String(env.FEED_URLS || '').split(/[\n,;]+/)) {
    const m = line.trim().match(/^([a-z0-9_-]+)\s*\|\s*(https?:\/\/\S+)$/i);
    if (m && SOURCES.includes(m[1].toLowerCase())) out.push({ src: m[1].toLowerCase(), url: m[2] });
  }
  if (env.SENDO_FEED_URL && /^https?:\/\//.test(env.SENDO_FEED_URL)) out.push({ src: 'sendo', url: env.SENDO_FEED_URL.trim() });
  return out;
}

/* ---------- tai song song co gioi han ---------- */
async function fetchText(url) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { 'user-agent': 'KK-MALL-FeedReader/1.0 (+https://www.kk-mall.com)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('feed qua lon');
    return { text: buf.toString('utf8'), type: r.headers.get('content-type') || '' };
  } finally { clearTimeout(t); }
}
async function pool(items, n, fn) {
  const res = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; res[k] = await fn(items[k], k); } }));
  return res;
}

/* ---------- doc moi dinh dang ---------- */
function parseCSV(text) {
  const head = text.slice(0, 5000).split(/\r?\n/)[0];
  const d = (head.match(/\t/g) || []).length > (head.match(/,/g) || []).length ? '\t' : ((head.match(/;/g) || []).length > (head.match(/,/g) || []).length ? ';' : ',');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === d) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const h = (rows.shift() || []).map(x => x.replace(/^\uFEFF/, '').trim());
  return rows.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
function parseXML(text) {
  const out = [];
  const dec = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').trim();
  for (const m of text.matchAll(/<(item|entry|product)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const o = {};
    for (const t of m[2].matchAll(/<([a-z0-9_:]+)\b[^>]*>([\s\S]*?)<\/\1>/gi)) { const k = t[1].replace(/^g:/i, ''); if (!(k in o)) o[k] = dec(t[2]); }
    for (const t of m[2].matchAll(/<link\b[^>]*href="([^"]+)"/gi)) if (!o.link) o.link = t[1];
    out.push(o);
  }
  return out;
}
function parseAny(text, type) {
  const s = text.trimStart();
  if (/json/i.test(type) || s[0] === '[' || s[0] === '{') {
    const j = JSON.parse(s);
    const arr = Array.isArray(j) ? j : (j.products || j.items || j.data || j.results || (j.data && j.data.items) || []);
    return Array.isArray(arr) ? arr : [];
  }
  if (/xml|rss/i.test(type) || s[0] === '<') return parseXML(s);
  return parseCSV(text);
}

/* ---------- chuan hoa ban ghi ---------- */
const pick = (o, keys) => { for (const k of keys) { for (const kk of Object.keys(o)) if (kk.toLowerCase().replace(/[\s_-]/g, '') === k) { const v = o[kk]; if (v != null && String(v).trim() !== '') return v; } } return ''; };
/* Gia VND: xu ly ca "1.290.000 ₫", "1,290,000", "1290000.00", "1 290 000 VND" - tranh nham dau cham/phay */
function parsePrice(v) {
  if (typeof v === 'number') return Math.round(v);
  let s = String(v || '').replace(/[^\d.,]/g, '');
  if (!s) return 0;
  s = s.replace(/[.,]\d{1,2}$/, '');          // bo phan thap phan (VND khong co le)
  const n = parseInt(s.replace(/[.,]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}
const inStockOf = v => { const s = String(v ?? '').toLowerCase().trim(); if (!s) return 1; return /^(1|true|yes|in.?stock|instock|available|con.?hang|còn hàng|preorder)$/.test(s) || /in stock|còn hàng/.test(s) ? 1 : (/^\d+$/.test(s) ? (+s > 0 ? 1 : 0) : 0); };
function normRow(o) {
  const name = String(pick(o, ['title', 'name', 'productname', 'tensanpham']) || '')
    // BI MAT KINH DOANH: xoa moi dau vet ten san / kenh ban khoi ten san pham truoc khi len web
    .replace(/[\[(【]?\s*(tiki\s*trading|tikinow|shopee\s*mall|lazmall|lazada|shopee|tiki|sendo|tiktok\s*shop|tiktok|điện máy xanh|dien may xanh|thế giới di động|the gioi di dong|fpt\s*shop|cellphones|chợ lớn|cho lon|hoàng hà mobile|hoang ha mobile|hoanghamobile|phúc anh|phuc anh|phucanh|an phát computer|an phat computer|anphatpc|an phát pc)\s*[\])】]?/gi, ' ')
    .replace(/\s+/g, ' ').replace(/^[\s\-–|:]+|[\s\-–|:]+$/g, '').trim();
  const sale = parsePrice(pick(o, ['saleprice', 'discountprice', 'giaban', 'finalprice', 'price_sale'.replace(/_/g, '')]));
  const reg = parsePrice(pick(o, ['price', 'gia', 'originalprice', 'listprice', 'regularprice']));
  const price = sale > 0 && (!reg || sale <= reg) ? sale : reg;
  return {
    name, price, list: reg && reg > price ? reg : 0,
    image: String(pick(o, ['imagelink', 'image', 'imageurl', 'thumbnail', 'anh', 'img']) || '').trim(),
    url: String(pick(o, ['link', 'url', 'producturl']) || '').replace(/^(?!https:\/\/).*$/is, '').replace(/^https?:\/\/(go\.isclix\.com|shorten\.asia|s\.shopee\.vn|c\.lazada\.vn)\/\S*$/i, '').trim(), /* bo link rut gon / affiliate */
    brand: String(pick(o, ['brand', 'thuonghieu', 'manufacturer']) || '').trim(),
    cat: String(pick(o, ['producttype', 'googleproductcategory', 'category', 'categoryname', 'danhmuc', 'cate']) || '').trim(),
    stock: inStockOf(pick(o, ['availability', 'instock', 'stock', 'tinhtrang', 'quantity'])),
    id: String(pick(o, ['id', 'sku', 'productid', 'itemid']) || '').trim(),
  };
}

/* ---------- phan loai vao 77 nhom (khong dau, theo ten + duong dan danh muc feed) ---------- */
const nd = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
/* Luat phan loai: [nhom, regex tren chuoi KHONG dau (co ranh gioi tu), regex xac nhan tren chuoi CO dau (tuy chon)]
   Thu tu quan trong: loai tru -> thiet bi y te -> do choi -> sach -> thuc pham dac thu -> dien tu -> gia dung -> thoi trang... */
const W = alt => new RegExp('(^|[^\\p{L}\\p{N}])(' + alt + ')(?![\\p{L}\\p{N}])', 'u'); // nguyen tu, ho tro chu co dau
const EXCLUDE = /\b(buyback|cam ket gia thu|bao cao su|gel boi tron|do choi nguoi lon|sextoy|thuoc la|vape|pod dien tu|ruou|bia \d|thuoc ke don)\b/;
const RULES = [
  /* --- Uu tien cao: tu de nham nhom (rà soát 26/10/2026) --- */
  ['Thực phẩm chức năng', /\bdieu hoa (kinh nguyet|noi tiet|huyet ap|tieu hoa|than nhiet|hormone|chu ky|mo mau|kinh)\b|\b(kinh nguyet|noi tiet to|ich mau|bo huyet)\b|\b(ho tro|giup|vien|bot|powder|siro|phan hoa|tra|nuoc uong|cao|thuc pham)\b.*\bdieu hoa\b(?! (inverter|\d|mot chieu|hai chieu|2 chieu|1 chieu))|\bdieu hoa (chuc nang|giac ngu|co the|sinh ly|than kinh|nhip tim|duong ruot|mien dich)\b/],
  ['Nội thất phòng ngủ', /\b(chieu|dem|nem|goi|chan|tam lot)( \w+)? dieu hoa\b/],
  ['Quạt & Máy lọc không khí', /\bquat (dieu hoa|hoi nuoc|lam mat)\b|\bmay lam mat khong khi\b/, W('quạt')],
  ['Dụng cụ & Sửa chữa', /^(tua vit|bo tua vit)\b|\bbo dung cu sua chua\b/, W('tua vít|tuốc nơ vít|dụng cụ sửa chữa')],
  ['Túi xách & Ba lô', /\b(bao da|tui|cap|balo|ba lo)\b.*\b(laptop|macbook|surface|may tinh xach tay)\b/, W('túi|cặp|balo|ba lô|bao da')],
  ['Ốp lưng & Phụ kiện', /^(?!.*\bbang keo\b).*\b(dan|bo dan|mieng dan|op|op lung|op vien|bao da|kinh cuong luc|cuong luc|bao ve camera)\b.*\b(iphone|ipad|samsung|galaxy|macbook|laptop|airpods|apple watch|dien thoai|xiaomi|oppo|vivo|realme|surface|man hinh|camera|tab)\b/, W('dán|bộ dán|miếng dán|ốp|ốp lưng|ốp viền|bao da|kính cường lực|cường lực|bảo vệ camera')],
  /* --- Bo sung tu phan tich du lieu feed that (mau ban ghi chua phan loai) --- */
  ['Thiết bị làm đẹp & sức khỏe', /\b(kem cat da|kem mong|kem nghia|dua mong|sui da|bam mong|cat mong|son mong|may lam mong)\b/],
  ['Chăm sóc da', /\b(tham dau|phim tham|giay tham)\b/],
  ['Sách', /\b(bach khoa|ngu phap|ngu ngon|cuon sach|tu sach|thai giao|an dam kieu|tu dien|sach to mau|vo tap to)\b/],
  ['Chăm sóc nhà cửa', /\b(cay lau nha|bo lau nha|choi quet|ro rac|thung rac|tham lau chan|moc phoi|gian phoi)\b/],
  ['Đồ dùng nhà bếp', /\b(ly giu nhiet|coc giu nhiet|binh nuoc|tumbler|hop com)\b/],
  ['Trang trí & Cây cảnh', /\b(khan trai ban|decal|giay dan tuong|rem cua|tham trai san|tranh dan|guong trang tri|den led day trang tri)\b/],
  ['Dụng cụ thể thao', /\b(dai ho tro|bang quan|van truot|patin|giay truot|bao ho dau goi|bong tap)\b/],
  ['Văn phòng phẩm', /\b(cap tai lieu|file tai lieu|kep tai lieu|so con|lich ban|bang trang)\b/],
  ['Thực phẩm chức năng', /\b(saffron|nhuy hoa nghe tay|yen sao|to yen|dong trung|nhung huou)\b/],
  ['An ninh & Nhà thông minh', /\bkhoa\b/, W('khóa|khoá')],
  ['Thiết bị làm đẹp & sức khỏe', /\b(khau trang|bang gau|bang gac|bang dan vet thuong|nuoc muoi sinh ly|gay chong|tam chan giot ban|que thu|may do spo2|dai lung|nep co dinh)\b/],
  ['Thời trang nữ', /\b(ao bau|vay bau|dam bau|quan bau|do bau|quan dui bau|vay ngu|do ngu nu|ao nguc|quan lot nu)\b/],
  ['Đồ chơi & Giáo dục', /\b(sieu nhan|khung long|xe sat|xe do choi|o to do choi|bo do choi|tro choi|dat set|but sap|to mau)\b/],
  ['Sách', /\b(combo \d* ?(cuon|quyen|tap)|\d+ (cuon|quyen)|tron bo \d+|truyen (tranh|ngan|co tich|song ngu|cho tre)|song ngu|tac gia|luyen thi|cambridge|ky nang song|tieu su|hoi ky|tuyen tap|giao khoa)\b/],
  ['Chăm sóc tóc & cơ thể', /\b(u toc|xa toc|duong toc|thuoc nhuom|xa phong|soap|da tam|tay da chet|tinh dau|dau lan|dau gio|lan khu mui|sap thom|muoi tam)\b/],
  ['Thực phẩm chức năng', /\b(\d+ vien|vien (sui|ngam|uong|bo|nang)|thao duoc|glucosamine|curcumin|ho tro (dieu tri|xuong|gan|than|tieu|tim|tri nho|giam can)|bo gan|bo nao|giai doc|mat gan|tao xoan|spirulina|nam lim|hoa anh thao|q10|probiotic|sam to|cao ich mau)\b/],
  ['Thực phẩm khô & Gia vị', /\b(say kho|\d+ ?(kg|gram)\b.*\bkho\b|\bkho\b.*\b\d+ ?(kg|gram|g)\b|tinh bot|ngu coc|bot san|nam (ngoc cau|huong|meo)|tra hoa|hat (sen|ky tu))\b/],
  ['Bánh kẹo & Snack', /\b(sun ga|chan ga|an vat|kho ga la chanh|bim bim|ca vien|thit kho)\b/],
  ['Đồ dùng nhà bếp', /\b(coc thuy tinh|coc dong|ly thuy tinh|phieu|khuon (silicon|banh|3d|lam banh)|binh thuy tinh|hu thuy tinh|bat trang)\b/],
  ['Trang điểm', /\bson\b/, W('son|son tint|son dưỡng')],
  ['Mắt kính & Phụ kiện', /\b(bang do|headband|kep toc|cot toc|khan choang)\b/],
  ['Dụng cụ & Sửa chữa', /\b(gang tay (chong cat|bao ho|lao dong)|bao ho lao dong|kinh bao ho|ung bao ho)\b/],
  ['Máy tập & Gym', /\b(don ta|banh ta|ghe tap|xa kep)\b/],
  ['Văn phòng phẩm', /\b(dap ghim|bam kim|ghim bam|bang keo|bang dinh|hop ghim|giay note|but highlight)\b/],
  ['Thiết bị làm đẹp & sức khỏe', /\b(may do huyet ap|nhiet ke|may do duong huyet|may xong|may massage|may say toc|may duoi toc|may uon toc|may cao rau|may rua mat|ban chai dien|may tam nuoc|may xong mui|may tri lieu)\b/],
  ['Đồ chơi & Giáo dục', /\b(do choi|lego|xep hinh|bup be|xe mo hinh|mo hinh|robot do choi|slime|rubik|bo xep|dat nan|board game|boardgame)\b/],
  ['Sách', /^(sach|combo sach|bo sach|truyen)\b|\b(tieu thuyet|truyen tranh|giao trinh|nxb|nha xuat ban|tai ban|ielts|toeic|tieng anh lop|sach giao khoa|light novel|manga)\b/],
  ['Thực phẩm chức năng', /\b(vitamin|thuc pham chuc nang|collagen|omega|vien uong|canxi|men vi sinh|tpcn|bo sung duong chat|sam han quoc|dong trung ha thao|linh chi|tinh chat hau)\b/],
  ['Thực phẩm khô & Gia vị', /\b(toi den|o mai|rau muc|kho ga|kho bo|kho muc|kho ca|cha bong|ruoc|mat ong|giao co lam|tra thao moc|tra xanh|tra sam|nam huong|hat chia|hat dieu|oc cho|macca|gao|mi goi|mi an lien|nuoc mam|dau an|gia vi|hat nem|bot ngot|tuong ot|nuoc tuong|mi chinh|bun kho|pho kho|mien|bot mi|duong phen|sot)\b/],
  ['MacBook', /\bmacbook\b/], ['Laptop gaming', /\blaptop\b.*\b(gaming|rtx|rog|legion|predator|nitro|tuf|victus|omen|katana|cyborg)\b|\b(gaming|rtx)\b.*\blaptop\b/],
  ['Laptop văn phòng', /\b(laptop|may tinh xach tay|notebook|ultrabook|vivobook|ideapad|thinkpad|inspiron|vostro|zenbook)\b/],
  ['Máy tính bảng', /\b(ipad|may tinh bang|tablet|galaxy tab|xiaomi pad|redmi pad|oppo pad|matepad)\b/],
  ['Ốp lưng & Phụ kiện', /\b(op lung|cuong luc|dan man hinh|bao da|gia do|de dan|gia ke|cap sac|day sac|gay tu suong|tripod|kinh cuong luc|mieng dan)\b/],
  ['Pin dự phòng & Sạc', /\b(pin (sac )?du phong|power ?bank|cu sac|sac nhanh|adapter sac|sac khong day|coc sac)\b/],
  ['Smart Tivi', /\b(tivi|smart tv|google tv|android tv)\b|\btv\b.*\b(inch|4k|oled|qled)\b/],
  ['Màn hình máy tính', /\bman hinh (may tinh|gaming|lcd|cong)\b|^man hinh .*\binch\b|\bmonitor\b/],
  ['Máy chiếu', /\b(may chieu|projector)\b/],
  ['Điện thoại phổ thông', /\b(dien thoai pho thong|masstel|mobell|feature phone)\b|\bnokia 1[01]\d\b/],
  ['Điện thoại thông minh', /\b(iphone \d+|galaxy [asz]\d+|redmi note|oppo (reno|find|a\d+)|vivo [vyx]\d+|realme \w+|xiaomi \d{2}t?|honor \d+|smartphone)\b|\bdien thoai\b.*\b(\d+gb|5g|4g lte)\b/],
  ['Đồng hồ thông minh', /\b(dong ho thong minh|smart ?watch|apple watch|galaxy watch|vong deo tay thong minh|mi band|huawei band|watch fit|amazfit|garmin)\b/],
  ['Tai nghe không dây', /\b(tai nghe|airpods|earbuds|headphone|buds)\b/],
  ['Loa kéo & Karaoke', /\b(loa keo|karaoke|micro khong day)\b/],
  ['Loa thanh & Dàn âm thanh', /\b(loa thanh|soundbar|dan am thanh|amply|loa vi tinh|loa may tinh)\b/],
  ['Loa Bluetooth', /\bloa (bluetooth|di dong|jbl|marshall|sony|harman)\b|\bspeaker\b/],
  ['Máy chơi game', /\b(may choi game|playstation|ps[45]|nintendo|xbox|tay cam choi game|gamepad|game stick)\b/],
  ['Máy in & Mực in', /\b(may in|muc in|hop muc|printer)\b/],
  ['Thiết bị mạng', /\b(router|bo phat wifi|wifi mesh|usb wifi|switch mang|modem|access point|card mang)\b/],
  ['Bàn phím, Chuột, Tai nghe', /\b(ban phim|chuot (may tinh|khong day|gaming|co day)|keyboard|mouse|lot chuot)\b/],
  ['PC & Linh kiện', /\b(may tinh de ban|may bo|cpu|vga|card do hoa|ram ddr\d|ssd|o cung|mainboard|bo mach chu|nguon may tinh|tan nhiet)\b/],
  ['Tủ đông & Tủ mát', /\b(tu dong|tu mat|tu cap dong)\b/], ['Tủ lạnh', /\btu lanh\b/],
  ['Máy giặt & Sấy', /\b(may giat|may say quan ao)\b/], ['Máy lạnh / Điều hòa', /\b(may lanh|dieu hoa)\b/, W('máy lạnh|điều hòa|điều hoà')],
  ['Máy nước nóng', /\b(may nuoc nong|binh nong lanh)\b/], ['Máy lọc nước', /\b(may loc nuoc|loi loc nuoc|cay nuoc nong lanh)\b/],
  ['Nồi chiên không dầu', /\b(noi chien|air ?fryer)\b/, W('nồi chiên|air ?fryer')], ['Nồi cơm điện', /\bnoi com\b/, W('nồi cơm')],
  ['Lò vi sóng & Lò nướng', /\b(lo vi song|lo nuong|microwave)\b/], ['Bếp điện & Bếp từ', /^\W*bep (tu|dien|hong ngoai|ga|doi|don|am)\b/],
  ['Máy xay, Máy ép, Máy pha cà phê', /\b(may xay|may ep|may pha ca phe|may vat cam|may danh trung|blender)\b/],
  ['Máy hút bụi & Robot', /\b(may hut bui|robot hut bui|robot lau nha|may lau nha)\b/],
  ['Quạt & Máy lọc không khí', /\b(quat|may loc khong khi|may tao am|may hut am)\b/, W('quạt|máy lọc không khí|máy tạo ẩm|máy hút ẩm')],
  ['Chăm sóc da', /\b(sua rua mat|serum|kem duong|toner|kem chong nang|tay trang|mat na|duong da|nuoc hoa hong|giam mun|tri mun|giay tham dau)\b/],
  ['Đồ dùng nhà bếp', /\b(bo noi|noi|chao|dao bep|thot|hop dung thuc pham|binh giu nhiet|am sieu toc|chen|bat an|dua|thia|muong|khay|hu dung)\b/, W('nồi|chảo|dao|thớt|hộp đựng|bình giữ nhiệt|ấm|chén|bát|đũa|thìa|muỗng|khay|hũ')],
  ['Máy tập & Gym', /\b(may chay bo|xe dap tap|ta tay|ta don|may tap|gym|day khang luc|tham yoga|xa don)\b/],
  ['Xe đạp & Xe điện', /\b(xe dap|xe dien|xe may dien|scooter|xe thang bang)\b/],
  ['Du lịch & Dã ngoại', /\b(leu|vali|balo du lich|tui ngu|da ngoai|cam trai)\b/, W('lều|vali|balo du lịch|túi ngủ|dã ngoại|cắm trại')],
  ['Dụng cụ thể thao', /\b(bong da|bong ro|bong chuyen|vot|cau long|tennis|pickleball|bong ban|dung cu the thao|gang tay the thao|boi loi|kinh boi)\b/],
  ['Phụ kiện ô tô', /\b(o to|xe hoi|camera hanh trinh|dash ?cam|bom lop)\b/, W('ô tô|xe hơi|camera hành trình|dash ?cam|bơm lốp')],
  ['Phụ kiện xe máy', /\b(xe may|mu bao hiem|non bao hiem)\b/, W('xe máy|mũ bảo hiểm|nón bảo hiểm')],
  ['Ắc quy & Chăm sóc xe', /\b(ac quy|nuoc rua xe|dau nhot|wax xe)\b/],
  ['Văn phòng phẩm', /\b(but bi|but chi|but gel|but long|so tay|vo ke|giay a4|van phong pham|bia ho so|kep giay|may tinh casio|hop but)\b/],
  ['Nhạc cụ', /\b(dan guitar|dan piano|dan organ|ukulele|sao truc|nhac cu|kalimba|trong cajon)\b/], ['Quà tặng & Đồ lưu niệm', /\b(qua tang|luu niem|hop qua|gau bong)\b/],
  ['Nước hoa', /\b(nuoc hoa|perfume|eau de)\b/], ['Trang điểm', /\b(son moi|son kem|son li|phan nen|kem nen|mascara|ke mat|ma hong|cushion|trang diem|phan phu)\b/],
  ['Chăm sóc tóc & cơ thể', /\b(dau goi|dau xa|sua tam|lan khu mui|duong the|kem danh rang|ban chai danh rang|nuoc suc mieng|dau duong toc|tay te bao chet)\b/],
  ['Tã bỉm & Vệ sinh', /\b(ta quan|ta dan|bim|khan uot)\b/, W('tã|bỉm|khăn ướt')],
  ['Sữa & Dinh dưỡng', /\b(sua bot|sua tuoi|sua chua|sua hat|sua cong thuc|ngu coc an dam|bot an dam)\b|\bsua\b.*\b(lon|hop|\d+ ?g|\d+ ?ml|\d+ ?gr)\b/],
  ['Đồ dùng cho bé', /\b(binh sua|num ti|xe day|ghe an dam|noi cho be|may hut sua|dia an cua be|yem)\b/, W('bình sữa|núm ti|xe đẩy|ghế ăn dặm|nôi|máy hút sữa|đĩa ăn|yếm')],
  ['Thời trang trẻ em', /\b(quan ao|ao|vay|dam|do bo|bodysuit)\b.*\b(be trai|be gai|tre em|baby|so sinh|cho be)\b/],
  ['Giày dép', /\b(giay|dep|sandal|sneaker|boot)\b/, W('giày|dép|sandal|sneaker|boot')],
  ['Túi xách & Ba lô', /\b(tui xach|ba lo|balo|vi da|vi nam|vi nu|tui deo)\b/],
  ['Đồng hồ & Trang sức', /\b(dong ho|trang suc|nhan bac|nhan vang|day chuyen|bong tai|lac tay|vong tay)\b/, W('đồng hồ|trang sức|nhẫn|dây chuyền|bông tai|lắc tay|vòng tay')],
  ['Mắt kính & Phụ kiện', /\b(kinh mat|mat kinh|gong kinh|kinh ram|that lung|mu luoi trai|non ket)\b/],
  ['Thời trang nữ', /\b(ao|quan|vay|dam|chan vay|ao kieu|ao so mi)\b.*\bnu\b|\bnu\b.*\b(ao|quan|vay|dam)\b|\b(dam|chan vay|ao kieu|vay lien)\b/, W('áo|quần|váy|đầm')],
  ['Thời trang nam', /\b(ao|quan)\b.*\bnam\b|\bnam\b.*\b(ao|quan)\b|\b(so mi nam|ao thun|quan jean|ao khoac|quan au|ao polo)\b/, W('áo|quần')],
  ['Đồ uống', /\b(nuoc ngot|nuoc suoi|nuoc khoang|ca phe|nuoc tang luc|nuoc ep|tra sua|tra tui loc)\b/],
  ['Bánh kẹo & Snack', /\b(banh|keo|snack|socola|chocolate|mut|hat huong duong)\b/, W('bánh|kẹo|snack|socola|chocolate|mứt|hạt')],
  ['Chăm sóc thú cưng', /\b(cho meo|thu cung|pate|hat cho cho|hat cho meo|cat ve sinh|thuc an cho)\b/],
  ['Chăm sóc nhà cửa', /\b(nuoc giat|nuoc rua chen|nuoc lau san|nuoc xa vai|tay rua|khan giay|tui rac|xit con trung|diet muoi)\b/],
  ['An ninh & Nhà thông minh', /\b(camera|khoa thong minh|khoa van tay|o cam thong minh|chuong cua|cam bien)\b/],
  ['Đèn & Thiết bị điện', /\b(den|bong den|o cam|cong tac|day dien|o dien)\b/, W('đèn|bóng đèn|ổ cắm|công tắc|dây điện|ổ điện')],
  ['Dụng cụ & Sửa chữa', /\b(may khoan|tua vit|bo dung cu|co le|may mai|thuoc do|may cat|luc giac|kim mo)\b/],
  ['Nội thất văn phòng', /\b(ghe (van phong|cong thai hoc|xoay|gaming)|ban (lam viec|van phong|nang ha))\b/],
  ['Nội thất phòng ngủ', /\b(nem|dem|chan ga|goi|giuong|tu quan ao|ga trai|chan)\b/, W('nệm|đệm|chăn|ga gối|gối|giường|tủ quần áo|ga trải')],
  ['Trang trí & Cây cảnh', /\b(cay canh|cay gia|hoa gia|tranh treo|trang tri|binh hoa|chau cay)\b/],
  ['Thẻ nạp & Thẻ game', /\b(the nap|the game|the cao|garena|steam wallet)\b/], ['Voucher ăn uống & giải trí', /\b(voucher|e-?voucher|phieu qua tang)\b/], ['Dịch vụ số', /\b(goi cuoc|ban quyen|license|phan mem|subscription|netflix|spotify|youtube premium)\b/],
];
const PRIORITY_N = 6; // so luat uu tien dau RULES (them 26/10/2026)
function classifyPriority(name) { const s = nd(name), a = String(name || '').toLowerCase(); for (const [g, re, acc] of RULES.slice(0, PRIORITY_N)) if (re.test(s) && (!acc || acc.test(a))) return g; return null; }
function classifyOne(text) {
  const s = nd(text), a = String(text || '').toLowerCase();
  if (!s.trim()) return null;
  if (EXCLUDE.test(s)) return 'EXCLUDE';
  for (const [g, re, acc] of RULES) if (re.test(s) && (!acc || acc.test(a))) return g;
  return null;
}
/* Uu tien TEN san pham; danh muc goc cua san (cate) dung de du phong khi ten khong ro */
const CATE_DEFAULT = { health_and_beauty: 'Thực phẩm chức năng', groceries: 'Thực phẩm khô & Gia vị', mother_and_baby: 'Đồ dùng cho bé', toys_and_games: 'Đồ chơi & Giáo dục', home_and_living: 'Đồ dùng nhà bếp', sports_and_outdoors: 'Dụng cụ thể thao', fashion: 'Thời trang nữ', stationery: 'Văn phòng phẩm', books: 'Sách' };
function classify(name, cat) {
  const byName = classifyOne(name);
  if (byName === 'EXCLUDE') return null;
  if (byName) return byName;
  const byCat = classifyOne(cat);
  if (byCat === 'EXCLUDE') return null;
  return byCat || CATE_DEFAULT[String(cat || '').trim().toLowerCase()] || null;
}
const normKey = s => nd(s).replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/hang chinh hang|chinh hang|hang nhap khau|freeship|mien phi van chuyen|bao hanh \d+ thang/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 90);

/* ---------- KET NOI ACCESSTRADE (API datafeed chinh thuc, 1 khoa = nhieu san) ----------
 * Tai lieu: https://developers.accesstrade.vn - GET https://api.accesstrade.vn/v1/datafeeds
 * Header: Authorization: Token <access_key>  (Secret ACCESSTRADE_KEY)
 * Tham so: domain, page, limit (toi da 200). Moi domain tai tuan tu tung trang, cac domain chay song song.
 */
const AT_API = process.env.ACCESSTRADE_API || 'https://api.accesstrade.vn/v1/datafeeds'; // ghi de chi de kiem thu
const AT_DOMAINS = { 'tiki.vn': 'tiki', 'shopee.vn': 'shopee', 'lazada.vn': 'lazada', 'sendo.vn': 'sendo', 'tiktok.com': 'tiktok',
  'thegioididong.com': 'thegioididong', 'dienmayxanh.com': 'dienmayxanh', 'fptshop.com.vn': 'fptshop', 'cellphones.com.vn': 'cellphones', 'dienmaycholon.vn': 'dienmaycholon' };
async function atJSON(url, key) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { Authorization: 'Token ' + key, 'Content-Type': 'application/json' } });
    if (r.status === 401 || r.status === 403) throw new Error('khoa AccessTrade khong hop le / chua duoc duyet (HTTP ' + r.status + ')');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = await r.text();
    return JSON.parse(txt.replace(/:\s*(NaN|-?Infinity|undefined)\b/g, ': null')); // feed doi khi tra NaN (JSON khong hop le)
  } finally { clearTimeout(t); }
}
async function accesstrade(env, stat) {
  const key = String(env.ACCESSTRADE_KEY || '').trim();
  if (!key) return [];
  const doms = String(env.ACCESSTRADE_DOMAINS || Object.keys(AT_DOMAINS).join(',')).split(/[\s,;]+/).filter(d => AT_DOMAINS[d]);
  const maxPer = parseInt(env.ACCESSTRADE_MAX_PER_DOMAIN || '4000', 10);
  stat.sources += doms.length;
  const res = await pool(doms, CONCURRENCY, async dom => {
    const out = [];
    try {
      for (let page = 1; out.length < maxPer; page++) {
        const j = await atJSON(`${AT_API}?domain=${encodeURIComponent(dom)}&page=${page}&limit=200`, key);
        const data = (j && j.data) || [];
        for (const d of data) out.push({ ...normRow({ name: d.name, price: d.price, sale_price: d.discount, image: d.image, link: d.url || '' /* PHUONG AN A: link goc cua san, khong dung aff_link */, category: d.cate, brand: '', id: d.sku || d.product_id }), src: AT_DOMAINS[dom] });
        if (data.length < 200) break;
      }
      stat.ok++;
    } catch (e) { stat.fail.push('AccessTrade ' + dom + ': ' + String(e.message || e).slice(0, 90)); }
    return out;
  });
  return res.flat();
}

/* ---------- chay toan bo ---------- */
async function collectFeeds(env) {
  const list = feedList(env);
  const stat = { sources: list.length, ok: 0, fail: [], items: 0, valid: 0, unclassified: 0, bad: 0 };
  const [urlRows, atRows] = await Promise.all([          // feed URL va AccessTrade chay SONG SONG
    pool(list, CONCURRENCY, async f => {
      try { const { text, type } = await fetchText(f.url); const rows = parseAny(text, type); stat.ok++; return rows.map(r => ({ ...normRow(r), src: f.src })); }
      catch (e) { stat.fail.push(f.src + ': ' + String(e.message || e).slice(0, 80)); return []; }
    }),
    accesstrade(env, stat),
  ]);
  const offers = [], dropKeys = new Set(), sample = [];  // sample: mau ban ghi chua phan loai (chi luu trong goi quan tri ma hoa)
  for (const r of [...urlRows.flat(), ...atRows]) {
    stat.items++;
    if (!r.name || r.name.length < 6 || r.price < 1000 || r.price > 2e9) { stat.bad++; continue; }
    r.grp = classify(r.name, r.cat);
    if (!r.grp) { stat.unclassified++; dropKeys.add(normKey(r.name)); if (sample.length < 600 && Math.random() < 0.15) sample.push([r.src, r.name.slice(0, 120), String(r.cat || '').slice(0, 80)]); continue; }
    r.key = normKey(r.name);
    stat.valid++; offers.push(r);
  }
  return { offers, stat, dropKeys, unclassSample: sample };
}

module.exports = { collectFeeds, feedList, parsePrice, parseAny, normRow, inStockOf, classify, classifyPriority, normKey, SOURCES };
