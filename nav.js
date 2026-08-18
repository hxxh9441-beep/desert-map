/* ═══════════════════════════════════════════════════════════════
   خارطة البر — ناقل التوجيه المباشر + الإحداثيات الذكية (المرحلة 6)
   خط توجيه متقطع · شريط الهدف (اسم/مسافة/اتجاه) · بحث إحداثيات · مشاركة موقعي
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict'

  const map = window.__MAP__
  const TRACKER = window.__TRACKER__

  /* ---------- عناصر الواجهة ---------- */
  const targetHud = document.getElementById('targetHud')
  const targetName = document.getElementById('targetName')
  const targetDist = document.getElementById('targetDist')
  const targetBearing = document.getElementById('targetBearing')
  const clearTargetBtn = document.getElementById('clearTargetBtn')
  const coordInput = document.getElementById('coordInput')
  const coordGoBtn = document.getElementById('coordGoBtn')
  const coordShareBtn = document.getElementById('coordShareBtn')
  const coordHint = document.getElementById('coordHint')

  /* ---------- حالة الهدف ---------- */
  const nav = {
    target: null, // {name, lat, lng}
    line: null,
    marker: null,
    interval: null,
  }

  // مؤشر الهدف على الخريطة
  const TARGET_ICON = L.divIcon({
    className: 'loc-marker-wrap',
    html: `<div class="target-marker">🎯</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  })

  // مؤقت مؤقت (بحث إحداثيات / مشاركة موقع)
  let tempMarker = null
  const TEMP_ICON = L.divIcon({
    className: 'loc-marker-wrap',
    html: `<div class="temp-marker"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })

  function dropTempMarker(lat, lng) {
    if (tempMarker) map.removeLayer(tempMarker)
    tempMarker = L.marker([lat, lng], { icon: TEMP_ICON, zIndexOffset: 900 }).addTo(map)
    return tempMarker
  }

  /* ---------- التحديث الحي (من موقع GPS أو مركز الخريطة) ---------- */
  function origin() {
    if (TRACKER.lastKnown) return [TRACKER.lastKnown.lat, TRACKER.lastKnown.lng]
    const c = map.getCenter()
    return [c.lat, c.lng]
  }

  function updateTarget() {
    if (!nav.target) return
    const from = origin()
    const to = [nav.target.lat, nav.target.lng]

    // الخط المتقطع من الموقع إلى الهدف
    if (!nav.line) {
      nav.line = L.polyline([from, to], {
        color: '#FBBF24',
        weight: 3,
        opacity: 0.95,
        dashArray: '10 10',
        lineCap: 'round',
      }).addTo(map)
    } else {
      nav.line.setLatLngs([from, to])
    }

    // مؤشر الهدف
    if (!nav.marker) {
      nav.marker = L.marker(to, { icon: TARGET_ICON, zIndexOffset: 1100 }).addTo(map)
    } else {
      nav.marker.setLatLng(to)
    }

    // شريط الهدف
    const dist = Utils.haversine(from, to)
    const brg = Utils.bearing(from, to)
    targetName.textContent = nav.target.name
    targetDist.textContent = Utils.formatDistance(dist)
    targetBearing.textContent = `${Math.round(brg)}° ${Utils.cardinal(brg)}`
    targetHud.classList.add('open')
  }

  /* ---------- بدء/إلغاء التوجيه ---------- */
  function navigateTo(name, lat, lng) {
    clearTarget(false)
    nav.target = { name, lat, lng }
    updateTarget()
    // تحديث مستمر كل ثانية (الخط يتبع حركتك)
    nav.interval = setInterval(updateTarget, 1000)
  }

  function clearTarget(showToastMsg = true) {
    nav.target = null
    if (nav.line) {
      map.removeLayer(nav.line)
      nav.line = null
    }
    if (nav.marker) {
      map.removeLayer(nav.marker)
      nav.marker = null
    }
    if (nav.interval) {
      clearInterval(nav.interval)
      nav.interval = null
    }
    targetHud.classList.remove('open')
    if (showToastMsg) showToast('تم إلغاء الهدف')
  }

  clearTargetBtn.addEventListener('click', () => clearTarget())

  /* ---------- البحث: إحداثيات أو أماكن (Nominatim) ---------- */
  const searchToggleBtn = document.getElementById('searchToggleBtn')
  const searchWrap = document.getElementById('searchWrap')
  const searchCloseBtn = document.getElementById('searchCloseBtn')
  const searchResults = document.getElementById('searchResults')

  // طي/توسيع شريط البحث
  function openSearch() {
    searchWrap.classList.remove('hidden')
    searchToggleBtn.classList.add('hidden')
    setTimeout(() => coordInput.focus(), 60)
  }
  function closeSearch() {
    searchWrap.classList.add('hidden')
    searchToggleBtn.classList.remove('hidden')
    hideResults()
    coordHint.classList.add('hidden')
  }
  searchToggleBtn.addEventListener('click', openSearch)
  searchCloseBtn.addEventListener('click', closeSearch)

  function hideResults() {
    searchResults.classList.add('hidden')
    searchResults.innerHTML = ''
  }

  // الانتقال لمكان + ماركر مؤقت
  function flyToPlace(lat, lng, name, zoom) {
    map.setView([lat, lng], Math.max(map.getZoom(), zoom || 16))
    dropTempMarker(lat, lng)
    const popup = L.popup({ closeButton: true, offset: [0, -12] })
      .setLatLng([lat, lng])
      .setContent(
        `<div class="poi-popup">
          <p class="poi-popup-title">📍 ${name}</p>
          <p class="poi-popup-sub">${Utils.toDMS(lat, lng)}</p>
          <div class="poi-popup-actions">
            <button class="poi-popup-btn" data-nav-target="1" data-name="${encodeURIComponent(name)}" data-lat="${lat}" data-lng="${lng}">🧭 التوجه للهدف</button>
          </div>
        </div>`
      )
      .openOn(map)
  }

  // بحث نصي عبر Nominatim (أسماء مدن/أماكن — يدعم العربية)
  async function nominatimSearch(q) {
    try {
      const url =
        'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=ar&q=' +
        encodeURIComponent(q)
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) return []
      const data = await res.json()
      return data.map((r) => ({
        name: r.display_name || r.name || q,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        type: r.type || '',
      }))
    } catch {
      return []
    }
  }

  function searchCoords() {
    const val = coordInput.value.trim()
    if (!val) {
      coordHint.textContent = 'اكتب اسم مكان أو إحداثيات…'
      coordHint.classList.remove('hidden')
      return
    }

    // 1) محاولة الإحداثيات أولاً (DD/DMS/DDM)
    const c = Utils.parseCoords(val)
    if (c) {
      coordHint.classList.add('hidden')
      hideResults()
      flyToPlace(c.lat, c.lng, 'إحداثيات مخصصة')
      coordInput.value = ''
      return
    }

    // 2) بحث نصي — Nominatim
    coordHint.classList.add('hidden')
    nominatimSearch(val).then((results) => {
      if (results.length === 0) {
        coordHint.textContent = '⚠️ ما لقينا المكان — جرّب: الرياض أو 24.7136, 46.6753'
        coordHint.classList.remove('hidden')
        hideResults()
        return
      }
      // قائمة النتائج
      searchResults.innerHTML = results
        .map(
          (r, i) => `
          <button class="search-result-item" data-idx="${i}" type="button">
            <span class="search-result-icon">${r.type === 'city' || r.type === 'town' || r.type === 'village' ? '🏙️' : r.type === 'water' || r.type === 'river' ? '💧' : r.type === 'mountain' || r.type === 'peak' ? '⛰️' : '📍'}</span>
            <span class="min-w-0 flex-1 text-right">
              <span class="block truncate text-sm font-semibold text-white">${r.name.split(',').slice(0, 2).join('،')}</span>
              <span class="block truncate text-[11px] text-slate-400">${Utils.toDMS(r.lat, r.lng)}</span>
            </span>
          </button>`
        )
        .join('')
      searchResults.classList.remove('hidden')
      // النقر على نتيجة
      searchResults.querySelectorAll('.search-result-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          const r = results[parseInt(btn.dataset.idx, 10)]
          if (!r) return
          hideResults()
          flyToPlace(r.lat, r.lng, r.name.split(',')[0])
          coordInput.value = ''
          closeSearch()
        })
      })
    })
  }

  coordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchCoords()
  })

  // إغلاق النتائج عند النقر خارجها
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#searchResults') && !e.target.closest('#searchWrap')) {
      hideResults()
    }
  })

  /* ---------- مشاركة موقعي ---------- */
  coordShareBtn.addEventListener('click', async () => {
    let pos = TRACKER.lastKnown
    if (!pos && navigator.geolocation) {
      try {
        pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, {
            enableHighAccuracy: true,
            timeout: 8000,
          })
        ).then((p) => ({ lat: p.coords.latitude, lng: p.coords.longitude, heading: p.coords.heading }))
      } catch {
        showToast('⚠️ تعذر تحديد موقعك — تأكد من تفعيل GPS')
        return
      }
    }
    if (!pos) {
      showToast('⚠️ لا يوجد موقع معروف بعد')
      return
    }
    const lat = pos.lat
    const lng = pos.lng
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`
    const appUrl = `${location.origin}${location.pathname}#loc=${lat.toFixed(6)};${lng.toFixed(6)}`
    const text = `📍 موقعي الحالي (خارطة البر)
الإحداثيات: ${lat.toFixed(6)}, ${lng.toFixed(6)}
DMS: ${Utils.toDMS(lat, lng)}
خرائط جوجل: ${mapsUrl}
رابط التطبيق: ${appUrl}`

    const ok = window.Share ? await window.Share.copyText(text) : false
    showToast(ok ? '📋 تم نسخ الموقع — DD + DMS + روابط' : '⚠️ تعذر النسخ')
  })

  /* ---------- تفويض أحداث التوجيه (من نوافذ POIs المنبثقة) ---------- */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-nav-target]')
    if (!btn) return
    const name = decodeURIComponent(btn.dataset.name || 'الهدف')
    const lat = parseFloat(btn.dataset.lat)
    const lng = parseFloat(btn.dataset.lng)
    if (!isFinite(lat) || !isFinite(lng)) return
    map.closePopup()
    navigateTo(name, lat, lng)
  })

  /* ---------- استيراد موقع مشارَك (#loc=lat;lng) ---------- */
  function handleLocHash() {
    const hash = window.location.hash || ''
    if (!hash.startsWith('#loc=')) return
    const parts = hash.slice(5).split(';')
    const lat = parseFloat(parts[0])
    const lng = parseFloat(parts[1])
    if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return
    map.setView([lat, lng], Math.max(map.getZoom(), 16))
    dropTempMarker(lat, lng)
    showToast('📍 موقع مشارَك — لقد تم تحميله')
    history.replaceState(null, '', location.pathname + location.search)
  }
  handleLocHash()

  /* ---------- كشف للاختبار ---------- */
  window.__NAV__ = {
    navigateTo,
    clearTarget,
    dropTempMarker,
    searchCoords,
    get state() {
      return nav.target
    },
  }
})()
