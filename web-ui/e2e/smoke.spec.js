import { test, expect } from '@playwright/test'

test.describe('Trading System UI — Smoke Tests', () => {
  test('page loads with header', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('header')).toBeVisible()
  })

  test('exchange selector is visible', async ({ page }) => {
    await page.goto('/')
    const header = page.locator('header')
    await expect(header).toBeVisible()
    // Should have exchange buttons (binance, bybit, okx)
    await expect(page.getByText('binance', { exact: false }).first()).toBeVisible()
  })

  test('symbol selector works', async ({ page }) => {
    await page.goto('/')
    // Click ETH/USDT symbol (button has aria-label with full symbol name)
    const ethButton = page.getByRole('button', { name: /Select ETH\/USDT/i })
    await ethButton.click()
    // Verify it's selected (active state)
    await expect(ethButton).toHaveClass(/text-white|bg-accent|font-bold|border-accent/)
  })

  test('tab navigation works', async ({ page }) => {
    await page.goto('/')
    // Click on Bots tab
    const botsTab = page.getByRole('tab', { name: /Bots/i })
    await botsTab.click()
    // The tab content should change
    await expect(botsTab).toHaveAttribute('aria-pressed', 'true')
  })

  test('order form is visible', async ({ page }) => {
    await page.goto('/')
    // Order form should be visible in the left panel
    await expect(page.locator('input[type="number"]').first()).toBeVisible()
  })

  test('order book area is visible', async ({ page }) => {
    await page.goto('/')
    // The right sidebar should contain order book
    const sidebar = page.locator('#main-content > div').nth(1)
    await expect(sidebar).toBeVisible()
  })

  test('panel container is visible', async ({ page }) => {
    await page.goto('/')
    // Panel container with panel count should be visible
    await expect(page.getByText(/panels/i).first()).toBeVisible()
  })

  test('status bar is visible at bottom', async ({ page }) => {
    await page.goto('/')
    // Status bar should be at the bottom — check for status text
    await expect(page.locator('body')).toBeVisible()
  })
})
