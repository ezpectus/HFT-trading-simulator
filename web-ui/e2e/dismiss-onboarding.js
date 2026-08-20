// Shared helper: dismiss onboarding modal before navigating to page
// The OnboardingTutorial component shows on first visit (no localStorage key).
// In CI, Playwright uses fresh browser contexts, so the modal always appears
// and blocks all clicks with its fixed inset-0 z-50 overlay.
//
// Strategy: inject CSS with !important via addInitScript (runs before any page JS).
// CSS !important survives React re-renders — unlike DOM removal which React undoes.
export async function dismissOnboarding(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('trading-sim-onboarded', '1')
    } catch {
      // ignore
    }

    // Inject CSS to hide onboarding modal and notification toasts
    // !important overrides React's display:flex/inline styles across re-renders
    const style = document.createElement('style')
    style.id = 'e2e-overlay-hider'
    style.textContent = [
      '.fixed.inset-0.z-50 { display: none !important; }',
      '[role="region"][aria-label="Notifications"] { display: none !important; }',
    ].join('\n')
    ;(document.head || document.documentElement).appendChild(style)
  })
}

// Robust navigation helper — retries page.goto on transient browser/server failures
export async function gotoWithRetry(page, url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      return
    } catch (e) {
      if (attempt === retries) throw e
      await page.waitForTimeout(1000)
    }
  }
}

// Fallback: add CSS via Playwright's addStyleTag after page load
// Call this after page.goto('/') to ensure no overlays block clicks
export async function closeOverlays(page) {
  // Check if CSS was already injected by addInitScript
  const hasStyle = await page.evaluate(() => {
    return !!document.getElementById('e2e-overlay-hider')
  }).catch(() => false)

  if (!hasStyle) {
    await page.addStyleTag({
      content: [
        '.fixed.inset-0.z-50 { display: none !important; }',
        '[role="region"][aria-label="Notifications"] { display: none !important; }',
      ].join('\n'),
    }).catch(() => {})
  }
}
