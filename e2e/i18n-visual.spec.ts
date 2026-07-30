// e2e/i18n-visual.spec.ts
// PASSE DE VÉRIFICATION VISUELLE du chantier i18n, contre les émulateurs.
//
// Pourquoi ce fichier existe : `tsc`, le lint et les garde-fous de catalogue
// n'ont JAMAIS vu un écran. Sur ce chantier, tous les défauts coûteux (mojibake
// parti en prod, libellé collé à une icône, `title="{t('…')}"` affiché tel quel)
// ont été trouvés à l'œil, pas par un test. Ce scénario automatise ce regard :
//
//  1. il parcourt les écrans principaux en ANGLAIS et relève tout texte VISIBLE
//     qui ressemble encore à du français ;
//  2. il refait le tour en FRANÇAIS et cherche le mojibake — invisible en
//     anglais, puisqu'il ne touche que les accents ;
//  3. il capture chaque écran dans les deux langues (artefacts Playwright).
//
// ⚠️ Le relevé est un RAPPORT, pas une assertion binaire : le texte de
// l'utilisateur (noms de projets, de taxonomies, données PIM) est légitimement
// français dans les deux langues. Seule la lecture du rapport tranche.
import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

/**
 * Langues du sélecteur — recopiées de `stores/locale.store`, PAS importées :
 * aucun autre scénario ne charge de code applicatif, et le faire ferait dépendre
 * le harnais de la résolution des alias `@/` côté Playwright.
 */
const ALL_LOCALES = ['fr', 'en', 'es', 'de', 'it'] as const
type Locale = (typeof ALL_LOCALES)[number]

const OWNER_EMAIL = 'ibs.studio@gmail.com'
const OUT = 'e2e-i18n-report'

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
}

/**
 * Bascule la langue COMME UN UTILISATEUR : en cliquant la pastille FR|EN.
 *
 * ⚠️ Écrire `localStorage.localePref` ne suffit pas — `useLocaleSync` réhydrate
 * depuis `users/{uid}.uiSettings.locale` au login (leçon du lot 14). Deux
 * variantes coexistent : le groupe FR|EN complet (boutons `aria-pressed`) et la
 * pastille COMPACTE de la sidebar repliée, qui affiche la langue ACTIVE et
 * bascule au clic — d'où la vérification après coup plutôt qu'un clic aveugle.
 */
async function setLocale(page: Page, locale: Locale): Promise<void> {
  const current = async () =>
    page.evaluate(() => localStorage.getItem('localePref') ?? 'fr')
  // Déjà dans la bonne langue : rien à cliquer. Ce court-circuit vient AVANT
  // l'attente de la sidebar — certains modules (chat, accès) n'en affichent pas,
  // et attendre là bloquait tout le parcours.
  if ((await current()) === locale) return
  // La sidebar porte la pastille : sans cette attente on clique dans un écran
  // encore en spinner (le premier run a échoué exactement là).
  await page.locator('[data-tour="sidebar"]').first()
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => {})

  // Groupe complet : le bouton de la langue voulue est là, un clic suffit.
  const direct = page.locator(`button:text-is("${locale.toUpperCase()}")`).first()
  if (await direct.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await direct.click({ timeout: 5_000 }).catch(() => {})
    await page.waitForTimeout(500)
    if ((await current()) === locale) return
  }

  // Sidebar repliée : une seule pastille, qui fait DÉFILER les langues activées.
  // ⚠️ Depuis l'ajout de l'espagnol, elles sont trois : cliquer une fois ne
  // garantit plus d'arriver sur la bonne — il faut boucler jusqu'à retomber
  // dessus, sans dépasser un tour complet.
  for (let i = 0; i < ALL_LOCALES.length; i += 1) {
    const active = (await current()).toUpperCase()
    const pill = page.locator(`button:text-is("${active}")`).first()
    if (!(await pill.isVisible({ timeout: 1_500 }).catch(() => false))) break
    await pill.click({ timeout: 5_000 }).catch(() => {})
    await page.waitForTimeout(500)
    if ((await current()) === locale) return
  }
  throw new Error(`bascule de langue introuvable pour « ${locale} »`)
}

/** Texte VISIBLE de la page, nœud par nœud (le DOM caché ne trompe personne). */
async function visibleTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let n: Node | null
    while ((n = walker.nextNode())) {
      const txt = (n.textContent ?? '').trim()
      if (!txt || txt.length < 3) continue
      const el = n.parentElement
      if (!el) continue
      const st = getComputedStyle(el)
      if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      out.push(txt)
    }
    // Les attributs affichés au survol comptent aussi : un `title` français dans
    // une UI anglaise est exactement le défaut qu'on traque.
    document.querySelectorAll('[title],[aria-label],[placeholder]').forEach((el) => {
      for (const a of ['title', 'aria-label', 'placeholder']) {
        const v = el.getAttribute(a)
        if (v && v.trim().length > 2) out.push(`[${a}] ${v.trim()}`)
      }
    })
    return out
  })
}

/** Mots français fréquents dans l'interface — communs aux deux relevés. */
const FRENCH_WORDS =
  'le|la|les|des|une|aucun|aucune|dans|pour|avec|vous|votre|sur|est|sont|par|selon|puis|tous|toutes|origine|paysage|corbeille|suivis|fournisseurs|utilisateurs|journal|galerie|enregistrer|supprimer|ajouter|modifier|nouveau|nouvelle|rechercher|parcourir|fermer|ouvrir|annuler|valider|suivant|precedent|terminer|champs|colonne|fichier|dossier|taille|largeur|hauteur|couleur|police|ombre|calques|remise|apercu|reglages|analyser|importer|exporter|creer|charger|essayer|revenir'

/** Signature de français : accent OU mot-outil français fréquent. */
const FRENCH = new RegExp(`[àâäéèêëîïôöùûüÿçÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ]|\\b(${FRENCH_WORDS})\\b`, 'i')

/**
 * Même relevé pour l'ESPAGNOL, mais SANS les accents partagés.
 *
 * ⚠️ `é`, `ó`, `í`, `ü` sont parfaitement espagnols (« También », « Diseño ») :
 * les garder ferait crier le rapport sur chaque écran correctement traduit, et
 * un rapport qui crie partout ne se lit plus. On ne retient donc que les signes
 * SANS existence en espagnol — plus les mots-outils, qui suffisent à repérer un
 * bloc resté en français.
 */
const FRENCH_IN_ES = new RegExp(`[àâäèêëîïôùûÿçÀÂÄÈÊËÎÏÔÙÛŸÇœŒ]|\\b(${FRENCH_WORDS})\\b`, 'i')
/** Mojibake : UTF-8 relu en latin-1. */
const MOJIBAKE = /Ã[-¿]|Â[«»·°]|â€[-¿]/

/**
 * ⚠️ Les modules ne sont PAS des routes : ce sont des `section` rendues DANS le
 * dashboard (cf. `features/navigation/modules.ts`). On les ouvre par le
 * deep-link `?section=…`, exactement comme le menu de modules.
 */
const SECTIONS = [
  'library', 'blank', 'import', 'images', 'data', 'taxonomies',
  'scraping-templates', 'scraping-hub', 'price-watch', 'demo-express',
  'retail-promo', 'catalog', 'hyperframes', 'workflows', 'chat', 'telegram',
  'mfr-insights', 'access',
] as const

const SCREENS: { name: string; go: (p: Page) => Promise<void> }[] = [
  ...SECTIONS.map((s) => ({
    name: s,
    go: async (p: Page) => { await p.goto(`/dashboard?section=${s}`); await p.waitForTimeout(1400) },
  })),
  { name: 'route-workflows', go: async (p) => { await p.goto('/workflows'); await p.waitForTimeout(1200) } },
  { name: 'route-taxonomies', go: async (p) => { await p.goto('/taxonomies'); await p.waitForTimeout(1200) } },
  { name: 'route-scraping-templates', go: async (p) => { await p.goto('/scraping-templates'); await p.waitForTimeout(1200) } },
  { name: 'route-data', go: async (p) => { await p.goto('/data'); await p.waitForTimeout(1500) } },
]

test('parcours i18n : langues traduites sans français résiduel, français sans mojibake', async ({ page }) => {
  // 3 langues × 22 écrans : le timeout de 90 s du harnais ne suffit pas.
  test.setTimeout(25 * 60_000)
  mkdirSync(OUT, { recursive: true })
  await loginAsOwner(page)

  const report: string[] = []

  for (const locale of ['en', 'es', 'fr'] as const) {
    // On revient au dashboard AVANT de basculer : la pastille de langue n'existe
    // que dans sa sidebar, et le parcours précédent s'est terminé ailleurs.
    await page.goto('/dashboard')
    await setLocale(page, locale)
    for (const s of SCREENS) {
      await s.go(page)
      await setLocale(page, locale) // la navigation remonte le store, on re-force
      await page.waitForTimeout(600)
      await page.screenshot({ path: `${OUT}/${locale}-${s.name}.png`, fullPage: false })
      const texts = await visibleTexts(page)
      // En français, on ne cherche pas du français : on cherche le mojibake, que
      // seule cette langue peut montrer (il ne touche que les accents).
      const rx = locale === 'fr' ? MOJIBAKE : locale === 'es' ? FRENCH_IN_ES : FRENCH
      const hits = [...new Set(texts.filter((t) => rx.test(t)))]
      if (hits.length) {
        report.push(`\n### ${locale.toUpperCase()} · ${s.name} (${hits.length})`)
        hits.forEach((h) => report.push(`  ${h.slice(0, 160)}`))
      }
    }
  }

  writeFileSync(`${OUT}/rapport.md`, report.join('\n') || 'Aucun relevé.', 'utf8')
  console.log(report.join('\n') || 'Aucun relevé.')

  // Le MOJIBAKE, lui, n'a aucune excuse : c'est une assertion dure.
  const mojibake = report.filter((l) => MOJIBAKE.test(l))
  expect(mojibake, `mojibake à l'écran :\n${mojibake.join('\n')}`).toEqual([])
})
