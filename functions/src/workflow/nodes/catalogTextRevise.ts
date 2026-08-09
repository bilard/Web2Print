// functions/src/workflow/nodes/catalogTextRevise.ts
// Jumeau SERVEUR du node « Traduire et étoffer les fiches » (client :
// src/features/workflows/registry/catalogTextReviseNode.ts).
//
// ⚠ C'est LA raison d'être de cette carte. La traduction ne pouvait tourner que dans le
// navigateur : un catalogue qui reçoit des produits chaque jour ne pouvait donc jamais se
// tenir à jour tout seul, et un run planifié « réussi » laissait croire le contraire en
// laissant passer la donnée sans la traiter.
import { registerServerNode } from '../registry'
import { loadSourceCatalog } from '../../priceWatch/reportStore'
import { loadTextRevisions, saveTextRevisions, type TextRevision } from '../../priceWatch/textRevisionsStore'
import { reviseQueue } from '../../priceWatch/textEnrich/staleRevision'
import { chunkByVolume } from '../../priceWatch/textEnrich/chunkByVolume'
import { buildScreenPrompt } from '../../priceWatch/textEnrich/screenPrompt'
import { findViolations } from '../../textEnrich/protected'
import { detectLanguage } from '../../textEnrich/detectLang'
import { stableId } from '../../priceWatch/helpers'
import { callLlm, parseLlmJson } from '../llm'
import { t } from '../../i18n'

/** Même plafond que le navigateur. Le défaut du routeur suffit à une extraction, pas à une
 *  réécriture : trop bas, la réponse est tronquée EN SILENCE et le JSON devient invalide. */
const MAX_OUTPUT_TOKENS = 16000

// ⚠ `callLlm` n'annonce AUCUN schéma : `response_format: json_object` n'existe que chez
// DeepSeek et OpenAI. Sans cette instruction, Claude et Gemini répondent en prose et le
// passage rendrait « 0 traité » toutes les nuits, sans rien expliquer.
const JSON_INSTRUCTION = `

---
Réponds UNIQUEMENT par un JSON de la forme {"results":[{"id":"…","name":"…","description":"…","note":"…"}]}. Aucun texte avant ou après, aucune balise markdown.`

interface LlmResult { id?: unknown; name?: unknown; description?: unknown; note?: unknown }

registerServerNode({
  type: 'catalog-text-revise',
  run: async (ctx, config) => {
    // ⚠ UN traitement et UNE consigne PAR CHAMP, comme au navigateur : le nom et le texte
    // de vente n'appellent pas la même demande.
    const mode = (v: unknown): 'translate' | 'improve' | 'both' =>
      v === 'improve' || v === 'both' ? v : 'translate'
    const fields = {
      name: {
        enabled: config.doName !== false,
        mode: mode(config.nameMode),
        prompt: String(config.namePrompt ?? ''),
      },
      description: {
        enabled: config.doDescription !== false,
        mode: mode(config.descriptionMode),
        prompt: String(config.descriptionPrompt ?? ''),
      },
    }
    if (!fields.name.enabled && !fields.description.enabled) {
      throw new Error(t(ctx.locale, 'run.catalogTextRevise.noMode'))
    }

    // Même dérivation que les autres cartes de veille : sans saisie, le suivi du workflow.
    const watchId = stableId(String(config.watchId ?? '').trim() || ctx.workflowId || 'default')
    const src = await loadSourceCatalog(ctx.uid, watchId)
    if (!src) throw new Error(t(ctx.locale, 'run.catalogTextRevise.noCatalog', { watchId }))
    const revisions = await loadTextRevisions(ctx.uid, watchId)

    const scope = String(config.scope ?? 'foreign')
    const langOf = (p: { name: string; description?: string }) => detectLanguage(p.description || p.name).lang
    const accept = scope === 'all'
      ? undefined
      : (p: { name: string; description?: string }) => {
          const lang = langOf(p)
          return scope === 'foreignPlus' ? lang !== 'fr' : !!lang && lang !== 'fr'
        }

    const queue = reviseQueue(src.products, revisions, {
      refreshStale: config.refreshStale !== false,
      accept,
    })
    const cap = Math.max(0, Math.trunc(Number(config.maxUnits)) || 0)
    const batch = cap > 0 ? queue.slice(0, cap) : queue
    ctx.log('info', t(ctx.locale, 'run.catalogTextRevise.queue', {
      total: queue.length,
      fresh: queue.filter((q) => q.reason === 'new').length,
      stale: queue.filter((q) => q.reason === 'stale').length,
      taken: batch.length,
    }))
    if (batch.length === 0) return { revisions: { name: 'revisions', columns: [], rows: [] } }

    const rows: Record<string, unknown>[] = []
    let kept = 0
    let refused = 0
    const chunks = chunkByVolume(batch, (q) => q.product.name.length + (q.product.description?.length ?? 0))
    for (const chunk of chunks) {
      const { text } = await callLlm(
        ctx.uid,
        buildScreenPrompt(
          chunk.map((q) => ({
            id: q.product.id, name: q.product.name,
            ...(q.product.description ? { description: q.product.description } : {}),
            lang: langOf(q.product),
          })),
          '',
          { translate: true, improve: false },
          fields,
        ) + JSON_INSTRUCTION,
        { maxTokens: MAX_OUTPUT_TOKENS },
      )
      const parsed = parseLlmJson<{ results?: LlmResult[] }>(text)
      // Un lot illisible ne fait pas tomber le passage : les autres sont déjà payés, et
      // les fiches non traitées reviendront d'elles-mêmes au passage suivant.
      if (!parsed?.results) { ctx.log('warn', t(ctx.locale, 'run.catalogTextRevise.badJson', { count: chunk.length })); continue }

      const byId = new Map(chunk.map((q) => [q.product.id, q]))
      const written: TextRevision[] = []
      for (const r of parsed.results) {
        const target = byId.get(String(r.id ?? ''))
        // Un identifiant inconnu trahit une liste décalée : on écarte plutôt que de ranger
        // un texte sur le mauvais produit.
        if (!target) continue
        const p = target.product
        const name = String(r.name ?? '').trim()
        const description = String(r.description ?? '').trim()
        if (!name) continue

        // Même garde que le navigateur : une réécriture qui perd une référence ou altère
        // une cote est refusée, pas écrite.
        if (findViolations(`${p.name} ${p.description ?? ''}`, `${name} ${description}`,
          { refs: [p.ref, p.ref2], eans: [p.ean] }).length > 0) { refused++; continue }

        written.push({
          productId: p.id,
          name,
          ...(description ? { description } : {}),
          nameSource: p.name,
          ...(p.description ? { descriptionSource: p.description } : {}),
          ...(r.note ? { note: String(r.note) } : {}),
          // ⚠ Sans la langue, tout ce que le cron traduit sort du décompte par langue.
          ...((l) => (l ? { lang: l } : {}))(langOf(p)),
          at: Date.now(),
        })
        rows.push({
          _id: `${p.id}::${target.reason}`,
          produit: p.name,
          motif: t(ctx.locale, target.reason === 'new' ? 'run.catalogTextRevise.reason.new' : 'run.catalogTextRevise.reason.stale'),
          avant: p.description || p.name,
          apres: description || name,
          justification: r.note ? String(r.note) : '',
        })
      }

      // ⚠ Écriture À CHAQUE LOT : une erreur au dixième jetterait les neuf premiers, déjà
      // payés au modèle.
      if (written.length > 0) {
        await saveTextRevisions(ctx.uid, watchId, written)
        kept += written.length
      }
    }

    ctx.log('info', t(ctx.locale, 'run.catalogTextRevise.done', { kept, refused, asked: batch.length }))
    return {
      revisions: {
        name: 'revisions',
        columns: [
          { key: 'produit', label: 'Produit' }, { key: 'motif', label: 'Motif' },
          { key: 'avant', label: 'Avant' }, { key: 'apres', label: 'Après' },
          { key: 'justification', label: 'Ce qui a changé' },
        ],
        rows,
      },
    }
  },
})
