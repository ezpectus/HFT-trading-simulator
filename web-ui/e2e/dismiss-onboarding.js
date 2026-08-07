// Shared helper: dismiss onboarding modal before navigating to page
// The OnboardingTutorial component shows on first visit (no localStorage key).
// In CI, Playwright uses fresh browser contexts, so the modal always appears
// and blocks all clicks with its fixed inset-0 z-50 overlay.
export async function dismissOnboarding(page) {
  await page.addInitScript(() => {
    localStorage.setItem('trading-sim-onboarded', '1')
  })
}
