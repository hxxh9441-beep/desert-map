/* ═══════════════════════════════════════════════════════════════
   خارطة البر — المشاركة والتصدير (المرحلة 4)
   Encoded Polyline (ضغط الإحداثيات) · مولّد GPX · رابط المشاركة · الاستيراد
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict'

  const map = window.__MAP__
  const PRECISION = 5 // ~1.1م دقة — مضغوط ومثالي للبر

  /* ═══════════ ترميز/فك ترميز البولي لاين (معيار Google) ═══════════ */

  function encodeNumber(v) {
    // توقيع ثنائي: v<<1 مع قلب البتة للقيم السالبة
    let num = v < 0 ? ~(v << 1) : v << 1
    let out = ''
    while (num >= 0x20) {
      out += String.fromCharCode((0x20 | (num & 0x1f)) + 63)
      num >>= 5
    }
    out += String.fromCharCode(num + 63)
    return out
  }

  function decodeNumber(str, index) {
    let shift = 0
    let result = 0
    let byte
    do {
      byte = str.charCodeAt(index++) - 63
      if (byte < 0) throw new Error('polyline: سلسلة غير صالحة')
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    return { value: result & 1 ? ~(result >> 1) : result >> 1, i: index }
  }

  /**
   * ترميز مصفوفة إحداثيات [[lat,lng],...] إلى سلسلة بولي لاين معيارية
   */
  function encodePolyline(coords) {
    const p = Math.pow(10, PRECISION)
    let prevLat = 0
    let prevLng = 0
    let out = ''
    for (const [lat, lng] of coords) {
      const latR = Math.round(Number(lat) * p)
      const lngR = Math.round(Number(lng) * p)
      out += encodeNumber(latR - prevLat)
      out += encodeNumber(lngR - prevLng)
      prevLat = latR
      prevLng = lngR
    }
    return out
  }

  /**
   * فك ترميز سلسلة بولي لاين معيارية إلى [[lat,lng],...]
   */
  function decodePolyline(str) {
    const p = Math.pow(10, PRECISION)
    const out = []
    let i = 0
    let lat = 0
    let lng = 0
    while (i < str.length) {
      const dLat = decodeNumber(str, i)
      lat += dLat.value
      i = dLat.i
      const dLng = decodeNumber(str, i)
      lng += dLng.value
      i = dLng.i
      out.push([lat / p, lng / p])
    }
    return out
  }

  /* ═══════════ رابط المشاركة ═══════════ */

  const PREFIX = '#track='
  // الفاصل ';' (charCode 59) — البولي لاين يمر عبر base64url (حروف آمنة في الروابط)،
  // والاسم مشفّر بـ encodeURIComponent → لا تصادم أبداً
  const SEP = ';'

  // base64url: المتصفح يرمّز { | } ^ ` إلخ عند فتح الروابط في الـ fragment —
  // base64url يحوي فقط A-Za-z0-9-_ فتنجو من أي تطبيع URL
  function b64urlEncode(str) {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  function b64urlDecode(s) {
    let b64 = s.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    return atob(b64)
  }

  /**
   * بناء رابط من مسار
   * الصيغة: #track=<name>;<distanceKm>;<durationSec>;<polyline-b64url>
   */
  function buildShareUrl(track) {
    const nameEnc = encodeURIComponent(track.name || 'مسار')
    const dist = Number(track.distanceKm || 0).toFixed(2)
    const dur = Math.round(Number(track.durationSec) || 0)
    const poly = b64urlEncode(encodePolyline(track.coordinates))
    return `${location.origin}${location.pathname}${PREFIX}${nameEnc}${SEP}${dist}${SEP}${dur}${SEP}${poly}`
  }

  /**
   * قراءة رابط المشاركة من الـ hash
   * @returns {{name:string, distanceKm:number, durationSec:number, coordinates:number[][]}|null}
   */
  function parseShareUrl() {
    const hash = window.location.hash || ''
    if (!hash.startsWith(PREFIX)) return null
    const body = hash.slice(PREFIX.length)
    try {
      const parts = body.split(SEP)
      if (parts.length !== 4) return null
      const name = decodeURIComponent(parts[0])
      const distanceKm = parseFloat(parts[1]) || 0
      const durationSec = parseInt(parts[2], 10) || 0
      const coords = decodePolyline(b64urlDecode(parts[3]))
      if (coords.length < 2) return null
      for (const [lat, lng] of coords) {
        if (!isFinite(lat) || !isFinite(lng)) return null
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
      }
      return { name, distanceKm, durationSec, coordinates: coords }
    } catch {
      return null
    }
  }

  /* ═══════════ مولّد GPX ═══════════ */

  function escapeXml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    })[c])
  }

  /**
   * توليد محتوى ملف GPX 1.1 من مسار
   * @returns {string} XML كامل
   */
  function toGpx(track) {
    const pts = track.coordinates
      .map(
        ([lat, lng]) =>
          `      <trkpt lat="${Number(lat).toFixed(6)}" lon="${Number(lng).toFixed(6)}"></trkpt>`
      )
      .join('\n')
    const time = new Date(track.createdAt || Date.now()).toISOString()
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="خارطة البر" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(track.name || 'مسار')}</name>
    <time>${time}</time>
  </metadata>
  <trk>
    <name>${escapeXml(track.name || 'مسار')}</name>
    ${track.notes ? `<desc>${escapeXml(track.notes)}</desc>` : ''}
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`
  }

  /**
   * تحميل ملف GPX على الجهاز
   */
  function downloadGpx(track) {
    const xml = toGpx(track)
    const blob = new Blob([xml], { type: 'application/gpx+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const safeName = (track.name || 'track')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '-')
      .slice(0, 40)
    const date = new Date(track.createdAt || Date.now()).toISOString().slice(0, 10)
    a.href = url
    a.download = `${safeName}-${date}.gpx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  /* ═══════════ نسخ الرابط ═══════════ */

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // بديل للمتصفحات القديمة
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        ta.remove()
        return true
      } catch {
        return false
      }
    }
  }

  /* ═══════════ واجهة المشاركة (المودال) ═══════════ */

  const shareModal = document.getElementById('shareModal')
  const shareModalName = document.getElementById('shareModalName')
  const copyLinkBtn = document.getElementById('copyLinkBtn')
  const downloadGpxBtn = document.getElementById('downloadGpxBtn')
  const closeShareBtn = document.getElementById('closeShareBtn')

  let currentTrack = null // المسار المفتوح في مودال المشاركة

  function openShareModal(track) {
    currentTrack = track
    shareModalName.textContent = track.name
    shareModal.classList.add('open')
  }

  function closeShareModal() {
    shareModal.classList.remove('open')
    currentTrack = null
  }

  copyLinkBtn.addEventListener('click', async () => {
    if (!currentTrack) return
    const url = buildShareUrl(currentTrack)
    // مشاركة أصلية إن توفرت (تفتح شيت المشاركة في الجوال)
    if (navigator.share) {
      try {
        await navigator.share({ title: `مسار: ${currentTrack.name}`, text: 'خارطة البر — مسار مشارَك', url })
        closeShareModal()
        return
      } catch {
        // المستخدم ألغى — ننسخ بدلاً منها
      }
    }
    const ok = await copyText(url)
    closeShareModal()
    showToast(ok ? '🔗 تم نسخ الرابط — أرسله لأي شخص' : '⚠️ تعذر نسخ الرابط')
  })

  downloadGpxBtn.addEventListener('click', () => {
    if (!currentTrack) return
    downloadGpx(currentTrack)
    closeShareModal()
    showToast('⬇️ تم تنزيل ملف GPX')
  })

  closeShareBtn.addEventListener('click', closeShareModal)
  shareModal.addEventListener('click', (e) => {
    if (e.target === shareModal) closeShareModal()
  })

  /* ═══════════ استيراد مسار من الرابط عند فتح الصفحة ═══════════ */

  const importBanner = document.getElementById('importBanner')
  const importName = document.getElementById('importName')
  const importMeta = document.getElementById('importMeta')
  const importSaveBtn = document.getElementById('importSaveBtn')
  const importCloseBtn = document.getElementById('importCloseBtn')

  let importedTrack = null
  let importedLine = null

  function hideImportBanner() {
    importBanner.classList.add('hidden')
    if (importedLine) {
      map.removeLayer(importedLine)
      importedLine = null
    }
  }

  function handleShareHash() {
    const track = parseShareUrl()
    if (!track) return

    // ارسم المسار فوراً + كبّر عليه
    importedLine = L.polyline(track.coordinates, {
      color: '#00E5FF',
      weight: 4,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map)
    map.fitBounds(importedLine.getBounds(), { padding: [48, 48] })

    // الإشعار
    importedTrack = track
    importName.textContent = track.name
    importMeta.textContent = `${track.distanceKm.toFixed(2)} كم · ${Utils.formatDuration(track.durationSec)} · مسار مشارَك`
    importBanner.classList.remove('hidden')

    // تنظيف الـ hash حتى لا يتكرر الاستيراد عند كل تحديث
    history.replaceState(null, '', location.pathname + location.search)
  }

  importSaveBtn.addEventListener('click', () => {
    if (!importedTrack) return
    const saved = Store.saveTrack({
      name: importedTrack.name,
      coordinates: importedTrack.coordinates,
      distanceKm: importedTrack.distanceKm,
      durationSec: importedTrack.durationSec,
    })
    hideImportBanner()
    showToast(saved ? '💾 تم حفظ المسار المستورد' : '⚠️ تعذر الحفظ')
  })

  importCloseBtn.addEventListener('click', hideImportBanner)

  /* ═══════════ التشغيل ═══════════ */

  // استيراد أي مسار مشارَك عند التحميل
  handleShareHash()

  /* ═══════════ كشف للاختبار والمراحل القادمة ═══════════ */

  window.Share = {
    encodePolyline,
    decodePolyline,
    buildShareUrl,
    parseShareUrl,
    toGpx,
    downloadGpx,
    openShareModal,
    copyText,
  }
})()
