// Shared helper: dismiss onboarding modal before navigating to page
// The OnboardingTutorial component shows on first visit (no localStorage key).
// In CI, Playwright uses fresh browser contexts, so the modal always appears
// and blocks all clicks with its fixed inset-0 z-50 overlay.
export async function dismissOnboarding(page) {
  // Pre-set localStorage so OnboardingTutorial never renders,
  // AND install a MutationObserver to remove the modal if it still appears.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('trading-sim-onboarded', '1')
    } catch {
      // ignore
    }

    // MutationObserver: remove onboarding modal as soon as it's added to DOM
    const removeOnboarding = () => {
      const modal = document.querySelector('.fixed.inset-0.z-50')
      if (modal && modal.textContent.includes('Trading Sim')) {
        modal.remove()
        return true
      }
      return false
    }

    // Try immediately (in case DOM is already loaded)
    if (!removeOnboarding()) {
      // Set up observer to catch it when React renders
      const obs = new MutationObserver(() => removeOnboarding())
      const start = () => {
        removeOnboarding()
        obs.observe(document.body, { childList: true, subtree: true })
        // Stop observing after 5s to avoid leak
        setTimeout(() => obs.disconnect(), 5000)
      }
      if (document.body) {
        start()
      } else {
        document.addEventListener('DOMContentLoaded', start)
      }
    }
  })
}

// Fallback: remove onboarding modal from DOM and hide notification toasts
// Call this after page.goto('/') to ensure no overlays block clicks
export async function closeOverlays(page) {
  // Wait briefly for React to render
  await page.waitForTimeout(500)

  // Remove onboarding modal from DOM if present
  await page.evaluate(() => {
    const modal = document.querySelector('.fixed.inset-0.z-50')
    if (modal && modal.textContent.includes('Trading Sim')) {
      modal.remove()
    }
  }).catch(() => {})

  // Hide notification toasts that may intercept clicks in bottom-right
  await page.evaluate(() => {
    const notifications = document.querySelector('[role="region"][aria-label="Notifications"]')
    if (notifications) notifications.style.display = 'none'
  }).catch(() => {})
}
