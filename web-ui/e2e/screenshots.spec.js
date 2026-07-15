import { test } from '@playwright/test'

const SCREENSHOTS_DIR = 'screenshots'

test.describe('Screenshot capture for README', () => {
  test.beforeEach(async ({ page }) => {
    // Set a consistent viewport for all screenshots
    await page.setViewportSize({ width: 1920, height: 1080 })
  })

  test('capture main dashboard', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(3000) // Wait for data to load

    // Take full page screenshot
    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/dashboard-main.png`,
      fullPage: false,
    })
  })

  test('capture market data panel', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(3000)

    // Try to find and click on market data / chart panel
    const chartPanel = page.locator('[data-panel-id="chart"], [data-panel-id="market-data"], .panel:has-text("Price Chart")').first()
    if (await chartPanel.isVisible()) {
      await chartPanel.screenshot({ path: `${SCREENSHOTS_DIR}/panel-market-data.png` })
    }
  })

  test('capture order book panel', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(3000)

    const orderBook = page.locator('[data-panel-id="orderbook"], .panel:has-text("Order Book")').first()
    if (await orderBook.isVisible()) {
      await orderBook.screenshot({ path: `${SCREENSHOTS_DIR}/panel-orderbook.png` })
    }
  })

  test('capture backtest runner', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(2000)

    // Find and click backtest panel/tab
    const backtestTab = page.locator('[data-panel-id="backtest"], button:has-text("Backtest"), .panel:has-text("Backtest")').first()
    if (await backtestTab.isVisible()) {
      await backtestTab.click().catch(() => {})
      await page.waitForTimeout(1000)
    }

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/panel-backtest.png`,
      fullPage: false,
    })
  })

  test('capture signal engine panel', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(3000)

    const signalPanel = page.locator('[data-panel-id="signal-engine"], .panel:has-text("Signal Engine")').first()
    if (await signalPanel.isVisible()) {
      await signalPanel.screenshot({ path: `${SCREENSHOTS_DIR}/panel-signal-engine.png` })
    }
  })

  test('capture positions panel', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(3000)

    const positionsPanel = page.locator('[data-panel-id="positions"], .panel:has-text("Positions")').first()
    if (await positionsPanel.isVisible()) {
      await positionsPanel.screenshot({ path: `${SCREENSHOTS_DIR}/panel-positions.png` })
    }
  })

  test('capture mobile view', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await page.waitForTimeout(3000)

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/dashboard-mobile.png`,
      fullPage: false,
    })
  })
})
