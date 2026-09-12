import { describe, it, expect } from 'vitest'
import {
  empiricalCDF, normInv, normCDF, kendallTau, spearmanRho,
  claytonCDF, gumbelCDF, gaussianCopulaCDF, fitCopula, erf, tCDF,
} from '../utils/copulaMath'

describe('normCDF/normInv round-trip', () => {
  it('normCDF(0) = 0.5', () => {
    expect(normCDF(0)).toBeCloseTo(0.5, 6)
  })
  it('normInv inverts normCDF', () => {
    for (const p of [0.1, 0.25, 0.5, 0.9]) {
      expect(normCDF(normInv(p))).toBeCloseTo(p, 4)
    }
  })
  it('normInv(0.975) ≈ 1.96', () => {
    expect(normInv(0.975)).toBeCloseTo(1.96, 2)
  })
})

describe('empiricalCDF', () => {
  it('maps values to (0,1) ranks', () => {
    const u = empiricalCDF([10, 20, 30, 40])
    expect(u.every(v => v > 0 && v < 1)).toBe(true)
    // strictly increasing input → increasing ranks
    expect(u[0] < u[1] && u[1] < u[2] && u[2] < u[3]).toBe(true)
  })
  it('rank order preserved under permutation', () => {
    const u = empiricalCDF([40, 10, 30, 20])
    expect(u[1] < u[3] && u[3] < u[2] && u[2] < u[0]).toBe(true)
  })
})

describe('kendallTau / spearmanRho', () => {
  it('perfect monotone → +1', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(kendallTau(x, x)).toBeCloseTo(1, 6)
    expect(spearmanRho(x, x)).toBeCloseTo(1, 6)
  })
  it('perfectly reversed → -1', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8]
    const y = [8, 7, 6, 5, 4, 3, 2, 1]
    expect(kendallTau(x, y)).toBeCloseTo(-1, 6)
    expect(spearmanRho(x, y)).toBeCloseTo(-1, 6)
  })
  it('independent-ish data → |tau| < 1', () => {
    const x = [1, 3, 2, 5, 4, 7, 6, 8]
    const y = [2, 1, 5, 3, 8, 4, 7, 6]
    expect(Math.abs(kendallTau(x, y))).toBeLessThan(1)
  })
})

describe('copula CDFs', () => {
  it('boundary: C(0,v)=C(u,0)=0, C(1,v)=v, C(u,1)=u', () => {
    for (const [cdf, p] of [[claytonCDF, 1.5], [gumbelCDF, 1.5]]) {
      expect(cdf(0, 0.7, p)).toBeCloseTo(0, 6)
      expect(cdf(0.6, 0, p)).toBeCloseTo(0, 6)
      expect(cdf(1, 0.7, p)).toBeCloseTo(0.7, 5)
      expect(cdf(0.6, 1, p)).toBeCloseTo(0.6, 5)
    }
  })
  it('clayton lower-tail dependence beats gumbel', () => {
    // λ_L: Clayton has it (2^(-1/θ)), Gumbel is 0
    const q = 0.05
    const lamC = claytonCDF(q, q, 2) / q
    const lamG = gumbelCDF(q, q, 2) / q
    expect(lamC).toBeGreaterThan(lamG)
    expect(lamC).toBeCloseTo(Math.pow(2, -0.5), 1)
  })
  it('gaussian copula symmetric in u,v', () => {
    expect(gaussianCopulaCDF(0.3, 0.7, 0.4))
      .toBeCloseTo(gaussianCopulaCDF(0.7, 0.3, 0.4), 8)
  })
  it('independence: rho→0 gives C≈u*v', () => {
    // numeric bivariate normal is approximate at rho→0 — allow ~0.01
    expect(Math.abs(gaussianCopulaCDF(0.4, 0.6, 1e-6) - 0.24)).toBeLessThan(0.01)
  })
})

describe('fitCopula', () => {
  it('positive tau → positive theta/rho', () => {
    const fits = fitCopula(0.5)
    expect(fits.clayton.theta).toBeCloseTo(2, 3)   // τ = θ/(θ+2) → θ=2
    expect(fits.gumbel.theta).toBeCloseTo(2, 3)    // τ = (θ-1)/θ → θ=2
    expect(fits.gaussian.rho).toBeCloseTo(Math.sin(Math.PI * 0.25), 3)
  })
  it('zero tau → params near independence', () => {
    const fits = fitCopula(0)
    expect(fits.gumbel.theta).toBeCloseTo(1, 1)  // impl clamps θ ≥ 1.01
    expect(Math.abs(fits.gaussian.rho)).toBeLessThan(0.01)
  })
})

describe('special functions', () => {
  it('erf(0)=0, erf(±∞)→±1', () => {
    expect(erf(0)).toBeCloseTo(0, 8)
    expect(erf(3)).toBeCloseTo(0.99998, 4)
    expect(erf(-3)).toBeCloseTo(-0.99998, 4)
  })
  it('tCDF: textbook critical values (df=5)', () => {
    expect(tCDF(2.015, 5)).toBeCloseTo(0.95, 3)   // t₀.₉₅,₅ = 2.015
    expect(tCDF(0, 5)).toBe(0.5)
    expect(tCDF(-1.96, 5)).toBeCloseTo(1 - tCDF(1.96, 5), 8)  // symmetry
  })
  it('tCDF(df→∞) ≈ normCDF', () => {
    expect(tCDF(1.0, 200)).toBeCloseTo(normCDF(1.0), 2)
  })
})
