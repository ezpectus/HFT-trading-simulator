// Hidden Markov Model: forward/backward with scaling, Viterbi, Baum-Welch EM.
// Extracted from HiddenMarkovModel.jsx — shared by the component and its tests.
//
// Mathematical foundation:
//   λ = (A, B, π) where:
//   A = transition matrix [N×N], a_ij = P(q_{t+1}=j | q_t=i)
//   B = emission matrix [N×M], b_j(k) = P(o_t=k | q_t=j)
//   π = initial distribution [N]
//
//   Forward: α_t(j) = [Σ_i α_{t-1}(i)·a_ij]·b_j(o_t)
//   Backward: β_t(i) = Σ_j a_ij·b_j(o_{t+1})·β_{t+1}(j)
//   γ_t(i) = α_t(i)·β_t(i) / P(O|λ)
//   ξ_t(i,j) = α_t(i)·a_ij·b_j(o_{t+1})·β_{t+1}(j) / P(O|λ)
//
//   Baum-Welch re-estimation:
//   π_i = γ_1(i)
//   a_ij = Σ_t ξ_t(i,j) / Σ_t γ_t(i)
//   b_j(k) = Σ_{t: o_t=k} γ_t(j) / Σ_t γ_t(j)
//
//   Viterbi: δ_t(j) = max_i [δ_{t-1}(i)·a_ij]·b_j(o_t)

export const forward = (obs, A, B, pi) => {
  const N = A.length, T = obs.length
  const alpha = Array.from({ length: T }, () => new Array(N).fill(0))
  const scales = new Array(T).fill(0)

  // Initialize
  for (let i = 0; i < N; i++) {
    alpha[0][i] = pi[i] * B[i][obs[0]]
  }
  let sum = alpha[0].reduce((a, b) => a + b, 0)
  scales[0] = sum > 0 ? sum : 1e-10
  for (let i = 0; i < N; i++) alpha[0][i] /= scales[0]

  // Induction
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

  // Log likelihood
  const logLik = scales.reduce((s, c) => s + Math.log(c), 0)
  return { alpha, scales, logLik }
}

export const backward = (obs, A, B, scales) => {
  const N = A.length, T = obs.length
  const beta = Array.from({ length: T }, () => new Array(N).fill(0))

  // Initialize
  for (let i = 0; i < N; i++) beta[T - 1][i] = 1 / scales[T - 1]

  // Induction
  for (let t = T - 2; t >= 0; t--) {
    for (let i = 0; i < N; i++) {
      let s = 0
      for (let j = 0; j < N; j++) s += A[i][j] * B[j][obs[t + 1]] * beta[t + 1][j]
      beta[t][i] = s / scales[t]
    }
  }

  return beta
}

export const viterbi = (obs, A, B, pi) => {
  const N = A.length, T = obs.length
  const delta = Array.from({ length: T }, () => new Array(N).fill(0))
  const psi = Array.from({ length: T }, () => new Array(N).fill(0))

  // Initialize (log space)
  for (let i = 0; i < N; i++) {
    delta[0][i] = Math.log(Math.max(1e-10, pi[i] * B[i][obs[0]]))
  }

  // Recursion
  for (let t = 1; t < T; t++) {
    for (let j = 0; j < N; j++) {
      let bestVal = -Infinity, bestState = 0
      for (let i = 0; i < N; i++) {
        const val = delta[t - 1][i] + Math.log(Math.max(1e-10, A[i][j]))
        if (val > bestVal) { bestVal = val; bestState = i }
      }
      delta[t][j] = bestVal + Math.log(Math.max(1e-10, B[j][obs[t]]))
      psi[t][j] = bestState
    }
  }

  // Backtrack
  const states = new Array(T).fill(0)
  let bestLast = 0
  let bestVal = -Infinity
  for (let i = 0; i < N; i++) {
    if (delta[T - 1][i] > bestVal) { bestVal = delta[T - 1][i]; bestLast = i }
  }
  states[T - 1] = bestLast
  for (let t = T - 2; t >= 0; t--) {
    states[t] = psi[t + 1][states[t + 1]]
  }

  return { states, logProb: bestVal }
}

// One EM iteration: E-step (gamma/xi from forward-backward) + M-step re-estimation.
// Exported so both the baumWelch loop and tests exercise the same code.
export const baumWelchStep = (obs, A, B, pi) => {
  const N = A.length, M = B[0].length, T = obs.length
  const { alpha, scales, logLik } = forward(obs, A, B, pi)
  const beta = backward(obs, A, B, scales)

  // γ_t(i) = α_t(i)·β_t(i)
  const gamma = Array.from({ length: T }, () => new Array(N).fill(0))
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < N; i++) {
      gamma[t][i] = alpha[t][i] * beta[t][i]
    }
    const sum = gamma[t].reduce((a, b) => a + b, 0)
    if (sum > 0) for (let i = 0; i < N; i++) gamma[t][i] /= sum
  }

  // ξ_t(i,j)
  const xi = Array.from({ length: T - 1 }, () => Array.from({ length: N }, () => new Array(N).fill(0)))
  for (let t = 0; t < T - 1; t++) {
    let denom = 0
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        xi[t][i][j] = alpha[t][i] * A[i][j] * B[j][obs[t + 1]] * beta[t + 1][j]
        denom += xi[t][i][j]
      }
    }
    if (denom > 0) {
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) xi[t][i][j] /= denom
    }
  }

  // Re-estimate π
  const newPi = gamma[0].slice()

  // Re-estimate A
  const newA = Array.from({ length: N }, () => new Array(N).fill(0))
  for (let i = 0; i < N; i++) {
    let denomA = 0
    for (let t = 0; t < T - 1; t++) denomA += gamma[t][i]
    for (let j = 0; j < N; j++) {
      let numA = 0
      for (let t = 0; t < T - 1; t++) numA += xi[t][i][j]
      newA[i][j] = denomA > 0 ? numA / denomA : 1 / N
    }
  }

  // Re-estimate B
  const newB = Array.from({ length: N }, () => new Array(M).fill(0))
  for (let j = 0; j < N; j++) {
    let denomB = 0
    for (let t = 0; t < T; t++) denomB += gamma[t][j]
    for (let k = 0; k < M; k++) {
      let numB = 0
      for (let t = 0; t < T; t++) if (obs[t] === k) numB += gamma[t][j]
      newB[j][k] = denomB > 0 ? numB / denomB : 1 / M
    }
  }

  return { A: newA, B: newB, pi: newPi, logLik, gamma }
}

export const baumWelch = (obs, N, M, maxIter = 50) => {
  // Initialize parameters
  let pi = new Array(N).fill(1 / N)
  let A = Array.from({ length: N }, () => new Array(N).fill(1 / N))
  let B = Array.from({ length: N }, () => new Array(M).fill(1 / M))

  // Add slight randomization to break symmetry
  for (let i = 0; i < N; i++) {
    pi[i] = 0.3 + Math.random() * 0.4
    for (let j = 0; j < N; j++) A[i][j] = 0.3 + Math.random() * 0.4
    for (let k = 0; k < M; k++) B[i][k] = 0.3 + Math.random() * 0.4
  }
  // Normalize
  const normRow = (row) => {
    const s = row.reduce((a, b) => a + b, 0)
    return row.map(v => v / s)
  }
  pi = normRow(pi)
  A = A.map(normRow)
  B = B.map(normRow)

  let prevLogLik = -Infinity

  for (let iter = 0; iter < maxIter; iter++) {
    const step = baumWelchStep(obs, A, B, pi)

    if (Math.abs(step.logLik - prevLogLik) < 1e-6) break
    prevLogLik = step.logLik

    pi = step.pi
    A = step.A
    B = step.B
  }

  return { A, B, pi, logLik: prevLogLik }
}

// Quantize returns into discrete observations
export const quantize = (returns, M = 5) => {
  const sorted = [...returns].sort((a, b) => a - b)
  const quantiles = []
  for (let i = 1; i < M; i++) quantiles.push(sorted[Math.floor(i * sorted.length / M)])
  return returns.map(r => {
    let idx = 0
    for (let i = 0; i < quantiles.length; i++) {
      if (r > quantiles[i]) idx = i + 1
    }
    return idx
  })
}
