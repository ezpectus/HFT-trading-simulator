import { test, expect } from '@playwright/test'
import { dismissOnboarding, closeOverlays, gotoWithRetry } from './dismiss-onboarding.js'

const SCREENSHOTS_DIR = 'screenshots'

test.describe('Screenshot capture for README', () => {
  test.beforeEach(async ({ page }) => {
    // Set a consistent viewport for all screenshots
    await page.setViewportSize({ width: 1920, height: 1080 })
    await dismissOnboarding(page)
  })

  test('capture main dashboard', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)

    // App shell must actually render — a screenshot of an error boundary
    // is not README material.
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('header')).toBeVisible()

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/dashboard-main.png`,
      fullPage: false,
    })
  })

  test('capture market data panel', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)

    // CandleChart renders a canvas inside the left pane
    const chartCanvas = page.locator('canvas').first()
    await expect(chartCanvas).toBeVisible({ timeout: 15000 })
    await chartCanvas.screenshot({ path: `${SCREENSHOTS_DIR}/panel-market-data.png` })
  })

  test('capture order book panel', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)

    // OrderBook header text is always rendered (empty book still shows it)
    const orderBook = page.getByText('Order Book', { exact: true })
    await expect(orderBook).toBeVisible({ timeout: 10000 })
    await orderBook.locator('xpath=ancestor::div[contains(@class,"h-full")]').first()
      .screenshot({ path: `${SCREENSHOTS_DIR}/panel-orderbook.png` })
  })

  test('capture backtest runner', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)

    const backtestTab = page.getByTestId('tab-backtest')
    await expect(backtestTab).toBeVisible({ timeout: 10000 })
    await backtestTab.click()
    await expect(page.locator('.tab-content')).toBeVisible({ timeout: 10000 })

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/panel-backtest.png`,
      fullPage: false,
    })
  })

  test('capture signals panel', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)

    const signalsTab = page.getByTestId('tab-signals')
    await expect(signalsTab).toBeVisible({ timeout: 10000 })
    await signalsTab.click()
    await expect(page.locator('.tab-content')).toBeVisible({ timeout: 10000 })

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/panel-signal-engine.png`,
      fullPage: false,
    })
  })

  test('capture positions panel', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)

    const accountTab = page.getByTestId('tab-account')
    await expect(accountTab).toBeVisible({ timeout: 10000 })
    await accountTab.click()

    // PositionsPanel renders "Open Positions (N)" or the empty state
    const positions = page.getByText(/Open Positions|No open positions/).first()
    await expect(positions).toBeVisible({ timeout: 10000 })
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/panel-positions.png` })
  })

  test('capture mobile view', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await gotoWithRetry(page, '/')
    await closeOverlays(page)

    await expect(page.locator('#main-content')).toBeVisible({ timeout: 15000 })

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/dashboard-mobile.png`,
      fullPage: false,
    })
  })
})
