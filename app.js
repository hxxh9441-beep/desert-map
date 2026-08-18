/* ═══════════════════════════════════════════════════════════════
   خارطة البر — المنطق الرئيسي (المرحلة 1 + إعادة التصميم)
   Leaflet + 5 طبقات (قمر صناعي/هجين/شوارع/تضاريس/ليلي) + تحديد الموقع
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict'

  /* ---------- الإحداثيات والضبط ---------- */
  const RIYADH = [24.7136, 46.6753]
  const DEFAULT_ZOOM = 12
  const MAX_ZOOM = 21 // زوم عميق — البلاطات تتمدد بدل أخطاء 404

  /* ---------- تهيئة الخريطة ---------- */
  const map = L.map('map', {
    center: RIYADH,
    zoom: DEFAULT_ZOOM,
    maxZoom: MAX_ZOOM,
    zoomControl: false, // نضيف تحكماً مخصصاً في الأسفل
    attributionControl: true,
  })

  // تحكم تكبير مخصص — أسفل اليسار بعيداً عن الأزرار العائمة
  L.control.zoom({ position: 'bottomleft' }).addTo(map)

  /* ---------- الطبقات الخمس ----------
     maxNativeZoom: حد البلاطات الأصلي — ما بعده تتمدد البلاطات (بدون 404)
     maxZoom: 21 عبر الجميع */
  const layers = {
    // قمر صناعي — Esri World Imagery
    satellite: L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxNativeZoom: 19,
        maxZoom: MAX_ZOOM,
        attribution: 'Tiles © Esri — Esri, Maxar, Earthstar Geographics',
      }
    ),
    // هجين — صورة Esri + طبقة أسماء المدن/الحدود فوقها (أسماء محلية/عربية)
    hybrid: L.layerGroup([
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxNativeZoom: 19,
          maxZoom: MAX_ZOOM,
          attribution: 'Tiles © Esri',
        }
      ),
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          maxNativeZoom: 18,
          maxZoom: MAX_ZOOM,
          opacity: 0.95,
          attribution: 'Labels © Esri',
        }
      ),
    ]),
    // شوارع — Carto Voyager (أسماء أماكن عربية واضحة)
    streets: L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      {
        maxNativeZoom: 20,
        maxZoom: MAX_ZOOM,
        subdomains: 'abcd',
        attribution: '© OpenStreetMap contributors © CARTO',
      }
    ),
    // تضاريس — OpenTopoMap (ينتهي عند 17 — يتمدد بعده)
    terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxNativeZoom: 17,
      maxZoom: MAX_ZOOM,
      subdomains: 'abc',
      attribution:
        'Map data © OpenStreetMap contributors, SRTM | Style: © OpenTopoMap (CC-BY-SA)',
    }),
    // ليلي — Carto Dark Matter
    night: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxNativeZoom: 20,
      maxZoom: MAX_ZOOM,
      subdomains: 'abcd',
      attribution: '© OpenStreetMap contributors © CARTO',
    }),
  }

  // الافتراضي: القمر الصناعي (الأفضل للطرق الوعرة والصحاري)
  layers.satellite.addTo(map)

  /* ---------- مبدّل الطبقات ---------- */
  const layerPanel = document.getElementById('layerPanel')
  const layersBtn = document.getElementById('layersBtn')
  const radios = document.querySelectorAll('input[name="baseLayer"]')

  function switchLayer(name) {
    if (!layers[name]) return
    Object.entries(layers).forEach(([key, layer]) => {
      if (key === name) {
        if (!map.hasLayer(layer)) layer.addTo(map)
      } else if (map.hasLayer(layer)) {
        map.removeLayer(layer)
      }
    })
  }

  function setPanel(open) {
    layerPanel.classList.toggle('open', open)
    layersBtn.setAttribute('aria-expanded', String(open))
  }

  // فتح/إغلاق اللوحة
  layersBtn.addEventListener('click', () => {
    setPanel(!layerPanel.classList.contains('open'))
  })

  // اختيار طبقة من الراديو — يُغلق الـ bottom sheet فور الاختيار
  radios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        switchLayer(radio.value)
        setPanel(false)
      }
    })
  })

  // إغلاق اللوحة عند اللمس خارجها (على الخريطة أو أي مكان آخر)
  map.on('click', () => setPanel(false))
  document.addEventListener('click', (e) => {
    if (!layerPanel.contains(e.target) && !layersBtn.contains(e.target)) {
      setPanel(false)
    }
  })

  /* ---------- تصحيح مقياس الشاشة (لفائف عالية الدقة) ---------- */
  map.attributionControl.setPrefix('')

  /* ---------- مؤشر الموقع عند الافتتاح / إعادة التمركز ----------
     map.locate يجلب الموقع ويتمركز — والماركر الزرقاء يرسمها tracker.js
     (مالك الماركر الموحد: نقطة نابضة + دائرة دقة) */
  function onLocated(e) {
    window.__LOCATE__ = { lat: e.lat, lng: e.lng, accuracy: e.accuracy || 25 }
    window.dispatchEvent(new CustomEvent('desert:located', { detail: window.__LOCATE__ }))
  }

  function onLocateError() {
    // لا نزعج المستخدم — البساطة
  }

  // تحديد الموقع عند فتح التطبيق (setView + maxZoom 16)
  if (navigator.geolocation) {
    map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true, timeout: 10000 })
    map.on('locationfound', onLocated)
    map.on('locationerror', onLocateError)
  }

  /* ---------- كشف جاهزية الخريطة (للاختبار والمراحل القادمة) ---------- */
  window.__MAP_READY__ = true
  window.__MAP__ = map
  window.__LAYERS__ = layers
})()
