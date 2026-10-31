/*
 * KK-MALL Auto Order - điều phối (service worker)
 * Lấy lệnh mua "Cần đặt" từ máy chủ KK-MALL → chọn nguồn tự động (Tiki) trong biên dung sai → mở trang nguồn → trang Tiki tự
 * điền địa chỉ khách, chọn thẻ đã lưu → máy chủ duyệt tổng tiền → bấm Đặt hàng → chủ sở hữu nhập OTP → báo mã đơn về máy chủ.
 * (c) 2026 Nguyễn Duy Điển (KK-2026). All rights reserved.
 */
'use strict';
importScripts('lib.js');
const L = self.KKLIB;
const SITE = 'https://www.kk-mall.com';
const DEF = { botKey: '', backend: '', auto: false, hourFrom: 7, hourTo: 22, pollMin: 3, maxOrder: 5000000, cardLast4: '', remember: false };
const MAX_STEP_MIN = 6, MAX_MANUAL_MIN = 12, MAX_PAY_MIN = 15;

/* ---------- lưu trữ (tuần tự hóa ghi trạng thái) ---------- */
let lockP = Promise.resolve();
const withLock = fn => (lockP = lockP.then(fn, fn));
const getL = async k => (await chrome.storage.local.get(k))[k];
async function settings() { return Object.assign({}, DEF, (await getL('settings')) || {}); }
async function getState() { return Object.assign({ job: null, log: [], queue: [], paused: '', retry: {}, lastPoll: 0, device: '' }, (await getL('state')) || {}); }
const mutate = fn => withLock(async () => { const s = await getState(); const r = await fn(s); await chrome.storage.local.set({ state: s }); badge(s); return r; });
async function log(msg, lvl) { console.log('[KK]', msg); await mutate(s => { s.log.unshift({ at: Date.now(), lvl: lvl || 'i', msg: String(msg).slice(0, 300) }); s.log = s.log.slice(0, 120); }); }
function badge(s) {
  const t = s.paused ? '!' : s.job ? (s.job.step === 'paying' ? 'OTP' : '●') : (s.queue || []).filter(q => q.plan === 'auto').length ? String(s.queue.filter(q => q.plan === 'auto').length) : '';
  chrome.action.setBadgeText({ text: t }); chrome.action.setBadgeBackgroundColor({ color: s.paused ? '#B91C1C' : s.job && s.job.step === 'paying' ? '#7C3AED' : '#1D4ED8' });
}
async function adminKey() { const s = await settings(); if (s.remember) return (await getL('adminKeyLocal')) || ''; return ((await chrome.storage.session.get('adminKey')).adminKey) || ''; }

/* ---------- máy chủ KK-MALL ---------- */
async function backendUrl() {
  const s = await settings(); if (s.backend) return s.backend;
  const t = await (await fetch(SITE + '/config.js?t=' + Date.now(), { cache: 'no-store' })).text();
  const m = t.match(/KK_BACKEND\s*=\s*'(https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec)'/); if (!m) throw new Error('Không đọc được địa chỉ máy chủ từ kk-mall.com/config.js');
  return m[1];
}
async function api(a, body) {
  const s = await settings(), st = await getState();
  if (!s.botKey) { const e = new Error('Chưa nhập khóa bot'); e.code = 401; throw e; }
  const r = await fetch(await backendUrl(), { method: 'POST', body: JSON.stringify(Object.assign({ a, bot_key: s.botKey, device: st.device }, body || {})), redirect: 'follow' });
  let j; try { j = await r.json(); } catch (e) { throw new Error('Máy chủ KK-MALL đang bận'); }
  if (j && j.error) { const e = new Error(j.error); e.code = j.code; throw e; }
  return j;
}

/* ---------- link nguồn: giải mã gói dữ liệu quản trị (data.enc) bằng khóa quản trị ---------- */
let OFFERS = null, OFFERS_AT = 0;
async function offers() {
  if (OFFERS && Date.now() - OFFERS_AT < 30 * 60e3) return OFFERS;
  const key = await adminKey(); if (!key) throw Object.assign(new Error('Chưa nhập khóa quản trị (để đọc link nguồn) - mở tiện ích và nhập'), { pause: true });
  const enc = await (await fetch(SITE + '/admin/data.enc?t=' + Date.now(), { cache: 'no-store' })).json();
  const b64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), 'PBKDF2', false, ['deriveKey']);
  const aes = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(enc.salt), iterations: enc.iter }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  let pt; try { pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, aes, b64(enc.ct)); } catch (e) { throw Object.assign(new Error('Khóa quản trị không đúng'), { pause: true }); }
  const data = JSON.parse(new TextDecoder().decode(pt)), m = {};
  for (const r of data.rows || []) m[r.sku] = r.offers || [];
  OFFERS = m; OFFERS_AT = Date.now(); return m;
}

/* ---------- vòng chạy ---------- */
const inHours = s => { const h = new Date().getHours(); return s.hourFrom <= s.hourTo ? h >= s.hourFrom && h < s.hourTo : h >= s.hourFrom || h < s.hourTo; };
let cycling = false;
async function cycle(trigger) {
  if (cycling) return; cycling = true;
  try {
    const s = await settings(), S = await getState();
    if (S.job || !s.botKey) return;
    if (trigger === 'alarm' && (!s.auto || S.paused || !inHours(s) || Date.now() - S.lastPoll < s.pollMin * 60e3)) return;
    if (S.paused && trigger !== 'manual') return;
    await mutate(x => { x.lastPoll = Date.now(); if (trigger === 'manual') x.paused = ''; });
    const q = await api('bot.queue');
    let M; try { M = await offers(); } catch (e) { await log('⚠ ' + e.message, 'e'); if (e.pause) await pause(e.message); return; }
    const retry = (await getState()).retry || {};
    const view = q.items.map(it => {
      const pl = L.planAuto(it, M[it.sku], q.tolerance, q.sources), b = it.bot;
      let plan = pl.pick ? 'auto' : 'manual', why = pl.why;
      if (b && ['paying', 'paying_unknown', 'pay_failed'].includes(b.state)) { plan = 'hold'; why = 'Đã bấm Đặt hàng trước đó - chờ quản trị kiểm tra'; }
      else if (b && b.state === 'failed' && !retry[it.po_id]) { plan = 'failed'; why = b.note || 'Lỗi lần trước - bấm Thử lại'; }
      else if (b && b.state === 'working' && Date.now() - new Date(b.at).getTime() < 15 * 60e3) { plan = 'busy'; why = 'Phiên bot khác đang xử lý'; }
      else if (b && b.state === 'skip' && !pl.pick) { plan = 'manual'; why = b.note || why; }
      return { po_id: it.po_id, order_code: it.order_code, name: it.name, qty: it.qty, collected: it.collected_cost, ship_to: it.ship_to, plan, why, offer: pl.pick ? { s: pl.pick.s, p: pl.pick.p, l: pl.pick.l, sh: pl.pick.sh, u: pl.pick.u } : null, unit: pl.unit, tol: q.tolerance, bot: b };
    });
    await mutate(x => { x.queue = view; x.queueAt = Date.now(); });
    for (const v of view) if (v.plan === 'manual' && (!v.bot || v.bot.state !== 'skip')) { try { await api('bot.update', { po_id: v.po_id, state: 'skip', note: v.why }); } catch (e) { } }
    const next = view.find(v => v.plan === 'auto'); if (!next) return;
    const run = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try { await api('bot.update', { po_id: next.po_id, state: 'claim', run, source: next.offer.s, retry: !!retry[next.po_id] }); }
    catch (e) { await log('⚠ Không nhận được ' + next.po_id + ': ' + e.message, 'e'); return; }
    await mutate(x => { delete x.retry[next.po_id]; });
    const tab = await openTab(next.offer.u);
    await mutate(x => { x.job = { po_id: next.po_id, order_code: next.order_code, name: next.name, qty: next.qty, collected: next.collected, tol: next.tol, unit: next.unit, ship_to: next.ship_to, offer: next.offer, run, tabId: tab.id, windowId: tab.windowId, step: 'product', startedAt: Date.now(), lastAt: Date.now(), manual: false, addrTries: 0 }; });
    await log('▶ Bắt đầu ' + next.po_id + ' - ' + next.name + ' × ' + next.qty + ' tại Tiki (' + next.offer.p.toLocaleString('vi-VN') + 'đ) giao ' + next.ship_to.name);
  } catch (e) {
    await log('⚠ ' + e.message, 'e'); if (e.code === 401) await pause('Khóa bot không đúng/đã đổi - nhập khóa mới');
  } finally { cycling = false; }
}
async function openTab(url) {
  const S = await getState();
  if (S.botTab) { try { const t = await chrome.tabs.get(S.botTab); if (t) return await chrome.tabs.update(t.id, { url, active: true }); } catch (e) { } }
  const t = await chrome.tabs.create({ url, active: true }); await mutate(x => { x.botTab = t.id; }); return t;
}
async function pause(reason) { await mutate(s => { s.paused = reason; }); notify('KK-MALL Auto Order tạm dừng', reason); }
function notify(title, msg, prio) { try { chrome.notifications.create('kk' + Date.now(), { type: 'basic', iconUrl: 'icons/128.png', title, message: String(msg).slice(0, 250), priority: prio || 1, requireInteraction: prio === 2 }); } catch (e) { } }
async function finish(result, note) {
  const S = await getState(), j = S.job; if (!j) return;
  await mutate(s => { s.job = null; });
  await log((result === 'done' ? '✅ ' : '⛔ ') + j.po_id + ': ' + note, result === 'done' ? 'ok' : 'e');
  setTimeout(() => cycle('next'), 4000);
}

/* ---------- tin nhắn từ trang Tiki / popup ---------- */
chrome.runtime.onMessage.addListener((m, sender, reply) => { handle(m, sender).then(reply, e => reply({ error: e.message })); return true; });
async function handle(m, sender) {
  const S = await getState(), j = S.job, fromBot = j && sender.tab && sender.tab.id === j.tabId;
  switch (m.t) {
    case 'hello': if (!fromBot) return { job: null }; { const s = await settings(); return { job: { po_id: j.po_id, name: j.name, qty: j.qty, collected: j.collected, tol: j.tol, ship_to: j.ship_to, step: j.step, card_last4: s.cardLast4 } }; }
    case 'progress':
      if (!fromBot) return {};
      if (m.addr_retry) { const n = (j.addrTries || 0) + 1; await mutate(s => { if (s.job) { s.job.addrTries = n; s.job.lastAt = Date.now(); } }); if (n > 2) return { stop: true }; }
      await mutate(s => { if (s.job) { if (m.step) s.job.step = m.step; s.job.lastAt = Date.now(); } });
      if (m.note) await log('· ' + j.po_id + ' - ' + m.note); return {};
    case 'manual':
      if (!fromBot) return {};
      await mutate(s => { if (s.job) { s.job.manual = true; s.job.lastAt = Date.now(); } });
      notify('Cần anh chọn địa chỉ', j.po_id + ': ' + m.note, 2); try { await chrome.windows.update(j.windowId, { focused: true }); } catch (e) { }
      await log('✋ ' + j.po_id + ' - ' + m.note, 'w'); return {};
    case 'ready': {
      if (!fromBot) return { go: false, err: 'Tab không phải của bot' };
      const s = await settings(), cap = Math.min(j.collected + j.tol, s.maxOrder);
      if (!(m.total > 0) || m.total > cap) { const err = 'Tổng tại Tiki ' + Number(m.total).toLocaleString('vi-VN') + 'đ vượt giới hạn ' + cap.toLocaleString('vi-VN') + 'đ'; return { go: false, err }; }
      try { await api('bot.update', { po_id: j.po_id, state: 'paying', run: j.run, total: m.total, ship: m.ship }); }
      catch (e) { return { go: false, err: e.message }; }
      await mutate(x => { if (x.job) { x.job.step = 'paying'; x.job.payingAt = Date.now(); x.job.total = m.total; x.job.ship = m.ship; x.job.lastAt = Date.now(); } });
      await log('💳 ' + j.po_id + ' - bấm Đặt hàng, tổng ' + m.total.toLocaleString('vi-VN') + 'đ (ship ' + m.ship.toLocaleString('vi-VN') + 'đ, thẻ …' + (m.card4 || '') + ') - CHỜ OTP', 'pay');
      notify('Nhập OTP thanh toán ' + m.total.toLocaleString('vi-VN') + 'đ', j.po_id + ' · ' + j.name + ' → ' + j.ship_to.name, 2);
      try { await chrome.windows.update(j.windowId, { focused: true }); await chrome.tabs.update(j.tabId, { active: true }); } catch (e) { }
      return { go: true };
    }
    case 'success': {
      if (!fromBot) return {};
      try { await api('bot.update', { po_id: j.po_id, state: 'done', run: j.run, supplier_order_id: m.order_id, total: j.total, ship: j.ship }); }
      catch (e) { await log('⚠ Đặt thành công nhưng báo máy chủ lỗi: ' + e.message + ' - email Tiki sẽ tự gắn mã đơn', 'e'); }
      notify('Đặt thành công', j.po_id + ' - mã đơn Tiki ' + m.order_id);
      await finish('done', 'mã đơn Tiki ' + m.order_id + ', ' + (j.total || 0).toLocaleString('vi-VN') + 'đ'); return {};
    }
    case 'fail': {
      if (!fromBot) return {};
      try { await api('bot.update', { po_id: j.po_id, state: 'fail', note: m.err + (m.order_id ? ' [đơn Tiki ' + m.order_id + ']' : '') }); } catch (e) { }
      if (m.kind === 'pause' || j.step === 'paying') await pause(m.err);
      await finish('fail', m.err); return {};
    }
    case 'stop': {
      if (j) { try { await api('bot.update', { po_id: j.po_id, state: 'fail', note: 'Người vận hành dừng bot' + (j.step === 'paying' ? ' sau khi đã bấm Đặt hàng' : '') }); } catch (e) { } await finish('fail', 'dừng bởi người vận hành'); }
      await pause('Người vận hành dừng bot - bấm "Chạy ngay" để tiếp tục'); return {};
    }
    // popup
    case 'status': { const s = await settings(); return { state: await getState(), settings: Object.assign({}, s, { botKey: s.botKey ? '••••' + s.botKey.slice(-4) : '' }), hasAdminKey: !!(await adminKey()) }; }
    case 'save': {
      const cur = await settings(), n = Object.assign({}, cur, m.settings || {});
      if (m.botKey) n.botKey = m.botKey.trim();
      await chrome.storage.local.set({ settings: n });
      if (m.adminKey) { OFFERS = null; if (n.remember) await chrome.storage.local.set({ adminKeyLocal: m.adminKey }); else { await chrome.storage.session.set({ adminKey: m.adminKey }); await chrome.storage.local.remove('adminKeyLocal'); } }
      if (!n.remember && !m.adminKey) { const k = await getL('adminKeyLocal'); if (k) { await chrome.storage.session.set({ adminKey: k }); await chrome.storage.local.remove('adminKeyLocal'); } }
      return { ok: true };
    }
    case 'run': cycle('manual'); return { ok: true };
    case 'resume': await mutate(s => { s.paused = ''; }); cycle('manual'); return { ok: true };
    case 'retry': await mutate(s => { s.retry[m.po_id] = true; s.paused = ''; }); cycle('manual'); return { ok: true };
    case 'test': { const q = await api('bot.queue'); let n = 0, err = ''; try { n = Object.keys(await offers()).length; } catch (e) { err = e.message; } return { ok: true, items: q.items.length, offers: n, err }; }
  }
  return {};
}

/* ---------- theo dõi tab & thời gian ---------- */
chrome.tabs.onRemoved.addListener(async id => {
  const S = await getState(); if (S.botTab === id) await mutate(s => { s.botTab = null; });
  if (S.job && S.job.tabId === id) {
    const paying = S.job.step === 'paying';
    try { await api('bot.update', { po_id: S.job.po_id, state: 'fail', note: paying ? 'Tab Tiki bị đóng sau khi bấm Đặt hàng - kiểm tra đơn trên Tiki' : 'Tab Tiki bị đóng' }); } catch (e) { }
    if (paying) await pause('Tab Tiki bị đóng khi đang chờ OTP - kiểm tra đơn ' + S.job.po_id + ' trên Tiki');
    await finish('fail', 'tab bị đóng');
  }
});
chrome.alarms.onAlarm.addListener(async a => {
  if (a.name !== 'kk_tick') return;
  const S = await getState(), j = S.job;
  if (j) {
    const idle = (Date.now() - (j.lastAt || j.startedAt)) / 60e3;
    if (j.step === 'paying' && (Date.now() - j.payingAt) / 60e3 > MAX_PAY_MIN) {
      try { await api('bot.update', { po_id: j.po_id, state: 'fail', note: 'Quá ' + MAX_PAY_MIN + ' phút chưa thấy kết quả thanh toán (OTP?) - email Tiki sẽ tự gắn nếu đơn thành công' }); } catch (e) { }
      await pause('Chưa thấy kết quả thanh toán ' + j.po_id + ' - kiểm tra Tiki'); await finish('fail', 'quá thời gian chờ OTP');
    } else if (j.step !== 'paying' && idle > (j.manual ? MAX_MANUAL_MIN : MAX_STEP_MIN)) {
      try { await api('bot.update', { po_id: j.po_id, state: 'fail', note: 'Quá thời gian ở bước ' + j.step }); } catch (e) { }
      await finish('fail', 'quá thời gian ở bước ' + j.step);
    }
    return;
  }
  cycle('alarm');
});
async function init() {
  chrome.alarms.create('kk_tick', { periodInMinutes: 1 });
  const S = await getState(); if (!S.device) await mutate(s => { s.device = 'chrome-' + Math.random().toString(36).slice(2, 8); });
  badge(await getState());
}
chrome.runtime.onInstalled.addListener(init); chrome.runtime.onStartup.addListener(init); init();
