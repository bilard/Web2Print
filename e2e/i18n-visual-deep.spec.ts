// e2e/i18n-visual-deep.spec.ts
// PASSE VISUELLE PROFONDE : les surfaces que `i18n-visual.spec.ts` ne peut pas
// atteindre par une simple URL — l'éditeur avec un objet SÉLECTIONNÉ (sans quoi
// les panneaux de propriétés ne se rendent pas du tout), l'éditeur de workflow,
// le wizard catalogue, et les MODALES, qui ne s'ouvrent qu'au clic.
//
// C'est là que les défauts se cachent : un panneau qui ne se monte jamais dans
// un test d'URL n'est jamais lu par personne avant la production.
import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const OWNER_EMAIL = 'ibs.studio@gmail.com'
const OUT = 'e2e-i18n-report'

/** Signature de français : accent OU mot-outil français fréquent. */
const FRENCH = /[àâäéèêëîïôöùûüÿçÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ]|\b(le|la|les|des|une|aucun|aucune|dans|pour|avec|vous|votre|sur|est|sont|par|selon|puis|tous|toutes|choisis|choisissez|cliquer|cliquez|glisser|glissez)\b/i

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('w2p:tour:seen', JSON.stringify({ dashboard: true, editor: true, workflow: true }))
    sessionStorage.setItem('w2p:onboarding_keys_dismissed', '1')
    localStorage.setItem('designstudio_apikey_gemini', 'e2e-fake-key')
    // La passe se fait EN ANGLAIS : on pose la préférence avant le premier rendu
    // pour que même les constantes de module (si l'une revenait) soient prises
    // dans la bonne langue — le but est de lire l'écran, pas de tester le store.
    localStorage.setItem('localePref', 'en')
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

/** Texte VISIBLE + attributs affichés au survol. */
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
    document.querySelectorAll('[title],[aria-label],[placeholder]').forEach((el) => {
      for (const a of ['title', 'aria-label', 'placeholder']) {
        const v = el.getAttribute(a)
        if (v && v.trim().length > 2) out.push(`[${a}] ${v.trim()}`)
      }
    })
    return out
  })
}

const report: string[] = []

/** ⚠️ Écrit à CHAQUE écran : un blocage plus loin ne doit pas perdre le relevé. */
function flush(): void {
  writeFileSync(`${OUT}/rapport-profond.md`, report.join('\n') || 'Aucun relevé.', 'utf8')
}

async function snap(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/deep-${name}.png` })
  const hits = [...new Set((await visibleTexts(page)).filter((t) => FRENCH.test(t)))]
    // La pastille de langue affiche l'ENDONYME de la langue cible : « Français »
    // dans une UI anglaise est correct (convention des sélecteurs de langue).
    .filter((t) => !/Language — Français/.test(t))
  if (hits.length) {
    report.push(`\n### ${name} (${hits.length})`)
    hits.forEach((h) => report.push(`  ${h.slice(0, 170)}`))
  }
  flush()
}

/**
 * Déplie un panneau du stack droit en cliquant SON EN-TÊTE, comme un humain :
 * le store n'est pas exposé au `window`, et c'est très bien ainsi.
 * Les titres sont ceux du catalogue EN (la passe tourne en anglais).
 */
const PANEL_TITLES: Record<string, RegExp> = {
  page: /^Page$/, print: /^Print$/, data: /^Data$/, layers: /^Layers$/,
  images: /^Images$/, palette: /^Palette$/, assets: /^Assets$/,
  animation3d: /^Animate the object$/, versions: /^Versions$/,
}

async function openPanel(page: Page, id: string): Promise<void> {
  const head = page.getByText(PANEL_TITLES[id], { exact: false }).first()
  if (await head.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await head.click({ timeout: 4_000 }).catch(() => {})
  }
  await page.waitForTimeout(700)
}

test('éditeur : panneaux et modales', async ({ page }) => {
  test.setTimeout(8 * 60_000)
  mkdirSync(OUT, { recursive: true })
  await loginAsOwner(page)

  // ── 1. ÉDITEUR ────────────────────────────────────────────────────────────
  await page.goto('/dashboard?section=blank')
  await page.waitForTimeout(1200)
  await snap(page, 'new-document')
  const createBtn = page.getByRole('button', { name: /create the document|créer le document/i }).first()
  await createBtn.click()
  await page.waitForURL(/\/editor\//, { timeout: 40_000 })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 40_000 })
  await page.waitForTimeout(2500)
  await snap(page, 'editor-empty')

  // Un objet SÉLECTIONNÉ : sans lui, le panneau Propriétés reste vide et la
  // moitié de l'éditeur n'est jamais rendue (leçon du lot 5).
  // ⚠️ On dessine avec une VRAIE souris (Playwright émet des événements de
  // confiance) : un geste synthétique en JS contourne `findTarget` de Fabric et
  // ne sélectionnerait rien — piège documenté du projet.
  const shapeTool = page.locator('[data-help-id="toolbar.rect"]').first()
  if (await shapeTool.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await shapeTool.click().catch(() => {})
    await page.waitForTimeout(400)
    const box = await page.locator('canvas').first().boundingBox()
    if (box) {
      await page.mouse.move(box.x + 200, box.y + 160)
      await page.mouse.down()
      await page.mouse.move(box.x + 380, box.y + 300, { steps: 12 })
      await page.mouse.up()
      await page.waitForTimeout(900)
    }
  }
  await snap(page, 'editor-selected')

  for (const panel of ['page', 'print', 'data', 'layers', 'images', 'palette', 'assets', 'animation3d', 'versions']) {
    await openPanel(page, panel)
    await snap(page, `editor-panel-${panel}`)
  }

  // Modales de l'éditeur : export, vidéo IA.
  for (const [name, rx] of [['export', /export/i], ['video', /video|vidéo/i]] as const) {
    const btn = page.locator(`[data-tour="${name === 'video' ? 'video-ai' : 'export'}"]`).first()
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {})
      await page.waitForTimeout(900)
      await snap(page, `editor-modal-${name}`)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    } else { void rx }
  }

})

test('workflow, catalogue et modales du tableau de bord', async ({ page }) => {
  test.setTimeout(8 * 60_000)
  mkdirSync(OUT, { recursive: true })
  await loginAsOwner(page)

  // ── 2. ÉDITEUR DE WORKFLOW ────────────────────────────────────────────────
  await page.goto('/workflows')
  await page.waitForTimeout(1500)
  await snap(page, 'workflows-list')
  const newWf = page.getByRole('button', { name: /new workflow|nouveau workflow/i }).first()
  if (await newWf.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await newWf.click().catch(() => {})
    await page.waitForURL(/\/workflows\/[^/]+$/, { timeout: 30_000 }).catch(() => {})
    await page.waitForTimeout(2500)
    await snap(page, 'workflow-editor')
    // Poser un node depuis la palette → son panneau de config s'ouvre.
    const firstNode = page.locator('[data-node-type], [draggable="true"]').first()
    if (await firstNode.isVisible().catch(() => false)) {
      await firstNode.click().catch(() => {})
      await page.waitForTimeout(1500)
      await snap(page, 'workflow-node-config')
    }
  }

  // ── 3. WIZARD CATALOGUE ───────────────────────────────────────────────────
  await page.goto('/dashboard?section=catalog')
  await page.waitForTimeout(1500)
  await snap(page, 'catalog-home')

  // ── 4. MODALES DU TABLEAU DE BORD ─────────────────────────────────────────
  for (const [section, label] of [
    ['import', /excel|csv/i],
    ['data', /import/i],
    ['images', /generate|générer/i],
  ] as const) {
    await page.goto(`/dashboard?section=${section}`)
    await page.waitForTimeout(1500)
    const btn = page.getByRole('button', { name: label }).first()
    if (await btn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await btn.click().catch(() => {})
      await page.waitForTimeout(1500)
      await snap(page, `modal-${section}`)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
    }
  }

  flush()
  console.log(report.join('\n') || 'Aucun relevé.')
})
