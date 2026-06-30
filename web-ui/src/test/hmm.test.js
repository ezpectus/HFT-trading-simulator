/**
 * Tests for Hidden Markov Model (Baum-Welch, Viterbi, Forward).
 * Tests the core algorithms extracted from HiddenMarkovModel.jsx.
 */
import { describe, it, expect } from 'vitest'

// Forward algorithm with scaling — extracted from HiddenMarkovModel.jsx
function forward(obs, A, B, pi) {
  const N = A.length, T = obs.length
  const alpha = Array.from({ length: T }, () => new Array(N).fill(0))
  const scales = new Array(T).fill(0)
  for (let i = 0; i < N; i++) alpha[0][i] = pi[i] * B[i][obs[0]]
  let sum = alpha[0].reduce((a, b) => a + b, 0)
  scales[0] = sum > 0 ? sum : 1e-10
  for (let i = 0; i < N; i++) alpha[0][i] /= scales[0]
  for (let t = 1; t < T; t++) {
    for (let j = 0; j < N; j++) {
      let s = 0
      for (let i = 0; i < N; i++) s += alpha[t - 1][i] * A[i][j]
      alpha[t][j] = s * B[j][obs[t]]
    }
    sum = alpha[t].reduce((a, b) => a + b, 0)
    scales[t] = sum > 0 ? sum : 1e-10
    for (let j = 0; j < N; j++) alpha[t][j] /= scales[t]
  }
  const logLik = scales.reduce((s, c) => s + Math.log(c), 0)
  return { alpha, scales, logLik }
}

// Backward algorithm with scaling
function backward(obs, A, B, scales) {
  const N = A.length, T = obs.length
  const beta = Array.from({ length: T }, () => new Array(N).fill(0))
  for (let i = 0; i < N; i++) beta[T - 1][i] = 1 / scales[T - 1]
  for (let t = T - 2; t >= 0; t--) {
    for (let i = 0; i < N; i++) {
      let s = 0
      for (let j = 0; j < N; j++) s += A[i][j] * B[j][obs[t + 1]] * beta[t + 1][j]
      beta[t][i] = s / scales[t]
    }
  }
  return beta
}

// Viterbi decoding
function viterbi(obs, A, B, pi) {
  const N = A.length, T = obs.length
  const delta = Array.from({ length: T }, () => new Array(N).fill(0))
  const psi = Array.from({ length: T }, () => new Array(N).fill(0))
  for (let i = 0; i < N; i++) delta[0][i] = Math.log(pi[i] + 1e-10) + Math.log(B[i][obs[0]] + 1e-10)
  for (let t = 1; t < T; t++) {
    for (let j = 0; j < N; j++) {
      let maxVal = -Infinity, maxIdx = 0
      for (let i = 0; i < N; i++) {
        const val = delta[t - 1][i] + Math.log(A[i][j] + 1e-10)
        if (val > maxVal) { maxVal = val; maxIdx = i }
      }
      delta[t][j] = maxVal + Math.log(B[j][obs[t]] + 1e-10)
      psi[t][j] = maxIdx
    }
  }
  // Backtrack
  const path = new Array(T)
  let maxVal = -Infinity, maxIdx = 0
  for (let i = 0; i < N; i++) {
    if (delta[T - 1][i] > maxVal) { maxVal = delta[T - 1][i]; maxIdx = i }
  }
  path[T - 1] = maxIdx
  for (let t = T - 2; t >= 0; t--) path[t] = psi[t + 1][path[t + 1]]
  return path
}

// Baum-Welch (one iteration)
function baumWelchStep(obs, A, B, pi) {
  const N = A.length, T = obs.length
  const { alpha, scales } = forward(obs, A, B, pi)
  const beta = backward(obs, A, B, scales)
  const M = B[0].length

  // gamma
  const gamma = Array.from({ length: T }, () => new Array(N).fill(0))
  for (let t = 0; t < T; t++) {
    let sum = 0
    for (let i = 0; i < N; i++) sum += alpha[t][i] * beta[t][i]
    for (let i = 0; i < N; i++) gamma[t][i] = sum > 0 ? alpha[t][i] * beta[t][i] / sum : 0
  }

  // xi
  const xi = Array.from({ length: T - 1 }, () => Array.from({ length: N }, () => new Array(N).fill(0)))
  for (let t = 0; t < T - 1; t++) {
    let sum = 0
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++)
        sum += alpha[t][i] * A[i][j] * B[j][obs[t + 1]] * beta[t + 1][j]
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++)
        xi[t][i][j] = sum > 0 ? alpha[t][i] * A[i][j] * B[j][obs[t + 1]] * beta[t + 1][j] / sum : 0
  }

  // Re-estimate
  const newPi = gamma[0].slice()
  const newA = A.map((row, i) => {
    const denom = gamma.slice(0, T - 1).reduce((s, g) => s + g[i], 0)
    return row.map((_, j) => {
      const num = xi.reduce((s, x) => s + x[i][j], 0)
      return denom > 0 ? num / denom : 1 / N
    })
  })
  const newB = B.map((row, j) => {
    const denom = gamma.reduce((s, g) => s + g[j], 0)
    return row.map((_, k) => {
      const num = gamma.reduce((s, g, t) => s + (obs[t] === k ? g[j] : 0), 0)
      return denom > 0 ? num / denom : 1 / M
    })
  })

  return { A: newA, B: newB, pi: newPi, gamma }
}

describe('Forward Algorithm', () => {
  it('computes scaled alpha and log-likelihood', () => {
    const obs = [0, 1, 0, 1, 0]
    const A = [[0.7, 0.3], [0.4, 0.6]]
    const B = [[0.9, 0.1], [0.2, 0.8]]
    const pi = [0.6, 0.4]
    const { alpha, logLik } = forward(obs, A, B, pi)
    expect(alpha.length).toBe(obs.length)
    expect(alpha[0].length).toBe(2)
    expect(logLik).toBeTypeOf('number')
    expect(logLik).toBeLessThan(0) // Log-likelihood is negative
  })

  it('scaling keeps alpha values normalized', () => {
    const obs = [0, 1, 0, 1, 0, 1, 0, 1]
    const A = [[0.6, 0.4], [0.3, 0.7]]
    const B = [[0.8, 0.2], [0.1, 0.9]]
    const pi = [0.5, 0.5]
    const { alpha } = forward(obs, A, B, pi)
    for (const row of alpha) {
      const sum = row.reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1, 5) // Scaled to sum=1
    }
  })
})

describe('Viterbi Decoding', () => {
  it('returns a valid state path', () => {
    const obs = [0, 1, 0, 1, 0]
    const A = [[0.7, 0.3], [0.4, 0.6]]
    const B = [[0.9, 0.1], [0.2, 0.8]]
    const pi = [0.6, 0.4]
    const path = viterbi(obs, A, B, pi)
    expect(path.length).toBe(obs.length)
    path.forEach(s => expect(s).toBeGreaterThanOrEqual(0))
    path.forEach(s => expect(s).toBeLessThan(2))
  })

  it('prefers state 0 for observation 0 with high B[0][0]', () => {
    const obs = [0, 0, 0]
    const A = [[0.9, 0.1], [0.1, 0.9]]
    const B = [[0.95, 0.05], [0.05, 0.95]]
    const pi = [0.5, 0.5]
    const path = viterbi(obs, A, B, pi)
    expect(path.every(s => s === 0)).toBe(true)
  })
})

describe('Baum-Welch', () => {
  it('improves log-likelihood after one step', () => {
    const obs = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]
    const A = [[0.6, 0.4], [0.3, 0.7]]
    const B = [[0.7, 0.3], [0.3, 0.7]]
    const pi = [0.5, 0.5]
    const { logLik: llBefore } = forward(obs, A, B, pi)
    const updated = baumWelchStep(obs, A, B, pi)
    const { logLik: llAfter } = forward(obs, updated.A, updated.B, updated.pi)
    expect(llAfter).toBeGreaterThanOrEqual(llBefore - 0.01) // Should not decrease significantly
  })

  it('converges over multiple iterations', () => {
    const obs = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]
    let A = [[0.5, 0.5], [0.5, 0.5]]
    let B = [[0.6, 0.4], [0.4, 0.6]]
    let pi = [0.5, 0.5]
    let prevLL = forward(obs, A, B, pi).logLik
    for (let iter = 0; iter < 10; iter++) {
      const updated = baumWelchStep(obs, A, B, pi)
      A = updated.A; B = updated.B; pi = updated.pi
      const ll = forward(obs, A, B, pi).logLik
      expect(ll).toBeGreaterThanOrEqual(prevLL - 0.01)
      prevLL = ll
    }
  })

  it('transition probabilities sum to 1 per row', () => {
    const obs = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1]
    const A = [[0.6, 0.4], [0.3, 0.7]]
    const B = [[0.7, 0.3], [0.3, 0.7]]
    const pi = [0.5, 0.5]
    const updated = baumWelchStep(obs, A, B, pi)
    for (const row of updated.A) {
      expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
    }
  })

  it('emission probabilities sum to 1 per row', () => {
    const obs = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1]
    const A = [[0.6, 0.4], [0.3, 0.7]]
    const B = [[0.7, 0.3], [0.3, 0.7]]
    const pi = [0.5, 0.5]
    const updated = baumWelchStep(obs, A, B, pi)
    for (const row of updated.B) {
      expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
    }
  })
})
