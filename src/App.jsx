import { useState, useEffect, useRef, useCallback } from 'react'
import './index.css'

const GRID_COLS = 12, GRID_ROWS = 8, BET_COST = 5, BET_DURATION = 5000, STARTING_COINS = 100

const TEAM_A_BASE = [
  { x: 0.06, y: 0.5, role: 'GK' }, { x: 0.18, y: 0.15, role: 'DEF' }, { x: 0.16, y: 0.38, role: 'DEF' },
  { x: 0.16, y: 0.62, role: 'DEF' }, { x: 0.18, y: 0.85, role: 'DEF' }, { x: 0.35, y: 0.22, role: 'MID' },
  { x: 0.32, y: 0.5, role: 'MID' }, { x: 0.35, y: 0.78, role: 'MID' }, { x: 0.46, y: 0.2, role: 'ATK' },
  { x: 0.48, y: 0.5, role: 'ATK' }, { x: 0.46, y: 0.8, role: 'ATK' },
]
const TEAM_B_BASE = TEAM_A_BASE.map(p => ({ ...p, x: 1 - p.x }))

const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
const lerp = (a, b, t) => a + (b - a) * t

const getMultiplier = (cx, cy, bx, by) => {
  const d = dist({ x: cx, y: cy }, { x: Math.floor(bx * GRID_COLS), y: Math.floor(by * GRID_ROWS) })
  return d <= 1 ? 1.5 : d <= 2 ? 2 : d <= 3 ? 3 : d <= 4 ? 5 : d <= 5 ? 7 : d <= 6 ? 10 : 15
}

function App() {
  const [ballPos, setBallPos] = useState({ x: 0.5, y: 0.5 })
  const [coins, setCoins] = useState(STARTING_COINS)
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [bets, setBets] = useState([])
  const [effects, setEffects] = useState([])
  const [coinAnims, setCoinAnims] = useState([])
  const [teamA, setTeamA] = useState(TEAM_A_BASE.map((p, i) => ({ ...p, id: i })))
  const [teamB, setTeamB] = useState(TEAM_B_BASE.map((p, i) => ({ ...p, id: i })))
  const [hovered, setHovered] = useState(null)

  const game = useRef({
    ball: { x: 0.5, y: 0.5 }, poss: 'A', carrier: 9,
    phase: 'dribble', // dribble, pass, shoot, loose
    passFrom: null, passTo: null, passT: 0,
    shotTarget: null, shotT: 0,
    actionTime: Date.now(), dribbleDir: { x: 0, y: 0 },
  })

  useEffect(() => {
    let last = performance.now()
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const g = game.current
      const time = Date.now()

      const attacking = g.poss === 'A' ? teamA : teamB
      const defending = g.poss === 'A' ? teamB : teamA
      const goalX = g.poss === 'A' ? 0.95 : 0.05
      const carrier = attacking[g.carrier]

      // Find nearest defender to ball
      const nearestDef = defending.reduce((best, p) =>
        dist(p, g.ball) < dist(best, g.ball) ? p : best, defending[0])
      const pressure = Math.max(0, 1 - dist(nearestDef, g.ball) * 8)

      // === DRIBBLE PHASE ===
      if (g.phase === 'dribble' && carrier) {
        // Carrier dribbles toward goal with some randomness
        const toGoal = { x: goalX - carrier.x, y: 0.5 - carrier.y }
        const mag = Math.sqrt(toGoal.x ** 2 + toGoal.y ** 2) || 1
        g.dribbleDir = { x: toGoal.x / mag, y: toGoal.y / mag * 0.3 }

        // Decision: pass, shoot, or keep dribbling
        const inShootRange = Math.abs(carrier.x - goalX) < 0.15
        const timeDribbling = time - g.actionTime

        if (inShootRange && Math.random() < 0.02) {
          // Take a shot!
          g.phase = 'shoot'
          g.shotTarget = { x: goalX, y: 0.4 + Math.random() * 0.2 }
          g.passFrom = { x: carrier.x, y: carrier.y }
          g.shotT = 0
          g.actionTime = time
        } else if (timeDribbling > 800 && (pressure > 0.5 || timeDribbling > 2000 || Math.random() < 0.01)) {
          // Pass under pressure or after dribbling a while
          const targets = attacking.filter((p, i) => i !== g.carrier && p.role !== 'GK')
          if (targets.length) {
            // Score passes: forward progress, distance, avoid pressure
            const best = targets.reduce((best, p) => {
              const forward = g.poss === 'A' ? p.x - carrier.x : carrier.x - p.x
              const defDist = defending.reduce((min, d) => Math.min(min, dist(p, d)), 1)
              const score = forward * 2 + defDist * 3 + Math.random() * 0.5
              return score > best.score ? { p, score } : best
            }, { p: targets[0], score: -Infinity }).p

            g.phase = 'pass'
            g.passFrom = { x: carrier.x, y: carrier.y }
            g.passTo = { x: best.x, y: best.y, id: best.id }
            g.passT = 0
            g.actionTime = time
          }
        }
        g.ball = { x: carrier.x, y: carrier.y }
      }

      // === PASS PHASE ===
      if (g.phase === 'pass' && g.passTo) {
        g.passT += dt * (0.8 + Math.random() * 0.4)
        const t = Math.min(g.passT, 1)
        const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
        g.ball.x = lerp(g.passFrom.x, g.passTo.x, ease)
        g.ball.y = lerp(g.passFrom.y, g.passTo.y, ease)

        // Interception check - defender near ball path
        const interceptor = defending.find(d => d.role !== 'GK' && dist(d, g.ball) < 0.06)
        if (interceptor && Math.random() < 0.4) {
          g.poss = g.poss === 'A' ? 'B' : 'A'
          g.carrier = interceptor.id
          g.phase = 'dribble'
          g.actionTime = time
        } else if (t >= 1) {
          g.carrier = g.passTo.id
          g.phase = 'dribble'
          g.passTo = null
          g.actionTime = time
        }
      }

      // === SHOOT PHASE ===
      if (g.phase === 'shoot' && g.shotTarget) {
        g.shotT += dt * 1.5
        const t = Math.min(g.shotT, 1)
        g.ball.x = lerp(g.passFrom.x, g.shotTarget.x, t)
        g.ball.y = lerp(g.passFrom.y, g.shotTarget.y, t)

        if (t >= 1) {
          // Shot saved or goal - reset to other team's GK
          const saved = Math.random() < 0.85
          g.poss = saved ? (g.poss === 'A' ? 'B' : 'A') : g.poss
          g.carrier = 0 // GK
          g.ball = { x: g.poss === 'A' ? 0.06 : 0.94, y: 0.5 }
          g.phase = 'dribble'
          g.shotTarget = null
          g.actionTime = time + 500
        }
      }

      setBallPos({ ...g.ball })

      // === PLAYER MOVEMENT ===
      const moveTeam = (players, base, isAtt) => players.map((p, i) => {
        const b = base[i]
        let tx = b.x, ty = b.y

        // Shift with ball
        tx += (g.ball.x - 0.5) * 0.2
        ty += (g.ball.y - 0.5) * 0.15

        // Attack/defend shift
        tx += isAtt ? 0.06 : -0.04

        // Carrier dribbles toward goal
        if (isAtt && g.carrier === i && g.phase === 'dribble') {
          tx = p.x + g.dribbleDir.x * 0.15
          ty = p.y + g.dribbleDir.y * 0.1
        }

        // Defenders track ball carrier
        if (!isAtt && p.role === 'DEF') {
          const attCarrier = (g.poss === 'A' ? teamA : teamB)[g.carrier]
          if (attCarrier && dist(p, attCarrier) < 0.3) {
            tx = lerp(tx, attCarrier.x, 0.3)
            ty = lerp(ty, attCarrier.y, 0.2)
          }
        }

        // Midfielders press ball
        if (!isAtt && p.role === 'MID') {
          tx = lerp(tx, g.ball.x, 0.15)
          ty = lerp(ty, g.ball.y, 0.1)
        }

        tx = clamp(tx, 0.04, 0.96)
        ty = clamp(ty, 0.06, 0.94)

        return { ...p, x: lerp(p.x, tx, dt * 2), y: lerp(p.y, ty, dt * 2) }
      })

      setTeamA(prev => moveTeam(prev, TEAM_A_BASE, g.poss === 'A'))
      setTeamB(prev => moveTeam(prev, TEAM_B_BASE, g.poss === 'B'))

      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [teamA, teamB])

  // Bet checking
  useEffect(() => {
    const check = () => {
      const { ball } = game.current
      const cx = Math.floor(ball.x * GRID_COLS), cy = Math.floor(ball.y * GRID_ROWS)
      setBets(prev => prev.map(b => b.resolved || (cx === b.cx && cy === b.cy) ? { ...b, hit: b.hit || (cx === b.cx && cy === b.cy) } : b))
    }
    const i = setInterval(check, 16)
    return () => clearInterval(i)
  }, [])

  // Bet resolution
  useEffect(() => {
    const resolve = () => {
      const now = Date.now()
      setBets(prev => {
        const active = [], done = []
        prev.forEach(b => (b.resolved || now < b.end ? active : done).push(b))
        done.forEach(b => {
          if (b.hit) {
            const win = Math.floor(BET_COST * b.mult)
            setCoins(c => c + win)
            setWins(w => w + 1)
            setEffects(e => [...e, { id: b.id, cx: b.cx, cy: b.cy, win: true, t: now }])
            setCoinAnims(a => [...a, { id: b.id, amt: win, t: now }])
          } else {
            setLosses(l => l + 1)
            setEffects(e => [...e, { id: b.id, cx: b.cx, cy: b.cy, win: false, t: now }])
          }
        })
        return active
      })
    }
    const i = setInterval(resolve, 100)
    return () => clearInterval(i)
  }, [])

  // Cleanup
  useEffect(() => {
    const clean = () => {
      const now = Date.now()
      setEffects(e => e.filter(x => now - x.t < 600))
      setCoinAnims(a => a.filter(x => now - x.t < 1200))
    }
    const i = setInterval(clean, 100)
    return () => clearInterval(i)
  }, [])

  const placeBet = useCallback((cx, cy) => {
    if (coins < BET_COST || bets.find(b => b.cx === cx && b.cy === cy && !b.resolved)) return
    const mult = getMultiplier(cx, cy, ballPos.x, ballPos.y)
    const { ball } = game.current
    setCoins(c => c - BET_COST)
    setBets(prev => [...prev, {
      id: Date.now() + Math.random(), cx, cy, mult,
      end: Date.now() + BET_DURATION,
      hit: Math.floor(ball.x * GRID_COLS) === cx && Math.floor(ball.y * GRID_ROWS) === cy,
      resolved: false,
    }])
  }, [coins, bets, ballPos])

  const Player = ({ p, team, carrier }) => {
    const c = team === 'A' ? '#dc2626' : '#2563eb'
    const s = team === 'A' ? '#991b1b' : '#1d4ed8'
    return (
      <div className="absolute pointer-events-none" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: 'translate(-50%, -50%)', zIndex: carrier ? 20 : 10 }}>
        <div className="absolute bg-black/25 rounded-full" style={{ width: 18, height: 7, left: -2, top: 17, filter: 'blur(1px)' }} />
        <div className="rounded-t-full" style={{ width: 14, height: 11, backgroundColor: c, border: '1px solid rgba(255,255,255,0.3)' }} />
        <div style={{ width: 14, height: 5, backgroundColor: s, marginTop: -1 }} />
        <div className="flex justify-between" style={{ width: 14, marginTop: -1 }}>
          <div style={{ width: 4, height: 5, backgroundColor: '#fcd9b6', marginLeft: 2 }} />
          <div style={{ width: 4, height: 5, backgroundColor: '#fcd9b6', marginRight: 2 }} />
        </div>
        <div className="absolute rounded-full" style={{ width: 9, height: 9, backgroundColor: '#fcd9b6', top: -7, left: 2.5 }} />
        <div className="absolute rounded-t-full" style={{ width: 9, height: 4, backgroundColor: team === 'A' ? '#4a3728' : '#1a1a1a', top: -7, left: 2.5 }} />
      </div>
    )
  }

  const Grid = () => {
    const now = Date.now()
    return [...Array(GRID_ROWS)].map((_, y) => [...Array(GRID_COLS)].map((_, x) => {
      const mult = getMultiplier(x, y, ballPos.x, ballPos.y)
      const bet = bets.find(b => b.cx === x && b.cy === y && !b.resolved)
      const fx = effects.find(e => e.cx === x && e.cy === y)
      const hover = hovered?.x === x && hovered?.y === y
      const left = bet ? Math.max(0, (bet.end - now) / 1000) : 0

      let bg = 'transparent', border = 'rgba(255,255,255,0.05)'
      if (hover && !bet) {
        bg = mult <= 2 ? 'rgba(34,197,94,0.25)' : mult <= 5 ? 'rgba(234,179,8,0.25)' : 'rgba(249,115,22,0.25)'
        border = 'rgba(255,255,255,0.3)'
      }
      if (bet) { bg = 'rgba(59,130,246,0.4)'; border = 'rgba(59,130,246,0.7)' }
      if (fx) bg = fx.win ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.5)'

      return (
        <div key={`${x}-${y}`} onClick={() => placeBet(x, y)} onMouseEnter={() => setHovered({ x, y })} onMouseLeave={() => setHovered(null)}
          className="absolute cursor-pointer flex flex-col items-center justify-center transition-all duration-150"
          style={{ left: `${x / GRID_COLS * 100}%`, top: `${y / GRID_ROWS * 100}%`, width: `${100 / GRID_COLS}%`, height: `${100 / GRID_ROWS}%`,
            backgroundColor: bg, borderRight: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
          {(hover || bet) && <span className="text-white font-bold text-[11px]" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
            {bet ? `${left.toFixed(1)}s` : `${mult.toFixed(1)}x`}
          </span>}
          {bet && <span className="text-white/70 text-[9px]">{bet.mult.toFixed(1)}x</span>}
        </div>
      )
    }))
  }

  const g = game.current
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-4xl mb-3 flex justify-between items-center px-2">
        <div className="bg-yellow-500/20 border border-yellow-500/40 rounded-lg px-3 py-1.5">
          <span className="text-yellow-400 text-sm sm:text-lg font-bold">{coins}</span>
          <span className="text-yellow-400/60 text-xs ml-1">coins</span>
        </div>
        <div className="flex gap-4 text-xs sm:text-sm">
          <span className="text-green-400"><b>{wins}</b> <span className="opacity-60">W</span></span>
          <span className="text-red-400"><b>{losses}</b> <span className="opacity-60">L</span></span>
        </div>
      </div>
      <div className="text-white/40 text-[10px] sm:text-xs mb-2">Hover to see odds. Click to bet {BET_COST} coins.</div>

      <div className="relative w-full max-w-4xl aspect-[3/2] rounded-lg overflow-hidden shadow-2xl">
        <div className="absolute inset-0 flex">
          {[...Array(16)].map((_, i) => <div key={i} className="flex-1 h-full" style={{ backgroundColor: i % 2 === 0 ? '#3d8b40' : '#4a9f4d' }} />)}
        </div>
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 120 80" preserveAspectRatio="xMidYMid slice">
          <rect x="2" y="2" width="116" height="76" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <line x1="60" y1="2" x2="60" y2="78" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <circle cx="60" cy="40" r="10" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <circle cx="60" cy="40" r="1" fill="rgba(255,255,255,0.85)" />
          <rect x="2" y="18" width="18" height="44" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <rect x="2" y="28" width="7" height="24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <path d="M 20 30 A 10 10 0 0 1 20 50" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <rect x="100" y="18" width="18" height="44" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <rect x="111" y="28" width="7" height="24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <path d="M 100 30 A 10 10 0 0 0 100 50" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <rect x="-2" y="32" width="4" height="16" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.6" />
          <rect x="118" y="32" width="4" height="16" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.6" />
        </svg>
        <div className="absolute inset-0"><Grid /></div>
        {teamA.map(p => <Player key={`A${p.id}`} p={p} team="A" carrier={g.poss === 'A' && g.carrier === p.id} />)}
        {teamB.map(p => <Player key={`B${p.id}`} p={p} team="B" carrier={g.poss === 'B' && g.carrier === p.id} />)}
        <div className="absolute rounded-full bg-black/30 pointer-events-none" style={{ left: `${ballPos.x * 100}%`, top: `${ballPos.y * 100 + 1.8}%`, width: 12, height: 5, transform: 'translate(-50%, -50%)', filter: 'blur(1px)' }} />
        <div className="absolute rounded-full pointer-events-none" style={{ left: `${ballPos.x * 100}%`, top: `${ballPos.y * 100}%`, width: 14, height: 14, transform: 'translate(-50%, -50%)', background: 'radial-gradient(circle at 35% 35%, #fff 0%, #e8e8e8 60%, #ccc 100%)', boxShadow: '0 2px 4px rgba(0,0,0,0.4)', zIndex: 25 }}>
          <svg className="w-full h-full" viewBox="0 0 14 14">
            <circle cx="7" cy="7" r="2.5" fill="#222" opacity="0.7" />
            <circle cx="3.5" cy="4" r="1.5" fill="#222" opacity="0.5" />
            <circle cx="10.5" cy="4" r="1.5" fill="#222" opacity="0.5" />
            <circle cx="3" cy="10" r="1.5" fill="#222" opacity="0.5" />
            <circle cx="11" cy="10" r="1.5" fill="#222" opacity="0.5" />
          </svg>
        </div>
        {coinAnims.map(a => <div key={a.id} className="absolute text-yellow-400 font-bold text-xl pointer-events-none" style={{ left: '50%', top: '40%', animation: 'coinFloat 1.2s ease-out forwards' }}>+{a.amt}</div>)}
      </div>

      <div className="mt-3 flex gap-4 text-[10px] sm:text-xs text-white/50">
        <span className="text-green-400/70">1.5-2x</span>
        <span className="text-yellow-400/70">3-5x</span>
        <span className="text-orange-400/70">7-15x</span>
        <span className="ml-2"><span className="inline-block w-2 h-2 rounded-full bg-red-600 mr-1" />vs<span className="inline-block w-2 h-2 rounded-full bg-blue-600 ml-1" /></span>
      </div>
      <style>{`@keyframes coinFloat { 0% { opacity: 1; transform: translate(-50%, 0) scale(1); } 100% { opacity: 0; transform: translate(-50%, -60px) scale(1.3); } }`}</style>
    </div>
  )
}

export default App
