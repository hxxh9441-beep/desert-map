/* ═══════════════════════════════════════════════════════════════
   خارطة البر — محرك التخزين المحلي (المرحلة 3)
   localStorage · المفتاح: wild_tracks
   مخطط المسار: { id, name, createdAt, distanceKm, durationSec, coordinates }
   ═══════════════════════════════════════════════════════════════ */
window.Store = (() => {
  'use strict'

  const KEY = 'wild_tracks'

  /* ---------- قراءة/كتابة بأمان ---------- */
  function read() {
    try {
      const raw = localStorage.getItem(KEY)
      const arr = raw ? JSON.parse(raw) : []
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  }

  function write(arr) {
    try {
      localStorage.setItem(KEY, JSON.stringify(arr))
      return true
    } catch {
      return false
    }
  }

  /* ---------- معرّف فريد ---------- */
  function uuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
    // بديل يدوي (بيئات قديمة)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  /* ---------- العمليات ---------- */
  function getTracks() {
    return read()
  }

  function getTrack(id) {
    return read().find((t) => t.id === id) || null
  }

  /**
   * حفظ مسار جديد (الأحدث في المقدمة)
   * @param {{name:string, notes?:string, coordinates:number[][], distanceKm?:number, durationSec?:number}} data
   * @returns {object|null} المسار المحفوظ أو null عند الفشل
   */
  function saveTrack({ name, notes = '', coordinates, distanceKm = 0, durationSec = 0 }) {
    if (!Array.isArray(coordinates) || coordinates.length === 0) return null
    const track = {
      id: uuid(),
      name: String(name || '').trim() || 'مسار بدون اسم',
      notes: String(notes || '').trim(),
      createdAt: new Date().toISOString(),
      distanceKm: Number(distanceKm) || 0,
      durationSec: Math.floor(Number(durationSec) || 0),
      coordinates: coordinates.map((c) => [Number(c[0]), Number(c[1])]),
    }
    const arr = read()
    arr.unshift(track)
    return write(arr) ? track : null
  }

  function deleteTrack(id) {
    const arr = read().filter((t) => t.id !== id)
    return write(arr)
  }

  function clearTracks() {
    return write([])
  }

  /* ═══════════ نقاط الاهتمام (POIs) — مفتاح wild_pois ═══════════ */

  const POI_KEY = 'wild_pois'

  function readPois() {
    try {
      const raw = localStorage.getItem(POI_KEY)
      const arr = raw ? JSON.parse(raw) : []
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  }

  function writePois(arr) {
    try {
      localStorage.setItem(POI_KEY, JSON.stringify(arr))
      return true
    } catch {
      return false
    }
  }

  function getPois() {
    return readPois()
  }

  /**
   * إضافة POI مخصص
   * @param {{name:string, type:string, lat:number, lng:number, note?:string}} data
   * @returns {object|null}
   */
  function addPoi({ name = '', type = 'landmark', lat, lng, note = '' }) {
    if (!isFinite(lat) || !isFinite(lng)) return null
    const poi = {
      id: uuid(),
      name: String(name || '').trim() || 'نقطة',
      type,
      lat: Number(lat),
      lng: Number(lng),
      note: String(note || '').trim(),
      createdAt: new Date().toISOString(),
    }
    const arr = readPois()
    arr.unshift(poi)
    return writePois(arr) ? poi : null
  }

  function removePoi(id) {
    return writePois(readPois().filter((p) => p.id !== id))
  }

  return { KEY, getTracks, getTrack, saveTrack, deleteTrack, clearTracks, POI_KEY, getPois, addPoi, removePoi }
})()
