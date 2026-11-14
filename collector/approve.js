'use strict';
/*
 * DUYET GIA - ghi 1 quyet dinh cua quan tri (tu tieu de issue GitHub) vao so duyet collector/approvals.json.
 * Chay trong workflow approve.yml; CHI nhan issue do chinh chu kho ma tao (kiem tra o workflow va kiem tra lai o day).
 * Tieu de hop le: "KK-DUYET <ok|no|clear> <SKU> <ma offer 20 hex> <cam ket 16 hex>". So duyet cong khai chi chua ma san pham + ma bam mot chieu:
 * khong co ten nguon, gia nguon hay duong dan nguon. Bo thu thap gia (collect.js) doc so nay o lan chay ke tiep.
 * (c) Nguyen Duy Dien. All rights reserved.
 */
const fs = require('fs');
const path = require('path');
const CURATE = require('./curate');

function run(env = process.env, file = path.join(__dirname, 'approvals.json'), now = new Date().toISOString()) {
  const user = String(env.ISSUE_USER || ''), owner = String(env.REPO_OWNER || ''), assoc = String(env.ISSUE_ASSOC || '');
  if (!user || !owner || user.toLowerCase() !== owner.toLowerCase() || (assoc && assoc !== 'OWNER')) return { ok: false, changed: false, msg: 'Chỉ chủ kho mã mới được gửi quyết định duyệt giá - yêu cầu này không được xử lý.' };
  const dec = CURATE.parseTitle(env.ISSUE_TITLE);
  if (!dec) return { ok: false, changed: false, msg: 'Tiêu đề không đúng định dạng "KK-DUYET <ok|no|clear> <SKU> <mã offer> <cam kết>" - không ghi nhận. Hãy bấm lại nút trong Cổng quản trị (tab Duyệt giá) và không sửa tiêu đề.' };
  const book = CURATE.loadApprovals(file), before = JSON.stringify(book);
  CURATE.applyDecision(book, dec, { at: now, by: user, n: parseInt(env.ISSUE_NUMBER || '0', 10) || 0 });
  // gioi han kich thuoc so: bo quyet dinh qua 400 ngay
  const lim = Date.parse(now) - 400 * 86400e3;
  for (const sku of Object.keys(book.items)) { for (const id of Object.keys(book.items[sku])) if (Date.parse(book.items[sku][id].at) < lim) delete book.items[sku][id]; if (!Object.keys(book.items[sku]).length) delete book.items[sku]; }
  const after = JSON.stringify(book), changed = after !== before;
  if (changed) fs.writeFileSync(file, JSON.stringify(book, null, 1) + '\n');
  const what = dec.d === 'ok' ? 'DUYỆT' : dec.d === 'no' ? 'TỪ CHỐI' : 'BỎ QUYẾT ĐỊNH';
  return { ok: true, changed, dec, msg: `Đã ghi nhận: ${what} offer \`${dec.id}\` của sản phẩm ${dec.sku}. Có hiệu lực ở lần thu thập giá kế tiếp` + (dec.d === 'ok' ? ' (nếu giá nguồn khi đó không thấp hơn 10% so với mức đã duyệt).' : '.') };
}
module.exports = { run };
if (require.main === module) {
  const r = run();
  console.log(r.msg);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `ok=${r.ok ? 1 : 0}\nchanged=${r.changed ? 1 : 0}\n`);
  if (process.env.KK_APPROVE_MSG) fs.writeFileSync(process.env.KK_APPROVE_MSG, r.msg + '\n');
}
