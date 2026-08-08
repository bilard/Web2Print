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
import { reportFromPairing } from '../../priceWatch/catalog/report'
import { saveCatalogReport, saveSourceCatalog } from '../../priceWatch/reportStore'
import { loadPairingRules } from '../../priceWatch/pairingRulesStore'
import { rulesDifferFromDefault, summarizeRules } from '../../priceWatch/catalog/pairingRules'
import { matrixFromPairing, SITE_FIELDS, type SiteField, type SiteRef, type MatrixColumn } from '../../priceWatch/catalog/matrix'
import { extractOriginRefs, type SourceProduct } from '../../priceWatch/catalog/match'
import { createPairingRun } from '../../priceWatch/catalog/pairingRun'
import { pickDisplayColumns, taxoPathOf, trimDescription } from '../../priceWatch/catalog/displayColumns'
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
  // Ligne de titres de blocs (jumeau du client) : sans elle, arrivé au milieu du tableau
  // plus rien ne dit de quel concurrent on lit les prix.
  return { name: 'Veille tarifaire', columns, rows, taxonomy: [], groupHeaderRow: true }
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

    // ⚠ Le nom saisi dans le node peut être la CLÉ ou le LIBELLÉ de la colonne (le
    // sélecteur montre le libellé, la feuille indexe par clé). Sans cette résolution, un
    // prix source désigné par son libellé n'était jamais lu — et un prix source manquant
    // vide TOUTES les comparaisons, sans le moindre message. Jumeau du client
    // (`resolveCompareColumns`).
    const keyOf = (name: unknown): string | undefined => {
      const asked = String(name ?? '').trim()
      if (!asked) return undefined
      const cols = products.columns ?? []
      if (cols.some((c) => c.key === asked)) return asked
      return cols.find((c) => c.label === asked)?.key
    }
    const refColumn = keyOf(config.refColumn)
    const ref2Column = keyOf(config.ref2Column)
    const eanColumn = keyOf(config.eanColumn)
    const nameColumn = keyOf(config.nameColumn)
    const familyColumn = keyOf(config.familyColumn)
    const priceColumn = keyOf(config.priceColumn)
    const descriptionColumn = keyOf(config.descriptionColumn)
    const urlColumn = keyOf(config.urlColumn)

    // Colonnes d'AFFICHAGE — jumeau strict du client : sans elles, un catalogue écrit
    // par le cron perdrait taxonomie et visuels, et l'écran « Concurrents » resterait
    // vide selon que le run vient du navigateur ou de la nuit.
    // ⚠ Les LIGNES entrent dans la résolution (jumeau du client) : elles seules disent
    // lequel de « SOUS FAMILLE » et « PRODUCTGROUP » contient l'autre.
    const disp = pickDisplayColumns(products.columns ?? [],
      { description: descriptionColumn, taxo: typeof config.taxoColumns === 'string' ? config.taxoColumns : '' },
      rawRows)
    if (disp.taxo.length > 0) {
      ctx.log('info', t(ctx.locale, 'run.compareCatalog.taxoColumns', { list: disp.taxo.join(' › ') }))
    }

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
    const harvestBySite = new Map<string, { lastMs: number; cumulMs: number; progress: number; sweeps: number }>()
    // ⚠ Étape MUETTE la plus longue (jumeau du client) : tout l'index de chaque site est
    // gardé en mémoire jusqu'à la fin du run. Le cumul journalisé dit si le run travaille.
    const tIndex = Date.now()
    let readCount = 0
    // ⚠ UN SEUL INDEX EN MÉMOIRE À LA FOIS (jumeau du client) : la Cloud Function plafonne
    // à 512 Mio. Chaque site est apparié dès qu'il est lu, seules les cellules PROUVÉES
    // sont retenues, et son index part au ramasse-miettes avant la lecture du suivant.
    const vatRate = Math.max(0, Number(config.vatRate) || 20) / 100
    // Mêmes règles que le navigateur : elles vivent dans le suivi. Un cron qui resterait
    // sur les littéraux produirait un second rapport pour le même suivi, sans que rien
    // ne le signale — c'est tout l'intérêt de les avoir mises en Firestore.
    const rules = await loadPairingRules(ctx.uid, watchId)
    if (rulesDifferFromDefault(rules)) {
      ctx.log('info', t(ctx.locale, 'run.compareCatalog.rules', { summary: JSON.stringify(summarizeRules(rules)) }))
    }
    const pairing = createPairingRun(sourceProducts, { vatRate, rules })
    for (const s of siteRefs) {
      if (ctx.signal.aborted) break
      const meta = await loadCompetitorMeta(ctx.uid, watchId, s.siteId)
      if (meta?.cumulHarvestMs != null) harvestBySite.set(s.siteId, { lastMs: meta.lastHarvestMs ?? 0, cumulMs: meta.cumulHarvestMs, progress: meta.harvestProgress ?? 0, sweeps: meta.harvestSweeps ?? 0 })
      const listings = await loadAllListings(ctx.uid, watchId, s.siteId)
      readCount += listings.length
      pairing.addSite(s, listings)
      ctx.log('info', t(ctx.locale, 'run.compareCatalog.siteIndexCount', { domain: s.domain, count: listings.length }))
    }
    ctx.log('info', t(ctx.locale, 'run.compareCatalog.indexLoaded', {
      count: readCount, sites: siteRefs.length, s: ((Date.now() - tIndex) / 1000).toFixed(1),
    }))

    // Garde-fou (jumeau du client) : index vide sur TOUS les sites = la moisson n'a rien
    // écrit sous CE suivi (identifiant de suivi divergent, casse/espace, ou moisson non
    // lancée). Échec explicite plutôt qu'une matrice vide qui ferait planter l'export.
    const totalListings = readCount
    if (totalListings === 0) {
      throw new Error(t(ctx.locale, 'run.compareCatalog.emptyIndex', { sites: sites.length, watchId }))
    }

    // En-têtes de sortie = noms de colonnes de la source (suffixés du concurrent).
    const labels = { ref: refColumn, ean: eanColumn, name: nameColumn, family: familyColumn, price: priceColumn }
    // Plus de passe d'appariement : elle a eu lieu site par site, pendant la lecture.
    // Champs retenus par concurrent (jumeau du client) : vide = tous.
    const picked = String(config.siteFields ?? '').split(',').map((v) => v.trim()).filter(Boolean)
    const siteFields = picked.length > 0 ? new Set(picked as SiteField[]) : undefined
    if (siteFields) {
      ctx.log('info', t(ctx.locale, 'run.compareCatalog.siteFields', {
        kept: siteFields.size, total: SITE_FIELDS.length, columns: siteFields.size * siteRefs.length,
      }))
    }
    const m = matrixFromPairing(sourceProducts, siteRefs, pairing, { labels, siteFields })
    ctx.log('info', t(ctx.locale, 'run.compareCatalog.matchedBreakdown', {
      matched: m.matched, exact: m.matchedExact, originOnly: m.matchedOriginOnly,
      unmatched: m.unmatched, noKey: m.noKey,
    }))
    // Jumeau du client : fiches refusées par le libellé, puis 0 apparié.
    if (m.vetoed > 0) ctx.log('info', t(ctx.locale, 'run.compareCatalog.vetoed', { count: m.vetoed }))
    // Jumeau du client : un concurrent écarté de la feuille doit laisser une trace.
    if (m.emptySites.length > 0) {
      ctx.log('info', t(ctx.locale, 'run.compareCatalog.emptySites', {
        count: m.emptySites.length, sites: m.emptySites.join(', '),
      }))
    }
    // Jumeau du client : 0 apparié = matrice VIDE, donc export en échec plus bas. On le
    // dit ici, où l'on sait encore pourquoi (taille et pertinence de l'index).
    if (m.matched === 0) {
      ctx.log('warn', t(ctx.locale, 'run.compareCatalog.noMatchAtAll', {
        listings: totalListings, products: sourceProducts.length,
      }))
    }

    // Persiste le RAPPORT dashboard (comme le node client) → le CRON alimente le tableau
    // de bord Veille tarifaire sans ouvrir l'app. Non bloquant : un échec ne casse pas l'export.
    try {
      ctx.log('info', t(ctx.locale, 'run.compareCatalog.reportBuilding'))
      const report = reportFromPairing(sourceProducts, siteRefs, pairing, { harvestBySite })
      await saveCatalogReport(ctx.uid, watchId, report, siteRefs, Date.now(), { label: ctx.workflowName, rules: summarizeRules(rules) })
      // Catalogue source (comme le node client) : sans lui, un suivi alimenté seulement
      // par le cron n'a rien à relire pour un recalcul mono-site après un ▶ — et l'écran
      // « Concurrents » n'a rien à apparier.
      const tSource = Date.now()
      await saveSourceCatalog(ctx.uid, watchId, sourceProducts, vatRate, { rows: rawRows.length })
        .then((chunks) => ctx.log('info', t(ctx.locale, 'run.compareCatalog.sourceSaved', {
          count: sourceProducts.length, chunks, s: ((Date.now() - tSource) / 1000).toFixed(1),
        })))
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
