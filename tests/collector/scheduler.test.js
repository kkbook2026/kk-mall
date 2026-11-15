'use strict';
/*
 * KIEM THU DIEU PHOI LICH (collector/scheduler.js) - quyet dinh thuan + goi API GitHub gia lap. Khong goi ra Internet.
 * Chay: node tests/collector/scheduler.test.js
 */
const http = require('http');
const S = require('../../collector/scheduler');
let pass = 0, fail = 0; const t = (ok, name) => { if (ok) pass++; else { fail++; console.log('  ✘ ' + name); } };
const T0 = Date.parse('2026-11-15T12:00:00Z'), ago = m => new Date(T0 - m * 60e3).toISOString();
const done = (startAgo, durMin, conclusion = 'success', id = Math.random()) => ({ id, status: 'completed', conclusion, run_started_at: ago(startAgo), updated_at: ago(startAgo - durMin) });
const J = Object.fromEntries(S.plan({}).map(j => [j.wf, j]));

(async () => {
  /* ---------- 1) Chu ky co dinh ---------- */
  t(S.decide(J['collect.yml'], [done(200, 5)], T0).act === 'run', 'thu thap gia: lan gan nhat 200 phut -> goi chay');
  t(S.decide(J['collect.yml'], [done(100, 5)], T0).act === 'skip', 'thu thap gia: moi 100 phut -> bo qua');
  t(S.decide(J['collect.yml'], [{ id: 1, status: 'queued', run_started_at: ago(1) }, done(400, 5)], T0).act === 'skip', 'dang co luot cho -> khong goi chong');
  t(S.decide(J['collect.yml'], [done(400, 5)], T0, { wf: 'collect.yml', runId: 9, start: T0 - 4 * 60e3 }).act === 'skip', 'goi tu buoc cuoi cua chinh no -> khong goi lai (vua chay)');
  t(S.decide(J['monitor.yml'], [done(31, 1)], T0).act === 'run' && S.decide(J['monitor.yml'], [done(20, 1)], T0).act === 'skip', 'giam sat: 30 phut/lan');
  t(S.decide(J['monitor.yml'], [], T0).act === 'run', 'chua tung chay -> goi chay');
  t(S.decide(J['retail-crawl.yml'], [done(150, 148)], T0).act === 'skip' && S.decide(J['retail-crawl.yml'], [done(240, 148)], T0).act === 'run', 'gia ban le: 4 gio/lan (khong chay lien tuc - ton trong website nguon)');

  /* ---------- 2) Vong chay lien tuc ---------- */
  const self = (wf, durMin, ok = true) => ({ wf, runId: 77, start: T0 - durMin * 60e3, ok });
  const cur = { id: 77, status: 'in_progress', run_started_at: ago(150) };
  t(S.decide(J['hunt-crawl.yml'], [cur, done(300, 150)], T0, self('hunt-crawl.yml', 150)).act === 'run', 'san gia: luot vua chay du 150 phut -> noi tiep ngay (bo qua chinh luot dang ket thuc)');
  t(S.decide(J['hunt-crawl.yml'], [cur], T0, self('hunt-crawl.yml', 6)).act === 'skip', 'san gia: luot vua xong qua ngan (het viec) -> nghi 60 phut, khong vong lap rong');
  t(S.decide(J['hunt-crawl.yml'], [done(70, 6)], T0).act === 'run' && S.decide(J['hunt-crawl.yml'], [done(30, 6)], T0).act === 'skip', 'goi tu noi khac: luot ngan truoc do -> chi chay lai sau 60 phut nghi');
  t(S.decide(J['hunt-crawl.yml'], [done(160, 150)], T0).act === 'run', 'chuoi dut (khong co luot nao dang chay) -> khoi dong lai');
  t(S.decide(J['hunt-crawl.yml'], [{ id: 5, status: 'queued' }, cur], T0, self('hunt-crawl.yml', 150)).act === 'skip', 'da co luot cho -> khong goi them');
  t(S.decide(J['search-crawl.yml'], [done(20, 5, 'failure'), done(40, 5, 'failure'), done(60, 5, 'failure')], T0).act === 'skip', '3 luot loi lien tiep -> cho 60 phut');
  t(S.decide(J['search-crawl.yml'], [done(80, 5, 'failure'), done(100, 5, 'failure'), done(120, 5, 'failure')], T0).act === 'run', '3 luot loi lien tiep, da qua 60 phut -> thu lai');
  t(S.decide(S.plan({ SEARCH_CHAIN: '0' }).find(j => j.wf === 'search-crawl.yml'), [done(500, 100)], T0).act === 'skip', 'SEARCH_CHAIN=0 -> tat');
  t(S.decide(S.plan({}).find(j => j.wf === 'hunt-vn.yml'), [], T0).act === 'skip' && S.decide(S.plan({ HUNT_VN_RUNNER: '1' }).find(j => j.wf === 'hunt-vn.yml'), [], T0).act === 'run', 'tram Viet Nam chi chay khi da bat HUNT_VN_RUNNER');

  /* ---------- 3) Goi API GitHub (gia lap) ---------- */
  { const runs = { 'collect.yml': [done(200, 5)], 'monitor.yml': [done(10, 1)], 'hunt-crawl.yml': [done(160, 150)], 'search-crawl.yml': [{ id: 3, status: 'in_progress', run_started_at: ago(30) }], 'retail-crawl.yml': [done(100, 100)] }, posts = [];
    const srv = http.createServer((q, r) => { let b = ''; q.on('data', c => b += c); q.on('end', () => {
      if (q.headers.authorization !== 'Bearer tok') { r.statusCode = 401; return r.end('{}'); }
      const m = q.url.match(/\/actions\/workflows\/([\w.-]+)\/(runs|dispatches)/); if (!m) { r.statusCode = 404; return r.end('{}'); }
      if (m[2] === 'runs') { if (!runs[m[1]]) { r.statusCode = 404; return r.end('{}'); } r.setHeader('content-type', 'application/json'); return r.end(JSON.stringify({ workflow_runs: runs[m[1]] })); }
      posts.push([m[1], JSON.parse(b)]); r.statusCode = 204; r.end(); }); });
    await new Promise(res => srv.listen(0, '127.0.0.1', res));
    const env = { GH_TOKEN: 'tok', GITHUB_REPOSITORY: 'o/r', KICK_API: 'http://127.0.0.1:' + srv.address().port }, logs = [];
    const out = await S.run(env, m => logs.push(m), { now: T0 });
    const by = Object.fromEntries(out.map(o => [o.wf, o.act]));
    t(by['collect.yml'] === 'run' && by['monitor.yml'] === 'skip' && by['hunt-crawl.yml'] === 'run' && by['search-crawl.yml'] === 'skip' && by['retail-crawl.yml'] === 'skip' && by['hunt-vn.yml'] === 'skip', 'mot luot dieu phoi: goi dung quy trinh den han');
    t(posts.length === 2 && posts.find(p => p[0] === 'collect.yml')[1].inputs.trigger === 'bu-lich' && posts.every(p => p[1].ref === 'main'), 'goi chay qua workflow_dispatch nhanh main (thu thap gia kem trigger=bu-lich)');
    t(logs.length === 6 && !logs.some(l => /tok/.test(l)), 'nhat ky moi quy trinh 1 dong, khong lo token');
    t((await S.run({ ...env, GH_TOKEN: 'sai' }, () => { }, { now: T0 })).every(o => o.act === 'err' || o.why === 'đang tắt'), 'token sai -> bao loi, khong nem ngoai le');
    t((await S.run({ GITHUB_REPOSITORY: 'o/r' }, () => { })).length === 0, 'khong co token -> bo qua');
    srv.close(); }

  console.log(`\nDieu phoi lich: ${pass}/${pass + fail} dat`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
