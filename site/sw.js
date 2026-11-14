/* KK-MALL service worker - cache than trong:
 *  - dieu huong trang: mang truoc, mat mang moi dung ban luu, khong co thi trang offline
 *  - du lieu san pham/nganh/meta: tra ban luu roi cap nhat ngam (stale-while-revalidate)
 *  - anh minh hoa, icon, js/css co phien ban: cache truoc, toi da N muc
 *  - KHONG cache: tai nguyen ngoai (anh nguon, Google Fonts, may chu Apps Script), catalog-pack (Worker giu IndexedDB),
 *    yeu cau cache:'no-store' (giu gia luc thanh toan), config.js, sw.js, so cai gia
 * (c) 2026 Nguyen Duy Dien. All rights reserved. */
'use strict';
const V = 'kk-sw-2611140';
const C_PAGE = 'kk-page-' + V, C_API = 'kk-api-' + V, C_IMG = 'kk-img-' + V, C_STATIC = 'kk-static-' + V;
const OFFLINE = './offline.html';
const LIMIT = { [C_API]: 400, [C_IMG]: 300, [C_STATIC]: 60, [C_PAGE]: 30 };

self.addEventListener('install', e => { e.waitUntil(caches.open(C_PAGE).then(c => c.add(OFFLINE)).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k.startsWith('kk-') && !k.endsWith(V)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });

async function trim(name) {
  const max = LIMIT[name]; if (!max) return;
  const c = await caches.open(name), keys = await c.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map(k => c.delete(k)));
}
async function put(name, req, res) { try { const c = await caches.open(name); await c.put(req, res); trim(name); } catch (e) { } }
function ok(res) { return res && res.ok && res.type === 'basic'; }

async function networkFirst(req, name, fallback, ms) {
  const c = await caches.open(name);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms || 6000))]);
    if (ok(res)) put(name, req, res.clone());
    return res;
  } catch (e) {
    const hit = await c.match(req, { ignoreSearch: true }); if (hit) return hit;
    if (fallback) { const f = await c.match(fallback); if (f) return f; }
    throw e;
  }
}
async function staleWhileRevalidate(req, name) {
  const c = await caches.open(name), hit = await c.match(req);
  const net = fetch(req).then(res => { if (ok(res)) put(name, req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}
async function cacheFirst(req, name) {
  const c = await caches.open(name), hit = await c.match(req); if (hit) return hit;
  const res = await fetch(req); if (ok(res)) put(name, req, res.clone()); return res;
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return;                       // khong dung vao tai nguyen ngoai
  if (req.cache === 'no-store' || req.cache === 'reload') return;       // giu gia luc thanh toan, tai lai cung
  const p = u.pathname;
  if (/\/(sw\.js|config\.js|admin\/|api\/catalog-(pack|full)\.json|api\/ledger-)/.test(p)) return;
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, C_PAGE, OFFLINE, 6000)); return; }
  if (/\/api\/(products|cat)\/|\/api\/(meta|sdui-home)\.json$/.test(p)) { e.respondWith(staleWhileRevalidate(req, C_API)); return; }
  if (/\/api\/img\/|\/icons\/|\.(svg|png|ico|webp|jpg|jpeg|woff2?)$/.test(p)) { e.respondWith(cacheFirst(req, C_IMG)); return; }
  if (/\.(js|css|webmanifest)$/.test(p)) { e.respondWith(staleWhileRevalidate(req, C_STATIC)); return; }
});
