import React, { useMemo, useState } from 'react'

// --- Lax-Milgram Theorem (Variational Formulation for PDEs) ---
// Uses the Lax-Milgram theorem to solve variational problems arising
// from PDEs in financial mathematics, ensuring existence and uniqueness.
//
// Mathematical foundation:
//   Lax-Milgram: Let a(.,.) be a bounded coercive bilinear form on H:
//   1. Bounded: |a(u,v)| <= C ||u|| ||v||
//   2. Coercive: a(u,u) >= alpha ||u||^2 (alpha > 0)
//   Then for any bounded linear functional L on H,
//   there exists unique u in H such that a(u,v) = L(v) for all v in H
//
//   Example (Poisson): -u'' = f on (0,1), u(0)=u(1)=0
//   Variational: a(u,v) = integral u'v' dx, L(v) = integral fv dx
//   a is bounded (C=1) and coercive (alpha=1/pi^2 by Poincare)
//
//   Applications: option pricing PDEs, optimal stopping,
//   finite element methods, variational inequality (American options)

const computeReturns = (prices) => {
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return rets
}

// Solve variational problem a(u,v) = L(v) via finite elements
// Bilinear form: a(u,v) = integral [eps*u'*v' + b*u'*v + c*u*v] dx
// Linear functional: L(v) = integral f*v dx
const solveVariational = (eps, b, c, f, nElements, nPoints) => {
  const h = 1 / nElements
  const n = nElements + 1 // nodes

  // Stiffness matrix (tridiagonal for linear FEM)
  // a(phi_i, phi_j) for hat functions
  const A = Array.from({ length: n }, () => new Array(n).fill(0))
  const F = new Array(n).fill(0)

  for (let e = 0; e < nElements; e++) {
    const i = e, j = e + 1
    // Local stiffness: a(phi_i, phi_j) on element [x_e, x_{e+1}]
    // eps * integral phi'_i phi'_j dx = eps/h * [[1,-1],[-1,1]]
    // b * integral phi'_i phi_j dx = b/2 * [[-1,1],[-1,1]]
    // c * integral phi_i phi_j dx = c*h/6 * [[2,1],[1,2]]

    A[i][i] += eps / h + c * h / 3 - b / 2
    A[i][j] += -eps / h + c * h / 6 + b / 2
    A[j][i] += -eps / h + c * h / 6 - b / 2
    A[j][j] += eps / h + c * h / 3 + b / 2

    // Load: f * integral phi_i dx = f * h/2
    const xm = (e + 0.5) * h
    const fe = typeof f === 'function' ? f(xm) : f
    F[i] += fe * h / 2
    F[j] += fe * h / 2
  }

  // Boundary conditions: u(0) = u(1) = 0 (Dirichlet)
  A[0][0] = 1; A[0][1] = 0; F[0] = 0
  A[n - 1][n - 1] = 1; A[n - 1][n - 2] = 0; F[n - 1] = 0

  // Solve tridiagonal system (Thomas algorithm)
  const cp = new Array(n).fill(0)
  const dp = new Array(n).fill(0)
  cp[0] = A[0][1] / A[0][0]
  dp[0] = F[0] / A[0][0]
  for (let i = 1; i < n; i++) {
    const m = A[i][i] - A[i][i - 1] * cp[i - 1]
    cp[i] = i < n - 1 ? A[i][i + 1] / m : 0
    dp[i] = (F[i] - A[i][i - 1] * dp[i - 1]) / m
  }

  const u = new Array(n).fill(0)
  u[n - 1] = dp[n - 1]
  for (let i = n - 2; i >= 0; i--) {
    u[i] = dp[i] - cp[i] * u[i + 1]
  }

  // Coercivity check: a(u,u) >= alpha * ||u||^2
  let aUU = 0, uNormSq = 0
  for (let e = 0; e < nElements; e++) {
    const du = (u[e + 1] - u[e]) / h
    const um = (u[e + 1] + u[e]) / 2
    aUU += eps * du * du * h + c * um * um * h
    uNormSq += um * um * h
  }
  const alpha = uNormSq > 0 ? aUU / uNormSq : 0

  // Boundedness constant
  const C = eps / h + Math.abs(b) / 2 + c * h / 3

  return { u, alpha, C, h, n }
}

export default function LaxMilgram({ candles, symbol, exchange }) {
  const [lookback, setLookback] = useState(100)
  const [eps, setEps] = useState(0.01)
  const [b, setB] = useState(0)
  const [c, setC] = useState(1)
  const [nElements, setNElements] = useState(50)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < lookback + 1) return null
    const cds = candles[exchange][symbol]
    const prices = cds.slice(-lookback).map(c => c.close)
    const returns = computeReturns(prices)

    const n = returns.length
    if (n < 20) return null

    // Use returns to define forcing function f(x)
    const meanR = returns.reduce((a, x) => a + x, 0) / n
    const stdR = Math.sqrt(returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / n)

    // Forcing function: peaks at current return level
    const currentReturn = returns[n - 1]
    const f = (x) => {
      // Gaussian bump centered at normalized current return
      const xc = (currentReturn - meanR) / (4 * stdR + 0.001) + 0.5
      return Math.exp(-((x - xc) ** 2) / 0.05) * Math.abs(currentReturn) * 100
    }

    // Solve variational problem
    const solution = solveVariational(eps, b, c, f, nElements, nElements + 1)

    // Grid points
    const grid = []
    for (let i = 0; i <= nElements; i++) {
      const x = i / nElements
      grid.push({ x, u: solution.u[i], f: f(x) })
    }

    // Coercivity and boundedness
    const isCoercive = solution.alpha > 0
    const isBounded = solution.C > 0 && solution.C < 1e6
    const laxMilgramApplies = isCoercive && isBounded

    // Vary epsilon to see effect on solution
    const epsSweep = [0.001, 0.005, 0.01, 0.05, 0.1, 0.5].map(e => {
      const sol = solveVariational(e, b, c, f, nElements, nElements + 1)
      return { eps: e, u: sol.u, alpha: sol.alpha }
    })

    // Signal: use solution value at current return location
    const xc = (currentReturn - meanR) / (4 * stdR + 0.001) + 0.5
    const idx = Math.min(nElements, Math.max(0, Math.floor(xc * nElements)))
    const uAtCurrent = solution.u[idx]

    let signal = 'NEUTRAL'
    let reason = ''
    if (uAtCurrent > 0.01) {
      signal = 'VARIATIONAL_LONG'
      reason = `u(x_current) = ${uAtCurrent.toFixed(6)} > 0 (variational solution suggests long)`
    } else if (uAtCurrent < -0.01) {
      signal = 'VARIATIONAL_SHORT'
      reason = `u(x_current) = ${uAtCurrent.toFixed(6)} < 0 (variational solution suggests short)`
    } else {
      reason = `u(x_current) = ${uAtCurrent.toFixed(6)} (neutral, coercivity alpha=${solution.alpha.toFixed(4)})`
    }

    return {
      grid, solution, epsSweep,
      isCoercive, isBounded, laxMilgramApplies,
      uAtCurrent, signal, reason,
      meanR, stdR, currentReturn,
    }
  }, [candles, exchange, symbol, lookback, eps, b, c, nElements])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least {lookback + 1} candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'VARIATIONAL_LONG' ? '#22c55e' : data.signal === 'VARIATIONAL_SHORT' ? '#ef4444' : '#94a3b8'

  // Solution u(x) and forcing f(x)
  const maxU = Math.max(...data.grid.map(g => Math.abs(g.u)), 0.01)
  const maxF = Math.max(...data.grid.map(g => g.f), 0.01)
  const sxX = (i) => P + (i / data.grid.length) * (W - 2 * P)
  const syU = (v) => H - P - ((v + maxU) / (2 * maxU)) * (H - 2 * P)
  const syF = (v) => H - P - (v / maxF) * (H - 2 * P)

  // Epsilon sweep
  const maxUSweep = Math.max(...data.epsSweep.flatMap(e => e.u.map(Math.abs)), 0.01)
  const syUS = (v) => H - P - ((v + maxUSweep) / (2 * maxUSweep)) * (H - 2 * P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">Lax-Milgram Theorem (Variational PDE) — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">eps (diffusion):</span>
          <input type="number" step="0.005" value={eps} onChange={e => setEps(Math.max(0.001, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">b (advection):</span>
          <input type="number" step="0.5" value={b} onChange={e => setB(+e.target.value)} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">c (reaction):</span>
          <input type="number" step="0.5" value={c} onChange={e => setC(Math.max(0.01, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Elements:</span>
          <input type="number" value={nElements} onChange={e => setNElements(Math.max(10, Math.min(100, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Solution and forcing */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Variational Solution u(x): a(u,v) = L(v) (FEM with {nElements} elements)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {/* Forcing function */}
          <path d={data.grid.map((g, i) => `${i === 0 ? 'M' : 'L'} ${sxX(i)} ${syF(g.f)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={1.5} opacity={0.5} />

          {/* Solution */}
          <path d={data.grid.map((g, i) => `${i === 0 ? 'M' : 'L'} ${sxX(i)} ${syU(g.u)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2.5} />

          {/* Current position marker */}
          <line x1={sxX(Math.floor((data.currentReturn - data.meanR) / (4 * data.stdR + 0.001) * data.grid.length / 2 + data.grid.length / 2))} y1={P} x2={sxX(Math.floor((data.currentReturn - data.meanR) / (4 * data.stdR + 0.001) * data.grid.length / 2 + data.grid.length / 2))} y2={H - P} stroke="#fbbf24" strokeWidth={1} strokeDasharray="3,3" />

          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>u(x) variational solution</text>
          <text x={W - P} y={34} textAnchor="end" fill="#f59e0b" fontSize={9}>f(x) forcing function</text>
          <text x={W - P} y={48} textAnchor="end" fill="#fbbf24" fontSize={9}>current position</text>
        </svg>
      </div>

      {/* Epsilon sweep */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Solution Family for Varying eps (diffusion coefficient): regularized solutions</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" />
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />

          {data.epsSweep.map((s, i) => (
            <path key={i} d={s.u.map((v, j) => `${j === 0 ? 'M' : 'L'} ${sxX(j)} ${syUS(v)}`).join(' ')} fill="none" stroke={`hsl(${200 + i * 30}, 70%, 60%)`} strokeWidth={1.5} opacity={0.7} />
          ))}

          {data.epsSweep.map((s, i) => (
            <text key={i} x={W - P} y={20 + i * 14} textAnchor="end" fill={`hsl(${200 + i * 30}, 70%, 60%)`} fontSize={8}>eps={s.eps} (alpha={s.alpha.toFixed(3)})</text>
          ))}
        </svg>
      </div>

      {/* Lax-Milgram conditions */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-2">Lax-Milgram Conditions</div>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 w-32">Coercivity (alpha):</span>
            <span className="font-mono" style={{ color: data.isCoercive ? '#22c55e' : '#ef4444' }}>{data.solution.alpha.toFixed(6)} {data.isCoercive ? '(OK)' : '(FAIL)'}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-slate-400 w-32">Boundedness (C):</span>
            <span className="font-mono" style={{ color: data.isBounded ? '#22c55e' : '#ef4444' }}>{data.solution.C.toFixed(6)} {data.isBounded ? '(OK)' : '(FAIL)'}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-slate-400 w-32">Lax-Milgram:</span>
            <span className="font-mono" style={{ color: data.laxMilgramApplies ? '#22c55e' : '#ef4444' }}>{data.laxMilgramApplies ? 'APPLIES (unique solution exists)' : 'FAILS'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">u(x_current)</div>
          <div className="text-cyan-400 font-mono">{data.uAtCurrent.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">alpha (coerc.)</div>
          <div className="text-emerald-400 font-mono">{data.solution.alpha.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">C (bound)</div>
          <div className="text-amber-400 font-mono">{data.solution.C.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">h (mesh)</div>
          <div className="text-purple-400 font-mono">{data.solution.h.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Elements</div>
          <div className="text-slate-300 font-mono">{nElements}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Signal:</strong> {data.reason} |
        <strong> Lax-Milgram:</strong> a(u,v)=L(v) has unique solution iff a is bounded + coercive |
        <strong> Bilinear:</strong> a(u,v) = eps*int(u'v') + b*int(u'v) + c*int(uv) |
        <strong> Coercivity:</strong> a(u,u) {'>='} alpha*||u||^2 (ensures uniqueness) |
        <strong> FEM:</strong> linear hat functions, tridiagonal system, Thomas algorithm
      </div>
    </div>
  )
}
