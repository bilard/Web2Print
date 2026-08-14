import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
// Node « Comparer catalogue » : croise ta feuille de produits (réf/EAN/prix) avec
// l'index concurrent persistant (alimenté par « Moisson concurrents »), et produit la
// matrice produit × concurrent (prix TTC verbatim + barré + HT recalculé + écart +
// stock + lien). L'index est relu depuis Firestore, jamais reçu par un edge : le gros
// volume ne transite pas par la mémoire du run (cf. audit scalabilité).
import { Scale } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelSheet, ExcelColumn, ExcelRow } from '@/features/excel/types'
import { parsePrice, stableId, cell } from '@/features/priceWatch/core'
import { resolveSitesInput } from '@/features/priceWatch/sourceSites'
import { loadAllListings, loadCompetitorMeta, saveCompetitorMeta } from '@/features/priceWatch/catalog/store'
import { matrixFromPairing, SITE_FIELDS, type SiteField, type SiteRef, type MatrixColumn } from '@/features/priceWatch/catalog/matrix'
import { extractOriginRefs, type SourceProduct } from '@/features/priceWatch/catalog/match'
import { createPairingRun } from '@/features/priceWatch/catalog/pairingRun'
import { reportFromPairing } from '@/features/priceWatch/catalog/report'
import { saveCatalogReport, saveSourceCatalog } from '@/features/priceWatch/reportStore'
import { resolveCompareColumns, hasNoJoinKey } from '@/features/priceWatch/catalog/compareColumns'
import { loadPairingRules } from '@/features/priceWatch/pairingRulesStore'
import { rulesDifferFromDefault, summarizeRules } from '@/features/priceWatch/catalog/pairingRules'
import { pickDisplayColumns, taxoPathOf, trimDescription } from '@/features/priceWatch/catalog/displayColumns'
// `run()` n'est pas un composant : helper `t()` de module (lit la locale courante).
import { t } from '@/lib/i18n'

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
  /** Niveaux de taxonomie, du plus large au plus fin, séparés par `>`. Vide = détection. */
  taxoColumns: string
  /** Champs exportés par concurrent (« nom,prix_ttc,… »). Vide = tous. */
  siteFields: string
  vatRate: number
}
interface CompareInputs { products?: ExcelSheet; harvest?: unknown; sites?: unknown }
type CompareOutputs = { matrix: ExcelSheet }

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
      ...(c.group ? { group: c.group } : {}),
    }
  })
  // Ligne de titres de blocs : quatorze concurrents partagent les mêmes libellés de
  // colonnes (« Prix TTC », « Lien »…). Sans elle, arrivé au milieu du tableau plus rien
  // ne dit de quel concurrent on lit les prix.
  return { name: 'Veille tarifaire', columns, rows: rows as ExcelRow[], taxonomy: [], groupHeaderRow: true }
}


/**
 * Textes d'avant enrichissement portés par les colonnes jumelles.
 *
 * ⚠ Un original IDENTIQUE au texte courant n'est pas conservé : la ligne n'a pas été
 * révisée (ou l'a été à l'identique), et proposer « voir l'original » sur deux textes
 * égaux ferait douter de l'écran plutôt que de la donnée.
 */
function sourceTexts(
  row: Record<string, unknown>,
  nameCol?: string,
  descCol?: string,
): { nameSource?: string; descriptionSource?: string } {
  const out: { nameSource?: string; descriptionSource?: string } = {}
  const read = (colKey?: string): string | undefined => {
    if (!colKey) return undefined
    const v = row[`${colKey} (source)`]
    const s = v == null ? '' : String(v).trim()
    return s || undefined
  }
  const n = read(nameCol)
  if (n && n !== cell(row, nameCol)) out.nameSource = n
  const d = read(descCol)
  if (d && d !== cell(row, descCol)) out.descriptionSource = trimDescription(d)
  return out
}

const compareCatalogNode: NodeSpec<CompareConfig, CompareInputs, CompareOutputs> = {
  type: 'compare-catalog',
  category: 'logic',
  labelKey: 'node.compare-catalog.label',
  descriptionKey: 'node.compare-catalog.desc',
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
    // Entrée d'ORDONNANCEMENT (facultative), comme `harvest` : brancher « Règles
    // d'appariement » ici force l'écriture des règles AVANT que la comparaison ne les
    // relise. La donnée est ignorée — les règles sont lues en Firestore, pas sur l'edge —
    // mais sans ce lien, rien ne garantit l'ordre des deux nodes dans un même run, et le
    // comparatif appliquerait les règles de la veille.
    { name: 'rules', type: 'rules' },
  ],
  outputs: [{ name: 'matrix', type: 'sheet' }],
  configSchema: [
    {
      name: 'sites', kind: 'textarea', label: 'Sites concurrents (un par ligne)',
      helpKey: 'node.compare-catalog.f1',
      disabledWhen: (_c, wired) => wired('sites'),
      disabledNoteKey: 'node.compare-catalog.f2',
    },
    { name: 'refColumn', kind: 'columnRef', labelKey: 'node.compare-catalog.refColumn.label', helpKey: 'node.compare-catalog.refColumn.help' },
    { name: 'ref2Column', kind: 'columnRef', labelKey: 'node.compare-catalog.ref2Column.label', helpKey: 'node.compare-catalog.ref2Column.help' },
    { name: 'eanColumn', kind: 'columnRef', label: 'Colonne EAN' },
    { name: 'nameColumn', kind: 'columnRef', label: 'Colonne Nom' },
    { name: 'familyColumn', kind: 'columnRef', labelKey: 'node.compare-catalog.familyColumn.label', helpKey: 'node.compare-catalog.familyColumn.help' },
    { name: 'priceColumn', kind: 'columnRef', label: 'Colonne Mon prix (HT)' },
    { name: 'descriptionColumn', kind: 'columnRef', labelKey: 'node.compare-catalog.descriptionColumn.label', helpKey: 'node.compare-catalog.descriptionColumn.help' },
    { name: 'urlColumn', kind: 'columnRef', labelKey: 'node.compare-catalog.urlColumn.label', helpKey: 'node.compare-catalog.urlColumn.help' },
    { name: 'taxoColumns', kind: 'columnList', labelKey: 'node.compare-catalog.taxoColumns.label', helpKey: 'node.compare-catalog.taxoColumns.help' },
    {
      name: 'siteFields', kind: 'multiSelect',
      labelKey: 'node.compare-catalog.siteFields.label', helpKey: 'node.compare-catalog.siteFields.help',
      options: SITE_FIELDS.map((f) => ({ value: f.value, label: f.label })),
    },
    { name: 'vatRate', kind: 'number', labelKey: 'node.compare-catalog.vatRate.label', helpKey: 'node.compare-catalog.vatRate.help' },
    {
      name: 'watchId', kind: 'text', labelKey: 'node.compare-catalog.watchId.label', helpKey: 'node.compare-catalog.watchId.help',
      disabledWhen: (_c, wired) => wired('sites'),
      disabledNoteKey: 'node.compare-catalog.f3',
    },
    { name: 'label', kind: 'text', labelKey: 'node.compare-catalog.watchLabel.label', helpKey: 'node.compare-catalog.watchLabel.help' },
  ],
  defaultConfig: {
    watchId: '', label: '', sites: '', vatRate: 20,
    refColumn: 'reference', ref2Column: '', eanColumn: 'ean', nameColumn: 'name',
    familyColumn: 'family', priceColumn: 'price', descriptionColumn: 'description', urlColumn: '',
    taxoColumns: '',
    // Défaut SANS « Image » ni « Correspondance » : deux colonnes par concurrent, soit
    // vingt-huit sur quatorze sites, qu'on ne relit qu'en contrôlant la qualité des
    // appariements. Elles restent à un clic — mieux vaut les rajouter quand on en a besoin
    // que traîner 126 colonnes dès la première feuille.
    siteFields: 'nom,prix_ttc,prix_ht,prix_barre,ecart,stock,url',
  },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    // ⚠ Jalons en CONSOLE, en plus du journal du node. Sur ce volume (400 000+ fiches en
    // mémoire), l'onglet cesse de repeindre bien avant de s'arrêter de calculer : le
    // journal semble alors figé à la dernière ligne rendue, et on ne sait plus distinguer
    // « ça travaille » de « c'est bloqué ». La console, elle, écrit toujours.
    const t0 = performance.now()
    const mark = (step: string) =>
      console.info(`[compare-catalog] ${step} — ${Math.round((performance.now() - t0) / 1000)}s`)
    const uid = getWorkspaceUid()
    if (!uid) throw new Error(t('run.notSignedIn'))
    // Sites + identité du suivi : le port `sites` (node « Sites sources ») GAGNE ;
    // sinon repli config locale (textarea + watchId dérivé de l'id du workflow →
    // même suivi que « Moisson concurrents » du même workflow, sans rien saisir).
    const { watchId, sites, fromPort } = resolveSitesInput(inputs.sites, {
      sitesText: config.sites, watchIdRaw: config.watchId, workflowId: ctx.workflowId,
    })
    if (fromPort) ctx.log('info', t('run.sourceSites.listReceivedActive', { count: sites.length }))
    const rawRows = (inputs.products?.rows ?? []) as Record<string, unknown>[]

    // ⚠⚠ FAIL-CLOSED — la feuille reçue est-elle la VRAIE feuille, ou l'échantillon
    // d'aperçu ? Les sorties d'un run sont persistées PLAFONNÉES à 100 lignes
    // (`runHistoryClient.sanitize`), et l'éditeur les réinjecte à l'ouverture. Relancer
    // CETTE SEULE CARTE après un rechargement de page fait donc tourner l'appariement sur
    // les cent premières lignes d'un catalogue qui en compte cent quinze mille — sans que
    // rien ne le dise, puisque le run réussit.
    //
    // Cas VÉCU (2026-08-12) : 25 092 appariés remplacés par 91, et le catalogue source
    // persisté réécrit avec 99 produits. Le garde-fou de non-régression ne protège que le
    // RECALCUL automatique (`recomputeReport`) — ce node, lui, est souverain et écrit
    // toujours. Il doit donc refuser lui-même : `totalRows` n'est posé QUE par la
    // persistance, sa seule présence au-dessus du nombre de lignes signe l'échantillon.
    const sampledTotal = (inputs.products as { totalRows?: number } | undefined)?.totalRows
    if (typeof sampledTotal === 'number' && sampledTotal > rawRows.length) {
      throw new Error(t('run.compareCatalog.sampledInput', { got: rawRows.length, total: sampledTotal }))
    }

    // Colonnes RÉSOLUES contre la feuille réellement branchée. Les valeurs par défaut du
    // node (`reference`, `ean`, `price`…) ne sont jamais vides : si la source nomme ses
    // en-têtes autrement, elles pointaient dans le vide et le run réussissait en
    // n'appariant rien. Un choix explicite VALIDE prime toujours ; on ne devine que ce
    // qui ne désignait aucune colonne existante.
    const sheetColumns = (inputs.products?.columns ?? []).map((c) => ({ key: c.key, label: c.label }))
    const resolved = resolveCompareColumns(sheetColumns, {
      ref: config.refColumn, ref2: config.ref2Column, ean: config.eanColumn,
      name: config.nameColumn, family: config.familyColumn, price: config.priceColumn,
      description: config.descriptionColumn, url: config.urlColumn,
    })
    const col = {
      ref: resolved.columns.ref, ref2: resolved.columns.ref2, ean: resolved.columns.ean,
      name: resolved.columns.name, family: resolved.columns.family, price: resolved.columns.price,
      description: resolved.columns.description, url: resolved.columns.url,
    }
    if (resolved.guessed.length > 0) {
      ctx.log('warn', t('run.compareCatalog.columnsGuessed', {
        list: resolved.guessed.map((f) => `${f} → « ${col[f]} »`).join(', '),
      }))
    }
    if (resolved.missing.length > 0) {
      ctx.log('warn', t('run.compareCatalog.columnsMissing', {
        list: resolved.missing.join(', '),
        headers: sheetColumns.map((c) => c.key).join(', ').slice(0, 300),
      }))
    }
    if (sheetColumns.length > 0 && hasNoJoinKey(resolved)) {
      throw new Error(t('run.compareCatalog.noJoinKey', {
        headers: sheetColumns.map((c) => c.key).join(', ').slice(0, 300),
      }))
    }

    if (sites.length === 0) { ctx.log('warn', t('run.noCompetitor')); return { matrix: toSheet([], []) } }
    if (rawRows.length === 0) { ctx.log('warn', t('run.emptySheet')); return { matrix: toSheet([], []) } }

    // Colonnes d'AFFICHAGE (description, visuel, taxonomie) : elles ne servent pas à
    // l'appariement mais voyagent avec le catalogue source — le fichier F1 n'est pas une
    // base du PIM, l'explorateur n'a aucun autre moyen de les retrouver.
    // ⚠ Les LIGNES entrent dans la résolution : elles seules disent lequel de
    // « SOUS FAMILLE » et « PRODUCTGROUP » contient l'autre, et quelles colonnes de
    // taxonomie sont vides d'un bout à l'autre du fichier.
    const disp = pickDisplayColumns(sheetColumns,
      { description: config.descriptionColumn, taxo: config.taxoColumns }, rawRows)
    if (disp.image || disp.description) {
      ctx.log('info', t('run.compareCatalog.displayColumns', {
        list: [disp.description, disp.image].filter(Boolean).join(' · '),
      }))
    }
    // Une saisie qui ne désigne aucune colonne DOIT se voir : sans ce message, le repli
    // sur la détection ressemble en tout point à une prise en compte.
    if ((config.taxoColumns ?? '').trim() && !disp.taxoDeclared) {
      ctx.log('warn', t('run.compareCatalog.taxoConfigIgnored', {
        asked: config.taxoColumns.trim(),
        headers: sheetColumns.map((c) => c.key).join(', ').slice(0, 300),
      }))
    }
    // La hiérarchie retenue est ANNONCÉE : c'est elle qui dessine l'arbre de l'écran
    // « Concurrents », et une racine perdue ne se voit qu'une fois l'arbre décapité.
    if (disp.taxo.length > 0) {
      ctx.log('info', t('run.compareCatalog.taxoColumns', { list: disp.taxo.join(' › ') }))
    } else if (sheetColumns.length > 0) {
      ctx.log('warn', t('run.compareCatalog.noTaxoColumn'))
    }

    // Produits source : identité + clés (dont réf d'origine extraites de la description).
    const products: SourceProduct[] = []
    const seen = new Set<string>()
    for (const row of rawRows) {
      const ref = cell(row, col.ref)
      const ean = cell(row, col.ean)
      const name = cell(row, col.name) ?? ref ?? ean ?? ''
      const id = stableId(ref ?? ean ?? name)
      if (seen.has(id)) continue
      seen.add(id)
      const priceRaw = cell(row, col.price)
      const price = priceRaw != null ? parsePrice(priceRaw) : NaN
      products.push({
        id, name, ref, ref2: cell(row, col.ref2), ean,
        originRefs: extractOriginRefs(cell(row, col.description)),
        price: Number.isNaN(price) ? undefined : price,
        ...(cell(row, col.url) ? { url: cell(row, col.url) } as object : {}),
        ...(cell(row, col.family) ? { family: cell(row, col.family) } as object : {}),
        ...((d) => (d ? { description: d } : {}))(trimDescription(disp.description ? row[disp.description] : undefined)),
        ...(disp.image && cell(row, disp.image) ? { image: cell(row, disp.image) } as object : {}),
        ...((p) => (p.length > 0 ? { taxo: p } : {}))(taxoPathOf(row, disp.taxo)),
        // Mémoire de l'original, si la feuille a traversé « Enrichir les textes ». Repérée
        // à la seule convention « <colonne> (source) » : un réglage de plus serait un
        // réglage de plus à oublier, et l'avant/après disparaîtrait sans un mot.
        ...sourceTexts(row, col.name, disp.description),
      })
    }

    // Le dédoublonnage ci-dessus se fait sur `ref ?? ean ?? name` : une colonne de
    // référence mal mappée fait retomber l'identité sur le NOM, et des milliers de
    // lignes distinctes s'effondrent alors en une poignée. Rendre l'écart visible.
    ctx.log('info', t('run.compareCatalog.sourceKept', { count: products.length, rows: rawRows.length }))
    if (products.length < rawRows.length * 0.9) {
      ctx.log('warn', t('run.compareCatalog.duplicatesDropped', {
        count: rawRows.length - products.length,
      }))
    }

    // Relecture de l'index concurrent depuis Firestore (pas via un edge).
    //
    // ⚠ ÉTAPE MUETTE LA PLUS LONGUE du node. Sur un suivi mûr, ce sont des centaines de
    // milliers de fiches relues site par site, tout gardé en mémoire jusqu'à la fin du
    // run : sans avancement, un node qui travaille ne se distingue pas d'un node figé.
    // D'où le pourcentage sur la carte et le cumul journalisé à chaque site.
    const siteRefs: SiteRef[] = sites.map((s) => ({ siteId: stableId(s.domain), domain: s.domain }))
    const harvestBySite = new Map<string, { lastMs: number; cumulMs: number; progress: number; sweeps: number }>()
    const tIndex = Date.now()
    let readCount = 0
    // ⚠ UN SEUL INDEX EN MÉMOIRE À LA FOIS. Le node gardait les fiches de TOUS les
    // concurrents jusqu'à la fin du run, puis les parcourait deux fois. Mesuré en prod :
    // 435 756 fiches sur 14 sites, appariées en 37 s — puis un run qui ne se terminait
    // jamais, l'onglet ayant cessé de repeindre. Chaque site est désormais apparié dès
    // qu'il est lu ; seules les cellules PROUVÉES sont retenues, et son index part au
    // ramasse-miettes avant la lecture du suivant.
    // ⚠ TVA résolue AVANT l'appariement : c'est lui qui convertit désormais les prix
    // concurrents, et un taux par défaut appliqué ici diviserait tous les prix par 21.
    const vatRate = Math.max(0, (config.vatRate || 20)) / 100
    // Règles d'appariement du suivi. Relues en Firestore et non reçues sur un edge :
    // l'écran « Concurrents » et les crons lisent le même document, et un réglage qui ne
    // vaudrait que pour ce node ne s'appliquerait qu'à moitié.
    const stored = await loadPairingRules(uid, watchId)
    if (rulesDifferFromDefault(stored.rules)) {
      ctx.log('info', t('run.compareCatalog.rules', { summary: JSON.stringify(summarizeRules(stored.rules)) }))
    }
    const pairing = createPairingRun(products, { vatRate, rules: stored.rules })
    for (const [i, s] of siteRefs.entries()) {
      if (ctx.signal.aborted) break
      const meta = await loadCompetitorMeta(uid, watchId, s.siteId)
      if (meta?.cumulHarvestMs != null) harvestBySite.set(s.siteId, { lastMs: meta.lastHarvestMs ?? 0, cumulMs: meta.cumulHarvestMs, progress: meta.harvestProgress ?? 0, sweeps: meta.harvestSweeps ?? 0 })
      const listings = await loadAllListings(uid, watchId, s.siteId)
      readCount += listings.length
      pairing.addSite(s, listings)
      ctx.log('info', t('run.compareCatalog.siteIndexCount', { domain: s.domain, count: listings.length }))
      mark(`${s.domain} apparié`)
      // Lecture + appariement vont de pair : ensemble, ils occupent les 80 premiers %.
      ctx.setProgress?.(Math.round(((i + 1) / siteRefs.length) * 80))
    }
    ctx.log('info', t('run.compareCatalog.indexLoaded', {
      count: readCount, sites: siteRefs.length, s: ((Date.now() - tIndex) / 1000).toFixed(1),
    }))
    // ⚠⚠ Règle métier : origine avec origine, adaptable avec adaptable. Ce que l'arbitrage
    // a écarté se DIT — c'est une perte voulue, et c'est le seul endroit où son ampleur se
    // mesure sur un vrai catalogue (aucune fixture ne porte 400 000 fiches).
    if (pairing.totals.natureYielded > 0) {
      ctx.log('info', t('run.compareCatalog.natureArbitrated', { count: pairing.totals.natureYielded }))
    }

    // Garde-fou : index vide sur TOUS les sites = la moisson n'a rien écrit sous CE
    // suivi. Cause classique : l'« Identifiant du suivi » de « Moisson concurrents »
    // diffère de celui-ci (casse/espace) → chemins Firestore distincts. On échoue ICI
    // avec un message actionnable plutôt que de produire une matrice vide qui fera
    // planter l'export en aval avec un message trompeur. (Un index NON vide qui apparie
    // 0 produit reste légitime — c'est un recouvrement partiel, pas une erreur.)
    const totalListings = readCount
    if (totalListings === 0) {
      throw new Error(t('run.compareCatalog.emptyIndex', { sites: sites.length, watchId }))
    }

    // En-têtes de sortie = noms de colonnes de la source (suffixés du concurrent).
    // En-têtes de sortie : les noms RÉELS de la feuille, pas ceux configurés.
    const labels = {
      ref: col.ref, ean: col.ean, name: col.name, family: col.family, price: col.price,
    }
    // Appariement : passe SYNCHRONE de plusieurs minutes sur une base F1 × 14 concurrents.
    // Annoncée AVANT, parce qu'elle ne rend la main qu'à la fin — aucun log ne peut sortir
    // pendant, et le silence qui suivait passait pour un plantage.
    // Plus de « passe d'appariement » : elle a eu lieu site par site, pendant la lecture.
    // Il ne reste qu'à assembler — la matrice et le rapport lisent les MÊMES cellules.
    // Champs retenus par concurrent : à quatorze sites, neuf colonnes chacun font 126
    // colonnes dont la plupart ne sont jamais lues. Vide = tous (réglage jamais touché).
    const picked = (config.siteFields ?? '').split(',').map((v) => v.trim()).filter(Boolean)
    const siteFields = picked.length > 0 ? new Set(picked as SiteField[]) : undefined
    if (siteFields) {
      ctx.log('info', t('run.compareCatalog.siteFields', {
        kept: siteFields.size, total: SITE_FIELDS.length, columns: siteFields.size * siteRefs.length,
      }))
    }
    const m = matrixFromPairing(products, siteRefs, pairing, { labels, siteFields })
    mark('matrice — assemblée')
    ctx.setProgress?.(75)
    ctx.reportCount?.(m.matched)
    ctx.log('info', t('run.compareCatalog.matchedBreakdown', {
      matched: m.matched, exact: m.matchedExact, originOnly: m.matchedOriginOnly,
      unmatched: m.unmatched, noKey: m.noKey,
    }))
    // 0 apparié n'est PAS une erreur (index maigre ou hors sujet = recouvrement nul
    // légitime), mais la matrice ne portant que les lignes appariées, elle sort vide et
    // l'export en aval échoue plus bas avec un message qui ne dit pas d'où ça vient.
    // On raccorde les deux ICI, là où l'information existe encore.
    // Fiches prouvées par la référence mais REFUSÉES par le libellé (« GICLEUR
    // CARBURATEUR » ↔ « Filtre à huile » sous la même réf.). Sans ce chiffre, ces
    // produits passent en « sans correspondance » sans que rien ne dise pourquoi.
    if (m.vetoed > 0) ctx.log('info', t('run.compareCatalog.vetoed', { count: m.vetoed }))
    // Un concurrent qui disparaît de la feuille sans un mot, c'est le prochain « où sont
    // mes concurrents ? » — on le dit, avec le nom des sites.
    if (m.emptySites.length > 0) {
      ctx.log('info', t('run.compareCatalog.emptySites', {
        count: m.emptySites.length, sites: m.emptySites.join(', '),
      }))
    }
    if (m.matched === 0) {
      ctx.log('warn', t('run.compareCatalog.noMatchAtAll', {
        listings: totalListings, products: products.length,
      }))
    }

    // Persiste le RAPPORT dashboard (KPIs + stats/concurrent + liste rangée bornée +
    // point de tendance). Non bloquant : un échec de persistance ne doit pas casser
    // l'export. Le tableau de bord « Veille tarifaire » lit ce rapport par watchId.
    try {
        ctx.log('info', t('run.compareCatalog.reportBuilding'))
      mark('rapport — début')
      const report = reportFromPairing(products, siteRefs, pairing, { harvestBySite })
      mark('rapport — construit')
      await saveCatalogReport(uid, watchId, report, siteRefs, Date.now(), {
        label: (config.label ?? '').trim() || ctx.workflowName || '',
        workflowId: ctx.workflowId,
        // Le jeu de règles EFFECTIF voyage avec les chiffres qu'il a produits : sans lui,
        // deux rapports du même suivi peuvent être incomparables sans que rien ne le dise.
        rules: summarizeRules(stored.rules),
      })
      mark('rapport — écrit')
      ctx.setProgress?.(90)
      // Persiste le catalogue source → le recalcul mono-site (après un ▶ dans « Sites
      // sources ») pourra reconstruire le benchmark sans relancer tout le workflow.
      // C'est AUSSI ce que lit l'écran « Concurrents » pour apparier : son avancement est
      // journalisé, un catalogue F1 s'écrit en dizaines de tranches.
      const tSource = Date.now()
      await saveSourceCatalog(uid, watchId, products, vatRate, {
        rows: rawRows.length,
        onProgress: (done, total) => {
          if (done > 0) ctx.log('info', t('run.compareCatalog.sourceSaving', { done, total }))
          ctx.setProgress?.(90 + Math.round((done / Math.max(1, total)) * 10))
        },
      }).then((chunks) => (mark('catalogue source — écrit'), ctx.log('info', t('run.compareCatalog.sourceSaved', {
        count: products.length, chunks, s: ((Date.now() - tSource) / 1000).toFixed(1),
      })))).catch((e) => ctx.log('warn', t('run.sourceCatalogNotPersisted', { message: e instanceof Error ? e.message : String(e) })))
      // Recale le compteur live « Fiches collectées » sur le compte dédupliqué exact.
      await Promise.all(report.byCompetitor.map((c) =>
        saveCompetitorMeta(uid, watchId, c.siteId, { productCount: c.audit.indexed })))
      ctx.log('info', t('run.dashboardSaved', { watchId }))
      ctx.setProgress?.(100)
    } catch (err) {
      ctx.log('warn', t('run.dashboardNotSaved', { message: err instanceof Error ? err.message : String(err) }))
    }
    return { matrix: toSheet(m.columns, m.rows) }
  },
}

nodeRegistry.register(compareCatalogNode)
