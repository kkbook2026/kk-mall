'use strict';
/*
 * BU LICH TRONG LUC CHAY - giu nhip "3 gio/lan" cua bo thu thap gia.
 * Lich hen gio (cron) cua GitHub Actions thuong tre/bo luot: thuc te 5-7 gio moi chay 1 lan. Cac tien trinh thu thap nen (tim gia theo tu khoa,
 * gia ban le) chay keo dai 2-2,5 gio -> trong luc chay, moi KICK_EVERY_MIN phut hoi GitHub: lan thu thap gia gan nhat da bat dau qua
 * KICK_AFTER_MIN phut va khong co lan nao dang chay/cho -> goi collect.yml (workflow_dispatch, trigger=bu-lich).
 * Chi dung token cua chinh workflow (GH_TOKEN, quyen actions: write); khong co token thi bo qua. Khong ghi token hay du lieu nguon ra nhat ky.
 * (c) Nguyen Duy Dien. All rights reserved.
 */
function make(env = process.env, log = console.log) {
  const token = env.GH_TOKEN || env.GITHUB_TOKEN || '', repo = env.GITHUB_REPOSITORY || '';
  const every = Math.max(0.01, parseFloat(env.KICK_EVERY_MIN || '10')) * 60e3, after = Math.max(1, parseFloat(env.KICK_AFTER_MIN || '180')) * 60e3;
  const wf = env.KICK_WORKFLOW || 'collect.yml', base = (env.KICK_API || 'https://api.github.com').replace(/\/$/, '');
  let lastCheck = 0, lastKick = 0, busy = false;
  const call = async (p, opt = {}) => { const ac = new AbortController(), t = setTimeout(() => ac.abort(), 15000);
    try { return await fetch(base + '/repos/' + repo + p, { ...opt, signal: ac.signal, headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'kk-mall-collector', ...(opt.headers || {}) } }); } finally { clearTimeout(t); } };
  /* Goi thuong xuyen trong vong lap thu thap; tu gian nhip. Tra ve: null (chua den luot) | 'fresh' | 'running' | 'kicked' | 'recent' | 'http<ma>' | 'err' */
  async function tick(now = Date.now()) {
    if (!token || !repo || busy || now - lastCheck < every) return null;
    lastCheck = now; busy = true;
    try {
      if (lastKick && now - lastKick < 60 * 60e3) return 'recent';                 // vua goi: cho lan chay do xuat hien, khong goi chong
      const r = await call('/actions/workflows/' + wf + '/runs?per_page=5'); if (!r.ok) return 'http' + r.status;
      const runs = (await r.json()).workflow_runs || [];
      if (!runs.length) return 'fresh';
      if (runs.some(x => x.status !== 'completed')) return 'running';             // dang chay / dang cho: khong goi them
      const age = now - Date.parse(runs[0].run_started_at || runs[0].created_at);
      if (!(age >= after)) return 'fresh';
      const d = await call('/actions/workflows/' + wf + '/dispatches', { method: 'POST', body: JSON.stringify({ ref: env.KICK_REF || 'main', inputs: { trigger: 'bu-lich' } }), headers: { 'content-type': 'application/json' } });
      if (d.status === 204) { lastKick = now; log(`Bu lich: lan thu thap gia gan nhat cach day ${Math.round(age / 60e3)} phut -> da goi chay bu.`); return 'kicked'; }
      return 'http' + d.status;
    } catch (e) { return 'err'; } finally { busy = false; }
  }
  return { tick };
}
module.exports = { make };
