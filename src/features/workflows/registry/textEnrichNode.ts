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
import { planWaves, runWaves } from '@/features/textEnrich/planWaves'
import { sheetQueue, rememberRows, type EnrichMemory } from '@/features/textEnrich/sheetMemory'
import { loadEnrichMemory, saveEnrichMemory } from '@/features/textEnrich/memoryStore'
import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { resolveSitesInput } from '@/features/priceWatch/sourceSites'
import { savePublishedRevisions } from '@/features/priceWatch/textRevisionsStore'
import { buildPublishedRevisions, type RevisionEvent } from '@/features/textEnrich/publishRevisions'
import { applyRevision, type EnrichPass } from '@/features/textEnrich/revision'
import { loadTargets, saveRevisions, savePass } from '@/features/textEnrich/enrichStore'
import {
  applySheetRevisions, sheetColumnsWithSources, sheetTargets,
  type SheetColumn, type SheetRow,
} from '@/features/textEnrich/sheetMode'
import {
  DEFAULT_TEXT_ENRICH_CONFIG, configToPlans, configProblem, missingProtectedColumns,
  protectedFieldsOf, type TextEnrichConfig,
} from '@/features/textEnrich/nodeConfig'
import { TextEnrichConfigPanel } from './textEnrichConfig'
// `run()` n'est pas un composant : helper `t()` de module (lit la locale courante).
import { t } from '@/lib/i18n'

/** Le port rend une FEUILLE, une ligne par révision — pas un accusé de réception.
 *  Un port typé `sheet` qui rendrait `{projectId, passId}` mentirait à tout ce qu'on y
 *  branche, à commencer par l'export vers un tableur : c'est exactement le travers déjà
 *  rencontré avec un port sans consommateur possible. */
interface RevisionRow {
  _id: string
  produit: string
  champ: string
  avant: string
  apres: string
  justification: string
}
interface RevisionSheet { name: string; columns: SheetColumn[]; rows: RevisionRow[] }

type EnrichOutputs = {
  enriched: { rows: RevisionRow[] } | { name: string; columns: SheetColumn[]; rows: SheetRow[] }
  /** Le comparatif AVANT/APRÈS, une ligne par texte révisé.
   *
   *  ⚠ Il existe pour être REGARDÉ, et c'est pour ça qu'il est séparé : la feuille
   *  enrichie porte quatorze colonnes où retrouver la paire « DESCRIPTION » /
   *  « DESCRIPTION (source) » relève de la chasse. L'aperçu de données l'affiche d'office
   *  quand on sélectionne la carte, et on peut le brancher sur un export pour relire à
   *  froid. Sans lui, la question « où je vois l'avant/après ? » n'avait pas de réponse. */
  revisions: RevisionSheet
}

const REVISION_COLUMNS: SheetColumn[] = [
  { key: 'produit', label: 'Produit' },
  { key: 'champ', label: 'Champ' },
  { key: 'avant', label: 'Avant' },
  { key: 'apres', label: 'Après' },
  { key: 'justification', label: 'Ce qui a changé' },
]

const emptyRevisions = (): RevisionSheet => ({ name: 'revisions', columns: REVISION_COLUMNS, rows: [] })

const textEnrichNode: NodeSpec<TextEnrichConfig, { sheet?: unknown; sites?: unknown }, EnrichOutputs> = {
  type: 'text-enrich',
  category: 'enrichment',
  labelKey: 'node.text-enrich.label',
  descriptionKey: 'node.text-enrich.desc',
  icon: Languages,
  // ⚠ Branchée, la feuille L'EMPORTE sur le projet PIM. C'est le chemin normal quand la
  // donnée vient d'un import (Sheets, Excel) et n'a jamais rejoint le PIM.
  inputs: [
    { name: 'sheet', type: 'sheet' },
    // ⚠ Le MÊME port que « Comparer catalogue », et pour la même raison : c'est lui qui
    // dit dans quel suivi publier les textes réécrits. Non branché, on retombe sur le
    // réglage local puis sur l'identifiant du flux — exactement la cascade de l'autre
    // carte, pour que les deux visent le même suivi sans qu'on ait à y penser.
    { name: 'sites', type: 'sites' },
  ],
  outputs: [
    { name: 'enriched', type: 'sheet' },
    { name: 'revisions', type: 'sheet' },
  ],
  outputColumns: ['produit', 'champ', 'avant', 'apres', 'justification'],
  // Les plans de champs sont une liste d'objets : le schéma générique ne sait pas les
  // rendre. Le panneau dédié s'en charge, le schéma garde les réglages scalaires.
  configSchema: [
    // ⚠ PAS `required` : une feuille branchée fournit les fiches et rend le projet PIM
    // inutile — c'est ce que `configProblem(config, hasSheet)` sait déjà. Déclaré requis,
    // le pré-vol réclamait un projet à qui n'en a pas, sur une carte parfaitement
    // exécutable. L'exigence RÉELLE (« l'un ou l'autre ») vit dans `SEMANTIC_CHECKS`,
    // comme pour les sites de « Comparer catalogue ».
    { name: 'projectId', kind: 'text', labelKey: 'node.text-enrich.projectId' },
    { name: 'watchId', kind: 'text', labelKey: 'node.text-enrich.watchId', helpKey: 'node.text-enrich.watchId.help' },
    { name: 'capUsd', kind: 'number', labelKey: 'node.text-enrich.capUsd', default: 5 },
    { name: 'maxUnits', kind: 'number', labelKey: 'node.text-enrich.maxUnits', default: 500 },
    { name: 'withNote', kind: 'checkbox', labelKey: 'node.text-enrich.withNote', default: true },
    { name: 'dryRun', kind: 'checkbox', labelKey: 'node.text-enrich.dryRun', default: false },
    { name: 'incremental', kind: 'checkbox', labelKey: 'node.text-enrich.incremental', helpKey: 'node.text-enrich.incremental.help', default: true },
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
  run: async (ctx, config, inputs) => {
    // ⚠ Le port branché mais porteur d'autre chose qu'une feuille signe un amont en
    // échec. Sans ce garde-fou, on retomberait sur le projet PIM — c'est-à-dire sur un
    // TOUT AUTRE jeu de fiches que celui qu'on croit traiter, ou sur rien du tout.
    const sheet = inputs.sheet as { name?: string; columns?: SheetColumn[]; rows?: SheetRow[] } | undefined
    const wired = inputs.sheet != null
    if (wired && !Array.isArray(sheet?.rows)) throw new Error(t('run.textEnrich.badPortPayload'))
    const fromSheet = wired && Array.isArray(sheet?.rows)

    // Vérifié AVANT tout appel : découvrir une consigne vide après trois cents fiches
    // coûte de l'argent ET des révisions à annuler une à une.
    const problem = configProblem(config, fromSheet)
    if (problem) {
      throw new Error(t(
        `run.textEnrich.problem.${problem.code}` as 'run.textEnrich.problem.no-project',
        { field: problem.key ?? '' },
      ))
    }

    const plans = configToPlans(config)
    const planKeys = [...new Set(plans.map((p) => p.key))]
    const allRows: SheetRow[] = fromSheet ? (sheet?.rows ?? []) : []

    // ⚠ MÉMOIRE du mode feuille. Sans elle, chaque exécution refaisait — et refacturait —
    // le catalogue entier : un passage quotidien était impossible. Clefée sur la RÉFÉRENCE
    // ARTICLE, jamais sur le numéro de ligne, qui se décale dès qu'un produit est inséré.
    // Le mode PIM, lui, a déjà son marqueur d'idempotence par champ.
    const memoryOn = fromSheet && config.incremental !== false && !!ctx.workflowId
    // ⚠ Lecture TOLÉRANTE : la config d'un node est persistée, et une carte posée avant
    // ces champs ne les connaît pas. Les lire crûment planterait le run — après le
    // chiffrage, donc après avoir fait espérer.
    const col = (v: unknown) => (typeof v === 'string' ? v.trim() : '') || undefined
    const keyCols = { ref: col(config.refField), ean: col(config.eanField) }
    const memory: EnrichMemory = memoryOn ? await loadEnrichMemory(getWorkspaceUid() ?? '', ctx.workflowId!) : {}
    const decisions = memoryOn ? sheetQueue(allRows, planKeys, memory, keyCols) : []
    // Les lignes écartées ne sont pas SUPPRIMÉES de la feuille : elles la traversent
    // intactes vers l'aval. On ne restreint que ce qu'on soumet au modèle.
    const sheetRows: SheetRow[] = memoryOn ? (decisions.map((d) => d.row) as SheetRow[]) : allRows
    if (memoryOn) {
      ctx.log('info', t('run.textEnrich.incremental', {
        total: allRows.length,
        taken: sheetRows.length,
        fresh: decisions.filter((d) => d.reason === 'new').length,
        changed: decisions.filter((d) => d.reason === 'changed').length,
        unknown: decisions.filter((d) => d.reason === 'unknown-key').length,
      }))
    }

    const targets = fromSheet
      ? sheetTargets(sheetRows, planKeys)
      : await loadTargets(config.projectId)

    // ⚠ DIT, parce que la même carte est idempotente sur l'autre chemin. Une feuille
    // traverse le graphe et meurt avec le run : rien ne retient qu'un texte a déjà été
    // traité, donc chaque exécution refait — et refacture — le même travail.
    if (fromSheet) ctx.log('info', t('run.textEnrich.sheetMode', { rows: sheetRows.length }))

    /** La feuille d'entrée, telle quelle. ⚠ TOUTES les lignes, y compris celles que la
     *  mémoire a écartées : l'aval attend le catalogue entier, pas la part retraitée. */
    const passthrough = () => ({
      name: sheet?.name ?? 'sheet',
      columns: sheet?.columns ?? [],
      rows: allRows,
    })

    // ⚠ Les plans partent en VAGUES : deux plans sur un même champ ne peuvent pas voyager
    // ensemble (clé `produit::champ`), et surtout le second doit travailler sur ce que le
    // premier a produit. Le chiffrage préalable, lui, porte sur la première vague : les
    // suivantes dépendent de textes qui n'existent pas encore.
    const waves = planWaves(plans)
    const { units, counts } = planPass(targets, waves[0] ?? [])

    // Chiffré AVANT d'appeler quoi que ce soit : l'utilisateur voit le volume réel, pas
    // une estimation. C'est aussi ce que rend le mode simulation.
    ctx.log('info', t('run.textEnrich.planned', {
      units: units.length,
      considered: counts.considered,
      done: counts.skipped['already-done'],
    }))
    // ⚠ Émis AVANT le mode simulation, donc visible sans dépenser un dollar : c'est
    // précisément le réglage qu'une simulation doit permettre de vérifier.
    const missing = missingProtectedColumns(config, targets.map((tg) => tg.row ?? {}))
    if (missing.length > 0) {
      ctx.log('warn', t('run.textEnrich.missingProtected', { columns: missing.join(', ') }))
    }

    if (config.dryRun) {
      ctx.log('info', t('run.textEnrich.dryRun'))
      // La feuille repart INCHANGÉE plutôt que vide : une simulation ne doit pas assécher
      // l'aval du graphe, sinon on ne peut simuler qu'en bout de chaîne.
      return { enriched: fromSheet ? passthrough() : { rows: [] }, revisions: emptyRevisions() }
    }
    if (units.length === 0) {
      ctx.log('info', t('run.textEnrich.nothingToDo'))
      return { enriched: fromSheet ? passthrough() : { rows: [] }, revisions: emptyRevisions() }
    }

    // ⚠ La borne s'applique APRÈS le chiffrage, pour que le journal annonce le total réel
    // (« 41 200 à faire, 500 traités ») et non la portion tronquée. Un utilisateur qui lit
    // « 500 à faire » croirait le catalogue presque terminé.
    // 0 = pas de borne, comme le plafond de dépense juste à côté. Sans cette valeur, il
    // fallait saisir un nombre plus grand que le catalogue pour « tout traiter » — donc
    // deviner ce nombre, et le refaire à chaque fois que le catalogue grossit.
    const limit = Number(config.maxUnits) > 0 ? Number(config.maxUnits) : units.length
    const capped = units.slice(0, limit)
    if (capped.length < units.length) {
      // ⚠ Deux messages, parce que la reprise ne veut pas dire la même chose. En mode PIM,
      // relancer avance : le marqueur écarte ce qui est fait. Sur une feuille, relancer
      // retraite ÉTERNELLEMENT les mêmes premières lignes — promettre « relancez pour la
      // suite » serait faux, et coûteux à découvrir.
      ctx.log('warn', fromSheet
        ? t('run.textEnrich.cappedSheet', { kept: capped.length, total: units.length })
        : t('run.textEnrich.capped', { kept: capped.length, total: units.length }))
    }

    const passId = `${Date.now().toString(36)}-${(ctx.workflowId ?? 'local').slice(0, 6)}`
    const at = Date.now()
    let spentUsd = 0
    let provider: string | undefined
    let model: string | undefined
    const notes: Record<string, string> = {}
    const revisions: { productId: string; field: string; value: ReturnType<typeof applyRevision> }[] = []
    /** Ce qu'on PUBLIE pour l'écran de relecture : la ligne source (donc sa référence), la
     *  colonne, la nature du travail, l'avant et l'après. Collecté au fil des vagues pour
     *  que l'avant soit bien le texte d'origine et l'après le dernier état. */
    const events: RevisionEvent[] = []
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
      result = await runWaves(waves, targets, capped, counts, (batchUnits, batchCounts) => runPass(batchUnits, batchCounts, {
        passId,
        // ⚠ DIX et non vingt : la sortie de deepseek-chat plafonne à 8192 tokens, et un lot
        // de vingt textes longs la ferait tronquer EN SILENCE.
        chunkSize: 10,
        callBatch,
        protectedOf: (unit: EnrichUnit) => protectedFieldsOf(config, byId.get(unit.productId)?.row ?? {}),
        onRevision: (unit, field) => {
          revisions.push({ productId: unit.productId, field: unit.field, value: field })
          events.push({
            row: unit.row, field: unit.field, kind: unit.plan.kind,
            before: unit.text, after: field.value == null ? '' : String(field.value),
          })
          // ⚠ Le champ du produit est REMPLACÉ en mémoire : sans ça, une seconde vague sur
          // le même champ relirait le texte d'origine et l'amélioration s'appliquerait à
          // l'allemand au lieu de la traduction.
          const tg = byId.get(unit.productId)
          if (tg) tg.fields[unit.field] = field
        },
        // Une proposition refusée n'est PAS un incident : c'est la vérification qui fait son
        // travail. Elle est tracée pour que l'écran de comparaison puisse l'expliquer, sans
        // faire passer le run en erreur.
        onRejected: (unit, violations) => ctx.log('info', t('run.textEnrich.rejected', {
          product: unit.productId, field: unit.field,
          kinds: [...new Set(violations.map((v) => v.kind))].join(', '),
        })),
        spentUsd: () => spentUsd,
        capUsd: config.capUsd > 0 ? config.capUsd : undefined,
        // ⚠ Une ligne tous les 500 champs, pas à chaque lot. Le journal ne garde que
        // 200 entrées : à raison d'une par lot de dix, la progression évinçait les seuls
        // messages qui comptent — « mémorisé », « temps écoulé », « publiées ». On ne
        // voyait plus la fin du passage, seulement son milieu.
        onChunkDone: (done, total) => {
          if (done % 500 < 10 || done >= total) ctx.log('info', t('run.textEnrich.progress', { done, total }))
        },
        now: () => at,
      }), { limit: Number(config.maxUnits) > 0 ? Number(config.maxUnits) : undefined })
    } finally {
      popUsage()
    }

    // ⚠ La mémoire retient ce qui a été SOUMIS, pas ce qui a été retenu : une proposition
    // refusée par la garde ne doit pas repartir chaque nuit pour se faire refuser encore,
    // en repayant à chaque tour. Le texte source, lui, n'a pas changé.
    // ⚠⚠ SEULEMENT les lignes réellement atteintes. Mémoriser toute la file marquait
    // 115 814 lignes comme faites alors que la borne n'en avait laissé passer que 500 : au
    // passage suivant, la carte ne trouvait plus rien à faire et le catalogue restait
    // traduit à 0,4 %, pour toujours, sans le moindre message.
    if (memoryOn) {
      const uid2 = getWorkspaceUid()
      const reached = new Set(result.productIds)
      const doneRows = decisions.filter((_, i) => reached.has(targets[i]?.id ?? ''))
      ctx.log('info', t('run.textEnrich.remembered', { done: doneRows.length, queued: decisions.length }))
      if (uid2) await saveEnrichMemory(uid2, ctx.workflowId!, rememberRows(memory, doneRows, keyCols))
    }

    // ⚠ En mode feuille, le travail était jusqu'ici SANS TRACE LISIBLE : la feuille
    // traversait le graphe, « Comparer catalogue » réécrivait le catalogue par-dessus, et
    // l'écran « Traduire et améliorer les textes » ne montrait que ce qu'on avait fait à la
    // main. Le cron pouvait traduire dix mille fiches sans que rien ne le montre nulle part.
    // La publication clefe sur la RÉFÉRENCE, c'est-à-dire sur l'identifiant même du
    // catalogue — aucune table de correspondance n'est nécessaire.
    if (fromSheet && events.length > 0) {
      const uid3 = getWorkspaceUid()
      const watchId = resolveSitesInput(inputs.sites, {
        sitesText: '', watchIdRaw: config.watchId ?? '', workflowId: ctx.workflowId,
      }).watchId
      const published = buildPublishedRevisions(events, keyCols, at)
      if (uid3 && published.length > 0) {
        await savePublishedRevisions(uid3, watchId, published)
        ctx.log('info', t('run.textEnrich.published', { count: published.length, watchId }))
      }
      // Une ligne sans référence ni code-barres n'est reconnaissable par personne : elle
      // reste traduite dans la feuille, mais introuvable à l'écran. À dire, sinon on
      // cherche une panne dans l'écran.
      if (published.length < new Set(events.map((e) => e.row)).size) {
        ctx.log('warn', t('run.textEnrich.publishNoKey', {
          count: new Set(events.map((e) => e.row)).size - published.length,
        }))
      }
    }

    // ⚠ RIEN N'EST PERSISTÉ dans le PIM en mode feuille, et ce n'est pas un oubli : il n'y
    // a pas de fiche où poser la révision, et l'original voyage dans la colonne jumelle.
    if (!fromSheet) {
      // Écrites APRÈS le passage, en un bloc : une écriture par lot laisserait, sur une
      // interruption, des fiches révisées sans synthèse — donc invisibles dans l'écran de
      // comparaison, et impossibles à annuler en masse.
      await saveRevisions(config.projectId, revisions.map((r) => ({
        productId: r.productId, field: r.field, value: r.value,
      })))
    }

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
    if (!fromSheet) await savePass(config.projectId, pass)

    if (result.cappedBy === 'spend') ctx.log('warn', t('run.textEnrich.spendCapped', { cap: config.capUsd }))
    if (result.cappedBy === 'deadline') ctx.log('warn', t('run.textEnrich.deadline'))
    ctx.log('info', t('run.textEnrich.done', {
      revised: result.counts.revised, rejected: result.counts.rejected, passId,
    }))

    // Le comparatif est construit une seule fois : les deux modes le rendent, seule la
    // sortie de travail diffère. C'est LUI qu'on regarde après un passage.
    const revisionRows: RevisionRow[] = revisions.map((r) => ({
      _id: `${r.productId}::${r.field}`,
      produit: r.productId,
      champ: r.field,
      // L'original vient du calque de révision, pas de la donnée relue : après écriture,
      // le champ porte déjà le texte proposé.
      avant: r.value.enrich?.original == null ? '' : String(r.value.enrich.original),
      apres: r.value.value == null ? '' : String(r.value.value),
      justification: notes[`${r.productId}::${r.field}`] ?? '',
    }))
    const revisionSheet: RevisionSheet = { name: 'revisions', columns: REVISION_COLUMNS, rows: revisionRows }

    if (fromSheet) {
      const applied = applySheetRevisions(sheetRows, revisions.map((r) => ({
        productId: r.productId,
        field: r.field,
        before: r.value.enrich?.original ?? null,
        after: r.value.value,
      })))
      return {
        enriched: {
          name: sheet?.name ?? 'sheet',
          columns: sheetColumnsWithSources(sheet?.columns ?? [], planKeys),
          rows: applied,
        },
        revisions: revisionSheet,
      }
    }

    return { enriched: { rows: revisionRows }, revisions: revisionSheet }
  },
}

nodeRegistry.register(textEnrichNode)
