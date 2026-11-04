/*
 * Kiem thu backend v1.7.0 (chay: node tests/backend/test.js) - khong can mang, khong can Apps Script.
 * Pham vi: chinh sach POLICY_JSON + policyEval_, chu ky/nonce bot, tran ngay/gio, cong tac dung, tu dung khi loi lien tiep,
 * luong claim -> paying -> done qua botUpdate_, canon_ (JSON chuan hoa), nhac lenh hold.
 * (c) 2026 Nguyen Duy Dien. All rights reserved.
 */
'use strict';
const assert = require('assert'), crypto = require('crypto');
const { load } = require('./harness');
let pass = 0, fail = 0;
function t(name, f) { try { f(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', (e && e.message || e).split('\n')[0]); } }
const sha = s => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const hmac = (k, m) => crypto.createHmac('sha256', String(k)).update(String(m), 'utf8').digest('hex');
const canon = v => v === null || typeof v !== 'object' ? JSON.stringify(v === undefined ? null : v) : Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
// moc thoi gian trong gio lam viec VN (10:00 ICT = 03:00 UTC)
const T_WORK = Date.parse('2026-11-04T03:00:00Z'), T_NIGHT = Date.parse('2026-11-04T17:30:00Z');

function botKeyFor(gas) { const k = 'kkbot_testkey'; gas.props.BOT_KEY_HASH = gas.call('sha_', 'kk-bot|' + k); return k; }
function signed(gas, key, body) { const ts = gas.clock.now(), nonce = crypto.randomBytes(8).toString('hex'); const b = Object.assign({}, body, { bot_key: key, ts, nonce }); b.sig = hmac(sha('kk-mac|' + key), ts + '\n' + nonce + '\n' + sha(canon(b))); return b; }
function seedOrder(gas, code, opt = {}) {
  const o = Object.assign({ code, status: 'paid', payment_status: 'paid', paid_at: new Date(gas.clock.now()).toISOString(), created_at: new Date(gas.clock.now()).toISOString(), total: opt.total || 1000000, goods: opt.goods || 900000,
    vat: !!opt.vat, customer: Object.assign({ name: 'Khach A', phone: '0912345678', email: 'a@test.vn', address: 'So 1, Phuong 1, Quan 1, TP HCM' }, opt.customer || {}), lines: opt.lines || [{ sku: 'KK000001', name: 'SP 1', qty: 1, unit_cost: 900000, line_cost: 900000, line_fee: 32000, line_total: 932000 }] }, opt.order || {});
  gas.call('append_', 'Orders', { code, created_at: o.created_at, status: o.status, payment_status: o.payment_status, email: o.customer.email, phone: o.customer.phone, name: o.customer.name, goods: o.goods, fee: 32000, total: o.total, paid_at: o.paid_at, data: JSON.stringify(o), updated_at: o.created_at });
  o.lines.forEach((l, i) => gas.call('append_', 'PO', { po_id: code + '-' + (i + 1), order_code: code, sku: l.sku, name: l.name, qty: l.qty, status: 'to_order', collected_cost: l.line_cost, actual_source: '', actual_cost: '', supplier_order_id: '', tracking: '', data: JSON.stringify({ ship_to: o.customer, vat: o.vat, unit_cost: l.unit_cost, ship_est: 0 }), updated_at: o.created_at }));
  return o;
}

console.log('1. Chinh sach (policy_, policyEval_, canon_)');
{
  const gas = load({ now: T_WORK });
  t('policy_ mac dinh: 5tr/20tr/30tr, 10 lenh/gio, dung sai lay tu TOLERANCE', () => { const p = gas.call('policy_'); assert.equal(p.autonomy.auto_max_vnd, 5000000); assert.equal(p.autonomy.otp_max_vnd, 20000000); assert.equal(p.autonomy.daily_cap_vnd, 30000000); assert.equal(p.autonomy.max_per_hour, 10); assert.equal(p.price.tolerance_vnd, 5000); assert.equal(p.version, 'default'); assert.equal(p.autonomy.enabled, true); });
  t('POLICY_JSON ghi de tung nhom, giu phan con lai', () => { gas.props.POLICY_JSON = JSON.stringify({ version: '2026-11-04.1', autonomy: { auto_max_vnd: 3000000 }, price: { tolerance_vnd: 8000 } }); const p = gas.call('policy_'); assert.equal(p.autonomy.auto_max_vnd, 3000000); assert.equal(p.autonomy.otp_max_vnd, 20000000); assert.equal(p.price.tolerance_vnd, 8000); assert.equal(p.version, '2026-11-04.1'); delete gas.props.POLICY_JSON; });
  t('POLICY_JSON hong -> dung mac dinh, khong nem loi', () => { gas.props.POLICY_JSON = '{bad'; const p = gas.call('policy_'); assert.equal(p.autonomy.auto_max_vnd, 5000000); delete gas.props.POLICY_JSON; });
  t('AUTONOMY_ENABLED=0 tat cong tac', () => { gas.props.AUTONOMY_ENABLED = '0'; assert.equal(gas.call('policy_').autonomy.enabled, false); gas.props.AUTONOMY_ENABLED = '1'; });
  t('canon_ sap xep khoa, giong ban Node', () => { const v = { b: [3, { z: 1, a: null }], a: 'x', c: { y: 2, x: 1 } }; assert.equal(gas.call('canon_', v), canon(v)); assert.equal(gas.call('canon_', v), '{"a":"x","b":[3,{"a":null,"z":1}],"c":{"x":1,"y":2}}'); });
  t('policySig_ on dinh va doi khi chinh sach doi', () => { const s1 = gas.call('policySig_', gas.call('policy_')); assert.equal(s1, gas.call('policySig_', gas.call('policy_'))); gas.props.POLICY_JSON = JSON.stringify({ version: 'v2' }); assert.notEqual(s1, gas.call('policySig_', gas.call('policy_'))); delete gas.props.POLICY_JSON; });
  t('inHours_: 10:00 ICT trong gio, 00:30 ICT ngoai gio', () => { assert.equal(gas.call('inHours_', { from: '07:00', to: '22:00', tz: 'Asia/Ho_Chi_Minh' }, T_WORK), true); assert.equal(gas.call('inHours_', { from: '07:00', to: '22:00', tz: 'Asia/Ho_Chi_Minh' }, T_NIGHT), false); });
  const ev = (po, o, offer, ctx) => gas.call('policyEval_', po, o, offer, Object.assign({ now: T_WORK }, ctx || {}));
  t('<= 5tr trong gio, nguon tiki -> auto', () => { const r = ev({ collected_cost: 4000000 }, { vat: false }, { s: 'tiki', total: 4003000 }); assert.deepEqual(r, { decision: 'auto', reasons: [], version: 'default' }); });
  t('5-20tr -> otp', () => assert.equal(ev({ collected_cost: 12000000 }, {}, { s: 'tiki' }).decision, 'otp'));
  t('> 20tr -> hold OVER_AUTO_CAP', () => assert.deepEqual(ev({ collected_cost: 25000000 }, {}, { s: 'tiki' }).reasons, ['OVER_AUTO_CAP']));
  t('ngoai gio -> OUT_OF_HOURS', () => assert.ok(ev({ collected_cost: 100000 }, {}, { s: 'tiki' }, { now: T_NIGHT }).reasons.includes('OUT_OF_HOURS')));
  t('vuot tran ngay -> DAILY_CAP', () => assert.ok(ev({ collected_cost: 2000000 }, {}, { s: 'tiki' }, { daySpent: 29000000 }).reasons.includes('DAILY_CAP')));
  t('du 10 lenh/gio -> HOURLY_CAP', () => assert.ok(ev({ collected_cost: 100000 }, {}, { s: 'tiki' }, { hourCount: 10 }).reasons.includes('HOURLY_CAP')));
  t('nguon khong trong danh sach -> SOURCE_NOT_ALLOWED', () => assert.ok(ev({ collected_cost: 100000 }, {}, { s: 'shopee' }).reasons.includes('SOURCE_NOT_ALLOWED')));
  t('don can VAT: mac dinh bot khong dat (VAT_NEEDS_B2B); cho phep qua vat_sources -> auto', () => { assert.ok(ev({ collected_cost: 100000 }, { vat: true }, { s: 'tiki' }).reasons.includes('VAT_NEEDS_B2B')); gas.props.POLICY_JSON = JSON.stringify({ sources: { allow: ['tiki', 'shopee'], vat_sources: ['tiki'] } }); assert.equal(ev({ collected_cost: 100000 }, { vat: true }, { s: 'tiki' }).decision, 'auto'); assert.ok(ev({ collected_cost: 100000 }, { vat: true }, { s: 'shopee' }).reasons.includes('VAT_NEEDS_B2B')); delete gas.props.POLICY_JSON; });
  t('gia nguon vuot thu + dung sai -> OVER_CAP', () => assert.ok(ev({ collected_cost: 1000000 }, {}, { s: 'tiki', total: 1006000 }).reasons.includes('OVER_CAP')));
  t('bao gia cu > 6 gio -> QUOTE_STALE', () => assert.ok(ev({ collected_cost: 100000 }, {}, { s: 'tiki' }, { quoteAgeHours: 7 }).reasons.includes('QUOTE_STALE')));
  t('khach moi don > 10tr -> NEW_CUSTOMER_HIGH_VALUE; khach cu thi otp', () => { assert.ok(ev({ collected_cost: 12000000 }, {}, { s: 'tiki' }, { firstOrder: true }).reasons.includes('NEW_CUSTOMER_HIGH_VALUE')); assert.equal(ev({ collected_cost: 12000000 }, {}, { s: 'tiki' }, { firstOrder: false }).decision, 'otp'); });
  t('dia chi thieu cap -> ADDRESS_INCOMPLETE', () => assert.ok(ev({ collected_cost: 100000 }, {}, { s: 'tiki' }, { addrLevels: 2 }).reasons.includes('ADDRESS_INCOMPLETE')));
  t('nhieu ly do cung luc deu duoc liet ke', () => { const r = ev({ collected_cost: 25000000 }, {}, { s: 'lazada' }, { now: T_NIGHT }); ['AUTONOMY_OFF'].forEach(x => assert.ok(!r.reasons.includes(x))); ['OUT_OF_HOURS', 'OVER_AUTO_CAP', 'SOURCE_NOT_ALLOWED'].forEach(x => assert.ok(r.reasons.includes(x), x)); });
}

console.log('2. Xac thuc bot: khoa, chu ky, nonce, lech gio');
{
  const gas = load({ now: T_WORK }); const key = botKeyFor(gas);
  t('khoa sai -> 401', () => assert.throws(() => gas.call('botAuth_', { bot_key: 'x' }), e => e.code === 401));
  t('khoa dung, khong chu ky (che do tuong thich) -> qua', () => { gas.call('botAuth_', { bot_key: key, device: 'd1' }); assert.equal(gas.props.BOT_DEVICE, 'd1'); });
  t('chu ky dung -> qua; gui lai cung nonce -> 401', () => { const b = signed(gas, key, { a: 'bot.queue', device: 'd1' }); gas.call('botAuth_', b); assert.throws(() => gas.call('botAuth_', b), e => /nonce/.test(e.message)); });
  t('sua than thong diep sau khi ky -> 401', () => { const b = signed(gas, key, { a: 'bot.update', po_id: 'X-1', state: 'paying', total: 1000 }); b.total = 999999; assert.throws(() => gas.call('botAuth_', b), e => /Chữ ký/.test(e.message)); });
  t('lech gio > 5 phut -> 401', () => { const b = signed(gas, key, { a: 'bot.queue' }); gas.clock.add(6 * 60e3); assert.throws(() => gas.call('botAuth_', b), e => /lệch giờ/.test(e.message)); gas.clock.add(-6 * 60e3); });
  t('BOT_REQUIRE_SIG=1: thieu chu ky -> 401', () => { gas.props.BOT_REQUIRE_SIG = '1'; assert.throws(() => gas.call('botAuth_', { bot_key: key }), e => e.code === 401); gas.call('botAuth_', signed(gas, key, { a: 'bot.queue' })); gas.props.BOT_REQUIRE_SIG = '0'; });
  t('chu ky Node (crypto) khop hmac_ cua may chu', () => assert.equal(gas.call('hmac_', 'k', 'm'), hmac('k', 'm')));
}

console.log('3. Hang doi bot va vong doi claim -> paying -> done');
{
  const gas = load({ now: T_WORK }); const key = botKeyFor(gas);
  seedOrder(gas, 'KKAAAA0001', { lines: [{ sku: 'KK000001', name: 'SP 1', qty: 1, unit_cost: 900000, line_cost: 900000, line_fee: 32000 }] });
  t('bot.queue tra chinh sach, chu ky, cong tac, lenh cho dat', () => { const q = gas.call('botQueue_', { bot_key: key }); assert.equal(q.items.length, 1); assert.equal(q.enabled, true); assert.equal(q.policy.autonomy.auto_max_vnd, 5000000); assert.equal(q.policy_sig, gas.call('policySig_', gas.call('policy_'))); assert.equal(q.tolerance, 5000); assert.equal(q.day_spent, 0); });
  const sig = gas.call('policySig_', gas.call('policy_'));
  t('claim voi policy_sig cu -> 409 POLICY_STALE', () => assert.throws(() => gas.call('botUpdate_', { bot_key: key, po_id: 'KKAAAA0001-1', state: 'claim', run: 'r1', source: 'tiki', policy_sig: 'old' }), e => /POLICY_STALE/.test(e.message)));
  t('claim hop le -> working, otp=false', () => { const r = gas.call('botUpdate_', { bot_key: key, po_id: 'KKAAAA0001-1', state: 'claim', run: 'r1', source: 'tiki', policy_sig: sig, offer_total: 905000, addr_levels: 3 }); assert.equal(r.bot.state, 'working'); const d = JSON.parse(gas.call('find_', 'PO', 'po_id', 'KKAAAA0001-1').data); assert.equal(d.bot.otp, false); assert.equal(d.bot.policy, 'default'); });
  t('paying vuot thu + dung sai -> 409', () => assert.throws(() => gas.call('botUpdate_', { bot_key: key, po_id: 'KKAAAA0001-1', state: 'paying', run: 'r1', total: 906000, policy_sig: sig }), e => /vượt tiền hàng/.test(e.message)));
  t('paying hop le -> paying, day_spent tinh ca lenh dang tra', () => { const r = gas.call('botUpdate_', { bot_key: key, po_id: 'KKAAAA0001-1', state: 'paying', run: 'r1', total: 903000, ship: 16500, policy_sig: sig }); assert.equal(r.bot.state, 'paying'); assert.equal(gas.call('botDaySpent_'), 903000); });
  t('done -> ordered, so cai ghi chi NCC, chuoi loi ve 0', () => { gas.props.BOT_FAIL_STREAK = '2'; const r = gas.call('botUpdate_', { bot_key: key, po_id: 'KKAAAA0001-1', state: 'done', run: 'r1', supplier_order_id: 'TIKI123', total: 903000 }); assert.equal(r.status, 'ordered'); assert.equal(gas.props.BOT_FAIL_STREAK, '0'); const L = gas.call('rows_', 'Ledger'); assert.ok(L.some(x => x.debit === '3388' && Number(x.amount) === 900000), 'chi NCC 3388'); assert.equal(gas.call('botDaySpent_'), 903000); });
  t('bot.queue khong con lenh sau khi dat', () => assert.equal(gas.call('botQueue_', { bot_key: key }).items.length, 0));
}

console.log('4. Hanh lang: hold, tran ngay, tran gio, cong tac dung, tu dung khi loi lien tiep');
{
  const gas = load({ now: T_WORK }); const key = botKeyFor(gas); const sig = () => gas.call('policySig_', gas.call('policy_'));
  // khach da co don cu da thanh toan -> khong phai khach moi
  seedOrder(gas, 'KKAAAA0000', { order: { status: 'delivered', created_at: '2026-10-01T03:00:00Z', paid_at: '2026-10-01T03:10:00Z' } });
  seedOrder(gas, 'KKBBBB0001', { total: 25032000, goods: 25000000, lines: [{ sku: 'KK000002', name: 'Tivi 85 inch', qty: 1, unit_cost: 25000000, line_cost: 25000000, line_fee: 32000 }] });
  t('lenh 25tr -> claim bi tu choi, bot.state=hold, ly do OVER_AUTO_CAP, email quan tri', () => { assert.throws(() => gas.call('botUpdate_', { bot_key: key, po_id: 'KKBBBB0001-1', state: 'claim', run: 'r2', source: 'tiki', policy_sig: sig() }), e => /OVER_AUTO_CAP/.test(e.message)); const d = JSON.parse(gas.call('find_', 'PO', 'po_id', 'KKBBBB0001-1').data); assert.equal(d.bot.state, 'hold'); assert.deepEqual(d.bot.reasons, ['OVER_AUTO_CAP']); assert.ok(gas.mails.some(m => /chờ người duyệt/.test(m.subject))); });
  t('khach moi (chua co don) + 12tr -> hold NEW_CUSTOMER_HIGH_VALUE', () => { seedOrder(gas, 'KKNEW00001', { total: 12032000, goods: 12000000, customer: { phone: '0988888888', email: 'moi@test.vn' }, lines: [{ sku: 'KK000009', name: 'Laptop', qty: 1, unit_cost: 12000000, line_cost: 12000000, line_fee: 32000 }] }); assert.throws(() => gas.call('botUpdate_', { bot_key: key, po_id: 'KKNEW00001-1', state: 'claim', run: 'rn', source: 'tiki', policy_sig: sig() }), e => /NEW_CUSTOMER_HIGH_VALUE/.test(e.message)); });
  t('hang doi van liet ke lenh hold voi trang thai de tien ich hien thi', () => { const q = gas.call('botQueue_', { bot_key: key }); assert.ok(q.items.some(i => i.po_id === 'KKBBBB0001-1' && i.bot.state === 'hold')); });
  t('noi chinh sach (otp_max 30tr) -> claim duoc, otp=true', () => { gas.props.POLICY_JSON = JSON.stringify({ version: 'v30', autonomy: { otp_max_vnd: 30000000, daily_cap_vnd: 40000000 }, instrument: { per_txn_cap_vnd: 30000000 } }); const r = gas.call('botUpdate_', { bot_key: key, po_id: 'KKBBBB0001-1', state: 'claim', run: 'r3', source: 'tiki', policy_sig: sig() }); assert.equal(r.bot.state, 'working'); assert.equal(JSON.parse(gas.call('find_', 'PO', 'po_id', 'KKBBBB0001-1').data).bot.otp, true); });
  t('paying 25tr trong tran ngay 40tr -> qua; lenh thu hai 16tr bi chan DAILY_CAP ngay khi claim', () => {
    gas.call('botUpdate_', { bot_key: key, po_id: 'KKBBBB0001-1', state: 'paying', run: 'r3', total: 25004000, policy_sig: sig() });
    seedOrder(gas, 'KKBBBB0002', { total: 16032000, goods: 16000000, lines: [{ sku: 'KK000003', name: 'May giat', qty: 1, unit_cost: 16000000, line_cost: 16000000, line_fee: 32000 }] });
    assert.throws(() => gas.call('botUpdate_', { bot_key: key, po_id: 'KKBBBB0002-1', state: 'claim', run: 'r4', source: 'tiki', policy_sig: sig() }), e => /DAILY_CAP/.test(e.message));
    assert.equal(JSON.parse(gas.call('find_', 'PO', 'po_id', 'KKBBBB0002-1').data).bot.state, 'hold');
  });
  t('tran moi gio (max_per_hour=1, da dung 1 trong gio) -> claim qua, paying bi HOURLY_CAP', () => { gas.props.POLICY_JSON = JSON.stringify({ autonomy: { max_per_hour: 1, daily_cap_vnd: 100000000, otp_max_vnd: 30000000 }, instrument: { per_txn_cap_vnd: 30000000 } }); gas.call('botUpdate_', { bot_key: key, po_id: 'KKBBBB0002-1', state: 'claim', run: 'r4', source: 'tiki', policy_sig: sig() }); assert.throws(() => gas.call('botUpdate_', { bot_key: key, po_id: 'KKBBBB0002-1', state: 'paying', run: 'r4', total: 16002000, policy_sig: sig() }), e => /HOURLY_CAP/.test(e.message)); });
  t('cong tac AUTONOMY_ENABLED=0 -> paying 409 AUTONOMY_OFF, queue enabled=false', () => { gas.props.AUTONOMY_ENABLED = '0'; assert.equal(gas.call('botQueue_', { bot_key: key }).enabled, false); assert.throws(() => gas.call('botUpdate_', { bot_key: key, po_id: 'KKBBBB0002-1', state: 'paying', run: 'r4', total: 16002000, policy_sig: sig() }), e => /AUTONOMY_OFF/.test(e.message)); gas.props.AUTONOMY_ENABLED = '1'; });
  t('3 loi lien tiep -> tu tat tu dong + email', () => { delete gas.props.POLICY_JSON; gas.props.BOT_FAIL_STREAK = '0'; for (let i = 0; i < 3; i++) { seedOrder(gas, 'KKCCCC000' + i, {}); gas.call('botUpdate_', { bot_key: key, po_id: 'KKCCCC000' + i + '-1', state: 'claim', run: 'f' + i, source: 'tiki' }); gas.call('botUpdate_', { bot_key: key, po_id: 'KKCCCC000' + i + '-1', state: 'fail', note: 'loi thu ' + i }); } assert.equal(gas.props.AUTONOMY_ENABLED, '0'); assert.ok(gas.mails.some(m => /TỰ DỪNG/.test(m.subject))); });
  t('bat lai qua adminConfig_ -> chuoi loi ve 0, POLICY_JSON hong bi tu choi', () => { gas.call('append_', 'Sessions', { token_hash: gas.call('hash_', 'tok'), email: 'nguyenduydien75@gmail.com', role: 'admin', created_at: new Date(gas.clock.now()).toISOString(), expires_at: new Date(gas.clock.now() + 3600e3).toISOString() }); const out = gas.call('adminConfig_', { token: 'tok', set: { AUTONOMY_ENABLED: '1', POLICY_JSON: JSON.stringify({ version: 'v9' }) } }); assert.equal(gas.props.AUTONOMY_ENABLED, '1'); assert.equal(gas.props.BOT_FAIL_STREAK, '0'); assert.equal(out.POLICY_EFFECTIVE.version, 'v9'); assert.throws(() => gas.call('adminConfig_', { token: 'tok', set: { POLICY_JSON: '[1,2]' } }), e => /POLICY_JSON/.test(e.message)); });
}

console.log('5. Theo doi moi gio: bot khong ket noi, lenh hold qua SLA');
{
  const gas = load({ now: T_WORK }); botKeyFor(gas);
  seedOrder(gas, 'KKDDDD0001', {});
  t('co lenh cho + bot chua tung ket noi trong gio lam viec -> email canh bao (1 lan/6 gio)', () => { gas.call('botWatch_'); gas.call('botWatch_'); assert.equal(gas.mails.filter(m => /không kết nối/.test(m.subject)).length, 1); });
  t('bot vua poll -> khong canh bao', () => { gas.mails.length = 0; gas.cache.clear(); gas.props.BOT_SEEN_AT = new Date(gas.clock.now()).toISOString(); gas.call('botWatch_'); assert.equal(gas.mails.length, 0); });
  t('lenh hold qua 4 gio -> email nhac gop', () => { const r = gas.call('find_', 'PO', 'po_id', 'KKDDDD0001-1'); const d = JSON.parse(r.data); d.bot = { state: 'hold', at: new Date(gas.clock.now() - 5 * 3600e3).toISOString(), reasons: ['OVER_AUTO_CAP'] }; gas.call('update_', 'PO', r._row, { data: JSON.stringify(d) }); gas.call('botWatch_'); assert.ok(gas.mails.some(m => /chờ người duyệt quá 4 giờ/.test(m.subject))); });
  t('audit_ liet ke lenh hold', () => { const a = gas.call('audit_'); assert.ok(a.issues.some(i => /chờ người duyệt/.test(i.msg))); });
}

console.log(`\nKet qua: ${pass} dat, ${fail} loi`);
process.exit(fail ? 1 : 0);
