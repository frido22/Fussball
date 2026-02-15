import { useState, useEffect, useRef, useCallback } from 'react'
import './index.css'

// Grid configuration
const GRID_COLS = 12
const GRID_ROWS = 8
const BET_COST = 5
const BET_DURATION = 5000
const STARTING_COINS = 100

// Team formations (4-3-3)
const TEAM_A_BASE = [
  { x: 0.06, y: 0.5, role: 'GK' },
  { x: 0.20, y: 0.15, role: 'LB' },
  { x: 0.18, y: 0.38, role: 'CB' },
  { x: 0.18, y: 0.62, role: 'CB' },
  { x: 0.20, y: 0.85, role: 'RB' },
  { x: 0.38, y: 0.25, role: 'CM' },
  { x: 0.35, y: 0.5, role: 'CM' },
  { x: 0.38, y: 0.75, role: 'CM' },
  { x: 0.48, y: 0.18, role: 'LW' },
  { x: 0.48, y: 0.5, role: 'ST' },
  { x: 0.48, y: 0.82, role: 'RW' },
]

const TEAM_B_BASE = [
  { x: 0.94, y: 0.5, role: 'GK' },
  { x: 0.80, y: 0.15, role: 'LB' },
  { x: 0.82, y: 0.38, role: 'CB' },
  { x: 0.82, y: 0.62, role: 'CB' },
  { x: 0.80, y: 0.85, role: 'RB' },
  { x: 0.62, y: 0.25, role: 'CM' },
  { x: 0.65, y: 0.5, role: 'CM' },
  { x: 0.62, y: 0.75, role: 'CM' },
  { x: 0.52, y: 0.18, role: 'LW' },
  { x: 0.52, y: 0.5, role: 'ST' },
  { x: 0.52, y: 0.82, role: 'RW' },
]

// Get multiplier based on distance from ball
const getMultiplier = (cellX, cellY, ballX, ballY) => {
  const ballCellX = Math.floor(ballX * GRID_COLS)
  const ballCellY = Math.floor(ballY * GRID_ROWS)
  const distance = Math.sqrt((cellX - ballCellX) ** 2 + (cellY - ballCellY) ** 2)

  if (distance <= 1) return 1.5
  if (distance <= 2) return 2.0
  if (distance <= 3) return 3.0
  if (distance <= 4) return 5.0
  if (distance <= 5) return 7.0
  if (distance <= 6) return 10.0
  return 15.0
}

function App() {
  const [ballPos, setBallPos] = useState({ x: 0.5, y: 0.5 })
  const [coins, setCoins] = useState(STARTING_COINS)
  const [totalWins, setTotalWins] = useState(0)
  const [totalLosses, setTotalLosses] = useState(0)
  const [activeBets, setActiveBets] = useState([])
  const [flashEffects, setFlashEffects] = useState([])
  const [coinAnimations, setCoinAnimations] = useState([])
  const [teamAPlayers, setTeamAPlayers] = useState(TEAM_A_BASE.map((p, i) => ({ ...p, id: i, vx: 0, vy: 0 })))
  const [teamBPlayers, setTeamBPlayers] = useState(TEAM_B_BASE.map((p, i) => ({ ...p, id: i, vx: 0, vy: 0 })))
  const [possession, setPossession] = useState('A')
  const [ballCarrier, setBallCarrier] = useState(null)
  const [hoveredCell, setHoveredCell] = useState(null)

  const animationRef = useRef()
  const gameState = useRef({
    ballX: 0.5,
    ballY: 0.5,
    ballVX: 0,
    ballVY: 0,
    possession: 'A',
    carrierId: 9, // Start with striker
    passTarget: null,
    passProgress: 0,
    lastPassTime: Date.now(),
    phase: 'possession', // possession, passing, loose
  })

  // Find nearest player to a position
  const findNearestPlayer = useCallback((x, y, team, excludeId = -1) => {
    const players = team === 'A' ? teamAPlayers : teamBPlayers
    let nearest = null
    let minDist = Infinity

    players.forEach((p, i) => {
      if (i === excludeId) return
      const dist = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2)
      if (dist < minDist) {
        minDist = dist
        nearest = { ...p, index: i }
      }
    })
    return nearest
  }, [teamAPlayers, teamBPlayers])

  // Main game loop
  useEffect(() => {
    let lastTime = performance.now()

    const animate = (currentTime) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.05)
      lastTime = currentTime

      const state = gameState.current
      const now = Date.now()

      // Get current carrier
      const carrierTeam = state.possession === 'A' ? teamAPlayers : teamBPlayers
      const carrier = carrierTeam[state.carrierId]

      if (state.phase === 'possession' && carrier) {
        // Ball follows carrier
        state.ballX = carrier.x
        state.ballY = carrier.y

        // Decide when to pass (every 1.5-4 seconds)
        if (now - state.lastPassTime > 1500 + Math.random() * 2500) {
          // Find pass target
          const teammates = state.possession === 'A' ? teamAPlayers : teamBPlayers
          const validTargets = teammates.filter((p, i) => {
            if (i === state.carrierId) return false
            if (p.role === 'GK' && Math.random() > 0.1) return false
            return true
          })

          if (validTargets.length > 0) {
            // Prefer forward passes
            const target = validTargets.reduce((best, p) => {
              const forwardBonus = state.possession === 'A' ? p.x - carrier.x : carrier.x - p.x
              const score = forwardBonus * 0.5 + Math.random() * 0.5
              return score > best.score ? { player: p, score } : best
            }, { player: validTargets[0], score: -Infinity }).player

            state.passTarget = { x: target.x, y: target.y, id: target.id }
            state.passProgress = 0
            state.phase = 'passing'
            state.lastPassTime = now
          }
        }
      } else if (state.phase === 'passing' && state.passTarget) {
        // Ball traveling to target
        const passSpeed = 0.4 + Math.random() * 0.3
        state.passProgress += dt * passSpeed

        const startX = carrier ? carrier.x : state.ballX
        const startY = carrier ? carrier.y : state.ballY

        // Smooth curve pass
        const t = Math.min(state.passProgress, 1)
        const easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

        state.ballX = startX + (state.passTarget.x - startX) * easeT
        state.ballY = startY + (state.passTarget.y - startY) * easeT

        // Pass complete
        if (state.passProgress >= 1) {
          state.carrierId = state.passTarget.id
          state.passTarget = null
          state.phase = 'possession'

          // 15% chance to lose possession
          if (Math.random() < 0.15) {
            state.possession = state.possession === 'A' ? 'B' : 'A'
            const newTeam = state.possession === 'A' ? teamAPlayers : teamBPlayers
            const nearest = newTeam.reduce((best, p, i) => {
              const dist = Math.sqrt((p.x - state.ballX) ** 2 + (p.y - state.ballY) ** 2)
              return dist < best.dist ? { index: i, dist } : best
            }, { index: 0, dist: Infinity })
            state.carrierId = nearest.index
          }
        }
      }

      setBallPos({ x: state.ballX, y: state.ballY })
      setPossession(state.possession)
      setBallCarrier(state.carrierId)

      // Move players
      const moveTeam = (players, basePositions, isAttacking) => {
        return players.map((p, i) => {
          const base = basePositions[i]
          let targetX = base.x
          let targetY = base.y

          // Shift based on ball position
          const ballInfluence = 0.15
          const shiftX = (state.ballX - 0.5) * ballInfluence
          const shiftY = (state.ballY - 0.5) * ballInfluence * 0.5

          // Attacking team pushes forward
          if (isAttacking) {
            targetX += 0.08
          } else {
            targetX -= 0.05
          }

          targetX = Math.max(0.04, Math.min(0.96, targetX + shiftX))
          targetY = Math.max(0.05, Math.min(0.95, targetY + shiftY))

          // Ball carrier moves toward goal
          if (isAttacking && state.carrierId === i && state.phase === 'possession') {
            const goalX = isAttacking ? (state.possession === 'A' ? 0.9 : 0.1) : base.x
            targetX = p.x + (goalX - p.x) * 0.02
            targetY = p.y + (0.5 - p.y) * 0.01
          }

          // Smooth movement
          const speed = 0.8
          const newX = p.x + (targetX - p.x) * speed * dt
          const newY = p.y + (targetY - p.y) * speed * dt

          return { ...p, x: newX, y: newY }
        })
      }

      setTeamAPlayers(prev => moveTeam(prev, TEAM_A_BASE, state.possession === 'A'))
      setTeamBPlayers(prev => moveTeam(prev, TEAM_B_BASE, state.possession === 'B'))

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationRef.current)
  }, [teamAPlayers, teamBPlayers])

  // Check bets
  useEffect(() => {
    const checkBets = () => {
      const state = gameState.current
      const currentCellX = Math.floor(state.ballX * GRID_COLS)
      const currentCellY = Math.floor(state.ballY * GRID_ROWS)

      setActiveBets(prev => prev.map(bet => {
        if (bet.resolved) return bet
        if (currentCellX === bet.cellX && currentCellY === bet.cellY) {
          return { ...bet, passedThrough: true }
        }
        return bet
      }))
    }

    const interval = setInterval(checkBets, 16)
    return () => clearInterval(interval)
  }, [])

  // Resolve bets
  useEffect(() => {
    const resolveBets = () => {
      const now = Date.now()

      setActiveBets(prev => {
        const stillActive = []
        const toResolve = []

        prev.forEach(bet => {
          if (!bet.resolved && now >= bet.endTime) {
            toResolve.push(bet)
          } else if (!bet.resolved) {
            stillActive.push(bet)
          }
        })

        toResolve.forEach(bet => {
          if (bet.passedThrough) {
            const winAmount = Math.floor(BET_COST * bet.multiplier)
            setCoins(c => c + winAmount)
            setTotalWins(w => w + 1)
            setFlashEffects(prev => [...prev, { id: bet.id, cellX: bet.cellX, cellY: bet.cellY, type: 'win', time: now }])
            setCoinAnimations(prev => [...prev, { id: bet.id, amount: winAmount, time: now }])
          } else {
            setTotalLosses(l => l + 1)
            setFlashEffects(prev => [...prev, { id: bet.id, cellX: bet.cellX, cellY: bet.cellY, type: 'loss', time: now }])
          }
        })

        return stillActive
      })
    }

    const interval = setInterval(resolveBets, 100)
    return () => clearInterval(interval)
  }, [])

  // Cleanup effects
  useEffect(() => {
    const cleanup = () => {
      const now = Date.now()
      setFlashEffects(prev => prev.filter(f => now - f.time < 600))
      setCoinAnimations(prev => prev.filter(a => now - a.time < 1200))
    }
    const interval = setInterval(cleanup, 100)
    return () => clearInterval(interval)
  }, [])

  // Place bet
  const placeBet = useCallback((cellX, cellY) => {
    if (coins < BET_COST) return
    const existingBet = activeBets.find(bet => bet.cellX === cellX && bet.cellY === cellY && !bet.resolved)
    if (existingBet) return

    const multiplier = getMultiplier(cellX, cellY, ballPos.x, ballPos.y)
    const state = gameState.current
    const currentCellX = Math.floor(state.ballX * GRID_COLS)
    const currentCellY = Math.floor(state.ballY * GRID_ROWS)

    setCoins(c => c - BET_COST)
    setActiveBets(prev => [...prev, {
      id: Date.now() + Math.random(),
      cellX, cellY, multiplier,
      startTime: Date.now(),
      endTime: Date.now() + BET_DURATION,
      passedThrough: currentCellX === cellX && currentCellY === cellY,
      resolved: false,
    }])
  }, [coins, activeBets, ballPos])

  // Render player
  const renderPlayer = (player, team, isCarrier) => {
    const color = team === 'A' ? '#dc2626' : '#2563eb'
    const shortsColor = team === 'A' ? '#991b1b' : '#1d4ed8'

    return (
      <div
        key={`${team}-${player.id}`}
        className="absolute pointer-events-none"
        style={{
          left: `${player.x * 100}%`,
          top: `${player.y * 100}%`,
          transform: 'translate(-50%, -50%)',
          zIndex: isCarrier ? 20 : 10,
        }}
      >
        {/* Shadow */}
        <div
          className="absolute bg-black/25 rounded-full"
          style={{ width: 20, height: 8, left: -2, top: 18, filter: 'blur(1px)' }}
        />
        {/* Body/Jersey */}
        <div
          className="relative rounded-t-full"
          style={{
            width: 14,
            height: 12,
            backgroundColor: color,
            border: '1px solid rgba(255,255,255,0.3)',
          }}
        />
        {/* Shorts */}
        <div
          style={{
            width: 14,
            height: 5,
            backgroundColor: shortsColor,
            marginTop: -1,
          }}
        />
        {/* Legs */}
        <div className="flex justify-between" style={{ width: 14, marginTop: -1 }}>
          <div style={{ width: 4, height: 6, backgroundColor: '#fcd9b6', marginLeft: 2 }} />
          <div style={{ width: 4, height: 6, backgroundColor: '#fcd9b6', marginRight: 2 }} />
        </div>
        {/* Head */}
        <div
          className="absolute rounded-full"
          style={{
            width: 10,
            height: 10,
            backgroundColor: '#fcd9b6',
            top: -8,
            left: 2,
            border: '1px solid rgba(0,0,0,0.1)',
          }}
        />
        {/* Hair */}
        <div
          className="absolute rounded-t-full"
          style={{
            width: 10,
            height: 5,
            backgroundColor: team === 'A' ? '#4a3728' : '#1a1a1a',
            top: -8,
            left: 2,
          }}
        />
      </div>
    )
  }

  // Render grid
  const renderGrid = () => {
    const cells = []
    const now = Date.now()

    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        const multiplier = getMultiplier(x, y, ballPos.x, ballPos.y)
        const activeBet = activeBets.find(bet => bet.cellX === x && bet.cellY === y && !bet.resolved)
        const flashEffect = flashEffects.find(f => f.cellX === x && f.cellY === y)
        const isHovered = hoveredCell?.x === x && hoveredCell?.y === y

        const timeLeft = activeBet ? Math.max(0, (activeBet.endTime - now) / 1000) : null

        let bgColor = 'transparent'
        let borderColor = 'rgba(255,255,255,0.05)'

        if (isHovered && !activeBet) {
          const mult = multiplier
          if (mult <= 2) bgColor = 'rgba(34, 197, 94, 0.25)'
          else if (mult <= 5) bgColor = 'rgba(234, 179, 8, 0.25)'
          else bgColor = 'rgba(249, 115, 22, 0.25)'
          borderColor = 'rgba(255,255,255,0.3)'
        }

        if (activeBet) {
          bgColor = 'rgba(59, 130, 246, 0.4)'
          borderColor = 'rgba(59, 130, 246, 0.7)'
        }

        if (flashEffect) {
          bgColor = flashEffect.type === 'win' ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.5)'
        }

        cells.push(
          <div
            key={`${x}-${y}`}
            onClick={() => placeBet(x, y)}
            onMouseEnter={() => setHoveredCell({ x, y })}
            onMouseLeave={() => setHoveredCell(null)}
            className="absolute cursor-pointer flex flex-col items-center justify-center transition-all duration-150"
            style={{
              left: `${(x / GRID_COLS) * 100}%`,
              top: `${(y / GRID_ROWS) * 100}%`,
              width: `${100 / GRID_COLS}%`,
              height: `${100 / GRID_ROWS}%`,
              backgroundColor: bgColor,
              borderRight: `1px solid ${borderColor}`,
              borderBottom: `1px solid ${borderColor}`,
            }}
          >
            {(isHovered || activeBet) && (
              <span
                className="text-white font-bold transition-opacity"
                style={{
                  fontSize: '11px',
                  textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                  opacity: activeBet ? 1 : 0.9,
                }}
              >
                {activeBet ? `${timeLeft.toFixed(1)}s` : `${multiplier.toFixed(1)}x`}
              </span>
            )}
            {activeBet && (
              <span className="text-white/70 text-[9px]" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                {activeBet.multiplier.toFixed(1)}x
              </span>
            )}
          </div>
        )
      }
    }
    return cells
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center p-2 sm:p-4">
      {/* Header */}
      <div className="w-full max-w-4xl mb-3 flex justify-between items-center px-2">
        <div className="bg-yellow-500/20 border border-yellow-500/40 rounded-lg px-3 py-1.5">
          <span className="text-yellow-400 text-sm sm:text-lg font-bold">{coins}</span>
          <span className="text-yellow-400/60 text-xs ml-1">coins</span>
        </div>

        <div className="flex gap-4 text-xs sm:text-sm">
          <div className="text-green-400">
            <span className="font-bold">{totalWins}</span>
            <span className="opacity-60 ml-1">W</span>
          </div>
          <div className="text-red-400">
            <span className="font-bold">{totalLosses}</span>
            <span className="opacity-60 ml-1">L</span>
          </div>
        </div>
      </div>

      <div className="text-white/40 text-[10px] sm:text-xs mb-2 text-center">
        Hover to see odds. Click to bet {BET_COST} coins. Ball passes through = WIN!
      </div>

      {/* Pitch */}
      <div className="relative w-full max-w-4xl aspect-[3/2] rounded-lg overflow-hidden shadow-2xl">
        {/* Grass stripes */}
        <div className="absolute inset-0 flex">
          {[...Array(16)].map((_, i) => (
            <div key={i} className="flex-1 h-full" style={{ backgroundColor: i % 2 === 0 ? '#3d8b40' : '#4a9f4d' }} />
          ))}
        </div>

        {/* Pitch markings */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 120 80" preserveAspectRatio="xMidYMid slice">
          <rect x="2" y="2" width="116" height="76" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <line x1="60" y1="2" x2="60" y2="78" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <circle cx="60" cy="40" r="10" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <circle cx="60" cy="40" r="1" fill="rgba(255,255,255,0.85)" />
          <rect x="2" y="18" width="18" height="44" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <rect x="2" y="28" width="7" height="24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <path d="M 20 30 A 10 10 0 0 1 20 50" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <circle cx="14" cy="40" r="0.8" fill="rgba(255,255,255,0.85)" />
          <rect x="100" y="18" width="18" height="44" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <rect x="111" y="28" width="7" height="24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <path d="M 100 30 A 10 10 0 0 0 100 50" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <circle cx="106" cy="40" r="0.8" fill="rgba(255,255,255,0.85)" />
          <path d="M 2 5 A 3 3 0 0 0 5 2" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <path d="M 115 2 A 3 3 0 0 0 118 5" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <path d="M 2 75 A 3 3 0 0 1 5 78" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          <path d="M 115 78 A 3 3 0 0 1 118 75" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5" />
          {/* Goals */}
          <rect x="-2" y="32" width="4" height="16" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.6" />
          <rect x="118" y="32" width="4" height="16" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.6" />
        </svg>

        {/* Grid overlay */}
        <div className="absolute inset-0">{renderGrid()}</div>

        {/* Players */}
        {teamAPlayers.map(p => renderPlayer(p, 'A', possession === 'A' && ballCarrier === p.id))}
        {teamBPlayers.map(p => renderPlayer(p, 'B', possession === 'B' && ballCarrier === p.id))}

        {/* Ball shadow */}
        <div
          className="absolute rounded-full bg-black/30 pointer-events-none"
          style={{
            left: `${ballPos.x * 100}%`,
            top: `${ballPos.y * 100 + 1.8}%`,
            width: 12, height: 5,
            transform: 'translate(-50%, -50%)',
            filter: 'blur(1px)',
          }}
        />

        {/* Ball */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${ballPos.x * 100}%`,
            top: `${ballPos.y * 100}%`,
            width: 14, height: 14,
            transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(circle at 35% 35%, #fff 0%, #e8e8e8 60%, #ccc 100%)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
            zIndex: 25,
          }}
        >
          <svg className="w-full h-full" viewBox="0 0 14 14">
            <circle cx="7" cy="7" r="2.5" fill="#222" opacity="0.7" />
            <circle cx="3.5" cy="4" r="1.5" fill="#222" opacity="0.5" />
            <circle cx="10.5" cy="4" r="1.5" fill="#222" opacity="0.5" />
            <circle cx="3" cy="10" r="1.5" fill="#222" opacity="0.5" />
            <circle cx="11" cy="10" r="1.5" fill="#222" opacity="0.5" />
          </svg>
        </div>

        {/* Win animations */}
        {coinAnimations.map(anim => (
          <div
            key={anim.id}
            className="absolute text-yellow-400 font-bold text-xl pointer-events-none"
            style={{
              left: '50%', top: '40%',
              animation: 'coinFloat 1.2s ease-out forwards',
            }}
          >
            +{anim.amount}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 flex gap-4 text-[10px] sm:text-xs text-white/50">
        <span className="text-green-400/70">1.5-2x</span>
        <span className="text-yellow-400/70">3-5x</span>
        <span className="text-orange-400/70">7-15x</span>
        <span className="ml-2">
          <span className="inline-block w-2 h-2 rounded-full bg-red-600 mr-1" />vs
          <span className="inline-block w-2 h-2 rounded-full bg-blue-600 ml-1" />
        </span>
      </div>

      <style>{`
        @keyframes coinFloat {
          0% { opacity: 1; transform: translate(-50%, 0) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -60px) scale(1.3); }
        }
      `}</style>
    </div>
  )
}

export default App
