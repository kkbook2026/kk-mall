/* Kiem thu thu vien tien ich (lib.js): tach dia chi, ke hoach nguon theo chinh sach, canon JSON va chu ky khop may chu.
 * Chay: node tests/extension/lib.test.js   (c) 2026 Nguyen Duy Dien */
'use strict';
const assert = require('assert'), crypto = require('crypto');
const L = require('../../extension/kk-auto-order/lib.js');
const { load } = require('../backend/harness');
let pass = 0, fail = 0;
const t = (n, f) => { try { const r = f(); if (r && r.then) return r.then(() => { pass++; console.log('  ✓', n); }, e => { fail++; console.log('  ✗', n, '\n     ', String(e.message).split('\n')[0]); }); pass++; console.log('  ✓', n); } catch (e) { fail++; console.log('  ✗', n, '\n     ', String(e.message).split('\n')[0]); } };
const pol = { version: 'v1', autonomy: { enabled: true, auto_max_vnd: 5e6, otp_max_vnd: 20e6, daily_cap_vnd: 30e6, hours: { from: '00:00', to: '23:59', tz: 'Asia/Ho_Chi_Minh' } }, price: { tolerance_vnd: 5000 }, sources: { allow: ['tiki'], vat_sources: [] }, customer: { first_order_hold_over_vnd: 10e6 } };
const off = (p, l, s = 'tiki') => ({ s, k: 1, x: 0, p, l, u: 'https://tiki.vn/san-pham-p123.html' });
(async () => {
  console.log('1. Ke hoach nguon theo chinh sach');
  t('<= 5tr trong dung sai -> auto', () => { const r = L.planAuto({ collected_cost: 900000, qty: 1, unit_cost: 900000 }, [off(900000, 904000)], 5000, ['tiki'], pol); assert.equal(r.decision, 'auto'); assert.ok(r.pick); });
  t('vuot dung sai -> khong co pick', () => { const r = L.planAuto({ collected_cost: 900000, qty: 1, unit_cost: 900000 }, [off(900000, 906000)], 5000, ['tiki'], pol); assert.equal(r.pick, null); assert.match(r.why, /dung sai/); });
  t('dung sai lay tu chinh sach (8000) thay vi tham so', () => { const r = L.planAuto({ collected_cost: 900000, qty: 1, unit_cost: 900000 }, [off(900000, 906000)], 5000, ['tiki'], Object.assign({}, pol, { price: { tolerance_vnd: 8000 } })); assert.ok(r.pick); });
  t('5-20tr -> otp', () => assert.equal(L.planAuto({ collected_cost: 12e6, qty: 1, unit_cost: 12e6 }, [off(12e6, 12e6)], 5000, ['tiki'], pol).decision, 'otp'));
  t('> 20tr -> hold OVER_AUTO_CAP, khong pick', () => { const r = L.planAuto({ collected_cost: 25e6, qty: 1, unit_cost: 25e6 }, [off(25e6, 25e6)], 5000, ['tiki'], pol); assert.equal(r.pick, null); assert.deepEqual(r.reasons, ['OVER_AUTO_CAP']); });
  t('vuot tran ngay (da chi 29tr) -> DAILY_CAP', () => { const p2 = Object.assign({}, pol, { _daySpent: 29e6 }); assert.deepEqual(L.planAuto({ collected_cost: 2e6, qty: 1, unit_cost: 2e6 }, [off(2e6, 2e6)], 5000, ['tiki'], p2).reasons, ['DAILY_CAP']); });
  t('nguon ngoai danh sach cho phep -> dat tay', () => { const r = L.planAuto({ collected_cost: 900000, qty: 1, unit_cost: 900000 }, [off(900000, 900000)], 5000, ['tiki'], Object.assign({}, pol, { sources: { allow: [], vat_sources: [] } })); assert.equal(r.pick, null); assert.match(r.why, /cho phép|chưa có bot/); });
  t('don VAT: mac dinh dat tay; vat_sources co tiki -> auto', () => { assert.equal(L.planAuto({ collected_cost: 900000, qty: 1, unit_cost: 900000, vat: true }, [off(900000, 900000)], 5000, ['tiki'], pol).pick, null); assert.equal(L.planAuto({ collected_cost: 900000, qty: 1, unit_cost: 900000, vat: true }, [off(900000, 900000)], 5000, ['tiki'], Object.assign({}, pol, { sources: { allow: ['tiki'], vat_sources: ['tiki'] } })).decision, 'auto'); });
  t('ngoai gio -> OUT_OF_HOURS', () => { const p2 = Object.assign({}, pol, { autonomy: Object.assign({}, pol.autonomy, { hours: { from: '07:00', to: '07:01', tz: 'Asia/Ho_Chi_Minh' } }) }); const r = L.policyEval({ collected_cost: 1000 }, off(1000, 1000), p2, { now: Date.parse('2026-11-04T17:30:00Z') }); assert.ok(r.reasons.includes('OUT_OF_HOURS')); });
  t('khong co chinh sach (may chu cu) -> hanh vi cu', () => { const r = L.planAuto({ collected_cost: 900000, qty: 1, unit_cost: 900000 }, [off(900000, 904000)], 5000, ['tiki']); assert.ok(r.pick); assert.equal(r.decision, 'auto'); });

  console.log('2. Canon va chu ky khop may chu');
  const gas = load();
  t('canon giong canon_ cua may chu', () => { const v = { z: [1, { b: 2, a: [null, 'x'] }], a: 'ü', m: { q: 1, p: 2 } }; assert.equal(L.canon(v), gas.call('canon_', v)); });
  t('chu ky tinh bang cong thuc tien ich duoc may chu chap nhan', () => {
    const key = 'kkbot_abc'; gas.props.BOT_KEY_HASH = gas.call('sha_', 'kk-bot|' + key);
    const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
    const ts = Date.now(), nonce = 'n1'; const b = { a: 'bot.queue', bot_key: key, device: 'd', ts, nonce };
    b.sig = crypto.createHmac('sha256', sha('kk-mac|' + key)).update(ts + '\n' + nonce + '\n' + sha(L.canon(b)), 'utf8').digest('hex');
    gas.clock.set(ts); gas.call('botAuth_', b);
  });
  await t('tach dia chi 3 cap', async () => {
    const dir = { regions: async () => [[1, 'Thành phố Hồ Chí Minh'], [2, 'Hà Nội']], districts: async id => id === 1 ? [[11, 'Quận 1'], [12, 'Quận Bình Thạnh']] : [[21, 'Quận Ba Đình']], wards: async id => id === 11 ? [[111, 'Phường Bến Nghé']] : [] };
    const r = await L.parseAddress('12 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP HCM', dir); assert.equal(r.region.id, 1); assert.equal(r.district.id, 11); assert.equal(r.ward.id, 111);
  });
  await t('policyEval: approved bo OVER_AUTO_CAP/khach moi, giu OVER_CAP; planAuto nhan ctx.approved', async () => {
    const pol = { autonomy: { auto_max_vnd: 5000000, otp_max_vnd: 20000000, daily_cap_vnd: 30000000, hours: { from: '00:00', to: '23:59', tz: 'Asia/Ho_Chi_Minh' } }, sources: { allow: ['tiki'] }, price: { tolerance_vnd: 5000 } };
    const item = { collected_cost: 25000000, qty: 1, unit_cost: 25000000 }, offer = { s: 'tiki', l: 25000000 };
    assert.equal(L.policyEval(item, offer, pol, {}).decision, 'hold');
    const ev = L.policyEval(item, offer, pol, { approved: true }); assert.equal(ev.decision, 'otp'); assert.deepEqual(ev.reasons, []);
    assert.deepEqual(L.policyEval(item, { s: 'tiki', l: 25100000 }, pol, { approved: true }).reasons, ['OVER_CAP']);
    const offers = [{ s: 'tiki', k: true, p: 25000000, l: 25000000, u: 'https://tiki.vn/tivi-p123.html' }];
    assert.equal(L.planAuto(item, offers, 5000, ['tiki'], pol).pick, null); assert.ok(L.planAuto(item, offers, 5000, ['tiki'], pol, { approved: true }).pick);
  });
  console.log(`\nKet qua: ${pass} dat, ${fail} loi`); process.exit(fail ? 1 : 0);
})();
