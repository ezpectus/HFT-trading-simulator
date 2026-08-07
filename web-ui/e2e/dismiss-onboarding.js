// Shared helper: dismiss onboarding modal before navigating to page
// The OnboardingTutorial component shows on first visit (no localStorage key).
// In CI, Playwright uses fresh browser contexts, so the modal always appears
// and blocks all clicks with its fixed inset-0 z-50 overlay.
export async function dismissOnboarding(page) {
  // Pre-set localStorage so OnboardingTutorial never renders
  await page.addInitScript(() => {
    try {
      localStorage.setItem('trading-sim-onboarded', '1')
    } catch {
      // ignore
    }
  })
}

// Fallback: close onboarding modal and dismiss notification toasts if they appear
// Call this after page.goto('/') to ensure no overlays block clicks
export async function closeOverlays(page) {
  // Close onboarding modal if it somehow appeared
  const onboardingClose = page.locator('.fixed.inset-0.z-50 button:has(svg)').first()
  if (await onboardingClose.isVisible({ timeout: 1000 }).catch(() => false)) {
    await onboardingClose.click().catch(() => {})
    await page.waitForTimeout(200)
  }

  // Dismiss notification toasts that may intercept clicks in bottom-right
  const notifications = page.locator('[role="region"][aria-label="Notifications"]')
  if (await notifications.isVisible({ timeout: 500 }).catch(() => false)) {
    await notifications.evaluate(el => el.style.display = 'none').catch(() => {})
  }
}
