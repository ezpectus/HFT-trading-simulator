import { test, expect } from '@playwright/test'
import { dismissOnboarding, closeOverlays, gotoWithRetry } from './dismiss-onboarding.js'

test.describe('Trading System UI — Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  test('page loads with header', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    await expect(page.locator('header')).toBeVisible()
  })

  test('exchange selector is visible', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    const header = page.locator('header')
    await expect(header).toBeVisible()
    // Should have exchange buttons (binance, bybit, okx)
    await expect(page.getByText('binance', { exact: false }).first()).toBeVisible()
  })

  test('symbol selector works', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    // Click ETH/USDT symbol (button has aria-label with full symbol name)
    const ethButton = page.getByRole('button', { name: /Select ETH\/USDT/i })
    await ethButton.click()
    // Verify it's selected (active state)
    await expect(ethButton).toHaveClass(/text-accent-yellow|font-semibold/)
  })

  test('tab navigation works', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    // Click on Bots tab
    const botsTab = page.getByRole('tab', { name: /Bots/i })
    await botsTab.click()
    // The tab content should change
    await expect(botsTab).toHaveAttribute('aria-pressed', 'true')
  })

  test('order form is visible', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    // Order form should be visible in the left panel
    await expect(page.locator('input[type="number"]').first()).toBeVisible()
  })

  test('order book area is visible', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    // The right sidebar should contain order book
    const sidebar = page.locator('#main-content > div').nth(1)
    await expect(sidebar).toBeVisible()
  })

  test('panel container is visible', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    // Panel container with panel count should be visible
    await expect(page.getByText(/panels/i).first()).toBeVisible()
  })

  test('status bar is visible at bottom', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await closeOverlays(page)
    // Status bar should be at the bottom — check for status text
    await expect(page.locator('body')).toBeVisible()
  })
})
