/* ═══════════════════════════════════════════════════════════════
   خارطة البر — المنطق الرئيسي (المرحلة 1: الأساس ومحرك الخريطة)
   Leaflet + 3 طبقات أساسية + مبدّل طبقات عائم
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict'

  /* ---------- الإحداثيات والضبط ---------- */
  const RIYADH = [24.7136, 46.6753]
  const DEFAULT_ZOOM = 12
  const MAX_ZOOM = 19

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

  /* ---------- الطبقات الأساسية الثلاث ---------- */
  const layers = {
    satellite: L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: 'Tiles © Esri — Esri, Maxar, Earthstar Geographics',
      }
    ),
    terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxNativeZoom: 17, // OpenTopoMap ينتهي عند 17 — يكبر بدل ما يختفي
      maxZoom: 19,
      subdomains: 'abc',
      attribution:
        'Map data © OpenStreetMap contributors, SRTM | Style: © OpenTopoMap (CC-BY-SA)',
    }),
    night: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
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

  // اختيار طبقة من الراديو
  radios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) switchLayer(radio.value)
    })
  })

  // إغلاق اللوحة عند اللمس خارجها
  map.on('click', () => setPanel(false))

  /* ---------- تصحيح مقياس الشاشة (لفائف عالية الدقة) ---------- */
  map.attributionControl.setPrefix('')

  /* ---------- كشف جاهزية الخريطة (للاختبار والمراحل القادمة) ---------- */
  window.__MAP_READY__ = true
  window.__MAP__ = map
})()
