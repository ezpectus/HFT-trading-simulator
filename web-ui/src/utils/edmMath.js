// ─── EDM math — extracted from EmpiricalDynamicModeling.jsx ───────────
// Empirical Dynamic Modeling: mutual information, false nearest neighbors,
// delay embedding, simplex projection, convergent cross mapping.
// Pure functions — no React.
//
export const mutualInfo = (x, maxTau = 20) => {
  const n = x.length
  const mis = []
  for (let tau = 1; tau <= maxTau; tau++) {
    const x1 = x.slice(0, n - tau)
    const x2 = x.slice(tau)
    // Bin into 10 bins
    const nBins = 10
    const min = Math.min(...x), max = Math.max(...x)
    const binW = (max - min) / nBins
    if (binW === 0) { mis.push(0); continue }
    const bins1 = x1.map(v => Math.min(nBins - 1, Math.floor((v - min) / binW)))
    const bins2 = x2.map(v => Math.min(nBins - 1, Math.floor((v - min) / binW)))
    let mi = 0
    for (let i = 0; i < nBins; i++) {
      for (let j = 0; j < nBins; j++) {
        const pxy = bins1.filter((b, k) => b === i && bins2[k] === j).length / x1.length
        const px = bins1.filter(b => b === i).length / x1.length
        const py = bins2.filter(b => b === j).length / x2.length
        if (pxy > 0 && px > 0 && py > 0) {
          mi += pxy * Math.log(pxy / (px * py))
        }
      }
    }
    mis.push(mi)
  }
  // First minimum
  let optTau = 1
  for (let i = 1; i < mis.length - 1; i++) {
    if (mis[i] < mis[i - 1] && mis[i] < mis[i + 1]) { optTau = i + 1; break }
  }
  return { mis, optTau }
}

// False nearest neighbors for optimal embedding dimension
export const falseNearestNeighbors = (x, tau, maxE = 10) => {
  const n = x.length
  const fnnRatios = []
  for (let E = 1; E <= maxE; E++) {
    let falseCount = 0, totalPairs = 0
    const nEmbed = n - (E - 1) * tau
    for (let i = 0; i < nEmbed; i++) {
      // Find nearest neighbor in E-dim space
      let minDist = Infinity, nnIdx = -1
      for (let j = 0; j < nEmbed; j++) {
        if (j === i) continue
        let dist = 0
        for (let k = 0; k < E; k++) dist += (x[i + k * tau] - x[j + k * tau]) ** 2
        dist = Math.sqrt(dist)
        if (dist < minDist) { minDist = dist; nnIdx = j }
      }
      if (nnIdx >= 0 && minDist > 0) {
        // Check if still close in E+1 dim
        const distE1 = Math.abs(x[i + E * tau] - x[nnIdx + E * tau])
        const ratio = distE1 / minDist
        if (ratio > 10 || (distE1 / Math.sqrt(x.reduce((s, v) => s + v * v, 0) / n)) > 2) {
          falseCount++
        }
        totalPairs++
      }
    }
    fnnRatios.push(totalPairs > 0 ? falseCount / totalPairs : 0)
  }
  // Find E where FNN drops below 5%
  let optE = 2
  for (let E = 1; E <= fnnRatios.length; E++) {
    if (fnnRatios[E - 1] < 0.05) { optE = E; break }
  }
  return { fnnRatios, optE }
}

// Time delay embedding
export const embed = (x, E, tau) => {
  const n = x.length
  const nEmbed = n - (E - 1) * tau
  const embedded = []
  for (let i = 0; i < nEmbed; i++) {
    const vec = []
    for (let k = 0; k < E; k++) vec.push(x[i + k * tau])
    embedded.push(vec)
  }
  return embedded
}

// Simplex projection forecast
export const simplexForecast = (x, E, tau, tPred, libSize) => {
  const embedded = embed(x, E, tau)
  const n = embedded.length
  const libEnd = Math.min(libSize, n - 1)

  // Find E+1 nearest neighbors in library
  const target = embedded[tPred]
  if (!target) return null

  const distances = []
  for (let i = 0; i < libEnd; i++) {
    if (i === tPred) continue
    let dist = 0
    for (let k = 0; k < E; k++) dist += (target[k] - embedded[i][k]) ** 2
    distances.push({ idx: i, dist: Math.sqrt(dist) })
  }
  distances.sort((a, b) => a.dist - b.dist)
  const neighbors = distances.slice(0, E + 1)

  if (neighbors.length < 2) return null

  // Weighted average
  const minDist = neighbors[0].dist || 0.001
  const weights = neighbors.map(n => Math.exp(-n.dist / minDist))
  const totalW = weights.reduce((a, b) => a + b, 0)

  // Predict: weighted average of neighbors' future values
  let pred = 0
  for (let i = 0; i < neighbors.length; i++) {
    const futureIdx = neighbors[i].idx + 1
    if (futureIdx < x.length) {
      pred += (weights[i] / totalW) * x[futureIdx + (E - 1) * tau]
    }
  }

  return pred
}

// Convergent Cross Mapping
export const ccm = (X, Y, E, tau, libSizes) => {
  const n = X.length
  const results = []

  for (const libSize of libSizes) {
    const actualLib = Math.min(libSize, n - E * tau)
    if (actualLib < E + 2) continue

    // Embed Y
    const embeddedY = embed(Y, E, tau)
    const nEmbed = embeddedY.length

    // For each point in Y's embedding, find nearest neighbors
    // Then use their indices to estimate X
    const estimatedX = []
    const actualX = []

    for (let t = 0; t < nEmbed; t++) {
      if (t >= actualLib) continue

      // Find E+1 nearest neighbors in Y's manifold
      const distances = []
      for (let i = 0; i < actualLib; i++) {
        if (i === t) continue
        let dist = 0
        for (let k = 0; k < E; k++) dist += (embeddedY[t][k] - embeddedY[i][k]) ** 2
        distances.push({ idx: i, dist: Math.sqrt(dist) })
      }
      distances.sort((a, b) => a.dist - b.dist)
      const neighbors = distances.slice(0, E + 1)

      if (neighbors.length < 2) continue

      // Estimate X using neighbor indices
      const minDist = neighbors[0].dist || 0.001
      const weights = neighbors.map(n => Math.exp(-n.dist / minDist))
      const totalW = weights.reduce((a, b) => a + b, 0)

      let estX = 0
      for (let i = 0; i < neighbors.length; i++) {
        const xIdx = neighbors[i].idx + (E - 1) * tau
        if (xIdx < X.length) {
          estX += (weights[i] / totalW) * X[xIdx]
        }
      }
      estimatedX.push(estX)
      actualX.push(X[t + (E - 1) * tau])
    }

    // Correlation
    if (estimatedX.length > 2) {
      const meanE = estimatedX.reduce((a, b) => a + b, 0) / estimatedX.length
      const meanA = actualX.reduce((a, b) => a + b, 0) / actualX.length
      let num = 0, denE = 0, denA = 0
      for (let i = 0; i < estimatedX.length; i++) {
        num += (estimatedX[i] - meanE) * (actualX[i] - meanA)
        denE += (estimatedX[i] - meanE) ** 2
        denA += (actualX[i] - meanA) ** 2
      }
      const rho = num / (Math.sqrt(denE) * Math.sqrt(denA) + 1e-10)
      results.push({ libSize: actualLib, rho })
    }
  }

  return results
}
