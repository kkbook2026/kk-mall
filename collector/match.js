'use strict';
/*
 * BO GHEP CHEO NGUON (cross-source matcher) - tim CUNG MOT san pham tren nhieu san/website de chon gia re nhat.
 * Ten cung 1 SP o moi noi viet khac nhau ("Router Wifi Chuẩn AC1200 TP-Link Archer C64 Gigabit" /
 * "Bộ Phát Wifi TP-Link Archer C64 Băng Tần Kép Chuẩn AC1200 - Hàng Chính Hãng") nen khong the so khop nguyen chuoi.
 *
 * Nguyen tac AN TOAN (mua ho bang tien that): THA BO SOT con hon GHEP NHAM.
 *  A. Rang buoc cung (lech la loai): tinh trang (cu / da kich hoat / doi bao hanh), bien the (pro/max/plus/ultra/5g...),
 *     so luong goi (combo 2, loc 6, x3), thong so co don vi (128GB, 8kg, 1.8L, 55 inch...), mau sac (khi ca 2 deu ghi),
 *     so phien ban/tap, phu kien <-> may chinh, thuong hieu da biet.
 *  B. 3 duong ghep, do tin cay giam dan:
 *     S  - trung MA MODEL MANH (>= 5 ky tu co ca chu va so, hoac day so >= 6; hiem trong nhom) va khong lech ma manh khac -> 0.90..1.00
 *     W1 - trung ma yeu hiem (g304, c64, a55...) + moi so/tu dinh danh trung nhau + khong tu hiem nao lech            -> 0.70..0.89
 *     W2 - khong co ma: 2 ten trung nhau tren toan bo tu (chi lech tu dong goi chung chung)                          -> 0.60..0.69
 *  C. Offer ghep mo con phai qua DAI GIA (band) va luat NGUOI BAN (sellerOf) truoc khi duoc dung de dinh gia.
 * (c) 2026 Nguyen Duy Dien. All rights reserved.
 */
const nd = s => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');

/* ---- xu ly tren chuoi CON DAU (tranh nham: đen/đèn, tủ/từ/tự, bàn/bản, cơ/có, bò/bộ, thẻ/thể, đứng/dùng...) ---- */
const B0 = '(?<![\\p{L}\\p{N}])', B1 = '(?![\\p{L}\\p{N}])';
const COLOR_VI = new RegExp(B0 + '(xanh (?:lá cây|lá|dương|da trời|ngọc bích|ngọc|rêu|mint|navy|đen|nhạt|đậm|biển|lục|lam|bạc hà|cổ vịt)|xanh|đen nhám|đen bóng|đen|trắng ngà|trắng sữa|trắng|đỏ đô|đỏ|hồng phấn|hồng nhạt|hồng đậm|hồng cánh sen|hồng|vàng đồng|vàng kim|vàng nhạt|vàng hồng|vàng|xám khói|xám nhạt|xám đậm|xám xanh|xám|bạc|tím nhạt|tím đậm|tím|nâu nhạt|nâu đậm|nâu|cam đất|màu cam|màu be|màu kem|màu ghi|ghi sáng|ghi xám|ghi đậm|titan tự nhiên|titan đen|titan trắng|titan sa mạc|titan xanh|titan|black|white|blue|green|red|pink|gold|silver|gr[ae]y|purple|orange|navy|graphite|midnight|starlight)' + B1, 'gu');
const STOP_VI = new RegExp(B0 + '(và|với|cho|của|các|những|loại|kiểu|dáng|màu|sản phẩm|dành riêng|dành|phiên bản|chiếc|cái|bộ|thương hiệu|hiệu|chuẩn|size|the|and|with|for|of|by|new|version|model)' + B1, 'gu');
/* chat lieu / thuoc tinh bien the (day da <> day thep, da bo <> da PU...): phai trung khop khi ghep theo ten (duong W) */
const ATTR_VI = new RegExp(B0 + '(da bò|da pu|da thật|da cá sấu|da lộn|da|thép không gỉ|thép|inox|nhôm|cao su|silicone|silicon|vải|nylon|nhựa|kính|gỗ|tre|gốm|sứ|thủy tinh|cotton|len|lụa|kaki|jean|nỉ|lưới|carbon|milanese|alpine|ocean|trail|sport band|sport loop|bàn phím|bút)' + B1, 'gu');
const COND_VI = /cũ đẹp|cũ trầy|cũ xước|hàng cũ|máy cũ|đã qua sử dụng|qua sử dụng|like ?new|đổi bảo hành|trả bảo hành|trưng bày|tân trang|refurbish|đã kích hoạt|kích hoạt bảo hành|open ?box|(?<![a-z])cpo(?![a-z])|(?<![a-z])used(?![a-z])|9[5-9] ?%|(?<![\p{L}])(?<!thu )cũ(?![\p{L}])|da qua su dung|doi bao hanh|trung bay|tan trang/u;
const BUNDLE_VI = /combo|\s\+\s|kèm(?! theo)|bộ đôi/;

/* ---- xu ly tren chuoi KHONG DAU ---- */
const NOISE = /\[[^\]]*\]|【[^】]*】|\((?:[^()]*(?:chinh hang|bao hanh|freeship|mien phi|qua tang|tang kem|hang moi|new|sale|giam|hot|vn\/a|hang nhap)[^()]*)\)/g;
const NOISE_W = /\b(hang chinh hang|chinh hang apple viet nam|chinh hang vn|chinh hang|phan phoi chinh thuc|nhap khau chinh hang|hang nhap khau|nhap khau|bao hanh(?: chinh hang)?(?: dien tu)?(?: \d+ (?:thang|nam))?|freeship|free ship|mien phi van chuyen|giao (?:hang )?nhanh|hoa toc|gia re|gia tot|gia soc|sieu re|flash ?sale|sale|hot|deal|moi 100 ?%?|new 100 ?%?|hang moi|nguyen seal|full ?box|(?:tang kem|qua tang|kem qua)\b[^,|()\-–—]*|loai 1|cao cap|chat luong cao|official|store|vn ?\/ ?a|vna|tai ban(?: lan thu)?(?: (?:nam )?\d+)?|ban moi nhat|moi (?:nhat )?20[12]\d|20[12]\d)\b/g;
const SYN = { gaming: 'game', tv: 'tivi', smartphone: 'dienthoai', notebook: 'laptop' };
/* tu MO TA ky thuat pho bien bang tieng Anh - khong dinh danh dong san pham (khac voi "Master"/"Anywhere"/"Superlight") */
const DESC = new Set('gigabit bluetooth game rgb argb led usb mesh router smart inverter digital hd speaker headphone headset earphone earbuds mouse keyboard mechanical switch receiver dongle stereo bass mic microphone tws true series official type mode multi device portable electric auto automatic tivi laptop pc monitor camera ip cam home box khongday coday tp link band low profile hot swap mu mimo mumimo gigibit projector lightsync bot'.split(' '));
/* tu chi BIEN THE: phai trung khop tuyet doi */
const VARIANT = new Set('pro max plus ultra mini lite air se fe neo prime note edge slim cellular lte net3g net4g net5g wifi nano tkl xl xxl xs 2xl 3xl ti super xt oc ii iii omni turbo classic music solar eco signature live active elite premium limited special crossover tactical superlight tenkeyless dual tray nobox'.split(' '));
const ACC_RE = /\b(op lung|bao da|bao dung|mieng dan|cuong luc|dan man hinh|day sac|cap sac|cu sac|cot sac|adapter|remote|dieu khien tu xa|gia do|gia treo|ke treo|chan de|de tan nhiet|khay|gioang|ron cua|loi loc|bo loc|mang loc|coc loc|phu kien|linh kien|ao trum|tam che|bao trum|vo boc|tui chong soc|tui dung|nap dau|ong xa|ong thoat|day cap|day nguon|day dong ho|day deo|pin thay|but cam ung|skin|sticker|kinh cuong luc|ban di|motor thay|bo mach|board mach|mieng lot|tham lot|hop muc|muc in|drum|gat muc|tui loc|giay loc|luoi dao|dau cao thay|toner|ribbon|cartridge|bang muc|binh muc|lo muc|cum trong|trong muc|dau kim|dau in)\b|\b(?:dung|danh|thay the|su dung|tuong thich|thay) (?:cho|voi) (?:cac )?(?:dong )?(?:may|dien thoai|laptop|macbook|iphone|ipad|galaxy|tivi|tu lanh|may giat|may loc|robot)\b|\bmuc\b[^,|]{0,24}\bcho may in\b/;
/* LOAI phu kien (gom cac cach goi cung loai): 2 phu kien khac loai cho cung 1 dong may ("Cường lực Samsung A35" <> "Ốp lưng Samsung Galaxy A35") khong bao gio la 1 san pham */
const ACC_KIND = { 'op lung': 'case', 'bao da': 'case', 'vo boc': 'case', 'bao dung': 'case', 'tui chong soc': 'case', 'tui dung': 'case', skin: 'case', sticker: 'case',
  'mieng dan': 'film', 'cuong luc': 'film', 'kinh cuong luc': 'film', 'dan man hinh': 'film',
  'day sac': 'charge', 'cap sac': 'charge', 'cu sac': 'charge', 'cot sac': 'charge', adapter: 'charge', 'day cap': 'charge', 'day nguon': 'charge',
  'day dong ho': 'strap', 'day deo': 'strap', 'gia do': 'stand', 'gia treo': 'stand', 'ke treo': 'stand', 'chan de': 'stand', 'de tan nhiet': 'stand',
  'loi loc': 'filter', 'bo loc': 'filter', 'mang loc': 'filter', 'coc loc': 'filter', 'tui loc': 'filter', 'giay loc': 'filter', 'hop muc': 'ink', 'muc in': 'ink', 'gat muc': 'ink', toner: 'ink', cartridge: 'ink', 'binh muc': 'ink', 'lo muc': 'ink', 'bang muc': 'ribbon', ribbon: 'ribbon', drum: 'drum', 'cum trong': 'drum', 'trong muc': 'drum', 'dau kim': 'head', 'dau in': 'head' };
const ACC_RE_G = new RegExp(ACC_RE.source, 'g');
const kindOf = base => { const k = new Set(); for (const m of base.matchAll(ACC_RE_G)) if (m[1]) k.add(ACC_KIND[m[1]] || m[1]); return k; };   // cum "dung cho may..." khong co nhom -> khong xac dinh loai
const SPEC_TOK = /^\d+(?:\.\d+)?(?:gb|tb|mb|mah|ghz|mhz|hz|inch|in|kg|gram|gr|g|ml|lit|l|hp|btu|mm|cm|ms|m|mbps|gbps|mp|wh|w|va|v|oz|kwh|kw|k|dpi|rpm|db|ppm|nits|nit|bar|ah|lm)$/;
const UNIT = { gb: 'gb', g: 'g', gr: 'g', gram: 'g', tb: 'tb', mb: 'mb', mah: 'mah', w: 'w', hz: 'hz', inch: 'in', in: 'in', '"': 'in', kg: 'kg', ml: 'ml', l: 'l', lit: 'l', hp: 'hp', btu: 'btu',
  mm: 'mm', cm: 'cm', m: 'm', v: 'v', mbps: 'mbps', gbps: 'gbps', mp: 'mp', vien: 'vien', goi: 'goi', hop: 'hop', chai: 'chai', tui: 'tui', cuon: 'cuon', tap: 'tap', ngan: 'ngan', cua: 'cua', lon: 'lon', mieng: 'mieng', k: 'k', ghz: 'ghz', oz: 'oz', to: 'to',
  ms: 'ms', dpi: 'dpi', rpm: 'rpm', db: 'db', ppm: 'ppm', nits: 'nits', nit: 'nits', kw: 'kw', kwh: 'kwh', va: 'va', bar: 'bar', ah: 'ah', wh: 'wh', lm: 'lm', mhz: 'mhz' };
/* don vi DINH DANH (dung tich / kich co / so luong): o duong W ca 2 ben phai cung ghi hoac cung khong ghi */
const ID_UNITS = new Set('gb tb mah in kg g ml l hp btu vien goi hop chai tui cuon tap lon mieng oz to cm mm'.split(' '));
const UNIT_RE = /(?<![a-z0-9.])(\d+(?:[.,]\d+)?)\s*(gb|tb|mbps|mb|mah|ghz|mhz|hz|inch|in|"|kg|gram|gr|g|ml|lit|l|hp|btu|mm|cm|ms|m|gbps|mp|wh|w|va|v|vien|goi|hop|chai|tui|cuon|tap|ngan|cua|lon|mieng|oz|kwh|kw|k|to|dpi|rpm|db|ppm|nits|nit|bar|ah|lm)(?![a-z0-9])/g;
const PACK_RE = /\b(?:combo|set|bo|loc|thung|pack|lo|sl)\s*(\d{1,3})\b|(?<![a-z0-9])(?:x|×)\s?(\d{1,2})\b(?! *(?:cm|mm|m\b|inch))|\b(\d{1,2})\s*(?:x|×)(?=\s|$)|\bmua (\d) tang (\d)\b|\b(\d{1,3})\s*\/\s*pk\b|\((\d{1,2})x(\d{1,2})\/pk\)/g;
const PACK_UNIT = /(?<![a-z0-9.])(\d{1,3})\s*(hop|chai|goi|lon|tui|cuon|cai|chiec|doi|tuyp|lo|vi|cap|bich|thanh|hu|binh|cay|mon|quyen)\b/;

/* THUONG HIEU da biet (va dong SP quy ve hang me) */
const BRAND_ALIAS = { iphone: 'apple', ipad: 'apple', macbook: 'apple', airpods: 'apple', imac: 'apple', galaxy: 'samsung', redmi: 'xiaomi', poco: 'xiaomi', mijia: 'xiaomi', thinkpad: 'lenovo', ideapad: 'lenovo', legion: 'lenovo', vivobook: 'asus', zenbook: 'asus', rog: 'asus', tuf: 'asus', inspiron: 'dell', vostro: 'dell', latitude: 'dell', alienware: 'dell', pavilion: 'hp', victus: 'hp', omen: 'hp', laserjet: 'hp', aspire: 'acer', nitro: 'acer', predator: 'acer', bravia: 'sony', playstation: 'sony', pixma: 'canon', tapo: 'tplink', archer: 'tplink', deco: 'tplink', aorus: 'gigabyte', surface: 'microsoft', xbox: 'microsoft', kindle: 'amazon' };
const BRANDS = new Set(('apple samsung xiaomi oppo vivo realme nokia huawei honor tecno infinix itel masstel vsmart nothing oneplus google sony lg panasonic toshiba sharp hitachi aqua electrolux daikin casper tcl hisense funiki midea beko bosch whirlpool mitsubishi sanyo gree nagakawa sumikura reetech carrier comfee coex skyworth vsp darling sanaky kangaroo karofi sunhouse bluestone tefal philips braun kalite elmich supor cuckoo zojirushi delites hafele kaff teka malloca rinnai paloma ariston ferroli picenza senko dyson roborock ecovacs dreame deerma tineco ' +
  'asus acer dell hp lenovo msi gigabyte asrock biostar intel amd nvidia microsoft razer logitech corsair steelseries hyperx akko dareu fuhlen rapoo keychron edra aula ugreen baseus anker aukey belkin hoco borofone remax energizer pisen romoss wiwu mazer mophie zagg spigen uag pitaka mipow jinya araree nillkin tomtoc targus samsonite ' +
  'kingston sandisk seagate western transcend lexar adata crucial kioxia pny teamgroup gskill apacer hikvision hiksemi dahua ezviz imou tplink tenda mercusys totolink dlink linksys netgear ubiquiti ruijie aruba cisco draytek zyxel ' +
  'canon epson brother ricoh fujifilm xerox pantum nikon gopro dji insta360 garmin fitbit amazfit coros suunto casio citizen seiko orient tissot movado certina fossil jbl bose sennheiser marshall harman soundcore edifier sonos beats skullcandy jabra havit soundpeats ' +
  'viewsonic benq aoc koorui hkc deepcool xigmatek jonsbo thermaltake nzxt antec segotep thermalright noctua cougar montech ' +
  'dove sunsilk lifebuoy omo nivea vaseline loreal maybelline garnier cerave cetaphil bioderma vichy eucerin neutrogena innisfree laneige dhc shiseido senka rohto acnes cocoon thorakao olay pantene rejoice downy ariel colgate oralb sensodyne closeup listerine gillette durex kotex diana bobby huggies pampers merries moony goon molfix ' +
  'vinamilk nutifood abbott nestle milo ensure pediasure similac enfamil friso dielac aptamil meiji morinaga glico blackmores swisse kirkland centrum orihiro kobayashi fancl ' +
  'lego mattel hasbro barbie nerf funko bandai tamiya').split(/\s+/).filter(Boolean));
function brandsOf(base) {
  const out = new Set();
  const t = base.replace(/tp-?link/g, ' tplink ').replace(/d-?link/g, ' dlink ').replace(/oral-?b/g, ' oralb ').replace(/western digital|\bwd\b/g, ' western ').replace(/l'?oreal/g, ' loreal ').replace(/g\.?skill/g, ' gskill ');
  for (const w of t.split(/[^a-z0-9]+/)) { if (BRANDS.has(w)) out.add(w); else if (BRAND_ALIAS[w]) out.add(BRAND_ALIAS[w]); }
  return out;
}

/* Chuan hoa ten mau: tieng Anh -> tieng Viet, cac sac thai cung ho quy ve 1 khoa */
const COLOR_EN = { black: 'den', white: 'trang', blue: 'xanh', navy: 'xanh', green: 'xanhla', red: 'do', pink: 'hong', gold: 'vang', silver: 'bac', gray: 'xam', grey: 'xam', purple: 'tim', orange: 'cam', graphite: 'xam', midnight: 'den', starlight: 'trang' };
function colorKey(m) {
  const k = nd(m).replace(/[^a-z]/g, '');
  if (COLOR_EN[k]) return COLOR_EN[k];
  if (/^xanh(duong|datroi|bien|lam|navy|nhat|dam|den)$/.test(k)) return 'xanh';
  if (/^xanh(la|lacay|luc|reu|mint|bacha|ngoc|ngocbich|covit)$/.test(k)) return 'xanhla';
  return k.replace(/^mau/, '').replace(/^(den|trang|do|hong|vang|xam|tim|nau)(nham|bong|nga|sua|do|phan|nhat|dam|canhsen|dong|kim|hong|khoi|xanh)$/, '$1').replace(/^ghi(sang|xam|dam)?$/, 'xam');
}

/* Tach ma model tu 1 tu (giu dau noi ben trong): { full, core } ; core = bo hau to mau/khu vuc ngan o cuoi (/SV, -BK, (F), /00) */
function codeOf(tok) {
  const parts = tok.split(/[-/.()]+/).filter(Boolean);
  const full = parts.join('');
  if (!full || SPEC_TOK.test(full)) return null;
  const hasL = /[a-z]/.test(full), hasD = /\d/.test(full);
  if (!(hasD && (hasL || full.length >= 6))) return null;          // phai co so; chi so thi >= 6 ky tu
  let core = full;
  if (parts.length >= 2) { const last = parts[parts.length - 1], head = parts.slice(0, -1).join(''); if (/^([a-z]{1,3}|\d{1,2})$/.test(last) && head.length >= 4 && /\d/.test(head)) core = head; }
  return { full, core };
}
/* ma "lop thong so" (chuan wifi AC1200/AX3000, DDR5, USB3...) khong dinh danh model -> ma yeu */
const PC_CUE = /\b(laptop|notebook|macbook|pc|may tinh|may bo|workstation|aio|surface|thinkpad|thinkbook|vivobook|zenbook|ideapad|inspiron|latitude|vostro|pavilion|probook|elitebook|nitro|aspire|legion|ryzen|core|coreultra|celeron|pentium|i[3579])\b/;
/* Do phan giai quy ve megapixel (camera): 1080P = 2MP, 2K = 3-4MP, 4K = 8MP ... de bat "EZVIZ H3C 1080P" <> "EZVIZ H3C 3MP" (cung ma, khac phien ban) */
const RES_P = { 720: [1], 1080: [2], 1296: [3], 1440: [4], 1520: [4], 1620: [5], 1944: [5], 2160: [8] }, RES_K = { 2: [3, 4], 2.5: [4], 3: [5, 6], 4: [8], 5: [14, 15, 16], 8: [33] };
function resOf(spec, cids) {
  let out = null; const add = a => { out = out ? out.filter(x => a.includes(x)) : a.slice(); };
  if (spec.mp) add([...spec.mp].map(v => Math.round(+v)));
  for (const c of cids) { let m; if ((m = /^(\d{3,4})p$/.exec(c)) && RES_P[+m[1]]) add(RES_P[+m[1]]); else if ((m = /^(\d)k$/.exec(c)) && RES_K[+m[1]]) add(RES_K[+m[1]]); }
  if (spec.k) for (const v of spec.k) if (RES_K[+v]) add(RES_K[+v]);
  return out && out.length ? out : null;                                // khong ghi / ghi mau thuan -> khong ket luan
}
const CLASS_RE = /^((ac|ax|be|n)\d{3,5}|ddr\d|usb\d+|wifi\d[a-z]?|type-?c|rj45|ip\d{2}|hdmi\d*|sata\d?|led\d*|rgb|argb|2k|4k|8k|\d{3,4}p|\d{2,3}hz|fhd|qhd|uhd|mp3|mp4|cd|dvd|g?ddr\d|lpddr\d[a-z]?|hdr\d*|bt\d+|dp\d*|cat\d[a-z]?|\d{1,2}bit|a[3-6]|i[3579]|r[3579]|m[1-5]|gen\d+|\d+in\d+|\d+w)$/;
const isStrong = c => !CLASS_RE.test(c.full) && ((c.core.length >= 5 && /[a-z]/.test(c.core) && /\d/.test(c.core)) || (/^\d+$/.test(c.core) && c.core.length >= 6));
/* 2 ma bang nhau: trung full; hoac cung goc va it nhat 1 ben khong ghi hau to; hoac 1 ben la duoi cua ben kia (CU/CS-PU9AKH-8 ~ PU9AKH-8) */
function codeEq(a, b) {
  if (a.full === b.full) return true;
  if (a.core === b.core) return a.full === a.core || b.full === b.core;   // 2 hau to khac nhau = 2 bien the (mau/khu vuc)
  const [s, l] = a.full.length <= b.full.length ? [a.full, b.full] : [b.full, a.full];
  return s.length >= 6 && l.endsWith(s) && l.length - s.length <= 4;
}

function features(name) {
  const lower = String(name || '').toLowerCase().normalize('NFC').replace(/&amp;/g, '&');
  const cond = COND_VI.test(lower) ? 1 : 0, bundle = BUNDLE_VI.test(lower) ? 1 : 0;
  const attr = new Set(); for (const m of lower.matchAll(ATTR_VI)) attr.add(nd(m[1]).replace(/[^a-z]/g, '').replace(/^silicon$/, 'silicone'));
  const marked = lower.replace(COLOR_VI, m => ' clr' + colorKey(m) + ' ').replace(/không dây|wireless/g, ' khongday ').replace(/có dây/g, ' coday ');
  const base = nd(marked);
  const acc = ACC_RE.test(base) ? 1 : 0;
  let pack = 1;
  base.replace(PACK_RE, (m, a, b, c, d, e, f, g, h) => { const n = g && h ? +g * +h : +(a || b || c || d || f || 1); if (n > 1 && n < 500) pack = Math.max(pack, n); return m; });
  // he dieu hanh / dong CPU chua chu "pro", "home", "ultra", "plus", "elite" khong phai bien the cua san pham
  // "W11", "W11SL" chi la Windows khi ten la may tinh; neu khong thi la MA MODEL ("Loa Alpha Works AW-W39" <> "AW-W88", "Dreame W10") - tung bi xoa nham => 2 model khac nhau trung ten
  const cfg = t => t.replace(/\bwin(?:dows)?\s*\d{1,2}\s*(?:pro|home|sl|hsl|s)?\b|\b(?:no ?os|free ?dos|dos|office (?:home|365)[a-z &]*)\b/g, ' ').replace(PC_CUE.test(t) ? /\bw\s?1[01]\s*(?:pro|home|sl|hsl|h|p|s)?\b/g : /$^/, ' ').replace(/\bcore\s+ultra\b/g, ' coreultra ').replace(/\bsnapdragon\s+x\s+(plus|elite)\b/g, ' snapdragonx$1 ').replace(/\b80\s*plus\b/g, ' 80plus ').replace(/\bryzen\s+ai\b/g, ' ryzenai ');
  const clean = t => cfg(t).replace(NOISE, ' ').replace(/\b([345])g\b/g, ' net$1g ').replace(/\bwi-?fi\b/g, ' wifi ').replace(/(\d),(\d)/g, '$1.$2').replace(/\b((?:[wfqu]{0,2}hd|\dk|wuxga|wqxga|uwqhd))\+/g, '$1 ').replace(/([a-z0-9])\+(?=\s|$)/g, '$1 plus ');   // "FHD+/WQHD+" la do phan giai; "S24+", "Pro+", "Premium+" moi la ban Plus
  const s = clean(base);
  { const m = s.match(PACK_UNIT); if (m && +m[1] > 1) pack = Math.max(pack, +m[1]); }
  // ma model: tach theo khoang trang, giu dau noi trong tu
  const strong = [], weak = new Set(), skip = new Set();     // skip: cac manh cua ma manh ("tl", "wn823n" cua TL-WN823N) - khong tinh la tu khoa/ma yeu
  const rawToks = s.replace(/[|_\\,;:!?*#+\[\]{}"'“”‘’–—]/g, ' ').replace(/\s[-/]\s/g, ' ').split(/\s+/).filter(Boolean);
  // "2K/IPS/180Hz/1ms", "8GB/128GB" la DANH SACH THONG SO (tach rieng tung muc); "RF48A4010B4/SV", "CU/CS-PU9AKH-8" la 1 ma model (giu nguyen)
  const toks2 = []; for (const rt of rawToks) { const segs = rt.split('/').filter(Boolean); if (segs.length > 1 && segs.some(x => SPEC_TOK.test(x) || CLASS_RE.test(x))) toks2.push(...segs); else toks2.push(rt); }
  for (const rt of toks2) {
    const t = rt.replace(/^[(\-/.]+|[)\-/.]+$/g, ''); if (!t || /^net[345]g$/.test(t) || /^clr/.test(t)) continue;
    const c = codeOf(t);
    if (c) { if (isStrong(c)) { strong.push(c); for (const part of t.split(/[-/.()]+/)) if (part) skip.add(part); } else weak.add(c.full); }
  }
  // thong so co don vi
  const spec = {};
  s.replace(/[|_/\\,;:!?*#+()\[\]{}"'“”‘’–—]/g, ' ').replace(NOISE_W, ' ').replace(UNIT_RE, (m, v, u) => { const k = UNIT[u] || u; const val = String(parseFloat(v.replace(',', '.'))); (spec[k] = spec[k] || new Set()).add(val); return ' '; });
  // tu khoa: bo tu dung (co dau) roi moi bo dau; phan DAU ten (truoc dau ngan dau tien) dung rieng cho do trung tu khoa cua ten dai dong
  const stopped = marked.replace(STOP_VI, ' ');
  const cut = stopped.search(/\s[-–—]\s|,|\||\(/);
  const headRaw = cut > 0 && stopped.slice(0, cut).trim().split(/\s+/).length >= 4 ? stopped.slice(0, cut) : stopped;
  const tokenize = txt => clean(nd(txt)).replace(/[|_/\\,;:!?*#+()\[\]{}"'“”‘’–—]/g, ' ').replace(NOISE_W, ' ').replace(UNIT_RE, ' ').replace(/[-.]/g, ' ').split(/\s+/).filter(Boolean);
  const variant = new Set(), color = new Set(), words = new Set(), ids = new Set(), cids = new Set(), nums = new Set(), hwords = new Set();
  const strongParts = new Set(); for (const c of strong) { strongParts.add(c.full); strongParts.add(c.core); }
  const eat = (toks, isHead) => {
    for (let t of toks) {
      t = SYN[t] || t;
      if (skip.has(t)) continue;
      if (VARIANT.has(t)) variant.add(t);
      else if (t.startsWith('clr') && t.length > 3) color.add(t.slice(3));
      else if (/^\d+$/.test(t)) { if (t.length < 6) nums.add(String(+t)); }
      else if (/\d/.test(t)) { if (!strongParts.has(t)) (CLASS_RE.test(t) ? cids : ids).add(t); }   // ma yeu / tu co so (ma "lop thong so" de rieng)
      else if (t.length === 1) { if (/[a-z]/.test(t)) ids.add('§' + t); }                // chu don (X, E, S, M, L...) = dinh danh dong/co
      else { words.add(t); if (isHead) hwords.add(t); }
    }
  };
  eat(tokenize(headRaw), true);
  if (headRaw !== stopped) eat(tokenize(stopped.slice(headRaw.length)), false);
  // tu nam NGOAI ngoac: noi dung trong ngoac thuong la liet ke tinh nang "(A4 | In | Scan | Copy | USB)" - khong dung de xet tu dinh danh
  const bwords = new Set(tokenize(stopped.replace(/\([^()]*\)/g, ' ')).map(t => SYN[t] || t).filter(t => words.has(t)));
  // hau to mau/phien ban viet HOA ngay sau ma model ("R-FVX480PGV9 GBK" / "... MIR"): la dinh danh bien the, khong phai tu thuong
  { const raw = String(name || ''); if (raw !== raw.toUpperCase()) for (const m of raw.matchAll(/[A-Z0-9][A-Z0-9\-\/.()]{4,}\)?\s+\(?([A-Z]{2,3})(?=[\s),]|$)/g)) { const t = m[1].toLowerCase(); if (!UNIT[t] && !VARIANT.has(t) && !BRANDS.has(t)) { ids.add('§' + t); words.delete(t); hwords.delete(t); } } }
  for (const w of weak) if (!skip.has(w)) (CLASS_RE.test(w) ? cids : ids).add(w);
  // tu viet CO DAU trong ten goc: la tu mo ta thong thuong, khong phai ten dong may (ten dong may luon viet khong dau)
  const viet = new Set(); for (const m of lower.matchAll(/[\p{L}\p{N}]+/gu)) { const n = nd(m[0]); if (n !== m[0]) viet.add(n); }
  return { spec, pack, strong, variant, color, cond, acc, bundle, attr, words, hwords, bwords, ids, cids, nums, viet, brands: brandsOf(base), res: resOf(spec, cids), kind: acc ? kindOf(base) : null };
}

const setEq = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
const overlap = (a, b) => { for (const x of a) if (b.has(x)) return true; return false; };
const subset = (a, b) => [...a].every(x => b.has(x));
const W2_OK = new Set('sach cuon quyen truyen bia mem cung bookmark hop goi tui chai lo tuyp'.split(' '));

/*
 * So khop 2 bo dac trung. W(token) -> trong so IDF (cang hiem cang nang); rare(token) -> true neu la tu hiem trong nhom (dinh danh dong SP).
 * Tra ve diem 0..1 (0 = loai) :  S 0.90-1.00 | W1 0.70-0.89 | W2 0.60-0.69
 */
function score(A, B, W = () => 1, rare = t => /\d/.test(t)) {   // khong co ngu lieu: chi coi ma (tu co so) la hiem
  if (A.cond !== B.cond || A.acc !== B.acc) return 0;
  if (A.kind && B.kind && A.kind.size && B.kind.size && ![...A.kind].some(k => B.kind.has(k))) return 0;   // phu kien khac loai (kinh cuong luc <> op lung)
  // thuong hieu da biet: moi ben co 1 thuong hieu ma ben kia khong co => khac hang (Gigabyte B760M <> MSI B760M; op UAG <> op Spigen)
  { const oa = [...A.brands].some(b => !B.brands.has(b)), ob = [...B.brands].some(b => !A.brands.has(b)); if (oa && ob) return 0; }
  if (!setEq(A.variant, B.variant)) {
    // ngoai le duy nhat: chi lech chu "wifi" trong khi 2 ten cung 1 ma hang day du cua nha san xuat (>= 6 ky tu) - "HP Smart Tank 210 Wifi (3D4L3A)" = "HP Smart Tank 210 (3D4L3A)"
    const diff = [...A.variant].filter(t => !B.variant.has(t)).concat([...B.variant].filter(t => !A.variant.has(t)));
    if (!(diff.every(t => t === 'wifi') && A.strong.some(c => c.core.length >= 6 && B.strong.some(d => d.full === c.full)))) return 0;
  }
  const colorClash = A.color.size && B.color.size && !setEq(A.color, B.color);   // ca hai deu ghi mau: phai cung bo mau (Pink White <> Trang Xanh)
  const sfxOnly = (X, Y) => [...X.ids].some(t => t.startsWith('§') && !Y.ids.has(t));   // hau to mau/chu don (GBK <> MIR, X <> S)
  /* ---- SKU: 2 ten trung DAY DU 1 ma hang dai (>= 8 ky tu) cua nha san xuat (LS27CG552EEXXV, 21QA006LVN, WW14BB944DGHSV...) = danh tinh chac chan.
   * Cac khac biet con lai (kich co lam tron 26.5/27 inch, "2 tầng"/"Double", cau hinh liet ke thieu...) chi la cach mo ta cua tung nguoi ban;
   * chi con chan: bien the (o tren), mau va hau to mau neu CA HAI ben deu ghi ma khac nhau. ---- */
  if (A.strong.some(c => c.core.length >= 8 && B.strong.some(d => d.full === c.full))) {
    if (colorClash || (sfxOnly(A, B) && sfxOnly(B, A))) return 0;
    if (!overlap(A.words, B.words)) return 0;                         // can it nhat 1 tu chung ngoai ma (thuong hieu / loai SP)
    let i = 0, u = 0; for (const t of A.hwords) { const w = W(t); u += w; if (B.hwords.has(t)) i += w; } for (const t of B.hwords) if (!A.hwords.has(t)) u += W(t);
    return +(0.92 + 0.08 * (u ? i / u : 0)).toFixed(3);
  }
  if (A.bundle !== B.bundle || A.pack !== B.pack) return 0;
  if (colorClash) return 0;
  // cung don vi phai trung TAP gia tri (34mm/44mm la tin nhieu lua chon); rieng kich co man hinh cho lech lam tron 0.6 inch (23.8 ~ 24, 31.5 ~ 32)
  for (const k of Object.keys(A.spec)) if (B.spec[k] && !setEq(A.spec[k], B.spec[k])) {
    if (k === 'in' && A.spec[k].size === 1 && B.spec[k].size === 1 && Math.abs(+[...A.spec[k]][0] - +[...B.spec[k]][0]) <= 0.6) continue;
    return 0;
  }
  if (A.res && B.res && !A.res.some(x => B.res.includes(x))) return 0;   // do phan giai khac nhau du viet khac don vi (1080P <> 3MP)
  // ma "lop thong so" (AC1200 <> AX1500): moi ben co 1 ma ben kia khong co => khac cau hinh
  { const oa = [...A.cids].some(b => !B.cids.has(b)), ob = [...B.cids].some(b => !A.cids.has(b)); if (oa && ob) return 0; }
  if ((A.words.has('khongday') && B.words.has('coday')) || (A.words.has('coday') && B.words.has('khongday'))) return 0;   // co day <> khong day
  const sa = A.strong, sb = B.strong;
  const wj = (x, y) => { let i = 0, u = 0; for (const t of x) { const w = W(t); u += w; if (y.has(t)) i += w; } for (const t of y) if (!x.has(t)) u += W(t); return u ? i / u : 0; };
  const idsOnly = (X, Y) => [...X.ids].filter(t => !Y.ids.has(t));
  const rareOnly = (X, Y) => [...X.words].filter(t => !Y.words.has(t) && rare(t));
  /* tu DINH DANH lech: hiem + viet khong dau trong ten goc (ten dong may/phien ban: Master, Anywhere, Nimbus...) + khong phai tu mo ta ky thuat/thuong hieu */
  const identOnly = (X, Y) => [...X.bwords].filter(t => !Y.words.has(t) && rare(t) && !X.viet.has(t) && !DESC.has(t) && !BRANDS.has(t) && !BRAND_ALIAS[t]);
  // ---- S: ma manh o ca 2 ben ----
  if (sa.length && sb.length) {
    const ua = sa.filter(c => !sb.some(d => codeEq(c, d))).length, ub = sb.filter(d => !sa.some(c => codeEq(c, d))).length;
    if (ua === sa.length || ub === sb.length) return 0;               // khong ma manh nao trung
    if (ua && ub) return 0;                                           // moi ben thua 1 ma manh khac nhau -> khac model / khac cau hinh
    // chi 1 ben thua ma manh (ma CPU, ten dong may viet lien "PuriCare360"...): chi nhan khi 2 ten trung DAY DU 1 ma hang dai (>= 8 ky tu) cua nha san xuat
    if (ua || ub) return 0;                                           // 1 ben thua ma manh (ma CPU, ma cau hinh...) ma khong co ma hang dai trung day du -> khong du can cu
    if (!overlap(A.words, B.words)) return 0;                         // can it nhat 1 tu chung ngoai ma (thuong hieu / loai SP)
    if (A.nums.size && B.nums.size && !subset(A.nums, B.nums) && !subset(B.nums, A.nums)) return 0;
    const plain = X => [...X.ids].filter(t => !t.startsWith('§'));
    if (plain(A).length !== plain(B).length || plain(A).some(t => !B.ids.has(t))) return 0;   // ma phu / ky hieu phien ban (E20, X24...) phai trung nhau
    if (sfxOnly(A, B) && sfxOnly(B, A)) return 0;                     // hau to mau/chu don lech o CA HAI ben; 1 ben khong ghi -> chap nhan
    if (identOnly(A, B).length && identOnly(B, A).length) return 0;   // CA HAI ben deu thua tu dinh danh -> 2 phien ban khac nhau (chu de/switch...)
    // PHU KIEN: ma trong ten la cua MAY TUONG THICH (Flip6, S26 Ultra...), khong phai cua chinh phu kien -> trung ma chua noi len gi;
    // moi tu hiem lech o bat ky ben nao (Flipsuit Neon <> op trong; Silicone Magnet <> kem guong) = phu kien khac.
    if (A.acc && (rareOnly(A, B).length || rareOnly(B, A).length)) return 0;
    return +(0.9 + 0.1 * wj(A.hwords, B.hwords)).toFixed(3);
  }
  if (sa.length || sb.length) {
    // 1 ben viet lien "RT-AX52" (ma manh), ben kia viet roi "RT AX52" (ma yeu "ax52" + tu "rt"): coi la trung ma
    const [S, O] = sa.length ? [A, B] : [B, A];
    const used = new Set(), pre = new Set();
    const okAll = S.strong.every(c => { const y = [...O.ids].find(y => y.length >= 4 && c.full.endsWith(y) && (p => /^[a-z]{1,3}$/.test(p) && O.words.has(p))(c.full.slice(0, c.full.length - y.length))); if (y) { used.add(y); pre.add(c.full.slice(0, c.full.length - y.length)); } return !!y; });
    if (!okAll) return 0;                                             // chi 1 ben co ma manh -> khong du can cu
    if (!setEq(A.nums, B.nums)) return 0;
    if ([...S.ids].some(t => !O.ids.has(t)) || [...O.ids].some(t => !used.has(t) && !S.ids.has(t))) return 0;
    if (identOnly(S, O).length && identOnly(O, S).filter(t => !pre.has(t)).length) return 0;
    if (A.acc && (rareOnly(S, O).length || rareOnly(O, S).filter(t => !pre.has(t)).length)) return 0;   // phu kien: nhu tren
    return +(0.9 + 0.05 * wj(A.hwords, B.hwords)).toFixed(3);
  }
  // ---- khong co ma manh: thuong hieu, so phien ban, tu dinh danh va tu hiem phai trung tuyet doi ----
  if (!setEq(A.brands, B.brands)) return 0;                           // 1 ben ghi hang, ben kia khong (hang nhai/OEM dat ten theo model noi tieng)
  if (!setEq(A.nums, B.nums)) return 0;
  if (!setEq(A.ids, B.ids)) return 0;
  if (!setEq(A.attr, B.attr)) return 0;                               // chat lieu / kieu day khac nhau hoac 1 ben khong ghi
  for (const u of ID_UNITS) if (!!A.spec[u] !== !!B.spec[u]) return 0;      // 1 ben ghi dung tich/kich co/so luong, ben kia khong -> mo ho
  const ra = rareOnly(A, B).length, rb = rareOnly(B, A).length;
  if (A.brands.size && [...A.ids].some(t => !t.startsWith('§') && rare(t))) {   // W1: co THUONG HIEU + ma yeu chung va hiem trong nhom (Logitech G304, TP-Link C64, Samsung A55...)
    // Phu kien (ma la cua MAY TUONG THICH, khong phai cua chinh no): khong ben nao duoc thua tu hiem.
    // May chinh: thuong hieu + ma + so + bien the + chat lieu + mau da trung -> tu mo ta tieng Viet cua tung nguoi ban ("băng tần kép", "chụp tai") duoc lech;
    //            nhung tu DINH DANH viet khong dau (Master <> Anywhere, Nimbus, Firefly, US <> EU) lech o bat ky ben nao -> loai.
    if (A.acc ? (ra || rb) : (identOnly(A, B).length || identOnly(B, A).length)) return 0;
    const j = Math.max(wj(A.hwords, B.hwords), wj(A.words, B.words));
    if (!overlap(A.words, B.words)) return 0;
    return +(0.7 + 0.19 * j).toFixed(3);
  }
  // W2: khong co ma dinh danh - 2 ten phai trung nhau tren TOAN BO tu (chi cho phep lech tu dong goi chung chung), cung cach ghi mau
  if (ra || rb) return 0;                                             // tu hiem (dong SP / chu de / phien ban phu) lech o bat ky ben nao -> loai
  if (A.color.size !== B.color.size) return 0;
  const ea = [...A.words].filter(t => !B.words.has(t) && !W2_OK.has(t)), eb = [...B.words].filter(t => !A.words.has(t) && !W2_OK.has(t));
  const jw = wj(A.words, B.words);
  if (!ea.length && !eb.length) return Math.min(A.words.size, B.words.size) >= 3 ? +(0.6 + 0.09 * jw).toFixed(3) : 0;
  // ten thiet bi ngan co so phien ban + thong so ("iPhone 15 128GB") nam tron trong ten dai ("Điện thoại Apple iPhone 15 128GB"): chi 1 ben thua tu, va deu la tu pho bien
  if ((ea.length && eb.length) || !(A.nums.size && Object.keys(A.spec).some(u => ID_UNITS.has(u))) || jw < 0.5) return 0;
  return +(0.6 + 0.09 * jw).toFixed(3);
}

/* Lien ket "khoa ten -> san pham" da luu con hop le? sameKey: ten chuan hoa trung nhau (chi khac noi dung trong ngoac/nhieu).
 * Khong hop le khi lech tinh trang (cu/moi) hoac ca 2 ten deu co ma model manh ma khong khop; lien ket khac ten phai dat duong S. */
function linkValid(fa, fb, sameKey) {
  if (fa.cond !== fb.cond) return false;
  const sa = fa.strong, sb = fb.strong;
  if (sa.length && sb.length) {
    if (sa.some(c => c.core.length >= 8 && sb.some(d => d.full === c.full))) return fa.acc === fb.acc;   // trung day du ma hang dai
    const ua = sa.filter(c => !sb.some(d => codeEq(c, d))).length, ub = sb.filter(d => !sa.some(c => codeEq(c, d))).length;
    if (ua === sa.length || ub === sb.length || (ua && ub)) return false;
  }
  return sameKey ? true : score(fa, fb) >= 0.9;
}

/* CHU KY BIEN THE cua 1 ten: ma model manh + bien the + tinh trang + so luong goi + mau + ma phu.
 * Hai offer cung khoa ten (normKey bo noi dung trong ngoac) ma khac chu ky = 2 san pham khac nhau (Tray <> Box, RF48A4000B4 <> RF48A4010M9, Đen <> Trắng). */
function signature(f) {
  return [f.strong.map(c => c.full).sort().join('+'), [...f.variant].sort().join('.'), f.cond, f.pack, [...f.color].sort().join('.'), [...f.ids].sort().join('.')].join('|');
}

/* Chi muc tang dan: add(id, name, grp) ; find(name, grp, min) -> [{id, score}] giam dan.
 * Ma manh xuat hien o QUA NHIEU san pham trong nhom (ten dong may "Fold8", chipset "B760M", may tuong thich cua phu kien)
 * khong dinh danh 1 san pham -> tu dong ha cap thanh ma yeu. */
function createIndex() {
  const F = new Map(), E = new Map(), G = new Map(), post = new Map(), nG = new Map(), dfC = new Map(), nC = new Map(), seen = new Set();
  const push = (k, id) => { let a = post.get(k); if (!a) post.set(k, a = []); a.push(id); };
  const toksOf = f => { const s = new Set(f.words); for (const t of f.ids) s.add(t); for (const t of f.cids) s.add(t); for (const c of f.strong) { s.add('#' + c.core); if (c.full !== c.core) s.add('#' + c.full); } return s; };
  const pdf = (grp, t) => (post.get(grp + '|' + t) || []).length;                 // so SAN PHAM chua token (dung de ha cap ma manh pho bien)
  const count = (f, grp, key) => { if (seen.has(key)) return; seen.add(key); nC.set(grp, (nC.get(grp) || 0) + 1); for (const t of toksOf(f)) dfC.set(grp + '|' + t, (dfC.get(grp + '|' + t) || 0) + 1); };
  const effective = (f, grp) => {
    const lim = Math.max(6, (nG.get(grp) || 0) * 0.005); const keep = [], demote = [];
    for (const c of f.strong) (pdf(grp, '#' + c.core) > lim ? demote : keep).push(c);
    if (!demote.length) return f;
    const ids = new Set(f.ids); for (const c of demote) ids.add(c.full);
    return { ...f, strong: keep, ids };
  };
  /* them san pham (ung vien de ghep) */
  function add(id, name, grp) {
    const f = features(name); F.set(id, f); E.delete(id); G.set(id, grp);
    nG.set(grp, (nG.get(grp) || 0) + 1);
    for (const t of toksOf(f)) push(grp + '|' + t, id);
    count(f, grp, grp + '|' + name);
  }
  /* them ten offer vao NGU LIEU thong ke (khong phai ung vien): de biet tu nao la mo ta pho bien ("băng tần kép", "gigabit") va tu nao hiem (dinh danh dong SP) */
  function addCorpus(name, grp, feats) { count(feats || features(name), grp, grp + '|' + name); }
  const eff = id => { let e = E.get(id); if (!e) { e = effective(F.get(id), G.get(id)); E.set(id, e); } return e; };
  function find(name, grp, min = 0.6, feats) {
    const f0 = feats || features(name); if (!nG.get(grp)) return [];
    const f = effective(f0, grp), N = nC.get(grp) || 1;
    const df = t => dfC.get(grp + '|' + t) || 0;
    const W = t => Math.log(1 + N / (1 + df(t)));
    const hv = Math.max(2, N * 0.04), rare = t => df(t) <= hv;
    const cand = new Set();
    for (const c of f0.strong) for (const k of ['#' + c.full, '#' + c.core]) { const a = post.get(grp + '|' + k); if (a && a.length < 3000) for (const id of a) cand.add(id); }
    for (const t of f.ids) { const a = post.get(grp + '|' + t); if (a && a.length < 3000) for (const id of a) cand.add(id); }      // moi ma yeu deu la moc tim ung vien
    { const ws = [...f.words].map(w => [w, pdf(grp, w)]).filter(x => x[1] > 0).sort((a, b) => a[1] - b[1]).slice(0, f.strong.length ? 2 : 4);
      for (const [w, n] of ws) if (n < 1500) for (const id of post.get(grp + '|' + w)) cand.add(id); }
    const out = [];
    for (const id of cand) { const sc = score(eff(id), f, W, rare); if (sc >= min) out.push({ id, score: sc }); }
    return out.sort((a, b) => b.score - a.score);
  }
  return { add, addCorpus, find, features: id => F.get(id), size: () => F.size };
}

/*
 * DAI GIA cho offer ghep mo. exactPrices: gia cac offer khop chinh xac (con hang); fuzzy: [{price, source,...}].
 * Chap nhan offer mo khi gia >= lo x gia neo (neo = trung vi offer chinh xac; neu khong co thi `fallback`, roi den trung vi offer mo),
 * hoac khi co >= 2 offer KHAC NGUON nam trong +-12% quanh no (dong thuan thi truong).
 * Offer mo DAT hon `hi` lan gia neo da biet cung bi loai (thuong la san pham khac loai cao cap hon).
 * Tra ve { ok, low, high, anchor }  (low = RE bat thuong -> khong dung dinh gia, liet ke cho quan tri duyet; high = dat hon han -> bo, khong anh huong gia re nhat)
 */
function band(exactPrices, fuzzy, lo = 0.7, fallback = 0, hi = 1.6) {
  const med = a => { const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)) : 0; };
  const known = exactPrices.length ? med(exactPrices) : (fallback > 0 ? fallback : 0);
  const anchor = known || med(fuzzy.map(o => o.price));
  const ok = [], low = [], high = [];
  for (const o of fuzzy) {
    if (known && o.price > hi * known) { high.push(o); continue; }    // dat hon han gia neo da biet -> gia niem yet cao / SP khac loai cao cap hon
    if (!anchor || o.price >= lo * anchor) { ok.push(o); continue; }
    const peers = new Set(fuzzy.filter(x => x !== o && x.source !== o.source && Math.abs(x.price - o.price) <= 0.12 * o.price).map(x => x.source));
    (peers.size >= 2 ? ok : low).push(o);
  }
  return { ok, low, high, anchor };
}

/* Nguon 1 nguoi ban (chuoi ban le / website hang): moi SP chi niem yet 1 lan -> offer cung nguoi ban ghep mo vao SP da co offer chinh xac cua ho = SP KHAC */
const SINGLE_SELLER = new Set(['thegioididong', 'dienmayxanh', 'fptshop', 'cellphones', 'dienmaycholon', 'hoangha', 'phucanh', 'anphat']);
/* Nguoi ban cua 1 offer: chuoi ban le = chinh nguon do; Shopee = ma shop trong duong dan; san khac khong xac dinh duoc -> null */
function sellerOf(src, url) {
  if (SINGLE_SELLER.has(src)) return src;
  if (src === 'shopee') { const m = String(url || '').match(/shopee\.vn\/product\/(\d+)\//) || String(url || '').match(/-i\.(\d+)\.\d+/); return m ? 'shopee:' + m[1] : null; }
  return null;
}
/* Offer chi giao 1 khu vuc (khong mua ho toan quoc duoc) */
const REGION_RE = /ch[iỉ] giao|ch[iỉ] b[aá]n t[aạ]i|giao t[aạ]i (hcm|hn|h[aà] n[oộ]i|tp)/i;
/* "Freeship" ghi trong ten offer: chi coi la mien phi van chuyen that khi khong kem dieu kien.
 * "[FREESHIP HN&HCM]", "freeship đơn từ 300k", "Freeship Xtra/Max" (chuong trinh cua san, co tran) -> van phai du phong phi ship. */
const FS_COND = /free ?ship[^|,;\])]{0,28}?(?:\bhn\b|\bhcm\b|ha noi|sai gon|tp\.?\s?hcm|noi thanh|khu vuc|toi da|don tu|tu \d|\d+ ?k\b|xtra|extra|\bmax\b)|(?:noi thanh|\bhn\b|\bhcm\b|ha noi)[^|,;\])]{0,12}free ?ship/;
const isFreeship = n => { const s = nd(n); return /free ?ship/.test(s) && !FS_COND.test(s); };

module.exports = { features, score, linkValid, signature, createIndex, band, codeOf, codeEq, brandsOf, sellerOf, nd, SINGLE_SELLER, REGION_RE, isFreeship };
