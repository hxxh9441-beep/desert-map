/* ═══════════════════════════════════════════════════════════════
   خارطة البر — تحميل المنطقة للأوفلاين
   يحمّل بلاطات الطبقة الحالية للمنطقة الظاهرة إلى كاش مستقل
   (offline-tiles) لا يُحذف تلقائياً ولا يتأثر بحد كاش البلاطات.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict'

  const CACHE = 'offline-tiles' // بدون بادئة wildmap- حتى لا ينظفه عامل الخدمة
  const MAX_TILES = 800 // حد لكل عملية تحميل (حماية التخزين وسياسات الخوادم)
  const EXTRA_ZOOMS = 2 // مستويات إضافية فوق الزوم الحالي
  const CONCURRENCY = 6

  const btn = document.getElementById('offlineBtn')
  const label = document.getElementById('offlineLabel')
  const bar = document.getElementById('offlineBar')
  if (!btn || !window.__MAP__ || !('caches' in window)) return
  const map = window.__MAP__
  const layers = window.__LAYERS__

  let busy = false
  let cancelled = false

  const toast = (m) => (window.showToast ? window.showToast(m) : null)

  function activeTileLayers() {
    const out = []
    Object.values(layers).forEach((l) => {
      if (!map.hasLayer(l)) return
      if (l.getLayers) l.getLayers().forEach((s) => out.push(s))
      else out.push(l)
    })
    return out
  }

  function lng2x(lng, z) {
    return Math.floor(((lng + 180) / 360) * 2 ** z)
  }
  function lat2y(lat, z) {
    const r = (lat * Math.PI) / 180
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
  }

  function tileUrl(layer, x, y, z) {
    const subs = layer.options.subdomains
    const s = subs && subs.length ? subs[(x + y) % subs.length] : ''
    return L.Util.template(layer._url, { s, x, y, z, r: '' })
  }

  /** يبني قائمة روابط البلاطات؛ يخفض أقصى زوم حتى تدخل في الحد */
  function planTiles(tileLayers) {
    const b = map.getBounds()
    const nativeMax = Math.min(...tileLayers.map((l) => l.options.maxNativeZoom || 18))
    const z0 = Math.min(Math.round(map.getZoom()), nativeMax)
    let zMax = Math.min(z0 + EXTRA_ZOOMS, nativeMax)

    const countFor = (zTop) => {
      let n = 0
      for (let z = z0; z <= zTop; z++) {
        const w = lng2x(b.getEast(), z) - lng2x(b.getWest(), z) + 1
        const h = lat2y(b.getSouth(), z) - lat2y(b.getNorth(), z) + 1
        n += w * h
      }
      return n * tileLayers.length
    }
    while (zMax > z0 && countFor(zMax) > MAX_TILES) zMax--
    if (countFor(zMax) > MAX_TILES) return { urls: [], z0, zMax, tooBig: true }

    const urls = []
    for (let z = z0; z <= zMax; z++) {
      const x0 = lng2x(b.getWest(), z)
      const x1 = lng2x(b.getEast(), z)
      const y0 = lat2y(b.getNorth(), z)
      const y1 = lat2y(b.getSouth(), z)
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++) tileLayers.forEach((l) => urls.push(tileUrl(l, x, y, z)))
    }
    return { urls, z0, zMax, tooBig: false }
  }

  function setUi(text, pct) {
    label.textContent = text
    bar.style.width = pct == null ? '0%' : pct + '%'
    bar.parentElement.classList.toggle('hidden', pct == null)
  }

  async function download() {
    if (busy) {
      cancelled = true
      return
    }
    const tileLayers = activeTileLayers()
    if (!tileLayers.length) return
    const plan = planTiles(tileLayers)
    if (plan.tooBig) {
      toast('⚠️ المنطقة كبيرة — قرّب الخريطة ثم أعد المحاولة')
      return
    }
    busy = true
    cancelled = false
    const cache = await caches.open(CACHE)
    const { urls } = plan
    let done = 0
    let failed = 0
    let next = 0

    const worker = async () => {
      while (next < urls.length && !cancelled) {
        const url = urls[next++]
        try {
          if (!(await cache.match(url))) {
            const res = await fetch(url, { mode: 'cors' })
            if (!res.ok) throw new Error(res.status)
            await cache.put(url, res)
          }
        } catch {
          failed++
        }
        done++
        setUi(`جارٍ التحميل ${done}/${urls.length} — اضغط للإلغاء`, Math.round((done / urls.length) * 100))
      }
    }
    setUi(`جارٍ التحميل 0/${urls.length} — اضغط للإلغاء`, 0)
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))

    busy = false
    setUi('📥 تحميل المنطقة الظاهرة للأوفلاين', null)
    if (cancelled) toast('⏹️ أُلغي التحميل')
    else if (failed === urls.length) toast('⚠️ فشل التحميل — تحقق من الإنترنت')
    else toast(`✅ تم تحميل ${urls.length - failed} بلاطة (زوم ${plan.z0}–${plan.zMax})${failed ? ` · فشل ${failed}` : ''}`)
    refreshSize()
  }

  async function refreshSize() {
    const sizeEl = document.getElementById('offlineSize')
    if (!sizeEl || !('caches' in window)) return
    try {
      const n = (await (await caches.open(CACHE)).keys()).length
      sizeEl.textContent = n ? `${n} بلاطة محفوظة` : ''
    } catch {}
  }

  async function clearAll() {
    if (busy) return
    await caches.delete(CACHE)
    toast('🗑️ تم حذف الخرائط المحملة')
    refreshSize()
  }

  btn.addEventListener('click', download)
  document.getElementById('offlineClear')?.addEventListener('click', clearAll)
  refreshSize()
})()
