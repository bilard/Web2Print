// e2e/smoke.spec.ts
// Parcours critiques contre les émulateurs Firebase (aucune donnée prod).
// Le compte de test utilise l'email owner → bypass RBAC, comme en réel.
import { test, expect, type Page } from '@playwright/test'

const OWNER_EMAIL = 'ibs.studio@gmail.com'
const FIRESTORE_REST = 'http://127.0.0.1:8080/v1/projects/web2print-6fe5a/databases/(default)/documents'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Neutralise les overlays à l'ouverture : tour guidé + wizard onboarding
    // (une fausse clé LLM locale satisfait hasAnyLlmKey()).
    localStorage.setItem('w2p:tour:seen', JSON.stringify({ dashboard: true, editor: true }))
    sessionStorage.setItem('w2p:onboarding_keys_dismissed', '1')
    localStorage.setItem('designstudio_apikey_gemini', 'e2e-fake-key')
  })
})

/** Connexion via le widget de l'émulateur Auth (création du compte au 1er run,
 *  réutilisation ensuite). */
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

  // ⚠️ Force le FRANÇAIS : tous les sélecteurs de ce fichier sont français
  // (« Bibliothèque », « Nouveau document », « sauvegarder »), or la langue est
  // persistée dans `users/{uid}.uiSettings.locale` et l'émulateur GARDE l'état
  // entre les suites — les passes visuelles i18n le laissent en anglais, et le
  // smoke échouait alors sur le premier clic sans que rien ne soit cassé dans
  // l'application. Passer par le store et non par localStorage : `useLocaleSync`
  // réhydrate depuis Firestore au login et écraserait la préférence locale.
  await page.evaluate(() => {
    const w = window as unknown as {
      __localeStore?: { getState: () => { setLocale: (l: string) => void } }
    }
    w.__localeStore?.getState().setLocale('fr')
  })
  await page.waitForTimeout(300)
}

test('connexion → dashboard avec la sidebar des modules', async ({ page }) => {
  await loginAsOwner(page)
  await expect(page.getByText('Bibliothèque').first()).toBeVisible()
  await expect(page.getByText('Nouveau document').first()).toBeVisible()
})

test('créer un document vierge → éditeur → sauvegarder → visible en bibliothèque', async ({ page }) => {
  page.on('pageerror', (err) => console.log('[browser:pageerror]', String(err).slice(0, 300)))
  await loginAsOwner(page)

  // Section « Nouveau document » → créer avec les réglages par défaut.
  await page.getByText('Nouveau document').first().click()
  await page.getByRole('button', { name: /créer le document/i }).click()

  // L'éditeur s'ouvre avec un canvas Fabric.
  await page.waitForURL(/\/editor\//, { timeout: 30_000 })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 })
  const projectId = page.url().match(/\/editor\/([^/?#]+)/)?.[1]
  expect(projectId).toBeTruthy()

  // Attendre la fin du chargement de l'éditeur : load() passe le statut à
  // « saved » (bouton émeraude) — avant ça, save() est bloqué par le flag
  // _loadingInProgress.
  await expect(page.getByRole('button', { name: /sauvegarder/i })).toHaveClass(/emerald/, { timeout: 30_000 })

  // Sauvegarder : le doc Firestore doit recevoir canvasData (vérifié via l'API
  // REST de l'émulateur, bypass règles) + un snapshot auto (ring buffer).
  await page.getByRole('button', { name: /sauvegarder/i }).click()
  await expect.poll(async () => {
    const res = await fetch(`${FIRESTORE_REST}/projects/${projectId}`, {
      headers: { Authorization: 'Bearer owner' },
    })
    if (!res.ok) return 'absent'
    const json = (await res.json()) as { fields?: { canvasData?: { stringValue?: string } } }
    return json.fields?.canvasData?.stringValue ? 'saved' : 'vide'
  }, { timeout: 20_000 }).toBe('saved')

  await expect.poll(async () => {
    const res = await fetch(`${FIRESTORE_REST}/projects/${projectId}/versions`, {
      headers: { Authorization: 'Bearer owner' },
    })
    if (!res.ok) return 0
    const json = (await res.json()) as { documents?: Array<{ name: string }> }
    return (json.documents ?? []).filter((d) => /\/auto-\d$/.test(d.name)).length
  }, { timeout: 20_000 }).toBeGreaterThan(0)

  // Retour dashboard → le document apparaît dans la bibliothèque.
  await page.goto('/dashboard')
  await expect(page.getByText('Bibliothèque').first()).toBeVisible()
  await expect(page.locator(`[href*="${projectId}"], [data-project-id="${projectId}"]`).first()
    .or(page.getByText('Sans titre').first())).toBeVisible({ timeout: 15_000 })
})
