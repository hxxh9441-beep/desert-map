/* ═══════════════════════════════════════════════════════════════
   خارطة البر — واجهة إدارة المسارات (المرحلة 3)
   قائمة المسارات المحفوظة: عرض على الخريطة · حذف · توست
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict'

  const map = window.__MAP__
  const tracksBtn = document.getElementById('tracksBtn')
  const tracksPanel = document.getElementById('tracksPanel')
  const tracksList = document.getElementById('tracksList')
  const tracksCount = document.getElementById('tracksCount')
  const layerPanel = document.getElementById('layerPanel')

  // المسارات المعروضة حالياً: [{ id, layer }]
  let viewed = []
  // معاينة مسار GPX مستورد
  let gpxPreviewLine = null

  /* ---------- توست (رسالة عابرة) ---------- */
  function showToast(msg) {
    let t = document.getElementById('toast')
    if (!t) {
      t = document.createElement('div')
      t.id = 'toast'
      t.className = 'toast'
      document.body.appendChild(t)
    }
    t.textContent = msg
    t.classList.add('show')
    clearTimeout(t._timer)
    t._timer = setTimeout(() => t.classList.remove('show'), 2400)
  }
  window.showToast = showToast

  /* ---------- أدوات عرض ---------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[c])
  }

  function fmtDate(iso) {
    const d = new Date(iso)
    if (isNaN(d)) return ''
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
  }

  /* ---------- عرض القائمة ---------- */
  function renderTracks() {
    const tracks = Store.getTracks()
    tracksCount.textContent = tracks.length ? `${tracks.length} مسار` : ''

    if (tracks.length === 0) {
      tracksList.innerHTML =
        '<p class="px-3 py-8 text-center text-xs text-slate-500">لا توجد مسارات محفوظة بعد</p>'
      return
    }

    tracksList.innerHTML = ''
    tracks.forEach((track) => {
      const item = document.createElement('div')
      item.className = 'track-item'
      item.dataset.id = track.id
      item.innerHTML = `
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-bold text-white">${escapeHtml(track.name)}</p>
          <p class="text-[11px] text-slate-400">
            ${track.distanceKm.toFixed(2)} كم · ${Utils.formatDuration(track.durationSec)} · ${fmtDate(track.createdAt)}
          </p>
        </div>
        <div class="flex gap-1 shrink-0">
          <button class="track-action" data-act="view" type="button" aria-label="عرض المسار">👁️</button>
          <button class="track-action" data-act="share" type="button" aria-label="مشاركة المسار">📤</button>
          <button class="track-action" data-act="del" type="button" aria-label="حذف المسار">🗑️</button>
        </div>`
      tracksList.appendChild(item)
    })
  }

  /* ---------- عرض مسار على الخريطة ---------- */
  function clearViewed() {
    viewed.forEach(({ layer }) => map.removeLayer(layer))
    viewed = []
  }

  function viewTrack(id) {
    const track = Store.getTrack(id)
    if (!track || !Array.isArray(track.coordinates) || track.coordinates.length === 0) return
    clearViewed()
    const line = L.polyline(track.coordinates, {
      color: '#00E5FF',
      weight: 4,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map)
    viewed.push({ id, layer: line })
    map.fitBounds(line.getBounds(), { padding: [48, 48] })
    setPanel(false)
  }

  /* ---------- حذف مسار ---------- */
  function deleteTrack(id) {
    Store.deleteTrack(id)
    // أزل الخط المعروض إن كان للمسار المحذوف
    viewed = viewed.filter(({ layer, id: vid }) => {
      if (vid === id) {
        map.removeLayer(layer)
        return false
      }
      return true
    })
    renderTracks()
    showToast('🗑️ تم حذف المسار')
  }

  /* ---------- مستورد GPX ---------- */
  const importGpxBtn = document.getElementById('importGpxBtn')
  const gpxFileInput = document.getElementById('gpxFileInput')

  function clearGpxPreview() {
    if (gpxPreviewLine) {
      map.removeLayer(gpxPreviewLine)
      gpxPreviewLine = null
    }
  }

  importGpxBtn.addEventListener('click', () => {
    if (window.__TRACKER__ && window.__TRACKER__.recording) {
      showToast('⏹️ أوقف التسجيل أولاً ثم استورد')
      return
    }
    gpxFileInput.value = ''
    gpxFileInput.click()
  })

  gpxFileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => importGpxText(String(reader.result || ''), file.name)
    reader.onerror = () => showToast('⚠️ تعذر قراءة الملف')
    reader.readAsText(file)
  })

  /**
   * تحليل نص GPX واستيراده: يرسم المسار ويفتح مودال الحفظ
   */
  function importGpxText(xml, filename) {
    let doc
    try {
      doc = new DOMParser().parseFromString(xml, 'application/xml')
    } catch {
      showToast('⚠️ ملف GPX غير صالح')
      return
    }
    if (doc.querySelector('parsererror')) {
      showToast('⚠️ ملف GPX غير صالح')
      return
    }

    // استخراج النقاط: trkpt ثم rtept كبديل
    let pts = [...doc.querySelectorAll('trkpt')].map((p) => [
      parseFloat(p.getAttribute('lat')),
      parseFloat(p.getAttribute('lon')),
    ])
    if (pts.length < 2) {
      pts = [...doc.querySelectorAll('rtept')].map((p) => [
        parseFloat(p.getAttribute('lat')),
        parseFloat(p.getAttribute('lon')),
      ])
    }
    if (pts.length < 2) {
      showToast('⚠️ لا توجد نقاط كافية في الملف')
      return
    }

    // التحقق من صحة الإحداثيات
    const valid = pts.every(
      ([la, lo]) =>
        isFinite(la) && isFinite(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180
    )
    if (!valid) {
      showToast('⚠️ إحداثيات غير صالحة في الملف')
      return
    }

    // الاسم: من الملف أو اسم الملف
    const nameEl = doc.querySelector('trk > name, metadata > name, rte > name')
    const name =
      (nameEl && nameEl.textContent.trim()) ||
      String(filename || 'مسار مستورد').replace(/\.gpx$/i, '').replace(/[-_]+/g, ' ').trim()

    // المسافة الكلية
    let dist = 0
    for (let i = 1; i < pts.length; i++) dist += Utils.haversine(pts[i - 1], pts[i])

    // رسم المسار المستورد
    clearGpxPreview()
    gpxPreviewLine = L.polyline(pts, {
      color: '#00E5FF',
      weight: 4,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map)
    map.fitBounds(gpxPreviewLine.getBounds(), { padding: [48, 48] })

    // فتح مودال الحفظ (يُدار في tracker.js)
    if (window.__TRACKER_API__ && typeof window.__TRACKER_API__.openImportSaveModal === 'function') {
      window.__TRACKER_API__.openImportSaveModal({
        name,
        coordinates: pts,
        distanceKm: dist / 1000,
        durationSec: 0,
      })
    } else {
      showToast('✅ تم استيراد المسار (لكن الحفظ غير متاح)')
    }
  }

  /* ---------- فتح/إغلاق اللوحة ---------- */
  function setPanel(open) {
    tracksPanel.classList.toggle('open', open)
    tracksBtn.setAttribute('aria-expanded', String(open))
    if (open) {
      layerPanel.classList.remove('open')
      document
        .getElementById('layersBtn')
        .setAttribute('aria-expanded', 'false')
      renderTracks()
    }
  }

  tracksBtn.addEventListener('click', () => {
    setPanel(!tracksPanel.classList.contains('open'))
  })

  map.on('click', () => setPanel(false))

  /* ---------- تفويض أحداث القائمة ---------- */
  tracksList.addEventListener('click', (e) => {
    const btn = e.target.closest('.track-action')
    if (!btn) return
    const item = btn.closest('.track-item')
    if (!item) return
    const id = item.dataset.id
    if (btn.dataset.act === 'view') viewTrack(id)
    else if (btn.dataset.act === 'share') {
      const track = Store.getTrack(id)
      if (track && window.Share) window.Share.openShareModal(track)
    } else if (btn.dataset.act === 'del') deleteTrack(id)
  })

  /* ---------- كشف للاختبار ---------- */
  window.__TRACKS_UI__ = { renderTracks, viewTrack, deleteTrack, setPanel, clearGpxPreview, importGpxText }
})()
