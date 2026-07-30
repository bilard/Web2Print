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
import { uploadUrlToDam, damSlug, isSystemicDamError } from '@/features/dam/uploadImageToDam'
import { useExcelFirebase } from '@/features/excel/useExcelFirebase'
import { useExcelStore } from '@/stores/excel.store'
import { makeExcelSourceRef } from '@/features/merge/excelSource'
import { newCatalogDoc, saveCatalog } from '@/features/catalog/catalogsApi'
import { buildCatalogTree, flattenTree, guessLevelKeys } from '@/features/catalog/catalogTree'
import { generateCatalogPlan, defaultCatalogPlan, hexLum } from '@/features/catalog/catalogPlan'
import { pagePx } from '@/features/catalog/components/pages/catalogCss'
import { generateImageBase64 } from '@/features/nanobana/generateImageBase64'
import { defaultPromoFieldMap, defaultCustomFields } from '@/features/retail-promo/promoMapping'
import { savePromo } from '@/features/retail-promo/promosApi'
import { DEFAULT_PROMO_CONFIG, type PromoTemplateConfig } from '@/features/retail-promo/promoCardTypes'
import { saveWorkflow, listWorkflows } from '@/features/workflows/persistence/workflowsApi'
import { listCatalogs } from '@/features/catalog/catalogsApi'
import { listPromos } from '@/features/retail-promo/promosApi'
import { useDemoExpressStore } from '@/stores/demoExpress.store'
import { useAiActivityStore } from '@/stores/aiActivity.store'
import { DEFAULT_CARD_STYLE, type CatalogCharte, type CatalogDoc, type CatalogPlan } from '@/features/catalog/catalogTypes'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import { buildDemoSheet, sheetToMerge, isProductLike, DEMO_TARGET_FIELDS, type DemoProduct } from './buildDemoSheet'
import { buildDemoWorkflow } from './demoWorkflow'
import { seedAnimations } from './seedAnimations'
import { discoverCategories, categoriesFromHtml, productLinksFromListingHtml, isObviousNonProductUrl } from './discoverFromHome'
import { t } from '@/lib/i18n'

/** Volumétries proposées par le wizard (48 max : sous le quota démo PIM de 50). */
export const DEMO_VOLUMES = [6, 12, 24, 48] as const
const DEFAULT_MAX_PRODUCTS = 12 // temps de démo raisonnable
/** Repli BLEU pour la démo quand une couleur de charte est trop claire/illisible. */
const DEMO_ACCENT_BLUE = '#2563eb'
/** Couleur trop claire pour porter du texte blanc (bandeau) ou pour servir de
 *  texte sur fond blanc (contraste insuffisant) → à neutraliser/remplacer. Une
 *  couleur de marque LISIBLE (rouge, bleu foncé…) passe et est CONSERVÉE. */
const tooLightForContrast = (hex?: string): boolean =>
  !!hex && /^#[0-9a-f]{6}$/i.test(hex) && hexLum(hex) > 0.6
/** Champs couleur du style de fiche à neutraliser s'ils sont trop clairs (fonds
 *  de bandeaux → repli sur l'accent ; couleurs de texte → repli sur l'encre). */
const DEMO_CARD_COLOR_FIELDS = [
  'promoBg', 'kickerBg', 'priceBg', 'wasBg', 'stickerBg', 'vedetteBg', 'vedettePriceBg',
  'promoBg2', 'kickerBg2', 'priceBg2', 'wasBg2', 'stickerBg2', 'vedetteBg2', 'vedettePriceBg2',
  'nameColor', 'brandColor', 'descColor',
] as const
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

/** Journal live (panneau console de la page Démo express). */
const logLine = (kind: 'step' | 'ia' | 'connector' | 'error', text: string) => {
  useDemoExpressStore.getState().appendLog(kind, text)
}

/** Bilan d'une fiche enrichie pour le journal : ce qui a été RÉELLEMENT obtenu —
 *  une fiche sans specs/réf se repère immédiatement, plus de diagnostic à l'aveugle. */
function fieldsSummary(fields: Record<string, unknown>, assetCount: number): string {
  const s = (k: string) => String(fields[k] ?? '').trim()
  const specCount = s('specifications').split(/\n+/).filter((l) => l.includes(':')).length
  const flags = [
    `réf ${s('reference') || '—'}`,
    `${specCount} spec(s)`,
    `${assetCount} image(s)`,
    s('price') ? `prix ${s('price')}` : null,
    s('ean') ? `EAN ${s('ean')}` : null,
  ].filter(Boolean).join(' · ')
  return `✓ ${s('name') || 'Fiche'} — ${flags}`
}

// ── Trace des appels IA dans le journal (une ligne PAR REQUÊTE terminée :
// provider/modèle, tâche, durée, coût) — abonnement UNIQUE au store aiActivity,
// actif seulement pendant un run (phase 'running'), donc aucun bruit des autres
// modules hors Démo express.
let aiTapInstalled = false
function installAiTap(): void {
  if (aiTapInstalled) return
  aiTapInstalled = true
  let lastSeen = useAiActivityStore.getState().last
  useAiActivityStore.subscribe((s) => {
    const rec = s.last
    if (!rec || rec === lastSeen) return
    lastSeen = rec
    if (useDemoExpressStore.getState().phase !== 'running') return
    const dur = rec.endedAt ? `${Math.round((rec.endedAt - rec.startedAt) / 100) / 10}s` : ''
    const cost = rec.costUsd ? ` · ${rec.costUsd.toFixed(3)} $` : ''
    if (rec.status === 'error') {
      logLine('error', `IA ${rec.provider} · ${rec.model} — ${rec.label} : ${rec.errorMessage ?? 'échec'}`)
    } else {
      logLine('ia', `IA ${rec.provider} · ${rec.model} — ${rec.label} (${dur}${cost})`)
    }
  })
}

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
      const fileName = `${damSlug(name)}.jpg`
      // reuseByName : un re-run RÉUTILISE l'image « Démo {Société} » déjà dans le
      // Drive (même nom) au lieu de re-consommer le quota démo (20 assets).
      it.damLink = await uploadUrlToDam(img, fileName, `Démo ${company}`, { reuseByName: true })
      uploaded++
      logLine('connector', `Drive DAM — « ${fileName} » déposé (${uploaded}/${Math.min(items.length, maxUploads)})`)
    } catch (e) {
      firstError ??= errMsg(e)
      logLine('error', `Drive DAM — ${errMsg(e)}`)
      // Quota démo DAM atteint OU Google non connecté : inutile d'insister,
      // toutes les tentatives suivantes échoueraient pareil. Les cellules
      // gardent l'URL externe (DamImage l'affiche aussi).
      if (isSystemicDamError(e)) break
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
  /** Consignes créatives saisies dans le wizard (optionnel). */
  userPrompt?: string
}): Promise<string> {
  const { company, charte, docId, fileName, columns, rows, onDetail, userPrompt } = input
  const name = `Démo ${company}`
  const levelKeys = guessLevelKeys(columns)
  const tree = buildCatalogTree(rows, columns, levelKeys)
  const nameOf = new Map(rows.map((r) => [r._id, String(r.name ?? '')]))
  const sampleNames: Record<string, string[]> = {}
  for (const n of flattenTree(tree)) {
    sampleNames[n.id] = n.productIds.slice(0, 3).map((id) => `${id} — ${nameOf.get(id) ?? ''}`)
  }
  // Consignes créatives du wizard EN TÊTE du brief (elles pilotent le plan IA :
  // mise en page, densité, ambiance, couverture) ; la charte reste prioritaire
  // pour les couleurs (injectée à part dans le contexte du plan). Le brief est
  // aussi persisté dans CatalogDoc.prompt → itérable ensuite dans le builder.
  const brief = [
    userPrompt,
    `Catalogue de démonstration pour ${company}, fidèle à la charte graphique de son site (palette et consignes jointes).`,
  ].filter(Boolean).join(' — ')

  onDetail('plan IA en cours…')
  let plan: CatalogPlan
  try {
    plan = await generateCatalogPlan(brief, { catalogName: name, tree, sampleNames, charte })
  } catch {
    plan = defaultCatalogPlan(tree, name)
  }
  // Le catalogue démo est un catalogue de DONNÉES exhaustives (défaut des fiches) :
  // fiche PLEINE PAGE (1/page) — seule surface qui garantit 100 % des avantages
  // ET du tableau de specs sur les produits riches (Milwaukee : 11 puces + 24
  // lignes ne tiennent pas ensemble en 2/page, le partage proportionnel coupe).
  plan = { ...plan, sections: plan.sections.map((sec) => ({ ...sec, productsPerPage: 1 as const, randomDensity: false })) }
  // FOND DE PAGE BLANC — TOUJOURS, pour la démo : l'analyse de charte du site
  // écrit parfois « FOND DE PAGE : #0…» (site sombre) et ce canal explicite
  // passe devant enforceLightPageBg → pages noires non voulues. Encre relisible.
  // Palette DÉMO : on GARDE l'accent de la charte s'il est lisible, on ne bascule
  // en bleu que s'il est trop clair (accent jaune illisible sur fiches blanches).
  plan = { ...plan, theme: { ...plan.theme, pageBg: '#ffffff',
    ...(tooLightForContrast(plan.theme.accent) ? { accent: DEMO_ACCENT_BLUE } : {}),
    ...(hexLum(plan.theme.ink) > 0.65 ? { ink: '#111827' } : {}) } }
  // MISE EN PAGE SOUS CONTRÔLE TOTAL : la démo impose la disposition COMPLÈTE
  // de la fiche (les 13 blocs — le plan IA ne place plus rien) : image 30 % de
  // la fiche / DONNÉE 70 %, tableau de caractéristiques TOUJOURS visible et
  // exhaustif (hiddenDetails vidé, plafonds levés), tailles homogènes (échelles
  // à 1 + « Taille identique »), prix ancré bas-droite.
  const demoLayout = {
    promo: { x: 0, y: 0, w: 100 },
    vedette: { x: 62, y: 3 },
    kicker: { x: 0, y: 7 },
    image: { x: 2, y: 4, w: 96, h: 30 },
    sticker: { x: 70, y: 20, r: 8 },
    brand: { x: 5, y: 36, w: 90 },
    name: { x: 5, y: 40, w: 92 },
    description: { x: 5, y: 46, w: 92 },
    details: { x: 5, y: 58, w: 92 },
    specs: { x: 5, y: 70, w: 92 },
    ref: { x: 5, y: 92, w: 45 },
    unit: { x: 5, y: 95, link: 'ref' as const },
    price: { x: 2, y: 2, w: 40, ax: 'r' as const, ay: 'b' as const, r: 0 },
  }
  const demoLayoutWide = {
    promo: { x: 0, y: 0, w: 100 },
    vedette: { x: 62, y: 3 },
    kicker: { x: 0, y: 10 },
    image: { x: 2, y: 8, w: 30, h: 88 },
    sticker: { x: 24, y: 12, r: 8 },
    brand: { x: 36, y: 10, w: 60 },
    name: { x: 36, y: 16, w: 62 },
    description: { x: 36, y: 26, w: 62 },
    details: { x: 36, y: 46, w: 62 },
    specs: { x: 36, y: 68, w: 62 },
    ref: { x: 36, y: 88, w: 30 },
    unit: { x: 36, y: 92, link: 'ref' as const },
    price: { x: 2, y: 2, w: 40, ax: 'r' as const, ay: 'b' as const, r: 0 },
  }
  // Neutralise UNIQUEMENT les couleurs de fiche trop claires/illisibles (bandeau
  // jaune, texte pâle) → repli sur l'accent + l'encre. Les couleurs de charte
  // lisibles sont CONSERVÉES.
  const demoColorGuard = Object.fromEntries(
    DEMO_CARD_COLOR_FIELDS
      .filter((f) => tooLightForContrast((plan.cardStyle as Record<string, string> | undefined)?.[f]))
      .map((f) => [f, '']),
  )
  plan = { ...plan, cardStyle: { ...DEFAULT_CARD_STYLE, ...plan.cardStyle, ...demoColorGuard,
    layout: demoLayout, layoutWide: demoLayoutWide,
    hiddenDetails: [], maxSpecLines: undefined, maxBulletLines: undefined,
    showDetails: true, uniformTextScale: true, textStyle: {},
    nameScale: 1, descScale: 1, priceScale: 1, brandScale: 1, refScale: 1, unitScale: 1,
    promoScale: 1, stickerScale: 1, vedetteScale: 1, detailsScale: 1, kickerScale: 1, specsScale: 1 } }

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
  // Idempotent : un re-run REMPLACE le catalogue « Démo {Société} » existant
  // (saveCatalog upserte par id) au lieu d'empiler des doublons.
  const existingCatalog = (await listCatalogs().catch(() => [])).find((c) => c.name === name)
  if (existingCatalog) doc.id = existingCatalog.id
  const catalogId = await saveCatalog(doc)

  // Couverture Nano Banana — facultative : le catalogue reste valable sans.
  const coverPrompt = plan.cover.imagePrompt?.trim()
  if (coverPrompt) {
    try {
      onDetail('couverture IA en cours…')
      const uid = auth.currentUser?.uid
      if (!uid) throw new Error(t('err.auth.notSignedIn'))
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
  // Accent charte conservé s'il est lisible ; bleu de repli seulement s'il est trop clair.
  const promoAccent = patch.accent ?? DEFAULT_PROMO_CONFIG.accent
  const config: PromoTemplateConfig = {
    ...DEFAULT_PROMO_CONFIG,
    accent: tooLightForContrast(promoAccent) ? DEMO_ACCENT_BLUE : promoAccent,
    headerBg: patch.headerBg ?? DEFAULT_PROMO_CONFIG.headerBg,
  }
  const fieldMap = defaultPromoFieldMap(columns)
  // Idempotent : remplace la fiche promo « Démo {Société} » existante.
  const existingPromo = (await listPromos().catch(() => [])).find((p) => p.name === `Démo ${company}`)
  return savePromo({
    name: `Démo ${company}`,
    sourceRef: makeExcelSourceRef(docId, 0, fileName),
    fieldMap,
    customFields: defaultCustomFields(columns, fieldMap),
    config,
    columns,
    rows,
  }, existingPromo?.id)
}

export function useDemoExpress() {
  const { discover } = useJina()
  const { saveToFirebase, listSavedFiles } = useExcelFirebase()

  const run = useCallback(async (company: string, url: string, opts?: { maxProducts?: number; prompt?: string; animations?: boolean }) => {
    const uid = auth.currentUser?.uid
    if (!uid) { toast.error('Connexion requise'); return }
    const vol = volumePlan(opts?.maxProducts ?? DEFAULT_MAX_PRODUCTS)
    const s = useDemoExpressStore.getState()
    s.begin(company, url)
    installAiTap()
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
    const productPages: { url: string; title: string }[] = []
    let homeHtmlBd: string | null = null
    const pushUnique = (pages: { url: string; title: string }[]) => {
      for (const p of pages) {
        if (productPages.length >= vol.maxProducts) break
        // URL à l'évidence non-produit (cookies, actu, catalogues, concours…) :
        // écartée AVANT l'enrichissement (~1 min économisée par page parasite).
        if (isObviousNonProductUrl(p.url)) {
          logLine('step', `URL non-produit écartée sans enrichissement : ${p.url}`)
          continue
        }
        if (!productPages.some((x) => x.url === p.url)) productPages.push(p)
      }
    }
    try {
      logLine('connector', `Jina — découverte des cartes produit sur ${url}`)
      const first = await discover(url, { limit: vol.maxProducts })
      pushUnique(first.pages)
      // Le rendu des PLP SPA n'est pas déterministe (CMP, timeout CF) : un
      // second essai DIRECT réussit souvent là où le premier n'a rien vu.
      if (!productPages.length && !aborted()) {
        step('discover', { status: 'running', detail: 'rendu instable — seconde tentative de découverte…' })
        logLine('connector', `Jina/CF — 2e tentative de découverte sur ${url}`)
        const second = await discover(url, { limit: vol.maxProducts }).catch(() => ({ pages: [] as { url: string; title: string }[] }))
        pushUnique(second.pages)
      }
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
      for (const id of ['enrich', 'dam', 'sheet', 'catalog', 'promo', 'anim', 'workflow'] as const) step(id, { status: 'skipped' })
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
        if (fields.name || fields.description || assets.length) {
          items.push({ url: p.url, fields, assets })
          logLine('step', fieldsSummary(fields, assets.length))
        }
      } catch (e) {
        // fiche irrécupérable : on passe à la suivante
        logLine('error', `Enrichissement — ${p.url} : ${errMsg(e)}`)
      }
    }
    if (!items.length) {
      step('enrich', { status: 'error', detail: 'aucune fiche exploitable (site anti-bot ?)' })
      for (const id of ['dam', 'sheet', 'catalog', 'promo', 'anim', 'workflow'] as const) step(id, { status: 'skipped' })
      finish()
      return
    }
    // Pages ÉDITORIALES : pas des produits (ni réf, ni EAN, ni prix, ni vraies
    // specs) mais souvent des RAYONS déguisés (landing métier « Plaquiste ») —
    // au lieu de les jeter, DESCENTE : on y re-découvre les cartes produit
    // (2 niveaux max : métier → gamme → produit ; bornée en découvertes et par
    // la volumétrie). Garde-fou : si rien de mieux, la liste initiale reste.
    const productLike = items.filter((it) => isProductLike(it.fields))
    const editorialQueue = items
      .filter((it) => !isProductLike(it.fields))
      .map((it) => ({ url: it.url, depth: 1 }))
    const editorial = editorialQueue.length
    const seenUrls = new Set(items.map((it) => it.url))
    let descents = 0
    let recovered = 0
    while (editorialQueue.length > 0 && productLike.length < vol.maxProducts && descents < 6 && !aborted()) {
      const cand = editorialQueue.shift()
      if (!cand) break
      descents++
      logLine('connector', `Jina — descente niveau ${cand.depth} : ${cand.url}`)
      step('enrich', { status: 'running', detail: `page éditoriale → descente dans ${new URL(cand.url).pathname}` })
      const sub = await discover(cand.url, { limit: vol.perCategory })
        .catch(() => ({ pages: [] as { url: string; title: string }[] }))
      for (const p of sub.pages) {
        if (aborted() || productLike.length >= vol.maxProducts) break
        if (seenUrls.has(p.url)) continue
        seenUrls.add(p.url)
        if (isObviousNonProductUrl(p.url)) continue
        step('enrich', { status: 'running', detail: `descente — ${p.title}` })
        try {
          const { fields, assets } = await enrichRow({ url: p.url, targetFields: [...DEMO_TARGET_FIELDS] })
          if (!(fields.name || fields.description || assets.length)) continue
          if (isProductLike(fields)) {
            productLike.push({ url: p.url, fields, assets })
            recovered++
            logLine('step', fieldsSummary(fields, assets.length))
          } else if (cand.depth < 2) {
            // Toujours pas un produit : c'est un sous-rayon (gamme) → un niveau de plus.
            editorialQueue.push({ url: p.url, depth: cand.depth + 1 })
          }
        } catch (e) {
          logLine('error', `Enrichissement — ${p.url} : ${errMsg(e)}`)
        }
      }
    }
    // Échec FRANC plutôt qu'un catalogue de pages parasites : sans la moindre
    // fiche à identité produit (réf/EAN — ou prix + vraies specs), on n'ensemence
    // RIEN (un catalogue « politique de confidentialité » est pire que vide).
    if (productLike.length === 0) {
      step('enrich', {
        status: 'error',
        detail: `${items.length} page(s) analysée(s), aucune fiche PRODUIT identifiable (réf/EAN) — essayez une URL de rayon ou de fiche produit`,
      })
      for (const id of ['dam', 'sheet', 'catalog', 'promo', 'anim', 'workflow'] as const) step(id, { status: 'skipped' })
      finish()
      return
    }
    items.splice(0, items.length, ...productLike)
    step('enrich', {
      status: 'done',
      detail: `${items.length} fiche(s) produit${editorial > 0
        ? ` · ${editorial} page(s) éditoriale(s)${recovered > 0 ? ` → ${recovered} produit(s) récupérés en descente` : ' écartée(s)'}`
        : ''}`,
    })

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
      // Idempotent : un re-run met à jour la base « Démo {Société} » existante.
      const existingSheet = (await listSavedFiles().catch(() => [])).find((f) => f.fileName === fileName)
      docId = await saveToFirebase(fileName, [sheet], [], existingSheet?.docId ?? null)
      if (!docId) throw new Error(t('err.de.saveRefused'))
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
      for (const id of ['catalog', 'promo', 'anim', 'workflow'] as const) step(id, { status: 'skipped' })
      finish()
      return
    }

    const { columns, rows } = sheetToMerge(sheet)

    // 6) Catalogue studio (charte + plan IA + couverture)
    step('catalog', { status: 'running' })
    try {
      const catalogId = await seedCatalog({
        company, charte, docId, fileName, columns, rows,
        userPrompt: opts?.prompt,
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

    // 8) Animations HTML par produit (optionnel) — compositions déterministes
    // (aucun appel IA) compilées et sauvées dans le DAM par le module vidéo.
    if (opts?.animations === false) {
      step('anim', { status: 'skipped', detail: 'désactivées dans le formulaire' })
    } else {
      step('anim', { status: 'running' })
      try {
        const { created, firstError } = await seedAnimations({
          items, company, siteUrl: url, charte, aborted,
          onDetail: (d) => step('anim', { status: 'running', detail: d }),
          log: logLine,
        })
        useDemoExpressStore.getState().setLinks({ animCount: created })
        step('anim', created > 0
          ? { status: 'done', detail: `${created} animation(s) HTML dans le DAM` }
          : { status: 'warning', detail: firstError ?? 'aucune animation générée' })
      } catch (e) {
        step('anim', { status: 'error', detail: errMsg(e) })
      }
    }

    // 9) Workflow « Démo {Société} »
    step('workflow', { status: 'running' })
    try {
      const wf = buildDemoWorkflow(company, items.map((it) => it.url), uid, auth.currentUser?.email ?? '')
      // Idempotent : remplace le workflow « Démo {Société} » existant (constaté :
      // 8 doublons « Démo castorama » empilés par les re-runs).
      const existingWf = (await listWorkflows(uid).catch(() => [])).find((w) => w.name === wf.name)
      if (existingWf) wf.id = existingWf.id
      await saveWorkflow(uid, wf)
      useDemoExpressStore.getState().setLinks({ workflowId: wf.id })
      step('workflow', { status: 'done', detail: `« ${wf.name} » ajouté à ses workflows` })
    } catch (e) {
      step('workflow', { status: 'error', detail: errMsg(e) })
    }

    finish()
  }, [discover, saveToFirebase, listSavedFiles])

  return { run }
}
