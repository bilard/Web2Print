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
import { discoverCategories } from './discoverFromHome'

const MAX_PRODUCTS = 12 // temps de démo raisonnable, sous le quota démo PIM (50)
const MAX_DAM_UPLOADS = 18 // sous le quota démo DAM (20)
const MAX_CATEGORY_TRIES = 8 // rayons explorés au plus lors de la descente depuis la home
const PRODUCTS_PER_CATEGORY = 4 // échantillon par rayon → produits répartis sur la taxonomie

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : 'erreur inconnue')

/** Upload DAM des images produit (1 par produit, plafonné) — mute `items`. */
async function seedDam(items: DemoProduct[], company: string, aborted: () => boolean): Promise<number> {
  let uploaded = 0
  for (const it of items) {
    if (aborted() || uploaded >= MAX_DAM_UPLOADS) break
    const img = it.assets.find((a) => a.type === 'image')?.url
    if (!img) continue
    try {
      const name = String(it.fields.name ?? 'produit')
      it.damLink = await uploadUrlToDam(img, `${damSlug(name)}.jpg`, `Démo ${company}`)
      uploaded++
    } catch (e) {
      // Quota démo DAM atteint (resource-exhausted) ou image irrécupérable :
      // la cellule garde l'URL externe (DamImage l'affiche aussi), on continue.
      if (errMsg(e).includes('resource-exhausted')) break
    }
  }
  return uploaded
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

  const run = useCallback(async (company: string, url: string) => {
    const uid = auth.currentUser?.uid
    if (!uid) { toast.error('Connexion requise'); return }
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
    try {
      const first = await discover(url, { limit: MAX_PRODUCTS })
      productPages = [...first.pages]
      if (!productPages.length) {
        step('discover', { status: 'running', detail: 'page d’accueil sans fiches — descente dans les rayons…' })
        const categories = await discoverCategories(url)
        let tries = 0
        for (const cat of categories) {
          if (aborted() || productPages.length >= MAX_PRODUCTS || tries >= MAX_CATEGORY_TRIES) break
          tries++
          step('discover', { status: 'running', detail: `rayon ${tries}/${Math.min(categories.length, MAX_CATEGORY_TRIES)} — ${new URL(cat).pathname}` })
          const r = await discover(cat, { limit: PRODUCTS_PER_CATEGORY })
          for (const p of r.pages) {
            if (productPages.length >= MAX_PRODUCTS) break
            if (!productPages.some((x) => x.url === p.url)) productPages.push(p)
          }
        }
      }
      if (!productPages.length) {
        step('discover', {
          status: 'error',
          detail: first.error || 'aucune fiche produit trouvée (site probablement en rendu 100 % JavaScript)',
        })
      } else {
        step('discover', { status: 'done', detail: `${productPages.length} produits repérés sur le site` })
      }
    } catch (e) {
      step('discover', { status: 'error', detail: errMsg(e) })
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
    const damCount = await seedDam(items, company, aborted)
    step('dam', damCount > 0
      ? { status: 'done', detail: `${damCount} image(s) dans le Drive DAM` }
      : { status: 'warning', detail: 'aucun upload (les cellules gardent les URLs externes)' })

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
