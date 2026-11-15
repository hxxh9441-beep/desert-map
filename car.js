/* ═══════════════════════════════════════════════════════════════
   خارطة البر — موقع السيارة + العودة لنقطة البداية
   زر 🚗: ضغطة واحدة تحفظ موقعك كموقع السيارة، ثم تعرض خيارات
   التوجه إليها. أثناء التسجيل يتيح أيضاً العودة لنقطة بداية المسار.
   التخزين: localStorage · wild_car
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict'

  const KEY = 'wild_car'
  const map = window.__MAP__
  const btn = document.getElementById('carBtn')
  if (!map || !btn) return

  const toast = (m) => window.showToast && window.showToast(m)
  let marker = null

  /* ---------- التخزين ---------- */
  function load() {
    try {
      const c = JSON.parse(localStorage.getItem(KEY))
      return c && isFinite(c.lat) && isFinite(c.lng) ? c : null
    } catch {
      return null
    }
  }
  function save(c) {
    try {
      if (c) localStorage.setItem(KEY, JSON.stringify(c))
      else localStorage.removeItem(KEY)
      return true
    } catch {
      return false
    }
  }

  /* ---------- الموقع الحالي ---------- */
  function here() {
    const k = window.__TRACKER__ && window.__TRACKER__.lastKnown
    if (k) return { lat: k.lat, lng: k.lng }
    const l = window.__LOCATE__
    return l ? { lat: l.lat, lng: l.lng } : null
  }

  /* ---------- المؤشر على الخريطة ---------- */
  const ICON = L.divIcon({
    className: 'loc-marker-wrap',
    html: '<div class="target-marker">🚗</div>',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  })

  function drawMarker() {
    if (marker) {
      map.removeLayer(marker)
      marker = null
    }
    const c = load()
    if (!c) return
    marker = L.marker([c.lat, c.lng], { icon: ICON, zIndexOffset: 1000 }).addTo(map)
    marker.on('click', openSheet)
  }

  /* ---------- نص الوقت ---------- */
  function ago(iso) {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
    if (mins < 1) return 'الآن'
    if (mins < 60) return `قبل ${mins} دقيقة`
    const h = Math.floor(mins / 60)
    return h < 24 ? `قبل ${h} ساعة` : `قبل ${Math.floor(h / 24)} يوم`
  }

  /* ---------- البطاقة ---------- */
  function navBtn(label, name, lat, lng) {
    return `<button class="pin-sheet-btn pin-sheet-nav" data-nav-target="1" data-name="${encodeURIComponent(name)}" data-lat="${lat}" data-lng="${lng}" type="button">${label}</button>`
  }

  function openSheet() {
    const c = load()
    const pos = here()
    const pts = (window.__TRACKER__ && window.__TRACKER__.points) || []
    const start = window.__TRACKER__ && window.__TRACKER__.recording && pts.length ? pts[0] : null

    let actions = ''
    let sub = 'لم تحفظ موقع سيارتك بعد'
    if (c) {
      actions += navBtn('🧭 التوجه للسيارة', 'سيارتي', c.lat, c.lng)
      sub = `حُفظ ${ago(c.createdAt)}`
      if (pos) sub += ` · ${Utils.formatDistance(Utils.haversine([pos.lat, pos.lng], [c.lat, c.lng]))} منك`
    }
    if (start) actions += navBtn('↩️ العودة لنقطة البداية', 'نقطة البداية', start[0], start[1])
    actions += `<div class="pin-sheet-row2">
      <button class="pin-sheet-btn pin-sheet-save" data-car-set type="button">${c ? '📍 تحديث لموقعي' : '💾 احفظ موقعي كسيارة'}</button>
      ${c ? '<button class="pin-sheet-btn pin-sheet-del" data-car-del type="button">🗑️ حذف</button>' : ''}
    </div>`

    window.__PIN_SHEET__.open({
      icon: '🚗',
      title: 'سيارتي',
      sub,
      dms: c ? Utils.toDMS(c.lat, c.lng) : '',
      dd: c ? `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}` : '',
      actions,
    })
  }

  /* ---------- الإجراءات ---------- */
  function setHere() {
    const pos = here()
    if (!pos) {
      toast('⚠️ لم يتحدد موقعك بعد — فعّل GPS وانتظر لحظات')
      return false
    }
    const ok = save({ lat: pos.lat, lng: pos.lng, createdAt: new Date().toISOString() })
    if (!ok) {
      toast('⚠️ تعذر حفظ الموقع')
      return false
    }
    drawMarker()
    toast('🚗 تم حفظ موقع السيارة')
    return true
  }

  btn.addEventListener('click', () => {
    const recording = window.__TRACKER__ && window.__TRACKER__.recording
    // أول ضغطة بدون تسجيل: احفظ فوراً. غير ذلك: افتح الخيارات
    if (!load() && !recording) setHere()
    else openSheet()
  })

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-car-set]')) {
      window.__PIN_SHEET__.close()
      setHere()
    } else if (e.target.closest('[data-car-del]')) {
      window.__PIN_SHEET__.close()
      save(null)
      drawMarker()
      toast('🗑️ تم حذف موقع السيارة')
    }
  })

  drawMarker()
  window.__CAR__ = { load, setHere, openSheet }
})()
