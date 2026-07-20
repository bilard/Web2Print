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
import { parseSitesConfig, parsePrice, stableId } from '../../priceWatch/helpers'
import { DEFAULT_WATCH_ID } from '../../priceWatch/paths'
import { loadAllListings } from '../../priceWatch/catalog/store'
import { buildReport } from '../../priceWatch/catalog/report'
import { saveCatalogReport } from '../../priceWatch/reportStore'
import { buildMatrix, type SiteRef, type MatrixColumn } from '../../priceWatch/catalog/matrix'
import { extractOriginRefs, type SourceProduct } from '../../priceWatch/catalog/match'
import type { CompetitorListing } from '../../priceWatch/catalog/prestashop'

interface SheetLike {
  columns?: unknown[]
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
    }
  })
  return { name: 'Veille tarifaire', columns, rows, taxonomy: [] }
}

registerServerNode({
  type: 'compare-catalog',
  run: async (ctx, config, inputs) => {
    // Identité du suivi : l'id du workflow par défaut (même suivi que « Moisson
    // concurrents » du workflow, sans saisie). Override manuel possible.
    const watchId = stableId(String(config.watchId || '').trim() || ctx.workflowId || DEFAULT_WATCH_ID)
    const sites = parseSitesConfig(String(config.sites ?? ''))
    const products = (inputs.products ?? {}) as SheetLike
    const rawRows = products.rows ?? []

    if (sites.length === 0) { ctx.log('warn', 'Aucun site concurrent configuré.'); return { matrix: toSheet([], []) } }
    if (rawRows.length === 0) { ctx.log('warn', 'Feuille de produits vide en entrée.'); return { matrix: toSheet([], []) } }

    const refColumn = config.refColumn as string | undefined
    const ref2Column = config.ref2Column as string | undefined
    const eanColumn = config.eanColumn as string | undefined
    const nameColumn = config.nameColumn as string | undefined
    const familyColumn = config.familyColumn as string | undefined
    const priceColumn = config.priceColumn as string | undefined
    const descriptionColumn = config.descriptionColumn as string | undefined

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
        ...(cell(row, familyColumn) ? { family: cell(row, familyColumn) } as object : {}),
      })
    }

    // Relecture de l'index concurrent depuis Firestore (pas via un edge).
    const siteRefs: SiteRef[] = sites.map((s) => ({ siteId: stableId(s.domain), domain: s.domain }))
    const indexBySite = new Map<string, CompetitorListing[]>()
    for (const s of siteRefs) {
      if (ctx.signal.aborted) break
      const listings = await loadAllListings(ctx.uid, watchId, s.siteId)
      indexBySite.set(s.siteId, listings)
      ctx.log('info', `${s.domain} : ${listings.length} produit(s) dans l'index.`)
    }

    // Garde-fou (jumeau du client) : index vide sur TOUS les sites = la moisson n'a rien
    // écrit sous CE suivi (identifiant de suivi divergent, casse/espace, ou moisson non
    // lancée). Échec explicite plutôt qu'une matrice vide qui ferait planter l'export.
    const totalListings = [...indexBySite.values()].reduce((n, l) => n + l.length, 0)
    if (totalListings === 0) {
      throw new Error(
        `Index concurrent vide pour les ${sites.length} site(s) sous le suivi « ${watchId} ». ` +
        `Vérifie que le node « Moisson concurrents » utilise le MÊME identifiant de suivi ` +
        `(« ${watchId} ») et qu'il a bien été lancé avant.`,
      )
    }

    const vatRate = Math.max(0, Number(config.vatRate) || 20) / 100
    // En-têtes de sortie = noms de colonnes de la source (suffixés du concurrent).
    const labels = { ref: refColumn, ean: eanColumn, name: nameColumn, family: familyColumn, price: priceColumn }
    const m = buildMatrix(sourceProducts, siteRefs, indexBySite, { vatRate, labels })
    ctx.log('info',
      `${m.matched} produit(s) apparié(s) : ${m.matchedExact} même produit, ` +
      `${m.matchedOriginOnly} pièce d'origine (adaptable ↔ OEM). ` +
      `${m.unmatched} sans correspondance, ${m.noKey} sans clé.`)

    // Persiste le RAPPORT dashboard (comme le node client) → le CRON alimente le tableau
    // de bord Veille tarifaire sans ouvrir l'app. Non bloquant : un échec ne casse pas l'export.
    try {
      const report = buildReport(sourceProducts, siteRefs, indexBySite, { vatRate })
      await saveCatalogReport(ctx.uid, watchId, report, siteRefs, Date.now(), { label: ctx.workflowName })
      ctx.log('info', `Rapport dashboard enregistré (suivi « ${watchId} ») — visible dans Veille tarifaire.`)
    } catch (err) {
      ctx.log('warn', `Rapport dashboard non enregistré : ${err instanceof Error ? err.message : String(err)}`)
    }
    return { matrix: toSheet(m.columns, m.rows) }
  },
})
