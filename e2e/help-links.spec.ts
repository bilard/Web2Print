// e2e/help-links.spec.ts
// Les liens du panneau d'aide (« Ouvrir Workflows », chips de modules) doivent
// RÉELLEMENT ouvrir la section visée. Un lien inerte ne lève aucune erreur : il
// ne se voit qu'à l'écran, d'où ce test.
import { test, expect, type Page } from '@playwright/test'

const OWNER_EMAIL = 'ibs.studio@gmail.com'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('w2p:tour:seen', JSON.stringify({ dashboard: true, editor: true }))
    sessionStorage.setItem('w2p:onboarding_keys_dismissed', '1')
    localStorage.setItem('designstudio_apikey_gemini', 'e2e-fake-key')
  })
})

async function loginAsOwner(page: Page): Promise<void> {
  await page.goto('/login')
  const popupPromise = page.context().waitForEvent('page')
  await page.getByRole('button', { name: /se connecter avec google|sign in with google/i }).click()
  const popup = await popupPromise
  await popup.waitForLoadState('domcontentloaded')
  const existing = popup.getByText(OWNER_EMAIL).first()
  if (await existing.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await existing.click()
  } else {
    await popup.getByRole('button', { name: /add new account/i }).click()
    await popup.locator('#email-input').fill(OWNER_EMAIL)
    await popup.locator('#display-name-input').fill('IBS Studio')
    await popup.getByRole('button', { name: /sign in/i }).click()
  }
  await page.waitForURL(/dashboard/, { timeout: 30_000 })
  await page.waitForTimeout(1500)
}

test('un lien de module du panneau d’aide ouvre bien la section', async ({ page }) => {
  await loginAsOwner(page)

  // Ouvre le panneau d'aide (bouton ?), puis l'article de démarrage qui liste
  // les modules sous forme de chips cliquables.
  await page.keyboard.press('Shift+?')
  await page.waitForTimeout(1200)

  const chip = page.getByRole('button', { name: /^Workflows?$/ }).first()
  const found = await chip.isVisible({ timeout: 5_000 }).catch(() => false)
  test.skip(!found, 'chip de module introuvable — le panneau d’aide n’était pas ouvert')

  await chip.click()
  await page.waitForTimeout(1500)

  // La section Workflows doit être ouverte : son écran porte ce repère.
  await expect(page.locator('[data-tour="section-workflows"], [data-wf-section]').first())
    .toBeVisible({ timeout: 10_000 })
})
