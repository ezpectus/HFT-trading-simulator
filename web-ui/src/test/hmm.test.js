// @vitest-environment node
/**
 * Tests for Hidden Markov Model (Baum-Welch, Viterbi, Forward).
 * Exercises the production implementation in src/utils/hmmMath.js
 * (imported by HiddenMarkovModel.jsx).
 */
import { describe, it, expect } from 'vitest'
import { forward, backward, viterbi, baumWelchStep, baumWelch, quantize } from '../utils/hmmMath'

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

describe('Backward Algorithm', () => {
  it('returns a T×N beta matrix', () => {
    const obs = [0, 1, 0]
    const A = [[0.7, 0.3], [0.4, 0.6]]
    const B = [[0.9, 0.1], [0.2, 0.8]]
    const pi = [0.5, 0.5]
    const { scales } = forward(obs, A, B, pi)
    const beta = backward(obs, A, B, scales)
    expect(beta.length).toBe(3)
    expect(beta[0].length).toBe(2)
    beta.flat().forEach(v => expect(v).toBeGreaterThan(0))
  })
})

describe('Viterbi Decoding', () => {
  it('returns a valid state path', () => {
    const obs = [0, 1, 0, 1, 0]
    const A = [[0.7, 0.3], [0.4, 0.6]]
    const B = [[0.9, 0.1], [0.2, 0.8]]
    const pi = [0.6, 0.4]
    const { states, logProb } = viterbi(obs, A, B, pi)
    expect(states.length).toBe(obs.length)
    states.forEach(s => expect(s).toBeGreaterThanOrEqual(0))
    states.forEach(s => expect(s).toBeLessThan(2))
    expect(logProb).toBeTypeOf('number')
  })

  it('prefers state 0 for observation 0 with high B[0][0]', () => {
    const obs = [0, 0, 0]
    const A = [[0.9, 0.1], [0.1, 0.9]]
    const B = [[0.95, 0.05], [0.05, 0.95]]
    const pi = [0.5, 0.5]
    const { states } = viterbi(obs, A, B, pi)
    expect(states.every(s => s === 0)).toBe(true)
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

  it('full baumWelch returns normalized trained parameters', () => {
    const obs = [0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1]
    const { A, B, pi, logLik } = baumWelch(obs, 2, 2, 10)
    expect(A.length).toBe(2)
    expect(B.length).toBe(2)
    expect(pi.length).toBe(2)
    expect(Number.isFinite(logLik)).toBe(true)
    A.forEach(row => expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5))
    B.forEach(row => expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5))
    expect(pi.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
  })
})

describe('Quantize', () => {
  it('maps returns to M discrete observation indices', () => {
    const returns = Array.from({ length: 100 }, (_, i) => (i - 50) * 0.01)
    const obs = quantize(returns, 5)
    expect(obs.length).toBe(100)
    obs.forEach(o => {
      expect(o).toBeGreaterThanOrEqual(0)
      expect(o).toBeLessThan(5)
    })
  })
})
