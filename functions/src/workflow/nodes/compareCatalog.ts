// functions/src/workflow/nodes/compareCatalog.ts
// Jumeau SERVEUR (headless/cron) du node « Comparer catalogue »
// (src/features/workflows/registry/compareCatalogNode.ts). Croise la feuille de
// produits source (réf/EAN/prix) avec l'index concurrent persistant alimenté par
// « Moisson concurrents », et produit la matrice produit × concurrent (prix TTC
// verbatim + barré + HT recalculé + écart % + stock + lien). L'index est RELU depuis
// Firestore, jamais reçu par un edge — le gros volume ne transite pas par la mémoire
// du run (cf. audit scalabilité). Logique métier partagée via les modules purs
// dupliqués sous functions/src/priceWatch/catalog/.
import { registerServerNode } from '../registry'
import { parsePrice, stableId } from '../../priceWatch/helpers'
import { resolveSitesInput } from '../../priceWatch/sourceSites'
import { loadAllListings, loadCompetitorMeta, saveCompetitorMeta } from '../../priceWatch/catalog/store'
import { buildReport } from '../../priceWatch/catalog/report'
import { saveCatalogReport, saveSourceCatalog } from '../../priceWatch/reportStore'
import { buildMatrix, type SiteRef, type MatrixColumn } from '../../priceWatch/catalog/matrix'
import { extractOriginRefs, type SourceProduct } from '../../priceWatch/catalog/match'
import { pickDisplayColumns, taxoPathOf, trimDescription } from '../../priceWatch/catalog/displayColumns'
import type { CompetitorListing } from '../../priceWatch/catalog/prestashop'
import { t } from '../../i18n'

interface SheetLike {
  /** En-têtes de la feuille branchée — clé et libellé servent à reconnaître les
   *  colonnes d'affichage (description, visuel, taxonomie). */
  columns?: { key: string; label?: string }[]
  rows?: Record<string, unknown>[]
}

function cell(row: Record<string, unknown>, col: string | undefined): string | undefined {
  if (!col) return undefined
  const v = row[col]
  return v == null ? undefined : String(v).trim() || undefined
}

/** kind de colonne matrice → type de champ + décimales Excel (format de cellule). */
const KIND_TO_FIELD: Record<MatrixColumn['kind'], { fieldType: string; decimals?: number }> = {
  text: { fieldType: 'text' },
  ean: { fieldType: 'barcode', decimals: 0 },
  price: { fieldType: 'number', decimals: 2 },
  percent: { fieldType: 'percent', decimals: 1 },
}

/** Convertit la matrice pure en feuille (mêmes clés/labels que le client → l'export
 *  Sheets natif reprend les libellés et types de colonnes). */
function toSheet(cols: MatrixColumn[], rows: Record<string, unknown>[]) {
  const columns = cols.map((c) => {
    const f = KIND_TO_FIELD[c.kind]
    return {
      key: c.key, label: c.label, fieldType: f.fieldType, detectedType: f.fieldType,
      isPrimary: !!c.primary, width: c.kind === 'text' ? 180 : 120,
      ...(f.decimals != null ? { decimals: f.decimals } : {}),
      ...(c.group ? { group: c.group } : {}),
    }
  })
  return { name: 'Veille tarifaire', columns, rows, taxonomy: [] }
}

registerServerNode({
  type: 'compare-catalog',
  run: async (ctx, config, inputs) => {
    // Identité du suivi : l'id du workflow par défaut (même suivi que « Moisson
    // concurrents » du workflow, sans saisie). Override manuel possible.
    // Sites + watchId : le port `sites` (node « Sites sources ») GAGNE, sinon config locale.
    const resolved = resolveSitesInput(inputs.sites, {
      sitesText: String(config.sites ?? ''), watchIdRaw: String(config.watchId ?? ''), workflowId: ctx.workflowId,
    })
    const watchId = resolved.watchId
    const sites = resolved.sites
    const products = (inputs.products ?? {}) as SheetLike
    const rawRows = products.rows ?? []

    if (sites.length === 0) { ctx.log('warn', t(ctx.locale, 'run.noCompetitor')); return { matrix: toSheet([], []) } }
    if (rawRows.length === 0) { ctx.log('warn', t(ctx.locale, 'run.emptySheet')); return { matrix: toSheet([], []) } }

    const refColumn = config.refColumn as string | undefined
    const ref2Column = config.ref2Column as string | undefined
    const eanColumn = config.eanColumn as string | undefined
    const nameColumn = config.nameColumn as string | undefined
    const familyColumn = config.familyColumn as string | undefined
    const priceColumn = config.priceColumn as string | undefined
    const descriptionColumn = config.descriptionColumn as string | undefined
    const urlColumn = config.urlColumn as string | undefined

    // Colonnes d'AFFICHAGE — jumeau strict du client : sans elles, un catalogue écrit
    // par le cron perdrait taxonomie et visuels, et l'écran « Concurrents » resterait
    // vide selon que le run vient du navigateur ou de la nuit.
    const disp = pickDisplayColumns(products.columns ?? [], { description: descriptionColumn })

    // Produits source : identité + clés (dont réf d'origine extraites de la description).
    const sourceProducts: SourceProduct[] = []
    const seen = new Set<string>()
    for (const row of rawRows) {
      const ref = cell(row, refColumn)
      const ean = cell(row, eanColumn)
      const name = cell(row, nameColumn) ?? ref ?? ean ?? ''
      const id = stableId(ref ?? ean ?? name)
      if (seen.has(id)) continue
      seen.add(id)
      const priceRaw = cell(row, priceColumn)
      const price = priceRaw != null ? parsePrice(priceRaw) : NaN
      sourceProducts.push({
        id, name, ref, ref2: cell(row, ref2Column), ean,
        originRefs: extractOriginRefs(cell(row, descriptionColumn)),
        price: Number.isNaN(price) ? undefined : price,
        ...(cell(row, urlColumn) ? { url: cell(row, urlColumn) } as object : {}),
        ...(cell(row, familyColumn) ? { family: cell(row, familyColumn) } as object : {}),
        ...((d) => (d ? { description: d } : {}))(trimDescription(disp.description ? row[disp.description] : undefined)),
        ...(disp.image && cell(row, disp.image) ? { image: cell(row, disp.image) } as object : {}),
        ...((p) => (p.length > 0 ? { taxo: p } : {}))(taxoPathOf(row, disp.taxo)),
      })
    }

    // Le dédoublonnage ci-dessus se fait sur `ref ?? ean ?? name` : une colonne de
    // référence mal mappée fait retomber l'identité sur le NOM, et des milliers de
    // lignes distinctes s'effondrent alors en une poignée. Rendre l'écart visible.
    ctx.log('info', t(ctx.locale, 'run.compareCatalog.sourceKept', { count: sourceProducts.length, rows: rawRows.length }))
    if (sourceProducts.length < rawRows.length * 0.9) {
      ctx.log('warn', t(ctx.locale, 'run.compareCatalog.duplicatesDropped', {
        count: rawRows.length - sourceProducts.length,
      }))
    }

    // Relecture de l'index concurrent depuis Firestore (pas via un edge).
    const siteRefs: SiteRef[] = sites.map((s) => ({ siteId: stableId(s.domain), domain: s.domain }))
    const indexBySite = new Map<string, CompetitorListing[]>()
    const harvestBySite = new Map<string, { lastMs: number; cumulMs: number; progress: number; sweeps: number }>()
    for (const s of siteRefs) {
      if (ctx.signal.aborted) break
      const meta = await loadCompetitorMeta(ctx.uid, watchId, s.siteId)
      if (meta?.cumulHarvestMs != null) harvestBySite.set(s.siteId, { lastMs: meta.lastHarvestMs ?? 0, cumulMs: meta.cumulHarvestMs, progress: meta.harvestProgress ?? 0, sweeps: meta.harvestSweeps ?? 0 })
      const listings = await loadAllListings(ctx.uid, watchId, s.siteId)
      indexBySite.set(s.siteId, listings)
      ctx.log('info', t(ctx.locale, 'run.compareCatalog.siteIndexCount', { domain: s.domain, count: listings.length }))
    }

    // Garde-fou (jumeau du client) : index vide sur TOUS les sites = la moisson n'a rien
    // écrit sous CE suivi (identifiant de suivi divergent, casse/espace, ou moisson non
    // lancée). Échec explicite plutôt qu'une matrice vide qui ferait planter l'export.
    const totalListings = [...indexBySite.values()].reduce((n, l) => n + l.length, 0)
    if (totalListings === 0) {
      throw new Error(t(ctx.locale, 'run.compareCatalog.emptyIndex', { sites: sites.length, watchId }))
    }

    const vatRate = Math.max(0, Number(config.vatRate) || 20) / 100
    // En-têtes de sortie = noms de colonnes de la source (suffixés du concurrent).
    const labels = { ref: refColumn, ean: eanColumn, name: nameColumn, family: familyColumn, price: priceColumn }
    const m = buildMatrix(sourceProducts, siteRefs, indexBySite, { vatRate, labels })
    ctx.log('info', t(ctx.locale, 'run.compareCatalog.matchedBreakdown', {
      matched: m.matched, exact: m.matchedExact, originOnly: m.matchedOriginOnly,
      unmatched: m.unmatched, noKey: m.noKey,
    }))

    // Persiste le RAPPORT dashboard (comme le node client) → le CRON alimente le tableau
    // de bord Veille tarifaire sans ouvrir l'app. Non bloquant : un échec ne casse pas l'export.
    try {
      const report = buildReport(sourceProducts, siteRefs, indexBySite, { vatRate, harvestBySite })
      await saveCatalogReport(ctx.uid, watchId, report, siteRefs, Date.now(), { label: ctx.workflowName })
      // Catalogue source (comme le node client) : sans lui, un suivi alimenté seulement
      // par le cron n'a rien à relire pour un recalcul mono-site après un ▶.
      await saveSourceCatalog(ctx.uid, watchId, sourceProducts, vatRate)
        .catch((e) => ctx.log('warn', t(ctx.locale, 'run.sourceCatalogNotPersisted', { message: e instanceof Error ? e.message : String(e) })))
      // Recale le compteur live « Fiches collectées » sur le compte dédupliqué exact
      // (annule la dérive de l'incrément live de la moisson).
      await Promise.all(report.byCompetitor.map((c) =>
        saveCompetitorMeta(ctx.uid, watchId, c.siteId, { productCount: c.audit.indexed })))
      ctx.log('info', t(ctx.locale, 'run.dashboardSaved', { watchId }))
    } catch (err) {
      ctx.log('warn', t(ctx.locale, 'run.dashboardNotSaved', { message: err instanceof Error ? err.message : String(err) }))
    }
    return { matrix: toSheet(m.columns, m.rows) }
  },
})
