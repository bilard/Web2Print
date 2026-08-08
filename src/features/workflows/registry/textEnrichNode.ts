// Node « Enrichir les textes » : traduit, étoffe et structure les champs rédigés des
// fiches d'un projet PIM, en gardant l'original comme mémoire.
//
// ⚠ La carte lit et écrit dans le PIM, elle ne fait pas transiter les fiches par un edge.
// C'est le même choix que « Comparer catalogue » : le volume ne doit pas tenir dans la
// mémoire du run, et le texte enrichi doit vivre là où les écrans le lisent. Une feuille
// traversant le graphe ne porterait pas les révisions, et il faudrait ensuite réécrire la
// source — ce que l'utilisateur a explicitement exclu : la source ne se touche jamais.
//
// ⚠ Le passage est IDEMPOTENT par marqueur (`nature:langue:version de consigne`). Relancer
// la carte ne retouche pas ce qui a déjà été traité ; c'est en incrémentant la version de
// la consigne qu'on rejoue un champ. Sans ça, un cron quotidien réécrirait les mêmes
// fiches tous les jours, à la fois en facture et en révisions empilées.
import { Languages } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { generateJson } from '@/features/ai/llmRouter'
import { pushAiUsageListener } from '@/features/stats/aiUsageTracking'
import { EnrichBatchSchema } from '@/features/textEnrich/prompt'
import { makeCallBatch } from '@/features/textEnrich/batchCaller'
import { planPass, runPass, type EnrichUnit } from '@/features/textEnrich/pass'
import { applyRevision, type EnrichPass } from '@/features/textEnrich/revision'
import { loadTargets, saveRevisions, savePass } from '@/features/textEnrich/enrichStore'
import {
  DEFAULT_TEXT_ENRICH_CONFIG, configToPlans, configProblem, protectedFieldsOf,
  type TextEnrichConfig,
} from '@/features/textEnrich/nodeConfig'
import { TextEnrichConfigPanel } from './textEnrichConfig'
// `run()` n'est pas un composant : helper `t()` de module (lit la locale courante).
import { t } from '@/lib/i18n'

type EnrichOutputs = { enriched: { projectId: string; passId: string; revised: number } }

const textEnrichNode: NodeSpec<TextEnrichConfig, Record<string, never>, EnrichOutputs> = {
  type: 'text-enrich',
  category: 'enrichment',
  labelKey: 'node.text-enrich.label',
  descriptionKey: 'node.text-enrich.desc',
  icon: Languages,
  inputs: [],
  outputs: [{ name: 'enriched', type: 'sheet' }],
  // Les plans de champs sont une liste d'objets : le schéma générique ne sait pas les
  // rendre. Le panneau dédié s'en charge, le schéma garde les réglages scalaires.
  configSchema: [
    { name: 'projectId', kind: 'text', labelKey: 'node.text-enrich.projectId', required: true },
    { name: 'capUsd', kind: 'number', labelKey: 'node.text-enrich.capUsd', default: 5 },
    { name: 'maxUnits', kind: 'number', labelKey: 'node.text-enrich.maxUnits', default: 500 },
    { name: 'withNote', kind: 'checkbox', labelKey: 'node.text-enrich.withNote', default: true },
    { name: 'dryRun', kind: 'checkbox', labelKey: 'node.text-enrich.dryRun', default: false },
  ],
  defaultConfig: DEFAULT_TEXT_ENRICH_CONFIG,
  cardSummary: (c) => {
    const plans = configToPlans(c)
    if (plans.length === 0) return t('node.text-enrich.summaryNothing')
    const fields = [...new Set(plans.map((p) => p.key))].join(', ')
    return c.dryRun
      ? t('node.text-enrich.summaryDry', { fields })
      : t('node.text-enrich.summary', { fields, cap: c.capUsd })
  },
  ConfigComponent: TextEnrichConfigPanel,
  runtime: 'client',
  run: async (ctx, config) => {
    // Vérifié AVANT tout appel : découvrir une consigne vide après trois cents fiches
    // coûte de l'argent ET des révisions à annuler une à une.
    const problem = configProblem(config)
    if (problem) throw new Error(t(`run.textEnrich.problem.${problem}` as 'run.textEnrich.problem.no-project'))

    const targets = await loadTargets(config.projectId)
    const plans = configToPlans(config)
    const { units, counts } = planPass(targets, plans)

    // Chiffré AVANT d'appeler quoi que ce soit : l'utilisateur voit le volume réel, pas
    // une estimation. C'est aussi ce que rend le mode simulation.
    ctx.log('info', t('run.textEnrich.planned', {
      units: units.length,
      considered: counts.considered,
      done: counts.skipped['already-done'],
    }))
    if (config.dryRun) {
      ctx.log('info', t('run.textEnrich.dryRun'))
      return { enriched: { projectId: config.projectId, passId: '', revised: 0 } }
    }
    if (units.length === 0) {
      ctx.log('info', t('run.textEnrich.nothingToDo'))
      return { enriched: { projectId: config.projectId, passId: '', revised: 0 } }
    }

    // ⚠ La borne s'applique APRÈS le chiffrage, pour que le journal annonce le total réel
    // (« 41 200 à faire, 500 traités ») et non la portion tronquée. Un utilisateur qui lit
    // « 500 à faire » croirait le catalogue presque terminé.
    const capped = units.slice(0, Math.max(1, config.maxUnits))
    if (capped.length < units.length) {
      ctx.log('warn', t('run.textEnrich.capped', { kept: capped.length, total: units.length }))
    }

    const passId = `${Date.now().toString(36)}-${(ctx.workflowId ?? 'local').slice(0, 6)}`
    const at = Date.now()
    let spentUsd = 0
    let provider: string | undefined
    let model: string | undefined
    const notes: Record<string, string> = {}
    const revisions: { productId: string; field: string; value: ReturnType<typeof applyRevision> }[] = []
    const byId = new Map(targets.map((tg) => [tg.id, tg]))

    const callBatch = makeCallBatch({
      withNote: config.withNote,
      onNotes: (n) => Object.assign(notes, n),
      generate: (args) => generateJson({
        task: 'data.textEnrich',
        prompt: args.prompt,
        schema: EnrichBatchSchema,
        schemaForLLM: args.schema,
        version: `text-enrich/${passId}`,
        onProviderUsed: (info) => {
          // Journalisé au PREMIER lot seulement : la cascade peut basculer en cours de
          // passage, et une ligne par lot noierait la console sur un gros catalogue.
          if (!provider) ctx.log('info', t('run.textEnrich.provider', { provider: info.provider, model: info.model }))
          provider = info.provider
          model = info.model
        },
        onProviderFailed: (info) => ctx.log('warn', t('run.textEnrich.providerFailed', {
          provider: info.provider, error: info.error.message,
        })),
      }),
    })

    // ⚠ La dépense se mesure par un ÉCOUTEUR posé sur toute la durée du passage :
    // `generateJson` calcule bien un coût mais ne le rend pas à son appelant. Sans cet
    // écouteur, `spentUsd` resterait à zéro et le plafond ne se déclencherait jamais — un
    // garde-fou qui ne garde rien est pire qu'un garde-fou absent, puisqu'on s'y fie.
    const popUsage = pushAiUsageListener((u) => { spentUsd += u.costUsd })
    let result
    try {
      result = await runPass(capped, counts, {
        passId,
        callBatch,
        protectedOf: (unit: EnrichUnit) => protectedFieldsOf(config, byId.get(unit.productId)?.row ?? {}),
        onRevision: (unit, field) => revisions.push({ productId: unit.productId, field: unit.field, value: field }),
        // Une proposition refusée n'est PAS un incident : c'est la vérification qui fait son
        // travail. Elle est tracée pour que l'écran de comparaison puisse l'expliquer, sans
        // faire passer le run en erreur.
        onRejected: (unit, violations) => ctx.log('info', t('run.textEnrich.rejected', {
          product: unit.productId, field: unit.field,
          kinds: [...new Set(violations.map((v) => v.kind))].join(', '),
        })),
        spentUsd: () => spentUsd,
        capUsd: config.capUsd > 0 ? config.capUsd : undefined,
        onChunkDone: (done, total) => ctx.log('info', t('run.textEnrich.progress', { done, total })),
        now: () => at,
      })
    } finally {
      popUsage()
    }

    // Écrites APRÈS le passage, en un bloc : une écriture par lot laisserait, sur une
    // interruption, des fiches révisées sans synthèse — donc invisibles dans l'écran de
    // comparaison, et impossibles à annuler en masse.
    await saveRevisions(config.projectId, revisions.map((r) => ({
      productId: r.productId, field: r.field, value: r.value,
    })))

    const pass: EnrichPass = {
      passId,
      at,
      kind: plans[0].kind,
      targetLang: 'fr',
      promptVersion: plans.map((p) => `${p.key}:${p.promptVersion}`).join(','),
      fields: [...new Set(plans.map((p) => p.key))],
      productIds: result.productIds,
      counts: result.counts,
      ...(spentUsd > 0 ? { costUsd: spentUsd } : {}),
      ...(result.cappedBy ? { cappedBy: result.cappedBy } : {}),
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      ...(Object.keys(notes).length > 0 ? { notes } : {}),
    }
    await savePass(config.projectId, pass)

    if (result.cappedBy === 'spend') ctx.log('warn', t('run.textEnrich.spendCapped', { cap: config.capUsd }))
    ctx.log('info', t('run.textEnrich.done', {
      revised: result.counts.revised, rejected: result.counts.rejected, passId,
    }))

    return { enriched: { projectId: config.projectId, passId, revised: result.counts.revised } }
  },
}

nodeRegistry.register(textEnrichNode)
