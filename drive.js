/* ═══════════════════════════════════════════════════════════════
   خارطة البر — وضع القيادة
   - تتبع المؤشر: الخريطة تتحرك مع السيارة (تلقائيًا عند التسجيل أو الملاحة،
     وبزر 🎯). سحب الخريطة بيدك يوقف التتبع، و🎯 يعيده.
   - زوم تلقائي حسب السرعة، لا يتجاوز حد البلاطات الأصلي (فلا تتمطط/تضبب).
   تدوير الخريطة باتجاه السير يبقى اختياريًا من زر البوصلة.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict'

  const map = window.__MAP__
  const TRACKER = window.__TRACKER__
  const locateBtn = document.getElementById('locateBtn')
  if (!map || !TRACKER || !locateBtn) return

  const ZOOM_MIN_INTERVAL_MS = 6000 // أقل فاصل بين تغييرين للزوم (يمنع التذبذب)
  const MANUAL_ZOOM_HOLD_MS = 60000 // بعد زوم يدوي لا نغيّر الزوم تلقائيًا لهذه المدة
  const MAX_BASE_ZOOM = 17 // افتراضي إن لم تُعرف الطبقة
  const MAX_BASE_ZOOM_CAP = 18 // سقف زوم القيادة حتى لو توفرت بلاطات أعمق

  const st = {
    follow: false,
    lastTs: 0,
    lastZoomAt: 0,
    manualZoomUntil: 0,
    progZoom: false,
    wasActive: false,
  }

  /** أقصى زوم أصلي للطبقة الظاهرة (بعده تتمطط البلاطات) */
  function nativeMaxZoom() {
    let min = Infinity
    Object.values(window.__LAYERS__ || {}).forEach((l) => {
      if (!map.hasLayer(l)) return
      const subs = l.getLayers ? l.getLayers() : [l]
      subs.forEach((s) => {
        min = Math.min(min, (s.options && s.options.maxNativeZoom) || 18)
      })
    })
    return isFinite(min) ? min : MAX_BASE_ZOOM
  }

  function targetZoom(speedKmh) {
    const base = Math.min(nativeMaxZoom(), MAX_BASE_ZOOM_CAP)
    const v = speedKmh || 0
    if (v < 40) return base
    if (v < 80) return base - 1
    return base - 2
  }

  function navActive() {
    return !!(
      TRACKER.recording ||
      (window.__NAV__ && window.__NAV__.state) ||
      (window.__FOLLOW__ && window.__FOLLOW__.active)
    )
  }

  function render() {
    locateBtn.classList.toggle('follow-on', st.follow)
    // ملاحة/تسجيل جارٍ لكن التتبع متوقف: نلفت النظر لزر العودة
    locateBtn.classList.toggle('attention', !st.follow && navActive())
  }

  function setFollow(on) {
    st.follow = on
    st.lastTs = 0 // اتبع أول موقع فورًا
    render()
  }

  /* ---------- مؤشر دقة GPS (نقطة بجانب "السرعة") ---------- */
  const gpsDot = document.getElementById('gpsDot')
  function renderGps() {
    if (!gpsDot) return
    const k = TRACKER.lastKnown
    const age = k ? (Date.now() - k.ts) / 1000 : Infinity
    let level = 'none'
    let label = 'لا توجد إشارة GPS'
    if (k && age <= 15) {
      const a = k.accuracy || 999
      level = a <= 15 ? 'good' : a <= 40 ? 'mid' : 'bad'
      label = `دقة GPS: ±${Math.round(a)} م — ${level === 'good' ? 'ممتازة' : level === 'mid' ? 'متوسطة' : 'ضعيفة'}`
    } else if (k) {
      label = 'إشارة GPS متوقفة منذ ' + Math.round(age) + ' ث'
    }
    gpsDot.className = 'gps-dot ' + level
    gpsDot.title = label
    gpsDot.setAttribute('aria-label', label)
  }

  function tick() {
    renderGps()
    const active = navActive()
    if (active && !st.wasActive) setFollow(true) // بدء ملاحة/تسجيل → تتبع تلقائي
    st.wasActive = active
    render()

    const k = TRACKER.lastKnown
    if (!st.follow || !k || k.ts === st.lastTs) return
    st.lastTs = k.ts

    const ll = L.latLng(k.lat, k.lng)
    const now = Date.now()
    const tz = targetZoom(k.speedKmh)
    const needZoom =
      now > st.manualZoomUntil && Math.round(map.getZoom()) !== tz && now - st.lastZoomAt > ZOOM_MIN_INTERVAL_MS

    if (needZoom) {
      // تغيير الزوم + التمركز في استدعاء واحد (panTo ثم setZoom يلغي أحدهما الآخر)
      st.lastZoomAt = now
      st.progZoom = true
      map.setView(ll, tz, { animate: true })
      return
    }

    // بعيد عن الشاشة (أول تتبع بعد سحب بعيد): قفز مباشر. قريب (حركة السيارة): انزلاق سلس
    const px = map.latLngToContainerPoint(ll)
    const size = map.getSize()
    if (Math.abs(px.x - size.x / 2) > size.x * 1.2 || Math.abs(px.y - size.y / 2) > size.y * 1.2) {
      map.setView(ll, map.getZoom(), { animate: false })
    } else {
      map.panTo(ll, { animate: true, duration: 0.9, easeLinearity: 1, noMoveStart: true })
    }
  }

  /* زوم يدوي (لمسة/أزرار) → نمهل الزوم التلقائي */
  map.on('zoomstart', () => {
    if (!st.progZoom) st.manualZoomUntil = Date.now() + MANUAL_ZOOM_HOLD_MS
  })
  map.on('zoomend', () => {
    st.progZoom = false
  })
  /* سحب الخريطة بيد المستخدم → يتوقف التتبع */
  map.on('dragstart', () => {
    if (st.follow) setFollow(false)
  })

  locateBtn.addEventListener('click', () => {
    st.manualZoomUntil = 0
    setFollow(true)
  })

  setInterval(tick, 1000)
  window.__DRIVE__ = {
    get following() {
      return st.follow
    },
    setFollow,
    pause: () => st.follow && setFollow(false),
  }
})()
