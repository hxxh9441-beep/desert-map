/* ═══════════════════════════════════════════════════════════════
   خارطة البر — دوران الخريطة + البوصلة التفاعلية
   وضع الشمال-أعلى (افتراضي) · وضع اتجاه-السير (تلقائي مع الملاحة) ·
   دوران يدوي بإصبعين · بوصلة تدور مع الخريطة وتعيد الشمال بضغطة
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict'

  const map = window.__MAP__
  const TRACKER = window.__TRACKER__

  /* ---------- غلاف دوار حول لوحة الخريطة ----------
     نلف غلافاً خاصاً (وليس لوحة الخريطة مباشرة) حتى لا يتعارض
     الدوران مع transform الذي يحدّثه Leaflet عند التمركز/السحب */
  const mapPane = document.querySelector('.leaflet-map-pane')
  const wrap = document.createElement('div')
  wrap.className = 'map-rotate-wrap'
  if (mapPane && mapPane.parentNode) {
    mapPane.parentNode.insertBefore(wrap, mapPane)
    wrap.appendChild(mapPane)
  }

  const compassBtn = document.getElementById('compassBtn')
  const compassNeedle = document.getElementById('compassNeedle')

  /* ---------- الحالة ---------- */
  let mode = 'north' // 'north' | 'heading'
  let manualOffset = 0 // دوران يدوي (إصبعان) — يضاف للزاوية
  let currentRotation = 0 // الزاوية المطبقة حالياً على الخريطة
  let headingSource = null // أحدث اتجاه متاح
  let deviceHeading = null // من مستشعر بوصلة الجهاز (ساكن)
  let raf = null

  function normalize(d) {
    return ((d % 360) + 360) % 360
  }

  /* ---------- تطبيق الدوران (الخريطة + إبرة البوصلة) ---------- */
  function applyRotation(deg) {
    currentRotation = deg
    if (wrap) wrap.style.transform = `rotate(${deg}deg)`
    if (compassNeedle) compassNeedle.style.transform = `rotate(${deg}deg)`
    // القصور الذاتي يُفعَّل فقط في وضع الشمال (زاوية ≈ 0)
    const r = ((deg % 360) + 360) % 360
    const wantInertia = Math.abs(r) < 0.5
    if (map.options.inertia !== wantInertia) map.options.inertia = wantInertia
  }

  /* ---------- مستشعر اتجاه الجهاز ---------- */
  function onDeviceOrientation(e) {
    let h = null
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading
    else if (typeof e.alpha === 'number' && isFinite(e.alpha)) h = (360 - e.alpha) % 360
    if (h !== null && isFinite(h)) deviceHeading = (h + 360) % 360
  }

  async function requestOrientationPermission() {
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      try {
        const r = await DeviceOrientationEvent.requestPermission()
        return r === 'granted'
      } catch {
        return false
      }
    }
    return true // أندرويد/سطح المكتب — لا إذن إضافي
  }

  /* ---------- حلقة الدوران السلس ---------- */
  function tick() {
    raf = requestAnimationFrame(tick)

    // مصدر الاتجاه: heading الـ GPS أثناء الحركة، وإلا مستشعر الجهاز
    const lk = TRACKER && TRACKER.lastKnown
    const moving =
      lk && (lk.speedKmh || 0) >= 1 && typeof lk.heading === 'number' && isFinite(lk.heading)
    if (moving) headingSource = lk.heading
    else if (deviceHeading !== null) headingSource = deviceHeading
    else headingSource = null

    const target =
      mode === 'heading' && headingSource !== null
        ? normalize(-headingSource + manualOffset)
        : normalize(manualOffset)

    // استيفاء سلس نحو الهدف
    let diff = target - currentRotation
    diff = ((diff + 540) % 360) - 180
    if (Math.abs(diff) < 0.1) {
      applyRotation(normalize(target))
    } else {
      applyRotation(currentRotation + diff * 0.3)
    }
  }

  /* ---------- تبديل الوضع ---------- */
  function setHeadingMode(on) {
    mode = on ? 'heading' : 'north'
    if (on) {
      window.addEventListener('deviceorientation', onDeviceOrientation)
    } else {
      window.removeEventListener('deviceorientation', onDeviceOrientation)
      manualOffset = 0 // العودة للشمال = صفر دوران
    }
    if (compassBtn) {
      compassBtn.classList.toggle('active', on)
      compassBtn.title = on
        ? 'وضع اتجاه السير — اضغط للشمال'
        : 'الشمال للأعلى — اضغط لوضع اتجاه السير'
    }
  }

  compassBtn.addEventListener('click', async () => {
    if (mode === 'north') {
      const ok = await requestOrientationPermission()
      if (!ok) {
        showToast('⚠️ تعذر الوصول لمستشعر البوصلة')
        return
      }
      setHeadingMode(true)
      showToast('🧭 وضع اتجاه السير — الخريطة تدور معك')
    } else {
      setHeadingMode(false)
      showToast('🧭 الشمال للأعلى')
    }
  })

  /* ---------- الملاحة تفعّل اتجاه السير تلقائياً ---------- */
  const NAV = window.__NAV__
  if (NAV && typeof NAV.navigateTo === 'function') {
    const origNavigate = NAV.navigateTo
    NAV.navigateTo = function (...args) {
      const r = origNavigate.apply(this, args)
      setHeadingMode(true) // أثناء الملاحة: الطريق أمامك دائماً للأعلى
      requestOrientationPermission().then((ok) => {
        if (ok) window.addEventListener('deviceorientation', onDeviceOrientation)
      })
      return r
    }
  }

  /* ---------- دوران يدوي بإصبعين ---------- */
  let pinch = null
  const container = map.getContainer()

  function touchAngle(touches) {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return (Math.atan2(dy, dx) * 180) / Math.PI
  }

  container.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length === 2) pinch = { angle: touchAngle(e.touches) }
      else if (e.touches.length !== 2) pinch = null
    },
    { passive: true }
  )
  container.addEventListener(
    'touchmove',
    (e) => {
      if (!pinch || e.touches.length !== 2) return
      const a = touchAngle(e.touches)
      let d = a - pinch.angle
      if (d > 180) d -= 360
      if (d < -180) d += 360
      if (Math.abs(d) >= 2) {
        // منطقة تلامس صغيرة — نتجاهل الاهتزاز
        manualOffset = normalize(manualOffset + d)
        pinch.angle = a
      }
    },
    { passive: true }
  )
  container.addEventListener('touchend', () => {
    pinch = null
  })

  /* ---------- تصحيح سحب الخريطة عند الدوران ----------
     Leaflet يحسب إزاحة السحب في إحداثيات الشاشة غير المدوّرة،
     فتتحرك الخريطة قطرياً/معكوسة عند دوران الغلاف. الحل: نلتف حول
     _onMove لمحرك السحب وندوّر الإزاحة عكس زاوية الخريطة (rotateVector)
     حتى تتبع المحتوى إصبعك تماماً في كل الاتجاهات. */
  function patchDragRotation() {
    const handler = map.dragging
    const draggable = handler && handler._draggable
    if (!draggable || draggable.__rotPatched) return
    draggable.__rotPatched = true

    const origOnMove = draggable._onMove
    draggable._onMove = function (e) {
      origOnMove.call(this, e)

      const rot = window.__ROTATE__ ? window.__ROTATE__.currentDeg() : 0
      const r = ((rot % 360) + 360) % 360
      if (Math.abs(r) < 0.5) return

      // الإزاحة التي طبقها Leaflet (إحداثيات الشاشة)
      const delta = this._newPos.subtract(this._startPos)
      // دوران عكسي للإزاحة (rotateVector بزاوية -θ)
      const rad = (-r * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      const rd = L.point(delta.x * cos - delta.y * sin, delta.x * sin + delta.y * cos)

      const corrected = this._startPos.add(rd)
      this._newPos = corrected
      this._lastPos = corrected // يصحح اتجاه القصور الذاتي (flick)
      L.DomUtil.setPosition(this._element, corrected)
    }
  }

  /* ---------- تعطيل القصور الذاتي عند الدوران ----------
     سرعة القصور الذاتي تُحسب بإحداثيات Leaflet غير المدوّرة —
     نتجنب اندفاعاً باتجاه خاطئ بصرياً ونعتمد على سحب مباشر */
  function syncInertia() {
    const r = ((currentRotation % 360) + 360) % 360
    map.options.inertia = Math.abs(r) < 0.5
  }

  /* ---------- إعادة قياس الخريطة عند تغيّر حجم الشاشة ---------- */
  window.addEventListener('resize', () => {
    map.invalidateSize()
  })

  /* ---------- تصحيح النقر عند دوران الخريطة ----------
     تحويل نقطة الشاشة إلى نقطة حاوية غير مدوّرة (لإسقاط الدبابيس) */
  function unrotatePoint(p) {
    const R = (-currentRotation * Math.PI) / 180
    const size = map.getSize()
    const cx = size.x / 2
    const cy = size.y / 2
    const dx = p.x - cx
    const dy = p.y - cy
    const cos = Math.cos(R)
    const sin = Math.sin(R)
    return L.point(cx + dx * cos - dy * sin, cy + dx * sin + dy * cos)
  }

  function currentDeg() {
    return currentRotation
  }

  /* ---------- التشغيل ---------- */
  patchDragRotation()
  map.invalidateSize() // تأكد من قياس الحاوية الكبيرة 150vmax
  syncInertia()
  tick()

  window.__ROTATE__ = {
    currentDeg,
    unrotatePoint,
    setNorth: () => setHeadingMode(false),
    isHeadingMode: () => mode === 'heading',
  }
})()
