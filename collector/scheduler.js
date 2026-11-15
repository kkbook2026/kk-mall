'use strict';
/*
 * DIEU PHOI LICH (scheduler) - giu nhip moi quy trinh tu dong KHONG phu thuoc lich cron cua GitHub.
 *
 * Do thuc te 14-15/11/2026 (24 gio): cron cua GitHub bo / tre phan lon luot - Giam sat (30 phut/lan) chi chay 5/48 luot theo lich,
 * Thu thap gia (3 gio/lan) 3/8 luot, San gia theo ma (moi gio) 2/24 luot. Vi vay nhip chay duoc giu bang 3 lop:
 *   1) Cuoi moi quy trinh tu dong: buoc "Dieu phoi lich" goi `node collector/scheduler.js` (vong chay tiep noi chinh no + goi cac quy trinh den han).
 *   2) Trong luc cac tien trinh dai dang chay: collector/kick.js hoi moi 10 phut (Thu thap gia 3 gio, Giam sat 30 phut).
 *   3) Quy trinh rieng scheduler.yml: cron moi 10 phut + khi bat ky quy trinh nao ket thuc (workflow_run) - lop du phong khi chuoi dut.
 * Chi dung token cua chinh quy trinh (GH_TOKEN, quyen actions: write). Nhat ky chi co ten quy trinh, so phut, ket qua - khong token, khong du lieu nguon.
 *
 * Dung: node collector/scheduler.js [--self <tep.yml>]      (--self: dang chay o buoc cuoi cua quy trinh <tep.yml>, run hien tai = GITHUB_RUN_ID)
 * (c) 2026 Nguyen Duy Dien. All rights reserved.
 */
const MIN = 60e3;
/* every: chu ky (phut) tinh tu lan bat dau gan nhat | loop: chay noi tiep lien tuc; rest: nghi toi thieu giua 2 luot (phut);
 * short: luot ngan hon so phut nay = het viec / dung som -> nghi `idle` phut truoc khi goi lai (tranh vong lap rong ton tai nguyen va lam phien website nguon). */
function plan(env = process.env) {
  return [
    { wf: 'collect.yml', name: 'Thu thập giá & xuất bản', every: 180, inputs: { trigger: 'bu-lich' } },
    { wf: 'monitor.yml', name: 'Giám sát', every: 30 },
    { wf: 'hunt-crawl.yml', name: 'Săn giá theo mã model', loop: 1, rest: 5, short: 15, idle: 60 },
    { wf: 'search-crawl.yml', name: 'Tìm giá trên sàn (API chính thức)', loop: 1, rest: 2, short: 30, idle: 60, off: env.SEARCH_CHAIN === '0' },
    { wf: 'retail-crawl.yml', name: 'Giá bán lẻ (website công khai)', every: 240 },     // ton trong website nguon: 1 luot ~150 phut moi 4 gio, khong chay lien tuc
    { wf: 'hunt-vn.yml', name: 'Săn giá - trạm Việt Nam', loop: 1, rest: 5, short: 15, idle: 60, off: !env.HUNT_VN_RUNNER },
  ];
}
const BUSY = new Set(['queued', 'in_progress', 'waiting', 'pending', 'requested']);
const t = r => Date.parse(r.run_started_at || r.created_at || 0) || 0, end = r => Date.parse(r.updated_at || 0) || t(r);

/* Quyet dinh cho 1 quy trinh tu danh sach luot chay gan nhat (moi nhat truoc). Ham thuan - de kiem thu. */
function decide(job, runs, now, self = null) {
  if (job.off) return { act: 'skip', why: 'đang tắt' };
  const others = runs.filter(r => String(r.id) !== String(self && self.runId));
  const busy = others.filter(r => BUSY.has(r.status));
  const isSelf = self && self.wf === job.wf;
  if (busy.length) return { act: 'skip', why: busy.some(r => r.status === 'in_progress') ? 'đang chạy' : 'đã có lượt chờ' };
  const done = others.filter(r => r.status === 'completed');
  if (job.loop) {
    let lastEnd, lastDur, lastOk;
    if (isSelf) { lastEnd = now; lastDur = (now - (self.start || now)) / MIN; lastOk = self.ok !== false; }
    else if (done.length) { lastEnd = end(done[0]); lastDur = (end(done[0]) - t(done[0])) / MIN; lastOk = done[0].conclusion === 'success'; }
    else return { act: 'run', why: 'chưa có lượt nào' };
    const fails = done.slice(0, 3).filter(r => r.conclusion && r.conclusion !== 'success' && r.conclusion !== 'cancelled' && r.conclusion !== 'skipped').length + (isSelf && !lastOk ? 1 : 0);
    if (fails >= 3) { const gap = (now - lastEnd) / MIN; return gap >= 60 ? { act: 'run', why: `lỗi liên tiếp - thử lại sau ${Math.round(gap)} phút` } : { act: 'skip', why: 'lỗi liên tiếp - chờ 60 phút' }; }
    const need = lastDur < (job.short || 0) ? (job.idle || 60) : (job.rest || 0), gap = (now - lastEnd) / MIN;
    if (isSelf && need <= (job.rest || 0)) return { act: 'run', why: 'nối tiếp lượt vừa xong' };
    return gap >= need ? { act: 'run', why: `nghỉ ${Math.round(gap)}/${need} phút` } : { act: 'skip', why: `đang nghỉ (${Math.round(gap)}/${need} phút${lastDur < (job.short || 0) ? ', lượt trước hết việc sớm' : ''})` };
  }
  const startTimes = others.map(t).concat(isSelf ? [self.start || now] : []);
  const last = startTimes.length ? Math.max(...startTimes) : 0;
  if (!last) return { act: 'run', why: 'chưa có lượt nào' };
  const age = (now - last) / MIN;
  return age >= job.every - 3 ? { act: 'run', why: `lượt gần nhất cách ${Math.round(age)} phút (chu kỳ ${job.every})` } : { act: 'skip', why: `mới chạy ${Math.round(age)} phút trước` };
}

async function run(env = process.env, log = console.log, opts = {}) {
  const token = env.GH_TOKEN || env.GITHUB_TOKEN || '', repo = env.GITHUB_REPOSITORY || '', base = (env.KICK_API || 'https://api.github.com').replace(/\/$/, '');
  if (!token || !repo) { log('Điều phối lịch: thiếu token / tên kho - bỏ qua.'); return []; }
  const call = async (p, o = {}) => { const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 15000);
    try { return await fetch(base + '/repos/' + repo + p, { ...o, signal: ac.signal, headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'kk-mall-scheduler', ...(o.headers || {}) } }); }
    finally { clearTimeout(tm); } };
  const now = opts.now || Date.now(), self = opts.self || null, only = opts.only ? new Set(opts.only) : null, out = [];
  for (const job of plan(env)) {
    if (only && !only.has(job.wf)) continue;
    let d;
    try {
      if (job.off) d = { act: 'skip', why: 'đang tắt' };
      else { const r = await call('/actions/workflows/' + job.wf + '/runs?per_page=10');
      if (r.status === 404) d = { act: 'skip', why: 'chưa có quy trình' };
      else if (!r.ok) d = { act: 'err', why: 'HTTP ' + r.status };
      else d = decide(job, (await r.json()).workflow_runs || [], now, self); }
      if (d.act === 'run') {
        const body = { ref: env.KICK_REF || 'main' }; if (job.inputs) body.inputs = job.inputs;
        const p = await call('/actions/workflows/' + job.wf + '/dispatches', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
        d = p.status === 204 ? { act: 'run', why: d.why } : { act: 'err', why: 'gọi chạy lỗi HTTP ' + p.status };
      }
    } catch (e) { d = { act: 'err', why: 'không kết nối được GitHub' }; }
    out.push({ wf: job.wf, ...d }); log(`Điều phối lịch · ${job.name}: ${d.act === 'run' ? 'ĐÃ GỌI CHẠY' : d.act === 'err' ? 'LỖI' : 'bỏ qua'} - ${d.why}`);
  }
  return out;
}

if (require.main === module) {
  const i = process.argv.indexOf('--self'), wf = i > 0 ? process.argv[i + 1] : '';
  const start = +(process.env.KK_RUN_START || 0) * 1000 || 0, ok = process.env.KK_JOB_STATUS ? process.env.KK_JOB_STATUS === 'success' : true;
  run(process.env, console.log, { self: wf ? { wf, runId: process.env.GITHUB_RUN_ID, start: start || Date.now(), ok } : null }).catch(() => { }).then(() => process.exit(0));
}
module.exports = { plan, decide, run };
