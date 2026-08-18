/* ═══════════════════════════════════════════════════════════════
   خارطة البر — محرك التتبع والتسجيل الحي (المرحلة 2)
   watchPosition + فلتر ضوضاء (10م) + خط حي + HUD
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict'

  const MIN_DISTANCE_M = 10 // فلتر الضوضاء: نهمل أي إحداثي أقرب من 10م
  const MAX_ACCURACY_M = 25 // حماية الدقة: نهمل أي إشارة أدق من 25م
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

  /* ---------- مؤشر الموقع الحي ---------- */
  let locationMarker = null
  const LOC_ICON = L.divIcon({
    className: 'loc-marker-wrap',
    html: `
      <div class="loc-marker">
        <svg class="loc-arrow" viewBox="0 0 40 40" width="40" height="40">
          <circle cx="20" cy="20" r="17" fill="rgba(0,229,255,0.12)" stroke="#00E5FF" stroke-width="2"/>
          <path d="M20 5 L27 25 L20 20.5 L13 25 Z" fill="#00E5FF" stroke="#062a33" stroke-width="1"/>
        </svg>
        <span class="loc-ping" aria-hidden="true"></span>
      </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
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
    lastKnown: null, // آخر موقع معروف {lat,lng,heading,ts} — لإعادة التمركز
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

  /* ---------- مؤشر الموقع الحي ---------- */
  let accuracyCircle = null // دائرة دقة GPS

  function updateAccuracyCircle(lat, lng, accuracy) {
    const r = Math.max(accuracy || 25, 10)
    if (!accuracyCircle) {
      accuracyCircle = L.circle([lat, lng], {
        radius: r,
        color: '#22d3ee',
        weight: 1,
        fillColor: '#22d3ee',
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(map)
    } else {
      accuracyCircle.setLatLng([lat, lng])
      accuracyCircle.setRadius(r)
    }
  }

  function updateLocationMarker() {
    if (!state.lastKnown) return
    const { lat, lng, heading } = state.lastKnown
    if (!locationMarker) {
      locationMarker = L.marker([lat, lng], { icon: LOC_ICON, zIndexOffset: 1000 }).addTo(map)
    } else {
      locationMarker.setLatLng([lat, lng])
    }
    const el = locationMarker.getElement()
    if (!el) return
    const hasHeading = typeof heading === 'number' && isFinite(heading)
    el.classList.toggle('has-heading', hasHeading)
    if (hasHeading) {
      const arrow = el.querySelector('.loc-arrow')
      if (arrow) arrow.style.transform = `rotate(${heading}deg)`
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

    // حماية الدقة: نهمل التحديث بالكامل إذا كانت الدقة أسوأ من 25م
    if (typeof accuracy === 'number' && accuracy > MAX_ACCURACY_M) return

    // آخر موقع معروف (للمؤشر الحي وإعادة التمركز)
    state.lastKnown = {
      lat: latitude,
      lng: longitude,
      heading: typeof heading === 'number' && isFinite(heading) ? heading : null,
      ts: now,
    }
    updateLocationMarker()
    if (typeof accuracy === 'number') updateAccuracyCircle(latitude, longitude, accuracy)

    // أول إحداثي: نقبله دائماً ونتمركز عليه
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
    if (typeof speed === 'number' && speed >= 0 && isFinite(speed)) {
      state.speed = speed * 3.6 // م/ث → كم/س
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

    if (state.error) {
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
    // جلسة جديدة
    state.points = []
    state.distance = 0
    state.speed = 0
    state.elapsed = 0
    state.error = null
    state.startTime = Date.now()
    state.lastFixTime = 0
    state.lastKnown = null
    clearPolyline()
    removeLocationMarker()
    closeSaveModal()
    gpsError.classList.add('hidden')
    renderHud()

    state.recording = true
    state.watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000,
    })
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
    if (state.watchId !== null) {
      navigator.geolocation.clearWatch(state.watchId)
      state.watchId = null
    }
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
     app.js يستدعي map.locate ويرسل desert:located — نرسم هنا الماركر
     حتى بدون تسجيل: نقطة نيون نابضة + دائرة دقة */
  window.addEventListener('desert:located', (e) => {
    const d = e.detail || {}
    if (!isFinite(d.lat) || !isFinite(d.lng)) return
    state.lastKnown = { lat: d.lat, lng: d.lng, heading: null, ts: Date.now() }
    updateLocationMarker()
    updateAccuracyCircle(d.lat, d.lng, d.accuracy)
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

    // locate مع setView + maxZoom 16 — يحدّث الماركر والدائرة عبر desert:located
    map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true, timeout: 10000 })
    setTimeout(() => {
      locateBtn.disabled = false
    }, 12000)
  })

  /* ---------- كشف للاختبار والمراحل القادمة ---------- */
  window.__TRACKER__ = state
  window.__TRACKER_API__ = {
    start,
    stop,
    acquireWakeLock,
    releaseWakeLock,
    openImportSaveModal,
  }
})()
