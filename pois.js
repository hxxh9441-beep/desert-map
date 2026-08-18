/* ═══════════════════════════════════════════════════════════════
   خارطة البر — نظام نقاط الاهتمام + دبابيس الطرق (المرحلة 6 + الدبوس)
   ضغطة طويلة / زر أيمن = دبوس مؤقت (كهرماني) + بطاقة إجراءات:
   توجّه إلى هنا · حفظ النقطة (مودال POI → wild_pois) · مشاركة
   + نقاط جاهزة (pois_data.json) + طبقة قابلة للتبديل
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict'

  const map = window.__MAP__

  /* ---------- تعريف الأنواع ---------- */
  const POI_TYPES = {
    camp: { icon: '⛺', color: '#F59E0B', label: 'مخيم' },
    water: { icon: '💧', color: '#06B6D4', label: 'ماء/بئر' },
    danger: { icon: '⚠️', color: '#EF4444', label: 'خطر/وعر' },
    landmark: { icon: '📍', color: '#8B5CF6', label: 'معلم' },
  }

  // فئات النقاط الجاهزة (معالم البر — الرياض · القصيم · حائل)
  const POI_CATS = {
    rawda: { icon: '🌿', color: '#22C55E', label: 'روضة' },
    fiyadh: { icon: '🌿', color: '#84CC16', label: 'فياض' },
    well: { icon: '💧', color: '#06B6D4', label: 'بئر/منهل' },
    desert: { icon: '🏜️', color: '#F59E0B', label: 'نفود/صحراء' },
    camp: { icon: '⛺', color: '#8B5CF6', label: 'مخيم' },
    mountain: { icon: '⛰️', color: '#64748B', label: 'جبل/معلم' },
  }

  /* ---------- عناصر الواجهة ---------- */
  const poiModal = document.getElementById('poiModal')
  const poiTypeGrid = document.getElementById('poiTypeGrid')
  const poiNameInput = document.getElementById('poiName')
  const poiNoteInput = document.getElementById('poiNote')
  const poiSaveBtn = document.getElementById('poiSaveBtn')
  const poiCancelBtn = document.getElementById('poiCancelBtn')
  const poisToggle = document.getElementById('poisToggle')

  /* ---------- الحالة ---------- */
  let customGroup = null // L.LayerGroup للنقاط المخصصة
  let preloadedGroup = null // L.LayerGroup للنقاط الجاهزة
  let poiPickLatLng = null // مكان الضغطة الطويلة
  let selectedType = 'landmark'

  /* ---------- الدبوس المؤقت (Pin Drop) ---------- */
  let pinMarker = null
  let pinLatLng = null

  const PIN_ICON = L.divIcon({
    className: 'poi-marker-wrap',
    html: `
      <div class="pin-drop">
        <svg viewBox="0 0 40 48" width="40" height="48" aria-hidden="true">
          <path d="M20 1 C10.5 1 3 8.5 3 18 C3 30.5 20 47 20 47 C20 47 37 30.5 37 18 C37 8.5 29.5 1 20 1 Z"
            fill="#F59E0B" stroke="#ffffff" stroke-width="2"/>
          <circle cx="20" cy="18" r="7.5" fill="#ffffff"/>
        </svg>
      </div>`,
    iconSize: [40, 48],
    iconAnchor: [20, 44], // سن الدبوس عند نقطة اللمس
    popupAnchor: [0, -40],
  })

  // إسقاط دبوس مؤقت عند موقع ما + فتح بطاقته
  function dropPin(latlng) {
    if (pinMarker) map.removeLayer(pinMarker)
    pinLatLng = latlng
    pinMarker = L.marker([latlng.lat, latlng.lng], { icon: PIN_ICON, zIndexOffset: 950 }).addTo(map)
    openPinCard(latlng)
  }

  function removePin() {
    if (pinMarker) {
      map.removeLayer(pinMarker)
      pinMarker = null
    }
    pinLatLng = null
  }

  // بطاقة الدبوس: الإحداثيات DMS + DD وثلاثة إجراءات
  function openPinCard(latlng) {
    const lat = latlng.lat
    const lng = latlng.lng
    const popup = L.popup({ closeButton: true, offset: [0, -8], className: 'pin-popup-shell' })
      .setLatLng([lat, lng])
      .setContent(`
        <div class="pin-popup">
          <div class="pin-popup-head">
            <p class="pin-popup-title">📍 نقطة مخصصة</p>
            <button class="pin-popup-x" data-pin-del type="button" aria-label="إزالة الدبوس">✕</button>
          </div>
          <p class="pin-popup-coord">${Utils.toDMS(lat, lng)}</p>
          <p class="pin-popup-coord pin-popup-dd">${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
          <div class="pin-popup-actions">
            <button class="pin-popup-btn pin-popup-nav" data-pin-nav type="button">🧭 توجّه إلى هنا</button>
            <button class="pin-popup-btn pin-popup-save" data-pin-save type="button">💾 حفظ النقطة</button>
            <button class="pin-popup-btn pin-popup-share" data-pin-share type="button">📤 مشاركة</button>
          </div>
        </div>`)
      .openOn(map)
  }

  // مشاركة إحداثيات الدبوس (DMS + DD + رابط التطبيق)
  async function sharePin(latlng) {
    const lat = latlng.lat
    const lng = latlng.lng
    const appUrl = `${location.origin}${location.pathname}#loc=${lat.toFixed(6)};${lng.toFixed(6)}`
    const text = `📍 نقطة مخصصة (خارطة البر)
DMS: ${Utils.toDMS(lat, lng)}
DD: ${lat.toFixed(6)}, ${lng.toFixed(6)}
رابط التطبيق: ${appUrl}`
    const ok = window.Share ? await window.Share.copyText(text) : false
    map.closePopup()
    showToast(ok ? '📋 تم نسخ الإحداثيات والرابط' : '⚠️ تعذر النسخ')
  }

  /* ---------- تفويض أزرار بطاقة الدبوس ---------- */
  document.addEventListener('click', (e) => {
    const navBtn = e.target.closest('[data-pin-nav]')
    if (navBtn) {
      map.closePopup()
      if (pinLatLng && window.__NAV__) {
        window.__NAV__.navigateTo('نقطة مخصصة', pinLatLng.lat, pinLatLng.lng)
      }
      return
    }
    const saveBtn = e.target.closest('[data-pin-save]')
    if (saveBtn) {
      map.closePopup()
      if (pinLatLng) openPoiPicker(pinLatLng)
      return
    }
    const shareBtn = e.target.closest('[data-pin-share]')
    if (shareBtn) {
      if (pinLatLng) sharePin(pinLatLng)
      return
    }
    const delBtn = e.target.closest('[data-pin-del]')
    if (delBtn) {
      map.closePopup()
      removePin()
    }
  })

  /* ---------- الأيقونات: دبوس SVG + شارة الفئة ---------- */
  function poiIcon(icon, color) {
    return L.divIcon({
      className: 'poi-marker-wrap',
      html: `<div class="poi-marker-svg" style="--poi-color:${color}">
        <svg viewBox="0 0 36 44" width="36" height="44" aria-hidden="true">
          <path d="M18 2 C10.5 2 4.5 8 4.5 16 C4.5 27 18 42 18 42 C18 42 31.5 27 31.5 16 C31.5 8 25.5 2 18 2 Z"
            fill="var(--poi-color)" stroke="#ffffff" stroke-width="1.5"/>
          <circle cx="18" cy="16" r="9" fill="#0d1526" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>
        </svg>
        <span class="poi-badge">${icon}</span>
      </div>`,
      iconSize: [36, 44],
      iconAnchor: [18, 40],
      popupAnchor: [0, -36],
    })
  }

  /* ---------- عرض النقاط المخصصة ---------- */
  function renderCustomPois() {
    if (customGroup) map.removeLayer(customGroup)
    customGroup = L.layerGroup().addTo(map)
    Store.getPois().forEach((p) => {
      const def = POI_TYPES[p.type] || POI_TYPES.landmark
      const m = L.marker([p.lat, p.lng], { icon: poiIcon(def.icon, def.color) })
        .bindPopup(
          `<div class="poi-popup">
            <p class="poi-popup-title">${def.icon} ${escapeHtml(p.name)}</p>
            ${p.note ? `<p class="poi-popup-note">${escapeHtml(p.note)}</p>` : ''}
            <p class="poi-popup-meta">${Utils.toDMS(p.lat, p.lng)}</p>
            <div class="poi-popup-actions">
              <button class="poi-popup-btn" data-nav-target="1" data-name="${encodeURIComponent(p.name)}" data-lat="${p.lat}" data-lng="${p.lng}">🧭 التوجه</button>
              <button class="poi-popup-btn poi-popup-del" data-poi-del="${p.id}">🗑️ حذف</button>
            </div>
          </div>`
        )
      m._poiId = p.id
      m._poiCustom = true
      customGroup.addLayer(m)
    })
  }

  /* ---------- عرض النقاط الجاهزة ---------- */
  function renderPreloadedPois(data) {
    if (preloadedGroup) map.removeLayer(preloadedGroup)
    preloadedGroup = L.layerGroup().addTo(map)
    ;(data.pois || []).forEach((p) => {
      const def = POI_CATS[p.cat] || POI_CATS.rawda
      const m = L.marker([p.lat, p.lng], { icon: poiIcon(def.icon, def.color) })
        .bindPopup(
          `<div class="poi-popup">
            <p class="poi-popup-title">${def.icon} ${escapeHtml(p.name)}</p>
            <p class="poi-popup-meta">${def.label} · ${Utils.toDMS(p.lat, p.lng)}</p>
            ${p.note ? `<p class="poi-popup-note">${escapeHtml(p.note)}</p>` : ''}
            <div class="poi-popup-actions">
              <button class="poi-popup-btn" data-nav-target="1" data-name="${encodeURIComponent(p.name)}" data-lat="${p.lat}" data-lng="${p.lng}">🧭 التوجه</button>
            </div>
          </div>`
        )
      m._poiId = `pre-${p.name}`
      m._poiCustom = false
      preloadedGroup.addLayer(m)
    })
  }

  function loadPreloaded() {
    fetch('desert_pois.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('network'))))
      .then((data) => renderPreloadedPois(data))
      .catch(() => {
        // بدون إنترنت — النقاط الجاهزة غير متاحة، نكتفي بالمخصصة
      })
  }

  /* ---------- إظهار/إخفاء طبقة النقاط ---------- */
  function togglePois(on) {
    if (customGroup) {
      if (on) map.addLayer(customGroup)
      else map.removeLayer(customGroup)
    }
    if (preloadedGroup) {
      if (on) map.addLayer(preloadedGroup)
      else map.removeLayer(preloadedGroup)
    }
  }

  poisToggle.addEventListener('change', () => togglePois(poisToggle.checked))

  /* ---------- مودال إضافة نقطة ---------- */
  function openPoiPicker(latlng) {
    poiPickLatLng = latlng
    selectedType = 'landmark'
    poiNameInput.value = ''
    poiNoteInput.value = ''
    poiModal.classList.add('open')
    updateTypeSelection()
    setTimeout(() => poiNameInput.focus(), 60)
  }

  function closePoiPicker() {
    poiModal.classList.remove('open')
    poiPickLatLng = null
  }

  function updateTypeSelection() {
    poiTypeGrid.querySelectorAll('.poi-type').forEach((b) => {
      b.classList.toggle('selected', b.dataset.type === selectedType)
    })
  }

  poiTypeGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.poi-type')
    if (!btn) return
    selectedType = btn.dataset.type
    updateTypeSelection()
  })

  function savePoi() {
    if (!poiPickLatLng) return
    const poi = Store.addPoi({
      name: poiNameInput.value,
      note: poiNoteInput.value,
      type: selectedType,
      lat: poiPickLatLng.lat,
      lng: poiPickLatLng.lng,
    })
    closePoiPicker()
    if (poi) {
      renderCustomPois()
      const def = POI_TYPES[poi.type] || POI_TYPES.landmark
      showToast(`${def.icon} تمت إضافة النقطة «${poi.name}»`)
    } else {
      showToast('⚠️ تعذر حفظ النقطة')
    }
  }

  poiSaveBtn.addEventListener('click', savePoi)
  poiCancelBtn.addEventListener('click', closePoiPicker)
  poiModal.addEventListener('click', (e) => {
    if (e.target === poiModal) closePoiPicker()
  })
  poiNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') savePoi()
  })
  poiModal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePoiPicker()
  })

  /* ---------- الضغطة الطويلة / الزر الأيمن → دبوس مؤقت ----------
     عند دوران الخريطة (وضع اتجاه السير) نصحّح النقطة الملموسة */
  function correctedLatLng(e) {
    if (!window.__ROTATE__ || Math.abs(window.__ROTATE__.currentDeg() % 360) < 1) return e.latlng
    const cp = map.mouseEventToContainerPoint(e.originalEvent)
    const real = window.__ROTATE__.unrotatePoint(cp)
    return map.containerPointToLatLng(real)
  }

  let pressTimer = null
  let pressLatLng = null

  function clearPress() {
    clearTimeout(pressTimer)
    pressTimer = null
    pressLatLng = null
  }

  map.on('mousedown touchstart', (e) => {
    if (e.target !== map) return
    const te = e.originalEvent
    if (te.type === 'touchstart' && te.touches && te.touches.length !== 1) return
    clearPress()
    pressLatLng = correctedLatLng(e)
    pressTimer = setTimeout(() => {
      dropPin(pressLatLng)
      clearPress()
    }, 600)
  })
  map.on('mousemove touchmove', clearPress)
  map.on('mouseup touchend', clearPress)
  map.on('contextmenu', (e) => {
    if (e.target !== map) return
    e.originalEvent.preventDefault()
    dropPin(correctedLatLng(e))
  })

  /* ---------- حذف نقطة مخصصة من النافذة المنبثقة ---------- */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-poi-del]')
    if (!btn) return
    const id = btn.dataset.poiDel
    Store.removePoi(id)
    map.closePopup()
    renderCustomPois()
    showToast('🗑️ تم حذف النقطة')
  })

  /* ---------- أدوات مساعدة ---------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[c])
  }

  /* ---------- التشغيل ---------- */
  renderCustomPois()
  loadPreloaded()

  /* ---------- كشف للاختبار ---------- */
  window.__POIS__ = {
    renderCustomPois,
    renderPreloadedPois,
    togglePois,
    openPoiPicker,
    savePoi,
    dropPin,
    removePin,
    POI_TYPES,
  }
})()
