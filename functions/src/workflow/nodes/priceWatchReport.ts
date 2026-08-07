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
import { reportLatestDoc } from '../../priceWatch/paths'
import { renderPriceWatchReport, DEFAULT_PW_REPORT } from '../../priceWatch/reportHtml'
import type { StoredReport } from '../../priceWatch/reportStore'
import { stableId } from '../../priceWatch/helpers'
import { t } from '../../i18n'

registerServerNode({
  type: 'price-watch-report',
  run: async (ctx, config) => {
    // Même dérivation que « Comparer catalogue » : sans saisie, le suivi du workflow.
    const watchId = stableId(String(config.watchId ?? '').trim() || ctx.workflowId || 'default')
    const snap = await getFirestore().doc(reportLatestDoc(ctx.uid, watchId)).get()
    if (!snap.exists) throw new Error(t(ctx.locale, 'run.pwReport.noReport', { watchId }))
    const report = snap.data() as StoredReport

    const html = renderPriceWatchReport(report, {
      title: String(config.title ?? '').trim() || DEFAULT_PW_REPORT.title,
      competitorThresholdPct: Math.abs(Number(config.competitorThresholdPct) || DEFAULT_PW_REPORT.competitorThresholdPct),
      familyThresholdPct: Math.abs(Number(config.familyThresholdPct) || DEFAULT_PW_REPORT.familyThresholdPct),
      examples: Math.max(0, Number(config.examples) || DEFAULT_PW_REPORT.examples),
    }, watchId)

    const day = new Date().toISOString().slice(0, 10)
    const raw = String(config.fileName ?? '').trim() || `veille-tarifaire-${day}.html`
    const fileName = raw.toLowerCase().endsWith('.html') ? raw : `${raw}.html`
    const file = makeServerFile(fileName, 'text/html;charset=utf-8', html)

    ctx.log('info', t(ctx.locale, 'run.pwReport.done', {
      products: (report.kpis?.products ?? 0).toLocaleString('fr-FR'),
      sites: (report.byCompetitor ?? []).filter((c) => c.matched > 0).length,
      size: (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1),
    }))
    return { html, file }
  },
})
