const CACHE = 'concord-offline-v1';
const CORE = ["concord_armchair.html", "concord_accent_chair.html", "concord_slope_arm_sofa.html", "concord_side_table.html", "concord_coffee_table.html", "concord_style_completion.html", "experience-more.html", "index.html", "manifest.webmanifest", "model-viewer-umd.min.js", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "Vazirmatn-Regular.woff2", "Vazirmatn-SemiBold.woff2", "Vazirmatn-ExtraBold.woff2", "draco/draco_decoder.js", "draco/draco_decoder.wasm", "draco/draco_wasm_wrapper.js", "fonts/cormorant-garamond-latin-400-normal.woff2", "fonts/cormorant-garamond-latin-500-normal.woff2", "fonts/cormorant-garamond-latin-600-normal.woff2", "fonts/jost-latin-300-normal.woff2", "fonts/jost-latin-400-normal.woff2", "fonts/jost-latin-500-normal.woff2"];
const ASSETS = ["ar/setting-01.glb", "ar/setting-02.glb", "ar/setting-03.glb", "concord_accent_chair_grey.glb", "concord_accent_chair_indigo.glb", "concord_accent_chair_oat.glb", "concord_armchair.glb", "concord_coffee_table_large.glb", "concord_coffee_table_small.glb", "concord_side_table_medium.glb", "concord_side_table_short.glb", "concord_side_table_tall.glb", "concord_slope_arm_sofa_1seat.glb", "concord_slope_arm_sofa_3seat.glb", "concord_style_completion_ottoman.glb", "concord_style_completion_sidetable.glb", "images/concord-01.jpg", "images/concord-02.jpg", "images/concord-03.jpg", "images/concord-04.jpg", "images/concord-05.jpg", "images/concord-06.jpg"];
const USDZ = ["ar/setting-01.usdz", "ar/setting-02.usdz", "ar/setting-03.usdz", "concord_accent_chair_grey.usdz", "concord_accent_chair_indigo.usdz", "concord_accent_chair_oat.usdz", "concord_armchair.usdz", "concord_coffee_table_large.usdz", "concord_coffee_table_small.usdz", "concord_side_table_medium.usdz", "concord_side_table_short.usdz", "concord_side_table_tall.usdz", "concord_style_completion_ottoman.usdz", "concord_style_completion_sidetable.usdz"];
const SCOPE = self.registration.scope;
const abs = (p) => new URL(p, SCOPE).href;
const APPDIR = new URL('', SCOPE).pathname;
const PATHS = new Set([...CORE, ...ASSETS, ...USDZ].map((p) => new URL(p, SCOPE).pathname));

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE.map(abs));                       // صفحه‌ها و کتابخانه‌ها (الزامی)
    for (let i = 0; i < ASSETS.length; i += 3) {          // مدل‌های GLB و تصاویر
      await Promise.all(ASSETS.slice(i, i + 3).map((a) => c.add(abs(a)).catch(() => {})));
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const PREFIX = CACHE.replace(/-offline-v\d+$/, '') + '-offline-';
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    (await self.clients.matchAll()).forEach((c) => c.postMessage({ type: 'ready' }));
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  let p = url.pathname;
  if (p === APPDIR) p = APPDIR + 'index.html';
  if (!PATHS.has(p)) return;                             // صفحه‌های قدیمی و بقیه دست‌نخورده می‌مانند
  // فقط درخواست‌های خود اپ (پوشه‌ی app) را مدیریت کن؛ صفحه‌های آنلاین قدیمی همیشه از شبکه می‌خوانند.
  // استثنا: فایل‌های USDZ (Quick Look ممکن است Referrer نفرستد).
  const fromApp = p.startsWith(APPDIR) || (req.referrer || '').startsWith(SCOPE + '');
  if (!fromApp && !/\.usdz$/i.test(p)) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const key = new URL(p, location.origin).href;
    const fromCache = async () => (await c.match(key)) || new Response('Offline', { status: 503 });
    // فایل‌های خودِ اپ: اول کش (آفلاین و سریع)
    if (p.startsWith(APPDIR)) {
      const hit = await c.match(key);
      if (hit) return hit;
      try { return await fetch(req); } catch (_) { return await fromCache(); }
    }
    // مدل‌ها و تصاویر ریشه‌ی ریپو: اگر درخواست از صفحه‌ی اپ آمده، اول کش
    let fromApp = false;
    if (e.clientId) {
      const cl = await self.clients.get(e.clientId);
      fromApp = !!(cl && new URL(cl.url).pathname.startsWith(APPDIR));
    }
    if (fromApp) {
      const hit = await c.match(key);
      if (hit) return hit;
      try { return await fetch(req); } catch (_) { return await fromCache(); }
    }
    // درخواست از صفحه‌های آنلاین قدیمی (یا Quick Look): اول شبکه تا همیشه نسخه‌ی تازه بیاید؛ آفلاین از کش
    try { return await fetch(req); } catch (_) { return await fromCache(); }
  })());
});

async function cacheUsdz(client) {
  const c = await caches.open(CACHE);
  let done = 0;
  for (const u of USDZ) {
    try { if (!(await c.match(abs(u)))) await c.add(abs(u)); } catch (_) {}
    done++;
    if (client) client.postMessage({ type: 'usdz-progress', done, total: USDZ.length });
  }
  if (client) client.postMessage({ type: 'usdz-done' });
}

self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'cache-usdz') e.waitUntil(cacheUsdz(e.source));
  if (d.type === 'status') {
    e.waitUntil((async () => {
      const c = await caches.open(CACHE);
      let n = 0;
      for (const u of USDZ) if (await c.match(abs(u))) n++;
      e.source.postMessage({ type: 'status', usdzCached: n, usdzTotal: USDZ.length });
    })());
  }
});
