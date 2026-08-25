export const MOCK_DATACENTERS = [
  { id: 'dc-tokyo', name: 'Tokyo (TY3)', region: 'APAC', latency: 0.3, status: 'online', uptime: 99.98, colo: true },
  { id: 'dc-london', name: 'London (LD4)', region: 'EMEA', latency: 1.2, status: 'online', uptime: 99.95, colo: true },
  { id: 'dc-newyork', name: 'New York (NY4)', region: 'AMER', latency: 0.8, status: 'online', uptime: 99.99, colo: true },
  { id: 'dc-singapore', name: 'Singapore (SG1)', region: 'APAC', latency: 2.1, status: 'degraded', uptime: 98.50, colo: false },
  { id: 'dc-frankfurt', name: 'Frankfurt (FR2)', region: 'EMEA', latency: 1.5, status: 'offline', uptime: 0, colo: false },
]

export const MOCK_SERVICES = [
  { name: 'Matching Engine', dc: 'Tokyo', status: 'online', cpu: 23, mem: 45, conns: 142 },
  { name: 'Risk Gateway', dc: 'Tokyo', status: 'online', cpu: 18, mem: 38, conns: 89 },
  { name: 'Order Router', dc: 'New York', status: 'online', cpu: 31, mem: 52, conns: 215 },
  { name: 'Market Data Feed', dc: 'London', status: 'online', cpu: 45, mem: 61, conns: 340 },
  { name: 'Signal Processor', dc: 'London', status: 'degraded', cpu: 78, mem: 82, conns: 95 },
  { name: 'WS Broadcaster', dc: 'New York', status: 'online', cpu: 28, mem: 44, conns: 1280 },
]
