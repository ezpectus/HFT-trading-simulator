export const MOCK_STRATEGIES = [
  { name: 'TrendFollowing', currentAUM: 500000, maxCapacity: 5000000, utilization: 10, alphaDecay: 0.5, status: 'scalable' },
  { name: 'MeanReversion', currentAUM: 800000, maxCapacity: 2000000, utilization: 40, alphaDecay: 2.1, status: 'moderate' },
  { name: 'StatArb', currentAUM: 1200000, maxCapacity: 1500000, utilization: 80, alphaDecay: 5.8, status: 'constrained' },
  { name: 'MarketMaking', currentAUM: 300000, maxCapacity: 800000, utilization: 37.5, alphaDecay: 1.2, status: 'scalable' },
  { name: 'Sentiment', currentAUM: 200000, maxCapacity: 1000000, utilization: 20, alphaDecay: 0.8, status: 'scalable' },
  { name: 'FundingArb', currentAUM: 600000, maxCapacity: 900000, utilization: 67, alphaDecay: 3.5, status: 'moderate' },
]

export const MOCK_CAPACITY_CURVE = [
  { aum: 100, alpha: 12.5 }, { aum: 250, alpha: 11.8 }, { aum: 500, alpha: 10.5 },
  { aum: 750, alpha: 9.2 }, { aum: 1000, alpha: 7.8 }, { aum: 1500, alpha: 5.5 },
  { aum: 2000, alpha: 3.2 }, { aum: 3000, alpha: 1.5 }, { aum: 5000, alpha: 0.5 },
]
