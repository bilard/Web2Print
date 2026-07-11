// src/features/demo-express/useDemoExpress.ts
// Orchestrateur de la « Démo express » : depuis le site d'un prospect, ensemence
// tout le studio — charte (analyse d'inspiration), produits (crawl + moteur
// d'enrichissement PIM), images (DAM Drive), feuille PIM persistée, catalogue
// piloté par la charte + couverture IA, fiche promo et workflow nommé.
// Chaque étape est tolérante : un échec la marque en erreur/avertissement et la
// suite continue avec ce qui a réussi. L'abandon est testé ENTRE les items.
import { useCallback } from 'react'
import { toast } from 'sonner'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, storage } from '@/lib/firebase/config'
import { useJina } from '@/features/scraping/useJina'
import { enrichRow } from '@/features/excel/ai-enrichment/enrichRow'
import { analyzeInspirationUrl } from '@/features/catalog/charte/inspiration'
import { EMPTY_CHARTE, charteToThemePatch } from '@/features/catalog/charte/extractCharte'
import { uploadUrlToDam, damSlug } from '@/features/dam/uploadImageToDam'
import { useExcelFirebase } from '@/features/excel/useExcelFirebase'
import { useExcelStore } from '@/stores/excel.store'
import { makeExcelSourceRef } from '@/features/merge/excelSource'
import { newCatalogDoc, saveCatalog } from '@/features/catalog/catalogsApi'
import { buildCatalogTree, flattenTree, guessLevelKeys } from '@/features/catalog/catalogTree'
import { generateCatalogPlan, defaultCatalogPlan } from '@/features/catalog/catalogPlan'
import { pagePx } from '@/features/catalog/components/pages/catalogCss'
import { generateImageBase64 } from '@/features/nanobana/generateImageBase64'
import { defaultPromoFieldMap, defaultCustomFields } from '@/features/retail-promo/promoMapping'
import { savePromo } from '@/features/retail-promo/promosApi'
import { DEFAULT_PROMO_CONFIG, type PromoTemplateConfig } from '@/features/retail-promo/RetailPromoCard'
import { saveWorkflow } from '@/features/workflows/persistence/workflowsApi'
import { useDemoExpressStore } from '@/stores/demoExpress.store'
import type { CatalogCharte, CatalogDoc } from '@/features/catalog/catalogTypes'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import { buildDemoSheet, sheetToMerge, DEMO_TARGET_FIELDS, type DemoProduct } from './buildDemoSheet'
import { buildDemoWorkflow } from './demoWorkflow'
import { discoverCategories, categoriesFromHtml, productLinksFromListingHtml } from './discoverFromHome'

/** Volumétries proposées par le wizard (48 max : sous le quota démo PIM de 50). */
export const DEMO_VOLUMES = [6, 12, 24, 48] as const
const DEFAULT_MAX_PRODUCTS = 12 // temps de démo raisonnable
const MAX_BD_CATEGORY_TRIES = 5 // rayons via Bright Data (payant) — borne de coût

/** Plafonds dérivés de la volumétrie choisie. */
function volumePlan(maxProducts: number) {
  // Échantillon par rayon : produits répartis sur la taxonomie (2 à 8/rayon).
  const perCategory = Math.min(8, Math.max(2, Math.round(maxProducts / 4)))
  return {
    maxProducts,
    perCategory,
    // Assez de rayons pour atteindre la cible, borné (temps de démo).
    categoryTries: Math.min(16, Math.max(8, Math.ceil(maxProducts / perCategory) + 2)),
    // 1 image/produit ; le quota démo DAM (20) est de toute façon appliqué serveur.
    damUploads: maxProducts,
  }
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : 'erreur inconnue')

/** Upload DAM des images produit (1 par produit, plafonné) — mute `items`.
 *  Renvoie aussi la PREMIÈRE cause d'échec : sans elle, un « aucun upload »
 *  masquait la vraie raison (ex. Google non connecté pour l'accès serveur). */
async function seedDam(
  items: DemoProduct[], company: string, aborted: () => boolean, maxUploads: number,
): Promise<{ uploaded: number; firstError: string | null }> {
  let uploaded = 0
  let firstError: string | null = null
  for (const it of items) {
    if (aborted() || uploaded >= maxUploads) break
    const img = it.assets.find((a) => a.type === 'image')?.url
    if (!img) continue
    try {
      const name = String(it.fields.name ?? 'produit')
      it.damLink = await uploadUrlToDam(img, `${damSlug(name)}.jpg`, `Démo ${company}`)
      uploaded++
    } catch (e) {
      const msg = errMsg(e)
      firstError ??= msg
      // Quota démo DAM atteint OU Google non connecté : inutile d'insister,
      // toutes les tentatives suivantes échoueraient pareil. Les cellules
      // gardent l'URL externe (DamImage l'affiche aussi).
      if (msg.includes('resource-exhausted') || /google non connect/i.test(msg)) break
    }
  }
  return { uploaded, firstError }
}

/** Catalogue piloté par la charte : source liée, plan IA (repli déterministe), couverture IA. */
async function seedCatalog(input: {
  company: string
  charte: CatalogCharte
  docId: string
  fileName: string
  columns: MergeColumn[]
  rows: MergeRow[]
  onDetail: (d: string) => void
}): Promise<string> {
  const { company, charte, docId, fileName, columns, rows, onDetail } = input
  const name = `Démo ${company}`
  const levelKeys = guessLevelKeys(columns)
  const tree = buildCatalogTree(rows, columns, levelKeys)
  const nameOf = new Map(rows.map((r) => [r._id, String(r.name ?? '')]))
  const sampleNames: Record<string, string[]> = {}
  for (const n of flattenTree(tree)) {
    sampleNames[n.id] = n.productIds.slice(0, 3).map((id) => `${id} — ${nameOf.get(id) ?? ''}`)
  }
  const brief = `Catalogue de démonstration pour ${company}, fidèle à la charte graphique de son site (palette et consignes jointes).`

  onDetail('plan IA en cours…')
  let plan
  try {
    plan = await generateCatalogPlan(brief, { catalogName: name, tree, sampleNames, charte })
  } catch {
    plan = defaultCatalogPlan(tree, name)
  }

  const fieldMap = defaultPromoFieldMap(columns)
  const doc: CatalogDoc = {
    ...newCatalogDoc(name),
    sourceRef: makeExcelSourceRef(docId, 0, fileName),
    selectedRowIds: rows.map((r) => r._id),
    levelKeys,
    prompt: brief,
    plan,
    fieldMap,
    customFields: defaultCustomFields(columns, fieldMap),
    charte,
  }
  const catalogId = await saveCatalog(doc)

  // Couverture Nano Banana — facultative : le catalogue reste valable sans.
  const coverPrompt = plan.cover.imagePrompt?.trim()
  if (coverPrompt) {
    try {
      onDetail('couverture IA en cours…')
      const uid = auth.currentUser?.uid
      if (!uid) throw new Error('non connecté')
      const { w, h } = pagePx(doc.format)
      const { mimeType, base64 } = await generateImageBase64({ prompt: coverPrompt, targetWidth: w, targetHeight: h })
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const ext = mimeType === 'image/png' ? 'png' : 'jpg'
      const fileRef = storageRef(storage, `users/${uid}/catalogCovers/${Date.now()}_demo.${ext}`)
      await uploadBytes(fileRef, new Blob([bytes], { type: mimeType }), { contentType: mimeType })
      const coverImageUrl = await getDownloadURL(fileRef)
      await saveCatalog({ ...doc, id: catalogId, coverImageUrl })
    } catch {
      // couverture typographique conservée
    }
  }
  return catalogId
}

/** Fiche promo aux couleurs de la charte, sur l'instantané complet des produits. */
async function seedPromo(input: {
  company: string
  charte: CatalogCharte
  docId: string
  fileName: string
  columns: MergeColumn[]
  rows: MergeRow[]
}): Promise<string> {
  const { company, charte, docId, fileName, columns, rows } = input
  const patch = charteToThemePatch(charte)
  const config: PromoTemplateConfig = {
    ...DEFAULT_PROMO_CONFIG,
    accent: patch.accent ?? DEFAULT_PROMO_CONFIG.accent,
    headerBg: patch.headerBg ?? DEFAULT_PROMO_CONFIG.headerBg,
  }
  const fieldMap = defaultPromoFieldMap(columns)
  return savePromo({
    name: `Démo ${company}`,
    sourceRef: makeExcelSourceRef(docId, 0, fileName),
    fieldMap,
    customFields: defaultCustomFields(columns, fieldMap),
    config,
    columns,
    rows,
  })
}

export function useDemoExpress() {
  const { discover } = useJina()
  const { saveToFirebase } = useExcelFirebase()

  const run = useCallback(async (company: string, url: string, opts?: { maxProducts?: number }) => {
    const uid = auth.currentUser?.uid
    if (!uid) { toast.error('Connexion requise'); return }
    const vol = volumePlan(opts?.maxProducts ?? DEFAULT_MAX_PRODUCTS)
    const s = useDemoExpressStore.getState()
    s.begin(company, url)
    const step = (id: Parameters<typeof s.updateStep>[0], patch: Parameters<typeof s.updateStep>[1]) =>
      useDemoExpressStore.getState().updateStep(id, patch)
    const aborted = () => useDemoExpressStore.getState().abortRequested
    const finish = () => useDemoExpressStore.getState().finish()

    // 1) Charte graphique depuis le site
    step('charte', { status: 'running' })
    let charte: CatalogCharte = EMPTY_CHARTE
    try {
      charte = await analyzeInspirationUrl(url, EMPTY_CHARTE)
      step('charte', { status: 'done', detail: `${charte.colors.length} couleurs extraites` })
    } catch (e) {
      step('charte', { status: 'warning', detail: `charte par défaut (${errMsg(e)})` })
    }

    // 2) Découverte des produits — URL DE BASE : si la page est un « hub »
    // (accueil = menu sans cartes produit), descente automatique dans les
    // rubriques du menu, quelques produits par rayon (taxonomie couverte).
    step('discover', { status: 'running' })
    let productPages: { url: string; title: string }[] = []
    let homeHtmlBd: string | null = null
    const pushUnique = (pages: { url: string; title: string }[]) => {
      for (const p of pages) {
        if (productPages.length >= vol.maxProducts) break
        if (!productPages.some((x) => x.url === p.url)) productPages.push(p)
      }
    }
    try {
      const first = await discover(url, { limit: vol.maxProducts })
      productPages = [...first.pages]
      if (!productPages.length) {
        step('discover', { status: 'running', detail: 'page d’accueil sans fiches — descente dans les rayons…' })
        const categories = await discoverCategories(url)
        let tries = 0
        for (const cat of categories) {
          if (aborted() || productPages.length >= vol.maxProducts || tries >= vol.categoryTries) break
          tries++
          step('discover', { status: 'running', detail: `rayon ${tries}/${Math.min(categories.length, vol.categoryTries)} — ${new URL(cat).pathname}` })
          const r = await discover(cat, { limit: vol.perCategory })
          pushUnique(r.pages)
        }
      }
      // Étage anti-bot (cas DataDome/Akamai : CF et Jina ne voient qu'une
      // coquille vide) → escalade Bright Data sur la home puis les rayons.
      if (!productPages.length && !aborted()) {
        step('discover', { status: 'running', detail: 'anti-bot détecté — escalade Bright Data…' })
        const { brightDataScrapeHtml, markHostBlocked } =
          await import('@/features/scraping/core/brightDataFallback')
        // Les enrichissements suivants sauteront directement à Bright Data.
        markHostBlocked(url)
        homeHtmlBd = await brightDataScrapeHtml(url)
        if (homeHtmlBd) {
          // Produits en vitrine sur la home (JSON-LD/dataLayer seulement —
          // les ancres à image d'une home sont des bannières, pas des fiches).
          pushUnique(await productLinksFromListingHtml(homeHtmlBd, url, vol.maxProducts, { anchorFallback: false }))
          const cats = categoriesFromHtml(homeHtmlBd, url)
          let tries = 0
          for (const cat of cats) {
            if (aborted() || productPages.length >= vol.maxProducts || tries >= MAX_BD_CATEGORY_TRIES) break
            tries++
            step('discover', { status: 'running', detail: `Bright Data — rayon ${tries}/${Math.min(cats.length, MAX_BD_CATEGORY_TRIES)} — ${new URL(cat).pathname}` })
            const catHtml = await brightDataScrapeHtml(cat)
            if (!catHtml) continue
            pushUnique(await productLinksFromListingHtml(catHtml, cat, vol.perCategory, { anchorFallback: true }))
          }
        }
      }
      if (!productPages.length) {
        // Cause précise de l'échec Bright Data (compte suspendu, solde, token…)
        // plutôt qu'un « vérifier le connecteur » générique.
        const bdError = homeHtmlBd === null
          ? (await import('@/features/scraping/core/brightDataFallback')).getLastBrightDataError()
          : null
        step('discover', {
          status: 'error',
          detail: bdError
            ? `site protégé anti-bot — Bright Data : ${bdError.message}`
            : homeHtmlBd === null
              ? (first.error || 'site protégé anti-bot — vérifier le connecteur Bright Data (Scraping Hub)')
              : 'site protégé anti-bot — aucune fiche extraite même via Bright Data',
        })
      } else {
        step('discover', { status: 'done', detail: `${productPages.length} produits repérés sur le site` })
      }
    } catch (e) {
      step('discover', { status: 'error', detail: errMsg(e) })
    }

    // Seconde chance charte : le HTML Bright Data de la home porte souvent
    // l'og:image que l'analyse directe n'a pas pu voir (challenge anti-bot).
    if (!charte.colors.length && homeHtmlBd) {
      try {
        const og = new DOMParser().parseFromString(homeHtmlBd, 'text/html')
          .querySelector('meta[property="og:image"], meta[property="og:image:url"], meta[name="twitter:image"]')
          ?.getAttribute('content')
        if (og && /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(og)) {
          charte = await analyzeInspirationUrl(new URL(og, url).href, EMPTY_CHARTE)
          step('charte', { status: 'done', detail: `${charte.colors.length} couleurs (og:image via Bright Data)` })
        }
      } catch { /* la charte par défaut reste */ }
    }
    if (!productPages.length) {
      // Sans produits, rien à ensemencer — on marque le reste comme sauté.
      for (const id of ['enrich', 'dam', 'sheet', 'catalog', 'promo', 'workflow'] as const) step(id, { status: 'skipped' })
      finish()
      return
    }

    // 3) Enrichissement séquentiel (moteur PIM partagé)
    step('enrich', { status: 'running' })
    const items: DemoProduct[] = []
    for (let i = 0; i < productPages.length; i++) {
      if (aborted()) break
      const p = productPages[i]
      step('enrich', { status: 'running', detail: `${i + 1}/${productPages.length} — ${p.title}` })
      try {
        const { fields, assets } = await enrichRow({ url: p.url, targetFields: [...DEMO_TARGET_FIELDS] })
        if (fields.name || fields.description || assets.length) items.push({ url: p.url, fields, assets })
      } catch {
        // fiche irrécupérable : on passe à la suivante
      }
    }
    if (!items.length) {
      step('enrich', { status: 'error', detail: 'aucune fiche exploitable (site anti-bot ?)' })
      for (const id of ['dam', 'sheet', 'catalog', 'promo', 'workflow'] as const) step(id, { status: 'skipped' })
      finish()
      return
    }
    step('enrich', { status: 'done', detail: `${items.length} fiches enrichies` })

    // 4) Images → DAM Drive (1 par produit, quota démo respecté)
    step('dam', { status: 'running' })
    const { uploaded: damCount, firstError: damError } = await seedDam(items, company, aborted, vol.damUploads)
    step('dam', damCount > 0
      ? { status: 'done', detail: `${damCount} image(s) dans le Drive DAM` }
      : { status: 'warning', detail: damError ?? 'aucune image exploitable (les cellules gardent les URLs externes)' })

    // 5) Feuille PIM — base Firestore DÉDIÉE (jamais d'écrasement de l'existant)
    step('sheet', { status: 'running' })
    const sheet = buildDemoSheet(company, url, items)
    const fileName = `Démo ${company}`
    let docId: string | null = null
    try {
      docId = await saveToFirebase(fileName, [sheet], [], null)
      if (!docId) throw new Error('sauvegarde refusée')
      const ex = useExcelStore.getState()
      if (ex.sheets.length === 0) {
        // Studio vierge (cas nominal du compte démo) : on charge la base à l'écran.
        ex.setSheets([sheet])
        ex.setCurrentDocId(docId)
        ex.setCurrentFileName(fileName)
        ex.setCurrentPath([])
      }
      useDemoExpressStore.getState().setLinks({ sheetDocId: docId, sheetName: fileName, productCount: items.length, damCount })
      step('sheet', { status: 'done', detail: `${items.length} produits — « ${fileName} »` })
    } catch (e) {
      step('sheet', { status: 'error', detail: errMsg(e) })
      for (const id of ['catalog', 'promo', 'workflow'] as const) step(id, { status: 'skipped' })
      finish()
      return
    }

    const { columns, rows } = sheetToMerge(sheet)

    // 6) Catalogue studio (charte + plan IA + couverture)
    step('catalog', { status: 'running' })
    try {
      const catalogId = await seedCatalog({
        company, charte, docId, fileName, columns, rows,
        onDetail: (d) => step('catalog', { status: 'running', detail: d }),
      })
      useDemoExpressStore.getState().setLinks({ catalogId })
      step('catalog', { status: 'done', detail: 'catalogue prêt (source liée + charte appliquée)' })
    } catch (e) {
      step('catalog', { status: 'error', detail: errMsg(e) })
    }

    // 7) Fiche promo retail
    step('promo', { status: 'running' })
    try {
      const promoId = await seedPromo({ company, charte, docId, fileName, columns, rows })
      useDemoExpressStore.getState().setLinks({ promoId })
      step('promo', { status: 'done', detail: 'fiche promo aux couleurs du site' })
    } catch (e) {
      step('promo', { status: 'error', detail: errMsg(e) })
    }

    // 8) Workflow « Démo {Société} »
    step('workflow', { status: 'running' })
    try {
      const wf = buildDemoWorkflow(company, items.map((it) => it.url), uid)
      await saveWorkflow(uid, wf)
      useDemoExpressStore.getState().setLinks({ workflowId: wf.id })
      step('workflow', { status: 'done', detail: `« ${wf.name} » ajouté à ses workflows` })
    } catch (e) {
      step('workflow', { status: 'error', detail: errMsg(e) })
    }

    finish()
  }, [discover, saveToFirebase])

  return { run }
}
