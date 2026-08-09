// « Traduire et étoffer les fiches » — la carte de workflow de l'écran du même nom.
//
// ⚠ Pourquoi une SECONDE carte de traduction. « Enrichir les textes » travaille sur la
// feuille qui traverse le graphe : elle meurt avec le run, rien ne retient qu'un texte a
// déjà été traité, et chaque exécution refait — et refacture — le catalogue entier. Celle-ci
// travaille sur le catalogue PERSISTÉ du suivi et écrit dans le même magasin que l'écran :
// elle ne reprend que ce qui l'exige, et l'avant/après reste relisable au matin, bouton
// « Annuler » compris. C'est ce qui la rend tenable en run quotidien.
//
// ⚠ Elle n'écrit PAS dans le catalogue. Les textes réécrits vivent À CÔTÉ : « Comparer
// catalogue » réécrit le catalogue en bloc et les effacerait sans un mot.
import { Languages } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { generateJson } from '@/features/ai/llmRouter'
import { deriveWatchId } from '@/features/priceWatch/sourceSites'
import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { loadSourceCatalog } from '@/features/priceWatch/reportStore'
import { loadTextRevisions, saveTextRevisions, type TextRevision } from '@/features/priceWatch/textRevisionsStore'
import { reviseQueue } from '@/features/priceWatch/textEnrich/staleRevision'
import { chunkByVolume } from '@/features/priceWatch/textEnrich/chunkByVolume'
import {
  ScreenBatchSchema, screenSchemaForLLM, buildScreenPrompt,
} from '@/features/priceWatch/textEnrich/screenPrompt'
import { findViolations } from '@/features/textEnrich/protected'
import { detectLanguage } from '@/features/textEnrich/detectLang'
import { CatalogTextReviseConfigPanel } from './catalogTextReviseConfig'
import { plansToFieldTasks, DEFAULT_REVISE_PLANS, type RevisePlan } from './catalogTextReviseTypes'
import { t } from '@/lib/i18n'

/** Même plafond que l'écran : la réponse pèse au moins autant que l'entrée, plus la note
 *  de chaque fiche. Trop bas, la sortie est tronquée EN SILENCE et le JSON devient
 *  invalide — le run rendrait « 0 traité » sans rien expliquer. */
const MAX_OUTPUT_TOKENS = 16000

interface Config {
  watchId: string
  /** ⚠ Une LISTE de plans, comme sur « Enrichir les textes ». Deux plans sur le même
   *  champ (traduire puis améliorer) sont ici la manière normale de travailler. */
  plans: RevisePlan[]
  scope: 'foreign' | 'foreignPlus' | 'all'
  /** Reprendre les fiches dont le texte d'origine a changé depuis la réécriture. */
  refreshStale: boolean
  /** Plafond DUR par passage. Sans lui, une nuit traite cent mille fiches. */
  maxUnits: number
}

interface RevisionRow {
  _id: string
  produit: string
  motif: string
  avant: string
  apres: string
  justification: string
}

const REVISION_COLUMNS = [
  { key: 'produit', label: 'Produit' },
  { key: 'motif', label: 'Motif' },
  { key: 'avant', label: 'Avant' },
  { key: 'apres', label: 'Après' },
  { key: 'justification', label: 'Ce qui a changé' },
]

const catalogTextReviseNode: NodeSpec<Config, Record<string, never>, { revisions: unknown }> = {
  type: 'catalog-text-revise',
  category: 'enrichment',
  labelKey: 'node.catalog-text-revise.label',
  descriptionKey: 'node.catalog-text-revise.desc',
  icon: Languages,
  // Aucune entrée de DONNÉE : la carte lit le catalogue du suivi, pas une feuille de
  // passage. `after` ne sert qu'à l'ordonnancement — la placer après « Comparer catalogue »
  // garantit qu'elle travaille sur le catalogue du jour.
  inputs: [{ name: 'after', type: 'any' }],
  outputs: [{ name: 'revisions', type: 'sheet' }],
  outputColumns: ['produit', 'motif', 'avant', 'apres', 'justification'],
  configSchema: [
    { name: 'watchId', kind: 'text', labelKey: 'node.catalog-text-revise.watchId', helpKey: 'node.catalog-text-revise.watchId.help' },
    {
      name: 'scope', kind: 'select', labelKey: 'node.catalog-text-revise.scope', default: 'foreign',
      options: [
        { value: 'foreign', labelKey: 'node.catalog-text-revise.scope.foreign' },
        { value: 'foreignPlus', labelKey: 'node.catalog-text-revise.scope.foreignPlus' },
        { value: 'all', labelKey: 'node.catalog-text-revise.scope.all' },
      ],
    },
    { name: 'refreshStale', kind: 'checkbox', labelKey: 'node.catalog-text-revise.refreshStale', helpKey: 'node.catalog-text-revise.refreshStale.help', default: true },
    { name: 'maxUnits', kind: 'number', labelKey: 'node.catalog-text-revise.maxUnits', helpKey: 'node.catalog-text-revise.maxUnits.help', default: 500 },
  ],
  defaultConfig: {
    watchId: '', plans: DEFAULT_REVISE_PLANS,
    scope: 'foreign', refreshStale: true, maxUnits: 500,
  },
  cardSummary: (c) => {
    const on = (c.plans ?? []).filter((p) => p.enabled)
    if (on.length === 0) return t('node.catalog-text-revise.sum.nothing')
    const label = (p: RevisePlan) =>
      `${t(`node.catalog-text-revise.field.${p.field}` as 'node.catalog-text-revise.field.name')} ${t(`node.catalog-text-revise.mode.${p.kind}` as 'node.catalog-text-revise.mode.translate')}`
    return t('node.catalog-text-revise.sum', { modes: on.map(label).join(' · '), max: c.maxUnits || 0 })
  },
  ConfigComponent: CatalogTextReviseConfigPanel,
  runtime: 'client',

  async run(ctx, config) {
    const uid = getWorkspaceUid()
    if (!uid) throw new Error(t('run.notSignedIn'))
    const watchId = deriveWatchId(config.watchId, ctx.workflowId)
    const fields = plansToFieldTasks(config.plans ?? [])
    if (![fields.name, fields.description].some((f) => f.translate || f.improve)) {
      throw new Error(t('run.catalogTextRevise.noMode'))
    }

    const src = await loadSourceCatalog(uid, watchId)
    if (!src) throw new Error(t('run.catalogTextRevise.noCatalog', { watchId }))
    const revisions = await loadTextRevisions(uid, watchId)

    // La langue se juge sur le texte de vente quand il existe : un libellé de pièce est
    // souvent trop court et trop technique pour que le détecteur tranche.
    const langOf = (p: { name: string; description?: string }) => detectLanguage(p.description || p.name).lang
    const accept = config.scope === 'all'
      ? undefined
      : (p: { name: string; description?: string }) => {
          const lang = langOf(p)
          return config.scope === 'foreignPlus' ? lang !== 'fr' : !!lang && lang !== 'fr'
        }

    const queue = reviseQueue(src.products, revisions, { refreshStale: config.refreshStale, accept })
    const cap = Math.max(0, Math.trunc(config.maxUnits) || 0)
    const batch = cap > 0 ? queue.slice(0, cap) : queue
    ctx.log('info', t('run.catalogTextRevise.queue', {
      total: queue.length,
      fresh: queue.filter((q) => q.reason === 'new').length,
      stale: queue.filter((q) => q.reason === 'stale').length,
      taken: batch.length,
    }))
    if (batch.length === 0) return { revisions: { name: 'revisions', columns: REVISION_COLUMNS, rows: [] } }

    const rows: RevisionRow[] = []
    let kept = 0
    let refused = 0
    const chunks = chunkByVolume(batch, (q) => q.product.name.length + (q.product.description?.length ?? 0))
    for (const chunk of chunks) {
      const raw = await generateJson({
        task: 'data.textEnrich',
        prompt: buildScreenPrompt(
          chunk.map((q) => ({
            id: q.product.id, name: q.product.name,
            ...(q.product.description ? { description: q.product.description } : {}),
            lang: langOf(q.product),
          })),
          '',
          { translate: true, improve: false },
          fields,
        ),
        schema: ScreenBatchSchema,
        schemaForLLM: screenSchemaForLLM,
        version: 'catalog-text-revise/v1',
        maxTokens: MAX_OUTPUT_TOKENS,
      })

      const byId = new Map(chunk.map((q) => [q.product.id, q]))
      const written: TextRevision[] = []
      for (const r of raw.results) {
        const target = byId.get(r.id)
        // Un identifiant inconnu trahit une liste décalée : on écarte plutôt que de ranger
        // un texte sur le mauvais produit.
        if (!target) continue
        const p = target.product
        const name = String(r.name ?? '').trim()
        const description = String(r.description ?? '').trim()
        if (!name) continue

        // Même garde que l'écran : une réécriture qui perd une référence ou altère une
        // cote est refusée, pas écrite.
        const violations = findViolations(
          `${p.name} ${p.description ?? ''}`,
          `${name} ${description}`,
          { refs: [p.ref, p.ref2], eans: [p.ean] },
        )
        if (violations.length > 0) { refused++; continue }

        written.push({
          productId: p.id,
          name,
          ...(description ? { description } : {}),
          // ⚠ L'original REMPLACÉ à chaque passage, contrairement au premier jet : c'est
          // lui qui sert de juge de péremption au passage suivant. Le figer ferait
          // rejuger indéfiniment une fiche déjà reprise sur son nouveau texte.
          nameSource: p.name,
          ...(p.description ? { descriptionSource: p.description } : {}),
          ...(r.note ? { note: r.note } : {}),
          // ⚠ Sans la langue, tout ce que ce passage traduit sort du décompte par langue :
          // la ventilation ne compterait que le travail fait à l'écran.
          ...((l) => (l ? { lang: l } : {}))(langOf(p)),
          at: Date.now(),
        })
        rows.push({
          _id: `${p.id}::${target.reason}`,
          produit: p.name,
          motif: t(target.reason === 'new' ? 'run.catalogTextRevise.reason.new' : 'run.catalogTextRevise.reason.stale'),
          avant: p.description || p.name,
          apres: description || name,
          justification: r.note ?? '',
        })
      }

      // ⚠ Écriture À CHAQUE LOT : une erreur au dixième jetterait les neuf premiers, déjà
      // payés au modèle.
      if (written.length > 0) {
        await saveTextRevisions(uid, watchId, written)
        kept += written.length
      }
    }

    ctx.log('info', t('run.catalogTextRevise.done', { kept, refused, asked: batch.length }))
    return { revisions: { name: 'revisions', columns: REVISION_COLUMNS, rows } }
  },
}

nodeRegistry.register(catalogTextReviseNode)
