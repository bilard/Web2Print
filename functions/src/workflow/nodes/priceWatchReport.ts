// functions/src/workflow/nodes/priceWatchReport.ts
// Jumeau SERVEUR du node « Rapport veille tarifaire » (client :
// src/features/workflows/registry/priceWatchReportNode.tsx). Sans lui, le rapport ne
// partirait qu'en lançant le workflow à la main — or l'usage visé est justement le mail
// automatique du matin.
//
// ⚠️ Le RENDU est copié verbatim depuis le client (`priceWatch/reportHtml.ts`) : le mail
// du cron doit être identique à celui du navigateur, sinon deux versions du même rapport
// circulent selon l'heure d'envoi.
import { getFirestore } from 'firebase-admin/firestore'
import { registerServerNode } from '../registry'
import { makeServerFile } from './serverFile'
import { reportLatestDoc, priceEventsDoc } from '../../priceWatch/paths'
import { renderPriceWatchReport, DEFAULT_PW_REPORT } from '../../priceWatch/reportHtml'
import { buildComposePrompt, normalizeComposedHtml } from '../../priceWatch/reportCompose'
import { eventsOfLastRun, type PriceEvent } from '../../priceWatch/priceEvents'
import type { StoredReport } from '../../priceWatch/reportStore'
import type { ServerRunCtx } from '../types'
import { stableId } from '../../priceWatch/helpers'
import { callLlm, parseLlmJson } from '../llm'
import { t } from '../../i18n'

// ⚠ `callLlm` n'annonce AUCUN schéma de son côté : `response_format: json_object` n'existe
// que chez DeepSeek et OpenAI. Sans cette instruction, Claude et Gemini rendent le HTML
// directement — et `parseLlmJson` rendrait null, donc un repli MUET sur le rapport standard
// tous les matins. On demande donc le JSON explicitement, et on accepte quand même le HTML
// brut : le but est un mail conforme à la consigne, pas un JSON bien formé.
const JSON_INSTRUCTION = `

---
Réponds UNIQUEMENT par un JSON de la forme {"html": "<le corps du mail>"}. Aucun texte avant ou après, aucune balise markdown.`

/**
 * Compose le mail selon la consigne, côté serveur. Rend `null` en cas d'échec — l'appelant
 * retombe sur le rapport standard : mieux vaut le mail habituel qu'aucun mail. La RAISON
 * est journalisée, sinon un mail qui ignore la consigne tous les matins reste inexplicable.
 */
async function composeServerSide(
  ctx: Pick<ServerRunCtx, 'uid' | 'locale' | 'log'>,
  report: StoredReport,
  prompt: string,
  moves: PriceEvent[],
): Promise<string | null> {
  try {
    // 32 000 tokens, pas les 8192 par défaut : un corps de mail entièrement en styles
    // inline pèse 20 à 30 Ko, et chaque guillemet de `style="…"` est ré-échappé dans la
    // chaîne JSON. Tronquée, la réponse n'est plus du JSON valide — donc un échec muet.
    // (`callDeepSeek` reclampe à 8192 de son côté ; Claude et Gemini encaissent.)
    const r = await callLlm(ctx.uid, buildComposePrompt(report, prompt, moves) + JSON_INSTRUCTION, {
      maxTokens: 32_000,
      preferProviders: ['claude', 'gemini'],
    })
    const parsed = parseLlmJson<{ html?: string }>(r.text)
    // Repli sur la réponse telle quelle : un modèle qui a rendu le HTML sans l'emballer a
    // fait le travail demandé — le refuser pour un défaut de forme priverait du mail.
    const html = normalizeComposedHtml(parsed?.html) ?? normalizeComposedHtml(r.text)
    if (html) {
      ctx.log('info', t(ctx.locale, 'run.pwReport.composedBy', { provider: r.provider, model: r.model }))
      return html
    }
    // Un `stopReason` de troncature (`max_tokens`, `MAX_TOKENS`, `length`) dit tout autre
    // chose qu'un modèle injoignable : c'est la réponse qui était trop longue.
    ctx.log('warn', t(ctx.locale, 'run.pwReport.composeUnusable', {
      model: r.model, stopReason: r.stopReason ?? '—', chars: r.text.length,
    }))
    return null
  } catch (e) {
    ctx.log('warn', t(ctx.locale, 'run.pwReport.composeFailed'))
    console.warn('[pw-report] composition KO :', e instanceof Error ? e.message.slice(0, 300) : e)
    return null
  }
}

registerServerNode({
  type: 'price-watch-report',
  run: async (ctx, config) => {
    // Même dérivation que « Comparer catalogue » : sans saisie, le suivi du workflow.
    const watchId = stableId(String(config.watchId ?? '').trim() || ctx.workflowId || 'default')
    const snap = await getFirestore().doc(reportLatestDoc(ctx.uid, watchId)).get()
    if (!snap.exists) throw new Error(t(ctx.locale, 'run.pwReport.noReport', { watchId }))
    const report = snap.data() as StoredReport

    const day = new Date().toISOString().slice(0, 10)
    const rawName = String(config.fileName ?? '').trim() || `veille-tarifaire-${day}.html`
    const fileName = rawName.toLowerCase().endsWith('.html') ? rawName : `${rawName}.html`
    const doneLog = (body: string) => ctx.log('info', t(ctx.locale, 'run.pwReport.done', {
      products: (report.kpis?.products ?? 0).toLocaleString('fr-FR'),
      sites: (report.byCompetitor ?? []).filter((c) => c.matched > 0).length,
      size: (Buffer.byteLength(body, 'utf8') / 1024).toFixed(1),
    }))

    // Consigne libre : c'est ELLE qui compose le mail. Le rapport standard reste le repli.
    // Chiffre de la carte sur l'écran « Suivi » : sans lui, le badge reste muet.
    ctx.reportCount?.(report.kpis?.products ?? 0)
    const prompt = String(config.prompt ?? '').trim()
    if (prompt) {
      ctx.log('info', t(ctx.locale, 'run.pwReport.composing'))
      // Mouvements du dernier relevé : le rapport `latest` est une photo, il ne dit pas
      // ce qui a bougé. Une consigne « les baisses depuis le dernier run » n'aurait rien
      // à quoi se raccrocher sans eux.
      const jSnap = await getFirestore().doc(priceEventsDoc(ctx.uid, watchId)).get().catch(() => null)
      const journal = ((jSnap?.data()?.events ?? []) as PriceEvent[])
      const composed = await composeServerSide(ctx, report, prompt, eventsOfLastRun(journal))
      if (composed) {
        doneLog(composed)
        return { html: composed, file: makeServerFile(fileName, 'text/html;charset=utf-8', composed) }
      }
    }

    const html = renderPriceWatchReport(report, {
      title: String(config.title ?? '').trim() || DEFAULT_PW_REPORT.title,
      competitorThresholdPct: Math.abs(Number(config.competitorThresholdPct) || DEFAULT_PW_REPORT.competitorThresholdPct),
      familyThresholdPct: Math.abs(Number(config.familyThresholdPct) || DEFAULT_PW_REPORT.familyThresholdPct),
      examples: Math.max(0, Number(config.examples) || DEFAULT_PW_REPORT.examples),
    }, watchId)

    doneLog(html)
    return { html, file: makeServerFile(fileName, 'text/html;charset=utf-8', html) }
  },
})
