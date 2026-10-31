'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vnd = n => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const send = m => new Promise(r => chrome.runtime.sendMessage(m, x => { void chrome.runtime.lastError; r(x || {}); }));
const PLAN = { auto: 'Bot đặt', manual: 'Đặt tay', failed: 'Lỗi', hold: 'Chờ kiểm tra', busy: 'Đang xử lý' };
let filled = false;
async function render() {
  const r = await send({ t: 'status' }); if (!r.state) return;
  const S = r.state, s = r.settings;
  if (!filled) {
    filled = true; $('#botKey').placeholder = s.botKey || 'kkbot_…'; $('#remember').checked = !!s.remember; $('#cardLast4').value = s.cardLast4 || '';
    $('#maxOrder').value = s.maxOrder; $('#hourFrom').value = s.hourFrom; $('#hourTo').value = s.hourTo; $('#pollMin').value = s.pollMin; $('#auto').checked = !!s.auto;
    $('#adminKey').placeholder = r.hasAdminKey ? 'đã nhập (để trống = giữ nguyên)' : 'nhập khi mở Chrome';
    if (!s.botKey || !r.hasAdminKey) $('#setBox').open = true;
  }
  let b = '';
  if (S.paused) b += `<div class="banner b-pause">⏸ ${esc(S.paused)}<div class="row" style="margin-top:6px"><button id="resume">▶ Tiếp tục</button></div></div>`;
  if (S.job) b += `<div class="banner ${S.job.step === 'paying' ? 'b-pay' : 'b-job'}">${S.job.step === 'paying' ? '💳 ĐANG CHỜ OTP' : '🤖 Đang đặt'}: ${esc(S.job.po_id)} - ${esc(S.job.name)} × ${S.job.qty}<br><span class="muted">Bước: ${esc(S.job.step)}${S.job.total ? ' · tổng ' + vnd(S.job.total) : ''} · giao ${esc(S.job.ship_to.name)}</span></div>`;
  if (!s.auto && !S.paused) b += `<div class="banner b-job" style="font-weight:500">Chế độ tự động đang tắt - bấm "Chạy ngay" hoặc bật trong Cài đặt.</div>`;
  $('#banners').innerHTML = b; const rs = $('#resume'); if (rs) rs.onclick = async () => { await send({ t: 'resume' }); render(); };
  $('#qAt').textContent = S.queueAt ? 'cập nhật ' + new Date(S.queueAt).toLocaleTimeString('vi-VN') : 'chưa quét';
  $('#queue').innerHTML = (S.queue || []).map(q => `<tr><td><b>${esc(q.po_id)}</b><br>${esc(q.name)} × ${q.qty}<br><span class="muted">→ ${esc(q.ship_to.name)} · đã thu ${vnd(q.collected)}</span></td>
    <td style="width:150px"><span class="pill ${q.plan}">${PLAN[q.plan] || q.plan}</span>${q.offer ? `<br><span class="muted">Tiki ${vnd(q.offer.p)} (+ship ≈${vnd(q.offer.sh)})</span>` : ''}${q.why ? `<br><span class="muted">${esc(q.why)}</span>` : ''}${q.plan === 'failed' ? `<br><button data-retry="${esc(q.po_id)}">↻ Thử lại</button>` : ''}</td></tr>`).join('') || '<tr><td class="muted">Không có lệnh mua chờ đặt.</td></tr>';
  document.querySelectorAll('[data-retry]').forEach(x => x.onclick = async () => { await send({ t: 'retry', po_id: x.dataset.retry }); render(); });
  $('#log').innerHTML = (S.log || []).map(l => `<div class="${l.lvl}">${new Date(l.at).toLocaleString('vi-VN')} · ${esc(l.msg)}</div>`).join('') || '<div class="muted">Chưa có hoạt động.</div>';
}
$('#save').onclick = async () => {
  const st = { remember: $('#remember').checked, cardLast4: $('#cardLast4').value.replace(/\D/g, ''), maxOrder: Number($('#maxOrder').value) || 5000000, hourFrom: Number($('#hourFrom').value), hourTo: Number($('#hourTo').value), pollMin: Math.max(1, Number($('#pollMin').value) || 3), auto: $('#auto').checked };
  await send({ t: 'save', settings: st, botKey: $('#botKey').value.trim(), adminKey: $('#adminKey').value });
  $('#botKey').value = ''; $('#adminKey').value = ''; filled = false; $('#msg').textContent = '✓ Đã lưu'; render();
};
$('#test').onclick = async () => { $('#msg').textContent = 'Đang kiểm tra…'; const r = await send({ t: 'test' }); $('#msg').textContent = r.error ? '⚠ ' + r.error : '✓ Máy chủ OK: ' + r.items + ' lệnh mua chờ · ' + (r.err ? '⚠ ' + r.err : r.offers + ' SKU có link nguồn'); };
$('#run').onclick = async () => { await send({ t: 'run' }); setTimeout(render, 1500); };
render(); setInterval(render, 2000);
