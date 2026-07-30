// e2e/i18n-live-rerender.spec.ts
// Le vocabulaire d'un compte n'a d'intérêt que s'il apparaît SANS rechargement,
// partout — y compris dans les écrans dont la page racine ne s'abonne pas à la
// traduction (3 pages sur 12 le font). Ce test mesure exactement ça : il pose
// une surcharge dans le store et regarde si le mot change à l'écran.
//
// ⚠️ Ce que les tests unitaires ne peuvent PAS voir : `resolve()` lit bien la
// surcharge, mais un composant qui appelle le `t()` de module n'est abonné à
// rien. Seul un rendu réel dit si le re-rendu se propage jusqu'à lui.
import { test, expect, type Page } from '@playwright/test'

const OWNER_EMAIL = 'ibs.studio@gmail.com'

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
}

/**
 * Pose une surcharge comme le ferait l'édition live, sans passer par Firestore.
 *
 * On vise la couche de RENDU, pas la persistance (couverte par
 * i18n-vocabulary.spec.ts) : le store est exactement l'état dans lequel
 * l'écouteur temps réel place l'application quand un collègue renomme un mot.
 */
async function setOverride(page: Page, key: string, value: string): Promise<void> {
  await page.evaluate(
    ([k, v]) => {
      const w = window as unknown as {
        __i18nOverridesStore?: { getState: () => { setOverride: (l: string, k: string, v: string) => void } }
        __localeStore?: { getState: () => { locale: string } }
      }
      if (!w.__i18nOverridesStore || !w.__localeStore) throw new Error('stores non exposés')
      // ⚠️ La surcharge doit viser la langue RÉELLEMENT affichée : le compte de
      // test est en anglais (les passes visuelles l'y laissent), et une
      // surcharge posée sur `fr` ne se verrait nulle part — le test passerait
      // au rouge en accusant le rendu alors qu'il vise la mauvaise langue.
      w.__i18nOverridesStore.getState().setOverride(w.__localeStore.getState().locale, k, v)
    },
    [key, value],
  )
}

test('un libellé réécrit apparaît sans rechargement, hors page abonnée', async ({ page }) => {
  await loginAsOwner(page)

  // Le tableau de bord affiche le libellé d'origine…
  const original = page.getByText('Bienvenue', { exact: false }).first()
  const hadOriginal = await original.isVisible({ timeout: 5_000 }).catch(() => false)

  await setOverride(page, 'login.welcome', 'Vocabulaire maison')

  if (hadOriginal) {
    await expect(page.getByText('Vocabulaire maison').first()).toBeVisible({ timeout: 5_000 })
  }

  // …et surtout : un écran dont la page racine ne s'abonne PAS à la traduction.
  // C'est le cas qui casserait si le re-rendu ne partait pas de la racine.
  //
  // ⚠️ `TaxonomiesPage` et non `WorkflowsPage` : cette dernière appelle
  // `useTranslation()`, elle se re-rend donc toute seule et le test passerait
  // même sans le correctif — vérifié en retirant l'abonnement racine. Taxonomies
  // importe le `t()` de MODULE et n'est abonnée à rien — pas plus que
  // TaxonomySidebar / TaxonomyEmptyState, qui rendent la clé témoin.
  await page.goto('/taxonomies')
  await page.waitForTimeout(2000)
  const target = 'tx.none'
  const before = await page.evaluate(() => document.body.innerText)
  await setOverride(page, target, 'ZZZ-VOCABULAIRE-TEST')
  await page.waitForTimeout(800)
  const after = await page.evaluate(() => document.body.innerText)

  expect(before, 'le libellé témoin doit être absent avant la surcharge').not.toContain(
    'ZZZ-VOCABULAIRE-TEST',
  )
  expect(after, 'le mot réécrit doit apparaître SANS rechargement').toContain(
    'ZZZ-VOCABULAIRE-TEST',
  )
})
