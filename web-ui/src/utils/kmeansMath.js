// K-Means clustering: feature extraction, K-Means++ init, Lloyd's iterations,
// silhouette score, feature normalization.
// Extracted from KMeansClustering.jsx — shared by the component and its tests.

// Feature extraction from return windows:
//   - Mean return
//   - Volatility (σ)
//   - Skewness (3rd moment)
//   - Kurtosis (4th moment - 3)
//   - Mean absolute return
//   - Autocorrelation (lag-1)
//   - Trend strength (R² of linear regression)
export const extractFeatures = (returns, windowSize = 20) => {
  const features = []
  for (let i = windowSize; i < returns.length; i++) {
    const window = returns.slice(i - windowSize, i)
    const n = window.length

    // Mean return
    const mean = window.reduce((a, b) => a + b, 0) / n

    // Volatility
    const variance = window.reduce((s, r) => s + (r - mean) ** 2, 0) / n
    const vol = Math.sqrt(variance)

    // Skewness
    const skew = vol > 0 ? window.reduce((s, r) => s + ((r - mean) / vol) ** 3, 0) / n : 0

    // Kurtosis
    const kurt = vol > 0 ? window.reduce((s, r) => s + ((r - mean) / vol) ** 4, 0) / n - 3 : 0

    // Mean absolute return
    const mar = window.reduce((s, r) => s + Math.abs(r), 0) / n

    // Autocorrelation (lag-1)
    let ac1Num = 0, ac1Den = 0
    for (let j = 1; j < n; j++) {
      ac1Num += (window[j] - mean) * (window[j - 1] - mean)
    }
    for (let j = 0; j < n; j++) {
      ac1Den += (window[j] - mean) ** 2
    }
    const ac1 = ac1Den > 0 ? ac1Num / ac1Den : 0

    // Trend strength (R² of linear regression)
    const x = Array.from({ length: n }, (_, i) => i)
    const xMean = (n - 1) / 2
    let sxy = 0, sxx = 0, syy = 0
    for (let j = 0; j < n; j++) {
      sxy += (x[j] - xMean) * (window[j] - mean)
      sxx += (x[j] - xMean) ** 2
      syy += (window[j] - mean) ** 2
    }
    const r2 = sxx > 0 && syy > 0 ? (sxy / Math.sqrt(sxx * syy)) ** 2 : 0

    features.push({ mean, vol, skew, kurt, mar, ac1, r2, index: i })
  }
  return features
}

// Squared Euclidean distance between two points
export const sqDistance = (a, b) => {
  let d = 0
  for (let i = 0; i < a.length; i++) d += (a[i] - b[i]) ** 2
  return d
}

export const euclidean = (a, b) => Math.sqrt(sqDistance(a, b))

// K-Means++ initialization
export const kmeansPlusPlus = (data, k, rng = Math.random) => {
  const n = data.length
  if (n < k) return data.slice()

  const centroids = []
  // First centroid: random
  centroids.push(data[Math.floor(rng() * n)].slice())

  for (let c = 1; c < k; c++) {
    // Compute squared distances to nearest centroid
    const dists = data.map(p => {
      let minDist = Infinity
      for (const cent of centroids) {
        const d = sqDistance(p, cent)
        if (d < minDist) minDist = d
      }
      return minDist
    })

    // Weighted random selection
    const total = dists.reduce((a, b) => a + b, 0)
    if (total === 0) {
      centroids.push(data[Math.floor(rng() * n)].slice())
      continue
    }
    let r = rng() * total
    let selected = 0
    for (let i = 0; i < n; i++) {
      r -= dists[i]
      if (r <= 0) { selected = i; break }
    }
    centroids.push(data[selected].slice())
  }

  return centroids
}

// Lloyd's iterations over fixed initial centroids — the inner loop of kmeans().
// Exported so both kmeans() and tests exercise the same code.
export const kmeansIterate = (data, centroids, maxIter = 100) => {
  const k = centroids.length
  const labels = new Array(data.length).fill(0)

  for (let iter = 0; iter < maxIter; iter++) {
    // Assignment step
    let changed = false
    for (let i = 0; i < data.length; i++) {
      let minDist = Infinity
      let bestCluster = 0
      for (let c = 0; c < k; c++) {
        const d = sqDistance(data[i], centroids[c])
        if (d < minDist) {
          minDist = d
          bestCluster = c
        }
      }
      if (labels[i] !== bestCluster) {
        labels[i] = bestCluster
        changed = true
      }
    }

    if (!changed) break

    // Update step
    for (let c = 0; c < k; c++) {
      const cluster = data.filter((_, i) => labels[i] === c)
      if (cluster.length === 0) continue
      centroids[c] = cluster[0].map((_, j) => cluster.reduce((s, p) => s + p[j], 0) / cluster.length)
    }
  }

  return { labels, centroids }
}

// K-Means clustering (K-Means++ init + Lloyd's algorithm)
export const kmeans = (data, k, maxIter = 100) => {
  if (data.length < k) return { labels: data.map((_, i) => i % k), centroids: data, wcss: 0 }

  const centroids = kmeansPlusPlus(data, k)
  const { labels } = kmeansIterate(data, centroids, maxIter)

  // WCSS (within-cluster sum of squares)
  let wcss = 0
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < data[i].length; j++) {
      wcss += (data[i][j] - centroids[labels[i]][j]) ** 2
    }
  }

  return { labels, centroids, wcss }
}

// Silhouette score
export const silhouetteScore = (data, labels, k) => {
  if (k < 2) return 0
  const n = data.length
  let totalScore = 0

  for (let i = 0; i < n; i++) {
    const ci = labels[i]
    // a(i): mean distance to same cluster
    let aSum = 0, aCount = 0
    for (let j = 0; j < n; j++) {
      if (i === j || labels[j] !== ci) continue
      aSum += euclidean(data[i], data[j])
      aCount++
    }
    const a = aCount > 0 ? aSum / aCount : 0

    // b(i): min mean distance to other clusters
    let b = Infinity
    for (let c = 0; c < k; c++) {
      if (c === ci) continue
      let bSum = 0, bCount = 0
      for (let j = 0; j < n; j++) {
        if (labels[j] !== c) continue
        bSum += euclidean(data[i], data[j])
        bCount++
      }
      if (bCount > 0) b = Math.min(b, bSum / bCount)
    }

    if (b === Infinity) continue
    const s = (b - a) / Math.max(a, b)
    totalScore += s
  }

  return n > 0 ? totalScore / n : 0
}

// Normalize features to [0, 1]
export const normalize = (features, keys) => {
  const stats = keys.map(k => {
    const vals = features.map(f => f[k])
    return { key: k, min: Math.min(...vals), max: Math.max(...vals) }
  })

  const normalized = features.map(f =>
    stats.map(s => (s.max - s.min) > 0 ? (f[s.key] - s.min) / (s.max - s.min) : 0)
  )

  return { normalized, stats }
}
