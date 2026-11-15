/* ═══════════════════════════════════════════════════════════════
   خارطة البر — عامل الخدمة (المرحلة 4: أوفلاين)
   استراتيجية:
   - التخزين المسبق: الملفات الأساسية (تطبيق كامل بدون شبكة)
   - نفس الأصل: شبكة أولاً ثم الكاش (تحديث فوري + أوفلاين)
   - البلاطات الخارجية: كاش أولاً + تحديث خلفي (حد 1500 بلاطة)
     (المناطق المعروضة سابقاً تبقى متاحة بدون اتصال)
   ═══════════════════════════════════════════════════════════════ */
const VERSION = 'wildmap-v20'
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
  './offline.js',
  './car.js',
  './follow.js',
  './desert_pois.json',
  './fonts/thmanyah-serif-regular.woff2',
  './fonts/thmanyah-serif-bold.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-64.png',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
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

/* ---------- حد كاش البلاطات (الأقدم يُحذف أولاً) ---------- */
const MAX_TILES = 1500
async function trimTiles() {
  const cache = await caches.open(TILE_CACHE)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i])
}

/* ---------- جلب الطلبات ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // ملفات التطبيق: شبكة أولاً (تحديث فوري بعد النشر) ثم الكاش أوفلاين
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(CORE_CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    )
    return
  }

  // بلاطات الخرائط (خارجية): كاش أولاً + تحديث خلفي + حد أقصى
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone()
            caches
              .open(TILE_CACHE)
              .then((c) => c.put(req, copy))
              .then(trimTiles)
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
