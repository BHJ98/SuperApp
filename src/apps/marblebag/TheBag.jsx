import { useState, useEffect, useRef } from 'react'
import { storageSave, storageLoad, subscribeToState } from './supabaseStore'

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const MT = {
  blue:  { orb: '#3b82f6', bg: '#0a0e1a', border: '#1e3a6e', glow: 'rgba(59,130,246,0.55)',  dim: 'rgba(59,130,246,0.18)',  label: 'Back in the cage' },
  green: { orb: '#22c55e', bg: '#071a0f', border: '#14532d', glow: 'rgba(34,197,94,0.55)',   dim: 'rgba(34,197,94,0.18)',   label: 'Release' },
  red:   { orb: '#ef4444', bg: '#190808', border: '#7f1d1d', glow: 'rgba(239,68,68,0.55)',   dim: 'rgba(239,68,68,0.18)',   label: 'Consequence' },
  gold:  { orb: '#f59e0b', bg: '#191006', border: '#78350f', glow: 'rgba(245,158,11,0.75)',  dim: 'rgba(245,158,11,0.18)',  label: 'Special' },
}

const DEFAULT_CONSEQUENCES = [
  { text: 'Cold shower — finish the last 2 minutes in cold water only', category: 'punishment' },
  { text: 'Clean the entire bathroom (toilet, sink, floor) — done by end of tomorrow', category: 'punishment' },
  { text: 'Do all the laundry this week, specifically folding and putting away', category: 'punishment' },
  { text: 'No screens (phone / TV / games) for the entire evening and tomorrow evening as well', category: 'punishment' },
  { text: 'Write a sincere letter explaining the behaviour — minimum one page', category: 'punishment' },
  { text: 'Vacuum and mop the whole house', category: 'punishment' },
  { text: 'Tease session with no release — brought to the edge, then locked back up', category: 'punishment' },
  { text: 'Next green marble is ruined', category: 'punishment' },
  { text: 'Next 2 green marbles are ruined', category: 'punishment' },
  { text: 'Full body massage — minimum 30 minutes, no shortcuts', category: 'reward' },
  { text: 'Cook a meal of her choice entirely from scratch and serve it to her', category: 'reward' },
  { text: 'Breakfast in bed on the next weekend morning', category: 'reward' },
  { text: 'She picks every movie / show for a week — no negotiation', category: 'reward' },
  { text: 'A small gift of her choosing: flowers, wine, chocolate, or a candle', category: 'reward' },
  { text: 'Spa day or massage appointment — he books and pays', category: 'reward' },
  { text: 'Extended oral service — on her terms, for as long as she wants', category: 'reward' },
  { text: 'She sets the next lock duration — the control itself is her reward', category: 'reward' },
]

const DEFAULT_STATE = {
  bag: { blue: 30, green: 0, red: 0, gold: 0 },
  behaviorLog: [],
  drawHistory: [],
  pendingConsequence: null,
  blackout: { active: false, startDate: null },
  ruinedGreens: 0,
  settings: { lecturePromptEnabled: true, challengeMode: false, challengeDays: 3, consequences: DEFAULT_CONSEQUENCES },
  stats: { totalDraws: 0, greens: 0, blues: 0, reds: 0, golds: 0, lastGreenDate: null, currentStreak: 0, bestStreak: 0 },
  lockLog: [],
  orgasmLog: [],
}

const ORG_TYPES = ['oral', 'manual', 'toys', 'piv']
const ORG_LABELS = { oral: 'Oral', manual: 'Manual', toys: 'Toys', piv: 'PIV' }
const ORG_COLORS = { oral: '#ec4899', manual: '#a855f7', toys: '#3b82f6', piv: '#f59e0b' }

// ── HELPERS ───────────────────────────────────────────────────────────────────

function deepMerge(a, b) {
  if (typeof b !== 'object' || b === null) return b !== undefined ? b : a
  if (typeof a !== 'object' || a === null) return b
  if (Array.isArray(b)) return b
  const out = { ...a }
  for (const k of Object.keys(b)) {
    out[k] = (k in a) ? deepMerge(a[k], b[k]) : b[k]
  }
  return out
}

function normaliseConsequences(list) {
  if (!Array.isArray(list)) return DEFAULT_CONSEQUENCES
  return list.map(c => typeof c === 'string' ? { text: c, category: 'punishment' } : c)
}

function drawMarble(bag) {
  const { blue, green, red, gold } = bag
  const t = blue + green + red + gold
  if (!t) return null
  const r = Math.floor(Math.random() * t)
  if (r < green) return 'green'
  if (r < green + blue) return 'blue'
  if (r < green + blue + red) return 'red'
  return 'gold'
}

function bagTotal(bag) {
  return (bag.blue || 0) + (bag.green || 0) + (bag.red || 0) + (bag.gold || 0)
}


function droughtDays(iso) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function droughtColor(d) {
  if (d === null) return '#6b7280'
  if (d >= 15) return '#f87171'
  if (d >= 8)  return '#fb923c'
  return '#6b7280'
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function fmtDT(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(d1, d2) {
  return Math.round((new Date(d2 + 'T12:00:00') - new Date(d1 + 'T12:00:00')) / 86400000)
}

function getLockStateOnDate(lockLog, dateStr) {
  const relevant = (lockLog || []).filter(e => e.date <= dateStr)
  if (!relevant.length) return null
  return relevant.sort((a, b) => b.date.localeCompare(a.date))[0].type
}

function computeLockStats(lockLog) {
  const today = todayStr()
  if (!lockLog || !lockLog.length) return { isLocked: false, lockedSince: null, currentDays: 0, longestDays: 0, totalDays: 0 }
  const sorted = [...lockLog].sort((a, b) => a.date.localeCompare(b.date))
  let longestDays = 0, totalDays = 0, lockStart = null
  for (const entry of sorted) {
    if (entry.type === 'lock') {
      if (lockStart === null) lockStart = entry.date  // keep first lock of a consecutive run
    } else if (entry.type === 'unlock') {
      if (lockStart !== null) {
        const d = daysBetween(lockStart, entry.date)
        longestDays = Math.max(longestDays, d)
        totalDays += d
      }
      lockStart = null
    }
  }
  const last = sorted[sorted.length - 1]
  const isLocked = last.type === 'lock'
  let lockedSince = null, currentDays = 0
  if (isLocked && lockStart !== null) {
    currentDays = daysBetween(lockStart, today) + 1
    longestDays = Math.max(longestDays, currentDays)
    totalDays += currentDays
    lockedSince = lockStart
  }
  return { isLocked, lockedSince, currentDays, longestDays, totalDays }
}

function computeOrgasmStats(orgasmLog) {
  const her = { oral: 0, manual: 0, toys: 0, piv: 0 }
  const him = { oral: 0, manual: 0, toys: 0, piv: 0 }
  let himFull = 0, himRuined = 0, himEdged = 0
  for (const entry of (orgasmLog || [])) {
    if (entry.who === 'her' && her[entry.type] !== undefined) her[entry.type]++
    else if (entry.who === 'him') {
      if (entry.type === 'edge') { himEdged++ }
      else if (him[entry.type] !== undefined) {
        him[entry.type]++
        if (entry.quality === 'full') himFull++; else himRuined++
      }
    }
  }
  const herTotal = Object.values(her).reduce((a, b) => a + b, 0)
  const himTotal = Object.values(him).reduce((a, b) => a + b, 0)
  return { her, him, himFull, himRuined, himEdged, herTotal, himTotal }
}

// ── GLOBAL STYLES ─────────────────────────────────────────────────────────────

function GS() {
  useEffect(() => {
    const id = 'the-bag-gs'
    if (document.getElementById(id)) return
    const s = document.createElement('style')
    s.id = id
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,500&family=DM+Sans:wght@300;400;500;600&display=swap');
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      html { background: #08080d; }
      body { background: #08080d; color: #f3f4f6; font-family: 'DM Sans', sans-serif; font-size: 15px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
      button { font-family: inherit; cursor: pointer; border: none; background: none; }
      textarea { font-family: inherit; }
      ::-webkit-scrollbar { width: 4px; }
      ::-webkit-scrollbar-track { background: #0c0c14; }
      ::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 2px; }
      @keyframes pulse { 0%,100%{transform:scale(1);opacity:.7} 50%{transform:scale(1.12);opacity:1} }
      @keyframes revPop { 0%{transform:scale(.3) rotate(-20deg);opacity:0} 70%{transform:scale(1.15) rotate(5deg)} 100%{transform:scale(1) rotate(0deg);opacity:1} }
      @keyframes popIn { 0%{transform:scale(.65) translateY(48px);opacity:0} 100%{transform:scale(1) translateY(0);opacity:1} }
      @keyframes slideUp { 0%{transform:translateY(14px);opacity:0} 100%{transform:translateY(0);opacity:1} }
      @keyframes toastIn { 0%{transform:translateX(-50%) translateY(20px);opacity:0} 100%{transform:translateX(-50%) translateY(0);opacity:1} }
      @keyframes shrink { 0%{width:100%} 100%{width:0%} }
      @keyframes fadeIn { 0%{opacity:0} 100%{opacity:1} }
      @keyframes shimmer { 0%,100%{opacity:.35} 50%{opacity:1} }
    `
    document.head.appendChild(s)
  }, [])
  return null
}

// ── PRIMITIVE COMPONENTS ──────────────────────────────────────────────────────

function Orb({ color, size = 44, animate, pulse: isPulse }) {
  const m = MT[color] || { orb: '#6b7280', glow: 'rgba(107,114,128,0.4)' }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,.85) 0%, ${m.orb} 55%, ${m.orb}cc 100%)`,
      boxShadow: `0 0 ${size * .4}px ${m.glow}, 0 0 ${size * .75}px ${m.glow.replace(/[\d.]+\)$/, '.18)')}`,
      animation: animate === 'revPop' ? 'revPop .45s ease-out both' : isPulse ? 'pulse .9s ease-in-out infinite' : 'none',
    }} />
  )
}

function GreyOrb({ size = 80 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,.6) 0%, #6b7280 55%)',
      boxShadow: '0 0 30px rgba(107,114,128,0.4)',
      animation: 'pulse .9s ease-in-out infinite',
    }} />
  )
}

function Toggle({ value, onChange, activeColor = '#7c3aed' }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 12, cursor: 'pointer', flexShrink: 0,
        background: value ? activeColor : '#1f2937',
        position: 'relative', transition: 'background .2s',
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: value ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.4)',
      }} />
    </div>
  )
}

function Btn({ variant = 'ghost', onClick, disabled, children, style: extra = {}, type = 'button' }) {
  const [hov, setHov] = useState(false)
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '10px 18px', borderRadius: 10, fontSize: 14, fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer', border: 'none',
    transition: 'all .15s', opacity: disabled ? .42 : 1,
    fontFamily: 'inherit', lineHeight: 1,
  }
  const vars = {
    ghost:  { background: 'transparent', border: '1px solid #1f2937', color: '#9ca3af' },
    purple: { background: hov ? 'linear-gradient(135deg,#4c0980,#6d28d9)' : 'linear-gradient(135deg,#3b0764,#5b21b6)', color: '#f3f4f6', boxShadow: hov ? '0 4px 20px rgba(91,33,182,.45)' : '0 2px 10px rgba(91,33,182,.25)' },
    green:  { background: 'rgba(34,197,94,.1)', border: '1px solid #14532d', color: '#22c55e' },
    red:    { background: 'rgba(239,68,68,.1)', border: '1px solid #7f1d1d', color: '#ef4444' },
    gold:   { background: 'rgba(245,158,11,.1)', border: '1px solid #78350f', color: '#f59e0b' },
    subtle: { background: 'rgba(107,114,128,.07)', border: '1px solid #1f2937', color: '#6b7280' },
  }
  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ ...base, ...vars[variant], ...extra }}
    >
      {children}
    </button>
  )
}

function Card({ children, style: extra = {} }) {
  return (
    <div style={{ background: '#0c0c14', border: '1px solid #1f2937', borderRadius: 16, ...extra }}>
      {children}
    </div>
  )
}

function SettingsRow({ label, subtitle, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #111' }}>
      <div>
        <div style={{ fontSize: 14, color: '#e5e7eb', fontWeight: 500 }}>{label}</div>
        {subtitle && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ flexShrink: 0, marginLeft: 16 }}>{children}</div>
    </div>
  )
}

// ── PIE CHART ─────────────────────────────────────────────────────────────────

function PieChart({ data, size = 100, centerLabel }) {
  const filtered = data.filter(d => d.value > 0)
  const total = filtered.reduce((s, d) => s + d.value, 0)
  if (!total) return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#0a0a16', border: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 11, color: '#374151' }}>—</span>
    </div>
  )
  const cx = size / 2, cy = size / 2, r = size * 0.4, ir = size * 0.24
  if (filtered.length === 1) return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill={filtered[0].color} opacity={0.85} />
      <circle cx={cx} cy={cy} r={ir} fill="#07070f" />
      {centerLabel ? <text x={cx} y={cy + 4} textAnchor="middle" fill="#9ca3af" fontSize={size * 0.15} fontFamily="DM Sans, sans-serif">{centerLabel}</text> : null}
    </svg>
  )
  let angle = -Math.PI / 2
  const slices = filtered.map(d => {
    const sweep = (d.value / total) * 2 * Math.PI
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle)
    const x2 = cx + r * Math.cos(angle + sweep), y2 = cy + r * Math.sin(angle + sweep)
    const ix1 = cx + ir * Math.cos(angle), iy1 = cy + ir * Math.sin(angle)
    const ix2 = cx + ir * Math.cos(angle + sweep), iy2 = cy + ir * Math.sin(angle + sweep)
    const large = sweep > Math.PI ? 1 : 0
    const path = `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${ix2},${iy2} A${ir},${ir} 0 ${large} 0 ${ix1},${iy1} Z`
    angle += sweep
    return { ...d, path }
  })
  return (
    <svg width={size} height={size}>
      {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} opacity={0.85} />)}
      {centerLabel ? <text x={cx} y={cy + 4} textAnchor="middle" fill="#9ca3af" fontSize={size * 0.15} fontFamily="DM Sans, sans-serif">{centerLabel}</text> : null}
    </svg>
  )
}

function PieLegend({ data }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: d.value > 0 ? 1 : 0.35 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: '#6b7280' }}>{d.name}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#e5e7eb', marginLeft: 'auto', paddingLeft: 6 }}>{d.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── CALENDAR VIEW ─────────────────────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES = ['Mo','Tu','We','Th','Fr','Sa','Su']

function CalendarView({ lockLog, orgasmLog, onToggleLock, onLogOrgasm, onRemoveOrgasm, isKH }) {
  const today = todayStr()
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth())
  const [selectedDate, setSelectedDate] = useState(null)

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
    setSelectedDate(null)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
    setSelectedDate(null)
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const startOffset = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7

  const days = []
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const lockState = getLockStateOnDate(lockLog, dateStr)
    const lockEvents = (lockLog || []).filter(e => e.date === dateStr)
    const dayOrgasms = (orgasmLog || []).filter(e => e.date === dateStr)
    days.push({ d, dateStr, lockState, lockEvents, dayOrgasms })
  }

  const selectedDay = selectedDate ? days.find(d => d.dateStr === selectedDate) : null
  const selectedLockState = selectedDate ? getLockStateOnDate(lockLog, selectedDate) : null

  const qRows = [
    { quality: 'full', label: 'Full', color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)' },
    { quality: 'ruined', label: 'Ruined', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' },
  ]

  return (
    <div style={{ padding: 16 }}>
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 22, padding: '0 10px', fontFamily: 'inherit', lineHeight: 1 }}>‹</button>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#e5e7eb' }}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 22, padding: '0 10px', fontFamily: 'inherit', lineHeight: 1 }}>›</button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {DAY_NAMES.map(n => (
          <div key={n} style={{ textAlign: 'center', fontSize: 11, color: '#374151', padding: '2px 0' }}>{n}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {Array.from({ length: startOffset }).map((_, i) => <div key={`p${i}`} />)}
        {days.map(({ d, dateStr, lockState, lockEvents, dayOrgasms }) => {
          const isToday = dateStr === today
          const isSelected = dateStr === selectedDate
          const isFuture = dateStr > today
          const isLocked = lockState === 'lock'
          const herDot = dayOrgasms.some(o => o.who === 'her')
          const himFullDot = dayOrgasms.some(o => o.who === 'him' && o.quality === 'full')
          const himRuinedDot = dayOrgasms.some(o => o.who === 'him' && o.quality === 'ruined')
          const himEdgedDot = dayOrgasms.some(o => o.who === 'him' && o.type === 'edge')
          const hasLockChange = lockEvents.length > 0

          return (
            <div
              key={d}
              onClick={() => !isFuture && setSelectedDate(isSelected ? null : dateStr)}
              style={{
                borderRadius: 8, padding: '5px 1px 4px', textAlign: 'center',
                cursor: isFuture ? 'default' : 'pointer', opacity: isFuture ? 0.22 : 1,
                background: isSelected ? '#2a1050' : isLocked ? 'rgba(168,85,247,0.13)' : 'transparent',
                border: isToday ? '1px solid #5b21b6' : isSelected ? '1px solid #7c3aed' : '1px solid transparent',
                transition: 'background .12s',
              }}
            >
              <div style={{ fontSize: 13, lineHeight: 1.3, fontWeight: isToday ? 700 : 400, color: isSelected ? '#e8d5a3' : isToday ? '#c084fc' : '#9ca3af' }}>{d}</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 2, minHeight: 5 }}>
                {hasLockChange && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#a855f7' }} />}
                {herDot && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#ec4899' }} />}
                {himFullDot && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#3b82f6' }} />}
                {himRuinedDot && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#ef4444' }} />}
                {himEdgedDot && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#f59e0b' }} />}
              </div>
            </div>
          )
        })}
      </div>

      {/* Dot legend */}
      <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        {[['#a855f7','Lock event'],['#ec4899','Her'],['#3b82f6','Him full'],['#ef4444','Him ruined'],['#f59e0b','Him edged']].map(([color, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: 11, color: '#4b5563' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Selected day panel */}
      {selectedDate && (
        <div style={{ marginTop: 14, background: '#070710', borderRadius: 12, padding: 14, animation: 'slideUp .2s ease' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e5e7eb', marginBottom: 12 }}>
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>

          {isKH && (
            <>
              {/* Lock toggle for this day */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>Lock Status</div>
                <button
                  onClick={() => onToggleLock(selectedDate)}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                    fontFamily: 'inherit', cursor: 'pointer',
                    background: selectedLockState === 'lock' ? 'rgba(168,85,247,0.1)' : 'rgba(34,197,94,0.08)',
                    border: `1px solid ${selectedLockState === 'lock' ? '#6d28d9' : '#14532d'}`,
                    color: selectedLockState === 'lock' ? '#a855f7' : '#22c55e',
                  }}
                >
                  {selectedLockState === 'lock' ? '🔒 Locked' : '🔓 Unlocked'} — tap to {selectedLockState === 'lock' ? 'unlock' : 'lock'}
                </button>
              </div>

              {/* Orgasm buttons for this day */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>Log Orgasm</div>
                <div style={{ background: '#0a0a18', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, color: '#ec4899', fontWeight: 600, marginBottom: 6 }}>Her</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                    {ORG_TYPES.map(t => (
                      <button key={t} onClick={() => onLogOrgasm('her', t, 'full', selectedDate)}
                        style={{ padding: '7px 4px', borderRadius: 7, fontSize: 12, background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.25)', color: '#ec4899', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {ORG_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ background: '#0a0a18', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 6 }}>Him</div>
                  {qRows.map((q, qi) => (
                    <div key={q.quality} style={{ marginBottom: qi === 0 ? 7 : 0 }}>
                      <div style={{ fontSize: 10, color: q.color, fontWeight: 600, marginBottom: 4 }}>{q.label}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                        {ORG_TYPES.map(t => (
                          <button key={t} onClick={() => onLogOrgasm('him', t, q.quality, selectedDate)}
                            style={{ padding: '7px 4px', borderRadius: 7, fontSize: 12, background: q.bg, border: `1px solid ${q.border}`, color: q.color, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {ORG_LABELS[t]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: 7 }}>
                    <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600, marginBottom: 4 }}>Edged</div>
                    <button onClick={() => onLogOrgasm('him', 'edge', 'edged', selectedDate)}
                      style={{ width: '100%', padding: '7px', borderRadius: 7, fontSize: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b', cursor: 'pointer', fontFamily: 'inherit' }}>
                      + Log Session
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Entries logged for this day */}
          {(selectedDay?.lockEvents?.length > 0 || selectedDay?.dayOrgasms?.length > 0) && (
            <div>
              <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>Logged</div>
              {(selectedDay?.lockEvents || []).map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #0d0d16' }}>
                  <span style={{ fontSize: 14 }}>{e.type === 'lock' ? '🔒' : '🔓'}</span>
                  <span style={{ fontSize: 13, color: '#9ca3af', flex: 1 }}>{e.type === 'lock' ? 'Locked' : 'Unlocked'}</span>
                </div>
              ))}
              {(selectedDay?.dayOrgasms || []).map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #0d0d16' }}>
                  <span style={{ fontSize: 14 }}>{e.who === 'her' ? '💗' : e.type === 'edge' ? '🔶' : e.quality === 'full' ? '💙' : '❌'}</span>
                  <span style={{ flex: 1, fontSize: 13, color: e.who === 'her' ? '#ec4899' : e.type === 'edge' ? '#f59e0b' : e.quality === 'full' ? '#3b82f6' : '#ef4444' }}>
                    {e.who === 'her' ? 'Her' : 'Him'} · {e.type === 'edge' ? 'Edged' : ORG_LABELS[e.type]}{e.who === 'him' && e.type !== 'edge' ? ` · ${e.quality}` : ''}
                  </span>
                  {isKH && (
                    <button onClick={() => onRemoveOrgasm(e.id)}
                      style={{ color: '#374151', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '0 2px', lineHeight: 1 }}>×</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── TRACK TAB ─────────────────────────────────────────────────────────────────

function TrackTab({ lockLog, orgasmLog, onToggleLock, onLogOrgasm, onRemoveOrgasm, isKH }) {
  const [subTab, setSubTab] = useState('stats')

  const ls = computeLockStats(lockLog)
  const os = computeOrgasmStats(orgasmLog)

  const lockColor = ls.isLocked ? '#a855f7' : '#22c55e'
  const lockBg = ls.isLocked ? 'rgba(168,85,247,0.1)' : 'rgba(34,197,94,0.08)'
  const lockBorder = ls.isLocked ? '#6d28d9' : '#14532d'

  const herPieData = ORG_TYPES.map(k => ({ name: ORG_LABELS[k], value: os.her[k] || 0, color: ORG_COLORS[k] }))
  const himTypePieData = ORG_TYPES.map(k => ({ name: ORG_LABELS[k], value: os.him[k] || 0, color: ORG_COLORS[k] }))
  const himQualityPieData = [
    { name: 'Full', value: os.himFull, color: '#22c55e' },
    { name: 'Ruined', value: os.himRuined, color: '#ef4444' },
    { name: 'Edged', value: os.himEdged, color: '#f59e0b' },
  ]
  const totalRatio = os.himTotal + os.herTotal
  const herPct = totalRatio ? Math.round((os.herTotal / totalRatio) * 100) : 50
  const himPct = 100 - herPct

  const qRows = [
    { quality: 'full', label: 'Full', color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)' },
    { quality: 'ruined', label: 'Ruined', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' },
  ]

  return (
    <div>
      {/* Stats / Calendar sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #111' }}>
        {['stats', 'calendar'].map(t => (
          <button key={t} onClick={() => setSubTab(t)} style={{
            flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: 'none', fontFamily: 'inherit',
            color: subTab === t ? '#f3f4f6' : '#4b5563',
            borderBottom: subTab === t ? '2px solid #a855f7' : '2px solid transparent',
            transition: 'color .15s',
          }}>
            {t === 'stats' ? 'Stats' : 'Calendar'}
          </button>
        ))}
      </div>

      {subTab === 'calendar' && (
        <CalendarView
          lockLog={lockLog} orgasmLog={orgasmLog}
          onToggleLock={onToggleLock} onLogOrgasm={onLogOrgasm} onRemoveOrgasm={onRemoveOrgasm}
          isKH={isKH}
        />
      )}

      {subTab === 'stats' && (
        <div style={{ padding: 16 }}>

          {/* Lock Status */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>Lock Status</div>
            <button
              onClick={isKH ? () => onToggleLock() : undefined}
              style={{
                width: '100%', padding: '14px', borderRadius: 12, fontSize: 17, fontWeight: 700,
                fontFamily: 'inherit', cursor: isKH ? 'pointer' : 'default', marginBottom: 10,
                background: lockBg, border: `2px solid ${lockBorder}`, color: lockColor, transition: 'all .2s',
              }}
            >
              {ls.isLocked ? '🔒 Locked' : '🔓 Unlocked'}
              {isKH && <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 8, opacity: 0.6 }}>tap to {ls.isLocked ? 'unlock' : 'lock'}</span>}
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ background: '#070710', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 3 }}>
                  {ls.isLocked ? 'Locked for' : 'Status'}
                </div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, color: ls.isLocked ? '#a855f7' : '#6b7280', lineHeight: 1.2 }}>
                  {ls.isLocked ? `${ls.currentDays}d` : 'Unlocked'}
                </div>
                {ls.isLocked && ls.lockedSince && (
                  <div style={{ fontSize: 10, color: '#374151', marginTop: 3 }}>since {fmtDate(ls.lockedSince)}</div>
                )}
              </div>
              <div style={{ background: '#070710', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 3 }}>Longest lock</div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, color: '#e5e7eb', lineHeight: 1.2 }}>
                  {ls.longestDays ? `${ls.longestDays}d` : '—'}
                </div>
              </div>
              <div style={{ background: '#070710', borderRadius: 10, padding: '10px 12px', gridColumn: 'span 2' }}>
                <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 3 }}>Total days locked</div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, color: '#e5e7eb' }}>
                  {ls.totalDays ? `${ls.totalDays}d` : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Log Orgasms — keyholder only */}
          {isKH && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>Log Orgasm Today</div>
              <div style={{ background: '#070710', borderRadius: 10, padding: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#ec4899', marginBottom: 8 }}>Her</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {ORG_TYPES.map(t => (
                    <button key={t} onClick={() => onLogOrgasm('her', t, 'full')}
                      style={{ padding: '9px 4px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.25)', color: '#ec4899', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {ORG_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ background: '#070710', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>Him</div>
                {qRows.map((q, qi) => (
                  <div key={q.quality} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: q.color, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>{q.label}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                      {ORG_TYPES.map(t => (
                        <button key={t} onClick={() => onLogOrgasm('him', t, q.quality)}
                          style={{ padding: '9px 4px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: q.bg, border: `1px solid ${q.border}`, color: q.color, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {ORG_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>Edged</div>
                  <button onClick={() => onLogOrgasm('him', 'edge', 'edged')}
                    style={{ width: '100%', padding: '9px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b', cursor: 'pointer', fontFamily: 'inherit' }}>
                    + Log Session
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Her orgasms chart */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
              Her Orgasms <span style={{ color: '#ec4899', fontWeight: 700 }}>{os.herTotal}</span>
            </div>
            <div style={{ background: '#070710', borderRadius: 10, padding: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
              <PieChart data={herPieData} size={90} centerLabel={os.herTotal > 0 ? String(os.herTotal) : ''} />
              <PieLegend data={herPieData} />
            </div>
          </div>

          {/* His orgasms charts */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
              His Orgasms <span style={{ color: '#9ca3af', fontWeight: 700 }}>{os.himTotal}</span>{os.himEdged > 0 && <span style={{ color: '#f59e0b', fontWeight: 700, marginLeft: 6 }}>+ {os.himEdged} edged</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ background: '#070710', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 10, color: '#4b5563', marginBottom: 8 }}>Full vs Ruined</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PieChart data={himQualityPieData} size={76} centerLabel={os.himTotal > 0 ? String(os.himTotal) : ''} />
                  <PieLegend data={himQualityPieData} />
                </div>
              </div>
              <div style={{ background: '#070710', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 10, color: '#4b5563', marginBottom: 8 }}>By Type</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PieChart data={himTypePieData} size={76} />
                  <PieLegend data={himTypePieData} />
                </div>
              </div>
            </div>
          </div>

          {/* Him vs Her ratio */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>Him vs Her</div>
            <div style={{ background: '#070710', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: '#3b82f6', fontWeight: 700 }}>Him {os.himTotal}</span>
                {totalRatio > 0 && os.himTotal > 0 && os.herTotal > 0 && (
                  <span style={{ fontSize: 11, color: '#4b5563' }}>{(os.himTotal / os.herTotal).toFixed(1)} : 1</span>
                )}
                <span style={{ color: '#ec4899', fontWeight: 700 }}>Her {os.herTotal}</span>
              </div>
              {totalRatio > 0 ? (
                <div style={{ height: 10, borderRadius: 5, overflow: 'hidden', display: 'flex', background: '#111' }}>
                  {himPct > 0 && <div style={{ width: `${himPct}%`, background: 'linear-gradient(90deg,#1d4ed8,#3b82f6)', transition: 'width .5s' }} />}
                  {herPct > 0 && <div style={{ width: `${herPct}%`, background: 'linear-gradient(90deg,#be185d,#ec4899)' }} />}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#374151', textAlign: 'center', padding: '4px 0' }}>No orgasms logged yet</div>
              )}
              {totalRatio > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 10, color: '#4b5563' }}>
                  <span>{himPct}%</span><span>{herPct}%</span>
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

// ── ROLE SELECT ───────────────────────────────────────────────────────────────

function RoleSelect({ onSelect }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#08080d', zIndex: 300,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '0 32px',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 48, animation: 'fadeIn .6s ease' }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 46, fontWeight: 700, color: '#e8d5a3', letterSpacing: '-0.5px' }}>
          The Bag
        </div>
        <div style={{ color: '#6b7280', fontSize: 15, marginTop: 6, fontStyle: 'italic' }}>
          A game of control and trust.
        </div>
      </div>
      <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          onClick={() => onSelect('keyholder')}
          style={{
            padding: '22px 24px', borderRadius: 16, cursor: 'pointer',
            background: 'rgba(107,63,160,0.07)', border: '2px solid #6b3fa0',
            transition: 'border-color .15s, background .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(107,63,160,0.14)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(107,63,160,0.07)' }}
        >
          <div style={{ fontSize: 18, fontWeight: 600, color: '#c084fc' }}>Keyholder</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Full control. You hold the key.</div>
        </div>
        <div
          onClick={() => onSelect('him')}
          style={{
            padding: '22px 24px', borderRadius: 16, cursor: 'pointer',
            background: 'rgba(42,42,53,0.35)', border: '2px solid #2a2a35',
            transition: 'border-color .15s, background .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(42,42,53,0.55)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(42,42,53,0.35)' }}
        >
          <div style={{ fontSize: 18, fontWeight: 600, color: '#9ca3af' }}>Him</div>
          <div style={{ fontSize: 13, color: '#4b5563', marginTop: 4 }}>Your fate is in her hands.</div>
        </div>
      </div>
    </div>
  )
}


// ── STATS BAR ─────────────────────────────────────────────────────────────────

function StatsBar({ stats, bag }) {
  const d = droughtDays(stats.lastGreenDate)
  const total = bagTotal(bag)
  return (
    <Card style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 0 }}>
        {/* Left: Drought + Streak */}
        <div style={{ flex: 1, paddingRight: 16, borderRight: '1px solid #111' }}>
          <div style={{ display: 'flex', gap: 20 }}>
            <div>
              <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 2 }}>Drought</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700, color: droughtColor(d), lineHeight: 1 }}>
                {d !== null ? `${d}d` : '—'}
              </div>
              <div style={{ fontSize: 11, color: '#374151', marginTop: 2 }}>Last: {fmtDate(stats.lastGreenDate)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 2 }}>Streak</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700, color: stats.currentStreak > 0 ? '#22c55e' : '#374151', lineHeight: 1 }}>
                {stats.currentStreak}
              </div>
              <div style={{ fontSize: 11, color: '#374151', marginTop: 2 }}>Best: {stats.bestStreak}</div>
            </div>
          </div>
        </div>
        {/* Right: Draw counts */}
        <div style={{ flex: 1, paddingLeft: 16 }}>
          <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>Total Draws</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: '#f3f4f6', marginBottom: 8 }}>
            {stats.totalDraws}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
            {[['🟢', stats.greens], ['🔵', stats.blues], ['🔴', stats.reds], ['🥇', stats.golds]].map(([em, val]) => (
              <div key={em} style={{ fontSize: 13, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 14 }}>{em}</span> {val}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

// ── DRAW ANIMATION ────────────────────────────────────────────────────────────

function DrawAnim() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.92)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24,
    }}>
      <GreyOrb size={80} />
      <div style={{ fontSize: 18, color: '#9ca3af', fontStyle: 'italic', letterSpacing: '.5px' }}>Drawing…</div>
    </div>
  )
}

// ── DRAW MODAL ────────────────────────────────────────────────────────────────

function DrawModal({ result, state, setState, onClose, onUndo }) {
  const [showOverride, setShowOverride] = useState(false)
  const [overrideText, setOverrideText] = useState('')
  const { color, consequence, consequenceCategory, autoReset, ruined } = result
  const m = MT[color]

  function handleApplyOverride() {
    if (!overrideText.trim()) return
    setState(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      if (next.drawHistory.length > 0) {
        next.drawHistory[0].consequence = overrideText.trim()
        next.drawHistory[0].consequenceCategory = null
      }
      if (next.pendingConsequence) {
        next.pendingConsequence.text = overrideText.trim()
      }
      return next
    })
    setShowOverride(false)
  }

  const titles = { blue: 'Back in the cage', green: ruined ? 'Ruined Release' : 'Release', red: 'Consequence', gold: 'Special' }
  const subs = { blue: 'Nothing happens. The wait continues.', green: ruined ? 'This one doesn\'t count. No reset, no relief.' : 'Full orgasm granted — the wait is over.', red: '', gold: '' }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.9)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: 420, background: '#0c0c14',
          border: `1px solid ${m.border}`, borderRadius: '24px 24px 0 0',
          padding: '32px 24px 48px', animation: 'popIn .38s cubic-bezier(.34,1.56,.64,1) both',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div style={{ width: 40, height: 4, background: '#1f2937', borderRadius: 2, margin: '0 auto 28px' }} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
          <Orb color={color} size={80} animate="revPop" />
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, color: m.orb, marginBottom: 6 }}>
              {titles[color]}
            </div>
            {subs[color] && <div style={{ fontSize: 16, color: '#9ca3af' }}>{subs[color]}</div>}
          </div>

          {/* Green: ruined notice */}
          {color === 'green' && ruined && (
            <div style={{ width: '100%', background: 'rgba(239,68,68,.06)', border: '1px solid #7f1d1d', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 13, color: '#ef4444' }}>🚫 Ruined — no bag reset, no blue restore. The denial continues.</div>
            </div>
          )}
          {/* Green: auto-reset notice */}
          {color === 'green' && autoReset && (
            <div style={{ width: '100%', background: 'rgba(34,197,94,.06)', border: '1px solid #14532d', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 13, color: '#22c55e' }}>↻ Auto-reset triggered — Green marbles cleared, Blue restored to 30</div>
            </div>
          )}

          {/* Red: consequence box */}
          {color === 'red' && (
            <div style={{ width: '100%' }}>
              {consequence ? (
                <div style={{
                  background: consequenceCategory === 'reward' ? 'rgba(34,197,94,.06)' : 'rgba(239,68,68,.06)',
                  border: `1px solid ${consequenceCategory === 'reward' ? '#14532d' : '#7f1d1d'}`,
                  borderRadius: 10, padding: 14, textAlign: 'left',
                }}>
                  <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
                    {consequenceCategory === 'reward' ? '🎁 Reward for her' : '⚡ Punishment for him'}
                  </div>
                  <div style={{ fontSize: 15, color: '#e5e7eb' }}>{consequence}</div>
                </div>
              ) : (
                <div style={{ fontSize: 14, color: '#6b7280', fontStyle: 'italic' }}>No consequence set. She decides.</div>
              )}

              {/* Override */}
              {!showOverride ? (
                <button
                  onClick={() => setShowOverride(true)}
                  style={{ marginTop: 10, fontSize: 13, color: '#6b7280', background: 'none', cursor: 'pointer', textDecoration: 'underline', border: 'none', padding: 0 }}
                >
                  Override consequence
                </button>
              ) : (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    value={overrideText}
                    onChange={e => setOverrideText(e.target.value)}
                    placeholder="Type custom consequence…"
                    rows={2}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 8,
                      background: '#111', border: '1px solid #1f2937', color: '#f3f4f6',
                      fontSize: 14, resize: 'none',
                    }}
                  />
                  <Btn variant="red" onClick={handleApplyOverride} style={{ width: '100%' }}>Apply override</Btn>
                </div>
              )}
            </div>
          )}

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <Btn
              variant={color === 'blue' ? 'ghost' : color === 'green' ? 'green' : 'red'}
              onClick={onClose}
              style={{ width: '100%', padding: '12px 18px', fontSize: 15 }}
            >
              Done
            </Btn>
            {onUndo && (
              <button
                onClick={onUndo}
                style={{ fontSize: 13, color: '#6b7280', background: 'none', cursor: 'pointer', textDecoration: 'underline', border: 'none', padding: 4 }}
              >
                Undo this draw
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── GOLD MODAL ────────────────────────────────────────────────────────────────

function GoldModal({ state, setState, onClose, onUndo }) {
  const [phase, setPhase] = useState('choice')
  const [pushResult, setPushResult] = useState(null)

  function clearReds(prev) {
    const next = JSON.parse(JSON.stringify(prev))
    next.bag.red = 0
    return next
  }

  function handleGamble() { setPhase('gamble') }

  function handleCashIn() {
    // Guaranteed release + all reds cleared
    setState(prev => clearReds(prev))
    setPhase('cashin')
  }

  function handlePushLuck() {
    // Draw again from current bag
    const color = drawMarble(state.bag)
    if (!color) { setPhase('pushempty'); return }
    const isGood = color === 'green' || color === 'gold'
    if (!isGood) {
      // gold wasted + 3 blues added
      setState(prev => {
        const next = JSON.parse(JSON.stringify(prev))
        next.bag.blue = (next.bag.blue || 0) + 3
        return next
      })
    }
    setPushResult({ color, isGood })
    setPhase('pushresult')
  }

  function handleInstantReward() { setPhase('instantreward') }

  function handleMercy() {
    setState(prev => clearReds(prev))
    setPhase('mercy')
  }

  const GoldCard = ({ children, onClick }) => (
    <div
      onClick={onClick}
      style={{
        padding: '18px 20px', borderRadius: 14, cursor: 'pointer',
        background: 'rgba(245,158,11,.04)', border: '1px solid #78350f',
        transition: 'background .15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,.1)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,158,11,.04)' }}
    >
      {children}
    </div>
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.9)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: 420, background: '#0c0c14',
          border: '1px solid #78350f', borderRadius: '24px 24px 0 0',
          padding: '32px 24px 48px', animation: 'popIn .38s cubic-bezier(.34,1.56,.64,1) both',
          maxHeight: '90vh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 40, height: 4, background: '#1f2937', borderRadius: 2, margin: '0 auto 28px' }} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
          <Orb color="gold" size={72} animate={phase === 'choice' ? 'revPop' : undefined} />
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700, color: '#f59e0b' }}>
            ✨ Gold Marble
          </div>

          {/* PHASE: choice */}
          {phase === 'choice' && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', marginTop: 8 }}>
              <GoldCard onClick={handleGamble}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#f59e0b', marginBottom: 4 }}>🎲 Gamble</div>
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Go all-in. Cash in safely or push your luck.</div>
              </GoldCard>
              <GoldCard onClick={handleInstantReward}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#f59e0b', marginBottom: 4 }}>✨ Instant Reward</div>
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Guaranteed release + she grants one special request.</div>
              </GoldCard>
              <GoldCard onClick={handleMercy}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#f59e0b', marginBottom: 4 }}>🕊️ Mercy</div>
                <div style={{ fontSize: 13, color: '#9ca3af' }}>All red marbles cleared. No orgasm. Clean slate.</div>
              </GoldCard>
            </div>
          )}

          {/* PHASE: gamble sub-choice */}
          {phase === 'gamble' && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', marginTop: 8 }}>
              <GoldCard onClick={handleCashIn}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#f59e0b', marginBottom: 4 }}>💰 Cash In</div>
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Guaranteed release + all reds cleared. Safe.</div>
              </GoldCard>
              <GoldCard onClick={handlePushLuck}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#f59e0b', marginBottom: 4 }}>🎰 Push Luck</div>
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Draw again. Green/Gold → her special request. Blue/Red → gold wasted + 3 blues added.</div>
              </GoldCard>
              <button onClick={() => setPhase('choice')} style={{ fontSize: 13, color: '#6b7280', background: 'none', cursor: 'pointer', textDecoration: 'underline', border: 'none', marginTop: 4 }}>
                ← Back
              </button>
            </div>
          )}

          {/* PHASE: cash in result */}
          {phase === 'cashin' && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'rgba(34,197,94,.06)', border: '1px solid #14532d', borderRadius: 10, padding: 14, textAlign: 'left' }}>
                <div style={{ fontSize: 15, color: '#22c55e', fontWeight: 600 }}>💰 Cashed In</div>
                <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>Guaranteed release granted. All red marbles cleared.</div>
              </div>
              <Btn variant="gold" onClick={onClose} style={{ width: '100%', padding: '12px 18px' }}>Done</Btn>
            </div>
          )}

          {/* PHASE: push luck result */}
          {phase === 'pushresult' && pushResult && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Orb color={pushResult.color} size={56} animate="revPop" />
              {pushResult.isGood ? (
                <div style={{ background: 'rgba(34,197,94,.06)', border: '1px solid #14532d', borderRadius: 10, padding: 14, textAlign: 'left' }}>
                  <div style={{ fontSize: 15, color: '#22c55e', fontWeight: 600 }}>🎰 Luck held — {pushResult.color} drawn</div>
                  <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>She grants one special request.</div>
                </div>
              ) : (
                <div style={{ background: 'rgba(239,68,68,.06)', border: '1px solid #7f1d1d', borderRadius: 10, padding: 14, textAlign: 'left' }}>
                  <div style={{ fontSize: 15, color: '#ef4444', fontWeight: 600 }}>🎰 Luck ran out — {pushResult.color} drawn</div>
                  <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>Gold wasted. +3 blue marbles added to bag.</div>
                </div>
              )}
              <Btn variant="gold" onClick={onClose} style={{ width: '100%', padding: '12px 18px' }}>Done</Btn>
            </div>
          )}

          {/* PHASE: push luck empty bag */}
          {phase === 'pushempty' && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 14, color: '#9ca3af' }}>The bag is empty — nothing to draw. Gold wasted.</div>
              <Btn variant="gold" onClick={onClose} style={{ width: '100%', padding: '12px 18px' }}>Done</Btn>
            </div>
          )}

          {/* PHASE: instant reward */}
          {phase === 'instantreward' && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'rgba(245,158,11,.06)', border: '1px solid #78350f', borderRadius: 10, padding: 14, textAlign: 'left' }}>
                <div style={{ fontSize: 15, color: '#f59e0b', fontWeight: 600 }}>✨ Instant Reward</div>
                <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>Guaranteed release granted. She gets one special request of her choosing.</div>
              </div>
              <Btn variant="gold" onClick={onClose} style={{ width: '100%', padding: '12px 18px' }}>Done</Btn>
            </div>
          )}

          {/* PHASE: mercy */}
          {phase === 'mercy' && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'rgba(245,158,11,.06)', border: '1px solid #78350f', borderRadius: 10, padding: 14, textAlign: 'left' }}>
                <div style={{ fontSize: 15, color: '#f59e0b', fontWeight: 600 }}>🕊️ Mercy Granted</div>
                <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>All red marbles removed from bag. No orgasm. Clean slate.</div>
              </div>
              <Btn variant="gold" onClick={onClose} style={{ width: '100%', padding: '12px 18px' }}>Done</Btn>
            </div>
          )}

          {/* Undo always available from gold modal */}
          {phase === 'choice' && onUndo && (
            <button
              onClick={onUndo}
              style={{ fontSize: 13, color: '#6b7280', background: 'none', cursor: 'pointer', textDecoration: 'underline', border: 'none', marginTop: 4 }}
            >
              Undo this draw
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── UNDO TOAST ────────────────────────────────────────────────────────────────

function UndoToast({ data, onUndo, onDismiss }) {
  const barRef = useRef(null)

  function handleBarAnimEnd() {
    onDismiss()
  }

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%',
      transform: 'translateX(-50%)',
      width: 'calc(100% - 32px)', maxWidth: 428, zIndex: 400,
      background: '#0c0c14', border: '1px solid #1f2937', borderRadius: 12,
      overflow: 'hidden', animation: 'toastIn .25s ease both',
    }}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Orb color={data.color} size={26} />
        <span style={{ fontSize: 14, color: '#9ca3af', flex: 1 }}>
          Drew a <strong style={{ color: MT[data.color].orb }}>{data.color}</strong> marble
        </span>
        <Btn variant="gold" onClick={onUndo} style={{ padding: '6px 14px', fontSize: 13 }}>Undo</Btn>
      </div>
      <div style={{ height: 3, background: '#111' }}>
        <div
          ref={barRef}
          onAnimationEnd={handleBarAnimEnd}
          style={{ height: '100%', background: MT[data.color].orb, animation: 'shrink 5s linear forwards' }}
        />
      </div>
    </div>
  )
}

// ── MANUAL MODAL ──────────────────────────────────────────────────────────────

function ManualModal({ onClose }) {
  const Section = ({ title, children }) => (
    <Card style={{ padding: '20px 20px', marginBottom: 12 }}>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: '#e8d5a3', marginBottom: 10 }}>{title}</div>
      {children}
    </Card>
  )
  const P = ({ children }) => <div style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.7, marginBottom: 8 }}>{children}</div>
  const GoldSubCard = ({ title, children }) => (
    <div style={{ background: 'rgba(245,158,11,.04)', border: '1px solid #78350f', borderRadius: 10, padding: 14, marginBottom: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#f59e0b', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#9ca3af' }}>{children}</div>
    </div>
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.97)', overflowY: 'auto' }}
      onClick={onClose}
    >
      <div
        style={{ maxWidth: 460, margin: '0 auto', padding: '24px 16px 80px' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, position: 'sticky', top: 0, background: 'rgba(0,0,0,.97)', zIndex: 1, padding: '8px 0' }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#e8d5a3' }}>📖 The Rules</div>
          <Btn variant="ghost" onClick={onClose} style={{ padding: '6px 14px' }}>✕ Close</Btn>
        </div>

        <Section title="🎱 What is The Bag?">
          <P>A physical marble bag mechanic turned digital. The Keyholder controls a bag of coloured marbles. The sub earns or risks marbles through his behaviour. During play sessions he is edged first, then the Keyholder draws a marble — the colour determines what happens next.</P>
        </Section>

        <Section title="🎨 Marble Colours & What They Mean">
          {[['blue','Back in the cage','Nothing happens. He waits.'],['green','Release','Full orgasm or ruin — Keyholder\'s call. Triggers auto-reset.'],['red','Consequence','A punishment for him or a reward for her. Locks next draw until resolved.'],['gold','Special','Rare. Only awarded manually. Keyholder chooses from three paths.']].map(([c,label,desc]) => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, padding: 12, background: MT[c].bg, border: `1px solid ${MT[c].border}`, borderRadius: 10 }}>
              <Orb color={c} size={32} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: MT[c].orb }}>{label}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{desc}</div>
              </div>
            </div>
          ))}
        </Section>

        <Section title="➕ How Marbles Are Added">
          <P><strong style={{ color: '#e5e7eb' }}>Good day logged</strong> → +1 green marble, note saved.</P>
          <P><strong style={{ color: '#e5e7eb' }}>Bad day logged</strong> → +1 red marble, streak reset.</P>
          <P><strong style={{ color: '#e5e7eb' }}>Feeling cruel</strong> → Keyholder manually adds blues via Settings.</P>
          <P><strong style={{ color: '#e5e7eb' }}>Exceptional behaviour</strong> → Gold marble awarded via Settings (intentionally subtle).</P>
          <P>The starting bag is 30 blue, 0 green, 0 red, 0 gold. Gold is never in the starting bag.</P>
        </Section>

        <Section title="🤲 Drawing a Marble">
          <P>1. He is edged first (offline).</P>
          <P>2. Keyholder taps <strong style={{ color: '#e5e7eb' }}>Draw a Marble</strong>.</P>
          <P>3. A 1.7-second animation plays (pulsing mystery orb).</P>
          <P>4. Result is computed at tap time — fair, not influenced by animation.</P>
          <P>5. Drawn marble is removed from the bag.</P>
          <P>6. Result appears as a modal. A 5-second undo is available.</P>
          <P>Drawing is blocked when: not Keyholder, blackout active, bag empty, or a pending consequence exists.</P>
        </Section>

        <Section title="♻️ After a Green Draw — Auto-Reset">
          <P>Every green draw automatically resets the bag:</P>
          <P>• Green marbles → 0</P>
          <P>• Blue marbles → max(current blue, 30)</P>
          <P>• Red and gold → unchanged</P>
        </Section>

        <Section title="🔴 Red Draw — Punishment or Reward">
          <P>A consequence is randomly selected from the consequence list. It may be a punishment (for him) or a reward (for her).</P>
          <P>The draw button is hard-locked with <em>"Resolve consequence first"</em> until the Keyholder marks it done.</P>
          <P>A red banner appears on both screens showing what is owed. Only the Keyholder can resolve it.</P>
        </Section>

        <Section title="✨ Gold Marble — Three Choices">
          <P>The Keyholder chooses one of three paths:</P>
          <GoldSubCard title="🎲 Gamble">
            <strong>Cash In</strong>: Guaranteed release + all reds cleared. Safe.<br/>
            <strong>Push Luck</strong>: Draw again. Green/Gold → she grants one special request. Blue/Red → gold wasted + 3 blues added.
          </GoldSubCard>
          <GoldSubCard title="✨ Instant Reward">Guaranteed release + she grants one special request. No risk.</GoldSubCard>
          <GoldSubCard title="🕊️ Mercy">All reds cleared from bag. No orgasm. Clean slate.</GoldSubCard>
        </Section>

        <Section title="⛔ Blackout Week">
          <P>Keyholder activates via Settings toggle. Draw button is disabled for the full duration. A red banner appears on both screens. Blackout ends only when Keyholder toggles it off — no timer.</P>
          <P>When the Daily Lecture Prompt is enabled, a reminder text appears: <em>"Remind him today what his behaviour is costing him."</em></P>
        </Section>

        <Section title="🔥 Streak & Drought Counters">
          <P><strong style={{ color: '#e5e7eb' }}>Streak</strong> — consecutive good days logged. Resets on a bad day. Shown in green when active.</P>
          <P><strong style={{ color: '#e5e7eb' }}>Drought</strong> — days since last green draw. Colour codes: grey (0–7d), orange (8–14d), red (15d+).</P>
        </Section>

        <Section title="👥 The Two Roles">
          <P><strong style={{ color: '#c084fc' }}>Keyholder</strong> — draw, log behaviour, manage all settings, mark consequence done, award gold, activate blackout.</P>
          <P><strong style={{ color: '#9ca3af' }}>Him</strong> — read-only: marble counts, odds, stats, behaviour log, draw history, pending consequence banner.</P>
          <P>Role is selected locally on each device. Both devices open the same URL — one picks Keyholder, one picks Him.</P>
        </Section>

        <Section title="⚙️ Settings (Keyholder Only)">
          <P>• <strong style={{ color: '#e5e7eb' }}>Blackout Mode</strong> — disables drawing for an indefinite period.</P>
          <P>• <strong style={{ color: '#e5e7eb' }}>Daily Lecture Prompt</strong> — shows a reminder text during blackout.</P>
          <P>• <strong style={{ color: '#e5e7eb' }}>Consequence List</strong> — add/remove punishments and rewards.</P>
          <P>• <strong style={{ color: '#e5e7eb' }}>Set Marble Counts</strong> — directly edit the bag.</P>
          <P>• <strong style={{ color: '#e5e7eb' }}>Award Gold Marble</strong> — for exceptional behaviour (subtle, intentional).</P>
          <P>• <strong style={{ color: '#e5e7eb' }}>Reset Everything</strong> — clears bag, logs, and stats. Preserves consequence list and settings.</P>
        </Section>
      </div>
    </div>
  )
}

// ── APP ROOT ──────────────────────────────────────────────────────────────────

// ── SPIN WHEEL ────────────────────────────────────────────────────────────────

function SpinWheel({ spinData, allConsequences, onDone }) {
  const [displayText, setDisplayText] = useState('…')
  const [displayCategory, setDisplayCategory] = useState(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const texts = allConsequences.length > 1 ? allConsequences.map(c => c.text) : [spinData.consequence, '…', '…', '…']
    let i = Math.floor(Math.random() * texts.length)
    let delay = 70
    let count = 0
    const TOTAL = 26
    function tick() {
      count++
      if (count >= TOTAL) {
        setDisplayText(spinData.consequence)
        setDisplayCategory(spinData.consequenceCategory)
        setDone(true)
        return
      }
      setDisplayText(texts[i % texts.length])
      i++
      if (count > 18) delay += 50
      setTimeout(tick, delay)
    }
    setTimeout(tick, 80)
  }, [])

  useEffect(() => {
    if (!done) return
    const t = setTimeout(onDone, 1100)
    return () => clearTimeout(t)
  }, [done])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 250, background: 'rgba(0,0,0,.93)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        width: '90%', maxWidth: 380, background: '#0c0c14',
        border: `1px solid ${done && displayCategory === 'reward' ? '#14532d' : '#7f1d1d'}`,
        borderRadius: 20, padding: '36px 28px 40px', textAlign: 'center',
        animation: 'popIn .38s cubic-bezier(.34,1.56,.64,1) both',
        transition: 'border-color .4s',
      }}>
        <Orb color="red" size={64} animate="revPop" />
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f87171', margin: '16px 0 20px' }}>
          Consequence
        </div>
        <div style={{
          minHeight: 76, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: done ? (displayCategory === 'reward' ? 'rgba(34,197,94,.06)' : 'rgba(239,68,68,.06)') : 'rgba(127,29,29,.1)',
          border: `1px solid ${done ? (displayCategory === 'reward' ? '#14532d' : '#7f1d1d') : '#450a0a'}`,
          borderRadius: 12, padding: '14px 18px', transition: 'all .35s',
        }}>
          <span style={{ fontSize: done ? 15 : 12, color: done ? '#e5e7eb' : '#4b5563', fontWeight: done ? 600 : 400, lineHeight: 1.5, transition: 'all .3s' }}>
            {displayText}
          </span>
        </div>
        {done && (
          <div style={{ marginTop: 10, fontSize: 12, color: displayCategory === 'reward' ? '#22c55e' : '#f87171', animation: 'fadeIn .4s ease' }}>
            {displayCategory === 'reward' ? '🎁 Reward for her' : '⚡ Punishment for him'}
          </div>
        )}
      </div>
    </div>
  )
}

// ── MARBLE BAG VISUAL ─────────────────────────────────────────────────────────

function BagVisual({ bag, ruinedGreens }) {
  const total = (bag.blue || 0) + (bag.green || 0) + (bag.red || 0) + (bag.gold || 0)
  const FILL_BOTTOM = 172
  const FILL_H = 120

  let bands = [], yPos = FILL_BOTTOM
  for (const c of ['blue', 'green', 'red', 'gold']) {
    const count = bag[c] || 0
    if (!count || !total) continue
    const h = (count / total) * FILL_H
    bands.push({ color: c, y: yPos - h, h })
    yPos -= h
  }

  const bagPath = 'M80,20 C67,20 57,27 51,36 C38,34 30,45 33,57 C21,63 15,76 15,92 Q13,172 80,177 Q147,172 145,92 C145,76 139,63 127,57 C130,45 122,34 109,36 C103,27 93,20 80,20 Z'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 12 }}>
      <svg viewBox="0 0 160 195" width="180" height="195" style={{ overflow: 'visible' }}>
        <defs>
          <clipPath id="bagFill">
            <path d={bagPath} />
          </clipPath>
        </defs>
        <g clipPath="url(#bagFill)">
          <rect x="0" y="0" width="160" height="195" fill="#0a0a12" />
          {bands.map(({ color, y, h }) => (
            <rect key={color} x="0" y={y} width="160" height={h + 2} fill={MT[color].orb} opacity="0.55" style={{ transition: 'y .6s ease, height .6s ease' }} />
          ))}
        </g>
        <path d={bagPath} fill="none" stroke="#2a2a35" strokeWidth="1.5" />
        {total > 0 ? (
          <text x="80" y="108" textAnchor="middle" fill="#f3f4f6" fontFamily="'Playfair Display', serif" fontSize="34" fontWeight="700">{total}</text>
        ) : (
          <text x="80" y="108" textAnchor="middle" fill="#374151" fontSize="12">empty</text>
        )}
        <text x="80" y="124" textAnchor="middle" fill="#4b5563" fontSize="10" letterSpacing="1">MARBLES</text>
      </svg>
      <div style={{ display: 'flex', gap: 18, marginTop: 2 }}>
        {['blue', 'green', 'red', 'gold'].map(c => {
          const count = bag[c] || 0
          if (!count && c !== 'blue') return null
          return (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Orb color={c} size={14} />
              <span style={{ fontSize: 15, fontWeight: 700, color: MT[c].orb, fontFamily: "'Playfair Display', serif" }}>{count}</span>
            </div>
          )
        })}
      </div>
      {(ruinedGreens || 0) > 0 && (
        <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>
          🚫 {ruinedGreens} ruined green{ruinedGreens > 1 ? 's' : ''} pending
        </div>
      )}
    </div>
  )
}

// ── APP ROOT ──────────────────────────────────────────────────────────────────

export default function App() {
  const [state, setState] = useState(null)
  const [role, setRole] = useState(() => localStorage.getItem('bag-role') || null)
  const [drawing, setDrawing] = useState(false)
  const [drawResult, setDrawResult] = useState(null)
  const [spinData, setSpinData] = useState(null)
  const [showGold, setShowGold] = useState(false)
  const [undoData, setUndoData] = useState(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)
  const [tab, setTab] = useState('behaviour')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [logType, setLogType] = useState('good')
  const [logNote, setLogNote] = useState('')
  const [editingMarbles, setEditingMarbles] = useState(false)
  const [editBag, setEditBag] = useState({ blue: 0, green: 0, red: 0, gold: 0 })
  const [newConsequence, setNewConsequence] = useState('')
  const [newConsequenceCat, setNewConsequenceCat] = useState('punishment')
  const [editingConsIdx, setEditingConsIdx] = useState(null)
  const [editingConsText, setEditingConsText] = useState('')
  const [resetConfirm, setResetConfirm] = useState(false)

  const initialized = useRef(false)
  const localAction = useRef(false)
  const challengeChecked = useRef(false)

  // ── Storage: subscribe on mount ─────────────────────────────────────────────
  useEffect(() => {
    let unsub
    try {
      unsub = subscribeToState((data) => {
        if (!initialized.current) {
          const loaded = data ? deepMerge(JSON.parse(JSON.stringify(DEFAULT_STATE)), data) : JSON.parse(JSON.stringify(DEFAULT_STATE))
          loaded.settings.consequences = normaliseConsequences(loaded.settings.consequences)
          if (!Array.isArray(loaded.behaviorLog)) loaded.behaviorLog = []
          if (!Array.isArray(loaded.drawHistory)) loaded.drawHistory = []
          setState(loaded)
          initialized.current = true
        } else {
          // Remote update from other device — don't overwrite during local action
          if (!localAction.current && data) {
            setState(prev => {
              const merged = deepMerge(JSON.parse(JSON.stringify(prev)), data)
              merged.settings.consequences = normaliseConsequences(merged.settings.consequences)
              return merged
            })
          }
        }
      })
    } catch {
      // Firebase not configured yet — fall back to local storage
      const raw = localStorage.getItem('the-bag-v2')
      const loaded = raw ? deepMerge(JSON.parse(JSON.stringify(DEFAULT_STATE)), JSON.parse(raw)) : JSON.parse(JSON.stringify(DEFAULT_STATE))
      loaded.settings.consequences = normaliseConsequences(loaded.settings.consequences)
      setState(loaded)
      initialized.current = true
    }
    // Timeout fallback — use localStorage if Firebase hasn't responded in 4s
    const fallback = setTimeout(() => {
      if (!initialized.current) {
        try {
          const raw = localStorage.getItem('the-bag-v2')
          const loaded = raw
            ? deepMerge(JSON.parse(JSON.stringify(DEFAULT_STATE)), JSON.parse(raw))
            : JSON.parse(JSON.stringify(DEFAULT_STATE))
          loaded.settings.consequences = normaliseConsequences(loaded.settings.consequences)
          if (!Array.isArray(loaded.behaviorLog)) loaded.behaviorLog = []
          if (!Array.isArray(loaded.drawHistory)) loaded.drawHistory = []
          setState(loaded)
        } catch {
          setState(JSON.parse(JSON.stringify(DEFAULT_STATE)))
        }
        initialized.current = true
      }
    }, 4000)
    return () => {
      clearTimeout(fallback)
      if (unsub) unsub()
    }
  }, [])

  // ── Auto-save on state change ───────────────────────────────────────────────
  useEffect(() => {
    if (!state || !initialized.current) return
    const timer = setTimeout(async () => {
      try {
        const ok = await storageSave(state)
        if (ok) setSaveStatus(new Date())
        else {
          localStorage.setItem('the-bag-v2', JSON.stringify(state))
          setSaveStatus(new Date())
        }
      } catch {
        try { localStorage.setItem('the-bag-v2', JSON.stringify(state)) } catch {}
        setSaveStatus(new Date())
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [state])

  // ── Challenge mode check (once per session + once per day across devices) ───
  useEffect(() => {
    if (!state || challengeChecked.current) return
    challengeChecked.current = true
    if (!state.settings?.challengeMode) return
    const today = new Date().toDateString()
    if (state.settings?.lastChallengeCheck === today) return  // already ran today on any device
    const lastDraw = state.drawHistory?.[0]?.date
    if (!lastDraw) return
    const daysSince = (Date.now() - new Date(lastDraw).getTime()) / 86400000
    const threshold = state.settings?.challengeDays ?? 3
    if (daysSince >= threshold) {
      localAction.current = true
      setState(prev => {
        const next = JSON.parse(JSON.stringify(prev))
        next.bag.red = (next.bag.red || 0) + 1
        next.settings.lastChallengeCheck = today
        return next
      })
      setTimeout(() => { localAction.current = false }, 500)
    }
  }, [state])

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleRoleSelect(r) {
    localStorage.setItem('bag-role', r)
    setRole(r)
  }

  async function handleDraw() {
    if (!state || drawing) return
    const total = bagTotal(state.bag)
    if (!total || state.blackout.active || state.pendingConsequence) return

    const prevState = JSON.parse(JSON.stringify(state))
    const color = drawMarble(state.bag)
    if (!color) return

    localAction.current = true
    setDrawing(true)
    await new Promise(r => setTimeout(r, 1700))
    setDrawing(false)

    setState(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      next.bag[color] = Math.max(0, (next.bag[color] || 0) - 1)
      next.stats.totalDraws = (next.stats.totalDraws || 0) + 1
      next.stats[`${color}s`] = (next.stats[`${color}s`] || 0) + 1

      let autoReset = false
      let ruined = false
      let consequence = null
      let consequenceCategory = null

      if (color === 'green') {
        const ruinedCount = next.ruinedGreens || 0
        if (ruinedCount > 0) {
          ruined = true
          next.ruinedGreens = ruinedCount - 1
        } else {
          next.bag.green = 0
          next.bag.blue = Math.max(next.bag.blue || 0, 30)
          next.stats.lastGreenDate = new Date().toISOString()
          autoReset = true
        }
      }

      if (color === 'red') {
        const cons = next.settings.consequences || []
        const picked = cons.length ? cons[Math.floor(Math.random() * cons.length)] : null
        consequence = picked?.text ?? null
        consequenceCategory = picked?.category ?? null
        next.pendingConsequence = { id: Date.now(), text: consequence, category: consequenceCategory }
        if (consequence === 'Next green marble is ruined') {
          next.ruinedGreens = Math.max(next.ruinedGreens || 0, 1)
        } else if (consequence === 'Next 2 green marbles are ruined') {
          next.ruinedGreens = Math.max(next.ruinedGreens || 0, 2)
        }
      }

      const entry = {
        id: Date.now(), color, date: new Date().toISOString(),
        consequence, consequenceCategory, autoReset, ruined,
        resolved: false, resolvedAt: null,
      }
      next.drawHistory = [entry, ...(next.drawHistory || [])]

      setUndoData({ prevState, color })
      if (color === 'gold') {
        setTimeout(() => { setShowGold(true); localAction.current = false }, 0)
      } else if (color === 'red') {
        setTimeout(() => { setSpinData({ color: 'red', consequence, consequenceCategory, autoReset: false, ruined: false }); localAction.current = false }, 0)
      } else {
        setTimeout(() => { setDrawResult({ color, consequence, consequenceCategory, autoReset, ruined }); localAction.current = false }, 0)
      }
      return next
    })
  }

  function handleUndo() {
    if (!undoData) return
    localAction.current = true
    setState(undoData.prevState)
    setUndoData(null)
    setDrawResult(null)
    setShowGold(false)
    setTimeout(() => { localAction.current = false }, 500)
  }

  function handleLogDay() {
    const note = logNote.trim()
    if (!note) return
    localAction.current = true
    setState(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      next.behaviorLog = [{ id: Date.now(), type: logType, note, date: new Date().toISOString() }, ...(next.behaviorLog || [])]
      if (logType === 'good') {
        next.bag.green = (next.bag.green || 0) + 1
        next.stats.currentStreak = (next.stats.currentStreak || 0) + 1
        next.stats.bestStreak = Math.max(next.stats.bestStreak || 0, next.stats.currentStreak)
      } else {
        next.bag.red = (next.bag.red || 0) + 1
        next.stats.currentStreak = 0
      }
      return next
    })
    setLogNote('')
    setTimeout(() => { localAction.current = false }, 500)
  }

  function handleResolveConsequence() {
    if (!state?.pendingConsequence) return
    localAction.current = true
    setState(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const idx = (next.drawHistory || []).findIndex(d => d.id === next.pendingConsequence?.id)
      if (idx !== -1) {
        next.drawHistory[idx].resolved = true
        next.drawHistory[idx].resolvedAt = new Date().toISOString()
      }
      next.pendingConsequence = null
      return next
    })
    setTimeout(() => { localAction.current = false }, 500)
  }

  function handleApplyMarbles() {
    localAction.current = true
    setState(prev => ({ ...prev, bag: { ...editBag } }))
    setEditingMarbles(false)
    setTimeout(() => { localAction.current = false }, 500)
  }

  function handleAwardGold() {
    localAction.current = true
    setState(prev => ({ ...prev, bag: { ...prev.bag, gold: (prev.bag.gold || 0) + 1 } }))
    setTimeout(() => { localAction.current = false }, 500)
  }

  function handleAddConsequence() {
    if (!newConsequence.trim()) return
    localAction.current = true
    setState(prev => ({
      ...prev,
      settings: { ...prev.settings, consequences: [...(prev.settings.consequences || []), { text: newConsequence.trim(), category: newConsequenceCat }] }
    }))
    setNewConsequence('')
    setTimeout(() => { localAction.current = false }, 500)
  }

  function handleRemoveConsequence(idx) {
    localAction.current = true
    setState(prev => ({
      ...prev,
      settings: { ...prev.settings, consequences: prev.settings.consequences.filter((_, i) => i !== idx) }
    }))
    setTimeout(() => { localAction.current = false }, 500)
  }

  function handleSaveConsequenceEdit(idx) {
    if (!editingConsText.trim()) return
    localAction.current = true
    setState(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      next.settings.consequences[idx].text = editingConsText.trim()
      return next
    })
    setEditingConsIdx(null)
    setTimeout(() => { localAction.current = false }, 500)
  }

  function handleExport() {
    const json = JSON.stringify(state, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `the-bag-backup-${todayStr()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImport(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result)
        if (typeof parsed !== 'object' || parsed === null) throw new Error()
        const loaded = deepMerge(JSON.parse(JSON.stringify(DEFAULT_STATE)), parsed)
        loaded.settings.consequences = normaliseConsequences(loaded.settings.consequences)
        if (!Array.isArray(loaded.behaviorLog)) loaded.behaviorLog = []
        if (!Array.isArray(loaded.drawHistory)) loaded.drawHistory = []
        if (!Array.isArray(loaded.lockLog)) loaded.lockLog = []
        if (!Array.isArray(loaded.orgasmLog)) loaded.orgasmLog = []
        localAction.current = true
        setState(loaded)
        setTimeout(() => { localAction.current = false }, 500)
      } catch {
        alert('Could not read backup file — make sure it is a valid The Bag export.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleReset() {
    localAction.current = true
    setState(prev => ({
      bag: { blue: 30, green: 0, red: 0, gold: 0 },
      behaviorLog: [],
      drawHistory: [],
      pendingConsequence: null,
      blackout: prev.blackout,
      ruinedGreens: 0,
      settings: prev.settings,
      stats: { totalDraws: 0, greens: 0, blues: 0, reds: 0, golds: 0, lastGreenDate: null, currentStreak: 0, bestStreak: 0 },
      lockLog: prev.lockLog || [],
      orgasmLog: prev.orgasmLog || [],
    }))
    setResetConfirm(false)
    setTimeout(() => { localAction.current = false }, 500)
  }

  function handleToggleLock(dateStr) {
    const d = dateStr || todayStr()
    localAction.current = true
    setState(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const log = next.lockLog || []
      const currentState = getLockStateOnDate(log, d)
      const isLocked = currentState === 'lock'
      const newType = isLocked ? 'unlock' : 'lock'
      const logWithoutToday = log.filter(e => e.date !== d)
      const inherited = getLockStateOnDate(logWithoutToday, d) || 'unlock'
      if (newType === inherited) {
        next.lockLog = logWithoutToday
      } else {
        next.lockLog = [...logWithoutToday, { id: Date.now(), type: newType, date: d }]
      }
      return next
    })
    setTimeout(() => { localAction.current = false }, 500)
  }

  function handleLogOrgasm(who, type, quality, dateStr) {
    const d = dateStr || todayStr()
    localAction.current = true
    setState(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      next.orgasmLog = [{ id: Date.now(), who, type, quality, date: d }, ...(next.orgasmLog || [])]
      return next
    })
    setTimeout(() => { localAction.current = false }, 500)
  }

  function handleRemoveOrgasm(id) {
    localAction.current = true
    setState(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      next.orgasmLog = (next.orgasmLog || []).filter(e => e.id !== id)
      return next
    })
    setTimeout(() => { localAction.current = false }, 500)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!state) {
    return (
      <>
        <GS />
        <div style={{ position: 'fixed', inset: 0, background: '#08080d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <GreyOrb size={60} />
        </div>
      </>
    )
  }

  if (!role) {
    return (
      <>
        <GS />
        <RoleSelect onSelect={handleRoleSelect} />
      </>
    )
  }

  const isKH = role === 'keyholder'
  const total = bagTotal(state.bag)
  const canDraw = isKH && !state.blackout.active && total > 0 && !state.pendingConsequence

  const drawBtnStyle = canDraw
    ? { background: 'linear-gradient(135deg,#3b0764,#5b21b6)', color: '#f3f4f6', border: 'none', boxShadow: '0 4px 24px rgba(91,33,182,.35)' }
    : { background: '#0a0a14', color: '#374151', border: '1px solid #1a1a2a', boxShadow: 'none', cursor: 'not-allowed' }

  const drawBtnLabel = !isKH ? 'Keyholder only' : state.pendingConsequence ? 'Resolve consequence first' : state.blackout.active ? '⛔ Blackout Active' : total === 0 ? 'Bag is empty' : 'Draw a Marble'

  return (
    <>
      <GS />
      {drawing && <DrawAnim />}
      {spinData && (
        <SpinWheel
          spinData={spinData}
          allConsequences={state?.settings?.consequences || []}
          onDone={() => { const r = spinData; setSpinData(null); setDrawResult(r) }}
        />
      )}
      {drawResult && (
        <DrawModal
          result={drawResult}
          state={state}
          setState={setState}
          onClose={() => setDrawResult(null)}
          onUndo={() => { handleUndo(); setDrawResult(null) }}
        />
      )}
      {showGold && (
        <GoldModal
          state={state}
          setState={setState}
          onClose={() => setShowGold(false)}
          onUndo={() => { handleUndo(); setShowGold(false) }}
        />
      )}
      {undoData && !drawResult && !showGold && (
        <UndoToast
          data={undoData}
          onUndo={handleUndo}
          onDismiss={() => setUndoData(null)}
        />
      )}
      {manualOpen && <ManualModal onClose={() => setManualOpen(false)} />}

      <div style={{ maxWidth: 460, margin: '0 auto', padding: '0 16px 80px' }}>

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0 16px' }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, color: '#e8d5a3' }}>
            The Bag
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setManualOpen(true)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', padding: '4px 8px' }}>
              📖 Rules
            </button>
            <div style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: isKH ? 'rgba(192,132,252,.1)' : 'rgba(156,163,175,.07)',
              border: `1px solid ${isKH ? '#6b3fa0' : '#374151'}`,
              color: isKH ? '#c084fc' : '#9ca3af',
            }}>
              {isKH ? 'Keyholder' : 'Him'}
            </div>
            <button
              onClick={() => { sessionStorage.removeItem('bag-role'); setRole(null) }}
              style={{ background: 'none', border: 'none', color: '#4b5563', fontSize: 12, cursor: 'pointer', padding: '4px 8px' }}
            >
              Switch
            </button>
          </div>
        </div>

        {/* ── BLACKOUT BANNER ─────────────────────────────────────────────── */}
        {state.blackout.active && (
          <div style={{
            background: '#1a0505', border: '1px solid #450a0a', borderRadius: 12, padding: '14px 16px',
            marginBottom: 12, animation: 'slideUp .28s ease',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171' }}>⛔ Blackout Active</div>
                <div style={{ fontSize: 12, color: '#7f1d1d', marginTop: 2 }}>Active since {fmtDate(state.blackout.startDate)}</div>
                {state.settings.lecturePromptEnabled && (
                  <div style={{ fontSize: 13, color: '#991b1b', fontStyle: 'italic', marginTop: 8 }}>
                    Remind him today what his behaviour is costing him.
                  </div>
                )}
              </div>
              {isKH && (
                <button
                  onClick={() => {
                    localAction.current = true
                    setState(prev => ({ ...prev, blackout: { active: false, startDate: null } }))
                    setTimeout(() => { localAction.current = false }, 500)
                  }}
                  style={{ fontSize: 12, color: '#7f1d1d', background: 'none', border: '1px solid #450a0a', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
                >
                  Deactivate
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── PENDING CONSEQUENCE BANNER ──────────────────────────────────── */}
        {state.pendingConsequence && (
          <div style={{
            background: '#190808', border: '1px solid #7f1d1d', borderRadius: 12, padding: '14px 16px',
            marginBottom: 12, animation: 'slideUp .28s ease',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f87171', marginBottom: 4 }}>⚠️ Consequence Pending</div>
                {state.pendingConsequence.text && (
                  <div style={{ fontSize: 14, color: '#9ca3af' }}>{state.pendingConsequence.text}</div>
                )}
                {state.pendingConsequence.category && (
                  <div style={{ fontSize: 11, color: '#7f1d1d', marginTop: 4 }}>
                    {state.pendingConsequence.category === 'reward' ? '🎁 Reward for her' : '⚡ Punishment for him'}
                  </div>
                )}
              </div>
              {isKH && (
                <Btn variant="red" onClick={handleResolveConsequence} style={{ padding: '6px 12px', fontSize: 13, flexShrink: 0 }}>
                  ✓ Done
                </Btn>
              )}
            </div>
          </div>
        )}

        {/* ── MARBLE BAG ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
          <BagVisual bag={state.bag} ruinedGreens={state.ruinedGreens} />
        </div>

        {/* ── STATS BAR ───────────────────────────────────────────────────── */}
        <StatsBar stats={state.stats} bag={state.bag} />

        {/* ── DRAW BUTTON ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={canDraw ? handleDraw : undefined}
            style={{
              width: '100%', height: 56, borderRadius: 14, fontSize: 17, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif", letterSpacing: '.3px',
              transition: 'all .2s', ...drawBtnStyle,
            }}
            onMouseEnter={e => { if (canDraw) e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
          >
            {drawBtnLabel}
          </button>
        </div>

        {/* ── LOG CARD ────────────────────────────────────────────────────── */}
        <Card style={{ marginBottom: 12, overflow: 'hidden' }}>
          {/* Tab Bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid #111' }}>
            {['behaviour', 'history', 'track'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: '12px 0', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: 'none', fontFamily: 'inherit',
                  color: tab === t ? '#f3f4f6' : '#4b5563',
                  borderBottom: tab === t ? '2px solid #5b21b6' : '2px solid transparent',
                  transition: 'color .15s',
                }}
              >
                {t === 'behaviour' ? 'Behaviour' : t === 'history' ? 'History' : 'Track'}
              </button>
            ))}
          </div>

          {/* Behaviour Tab */}
          {tab === 'behaviour' && (
            <div style={{ padding: 16 }}>
              {isKH && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    {['good', 'bad'].map(t => (
                      <button
                        key={t}
                        onClick={() => setLogType(t)}
                        style={{
                          flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                          cursor: 'pointer', border: 'none', fontFamily: 'inherit', transition: 'all .15s',
                          background: logType === t ? (t === 'good' ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)') : 'rgba(107,114,128,.07)',
                          color: logType === t ? (t === 'good' ? '#22c55e' : '#ef4444') : '#6b7280',
                        }}
                      >
                        {t === 'good' ? '✅ Good Day' : '❌ Bad Day'}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={logNote}
                    onChange={e => setLogNote(e.target.value)}
                    placeholder={`What happened? ${logType === 'good' ? '(+1 green marble)' : '(+1 red marble)'}`}
                    rows={2}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 8,
                      background: '#111', border: '1px solid #1f2937', color: '#f3f4f6',
                      fontSize: 14, resize: 'none', marginBottom: 8, fontFamily: 'inherit',
                    }}
                  />
                  <Btn
                    variant={logType === 'good' ? 'green' : 'red'}
                    onClick={handleLogDay}
                    disabled={!logNote.trim()}
                    style={{ width: '100%' }}
                  >
                    Log {logType === 'good' ? 'Good' : 'Bad'} Day
                  </Btn>
                </div>
              )}
              {(state.behaviorLog || []).length === 0 ? (
                <div style={{ fontSize: 13, color: '#374151', textAlign: 'center', padding: '20px 0' }}>No behaviour logged yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(state.behaviorLog || []).slice(0, 30).map(entry => (
                    <div key={entry.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #111' }}>
                      <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{entry.type === 'good' ? '✅' : '❌'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, color: '#e5e7eb' }}>{entry.note}</div>
                        <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>{fmtDT(entry.date)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Draw History Tab */}
          {tab === 'history' && (
            <div style={{ padding: 16 }}>
              {(state.drawHistory || []).length === 0 ? (
                <div style={{ fontSize: 13, color: '#374151', textAlign: 'center', padding: '20px 0' }}>No draws yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {(state.drawHistory || []).slice(0, 50).map(entry => {
                    const isPending = state.pendingConsequence?.id === entry.id
                    return (
                      <div key={entry.id} style={{ padding: '10px 0', borderBottom: '1px solid #111' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Orb color={entry.color} size={26} />
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 14, color: MT[entry.color].orb, fontWeight: 600 }}>{entry.color}</span>
                            <span style={{ fontSize: 12, color: '#4b5563', marginLeft: 8 }}>{fmtDT(entry.date)}</span>
                          </div>
                          {entry.color === 'green' && entry.autoReset && (
                            <span style={{ fontSize: 11, color: '#22c55e' }}>↻ Reset</span>
                          )}
                          {entry.color === 'green' && entry.ruined && (
                            <span style={{ fontSize: 11, color: '#ef4444' }}>🚫 Ruined</span>
                          )}
                          {entry.color === 'red' && entry.resolved && (
                            <span style={{ fontSize: 11, color: '#22c55e' }}>✓ Done · {fmtDate(entry.resolvedAt)}</span>
                          )}
                          {entry.color === 'red' && isPending && (
                            <span style={{ fontSize: 11, color: '#ef4444', animation: 'shimmer 2s ease-in-out infinite' }}>⏳ Pending</span>
                          )}
                        </div>
                        {entry.color === 'red' && entry.consequence && (
                          <div style={{ marginTop: 6, marginLeft: 36 }}>
                            <span style={{ fontSize: 11, color: '#6b7280', marginRight: 6 }}>
                              {entry.consequenceCategory === 'reward' ? '🎁' : '⚡'}
                            </span>
                            <span style={{ fontSize: 13, color: '#9ca3af' }}>{entry.consequence}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Track Tab */}
          {tab === 'track' && (
            <TrackTab
              lockLog={state.lockLog || []}
              orgasmLog={state.orgasmLog || []}
              onToggleLock={handleToggleLock}
              onLogOrgasm={handleLogOrgasm}
              onRemoveOrgasm={handleRemoveOrgasm}
              isKH={isKH}
            />
          )}
        </Card>

        {/* ── SETTINGS PANEL ──────────────────────────────────────────────── */}
        {isKH && (
          <Card style={{ marginBottom: 12, overflow: 'hidden' }}>
            <button
              onClick={() => setSettingsOpen(o => !o)}
              style={{
                width: '100%', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: '#9ca3af' }}>⚙️ Settings</span>
              <span style={{ color: '#4b5563', fontSize: 12, transform: settingsOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s', display: 'inline-block' }}>▼</span>
            </button>

            {settingsOpen && (
              <div style={{ padding: '0 16px 16px', animation: 'slideUp .28s ease' }}>

                {/* Blackout */}
                <SettingsRow
                  label="Blackout Mode"
                  subtitle={state.blackout.active ? `Active since ${fmtDate(state.blackout.startDate)}` : 'Disable drawing indefinitely'}
                >
                  <Toggle
                    value={state.blackout.active}
                    activeColor="#991b1b"
                    onChange={() => {
                      localAction.current = true
                      setState(prev => ({
                        ...prev,
                        blackout: { active: !prev.blackout.active, startDate: !prev.blackout.active ? new Date().toISOString() : null }
                      }))
                      setTimeout(() => { localAction.current = false }, 500)
                    }}
                  />
                </SettingsRow>

                {/* Lecture Prompt */}
                <SettingsRow label="Daily Lecture Prompt" subtitle="Show reminder text during blackout">
                  <Toggle
                    value={state.settings.lecturePromptEnabled}
                    onChange={() => {
                      localAction.current = true
                      setState(prev => ({ ...prev, settings: { ...prev.settings, lecturePromptEnabled: !prev.settings.lecturePromptEnabled } }))
                      setTimeout(() => { localAction.current = false }, 500)
                    }}
                  />
                </SettingsRow>

                {/* Challenge Mode */}
                <SettingsRow label="Challenge mode" subtitle={`+1 red marble if no draw in ${state.settings.challengeDays ?? 3} day${(state.settings.challengeDays ?? 3) !== 1 ? 's' : ''}`}>
                  <Toggle
                    value={state.settings.challengeMode ?? false}
                    onChange={() => {
                      localAction.current = true
                      setState(prev => ({ ...prev, settings: { ...prev.settings, challengeMode: !prev.settings.challengeMode } }))
                      setTimeout(() => { localAction.current = false }, 500)
                    }}
                    activeColor="#ef4444"
                  />
                </SettingsRow>
                {(state.settings.challengeMode ?? false) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #111' }}>
                    <span style={{ fontSize: 13, color: '#9ca3af', flex: 1 }}>Penalty after how many days</span>
                    <input
                      type="number" min="1" max="30"
                      value={state.settings.challengeDays ?? 3}
                      onChange={e => {
                        const v = Math.max(1, Math.min(30, parseInt(e.target.value) || 1))
                        localAction.current = true
                        setState(prev => ({ ...prev, settings: { ...prev.settings, challengeDays: v } }))
                        setTimeout(() => { localAction.current = false }, 500)
                      }}
                      style={{ width: 52, padding: '4px 8px', borderRadius: 6, textAlign: 'center', background: '#111', border: '1px solid #1f2937', color: '#f3f4f6', fontSize: 14, fontFamily: 'inherit' }}
                    />
                  </div>
                )}

                {/* Consequence List */}
                <div style={{ padding: '14px 0', borderBottom: '1px solid #111' }}>
                  <div style={{ fontSize: 14, color: '#e5e7eb', fontWeight: 500, marginBottom: 10 }}>Consequence List</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    {['punishment', 'reward'].map(cat => (
                      <button
                        key={cat}
                        onClick={() => setNewConsequenceCat(cat)}
                        style={{
                          flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                          background: newConsequenceCat === cat ? (cat === 'punishment' ? 'rgba(239,68,68,.15)' : 'rgba(34,197,94,.15)') : 'rgba(107,114,128,.07)',
                          color: newConsequenceCat === cat ? (cat === 'punishment' ? '#ef4444' : '#22c55e') : '#6b7280',
                        }}
                      >
                        {cat === 'punishment' ? '⚡ Punishment' : '🎁 Reward'}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input
                      value={newConsequence}
                      onChange={e => setNewConsequence(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddConsequence() }}
                      placeholder="Add consequence…"
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8,
                        background: '#111', border: '1px solid #1f2937', color: '#f3f4f6',
                        fontSize: 13, fontFamily: 'inherit',
                      }}
                    />
                    <Btn variant="ghost" onClick={handleAddConsequence} style={{ padding: '8px 14px' }}>+</Btn>
                  </div>
                  <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(state.settings.consequences || []).map((c, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #0a0a0a' }}>
                        <span style={{ fontSize: 12 }}>{c.category === 'reward' ? '🎁' : '⚡'}</span>
                        {editingConsIdx === i ? (
                          <>
                            <input
                              autoFocus
                              value={editingConsText}
                              onChange={e => setEditingConsText(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleSaveConsequenceEdit(i); if (e.key === 'Escape') setEditingConsIdx(null) }}
                              style={{ flex: 1, padding: '4px 8px', borderRadius: 6, background: '#111', border: '1px solid #374151', color: '#f3f4f6', fontSize: 13, fontFamily: 'inherit' }}
                            />
                            <button onClick={() => handleSaveConsequenceEdit(i)} style={{ color: '#22c55e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '0 3px' }}>✓</button>
                            <button onClick={() => setEditingConsIdx(null)} style={{ color: '#374151', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '0 3px' }}>✕</button>
                          </>
                        ) : (
                          <>
                            <span style={{ flex: 1, fontSize: 13, color: '#9ca3af' }}>{c.text}</span>
                            <button onClick={() => { setEditingConsIdx(i); setEditingConsText(c.text) }} style={{ color: '#4b5563', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '0 3px' }}>✏️</button>
                            <button onClick={() => handleRemoveConsequence(i)} style={{ color: '#374151', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '0 3px' }}>×</button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Set Marble Counts */}
                <div style={{ padding: '14px 0', borderBottom: '1px solid #111' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editingMarbles ? 12 : 0 }}>
                    <div style={{ fontSize: 14, color: '#e5e7eb', fontWeight: 500 }}>Set Marble Counts</div>
                    <Btn variant="ghost" onClick={() => { setEditingMarbles(o => !o); setEditBag({ ...state.bag }) }} style={{ padding: '6px 12px', fontSize: 12 }}>
                      {editingMarbles ? 'Cancel' : 'Edit'}
                    </Btn>
                  </div>
                  {editingMarbles && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {['blue', 'green', 'red', 'gold'].map(color => (
                        <div key={color} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Orb color={color} size={22} />
                          <span style={{ flex: 1, fontSize: 13, color: '#9ca3af', textTransform: 'capitalize' }}>{color}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                              onClick={() => setEditBag(b => ({ ...b, [color]: Math.max(0, (b[color] || 0) - 1) }))}
                              style={{ width: 28, height: 28, borderRadius: 6, background: '#111', border: '1px solid #1f2937', color: '#9ca3af', cursor: 'pointer', fontSize: 16, fontFamily: 'inherit' }}
                            >−</button>
                            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: '#f3f4f6', minWidth: 28, textAlign: 'center' }}>{editBag[color] || 0}</span>
                            <button
                              onClick={() => setEditBag(b => ({ ...b, [color]: (b[color] || 0) + 1 }))}
                              style={{ width: 28, height: 28, borderRadius: 6, background: '#111', border: '1px solid #1f2937', color: '#9ca3af', cursor: 'pointer', fontSize: 16, fontFamily: 'inherit' }}
                            >+</button>
                          </div>
                        </div>
                      ))}
                      <Btn variant="purple" onClick={handleApplyMarbles} style={{ width: '100%', marginTop: 4 }}>Apply</Btn>
                    </div>
                  )}
                </div>

                {/* Award Gold */}
                <div style={{ padding: '14px 0', borderBottom: '1px solid #111' }}>
                  <button
                    onClick={handleAwardGold}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: 13, color: '#78350f', padding: 0,
                    }}
                  >
                    🥇 Award Gold Marble ({state.bag.gold || 0} in bag)
                  </button>
                </div>

                {/* Backup & Restore */}
                <div style={{ padding: '14px 0', borderBottom: '1px solid #111' }}>
                  <div style={{ fontSize: 14, color: '#e5e7eb', fontWeight: 500, marginBottom: 10 }}>Backup & Restore</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn variant="ghost" onClick={handleExport} style={{ flex: 1 }}>⬇ Export</Btn>
                    <Btn variant="ghost" onClick={() => document.getElementById('bag-import-file').click()} style={{ flex: 1 }}>⬆ Import</Btn>
                    <input id="bag-import-file" type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#374151', marginTop: 6 }}>Export saves everything to a .json file. Import replaces all current data.</div>
                </div>

                {/* Reset */}
                <div style={{ paddingTop: 14 }}>
                  {!resetConfirm ? (
                    <Btn variant="subtle" onClick={() => setResetConfirm(true)} style={{ width: '100%' }}>Reset Everything</Btn>
                  ) : (
                    <div style={{ background: 'rgba(239,68,68,.05)', border: '1px solid #7f1d1d', borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12 }}>
                        Reset bag, all logs, and stats? Your consequence list and settings will be kept.
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Btn variant="red" onClick={handleReset} style={{ flex: 1 }}>Yes, reset</Btn>
                        <Btn variant="ghost" onClick={() => setResetConfirm(false)} style={{ flex: 1 }}>Cancel</Btn>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ── SAVE STATUS ─────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', fontSize: 11, color: '#374151', padding: '8px 0' }}>
          {saveStatus ? `Last saved ${fmtTime(saveStatus)}` : 'Connecting…'}
        </div>
      </div>
    </>
  )
}
