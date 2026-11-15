/* ═══════════════════════════════════════════════════════════════
   خارطة البر — ملاحة المسار المحفوظ + تنبيه الابتعاد
   اتبع مسارًا محفوظًا: المتبقي، وتنبيه (اهتزاز + صوت) إذا خرجت
   عنه أكثر من الحد، مع اتجاه أقرب نقطة للعودة. زر عكس الاتجاه.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict'

  const map = window.__MAP__
  const hud = document.getElementById('followHud')
  if (!map || !hud) return

  const nameEl = document.getElementById('followName')
  const statusEl = document.getElementById('followStatus')
  const iconEl = document.getElementById('followIcon')
  const revBtn = document.getElementById('followReverseBtn')
  const turnEl = document.getElementById('followTurn')
  const voiceBtn = document.getElementById('followVoiceBtn')
  const stopBtn = document.getElementById('followStopBtn')

  const MIN_OFF_M = 50 // حد الابتعاد الأدنى (يرتفع مع ضعف دقة GPS)
  const OFF_TICKS = 3 // ثوانٍ متتالية خارج المسار قبل التنبيه
  const REPEAT_MS = 30000 // إعادة التنبيه أثناء الابتعاد
  const ARRIVE_M = 30
  const MIN_STEP_M = 30
  const REROUTE_TICKS = 5 // ثوانٍ خارج الطريق قبل إعادة الحساب (مسارات الطرق فقط)
  const REROUTE_COOLDOWN_MS = 20000
  const WINDOW_BACK = 5
  const WINDOW_FWD = 200

  const toast = (m) => window.showToast && window.showToast(m)

  /* ---------- التعليمات الصوتية (اختيارية — تُكتم بزر 🔊) ---------- */
  const VOICE_KEY = 'wild_voice'
  let voiceOn = localStorage.getItem(VOICE_KEY) !== '0'
  /** أول صوت عربي مثبّت في الجهاز (Chrome غالبًا بلا صوت عربي → نكتفي بالنص) */
  function arabicVoice() {
    if (!('speechSynthesis' in window)) return null
    try {
      return speechSynthesis.getVoices().find((v) => /^ar([-_]|$)/i.test(v.lang)) || null
    } catch {
      return null
    }
  }
  function updateVoiceUi() {
    // الزر يظهر فقط لمسار فيه تعليمات وكان في الجهاز صوت عربي
    voiceBtn.classList.toggle('hidden', !(st.steps.length && arabicVoice()))
  }
  if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', updateVoiceUi)
  function say(text) {
    const voice = arabicVoice()
    if (!voiceOn || !voice) return
    try {
      const u = new SpeechSynthesisUtterance(text)
      u.voice = voice
      u.lang = voice.lang
      speechSynthesis.cancel()
      speechSynthesis.speak(u)
    } catch {}
  }
  function renderVoiceBtn() {
    voiceBtn.textContent = voiceOn ? '🔊' : '🔇'
    voiceBtn.classList.toggle('active', voiceOn)
  }
  const roundDist = (m) => (m < 100 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50)

  const st = {
    track: null,
    pts: [], // [lat,lng] بالاتجاه الحالي
    cum: [], // مسافة تراكمية عند كل نقطة (م)
    total: 0,
    reversed: false,
    idx: 0,
    offTicks: 0,
    off: false,
    lastAlert: 0,
    arrived: false,
    steps: [],
    prevLayer: null,
    layerSwitched: false,
    lastReroute: 0,
    rerouting: false,
    timer: null,
    route: null,
    link: null,
  }

  /* ---------- هندسة: أقرب نقطة على مقطع (إسقاط محلي بالأمتار) ---------- */
  function nearestOnSegment(p, a, b) {
    const k = Math.cos((p[0] * Math.PI) / 180)
    const X = (q) => (q[1] - p[1]) * 111320 * k
    const Y = (q) => (q[0] - p[0]) * 110574
    const ax = X(a), ay = Y(a), bx = X(b), by = Y(b)
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    let t = len2 ? (-ax * dx - ay * dy) / len2 : 0
    t = Math.max(0, Math.min(1, t))
    const cx = ax + t * dx, cy = ay + t * dy
    return { t, dist: Math.hypot(cx, cy), point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] }
  }

  function scan(p, from, to) {
    let best = null
    for (let i = Math.max(0, from); i < Math.min(st.pts.length - 1, to); i++) {
      const r = nearestOnSegment(p, st.pts[i], st.pts[i + 1])
      if (!best || r.dist < best.dist) best = { ...r, i }
    }
    return best
  }

  /** أقرب نقطة على المسار: نافذة قرب آخر موقع أولاً (يميّز ذهاب/إياب نفس الطريق) */
  function locate(p, limit) {
    const win = scan(p, st.idx - WINDOW_BACK, st.idx + WINDOW_FWD)
    if (win && win.dist <= limit) return win
    const all = scan(p, 0, st.pts.length)
    return all && win && win.dist <= all.dist + 5 ? win : all
  }

  /* ---------- تنبيه ---------- */
  function alertOff(distM) {
    Utils.notify([300, 120, 300, 120, 300], 880)
    toast(`⚠️ ابتعدت عن المسار ${Utils.formatDistance(distM)}`)
  }

  /* ---------- الرسم ---------- */
  function drawRoute() {
    if (st.route) map.removeLayer(st.route)
    st.route = L.polyline(st.pts, {
      color: '#fbbf24',
      weight: 5,
      opacity: 0.9,
      dashArray: '2 10',
      lineCap: 'round',
    }).addTo(map)
  }
  function setLink(from, to) {
    if (!from) {
      if (st.link) map.removeLayer(st.link)
      st.link = null
      return
    }
    if (!st.link) st.link = L.polyline([from, to], { color: '#ef4444', weight: 3, dashArray: '6 8', interactive: false }).addTo(map)
    else st.link.setLatLngs([from, to])
  }

  /* ---------- الدورة الحية (كل ثانية) ---------- */
  function tick() {
    const k = window.__TRACKER__ && window.__TRACKER__.lastKnown
    if (!k) {
      statusEl.textContent = 'بانتظار إشارة GPS…'
      return
    }
    const p = [k.lat, k.lng]
    const limit = Math.max(MIN_OFF_M, (k.accuracy || 0) * 1.5)
    const r = locate(p, limit)
    if (!r) return
    st.idx = r.i
    const remaining = Math.max(0, st.total - (st.cum[r.i] + r.t * (st.cum[r.i + 1] - st.cum[r.i])))

    if (r.dist > limit) {
      st.offTicks++
      const brg = Utils.bearing(p, r.point)
      iconEl.textContent = '⚠️'
      hud.classList.add('off')
      turnEl.classList.add('hidden')
      statusEl.textContent = `خارج المسار ${Utils.formatDistance(r.dist)} — اتجه ${Math.round(brg)}° ${Utils.cardinalAr(brg)}`
      setLink(p, r.point)
      const now = Date.now()
      if (st.track.reroute && st.offTicks >= REROUTE_TICKS) reroute(p)
      if (st.offTicks >= OFF_TICKS && (!st.off || now - st.lastAlert > REPEAT_MS)) {
        st.off = true
        st.lastAlert = now
        alertOff(r.dist)
      }
    } else {
      if (st.off) toast('✅ رجعت إلى المسار')
      st.off = false
      st.offTicks = 0
      hud.classList.remove('off')
      iconEl.textContent = '🧭'
      setLink(null)
      statusEl.textContent = `على المسار · المتبقي ${Utils.formatDistance(remaining)}`
      updateTurn(st.total - remaining)
      if (remaining <= ARRIVE_M && !st.arrived && st.total > 100) {
        st.arrived = true
        Utils.notify([500, 150, 500], 660)
        toast('🏁 وصلت نهاية المسار')
      }
    }
  }

  /* ---------- الانعطاف القادم ---------- */
  function updateTurn(progress) {
    if (!st.steps.length) {
      turnEl.classList.add('hidden')
      return
    }
    // أول خطوة قادمة (نتجاوز "ابدأ" وما مضى منها)
    const s = st.steps.find((x) => x.kind !== 'depart' && x.dist - progress > -15)
    if (!s) {
      turnEl.classList.add('hidden')
      return
    }
    const d = Math.max(0, s.dist - progress)
    turnEl.textContent = `${s.icon} بعد ${Utils.formatDistance(d)}: ${s.text}`
    turnEl.classList.remove('hidden')
    if (d <= 60 && !s.near) {
      s.near = s.far = true
      say(s.kind === 'arrive' ? s.text : `الآن، ${s.text}`)
      if (s.kind !== 'arrive') Utils.notify([150], 760)
    } else if (d <= 350 && d > 60 && !s.far) {
      s.far = true
      say(`بعد ${roundDist(d)} متر، ${s.text}`)
    }
  }

  /* ---------- إعادة حساب الطريق (فقط للمسارات التي لها هدف طريق) ---------- */
  async function reroute(p) {
    const now = Date.now()
    if (st.rerouting || now - st.lastReroute < REROUTE_COOLDOWN_MS || !window.__ROUTE__) return
    st.rerouting = true
    st.lastReroute = now
    const track = st.track
    try {
      const r = await window.__ROUTE__.fetch(p, track.reroute.to)
      if (st.track !== track) return // أُنهيت الملاحة أثناء الحساب
      track.coordinates = r.coords
      track.steps = r.steps
      build()
      toast('🔄 أُعيد حساب الطريق')
    } catch {
      // بدون إنترنت: نكتفي بتنبيه الابتعاد
    } finally {
      st.rerouting = false
    }
  }

  /* ---------- بدء/إيقاف ---------- */
  function build() {
    const base = st.track.coordinates
    st.pts = st.reversed ? base.slice().reverse() : base.slice()
    st.cum = [0]
    for (let i = 1; i < st.pts.length; i++) st.cum.push(st.cum[i - 1] + Utils.haversine(st.pts[i - 1], st.pts[i]))
    st.total = st.cum[st.cum.length - 1]
    st.idx = 0
    st.off = false
    st.offTicks = 0
    st.arrived = false
    st.steps = st.reversed ? [] : (st.track.steps || [])
          .map((s) => ({ ...s, dist: st.cum[s.idx] || 0 }))
          // تجاهل انعطافات أول 30م (أثر التقاط نقطة البداية على الطريق)
          .filter((s) => s.kind === 'arrive' || s.kind === 'depart' || s.dist > MIN_STEP_M)
    updateVoiceUi()
    turnEl.classList.add('hidden')
    renderVoiceBtn()
    nameEl.textContent = `${st.reversed ? '↔ ' : ''}${st.track.name}`
    revBtn.classList.toggle('active', st.reversed)
    revBtn.classList.toggle('hidden', !!st.track.reroute) // عكس الاتجاه لا يناسب طرق السيارات
    drawRoute()
    setLink(null)
  }

  function start(track) {
    const coords = track && Array.isArray(track.coordinates) ? track.coordinates : []
    if (coords.length < 2) {
      toast('⚠️ المسار قصير جداً للملاحة')
      return
    }
    stop(false)
    if (window.__NAV__ && window.__NAV__.clearTarget) window.__NAV__.clearTarget(false)
    st.track = track
    st.reversed = false
    // مسار طرق (مدينة): خريطة الشوارع أوضح وبلاطاتها تصل لزوم 19 — نعيد الطبقة بعد الإنهاء
    const BL = window.__BASELAYER__
    if (track.reroute && BL && BL.get() !== 'streets') {
      st.prevLayer = BL.get()
      BL.set('streets')
      st.layerSwitched = true
      toast('🏙️ خريطة الشوارع أثناء التوجيه — يمكنك تغييرها من الطبقات')
    }
    st.lastReroute = 0
    build()
    map.fitBounds(st.route.getBounds(), { padding: [48, 48] })
    hud.classList.add('open')
    tick()
    st.timer = setInterval(tick, 1000)
    toast('🧭 بدأت ملاحة المسار — سأنبهك إذا ابتعدت')
    // الأصوات تُحمَّل متأخرة: نفحص بعد لحظة وننبّه مرة واحدة إن لم يوجد صوت عربي
    if (st.steps.length && !sessionStorage.getItem('wild_novoice')) {
      setTimeout(() => {
        if (st.track && !arabicVoice()) {
          sessionStorage.setItem('wild_novoice', '1')
          toast('ℹ️ لا يوجد صوت عربي في جهازك — التعليمات نصية فقط')
        }
      }, 2500)
    }
  }

  function stop(showMsg = true) {
    if (st.timer) clearInterval(st.timer)
    st.timer = null
    if (st.route) map.removeLayer(st.route)
    st.route = null
    setLink(null)
    st.track = null
    st.steps = []
    const BL = window.__BASELAYER__
    if (st.layerSwitched && BL && BL.get() === 'streets' && st.prevLayer) BL.set(st.prevLayer)
    st.layerSwitched = false
    st.prevLayer = null
    turnEl.classList.add('hidden')
    if ('speechSynthesis' in window) speechSynthesis.cancel()
    hud.classList.remove('open', 'off')
    if (showMsg) toast('تم إنهاء ملاحة المسار')
  }

  revBtn.addEventListener('click', () => {
    if (!st.track) return
    st.reversed = !st.reversed
    build()
    tick()
  })
  stopBtn.addEventListener('click', () => stop())
  voiceBtn.addEventListener('click', () => {
    voiceOn = !voiceOn
    localStorage.setItem(VOICE_KEY, voiceOn ? '1' : '0')
    if (!voiceOn && 'speechSynthesis' in window) speechSynthesis.cancel()
    renderVoiceBtn()
    toast(voiceOn ? '🔊 التعليمات الصوتية مفعّلة' : '🔇 تم كتم التعليمات الصوتية')
  })

  window.__FOLLOW__ = {
    start,
    stop,
    nearestOnSegment,
    get active() {
      return !!st.track
    },
  }
})()
