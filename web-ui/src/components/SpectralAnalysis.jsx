import { useMemo } from 'react'
import { Radio, Activity, Waves } from 'lucide-react'
import { formatPrice } from '../utils/format'

// Discrete Fourier Transform (DFT):
// X_k = Σ_{t=0}^{N-1} x_t · e^{-2πi·k·t/N} = Σ x_t·[cos(2πkt/N) - i·sin(2πkt/N)]
// Magnitude: |X_k| = sqrt(Re² + Im²),  only first N/2 bins (Nyquist)
// O(N²) — used for small segments in Welch's method
function dft(signal) {
  const n = signal.length
  if (n < 8) return []

  const real = new Array(n).fill(0)
  const imag = new Array(n).fill(0)

  for (let k = 0; k < Math.floor(n / 2); k++) {
    for (let t = 0; t < n; t++) {
      const angle = -2 * Math.PI * k * t / n
      real[k] += signal[t] * Math.cos(angle)
      imag[k] += signal[t] * Math.sin(angle)
    }
  }

  const magnitudes = []
  for (let k = 0; k < Math.floor(n / 2); k++) {
    magnitudes.push(Math.sqrt(real[k] * real[k] + imag[k] * imag[k]))
  }

  return magnitudes
}

// Welch's PSD estimation:
// 1. Split signal into overlapping segments (50% overlap)
// 2. Apply Hann window: w(n) = 0.5 - 0.5·cos(2πn/(N-1))
// 3. Compute |DFT(windowed_segment)|² for each segment
// 4. Average across segments: PSD = (1/K) Σ |DFT_k|²
// Reduces variance vs single DFT, trades frequency resolution for smoothness
function welchPSD(signal, segmentSize = 16, overlap = 0.5) {
  const n = signal.length
  if (n < segmentSize * 2) return dft(signal)

  const step = Math.floor(segmentSize * (1 - overlap))
  const numSegments = Math.floor((n - segmentSize) / step) + 1

  if (numSegments < 1) return dft(signal)

  const psd = new Array(Math.floor(segmentSize / 2)).fill(0)
  let validSegs = 0

  for (let s = 0; s < numSegments; s++) {
    const start = s * step
    const segment = signal.slice(start, start + segmentSize)
    if (segment.length < segmentSize) continue

    const mean = segment.reduce((a, b) => a + b, 0) / segment.length
    const centered = segment.map(v => v - mean)

    const window = centered.map((v, i) => v * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (segmentSize - 1))))

    const mags = dft(window)
    for (let k = 0; k < Math.min(psd.length, mags.length); k++) {
      psd[k] += mags[k] * mags[k]
    }
    validSegs++
  }

  if (validSegs > 0) {
    for (let k = 0; k < psd.length; k++) {
      psd[k] /= validSegs
    }
  }

  return psd.map(v => Math.sqrt(v))
}

// Dominant cycle detection via local maxima (peaks) in PSD:
// A peak at bin k → period = N / k (samples per cycle)
// Relative power = |X_k| / Σ |X_j|  (concentration of energy)
function detectDominantCycles(magnitudes, sampleRate = 1) {
  if (magnitudes.length < 3) return []

  const peaks = []
  for (let i = 1; i < magnitudes.length - 1; i++) {
    if (magnitudes[i] > magnitudes[i - 1] && magnitudes[i] > magnitudes[i + 1]) {
      const period = magnitudes.length / i
      const power = magnitudes[i]
      const relativePower = power / (magnitudes.reduce((s, v) => s + v, 0) || 1)
      peaks.push({ freq: i, period, power, relativePower })
    }
  }

  return peaks.sort((a, b) => b.power - a.power).slice(0, 5)
}

// Spectral entropy (normalized Shannon entropy of PSD):
// H = -Σ p_k · log2(p_k) / log2(N),  where p_k = |X_k|² / Σ |X_j|²
// H → 1: flat spectrum (white noise, unpredictable)
// H → 0: concentrated spectrum (single dominant cycle, predictable)
function calcSpectralEntropy(magnitudes) {
  if (magnitudes.length === 0) return 0
  const total = magnitudes.reduce((s, v) => s + v, 0)
  if (total === 0) return 0

  const probs = magnitudes.map(v => v / total)
  let entropy = 0
  for (const p of probs) {
    if (p > 0) {
      entropy -= p * Math.log2(p)
    }
  }

  const maxEntropy = Math.log2(magnitudes.length)
  return maxEntropy > 0 ? entropy / maxEntropy : 0
}

export default function SpectralAnalysis({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-128)
    if (symCandles.length < 32) return null

    const closes = symCandles.map(c => c.close)
    const returns = []
    for (let i = 1; i < closes.length; i++) {
      if (closes[i - 1] > 0 && closes[i] > 0) {
        returns.push(Math.log(closes[i] / closes[i - 1]))
      }
    }

    if (returns.length < 16) return null

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const centered = returns.map(v => v - mean)

    const segSize = Math.min(32, Math.floor(centered.length / 2))
    const psd = welchPSD(centered, segSize, 0.5)

    const cycles = detectDominantCycles(psd)
    const spectralEntropy = calcSpectralEntropy(psd)

    const totalPower = psd.reduce((s, v) => s + v * v, 0) || 1
    const topCyclePower = cycles.length > 0 ? cycles[0].power * cycles[0].power : 0
    const concentration = topCyclePower / totalPower

    const maxMag = Math.max(...psd) || 1

    const lowFreqPower = psd.slice(0, Math.floor(psd.length / 3)).reduce((s, v) => s + v * v, 0)
    const highFreqPower = psd.slice(Math.floor(psd.length * 2 / 3)).reduce((s, v) => s + v * v, 0)
    const colorRatio = highFreqPower > 0 ? lowFreqPower / highFreqPower : Infinity

    let noiseLevel = 'WHITE'
    if (colorRatio > 3) noiseLevel = 'PINK (1/f)'
    else if (colorRatio > 1.5) noiseLevel = 'BROWNISH'
    else if (colorRatio < 0.5) noiseLevel = 'BLUE'

    return {
      psd, cycles, spectralEntropy, concentration,
      maxMag, colorRatio, noiseLevel,
      returns: centered,
      lastPrice: closes[closes.length - 1],
      n: returns.length,
    }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Radio size={12} className="text-accent-pink" />
          Spectral Analysis
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 32+ candles</div>
      </div>
    )
  }

  const { psd, cycles, spectralEntropy, concentration, maxMag, colorRatio, noiseLevel, n } = data

  const toX = (i) => (i / Math.max(psd.length - 1, 1)) * 100
  const toY = (v) => 90 - (v / maxMag) * 80

  const psdPath = psd.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ')

  const entropyColor = spectralEntropy > 0.8 ? 'text-accent-red' :
                       spectralEntropy > 0.5 ? 'text-accent-yellow' : 'text-accent-green'

  const noiseColor = noiseLevel === 'PINK (1/f)' ? 'text-accent-pink' :
                     noiseLevel === 'BROWNISH' ? 'text-accent-orange' :
                     noiseLevel === 'BLUE' ? 'text-accent-blue' : 'text-gray-400'

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Radio size={12} className="text-accent-pink" />
        Spectral Analysis (Welch PSD)
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Spec. Entropy</span>
          <div className={'font-mono ' + entropyColor}>{spectralEntropy.toFixed(3)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Concentration</span>
          <div className="font-mono text-gray-400">{(concentration * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Noise Type</span>
          <div className={'font-mono ' + noiseColor}>{noiseLevel}</div>
        </div>
      </div>

      {/* PSD chart */}
      <div className="pt-1.5 border-t border-bg-600 mb-2">
        <div className="text-[8px] text-gray-600 mb-0.5 flex items-center gap-0.5"><Activity size={7} /> Power Spectral Density:</div>
        <svg viewBox="0 0 100 100" className="w-full h-[80px]">
          <line x1={0} y1={90} x2={100} y2={90} stroke="#334155" strokeWidth={0.3} />
          <path d={psdPath} fill="none" stroke="#ec4899" strokeWidth={1} />
          {psd.map((v, i) => (
            <rect key={i} x={toX(i) - 0.3} y={toY(v)} width={0.6} height={90 - toY(v)} fill="#ec4899" opacity={0.2} />
          ))}
          {cycles.slice(0, 3).map((c, i) => (
            <g key={i}>
              <line x1={toX(c.freq)} y1={0} x2={toX(c.freq)} y2={90} stroke="#fbbf24" strokeWidth={0.3} strokeDasharray="1,1" />
              <text x={toX(c.freq) + 1} y={5 + i * 4} fill="#fbbf24" fontSize={2.5} fontFamily="monospace">
                {c.period.toFixed(0)}p
              </text>
            </g>
          ))}
        </svg>
        <div className="flex justify-between text-[7px] text-gray-600">
          <span>Low freq (long cycles)</span>
          <span>High freq (short cycles)</span>
        </div>
      </div>

      {/* Dominant cycles */}
      <div className="mb-2">
        <div className="text-[8px] text-gray-600 mb-0.5 flex items-center gap-0.5"><Waves size={7} /> Dominant Cycles:</div>
        <div className="space-y-px">
          {cycles.length === 0 ? (
            <div className="text-[8px] text-gray-600 italic">No dominant cycles detected</div>
          ) : (
            cycles.map((c, i) => (
              <div key={i} className="flex items-center gap-1 text-[8px]">
                <span className="text-gray-500 w-4">#{i + 1}</span>
                <span className="font-mono text-accent-yellow w-12">~{c.period.toFixed(1)} bars</span>
                <div className="flex-1 h-1.5 bg-bg-600 rounded-full overflow-hidden">
                  <div className="h-full bg-accent-yellow/60 rounded-full" style={{ width: `${c.relativePower * 100}%` }} />
                </div>
                <span className="font-mono text-gray-500 w-10 text-right">{(c.relativePower * 100).toFixed(1)}%</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Color ratio */}
      <div className="flex items-center justify-between mb-1 text-[8px]">
        <span className="text-gray-600">Low/High freq ratio:</span>
        <span className="font-mono text-gray-400">{isFinite(colorRatio) ? colorRatio.toFixed(2) : '∞'}</span>
      </div>

      <div className="pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Welch's method: Hann window, 50% overlap, seg={Math.min(32, Math.floor(n / 2))}. {n} samples. Entropy: {spectralEntropy > 0.7 ? 'high (noisy/random)' : spectralEntropy > 0.4 ? 'moderate' : 'low (structured/cyclical)'}.
      </div>
    </div>
  )
}
