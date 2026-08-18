/* ═══════════════════════════════════════════════════════════════
   خارطة البر — أدوات حسابية (المرحلة 2)
   Haversine + تنسيق المسافة والمدة
   ═══════════════════════════════════════════════════════════════ */
window.Utils = (() => {
  'use strict'

  const EARTH_RADIUS_M = 6371000

  /**
   * مسافة هافرساين بين نقطتين بالإحداثيات [lat, lng]
   * @param {[number, number]} a
   * @param {[number, number]} b
   * @returns {number} المسافة بالأمتار
   */
  function haversine(a, b) {
    const toRad = (deg) => (deg * Math.PI) / 180
    const lat1 = toRad(a[0])
    const lat2 = toRad(b[0])
    const dLat = toRad(b[0] - a[0])
    const dLon = toRad(b[1] - a[1])
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
  }

  /**
   * تنسيق المسافة: أمتار تحت 1000، وإلا كيلومترات بمنزلتين
   * @param {number} meters
   * @returns {string}
   */
  function formatDistance(meters) {
    if (!isFinite(meters) || meters < 0) meters = 0
    if (meters < 1000) return `${Math.round(meters)} م`
    return `${(meters / 1000).toFixed(2)} كم`
  }

  /**
   * تنسيق المدة بالثواني إلى HH:MM:SS
   * @param {number} seconds
   * @returns {string}
   */
  function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(seconds || 0))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(h)}:${pad(m)}:${pad(s)}`
  }

  /* ═══════════ محلل الإحداثيات الذكي (المرحلة 6) ═══════════ */

  /**
   * تحليل إحداثيات بصيغ متعددة:
   *  - DD:  24.7136, 46.6753  أو  24.7136N 46.6753E
   *  - DMS: 24°42'48"N 46°40'31"E  أو  24 42 48 N, 46 40 31 E
   *  - DDM: 24° 42.816' N 46° 40.518' E
   * @param {string} input
   * @returns {{lat:number, lng:number}|null}
   */
  function parseCoords(input) {
    if (input === null || input === undefined) return null
    const s = String(input).trim()
    if (!s) return null

    const NUM = '\\d+(?:\\.\\d+)?'
    // مجموعة واحدة: [درجة][°][دقيقة]['][ثانية]["][اتجاه]
    const re = new RegExp(
      '([+-]?' + NUM + ')' +
      '\\s*(?:[°ºd]\\s*)?' +
      '(' + NUM + ')?' +
      '\\s*(?:[\'′’]\\s*)?' +
      '(' + NUM + ')?' +
      '\\s*(?:["″”])?' +
      '\\s*([NSEWnsew])?',
      'g'
    )

    const parts = []
    let m
    while ((m = re.exec(s)) !== null && parts.length < 2) {
      if (m[0].length === 0) {
        re.lastIndex++
        continue
      }
      if (m[1] === undefined) continue
      const nums = [m[1]].concat(m[2] ? [m[2]] : []).concat(m[3] ? [m[3]] : []).map(Number)
      parts.push({ nums, dir: m[4] ? m[4].toUpperCase() : '' })
    }
    if (parts.length !== 2) return null

    function toDec(part) {
      let v
      if (part.nums.length === 1) v = part.nums[0]
      else if (part.nums.length === 2) v = part.nums[0] + part.nums[1] / 60
      else if (part.nums.length === 3) v = part.nums[0] + part.nums[1] / 60 + part.nums[2] / 3600
      else return null
      if (!isFinite(v)) return null
      if (part.dir === 'S' || part.dir === 'W') v = -Math.abs(v)
      else if (part.dir === 'N' || part.dir === 'E') v = Math.abs(v)
      return v
    }

    const d0 = parts[0].dir
    const d1 = parts[1].dir
    let lat, lng
    if (d0 === 'E' || d0 === 'W') {
      lng = toDec(parts[0])
      lat = toDec(parts[1])
    } else if (d1 === 'E' || d1 === 'W') {
      lat = toDec(parts[0])
      lng = toDec(parts[1])
    } else if (d0 === 'N' || d0 === 'S') {
      lat = toDec(parts[0])
      lng = toDec(parts[1])
    } else if (d1 === 'N' || d1 === 'S') {
      lng = toDec(parts[0])
      lat = toDec(parts[1])
    } else {
      lat = toDec(parts[0]) // بدون اتجاه: الأول خط عرض
      lng = toDec(parts[1])
    }

    if (lat === null || lng === null) return null
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
    return { lat, lng }
  }

  /**
   * تحويل إحداثيات إلى DMS نصي
   * @returns {string} مثل 24°42'49"N 46°40'31"E
   */
  function toDMS(lat, lng) {
    function one(v, pos, neg) {
      const a = Math.abs(v)
      let deg = Math.floor(a)
      let min = Math.floor((a - deg) * 60)
      let sec = Math.round(((a - deg) * 60 - min) * 60)
      if (sec === 60) {
        sec = 0
        min++
        if (min === 60) {
          min = 0
          deg++
        }
      }
      const pad = (n) => String(n).padStart(2, '0')
      return `${deg}°${pad(min)}'${pad(sec)}"${v >= 0 ? pos : neg}`
    }
    return `${one(lat, 'N', 'S')} ${one(lng, 'E', 'W')}`
  }

  /**
   * زاوية الاتجاه (Bearing) من نقطة إلى أخرى بالدرجات (0=شمال، 90=شرق)
   * @returns {number} 0..360
   */
  function bearing(a, b) {
    const toRad = (d) => (d * Math.PI) / 180
    const toDeg = (r) => (r * 180) / Math.PI
    const lat1 = toRad(a[0])
    const lat2 = toRad(b[0])
    const dLon = toRad(b[1] - a[1])
    const y = Math.sin(dLon) * Math.cos(lat2)
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
    return (toDeg(Math.atan2(y, x)) + 360) % 360
  }

  /**
   * الاسم الرباعي للاتجاه (8 أسماء)
   * @returns {string} N / NE / E / SE / S / SW / W / NW
   */
  function cardinal(deg) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    const d = ((deg % 360) + 360) % 360
    return dirs[Math.round(d / 45) % 8]
  }

  return { haversine, formatDistance, formatDuration, parseCoords, toDMS, bearing, cardinal }
})()
