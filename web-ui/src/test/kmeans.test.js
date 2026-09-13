// @vitest-environment node
/**
 * Tests for K-Means clustering (K-Means++ init, Lloyd's iterations, silhouette).
 * Exercises the production implementation in src/utils/kmeansMath.js
 * (imported by KMeansClustering.jsx).
 */
import { describe, it, expect } from 'vitest'
import { euclidean, kmeansPlusPlus, kmeans, kmeansIterate, silhouetteScore } from '../utils/kmeansMath'

// Seeded PRNG for deterministic tests (mulberry32)
function seededRandom(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
const _rng = seededRandom(42)
const rand = () => _rng()

describe('K-Means++ Initialization', () => {
  it('returns exactly k centroids', () => {
    const data = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]
    const centroids = kmeansPlusPlus(data, 3, rand)
    expect(centroids.length).toBe(3)
  })

  it('handles k=1', () => {
    const data = [[1, 1], [2, 2], [3, 3]]
    const centroids = kmeansPlusPlus(data, 1, rand)
    expect(centroids.length).toBe(1)
  })

  it('handles data smaller than k', () => {
    const data = [[1, 1], [2, 2]]
    const centroids = kmeansPlusPlus(data, 5, rand)
    expect(centroids.length).toBe(2) // Returns all data points
  })

  it('spreads centroids across data (not clustered)', () => {
    const data = Array.from({ length: 50 }, (_, i) => [i, i * 2])
    const centroids = kmeansPlusPlus(data, 3, rand)
    // At least 2 centroids should be far apart
    const d01 = euclidean(centroids[0], centroids[1])
    expect(d01).toBeGreaterThan(5)
  })
})

describe("Lloyd's Algorithm (kmeansIterate)", () => {
  it('assigns all points to a cluster', () => {
    const data = [[1, 1], [2, 2], [10, 10], [11, 11]]
    const centroids = [[1, 1], [10, 10]]
    const { labels } = kmeansIterate(data, centroids)
    expect(labels.length).toBe(data.length)
    labels.forEach(a => expect(a).toBeGreaterThanOrEqual(0))
    labels.forEach(a => expect(a).toBeLessThan(2))
  })

  it('converges to correct clusters for well-separated data', () => {
    const data = [
      ...Array.from({ length: 20 }, () => [1 + rand() * 0.5, 1 + rand() * 0.5]),
      ...Array.from({ length: 20 }, () => [10 + rand() * 0.5, 10 + rand() * 0.5]),
    ]
    const { labels } = kmeans(data, 2)
    // First 20 should be in one cluster, last 20 in the other
    const firstCluster = labels[0]
    for (let i = 0; i < 20; i++) expect(labels[i]).toBe(firstCluster)
    for (let i = 20; i < 40; i++) expect(labels[i]).not.toBe(firstCluster)
  })

  it('centroid positions are means of cluster members', () => {
    const data = [[0, 0], [2, 2], [10, 10], [12, 12]]
    const centroids = [[1, 1], [11, 11]]
    const { centroids: finalCentroids } = kmeansIterate(data, centroids)
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
      ...Array.from({ length: 20 }, () => [1 + rand() * 0.1, 1 + rand() * 0.1]),
      ...Array.from({ length: 20 }, () => [10 + rand() * 0.1, 10 + rand() * 0.1]),
    ]
    const { labels } = kmeans(data, 2)
    const score = silhouetteScore(data, labels, 2)
    expect(score).toBeGreaterThan(0.5) // Well-separated → high silhouette
  })

  it('returns lower score for overlapping clusters', () => {
    const data = [
      ...Array.from({ length: 20 }, () => [5 + rand() * 2, 5 + rand() * 2]),
      ...Array.from({ length: 20 }, () => [6 + rand() * 2, 6 + rand() * 2]),
    ]
    const { labels } = kmeans(data, 2)
    const score = silhouetteScore(data, labels, 2)
    expect(score).toBeLessThan(0.8) // Overlapping → lower silhouette
  })

  it('returns 0 for single cluster', () => {
    const data = [[1, 1], [2, 2], [3, 3]]
    const score = silhouetteScore(data, [0, 0, 0], 1)
    expect(score).toBe(0)
  })

  it('silhouette is between -1 and 1', () => {
    const data = [
      [1, 1], [1.1, 1.1], [10, 10], [10.1, 10.1],
      [5, 5], [5.1, 5.1],
    ]
    const { labels } = kmeans(data, 3)
    const score = silhouetteScore(data, labels, 3)
    expect(score).toBeGreaterThanOrEqual(-1)
    expect(score).toBeLessThanOrEqual(1)
  })
})
