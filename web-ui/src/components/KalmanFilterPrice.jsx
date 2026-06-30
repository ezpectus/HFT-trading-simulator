import { useMemo, useState } from 'react'
import { Crosshair, Activity, Filter } from 'lucide-react'
import { formatPrice } from '../utils/format'

// 1D Kalman Filter — state = price, observation = price + noise
// Predict:  x̂⁻ = x̂,  P⁻ = P + Q
// Update:   K = P⁻ / (P⁻ + R),  x̂ = x̂⁻ + K·(z - x̂⁻),  P = (1 - K)·P⁻
// Q = process noise (model uncertainty), R = measurement noise (sensor uncertainty)
// K → 0: trust model, K → 1: trust measurement
// Posterior variance: P = (1-K)·P⁻ (always decreases after update)
class KalmanFilter1D {
  constructor({ processNoise = 1e-5, measurementNoise = 1e-3, initialEstimate = 0, initialVariance = 1 } = {}) {
    this.x = initialEstimate
    this.p = initialVariance
    this.q = processNoise
    this.r = measurementNoise
    this.k = 0
    this.gainHistory = []
    this.estimateHistory = []
    this.varianceHistory = []
  }

  update(measurement) {
    this.p = this.p + this.q
    this.k = this.p / (this.p + this.r)
    this.x = this.x + this.k * (measurement - this.x)
    this.p = (1 - this.k) * this.p

    this.gainHistory.push(this.k)
    this.estimateHistory.push(this.x)
    this.varianceHistory.push(this.p)

    if (this.gainHistory.length > 200) {
      this.gainHistory.shift()
      this.estimateHistory.shift()
      this.varianceHistory.shift()
    }

    return this.x
  }
}

// 2D Kalman Filter — state = [position, velocity], constant velocity model
// State transition: F = [[1, dt], [0, 1]]  (x_{t+1} = x_t + v_t·dt)
// Observation: H = [[1, 0]]  (observe position only)
// Predict:  x̂⁻ = F·x̂,  P⁻ = F·P·Fᵀ + Q
// Update:   S = H·P⁻·Hᵀ + R,  K = P⁻·Hᵀ·S⁻¹
//           x̂ = x̂⁻ + K·(z - H·x̂⁻),  P = (I - K·H)·P⁻
class KalmanFilter2D {
  constructor({ processNoise = 1e-5, measurementNoise = 1e-3, dt = 1 } = {}) {
    this.x = [0, 0]
    this.P = [[1, 0], [0, 1]]
    this.Q = [[processNoise * dt, 0], [0, processNoise * dt]]
    this.R = [[measurementNoise, 0], [0, measurementNoise]]
    this.F = [[1, dt], [0, 1]]
    this.H = [[1, 0]]
    this.estimateHistory = []
    this.velocityHistory = []
  }

  update(measurement) {
    this.x = [
      this.F[0][0] * this.x[0] + this.F[0][1] * this.x[1],
      this.F[1][0] * this.x[0] + this.F[1][1] * this.x[1],
    ]

    this.P = [
      [
        this.F[0][0] * this.P[0][0] + this.F[0][1] * this.P[1][0] + this.Q[0][0],
        this.F[0][0] * this.P[0][1] + this.F[0][1] * this.P[1][1] + this.Q[0][1],
      ],
      [
        this.F[1][0] * this.P[0][0] + this.F[1][1] * this.P[1][0] + this.Q[1][0],
        this.F[1][0] * this.P[0][1] + this.F[1][1] * this.P[1][1] + this.Q[1][1],
      ],
    ]

    const S = this.H[0][0] * this.P[0][0] * this.H[0][0] + this.R[0][0]
    const K = [this.P[0][0] * this.H[0][0] / S, this.P[1][0] * this.H[0][0] / S]

    const y = measurement - (this.H[0][0] * this.x[0])

    this.x = [this.x[0] + K[0] * y, this.x[1] + K[1] * y]

    this.P = [
      [(1 - K[0] * this.H[0][0]) * this.P[0][0], (1 - K[0] * this.H[0][0]) * this.P[0][1]],
      [(1 - K[1] * this.H[0][0]) * this.P[1][0], (1 - K[1] * this.H[0][0]) * this.P[1][1]],
    ]

    this.estimateHistory.push(this.x[0])
    this.velocityHistory.push(this.x[1])

    if (this.estimateHistory.length > 200) {
      this.estimateHistory.shift()
      this.velocityHistory.shift()
    }

    return { estimate: this.x[0], velocity: this.x[1] }
  }
}

export default function KalmanFilterPrice({ candles, symbol, exchange }) {
  const [modelType, setModelType] = useState('1d')
  const [processNoise, setProcessNoise] = useState(0.0001)
  const [measurementNoise, setMeasurementNoise] = useState(0.01)

  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-80)
    if (symCandles.length < 20) return null

    const closes = symCandles.map(c => c.close)
    const timestamps = symCandles.map(c => c.timestamp || 0)

    let estimates, velocities, gains, variances, residuals

    if (modelType === '1d') {
      const kf = new KalmanFilter1D({
        processNoise,
        measurementNoise,
        initialEstimate: closes[0],
        initialVariance: 1,
      })
      estimates = []
      gains = []
      variances = []
      residuals = []

      for (const price of closes) {
        const est = kf.update(price)
        estimates.push(est)
        gains.push(kf.k)
        variances.push(kf.p)
        residuals.push(price - est)
      }
      velocities = null
    } else {
      const kf2d = new KalmanFilter2D({
        processNoise,
        measurementNoise,
        dt: 1,
      })
      kf2d.x = [closes[0], 0]
      estimates = []
      velocities = []
      residuals = []

      for (const price of closes) {
        const { estimate, velocity } = kf2d.update(price)
        estimates.push(estimate)
        velocities.push(velocity)
        residuals.push(price - estimate)
      }
      gains = null
      variances = null
    }

    const n = closes.length
    const rawPrices = closes
    const filteredPrices = estimates

    const allPrices = [...rawPrices, ...filteredPrices].filter(p => p > 0)
    const minP = Math.min(...allPrices) * 0.998
    const maxP = Math.max(...allPrices) * 1.002
    const pRange = maxP - minP || 1

    const maxResidual = Math.max(...residuals.map(Math.abs)) || 1

    const lastPrice = closes[n - 1]
    const lastEstimate = estimates[estimates.length - 1]
    const lastResidual = residuals[residuals.length - 1]
    const smoothingEffect = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / n)

    let trend = 'FLAT'
    if (modelType === '2d' && velocities) {
      const lastVel = velocities[velocities.length - 1]
      if (lastVel > 0.5) trend = 'UP'
      else if (lastVel < -0.5) trend = 'DOWN'
    } else {
      const recentEst = estimates.slice(-5)
      if (recentEst.length >= 2) {
        const diff = recentEst[recentEst.length - 1] - recentEst[0]
        if (diff > pRange * 0.01) trend = 'UP'
        else if (diff < -pRange * 0.01) trend = 'DOWN'
      }
    }

    return {
      rawPrices, filteredPrices, residuals, velocities, gains, variances,
      minP, maxP, pRange, maxResidual,
      lastPrice, lastEstimate, lastResidual, smoothingEffect, trend,
      n,
    }
  }, [candles, symbol, exchange, modelType, processNoise, measurementNoise])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Crosshair size={12} className="text-accent-cyan" />
          Kalman Filter Price
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 20+ candles</div>
      </div>
    )
  }

  const { rawPrices, filteredPrices, residuals, velocities, gains, minP, maxP, pRange, maxResidual, lastPrice, lastEstimate, lastResidual, smoothingEffect, trend, n } = data

  const toX = (i) => (i / Math.max(n - 1, 1)) * 100
  const toY = (v) => 100 - ((v - minP) / pRange) * 85 - 7.5
  const toResY = (v) => 50 - (v / maxResidual) * 40

  const rawPath = rawPrices.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p).toFixed(1)}`).join(' ')
  const filteredPath = filteredPrices.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p).toFixed(1)}`).join(' ')

  const trendColor = trend === 'UP' ? 'text-accent-green' : trend === 'DOWN' ? 'text-accent-red' : 'text-gray-400'

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Crosshair size={12} className="text-accent-cyan" />
        Kalman Filter Price Estimator
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={() => setModelType('1d')}
          className={'text-[8px] px-2 py-0.5 rounded ' + (modelType === '1d' ? 'bg-accent-cyan/20 text-accent-cyan' : 'bg-bg-600 text-gray-500')}
        >1D (price only)</button>
        <button
          onClick={() => setModelType('2d')}
          className={'text-[8px] px-2 py-0.5 rounded ' + (modelType === '2d' ? 'bg-accent-cyan/20 text-accent-cyan' : 'bg-bg-600 text-gray-500')}
        >2D (price + velocity)</button>
      </div>

      <div className="flex items-center gap-2 mb-2 text-[7px]">
        <label className="flex items-center gap-1">
          <Filter size={7} className="text-gray-600" />
          <span className="text-gray-600">Q:</span>
          <input
            type="range" min={0.00001} max={0.001} step={0.00001}
            value={processNoise}
            onChange={(e) => setProcessNoise(parseFloat(e.target.value))}
            className="w-12 h-1"
          />
          <span className="font-mono text-gray-400">{processNoise.toFixed(5)}</span>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-gray-600">R:</span>
          <input
            type="range" min={0.001} max={0.1} step={0.001}
            value={measurementNoise}
            onChange={(e) => setMeasurementNoise(parseFloat(e.target.value))}
            className="w-12 h-1"
          />
          <span className="font-mono text-gray-400">{measurementNoise.toFixed(3)}</span>
        </label>
      </div>

      {/* Estimates */}
      <div className="grid grid-cols-3 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Raw Price</span>
          <div className="font-mono text-gray-300">${formatPrice(lastPrice)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">KF Estimate</span>
          <div className="font-mono text-accent-cyan">${formatPrice(lastEstimate)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Trend</span>
          <div className={'font-mono font-bold ' + trendColor}>{trend}</div>
        </div>
      </div>

      {/* Price + estimate chart */}
      <div className="pt-1.5 border-t border-bg-600 mb-2">
        <div className="text-[8px] text-gray-600 mb-0.5 flex items-center gap-0.5"><Activity size={7} /> Price vs Kalman Estimate:</div>
        <svg viewBox="0 0 100 100" className="w-full h-[80px]">
          <path d={rawPath} fill="none" stroke="#475569" strokeWidth={0.6} opacity={0.5} />
          <path d={filteredPath} fill="none" stroke="#06b6d4" strokeWidth={1.2} />
        </svg>
        <div className="flex justify-between text-[7px] mt-0.5">
          <span className="text-gray-500">━ Raw</span>
          <span className="text-accent-cyan">━ Kalman</span>
        </div>
      </div>

      {/* Residuals */}
      <div className="mb-2">
        <div className="text-[8px] text-gray-600 mb-0.5">Residuals (measurement - estimate):</div>
        <svg viewBox="0 0 100 50" className="w-full h-[40px]">
          <line x1={0} y1={25} x2={100} y2={25} stroke="#334155" strokeWidth={0.3} />
          {residuals.map((r, i) => {
            const x = toX(i)
            const y = toResY(r)
            const barH = Math.abs(25 - y)
            return <rect key={i} x={x - 0.5} y={Math.min(25, y)} width={1} height={barH} fill={r >= 0 ? '#3b82f6' : '#ef4444'} opacity={0.6} />
          })}
        </svg>
      </div>

      {/* Velocity (2D model) */}
      {velocities && (
        <div className="mb-2">
          <div className="text-[8px] text-gray-600 mb-0.5">Estimated Velocity (trend rate):</div>
          <svg viewBox="0 0 100 40" className="w-full h-[40px]">
            <line x1={0} y1={20} x2={100} y2={20} stroke="#334155" strokeWidth={0.3} />
            {(() => {
              const maxV = Math.max(...velocities.map(Math.abs)) || 1
              const toVY = (v) => 20 - (v / maxV) * 15
              const path = velocities.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toVY(v).toFixed(1)}`).join(' ')
              return <path d={path} fill="none" stroke="#f97316" strokeWidth={0.8} />
            })()}
          </svg>
        </div>
      )}

      {/* Kalman gain (1D model) */}
      {gains && (
        <div className="mb-2">
          <div className="text-[8px] text-gray-600 mb-0.5">Kalman Gain (adaptive weight):</div>
          <svg viewBox="0 0 100 30" className="w-full h-[30px]">
            {(() => {
              const maxG = Math.max(...gains) || 1
              const toGY = (v) => 28 - (v / maxG) * 25
              const path = gains.map((g, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toGY(g).toFixed(1)}`).join(' ')
              return <path d={path} fill="none" stroke="#a855f7" strokeWidth={0.8} />
            })()}
          </svg>
        </div>
      )}

      <div className="pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        {modelType === '1d' ? '1D Kalman: state=price, observe=price with noise. ' : '2D Kalman: state=[price, velocity], F=constant velocity model. '}
        RMSE: ${smoothingEffect.toFixed(4)}. Residual: ${lastResidual.toFixed(4)}.
      </div>
    </div>
  )
}
