/* ═══════════════════════════════════════════════════════════════
   خارطة البر — ملاحة المسار المحفوظ + تنبيه الابتعاد
   اتبع مسارًا محفوظًا: المتبقي، وتنبيه (اهتزاز + صوت) إذا خرجت
   عنه أكثر من الحد، مع اتجاه أقرب نقطة للعودة. زر عكس الاتجاه.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict'

  const map = window.__MAP__
  const hud = document.getElementById('followHud')
  if (!map || !hud) return

  const nameEl = document.getElementById('followName')
  const statusEl = document.getElementById('followStatus')
  const iconEl = document.getElementById('followIcon')
  const revBtn = document.getElementById('followReverseBtn')
  const stopBtn = document.getElementById('followStopBtn')

  const MIN_OFF_M = 50 // حد الابتعاد الأدنى (يرتفع مع ضعف دقة GPS)
  const OFF_TICKS = 3 // ثوانٍ متتالية خارج المسار قبل التنبيه
  const REPEAT_MS = 30000 // إعادة التنبيه أثناء الابتعاد
  const ARRIVE_M = 30
  const WINDOW_BACK = 5
  const WINDOW_FWD = 200

  const toast = (m) => window.showToast && window.showToast(m)

  const st = {
    track: null,
    pts: [], // [lat,lng] بالاتجاه الحالي
    cum: [], // مسافة تراكمية عند كل نقطة (م)
    total: 0,
    reversed: false,
    idx: 0,
    offTicks: 0,
    off: false,
    lastAlert: 0,
    arrived: false,
    timer: null,
    route: null,
    link: null,
  }

  /* ---------- هندسة: أقرب نقطة على مقطع (إسقاط محلي بالأمتار) ---------- */
  function nearestOnSegment(p, a, b) {
    const k = Math.cos((p[0] * Math.PI) / 180)
    const X = (q) => (q[1] - p[1]) * 111320 * k
    const Y = (q) => (q[0] - p[0]) * 110574
    const ax = X(a), ay = Y(a), bx = X(b), by = Y(b)
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    let t = len2 ? (-ax * dx - ay * dy) / len2 : 0
    t = Math.max(0, Math.min(1, t))
    const cx = ax + t * dx, cy = ay + t * dy
    return { t, dist: Math.hypot(cx, cy), point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] }
  }

  function scan(p, from, to) {
    let best = null
    for (let i = Math.max(0, from); i < Math.min(st.pts.length - 1, to); i++) {
      const r = nearestOnSegment(p, st.pts[i], st.pts[i + 1])
      if (!best || r.dist < best.dist) best = { ...r, i }
    }
    return best
  }

  /** أقرب نقطة على المسار: نافذة قرب آخر موقع أولاً (يميّز ذهاب/إياب نفس الطريق) */
  function locate(p, limit) {
    const win = scan(p, st.idx - WINDOW_BACK, st.idx + WINDOW_FWD)
    if (win && win.dist <= limit) return win
    const all = scan(p, 0, st.pts.length)
    return all && win && win.dist <= all.dist + 5 ? win : all
  }

  /* ---------- تنبيه ---------- */
  function alertOff(distM) {
    Utils.notify([300, 120, 300, 120, 300], 880)
    toast(`⚠️ ابتعدت عن المسار ${Utils.formatDistance(distM)}`)
  }

  /* ---------- الرسم ---------- */
  function drawRoute() {
    if (st.route) map.removeLayer(st.route)
    st.route = L.polyline(st.pts, {
      color: '#fbbf24',
      weight: 5,
      opacity: 0.9,
      dashArray: '2 10',
      lineCap: 'round',
    }).addTo(map)
  }
  function setLink(from, to) {
    if (!from) {
      if (st.link) map.removeLayer(st.link)
      st.link = null
      return
    }
    if (!st.link) st.link = L.polyline([from, to], { color: '#ef4444', weight: 3, dashArray: '6 8', interactive: false }).addTo(map)
    else st.link.setLatLngs([from, to])
  }

  /* ---------- الدورة الحية (كل ثانية) ---------- */
  function tick() {
    const k = window.__TRACKER__ && window.__TRACKER__.lastKnown
    if (!k) {
      statusEl.textContent = 'بانتظار إشارة GPS…'
      return
    }
    const p = [k.lat, k.lng]
    const limit = Math.max(MIN_OFF_M, (k.accuracy || 0) * 1.5)
    const r = locate(p, limit)
    if (!r) return
    st.idx = r.i
    const remaining = Math.max(0, st.total - (st.cum[r.i] + r.t * (st.cum[r.i + 1] - st.cum[r.i])))

    if (r.dist > limit) {
      st.offTicks++
      const brg = Utils.bearing(p, r.point)
      iconEl.textContent = '⚠️'
      hud.classList.add('off')
      statusEl.textContent = `خارج المسار ${Utils.formatDistance(r.dist)} — اتجه ${Math.round(brg)}° ${Utils.cardinalAr(brg)}`
      setLink(p, r.point)
      const now = Date.now()
      if (st.offTicks >= OFF_TICKS && (!st.off || now - st.lastAlert > REPEAT_MS)) {
        st.off = true
        st.lastAlert = now
        alertOff(r.dist)
      }
    } else {
      if (st.off) toast('✅ رجعت إلى المسار')
      st.off = false
      st.offTicks = 0
      hud.classList.remove('off')
      iconEl.textContent = '🧭'
      setLink(null)
      statusEl.textContent = `على المسار · المتبقي ${Utils.formatDistance(remaining)}`
      if (remaining <= ARRIVE_M && !st.arrived && st.total > 100) {
        st.arrived = true
        Utils.notify([500, 150, 500], 660)
        toast('🏁 وصلت نهاية المسار')
      }
    }
  }

  /* ---------- بدء/إيقاف ---------- */
  function build() {
    const base = st.track.coordinates
    st.pts = st.reversed ? base.slice().reverse() : base.slice()
    st.cum = [0]
    for (let i = 1; i < st.pts.length; i++) st.cum.push(st.cum[i - 1] + Utils.haversine(st.pts[i - 1], st.pts[i]))
    st.total = st.cum[st.cum.length - 1]
    st.idx = 0
    st.off = false
    st.offTicks = 0
    st.arrived = false
    nameEl.textContent = `${st.reversed ? '↔ ' : ''}${st.track.name}`
    revBtn.classList.toggle('active', st.reversed)
    drawRoute()
    setLink(null)
  }

  function start(track) {
    const coords = track && Array.isArray(track.coordinates) ? track.coordinates : []
    if (coords.length < 2) {
      toast('⚠️ المسار قصير جداً للملاحة')
      return
    }
    stop(false)
    if (window.__NAV__ && window.__NAV__.clearTarget) window.__NAV__.clearTarget(false)
    st.track = track
    st.reversed = false
    build()
    map.fitBounds(st.route.getBounds(), { padding: [48, 48] })
    hud.classList.add('open')
    tick()
    st.timer = setInterval(tick, 1000)
    toast('🧭 بدأت ملاحة المسار — سأنبهك إذا ابتعدت')
  }

  function stop(showMsg = true) {
    if (st.timer) clearInterval(st.timer)
    st.timer = null
    if (st.route) map.removeLayer(st.route)
    st.route = null
    setLink(null)
    st.track = null
    hud.classList.remove('open', 'off')
    if (showMsg) toast('تم إنهاء ملاحة المسار')
  }

  revBtn.addEventListener('click', () => {
    if (!st.track) return
    st.reversed = !st.reversed
    build()
    tick()
  })
  stopBtn.addEventListener('click', () => stop())

  window.__FOLLOW__ = { start, stop, nearestOnSegment }
})()
