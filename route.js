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

  /* ---------- تعليمات الانعطاف بالعربية ---------- */
  const DIR = {
    left: ['انعطف يسارًا', 'arrow-left'],
    right: ['انعطف يمينًا', 'arrow-right'],
    'slight left': ['انعطف يسارًا قليلًا', 'arrow-up-left'],
    'slight right': ['انعطف يمينًا قليلًا', 'arrow-up-right'],
    'sharp left': ['انعطف يسارًا بحدة', 'arrow-down-left'],
    'sharp right': ['انعطف يمينًا بحدة', 'arrow-down-right'],
    uturn: ['استدر للخلف', 'undo-2'],
    straight: ['استمر للأمام', 'arrow-up'],
  }

  /** يحوّل خطوة OSRM إلى {text, icon, kind} */
  function describe(step) {
    const m = step.maneuver || {}
    const type = m.type
    const mod = m.modifier
    const name = step.name ? ` إلى ${step.name}` : ''
    const dir = DIR[mod] || DIR.straight
    switch (type) {
      case 'depart':
        return { kind: 'depart', icon: 'car', text: `ابدأ السير${step.name ? ' على ' + step.name : ''}` }
      case 'arrive':
        return { kind: 'arrive', icon: 'flag', text: 'وصلت إلى وجهتك' }
      case 'roundabout':
      case 'rotary':
      case 'roundabout turn':
        return {
          kind: 'turn',
          icon: 'refresh-cw',
          text: m.exit ? `ادخل الدوّار وخذ المخرج ${m.exit}${name}` : `ادخل الدوّار${name}`,
        }
      case 'fork':
        return {
          kind: 'turn',
          icon: dir[1],
          text: mod && mod.includes('left') ? `خذ المسار الأيسر${name}` : mod && mod.includes('right') ? `خذ المسار الأيمن${name}` : `استمر${name}`,
        }
      case 'merge':
        return { kind: 'turn', icon: 'merge', text: `ادمج${name}` }
      case 'on ramp':
        return { kind: 'turn', icon: dir[1], text: `ادخل المنحدر${name}` }
      case 'off ramp':
        return { kind: 'turn', icon: dir[1], text: `اخرج من المنحدر${name}` }
      case 'exit roundabout':
      case 'exit rotary':
        return { kind: 'turn', icon: 'arrow-up', text: `اخرج من الدوّار${name}` }
      default:
        // turn / end of road / new name / continue
        return { kind: 'turn', icon: dir[1], text: `${dir[0]}${name}` }
    }
  }

  /** أقرب رأس في المسار لنقطة الانعطاف، من فهرس `from` فصاعدًا */
  function nearestIdx(coords, loc, from) {
    let best = from
    let bestD = Infinity
    for (let i = from; i < coords.length; i++) {
      const dy = coords[i][0] - loc[0]
      const dx = (coords[i][1] - loc[1]) * Math.cos((loc[0] * Math.PI) / 180)
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }

  function parseSteps(route, coords) {
    const out = []
    let from = 0
    ;(route.legs || []).forEach((leg) =>
      (leg.steps || []).forEach((s) => {
        if (!s.maneuver || !s.maneuver.location) return
        const loc = [s.maneuver.location[1], s.maneuver.location[0]]
        const idx = nearestIdx(coords, loc, from)
        from = idx
        out.push({ idx, ...describe(s) })
      })
    )
    return out
  }

  /** يحسب طريقًا؛ يعيد {coords:[[lat,lng]], steps, distance, duration} أو يرمي خطأً */
  async function fetchRoute(from, to) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const url = `${ROUTE_URL}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson&steps=true`
      const res = await fetch(url, { signal: ctrl.signal })
      if (!res.ok) throw new Error('http ' + res.status)
      const data = await res.json()
      const r = data && data.code === 'Ok' && data.routes && data.routes[0]
      if (!r || !r.geometry || r.geometry.coordinates.length < 2) throw new Error('no-route')
      const coords = r.geometry.coordinates.map(([lng, lat]) => [lat, lng])
      return {
        coords,
        steps: parseSteps(r, coords),
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
        name: target.name,
        coordinates: route.coords,
        steps: route.steps,
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
  window.__ROUTE__ = { fetch: fetchRoute, describe, parseSteps }
})()
