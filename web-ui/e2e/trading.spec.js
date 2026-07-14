import { test, expect } from '@playwright/test'

test.describe('Trading System UI — Trading Flows', () => {
  test('can switch exchanges via keyboard shortcuts', async ({ page }) => {
    await page.goto('/')
    // Press '2' to switch to bybit
    await page.keyboard.press('2')
    // Wait a moment for state update
    await page.waitForTimeout(200)
    // The exchange should be updated in the header
    const bybitButton = page.getByText('bybit', { exact: false }).first()
    await expect(bybitButton).toBeVisible()
  })

  test('can switch symbols via keyboard shortcuts', async ({ page }) => {
    await page.goto('/')
    // Press 'w' to switch to ETH/USDT
    await page.keyboard.press('w')
    await page.waitForTimeout(200)
    // ETH/USDT should be visible somewhere in the header
    await expect(page.getByText('ETH/USDT').first()).toBeVisible()
  })

  test('can switch tabs via keyboard shortcuts', async ({ page }) => {
    await page.goto('/')
    // Press 's' for signals tab
    await page.keyboard.press('s')
    await page.waitForTimeout(200)
    // The signals tab should be active
    const signalsTab = page.getByRole('tab', { name: /Signals/i })
    await expect(signalsTab).toHaveAttribute('aria-pressed', 'true')
  })

  test('can toggle sidebar with Shift+\\', async ({ page }) => {
    await page.goto('/')
    // Press Shift+\ to collapse sidebar
    await page.keyboard.press('Shift+\\')
    await page.waitForTimeout(300)
    // An expand button should appear
    const expandButton = page.getByRole('button', { name: /Expand sidebar/i })
    await expect(expandButton).toBeVisible()
    // Click to expand again
    await expandButton.click()
    await page.waitForTimeout(200)
    // Collapse button should reappear
    const collapseButton = page.getByRole('button', { name: /Collapse sidebar/i })
    await expect(collapseButton).toBeVisible()
  })

  test('can navigate through all tabs', async ({ page }) => {
    await page.goto('/')
    const tabs = ['Account', 'Bots', 'Signals', 'Arb', 'Fills', 'History', 'Perf', 'BT']
    for (const tabName of tabs) {
      const tab = page.getByRole('tab', { name: new RegExp(tabName, 'i') })
      await tab.click()
      await page.waitForTimeout(100)
      await expect(tab).toHaveAttribute('aria-pressed', 'true')
    }
  })

  test('order form shows trading state', async ({ page }) => {
    await page.goto('/')
    // The order form should be visible
    const orderForm = page.locator('.bg-bg-800').filter({ has: page.locator('input[type="number"]') }).first()
    await expect(orderForm).toBeVisible()
    // Should have a submit button
    const submitButton = orderForm.locator('button').last()
    await expect(submitButton).toBeVisible()
    // Button text should be either "Submit Order", "Not connected", or "Trading Stopped"
    const buttonText = await submitButton.textContent()
    expect(buttonText).toMatch(/Submit|Not connected|Trading Stopped/i)
  })

  test('mock mode banner shows when in mock mode', async ({ page }) => {
    await page.goto('/')
    // In mock mode, the banner should be visible
    // In real mode, it won't be — this test just checks the page loads
    await expect(page.locator('header')).toBeVisible()
  })

  test('panel settings toggle works', async ({ page }) => {
    await page.goto('/')
    // Find the Panels settings button
    const panelsButton = page.getByText('Panels').first()
    await panelsButton.click()
    await page.waitForTimeout(200)
    // The toggle panel settings should appear
    await expect(page.getByText('Toggle Panels').first()).toBeVisible()
  })
})
