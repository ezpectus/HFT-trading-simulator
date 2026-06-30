/**
 * Tests for K-Means clustering (K-Means++ init, Lloyd's iterations, silhouette).
 * Tests the core algorithms extracted from KMeansClustering.jsx.
 */
import { describe, it, expect } from 'vitest'

// Euclidean distance
function euclidean(a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2
  return Math.sqrt(sum)
}

// K-Means++ initialization
function kmeansPlusPlus(data, k) {
  const n = data.length
  if (n < k) return data.slice()
  const centroids = []
  centroids.push(data[Math.floor(Math.random() * n)].slice())
  for (let c = 1; c < k; c++) {
    const distances = data.map(p => {
      let minDist = Infinity
      for (const centroid of centroids) {
        const d = euclidean(p, centroid)
        if (d < minDist) minDist = d
      }
      return minDist ** 2
    })
    const total = distances.reduce((s, d) => s + d, 0)
    if (total === 0) {
      centroids.push(data[Math.floor(Math.random() * n)].slice())
      continue
    }
    let r = Math.random() * total
    let idx = 0
    for (let i = 0; i < n; i++) {
      r -= distances[i]
      if (r <= 0) { idx = i; break }
    }
    centroids.push(data[idx].slice())
  }
  return centroids
}

// Lloyd's algorithm
function lloyds(data, centroids, maxIter = 100) {
  const k = centroids.length
  let assignments = new Array(data.length).fill(0)
  for (let iter = 0; iter < maxIter; iter++) {
    // Assign
    let changed = false
    for (let i = 0; i < data.length; i++) {
      let minDist = Infinity, minIdx = 0
      for (let c = 0; c < k; c++) {
        const d = euclidean(data[i], centroids[c])
        if (d < minDist) { minDist = d; minIdx = c }
      }
      if (assignments[i] !== minIdx) { assignments[i] = minIdx; changed = true }
    }
    if (!changed && iter > 0) break
    // Update
    for (let c = 0; c < k; c++) {
      const members = data.filter((_, i) => assignments[i] === c)
      if (members.length === 0) continue
      centroids[c] = members[0].map((_, dim) =>
        members.reduce((s, m) => s + m[dim], 0) / members.length)
    }
  }
  return { assignments, centroids }
}

// Silhouette score
function silhouette(data, assignments, centroids) {
  const k = centroids.length
  if (k < 2) return 0
  const scores = []
  for (let i = 0; i < data.length; i++) {
    const myCluster = assignments[i]
    // a: mean distance to same cluster
    const sameCluster = data.filter((_, j) => j !== i && assignments[j] === myCluster)
    if (sameCluster.length === 0) { scores.push(0); continue }
    const a = sameCluster.reduce((s, p) => s + euclidean(data[i], p), 0) / sameCluster.length
    // b: min mean distance to other clusters
    let b = Infinity
    for (let c = 0; c < k; c++) {
      if (c === myCluster) continue
      const otherCluster = data.filter((_, j) => assignments[j] === c)
      if (otherCluster.length === 0) continue
      const meanDist = otherCluster.reduce((s, p) => s + euclidean(data[i], p), 0) / otherCluster.length
      if (meanDist < b) b = meanDist
    }
    const maxAB = Math.max(a, b)
    scores.push(maxAB > 0 ? (b - a) / maxAB : 0)
  }
  return scores.reduce((s, v) => s + v, 0) / scores.length
}

describe('K-Means++ Initialization', () => {
  it('returns exactly k centroids', () => {
    const data = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]
    const centroids = kmeansPlusPlus(data, 3)
    expect(centroids.length).toBe(3)
  })

  it('handles k=1', () => {
    const data = [[1, 1], [2, 2], [3, 3]]
    const centroids = kmeansPlusPlus(data, 1)
    expect(centroids.length).toBe(1)
  })

  it('handles data smaller than k', () => {
    const data = [[1, 1], [2, 2]]
    const centroids = kmeansPlusPlus(data, 5)
    expect(centroids.length).toBe(2) // Returns all data points
  })

  it('spreads centroids across data (not clustered)', () => {
    const data = Array.from({ length: 50 }, (_, i) => [i, i * 2])
    const centroids = kmeansPlusPlus(data, 3)
    // At least 2 centroids should be far apart
    const d01 = euclidean(centroids[0], centroids[1])
    expect(d01).toBeGreaterThan(5)
  })
})

describe("Lloyd's Algorithm", () => {
  it('assigns all points to a cluster', () => {
    const data = [[1, 1], [2, 2], [10, 10], [11, 11]]
    const centroids = [[1, 1], [10, 10]]
    const { assignments } = lloyds(data, centroids)
    expect(assignments.length).toBe(data.length)
    assignments.forEach(a => expect(a).toBeGreaterThanOrEqual(0))
    assignments.forEach(a => expect(a).toBeLessThan(2))
  })

  it('converges to correct clusters for well-separated data', () => {
    const data = [
      ...Array.from({ length: 20 }, () => [1 + Math.random() * 0.5, 1 + Math.random() * 0.5]),
      ...Array.from({ length: 20 }, () => [10 + Math.random() * 0.5, 10 + Math.random() * 0.5]),
    ]
    const centroids = kmeansPlusPlus(data, 2)
    const { assignments, centroids: finalCentroids } = lloyds(data, centroids)
    // First 20 should be in one cluster, last 20 in the other
    const firstCluster = assignments[0]
    for (let i = 0; i < 20; i++) expect(assignments[i]).toBe(firstCluster)
    for (let i = 20; i < 40; i++) expect(assignments[i]).not.toBe(firstCluster)
  })

  it('centroid positions are means of cluster members', () => {
    const data = [[0, 0], [2, 2], [10, 10], [12, 12]]
    const centroids = [[1, 1], [11, 11]]
    const { centroids: finalCentroids } = lloyds(data, centroids)
    // After convergence, centroid 0 should be mean of [0,0] and [2,2] = [1,1]
    // centroid 1 should be mean of [10,10] and [12,12] = [11,11]
    expect(finalCentroids[0][0]).toBeCloseTo(1, 5)
    expect(finalCentroids[0][1]).toBeCloseTo(1, 5)
    expect(finalCentroids[1][0]).toBeCloseTo(11, 5)
    expect(finalCentroids[1][1]).toBeCloseTo(11, 5)
  })
})

describe('Silhouette Score', () => {
  it('returns high score for well-separated clusters', () => {
    const data = [
      ...Array.from({ length: 20 }, () => [1 + Math.random() * 0.1, 1 + Math.random() * 0.1]),
      ...Array.from({ length: 20 }, () => [10 + Math.random() * 0.1, 10 + Math.random() * 0.1]),
    ]
    const centroids = kmeansPlusPlus(data, 2)
    const { assignments } = lloyds(data, centroids)
    const score = silhouette(data, assignments, centroids)
    expect(score).toBeGreaterThan(0.5) // Well-separated → high silhouette
  })

  it('returns lower score for overlapping clusters', () => {
    const data = [
      ...Array.from({ length: 20 }, () => [5 + Math.random() * 2, 5 + Math.random() * 2]),
      ...Array.from({ length: 20 }, () => [6 + Math.random() * 2, 6 + Math.random() * 2]),
    ]
    const centroids = kmeansPlusPlus(data, 2)
    const { assignments } = lloyds(data, centroids)
    const score = silhouette(data, assignments, centroids)
    expect(score).toBeLessThan(0.8) // Overlapping → lower silhouette
  })

  it('returns 0 for single cluster', () => {
    const data = [[1, 1], [2, 2], [3, 3]]
    const score = silhouette(data, [0, 0, 0], [[2, 2]])
    expect(score).toBe(0)
  })

  it('silhouette is between -1 and 1', () => {
    const data = [
      [1, 1], [1.1, 1.1], [10, 10], [10.1, 10.1],
      [5, 5], [5.1, 5.1],
    ]
    const centroids = kmeansPlusPlus(data, 3)
    const { assignments } = lloyds(data, centroids)
    const score = silhouette(data, assignments, centroids)
    expect(score).toBeGreaterThanOrEqual(-1)
    expect(score).toBeLessThanOrEqual(1)
  })
})
