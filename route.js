/* ═══════════════════════════════════════════════════════════════
   خارطة البر — توجيه الطرق داخل المدن (اختياري)
   زر 🛣️ في شريط الهدف: يحسب طريق سيارة من موقعك إلى الهدف عبر
   OSRM ثم يسلّمه لنظام "اتباع المسار" (تنبيه ابتعاد + إعادة حساب).
   لا يغيّر الملاحة البرية: الخط المباشر يبقى الافتراضي، وهذه الميزة
   تعمل فقط عند الضغط عليها وتحتاج إنترنت.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict'

  // خادم OSRM العام للتجربة والاستخدام الخفيف. للاستخدام الكثيف: خادم خاص أو خدمة بمفتاح.
  const ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving'
  const TIMEOUT_MS = 10000

  const btn = document.getElementById('routeBtn')
  const toast = (m) => window.showToast && window.showToast(m)
  let busy = false

  /** يحسب طريقًا؛ يعيد {coords:[[lat,lng]], distance, duration} أو يرمي خطأً */
  async function fetchRoute(from, to) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const url = `${ROUTE_URL}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
      const res = await fetch(url, { signal: ctrl.signal })
      if (!res.ok) throw new Error('http ' + res.status)
      const data = await res.json()
      const r = data && data.code === 'Ok' && data.routes && data.routes[0]
      if (!r || !r.geometry || r.geometry.coordinates.length < 2) throw new Error('no-route')
      return {
        coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        distance: r.distance,
        duration: r.duration,
      }
    } finally {
      clearTimeout(timer)
    }
  }

  function here() {
    const k = window.__TRACKER__ && window.__TRACKER__.lastKnown
    if (k) return [k.lat, k.lng]
    const l = window.__LOCATE__
    return l ? [l.lat, l.lng] : null
  }

  function fmtDuration(sec) {
    const m = Math.max(1, Math.round(sec / 60))
    if (m < 60) return `${m} د`
    return `${Math.floor(m / 60)} س ${m % 60} د`
  }

  async function routeToTarget() {
    if (busy) return
    const target = window.__NAV__ && window.__NAV__.state
    if (!target) return
    const from = here()
    if (!from) {
      toast('⚠️ لم يتحدد موقعك بعد — فعّل GPS وانتظر لحظات')
      return
    }
    busy = true
    btn.classList.add('loading')
    try {
      const to = [target.lat, target.lng]
      const route = await fetchRoute(from, to)
      window.__FOLLOW__.start({
        name: `🛣️ ${target.name}`,
        coordinates: route.coords,
        reroute: { to },
      })
      toast(`🛣️ الطريق: ${Utils.formatDistance(route.distance)} · نحو ${fmtDuration(route.duration)}`)
    } catch (e) {
      toast(
        e && e.message === 'no-route'
          ? '⚠️ لا يوجد طريق سيارات لهذا الهدف — الملاحة المباشرة مستمرة'
          : '⚠️ تعذر حساب الطريق (يلزم إنترنت) — الملاحة المباشرة مستمرة'
      )
    } finally {
      busy = false
      btn.classList.remove('loading')
    }
  }

  if (btn) btn.addEventListener('click', routeToTarget)
  window.__ROUTE__ = { fetch: fetchRoute }
})()
