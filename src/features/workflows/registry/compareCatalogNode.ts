// src/features/workflows/registry/compareCatalogNode.ts
// Node « Comparer catalogue » : croise ta feuille de produits (réf/EAN/prix) avec
// l'index concurrent persistant (alimenté par « Moisson concurrents »), et produit la
// matrice produit × concurrent (prix TTC verbatim + barré + HT recalculé + écart +
// stock + lien). L'index est relu depuis Firestore, jamais reçu par un edge : le gros
// volume ne transite pas par la mémoire du run (cf. audit scalabilité).
import { Scale } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelSheet, ExcelColumn, ExcelRow } from '@/features/excel/types'
import { useAuthStore } from '@/stores/auth.store'
import { parsePrice, stableId } from '@/features/priceWatch/core'
import { resolveSitesInput } from '@/features/priceWatch/sourceSites'
import { loadAllListings, loadCompetitorMeta, saveCompetitorMeta } from '@/features/priceWatch/catalog/store'
import { buildMatrix, type SiteRef, type MatrixColumn } from '@/features/priceWatch/catalog/matrix'
import { extractOriginRefs, type SourceProduct } from '@/features/priceWatch/catalog/match'
import { buildReport } from '@/features/priceWatch/catalog/report'
import { saveCatalogReport, saveSourceCatalog } from '@/features/priceWatch/reportStore'
import type { CompetitorListing } from '@/features/priceWatch/catalog/prestashop'

interface CompareConfig {
  watchId: string
  label: string
  sites: string
  refColumn: string
  ref2Column: string
  eanColumn: string
  nameColumn: string
  familyColumn: string
  priceColumn: string
  descriptionColumn: string
  urlColumn: string
  vatRate: number
}
interface CompareInputs { products?: ExcelSheet; harvest?: unknown; sites?: unknown }
type CompareOutputs = { matrix: ExcelSheet }

function cell(row: Record<string, unknown>, col: string | undefined): string | undefined {
  if (!col) return undefined
  const v = row[col]
  return v == null ? undefined : String(v).trim() || undefined
}

/** kind de colonne matrice → type de champ + décimales Excel (format de cellule). */
const KIND_TO_FIELD: Record<MatrixColumn['kind'], { fieldType: ExcelColumn['fieldType']; decimals?: number }> = {
  text: { fieldType: 'text' },
  ean: { fieldType: 'barcode', decimals: 0 },
  price: { fieldType: 'number', decimals: 2 },
  percent: { fieldType: 'percent', decimals: 1 },
}

/** Convertit la matrice pure en ExcelSheet, en portant le format de chaque colonne
 *  (fieldType + decimals) pour que l'export .xlsx type correctement les cellules. */
function toSheet(cols: MatrixColumn[], rows: Record<string, unknown>[]): ExcelSheet {
  const columns: ExcelColumn[] = cols.map((c) => {
    const f = KIND_TO_FIELD[c.kind]
    return {
      key: c.key, label: c.label, fieldType: f.fieldType, detectedType: f.fieldType,
      isPrimary: !!c.primary, width: c.kind === 'text' ? 180 : 120,
      ...(f.decimals != null ? { decimals: f.decimals } : {}),
    }
  })
  return { name: 'Veille tarifaire', columns, rows: rows as ExcelRow[], taxonomy: [] }
}

const compareCatalogNode: NodeSpec<CompareConfig, CompareInputs, CompareOutputs> = {
  type: 'compare-catalog',
  category: 'logic',
  label: 'Comparer catalogue',
  description:
    "Croise ta feuille produits (référence / EAN / prix) avec l'index concurrent " +
    "(node « Moisson concurrents »). Produit la matrice produit × concurrent : prix TTC, " +
    "prix barré, prix HT recalculé, écart %, stock, lien. Appariement par égalité exacte.",
  icon: Scale,
  inputs: [
    { name: 'products', type: 'sheet', required: true },
    // Entrée d'ORDONNANCEMENT (facultative) : brancher la sortie de « Moisson
    // concurrents » ici force la moisson à tourner AVANT la comparaison dans un même
    // run. La donnée est ignorée — l'index est relu depuis Firestore, pas depuis l'edge.
    { name: 'harvest', type: 'any' },
    // Port `sites` (facultatif) : brancher un node « Sites sources » remplace la
    // textarea sites ET l'identifiant de suivi (même liste que la moisson, garanti).
    { name: 'sites', type: 'sites' },
  ],
  outputs: [{ name: 'matrix', type: 'sheet' }],
  configSchema: [
    { name: 'sites', kind: 'textarea', label: 'Sites concurrents (un par ligne)', help: 'Mêmes domaines que la moisson. IGNORÉ si un node « Sites sources » est branché sur le port sites.' },
    { name: 'refColumn', kind: 'columnRef', label: 'Colonne Référence', help: 'Référence article / constructeur.' },
    { name: 'ref2Column', kind: 'columnRef', label: 'Colonne Référence 2', help: 'Référence secondaire éventuelle.' },
    { name: 'eanColumn', kind: 'columnRef', label: 'Colonne EAN' },
    { name: 'nameColumn', kind: 'columnRef', label: 'Colonne Nom' },
    { name: 'familyColumn', kind: 'columnRef', label: 'Colonne Famille' },
    { name: 'priceColumn', kind: 'columnRef', label: 'Colonne Mon prix (HT)' },
    { name: 'descriptionColumn', kind: 'columnRef', label: 'Colonne Description', help: 'Sert à extraire les réf. d’origine (« Remplace origine: … ») pour les pièces adaptables.' },
    { name: 'urlColumn', kind: 'columnRef', label: 'Colonne URL (fiche source)', help: 'Lien de la fiche produit sur VOTRE site — rend le nom cliquable dans le tableau pour vérifier le prix. Optionnel.' },
    { name: 'vatRate', kind: 'number', label: 'TVA concurrents (%)', help: 'Pour recalculer le HT depuis le TTC affiché. Défaut : 20.' },
    { name: 'watchId', kind: 'text', label: 'Identifiant du suivi (avancé)', help: 'Laisse VIDE : le suivi est automatiquement celui du workflow (le même que « Moisson concurrents » du workflow). Ne remplis que pour partager un suivi entre plusieurs workflows.' },
    { name: 'label', kind: 'text', label: 'Nom du suivi (affiché)', help: 'Libellé dans le menu « Source » du tableau de bord. Vide → le nom du workflow est utilisé.' },
  ],
  defaultConfig: {
    watchId: '', label: '', sites: '', vatRate: 20,
    refColumn: 'reference', ref2Column: '', eanColumn: 'ean', nameColumn: 'name',
    familyColumn: 'family', priceColumn: 'price', descriptionColumn: 'description', urlColumn: '',
  },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const uid = useAuthStore.getState().user?.uid
    if (!uid) throw new Error('Utilisateur non connecté.')
    // Sites + identité du suivi : le port `sites` (node « Sites sources ») GAGNE ;
    // sinon repli config locale (textarea + watchId dérivé de l'id du workflow →
    // même suivi que « Moisson concurrents » du même workflow, sans rien saisir).
    const { watchId, sites, fromPort } = resolveSitesInput(inputs.sites, {
      sitesText: config.sites, watchIdRaw: config.watchId, workflowId: ctx.workflowId,
    })
    if (fromPort) ctx.log('info', `Liste reçue du node « Sites sources » : ${sites.length} site(s) actif(s).`)
    const rawRows = (inputs.products?.rows ?? []) as Record<string, unknown>[]

    if (sites.length === 0) { ctx.log('warn', 'Aucun site concurrent configuré.'); return { matrix: toSheet([], []) } }
    if (rawRows.length === 0) { ctx.log('warn', 'Feuille de produits vide en entrée.'); return { matrix: toSheet([], []) } }

    // Produits source : identité + clés (dont réf d'origine extraites de la description).
    const products: SourceProduct[] = []
    const seen = new Set<string>()
    for (const row of rawRows) {
      const ref = cell(row, config.refColumn)
      const ean = cell(row, config.eanColumn)
      const name = cell(row, config.nameColumn) ?? ref ?? ean ?? ''
      const id = stableId(ref ?? ean ?? name)
      if (seen.has(id)) continue
      seen.add(id)
      const priceRaw = cell(row, config.priceColumn)
      const price = priceRaw != null ? parsePrice(priceRaw) : NaN
      products.push({
        id, name, ref, ref2: cell(row, config.ref2Column), ean,
        originRefs: extractOriginRefs(cell(row, config.descriptionColumn)),
        price: Number.isNaN(price) ? undefined : price,
        ...(cell(row, config.urlColumn) ? { url: cell(row, config.urlColumn) } as object : {}),
        ...(cell(row, config.familyColumn) ? { family: cell(row, config.familyColumn) } as object : {}),
      })
    }

    // Relecture de l'index concurrent depuis Firestore (pas via un edge).
    const siteRefs: SiteRef[] = sites.map((s) => ({ siteId: stableId(s.domain), domain: s.domain }))
    const indexBySite = new Map<string, CompetitorListing[]>()
    const harvestBySite = new Map<string, { lastMs: number; cumulMs: number; progress: number; sweeps: number }>()
    for (const s of siteRefs) {
      if (ctx.signal.aborted) break
      const meta = await loadCompetitorMeta(uid, watchId, s.siteId)
      if (meta?.cumulHarvestMs != null) harvestBySite.set(s.siteId, { lastMs: meta.lastHarvestMs ?? 0, cumulMs: meta.cumulHarvestMs, progress: meta.harvestProgress ?? 0, sweeps: meta.harvestSweeps ?? 0 })
      const listings = await loadAllListings(uid, watchId, s.siteId)
      indexBySite.set(s.siteId, listings)
      ctx.log('info', `${s.domain} : ${listings.length} produit(s) dans l'index.`)
    }

    // Garde-fou : index vide sur TOUS les sites = la moisson n'a rien écrit sous CE
    // suivi. Cause classique : l'« Identifiant du suivi » de « Moisson concurrents »
    // diffère de celui-ci (casse/espace) → chemins Firestore distincts. On échoue ICI
    // avec un message actionnable plutôt que de produire une matrice vide qui fera
    // planter l'export en aval avec un message trompeur. (Un index NON vide qui apparie
    // 0 produit reste légitime — c'est un recouvrement partiel, pas une erreur.)
    const totalListings = [...indexBySite.values()].reduce((n, l) => n + l.length, 0)
    if (totalListings === 0) {
      throw new Error(
        `Index concurrent vide pour les ${sites.length} site(s) sous le suivi « ${watchId} ». ` +
        `Vérifie que le node « Moisson concurrents » utilise le MÊME identifiant de suivi ` +
        `(« ${watchId} ») et qu'il a bien été lancé avant.`,
      )
    }

    const vatRate = Math.max(0, (config.vatRate || 20)) / 100
    // En-têtes de sortie = noms de colonnes de la source (suffixés du concurrent).
    const labels = {
      ref: config.refColumn, ean: config.eanColumn, name: config.nameColumn,
      family: config.familyColumn, price: config.priceColumn,
    }
    const m = buildMatrix(products, siteRefs, indexBySite, { vatRate, labels })
    ctx.reportCount?.(m.matched)
    ctx.log('info',
      `${m.matched} produit(s) apparié(s) : ${m.matchedExact} même produit, ` +
      `${m.matchedOriginOnly} pièce d'origine (adaptable ↔ OEM). ` +
      `${m.unmatched} sans correspondance, ${m.noKey} sans clé.`)

    // Persiste le RAPPORT dashboard (KPIs + stats/concurrent + liste rangée bornée +
    // point de tendance). Non bloquant : un échec de persistance ne doit pas casser
    // l'export. Le tableau de bord « Veille tarifaire » lit ce rapport par watchId.
    try {
      const report = buildReport(products, siteRefs, indexBySite, { vatRate, harvestBySite })
      await saveCatalogReport(uid, watchId, report, siteRefs, Date.now(), { label: (config.label ?? '').trim() || ctx.workflowName || '' })
      // Persiste le catalogue source → le recalcul mono-site (après un ▶ dans « Sites
      // sources ») pourra reconstruire le benchmark sans relancer tout le workflow.
      await saveSourceCatalog(uid, watchId, products, vatRate).catch((e) => ctx.log('warn', `Catalogue source non persisté : ${e instanceof Error ? e.message : String(e)}`))
      // Recale le compteur live « Fiches collectées » sur le compte dédupliqué exact.
      await Promise.all(report.byCompetitor.map((c) =>
        saveCompetitorMeta(uid, watchId, c.siteId, { productCount: c.audit.indexed })))
      ctx.log('info', `Rapport enregistré (suivi « ${watchId} ») — visible dans le tableau de bord Veille tarifaire.`)
    } catch (err) {
      ctx.log('warn', `Rapport dashboard non enregistré : ${err instanceof Error ? err.message : String(err)}`)
    }
    return { matrix: toSheet(m.columns, m.rows) }
  },
}

nodeRegistry.register(compareCatalogNode)
