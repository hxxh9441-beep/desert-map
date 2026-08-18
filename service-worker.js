/* ═══════════════════════════════════════════════════════════════
   خارطة البر — عامل الخدمة (المرحلة 4: أوفلاين)
   استراتيجية:
   - التخزين المسبق: الملفات الأساسية (تطبيق كامل بدون شبكة)
   - نفس الأصل: cache-first مع تحديث في الخلفية
   - الخرائط/الأصول الخارجية: stale-while-revalidate
     (المناطق المعروضة سابقاً تبقى متاحة بدون اتصال)
   ═══════════════════════════════════════════════════════════════ */
const VERSION = 'wildmap-v16'
const CORE_CACHE = `${VERSION}-core`
const TILE_CACHE = `${VERSION}-tiles`

const CORE_ASSETS = [
  './',
  './index.html',
  './tailwind.css',
  './style.css',
  './manifest.json',
  './app.js',
  './utils.js',
  './tracker.js',
  './storage.js',
  './tracks.js',
  './share.js',
  './pois.js',
  './nav.js',
  './compass.js',
  './desert_pois.json',
  './fonts/thmanyah-serif-regular.woff2',
  './fonts/thmanyah-serif-bold.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-64.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
]

/* ---------- التثبيت: تخزين مسبق ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CORE_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  )
})

/* ---------- التنشيط: تنظيف الإصدارات القديمة ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('wildmap-') && k !== CORE_CACHE && k !== TILE_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

/* ---------- جلب الطلبات ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // ملفات التطبيق (نفس الأصل): cache-first + تحديث خلفي
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone()
              caches.open(CORE_CACHE).then((cache) => cache.put(req, copy))
            }
            return res
          })
          .catch(() => cached)
        return cached || network
      })
    )
    return
  }

  // الأصول الخارجية (Leaflet + بلاطات الخرائط): stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(TILE_CACHE).then((cache) => cache.put(req, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
