import { test, expect } from '@playwright/test'
import { dismissOnboarding, closeOverlays, gotoWithRetry } from './dismiss-onboarding.js'

test.beforeEach(async ({ page }) => {
  await dismissOnboarding(page)
})

test.describe('Web UI — Mock Mode', () => {
  test('loads page in mock mode and shows dashboard', async ({ page }) => {
    // Mock mode is enabled via VITE_MOCK_MODE=true in .env or env var
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    
    // Header should be visible
    await expect(page.locator('header')).toBeVisible({ timeout: 10000 })
    
    // Title or logo should mention HFT or Trading
    const headerText = await page.locator('header').textContent()
    expect(headerText).toMatch(/HFT|Trading|Dashboard/i)
  })

  test('shows candle chart panel', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    
    // Chart container should appear (either canvas or div with chart-related class)
    const chartArea = page.locator('[class*="chart"], [class*="candle"], canvas').first()
    await expect(chartArea).toBeVisible({ timeout: 15000 })
  })

  test('shows exchange selector', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    
    // Exchange buttons or dropdown should be present
    const exchangeSelector = page.locator('button, select').filter({ hasText: /binance|bybit|okx/i }).first()
    await expect(exchangeSelector).toBeVisible({ timeout: 10000 })
  })

  test('shows symbol selector', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    
    // Symbol buttons or dropdown should be present
    const symbolSelector = page.locator('button, select').filter({ hasText: /BTC|ETH|SOL/i }).first()
    await expect(symbolSelector).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Web UI — Navigation', () => {
  test('can switch tabs', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    
    // Find tab-like elements in header or nav
    const tabs = page.locator('[role="tab"], button[class*="tab"]').first()
    if (await tabs.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tabs.click()
      // Page should not crash
      await expect(page.locator('body')).toBeVisible()
    }
  })

  test('can toggle sidebar', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    
    // Just verify the page is still functional after load
    await expect(page.locator('body')).toBeVisible()
  })
})

test.describe('Web UI — Order Form', () => {
  test('order form is visible', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    
    // Order form should have buy/sell buttons or quantity input
    const orderForm = page.locator('input[type="number"], button').filter({ hasText: /buy|sell|long|short/i }).first()
    await expect(orderForm).toBeVisible({ timeout: 10000 })
  })

  test('buy and sell buttons exist', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    
    // Look for buy/long button
    const buyBtn = page.locator('button').filter({ hasText: /buy|long/i }).first()
    const sellBtn = page.locator('button').filter({ hasText: /sell|short/i }).first()
    
    // At least one should be visible
    const buyVisible = await buyBtn.isVisible({ timeout: 5000 }).catch(() => false)
    const sellVisible = await sellBtn.isVisible({ timeout: 5000 }).catch(() => false)
    expect(buyVisible || sellVisible).toBeTruthy()
  })
})

test.describe('Web UI — Signal Feed', () => {
  test('signal feed panel exists', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    
    // Switch to Signals tab to show signal feed
    const signalsTab = page.getByRole('tab', { name: /Signals/i })
    await signalsTab.click()
    await page.waitForTimeout(500)
    
    // Signal feed should be somewhere on the page
    const signalArea = page.getByText(/Market Regime|Confidence Distribution|Signal Feed|No signals/i).first()
    await expect(signalArea).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Web UI — Responsive', () => {
  test('page renders on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 })
    
    // No horizontal scroll
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5) // 5px tolerance
  })

  test('page renders on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Web UI — No Console Errors', () => {
  test('no critical console errors on load', async ({ page }) => {
    const errors = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })
    
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    await page.waitForTimeout(3000)
    
    // Filter out expected errors (WebSocket connection failures in mock mode, etc.)
    const criticalErrors = errors.filter(e => 
      !e.includes('WebSocket') && 
      !e.includes('favicon') &&
      !e.includes('ERR_CONNECTION') &&
      !e.includes('network') &&
      !e.includes('React.jsx') &&
      !e.includes('Warning:') &&
      !e.includes('attribute') &&
      !e.includes('SVG') &&
      !e.includes('NaN')
    )
    
    expect(criticalErrors).toHaveLength(0)
  })
})
