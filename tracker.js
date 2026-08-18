/* ═══════════════════════════════════════════════════════════════
   خارطة البر — محرك التتبع والتسجيل الحي (المرحلة 2 + بَك Google Maps)
   مراقبة مستمرة (watchPosition دائم) · بَك: نقطة زرقاء ساكنة أو سهم
   مخروطي ثلاثي الأبعاد يدور مع الاتجاه · دائرة دقة شفافة · تسجيل مسار + HUD
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict'

  const MIN_DISTANCE_M = 10 // فلتر الضوضاء: نهمل أي إحداثي أقرب من 10م
  const MAX_ACCURACY_M = 25 // حماية الدقة: لا نسجل إشارة أدق من 25م
  const MOVING_SPEED_KMH = 1 // فوقها + heading صالح = وضع السهم المتحرك
  const map = window.__MAP__

  /* ---------- عناصر الواجهة ---------- */
  const recordBtn = document.getElementById('recordBtn')
  const recordLabel = document.getElementById('recordLabel')
  const hudSpeed = document.getElementById('hudSpeed')
  const hudDistance = document.getElementById('hudDistance')
  const hudDuration = document.getElementById('hudDuration')
  const gpsError = document.getElementById('gpsError')

  /* ---------- مودال حفظ المسار ---------- */
  const saveModal = document.getElementById('saveModal')
  const saveModalStats = document.getElementById('saveModalStats')
  const trackNameInput = document.getElementById('trackName')
  const trackNotesInput = document.getElementById('trackNotes')
  const saveTrackBtn = document.getElementById('saveTrackBtn')
  const discardTrackBtn = document.getElementById('discardTrackBtn')

  /* ---------- مؤشر الموقع الحي (بَك Google Maps) ----------
     ساكن (سرعة < 1 كم/س أو بلا heading): نقطة زرقاء نابضة + حلقة دقة
     متحرك (سرعة ≥ 1 كم/س + heading صالح): سهم مخروطي 3D يدور بسلاسة */
  let locationMarker = null
  const LOC_ICON = L.divIcon({
    className: 'loc-marker-wrap',
    html: `
      <div class="loc-puck">
        <div class="puck-dot">
          <span class="puck-core"></span>
          <span class="puck-ping"></span>
        </div>
        <div class="puck-cone">
          <svg viewBox="0 0 44 48" width="44" height="48" aria-hidden="true">
            <defs>
              <linearGradient id="puck-cone-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#38bdf8"/>
                <stop offset="100%" stop-color="#0369a1"/>
              </linearGradient>
            </defs>
            <path d="M22 2 C30 14 38 23 38 31 C38 40.4 30.8 46 22 46 C13.2 46 6 40.4 6 31 C6 23 14 14 22 2 Z"
              fill="url(#puck-cone-grad)" stroke="#e0f2fe" stroke-width="1.8"/>
            <path d="M22 11 L29 31 L22 26.5 L15 31 Z" fill="#ffffff" opacity="0.95"/>
          </svg>
        </div>
      </div>`,
    iconSize: [44, 48],
    iconAnchor: [22, 6], // رأس السهم عند نقطة الموقع
  })

  /* ---------- إبقاء الشاشة مضيئة (Wake Lock) ---------- */
  let wakeLock = null

  async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return
    try {
      wakeLock = await navigator.wakeLock.request('screen')
      wakeLock.addEventListener('release', () => {
        wakeLock = null
      })
    } catch {
      wakeLock = null // بعض الأجهزة ترفض — نتابع بدونها
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().catch(() => {})
      wakeLock = null
    }
  }

  // عند الرجوع للتبويب أثناء التسجيل — نعيد طلب إبقاء الشاشة
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.recording) {
      acquireWakeLock()
    }
  })

  /* ---------- الحالة ---------- */
  const state = {
    recording: false,
    watchId: null,
    timerInterval: null,
    points: [], // الإحداثيات المقبولة (المسار)
    polyline: null, // L.Polyline حي
    distance: 0, // الأمتار المتراكمة
    speed: 0, // كم/س
    elapsed: 0, // ثوانٍ
    startTime: 0,
    lastFixTime: 0,
    error: null,
    lastKnown: null, // آخر موقع معروف {lat,lng,heading,speedKmh,accuracy,ts}
  }

  /* ---------- الخط الحي ---------- */
  function updatePolyline() {
    if (!state.polyline) {
      state.polyline = L.polyline(state.points, {
        color: '#00E5FF',
        weight: 4,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map)
    } else {
      state.polyline.setLatLngs(state.points)
    }
  }

  function clearPolyline() {
    if (state.polyline) {
      map.removeLayer(state.polyline)
      state.polyline = null
    }
  }

  /* ---------- دائرة دقة GPS (زرقاء شفافة ناعمة) ---------- */
  let accuracyCircle = null

  function updateAccuracyCircle(lat, lng, accuracy) {
    const r = Math.max(accuracy || 25, 10)
    if (!accuracyCircle) {
      accuracyCircle = L.circle([lat, lng], {
        radius: r,
        color: 'rgba(56,189,248,0.5)',
        weight: 1.5,
        fillColor: '#38bdf8',
        fillOpacity: 0.1,
        interactive: false,
      }).addTo(map)
    } else {
      accuracyCircle.setLatLng([lat, lng])
      accuracyCircle.setRadius(r)
    }
  }

  /* ---------- البَك: نقطة ساكنة أو سهم متحرك ---------- */
  function updateLocationMarker() {
    if (!state.lastKnown) return
    const { lat, lng, heading, speedKmh } = state.lastKnown
    if (!locationMarker) {
      locationMarker = L.marker([lat, lng], { icon: LOC_ICON, zIndexOffset: 1000 }).addTo(map)
    } else {
      locationMarker.setLatLng([lat, lng])
    }
    const el = locationMarker.getElement()
    if (!el) return
    // متحرك = سرعة كافية + اتجاه صالح
    const moving = (speedKmh || 0) >= MOVING_SPEED_KMH && typeof heading === 'number' && isFinite(heading)
    const puck = el.querySelector('.loc-puck')
    if (puck) puck.classList.toggle('moving', moving)
    if (moving) {
      const cone = el.querySelector('.puck-cone')
      if (cone) cone.style.transform = `rotate(${heading}deg)`
    }
  }

  function removeLocationMarker() {
    if (locationMarker) {
      map.removeLayer(locationMarker)
      locationMarker = null
    }
  }

  /* ---------- معالجة إحداثيات GPS ---------- */
  function onPosition(pos) {
    const { latitude, longitude, speed, heading, accuracy, timestamp } = pos.coords
    const point = [latitude, longitude]
    const now = timestamp || Date.now()
    const speedKmh =
      typeof speed === 'number' && speed >= 0 && isFinite(speed) ? speed * 3.6 : null

    // آخر موقع معروف — يحدّث البَك دائماً (سجّل أو لا)
    state.lastKnown = {
      lat: latitude,
      lng: longitude,
      heading: typeof heading === 'number' && isFinite(heading) ? heading : null,
      speedKmh,
      accuracy: typeof accuracy === 'number' ? accuracy : 25,
      ts: now,
    }
    updateLocationMarker()
    updateAccuracyCircle(latitude, longitude, state.lastKnown.accuracy)

    // خارج التسجيل: نكتفي بتحديث البَك والدائرة — لا نبني مساراً
    if (!state.recording) {
      state.error = null
      renderHud()
      return
    }

    // حماية الدقة: لا نسجل إشارة أدق من 25م
    if (state.lastKnown.accuracy > MAX_ACCURACY_M) return

    // أول إحداثي بعد بدء التسجيل: نقبله دائماً ونتمركز عليه
    if (state.points.length === 0) {
      state.points.push(point)
      state.lastFixTime = now
      updatePolyline()
      map.setView(point, Math.max(map.getZoom(), 16))
      renderHud()
      return
    }

    const last = state.points[state.points.length - 1]
    const moved = Utils.haversine(last, point)
    const dt = (now - state.lastFixTime) / 1000

    // السرعة: قيمة GPS إن وُجدت، وإلا نحسبها من المسافة/الزمن
    if (speedKmh !== null) {
      state.speed = speedKmh
    } else if (dt > 0 && moved >= 0) {
      state.speed = (moved / dt) * 3.6
    }

    // منع الانجراف الساكن: سرعة أقل من 1 كم/س ومسافة أقل من 10م = ضجيج لا حركة
    const isStationaryDrift = state.speed < 1 && moved < MIN_DISTANCE_M
    if (moved < MIN_DISTANCE_M || isStationaryDrift) {
      renderHud()
      return
    }

    // نقطة صالحة — نضيفها للمسار
    state.points.push(point)
    state.distance += moved
    state.lastFixTime = now
    updatePolyline()
    renderHud()
  }

  function onError(err) {
    state.error = err && err.message ? err.message : 'تعذر الوصول إلى موقعك'
    renderHud()
  }

  /* ---------- العرض ---------- */
  function renderHud() {
    hudSpeed.textContent = Math.round(state.speed)
    hudDistance.textContent = (state.distance / 1000).toFixed(2)
    hudDuration.textContent = Utils.formatDuration(state.elapsed)

    // نعرض خطأ GPS فقط أثناء التسجيل — لا نزعج المستخدم أثناء التصفح
    if (state.error && state.recording) {
      gpsError.textContent = `⚠️ ${state.error}`
      gpsError.classList.remove('hidden')
    } else {
      gpsError.classList.add('hidden')
    }
  }

  function updateUI() {
    recordBtn.classList.toggle('recording', state.recording)
    recordLabel.textContent = state.recording ? 'أوقف التسجيل' : 'ابدأ التسجيل'
  }

  /* ---------- التشغيل/الإيقاف ---------- */
  function start() {
    // جلسة جديدة (البَك والمراقبة مستمران ولا يُمسان)
    state.points = []
    state.distance = 0
    state.speed = 0
    state.elapsed = 0
    state.error = null
    state.startTime = Date.now()
    state.lastFixTime = 0
    clearPolyline()
    closeSaveModal()
    gpsError.classList.add('hidden')
    renderHud()

    state.recording = true
    state.timerInterval = setInterval(() => {
      state.elapsed = (Date.now() - state.startTime) / 1000
      renderHud()
    }, 1000)

    // الشاشة تبقى مضيئة أثناء التسجيل
    acquireWakeLock()

    updateUI()
  }

  function stop() {
    state.recording = false
    if (state.timerInterval) {
      clearInterval(state.timerInterval)
      state.timerInterval = null
    }
    // نطلق إبقاء الشاشة — انتهى التسجيل
    releaseWakeLock()
    updateUI()

    // إن وُجد مسار مسجّل — نعرض مودال الحفظ
    if (state.points.length > 0) openSaveModal()
  }

  /* ---------- مودال الحفظ ---------- */
  let pendingImport = null // مسار مستورد (GPX/رابط) بانتظار الحفظ

  function openSaveModal() {
    saveModalStats.textContent = `${Utils.formatDistance(state.distance)} · ${Utils.formatDuration(state.elapsed)}`
    trackNameInput.value = ''
    trackNotesInput.value = ''
    saveModal.classList.add('open')
    setTimeout(() => trackNameInput.focus(), 60)
  }

  // فتح مودال الحفظ لمسار مستورد (من GPX)
  function openImportSaveModal(track) {
    pendingImport = track
    saveModalStats.textContent = `${Utils.formatDistance(track.distanceKm * 1000)} · ${track.coordinates.length} نقطة`
    trackNameInput.value = track.name || ''
    trackNotesInput.value = ''
    saveModal.classList.add('open')
    setTimeout(() => trackNameInput.focus(), 60)
  }

  function closeSaveModal() {
    saveModal.classList.remove('open')
  }

  function resetSessionHud() {
    state.points = []
    state.distance = 0
    state.elapsed = 0
    state.speed = 0
    renderHud()
  }

  saveTrackBtn.addEventListener('click', () => {
    let saved = null
    if (pendingImport) {
      // حفظ مسار مستورد (GPX/رابط)
      saved = Store.saveTrack({
        name: trackNameInput.value,
        notes: trackNotesInput.value,
        coordinates: pendingImport.coordinates,
        distanceKm: pendingImport.distanceKm,
        durationSec: pendingImport.durationSec || 0,
      })
      pendingImport = null
    } else {
      // حفظ جلسة التسجيل الحالية
      saved = Store.saveTrack({
        name: trackNameInput.value,
        notes: trackNotesInput.value,
        coordinates: state.points,
        distanceKm: state.distance / 1000,
        durationSec: Math.round(state.elapsed),
      })
      resetSessionHud()
    }
    closeSaveModal()
    showToast(saved ? '✅ تم حفظ المسار' : '⚠️ تعذر حفظ المسار')
  })

  discardTrackBtn.addEventListener('click', () => {
    const wasImport = !!pendingImport
    pendingImport = null
    closeSaveModal()
    if (wasImport) {
      // مسح معاينة الاستيراد من خارطة المسارات
      if (window.__TRACKS_UI__ && typeof window.__TRACKS_UI__.clearGpxPreview === 'function') {
        window.__TRACKS_UI__.clearGpxPreview()
      }
    } else {
      clearPolyline()
    }
    resetSessionHud()
    showToast('تم تجاهل المسار')
  })

  // Enter = حفظ · Escape = تجاهل · النقر خارج المودال = تجاهل
  trackNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveTrackBtn.click()
  })
  saveModal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') discardTrackBtn.click()
  })
  saveModal.addEventListener('click', (e) => {
    if (e.target === saveModal) discardTrackBtn.click()
  })

  /* ---------- الأحداث ---------- */
  recordBtn.addEventListener('click', () => {
    if (state.recording) stop()
    else start()
  })

  /* ---------- موقع من افتتاح التطبيق أو زر 🎯 (map.locate) ----------
     app.js يستدعي map.locate ويرسل desert:located — نرسم هنا البَك
     حتى بدون تسجيل: نقطة نيون نابضة + دائرة دقة */
  window.addEventListener('desert:located', (e) => {
    const d = e.detail || {}
    if (!isFinite(d.lat) || !isFinite(d.lng)) return
    state.lastKnown = {
      lat: d.lat,
      lng: d.lng,
      heading: null,
      speedKmh: 0,
      accuracy: d.accuracy || 25,
      ts: Date.now(),
    }
    updateLocationMarker()
    updateAccuracyCircle(d.lat, d.lng, state.lastKnown.accuracy)
  })

  /* ---------- زر إعادة التمركز (🎯) — map.locate مع تمركز وتكبير ---------- */
  const locateBtn = document.getElementById('locateBtn')
  locateBtn.disabled = false
  locateBtn.title = 'إعادة التمركز على موقعي'
  locateBtn.addEventListener('click', () => {
    if (!navigator.geolocation) return

    // إن وُجد آخر موقع معروف — نعيد التمركز عليه فوراً
    if (state.lastKnown) {
      map.setView([state.lastKnown.lat, state.lastKnown.lng], Math.max(map.getZoom(), 16))
    }

    // locate مع setView + maxZoom 16 — يحدّث البَك والدائرة عبر desert:located
    map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true, timeout: 10000 })
  })

  /* ---------- المراقبة المستمرة (تبدأ مع التطبيق — البَك حي دائماً) ----------
     map.locate (مرة واحدة عند الافتتاح) يعطي التمركز الأول،
     و watchPosition الدائم يبقي الموقع يُحدَّث في الخلفية لحظياً */
  if (navigator.geolocation) {
    state.watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000,
    })
  }

  /* ---------- كشف للاختبار والمراحل القادمة ---------- */
  // محاكاة إشارة GPS (للاختبار): السرعة بالكيلومتر/س
  function simulateFix({ lat, lng, speed = 0, heading = null, accuracy = 10 }) {
    onPosition({
      coords: {
        latitude: lat,
        longitude: lng,
        speed: speed / 3.6,
        heading: heading === null || heading === undefined ? null : heading,
        accuracy,
        timestamp: Date.now(),
      },
    })
  }

  window.__TRACKER__ = state
  window.__TRACKER_API__ = {
    start,
    stop,
    acquireWakeLock,
    releaseWakeLock,
    openImportSaveModal,
    simulateFix,
  }
})()
