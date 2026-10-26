'use strict';
/*
 * KK-MALL SEO BUILDER - chay luc deploy (GitHub Actions), KHONG commit vao repo.
 * Sinh HTML tinh (pre-render, tuong duong SSR cho bot):
 *   /p/<slug>.html        trang chi tiet tung san pham (JSON-LD Product + Offer + BreadcrumbList)
 *   /c/<nganh>.html       trang nganh hang (ItemList)
 *   /n/<nganh>--<nhom>[-k].html  trang nhom hang, phan trang 60 SP/trang
 *   /sitemap.xml (index) + /sitemap-pages.xml + /sitemap-p-<nganh>.xml
 * Bot (Googlebot, Bingbot, Coc Coc, AI search) doc duoc noi dung day du ma khong can chay JavaScript.
 * (c) Nguyen Duy Dien (KK-2026). All rights reserved.
 */
const fs = require('fs');
const path = require('path');
const T = require('./trust');

const SITE = path.join(__dirname, '..', 'site');
const API = path.join(SITE, 'api');
const ORIGIN = 'https://www.kk-mall.com';
const PER = 60;
const t0 = Date.now();
const rj = f => JSON.parse(fs.readFileSync(path.join(API, f), 'utf8'));
const meta = rj('meta.json');
const full = rj('catalog-full.json');
const esc = s => T.cleanText(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vnd = n => Number(n || 0).toLocaleString('vi-VN') + ' đ';
const slugify = s => T.fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'nhom';
const pslug = p => /^[a-z0-9-]+$/.test(p.slug || '') ? p.slug : slugify(p.name) + '-' + p.sku.toLowerCase();
const day = iso => (iso || new Date().toISOString()).slice(0, 10);
const cats = meta.categories || [];
const catById = Object.fromEntries(cats.map(c => [c.id, c]));
const gslug = (cid, g) => cid + '--' + slugify(g);

for (const d of ['p', 'c', 'n']) { fs.rmSync(path.join(SITE, d), { recursive: true, force: true }); fs.mkdirSync(path.join(SITE, d), { recursive: true }); }

const CSS = `*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#F8FAFC;color:#0F172A;line-height:1.55}a{color:#1E3A8A}
header{background:#fff;border-bottom:1px solid #E2E8F0;position:sticky;top:0;z-index:5}header .w{display:flex;gap:14px;align-items:center;padding:10px 16px;max-width:1200px;margin:0 auto}
header img{height:42px;display:block}header form{flex:1;display:flex}header input{flex:1;min-width:0;padding:10px 16px;border:2px solid #E2E8F0;border-radius:999px;font-size:15px}
.cta{display:inline-block;background:#EA580C;color:#fff!important;text-decoration:none;font-weight:800;padding:11px 20px;border-radius:12px;white-space:nowrap}.cta.s{padding:9px 14px;font-size:14px}
main{max-width:1200px;margin:0 auto;padding:16px}.bc{font-size:13px;color:#64748B;margin-bottom:12px}.bc a{color:#475569;text-decoration:none}
.pd{display:grid;grid-template-columns:minmax(0,420px) 1fr;gap:28px;background:#fff;border-radius:18px;padding:22px;box-shadow:0 8px 30px rgba(30,58,138,.08)}
.pd .im{background:#F1F5F9;border-radius:14px;aspect-ratio:1;display:grid;place-items:center;overflow:hidden}.pd .im img{max-width:100%;max-height:100%;object-fit:contain}
h1{font-size:24px;line-height:1.3;margin:0 0 8px;color:#1E3A8A}h2{font-size:17px;margin:22px 0 8px;color:#1E3A8A}
.price{font-size:32px;font-weight:900;color:#DC2626;margin:6px 0}.ok{color:#047857;font-weight:700;font-size:14px}.proof{background:#ECFDF5;border:1px solid #A7F3D0;color:#065F46;border-radius:10px;padding:8px 12px;font-size:14px;margin:8px 0;font-weight:600}
.badge{display:inline-block;font-size:12px;font-weight:800;padding:3px 10px;border-radius:999px;margin:0 6px 6px 0;background:#EFF6FF;color:#1E3A8A}.badge.u{background:#FEF3C7;color:#92400E}.badge.h{background:#FEF2F2;color:#991B1B}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:7px 10px;border-bottom:1px solid #F1F5F9;text-align:left}th{background:#F8FAFC;font-size:12px;color:#475569}code{font-size:12px;color:#1E3A8A}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;padding:0;list-style:none}.grid li{background:#fff;border-radius:14px;padding:12px;box-shadow:0 4px 16px rgba(30,58,138,.06)}
.grid a{text-decoration:none;color:#0F172A;font-size:13.5px;font-weight:600;display:block;line-height:1.35}.grid b{display:block;color:#DC2626;margin-top:6px}.grid small{color:#047857;font-size:11.5px}
.chips{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none}.chips a{display:block;background:#fff;border:1px solid #E2E8F0;border-radius:999px;padding:7px 14px;text-decoration:none;font-size:14px;font-weight:600}
.pg{display:flex;gap:6px;flex-wrap:wrap;margin:18px 0}.pg a,.pg span{padding:7px 12px;border-radius:9px;background:#fff;border:1px solid #E2E8F0;text-decoration:none}.pg span{background:#1E3A8A;color:#fff}
footer{background:#0F172A;color:#CBD5E1;font-size:13px;padding:24px 16px;margin-top:30px}footer .w{max-width:1200px;margin:0 auto}footer a{color:#E2E8F0}
@media(max-width:760px){.pd{grid-template-columns:1fr;padding:14px}header .cta{display:none}h1{font-size:20px}.price{font-size:26px}}`;
fs.writeFileSync(path.join(SITE, 'seo.css'), CSS);

const head = ({ title, desc, url, img, ld, type = 'website' }) => `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; media-src 'self' blob: data:; connect-src 'self' https://script.google.com https://script.googleusercontent.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-src 'none'; upgrade-insecure-requests"><meta name="referrer" content="strict-origin-when-cross-origin"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc).slice(0, 300)}"><link rel="canonical" href="${url}">
<meta name="referrer" content="no-referrer"><meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="${type}"><meta property="og:site_name" content="KK-MALL"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc).slice(0, 300)}"><meta property="og:url" content="${url}">${img ? `<meta property="og:image" content="${esc(img)}">` : ''}
<meta property="og:locale" content="vi_VN"><link rel="icon" href="/logo.svg"><link rel="stylesheet" href="/seo.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script></head><body>
<header><div class="w"><a href="/" aria-label="KK-MALL trang chủ"><img src="/logo.svg" alt="KK-MALL - Đại siêu thị trực tuyến"></a><form action="/" method="get" role="search"><input name="q" placeholder="Tìm trong ${(meta.totalProducts || full.length).toLocaleString('vi-VN')}+ mặt hàng..." aria-label="Tìm kiếm"></form><a class="cta s" href="/">🛒 Vào KK-MALL</a></div></header><main>`;
const foot = `</main><footer><div class="w"><p><b>KK-MALL - Đại siêu thị trực tuyến</b> · Giá hiển thị là giá cuối cùng: đã gồm thuế GTGT và giao hàng tận cửa, không phụ phí. Lịch sử giá được niêm phong SHA-256 + Merkle, tự kiểm chứng tại <a href="/?ledger=1">Sổ cái giá</a>.</p>
<p>${cats.map(c => `<a href="/c/${c.id}.html">${esc(c.name)}</a>`).join(' · ')}</p><p><a href="/phap-ly#dieu-khoan">Điều khoản</a> · <a href="/phap-ly#bao-mat">Bảo vệ dữ liệu cá nhân</a> · <a href="/phap-ly#doi-tra">Đổi trả & bảo hành</a> · © 2026 KK-MALL - Bản quyền thuộc Nguyễn Duy Điển (KK-2026)</p></div></footer></body></html>`;
const footP = `</main><footer><div class="w">KK-MALL · Giá cuối cùng đã gồm giao hàng, không phụ phí · <a href="/?ledger=1">Sổ cái giá</a> · <a href="/phap-ly">Chính sách</a> · © 2026 KK-MALL - Nguyễn Duy Điển (KK-2026)</div></footer></body></html>`;
const ORG = { '@type': 'Organization', name: 'KK-MALL', url: ORIGIN };
const crumbs = list => ({ '@type': 'BreadcrumbList', itemListElement: list.map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x[0], item: ORIGIN + x[1] })) });
const li = r => `<li><a href="/p/${pslug(r)}.html">${esc(r.name)}</a><b>${(r.fl || 0) & 1 ? 'Đang xác minh giá' : vnd(r.kk_price)}</b><small>${r.in_stock && !((r.fl || 0) & 33) ? '✓ Còn hàng · gồm giao hàng' : 'Tạm ngừng bán'}</small></li>`;

/* ---------- trang san pham ---------- */
const byGrp = {}; for (const r of full) (byGrp[r.category_id + '|' + r.grp] = byGrp[r.category_id + '|' + r.grp] || []).push(r);
for (const k in byGrp) byGrp[k].sort((a, b) => (b.in_stock - a.in_stock) || (b.sold - a.sold));
const smap = {}; let nP = 0;
for (const r of full) {
  const f = path.join(API, 'products', r.sku + '.json'); if (!fs.existsSync(f)) continue;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const fl = (d.trust && d.trust.fl) || 0, disc = (d.trust && d.trust.disc) || 0;
  const used = !!(fl & 2), hold = !!(fl & 1) || !!(fl & 32), buy = d.in_stock && !hold;
  const slug = pslug(r), url = `${ORIGIN}/p/${slug}.html`, cat = catById[d.category_id] || { name: d.category_name, id: d.category_id };
  const specs = Object.entries(d.specs || {}).filter(([k, v]) => k && v);
  const desc = `${T.cleanText(d.name)} - ${used ? 'hàng đã qua sử dụng' : 'chính hãng'}, thương hiệu ${d.brand}${hold ? ', giá đang được xác minh lại với nguồn' : `, giá ${vnd(d.kk_price)} tại KK-MALL, đã gồm giao hàng tận cửa, không phụ phí`}. ${specs.slice(0, 3).map(([k, v]) => k + ': ' + v).join(', ')}.`;
  const hist = (d.d90 || []).slice(-10).reverse();
  const rel = (byGrp[d.category_id + '|' + d.grp] || []).filter(x => x.sku !== d.sku).slice(0, 8);
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Product', name: T.cleanText(d.name), sku: d.sku, mpn: d.sku, brand: { '@type': 'Brand', name: d.brand || 'KK-MALL' }, image: /^https:/.test(d.image || '') ? [d.image] : undefined, description: desc, category: `${cat.name} > ${d.grp}`, url,
      offers: hold ? undefined : { '@type': 'Offer', url, priceCurrency: 'VND', price: d.kk_price, priceValidUntil: new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 10),
        availability: buy ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', itemCondition: used ? 'https://schema.org/UsedCondition' : 'https://schema.org/NewCondition', seller: ORG,
        shippingDetails: { '@type': 'OfferShippingDetails', shippingRate: { '@type': 'MonetaryAmount', value: 0, currency: 'VND' }, shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'VN' } },
        hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy', applicableCountry: 'VN', returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: 7, returnFees: 'https://schema.org/FreeReturn' } } },
    crumbs([['Trang chủ', '/'], [cat.name, `/c/${cat.id}.html`], [d.grp, `/n/${gslug(d.category_id, d.grp)}.html`], [T.cleanText(d.name), `/p/${slug}.html`]])] };
  const html = head({ title: hold ? `${T.cleanText(d.name)} | KK-MALL` : `${T.cleanText(d.name)} - giá ${vnd(d.kk_price)} | KK-MALL`, desc, url, img: /^https:/.test(d.image || '') ? d.image : '', ld, type: 'product' })
    + `<nav class="bc"><a href="/">Trang chủ</a> › <a href="/c/${cat.id}.html">${esc(cat.name)}</a> › <a href="/n/${gslug(d.category_id, d.grp)}.html">${esc(d.grp)}</a></nav>
<article class="pd"><div class="im"><img src="${/^https:/.test(d.image || '') ? esc(d.image) : '/logo.svg'}" alt="${esc(d.name)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/logo.svg'"></div><div>
<h1>${esc(d.name)}</h1><div>${used ? '<span class="badge u">♻️ Đã qua sử dụng</span>' : '<span class="badge">✓ Chính hãng</span>'}${hold ? '<span class="badge h">⏸ Đang xác minh giá</span>' : ''}${fl & 4 ? '<span class="badge">📉 Đáy giá lịch sử</span>' : ''}<span class="badge">${esc(d.brand)}</span><span class="badge">SKU ${d.sku}</span></div>
${hold ? '<div class="price" style="color:#64748B">Đang xác minh giá</div>' : `<div class="price">${vnd(d.kk_price)}</div><div class="ok">✓ Giá cuối cùng - đã gồm giao hàng tận cửa, không phụ phí${disc ? ` · giảm ${disc}% đã xác minh` : ''}</div>`}
<div class="proof">🔗 Lịch sử giá niêm phong SHA-256 + Merkle - không thể sửa lùi. Hóa đơn điện tử, hoàn tiền 100% nếu hết hàng.</div>
<p><a class="cta" href="/?sp=${d.sku}">${buy ? '🛒 Đặt mua ngay tại KK-MALL' : 'Xem tình trạng hàng'} →</a></p>
${specs.length ? `<h2>Thông số kỹ thuật</h2><table>${specs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}
<h2>Mô tả sản phẩm</h2><p>${esc(desc)} ${used ? 'Sản phẩm đã qua sử dụng, tình trạng ngoại quan đúng như tên gọi; giá không so sánh với giá máy mới.' : 'Hàng mới 100% theo công bố của nhà sản xuất, bảo hành ' + esc((d.specs || {})['Bảo hành'] || 'theo chính sách hãng') + ', đổi trả trong 7 ngày nếu lỗi do nhà sản xuất.'}</p>
${hist.length ? `<h2>Lịch sử giá đã niêm phong</h2><table><tr><th>Ngày</th><th>Giá</th><th>Mã niêm phong</th></tr>${hist.map(x => `<tr><td>${new Date(x[0] * 86400e3).toLocaleDateString('vi-VN')}</td><td>${vnd(x[1])}</td><td><code>${esc(x[2])}</code></td></tr>`).join('')}</table><p><a href="/?ledger=${d.sku}">🔍 Tự kiểm chứng chuỗi SHA-256 & Merkle proof →</a></p>` : ''}
</div></article>
${rel.length ? `<h2>Sản phẩm cùng nhóm ${esc(d.grp)}</h2><ul class="grid">${rel.map(li).join('')}</ul>` : ''}` + footP;
  fs.writeFileSync(path.join(SITE, 'p', slug + '.html'), html);
  (smap[d.category_id] = smap[d.category_id] || []).push(`<url><loc>${url}</loc><lastmod>${day(d.updated_at)}</lastmod></url>`);
  nP++;
}

/* ---------- trang nganh & nhom ---------- */
const pages = [`<url><loc>${ORIGIN}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`, `<url><loc>${ORIGIN}/phap-ly</loc><changefreq>monthly</changefreq></url>`];
let nC = 0, nN = 0;
for (const c of cats) {
  const rows = full.filter(r => r.category_id === c.id).sort((a, b) => (b.in_stock - a.in_stock) || (b.sold - a.sold));
  if (!rows.length) continue;
  const groups = [...new Set(rows.map(r => r.grp))];
  const url = `${ORIGIN}/c/${c.id}.html`;
  const ld = { '@context': 'https://schema.org', '@graph': [crumbs([['Trang chủ', '/'], [c.name, `/c/${c.id}.html`]]),
    { '@type': 'ItemList', name: c.name, numberOfItems: rows.length, itemListElement: rows.slice(0, PER).map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/p/${pslug(r)}.html`, name: T.cleanText(r.name) })) }] };
  fs.writeFileSync(path.join(SITE, 'c', c.id + '.html'), head({ title: `${c.name} chính hãng - ${rows.length.toLocaleString('vi-VN')} mặt hàng giá tốt | KK-MALL`, desc: `Mua ${c.name} chính hãng tại KK-MALL: ${rows.length.toLocaleString('vi-VN')} mặt hàng, ${groups.length} nhóm (${groups.slice(0, 6).join(', ')}). Giá cuối cùng đã gồm giao hàng, cập nhật tự động mỗi 3 giờ, lịch sử giá niêm phong minh bạch.`, url, ld })
    + `<nav class="bc"><a href="/">Trang chủ</a> › ${esc(c.name)}</nav><h1>${c.icon || ''} ${esc(c.name)}</h1><p>${rows.length.toLocaleString('vi-VN')} mặt hàng chính hãng · giá cuối cùng đã gồm giao hàng tận cửa · <a href="/?c=${c.id}">Mở trong ứng dụng KK-MALL →</a></p>
<ul class="chips">${groups.map(g => `<li><a href="/n/${gslug(c.id, g)}.html">${esc(g)} (${rows.filter(r => r.grp === g).length.toLocaleString('vi-VN')})</a></li>`).join('')}</ul>
<h2>Bán chạy nhất ${esc(c.name)}</h2><ul class="grid">${rows.slice(0, PER).map(li).join('')}</ul>` + foot);
  pages.push(`<url><loc>${url}</loc><changefreq>hourly</changefreq><priority>0.8</priority></url>`); nC++;
  for (const g of groups) {
    const gr = rows.filter(r => r.grp === g); const np = Math.ceil(gr.length / PER); const base = gslug(c.id, g);
    for (let k = 1; k <= np; k++) {
      const file = base + (k > 1 ? '-' + k : '') + '.html', gurl = `${ORIGIN}/n/${file}`;
      const slice = gr.slice((k - 1) * PER, k * PER);
      const pg = np > 1 ? `<nav class="pg">${Array.from({ length: np }, (_, i) => i + 1 === k ? `<span>${i + 1}</span>` : `<a href="/n/${base}${i ? '-' + (i + 1) : ''}.html">${i + 1}</a>`).join('')}</nav>` : '';
      const ld2 = { '@context': 'https://schema.org', '@graph': [crumbs([['Trang chủ', '/'], [c.name, `/c/${c.id}.html`], [g, `/n/${base}.html`]]),
        { '@type': 'ItemList', name: g, numberOfItems: gr.length, itemListElement: slice.map((r, i) => ({ '@type': 'ListItem', position: (k - 1) * PER + i + 1, url: `${ORIGIN}/p/${pslug(r)}.html`, name: T.cleanText(r.name) })) }] };
      fs.writeFileSync(path.join(SITE, 'n', file), head({ title: `${g}${k > 1 ? ' - trang ' + k : ''} giá tốt, chính hãng | KK-MALL`, desc: `${gr.length.toLocaleString('vi-VN')} sản phẩm ${g} thuộc ${c.name} tại KK-MALL. Giá cuối cùng đã gồm giao hàng, so sánh & cập nhật tự động mỗi 3 giờ.`, url: gurl, ld: ld2 })
        + `<nav class="bc"><a href="/">Trang chủ</a> › <a href="/c/${c.id}.html">${esc(c.name)}</a> › ${esc(g)}</nav><h1>${esc(g)}${k > 1 ? ` <small>- trang ${k}</small>` : ''}</h1><p>${gr.length.toLocaleString('vi-VN')} sản phẩm · <a href="/?c=${c.id}&g=${encodeURIComponent(g)}">Lọc theo giá, thương hiệu trong ứng dụng →</a></p>
${pg}<ul class="grid">${slice.map(li).join('')}</ul>${pg}` + foot);
      pages.push(`<url><loc>${gurl}</loc><changefreq>daily</changefreq><priority>0.6</priority></url>`); nN++;
    }
  }
}

/* ---------- sitemap ---------- */
const xml = body => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body.join('\n')}\n</urlset>\n`;
for (const f of fs.readdirSync(SITE)) if (/^sitemap.*\.xml$/.test(f)) fs.unlinkSync(path.join(SITE, f));
fs.writeFileSync(path.join(SITE, 'sitemap-pages.xml'), xml(pages));
const idx = [`<sitemap><loc>${ORIGIN}/sitemap-pages.xml</loc><lastmod>${day(meta.lastSync)}</lastmod></sitemap>`];
for (const [cid, urls] of Object.entries(smap)) {
  for (let i = 0; i * 45000 < urls.length; i++) {
    const name = `sitemap-p-${cid}${i ? '-' + (i + 1) : ''}.xml`;
    fs.writeFileSync(path.join(SITE, name), xml(urls.slice(i * 45000, (i + 1) * 45000)));
    idx.push(`<sitemap><loc>${ORIGIN}/${name}</loc><lastmod>${day(meta.lastSync)}</lastmod></sitemap>`);
  }
}
fs.writeFileSync(path.join(SITE, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${idx.join('\n')}\n</sitemapindex>\n`);

/* ---------- lien ket tinh trong trang chu (cho bot khong chay JS) ---------- */
const IX = path.join(SITE, 'index.html'); let ix = fs.readFileSync(IX, 'utf8');
ix = ix.replace(/<nav class="seolinks" id="seoLinks"([^>]*)>[\s\S]*?<\/nav>/, `<nav class="seolinks" id="seoLinks"$1><b>Danh mục:</b> ${cats.map(c => `<a href="./c/${c.id}.html">${esc(c.name)}</a>`).join(' · ')}</nav>`);
fs.writeFileSync(IX, ix);

console.log(`SEO: ${nP} trang SP · ${nC} trang nganh · ${nN} trang nhom · sitemap ${idx.length} file · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
