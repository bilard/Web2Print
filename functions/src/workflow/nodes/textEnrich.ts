// functions/src/workflow/nodes/textEnrich.ts
// Jumeau SERVEUR de « Enrichir les textes » (client :
// src/features/workflows/registry/textEnrichNode.ts).
//
// ⚠ Sans lui, la carte était SAUTÉE par le cron : la feuille la traversait inchangée et le
// run se déclarait réussi sans qu'un seul texte ait été traduit. Un catalogue qui reçoit
// des produits chaque jour ne pouvait donc jamais se tenir à jour tout seul.
//
// ⚠ MODE FEUILLE UNIQUEMENT. Le mode « projet PIM » lit et écrit des fiches par un tout
// autre chemin (`enrichStore`), non porté ici : le cron travaille sur la feuille qui
// traverse le graphe, ce qui est le montage de la veille tarifaire. Un run planifié sur un
// projet PIM échoue donc en le DISANT, plutôt que de traiter autre chose que ce qu'on croit.
import { registerServerNode } from '../registry'
import { configToPlans, configProblem, protectedFieldsOf, type TextEnrichConfig } from '../../textEnrich/nodeConfig'
import { planPass, runPass, type EnrichUnit } from '../../textEnrich/pass'
import { planWaves, runWaves } from '../../textEnrich/planWaves'
import { makeCallBatch } from '../../textEnrich/batchCaller'
import { applySheetRevisions, sheetColumnsWithSources, sheetTargets, type SheetColumn, type SheetRow } from '../../textEnrich/sheetMode'
import { sheetQueue, rememberRows, type EnrichMemory } from '../../textEnrich/sheetMemory'
import { loadEnrichMemory, saveEnrichMemory } from '../../textEnrich/memoryStore'
import { buildPublishedRevisions, type RevisionEvent } from '../../textEnrich/publishRevisions'
import { savePublishedRevisions } from '../../priceWatch/textRevisionsStore'
import { resolveSitesInput } from '../../priceWatch/sourceSites'
import type { CellValue } from '../../excel/types'
import { callLlm, parseLlmJson } from '../llm'
import { t } from '../../i18n'

/** Même plafond que le navigateur : la réponse pèse au moins autant que l'entrée, plus la
 *  justification de chaque texte. Trop bas, elle est tronquée EN SILENCE et le JSON
 *  devient invalide — le passage rendrait « 0 traité » sans rien expliquer. */
const MAX_OUTPUT_TOKENS = 16000

// ⚠ `callLlm` n'annonce AUCUN schéma : `response_format: json_object` n'existe que chez
// DeepSeek et OpenAI. Sans cette instruction, Claude et Gemini répondent en prose et le
// passage ne produirait rien, toutes les nuits, sans rien dire.
const JSON_INSTRUCTION = `

---
Réponds UNIQUEMENT par un JSON de la forme {"results":[{"id":"…","text":"…","note":"…"}]}. Aucun texte avant ou après, aucune balise markdown.`

registerServerNode({
  type: 'text-enrich',
  run: async (ctx, config, inputs) => {
    const sheet = inputs.sheet as { name?: string; columns?: SheetColumn[]; rows?: SheetRow[] } | undefined
    const fromSheet = Array.isArray(sheet?.rows)
    if (!fromSheet) throw new Error(t(ctx.locale, 'run.textEnrich.serverSheetOnly'))

    const cfg = config as unknown as TextEnrichConfig
    // Vérifié AVANT tout appel : découvrir une consigne vide après trois cents fiches
    // coûte de l'argent ET des révisions à annuler une à une.
    const problem = configProblem(cfg, true)
    if (problem) throw new Error(t(ctx.locale, 'run.textEnrich.serverConfig', { code: problem.code }))

    const plans = configToPlans(cfg)
    const planKeys = [...new Set(plans.map((p) => p.key))]
    const allRows: SheetRow[] = sheet?.rows ?? []

    // ⚠ MÊME mémoire que le navigateur, clefée sur la RÉFÉRENCE ARTICLE. Sans elle, le
    // cron refaisait chaque nuit le catalogue entier — et le refacturait.
    const memoryOn = cfg.incremental !== false && !!ctx.workflowId
    const col = (v: unknown) => (typeof v === 'string' ? v.trim() : '') || undefined
    const keyCols = { ref: col(cfg.refField), ean: col(cfg.eanField) }
    const memory: EnrichMemory = memoryOn ? await loadEnrichMemory(ctx.uid, ctx.workflowId!) : {}
    const decisions = memoryOn ? sheetQueue(allRows, planKeys, memory, keyCols) : []
    const rows: SheetRow[] = memoryOn ? (decisions.map((d) => d.row) as SheetRow[]) : allRows
    if (memoryOn) {
      ctx.log('info', t(ctx.locale, 'run.textEnrich.incremental', {
        total: allRows.length, taken: rows.length,
        fresh: decisions.filter((d) => d.reason === 'new').length,
        changed: decisions.filter((d) => d.reason === 'changed').length,
        unknown: decisions.filter((d) => d.reason === 'unknown-key').length,
      }))
    }
    const targets = sheetTargets(rows, planKeys)
    const byId = new Map(targets.map((tg) => [tg.id, tg]))

    // ⚠ Les plans partent en VAGUES, comme au navigateur : deux plans sur une même colonne
    // ne peuvent pas voyager ensemble, et le second doit travailler sur ce que le premier
    // a produit. Le chiffrage préalable porte sur la première vague — les suivantes
    // dépendent de textes qui n'existent pas encore.
    const waves = planWaves(plans)
    const { units, counts } = planPass(targets, waves[0] ?? [])
    ctx.log('info', t(ctx.locale, 'run.textEnrich.planned', {
      units: units.length, considered: counts.considered, done: counts.skipped['already-done'],
    }))
    if (units.length === 0) {
      return { enriched: { name: sheet?.name ?? 'sheet', columns: sheet?.columns ?? [], rows: allRows }, revisions: { name: 'revisions', columns: [], rows: [] } }
    }

    const limit = Number(cfg.maxUnits) > 0 ? Number(cfg.maxUnits) : units.length
    const capped = units.slice(0, limit)
    const notes: Record<string, string> = {}
    const revisions: { productId: string; field: string; before: CellValue; after: CellValue }[] = []
    /** Ce qu'on PUBLIE pour l'écran de relecture — jumeau du navigateur. Sans lui, le cron
     *  traduisait des dizaines de milliers de fiches sans que rien ne le montre nulle part. */
    const events: RevisionEvent[] = []

    const callBatch = makeCallBatch({
      withNote: cfg.withNote,
      onNotes: (n) => Object.assign(notes, n),
      generate: async (args) => {
        const { text } = await callLlm(ctx.uid, args.prompt + JSON_INSTRUCTION, { maxTokens: MAX_OUTPUT_TOKENS })
        const parsed = parseLlmJson<unknown>(text)
        // Un lot illisible doit se voir : rendre un objet vide le confondrait avec « le
        // modèle n'a rien trouvé à changer ».
        if (!parsed) throw new Error(t(ctx.locale, 'run.textEnrich.serverBadJson'))
        return parsed
      },
    })

    const result = await runWaves(waves, targets, capped, counts,
      (batchUnits, batchCounts) => runPass(batchUnits, batchCounts, {
        passId: `${Date.now().toString(36)}-${(ctx.workflowId ?? 'cron').slice(0, 6)}`,
        callBatch,
        protectedOf: (unit: EnrichUnit) => protectedFieldsOf(cfg, byId.get(unit.productId)?.row ?? {}),
        onRevision: (unit, field) => {
          revisions.push({
            productId: unit.productId, field: unit.field,
            before: unit.text, after: field.value as string | number | boolean | null,
          })
          events.push({
            row: unit.row, field: unit.field, kind: unit.plan.kind,
            before: unit.text, after: field.value == null ? '' : String(field.value),
          })
          // ⚠ Le champ est REMPLACÉ en mémoire : sans ça, une seconde vague sur la même
          // colonne relirait le texte d'origine, et l'amélioration s'appliquerait à
          // l'allemand au lieu de la traduction.
          const tg = byId.get(unit.productId)
          if (tg) tg.fields[unit.field] = field
        },
        onRejected: (unit, violations) => ctx.log('info', t(ctx.locale, 'run.textEnrich.rejected', {
          product: unit.productId, field: unit.field,
          kinds: [...new Set(violations.map((v) => v.kind))].join(', '),
        })),
        spentUsd: () => 0,
        onChunkDone: (done, total) => ctx.log('info', t(ctx.locale, 'run.textEnrich.progress', { done, total })),
      }),
      { limit: Number(cfg.maxUnits) > 0 ? Number(cfg.maxUnits) : undefined })

    ctx.log('info', t(ctx.locale, 'run.textEnrich.done', { revised: result.counts.revised, rejected: result.counts.rejected, passId: '' }))

    // ⚠ La mémoire retient ce qui a été SOUMIS, pas ce qui a été retenu : une proposition
    // refusée par la garde ne doit pas repartir chaque nuit pour se faire refuser encore.
    if (memoryOn) await saveEnrichMemory(ctx.uid, ctx.workflowId!, rememberRows(memory, decisions, keyCols))

    // ⚠ PUBLICATION pour l'écran de relecture — jumeau du navigateur, et la seule chose qui
    // rende le travail du cron visible. Clefée sur la RÉFÉRENCE, c'est-à-dire sur
    // l'identifiant même que « Comparer catalogue » donne au produit.
    if (events.length > 0) {
      const watchId = resolveSitesInput(inputs.sites, {
        sitesText: '', watchIdRaw: String((config as { watchId?: unknown }).watchId ?? ''),
        workflowId: ctx.workflowId,
      }).watchId
      const published = buildPublishedRevisions(events, keyCols, Date.now())
      if (published.length > 0) {
        await savePublishedRevisions(ctx.uid, watchId, published)
        ctx.log('info', t(ctx.locale, 'run.textEnrich.published', { count: published.length, watchId }))
      }
      const rows2 = new Set(events.map((e) => e.row)).size
      if (published.length < rows2) {
        ctx.log('warn', t(ctx.locale, 'run.textEnrich.publishNoKey', { count: rows2 - published.length }))
      }
    }

    // ⚠ TOUTES les lignes repartent vers l'aval, pas seulement la part retraitée : le
    // comparatif attend le catalogue entier.
    const applied = applySheetRevisions(allRows, revisions.map((r) => ({
      productId: r.productId, field: r.field, before: r.before, after: r.after,
    })))
    return {
      enriched: {
        name: sheet?.name ?? 'sheet',
        columns: sheetColumnsWithSources(sheet?.columns ?? [], planKeys),
        rows: applied,
      },
      revisions: {
        name: 'revisions',
        columns: [
          { key: 'produit', label: 'Produit' }, { key: 'champ', label: 'Champ' },
          { key: 'avant', label: 'Avant' }, { key: 'apres', label: 'Après' },
          { key: 'justification', label: 'Ce qui a changé' },
        ],
        rows: revisions.map((r) => ({
          _id: `${r.productId}::${r.field}`,
          produit: r.productId, champ: r.field,
          avant: r.before ?? '', apres: r.after == null ? '' : String(r.after),
          justification: notes[`${r.productId}::${r.field}`] ?? '',
        })),
      },
    }
  },
})
