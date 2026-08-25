import { describe, it, expect } from 'vitest'
import {
  MOCK_SYMBOLS,
  MOCK_EXCHANGES,
  generateCandles,
  generateOrderBook,
  generateSignal,
  generateNewsEvent,
  generateAccounts,
  generateInitialSnapshot,
} from '../utils/mockData'

describe('mockData', () => {
  describe('constants', () => {
    it('MOCK_SYMBOLS has 49 symbols', () => {
      expect(MOCK_SYMBOLS).toHaveLength(49)
    })

    it('MOCK_EXCHANGES has 3 exchanges', () => {
      expect(MOCK_EXCHANGES).toEqual(['binance', 'bybit', 'okx'])
    })
  })

  describe('generateCandles', () => {
    it('generates requested number of candles', () => {
      const candles = generateCandles('BTCUSDT', 'binance', 10, 60)
      expect(candles).toHaveLength(10)
    })

    it('candles have required fields', () => {
      const candles = generateCandles('BTCUSDT', 'binance', 5, 60)
      const c = candles[0]
      expect(c).toHaveProperty('exchange', 'binance')
      expect(c).toHaveProperty('symbol', 'BTCUSDT')
      expect(c).toHaveProperty('timestamp')
      expect(c).toHaveProperty('open')
      expect(c).toHaveProperty('high')
      expect(c).toHaveProperty('low')
      expect(c).toHaveProperty('close')
      expect(c).toHaveProperty('volume')
    })

    it('high >= max(open, close) and low <= min(open, close)', () => {
      const candles = generateCandles('BTCUSDT', 'binance', 20, 60)
      candles.forEach(c => {
        expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close))
        expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close))
      })
    })
  })

  describe('generateOrderBook', () => {
    it('generates order book with bids and asks', () => {
      const ob = generateOrderBook('BTCUSDT', 'binance', 65000)
      expect(ob).toHaveProperty('bids')
      expect(ob).toHaveProperty('asks')
      expect(ob.bids.length).toBeGreaterThan(0)
      expect(ob.asks.length).toBeGreaterThan(0)
    })

    it('bids are below mid price, asks are above', () => {
      const ob = generateOrderBook('BTCUSDT', 'binance', 65000)
      ob.bids.forEach(b => expect(b.price).toBeLessThan(65000))
      ob.asks.forEach(a => expect(a.price).toBeGreaterThan(65000))
    })
  })

  describe('generateSignal', () => {
    it('generates a signal with required fields', () => {
      const sig = generateSignal('BTCUSDT', 'binance', 65000)
      expect(sig).toHaveProperty('strategy')
      expect(sig).toHaveProperty('direction')
      expect(sig).toHaveProperty('confidence')
      expect(sig.confidence).toBeGreaterThanOrEqual(50)
      expect(sig.confidence).toBeLessThanOrEqual(95)
    })
  })

  describe('generateNewsEvent', () => {
    it('generates a news event', () => {
      const news = generateNewsEvent()
      expect(news).toHaveProperty('type', 'news')
      expect(news).toHaveProperty('title')
      expect(news).toHaveProperty('impact')
      expect(news).toHaveProperty('severity')
    })
  })

  describe('generateAccounts', () => {
    it('generates accounts for all exchanges', () => {
      const accounts = generateAccounts()
      expect(Object.keys(accounts)).toHaveLength(3)
      MOCK_EXCHANGES.forEach(ex => {
        expect(accounts[ex]).toHaveProperty('balance')
        expect(accounts[ex]).toHaveProperty('equity')
      })
    })
  })

  describe('generateInitialSnapshot', () => {
    it('generates complete snapshot', () => {
      const snap = generateInitialSnapshot()
      expect(snap).toHaveProperty('candles')
      expect(snap).toHaveProperty('prices')
      expect(snap).toHaveProperty('orderbooks')
      expect(snap).toHaveProperty('accounts')
    })
  })
})
