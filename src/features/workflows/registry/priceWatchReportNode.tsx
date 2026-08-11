// Node « Rapport veille tarifaire » : rend le rapport persisté d'un suivi en HTML
// autonome et email-safe — position tarifaire, alertes sur les écarts significatifs,
// classement des concurrents, familles exposées. À brancher sur « Envoyer via Gmail »
// (port `data` pour le corps du mail, `attachment` pour le joindre en .html) ou sur
// « Export Google Drive » pour l'archiver.
//
// Jumeau serveur : functions/src/workflow/nodes/priceWatchReport.ts — le mail du matin
// part par le cron, donc TOUT ce qui décide du contenu (consigne, faits, acceptation du
// HTML composé) vit dans le module dupliqué `priceWatch/reportCompose.ts`.
import { FileText } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { stableId } from '@/features/priceWatch/core'
import { DEFAULT_WATCH_ID } from '@/features/priceWatch/paths'
import { loadStoredReport, renderPriceWatchReport, DEFAULT_PW_REPORT } from './priceWatchReport'
import { loadPriceEvents } from '@/features/priceWatch/reportStore'
import { eventsOfLastRun } from '@/features/priceWatch/priceEvents'
import { composeReportHtml } from './priceWatchComposer'
import { PriceWatchReportConfig } from './priceWatchReportConfig'
import type { PwReportConfig } from './priceWatchReportTypes'
// `run()` n'est pas un composant : helper `t()` de module (lit la locale courante).
import { t } from '@/lib/i18n'

interface PwReportOutputs { html: string; file: File }

const pwReportNode: NodeSpec<PwReportConfig, Record<string, never>, PwReportOutputs> = {
  type: 'price-watch-report',
  category: 'export',
  labelKey: 'node.pw-report.label',
  descriptionKey: 'node.pw-report.desc',
  icon: FileText,
  // Entrée d'ORDONNANCEMENT (facultative) : brancher la sortie de « Comparer catalogue »
  // ici force l'analyse à tourner AVANT le rapport, dans un même run. La donnée est
  // ignorée — le rapport est relu depuis Firestore, pas reçu par l'edge. Sans ce port, la
  // carte n'était reliable à rien et pouvait rendre l'analyse de la veille.
  inputs: [{ name: 'after', type: 'any' }],
  // `html` en tête : c'est la sortie à relier au port `data` de Gmail (corps du mail).
  // `file` sert à l'archivage Drive ou à la pièce jointe.
  outputs: [
    { name: 'html', type: 'any' },
    { name: 'file', type: 'file' },
  ],
  configSchema: [
    { name: 'title', kind: 'text', labelKey: 'node.pw-report.title.label', helpKey: 'node.pw-report.title.help' },
    { name: 'prompt', kind: 'textarea', labelKey: 'node.pw-report.prompt.label', helpKey: 'node.pw-report.prompt.help' },
    { name: 'watchId', kind: 'text', labelKey: 'node.compare-catalog.watchId.label', helpKey: 'node.compare-catalog.watchId.help' },
    { name: 'competitorThresholdPct', kind: 'number', labelKey: 'node.pw-report.compThreshold.label', helpKey: 'node.pw-report.compThreshold.help' },
    { name: 'familyThresholdPct', kind: 'number', labelKey: 'node.pw-report.famThreshold.label', helpKey: 'node.pw-report.famThreshold.help' },
    { name: 'examples', kind: 'number', labelKey: 'node.pw-report.examples.label', helpKey: 'node.pw-report.examples.help' },
    { name: 'fileName', kind: 'text', labelKey: 'node.pw-report.fileName.label' },
  ],
  defaultConfig: {
    title: DEFAULT_PW_REPORT.title,
    prompt: '',
    watchId: '',
    competitorThresholdPct: DEFAULT_PW_REPORT.competitorThresholdPct,
    familyThresholdPct: DEFAULT_PW_REPORT.familyThresholdPct,
    examples: DEFAULT_PW_REPORT.examples,
    fileName: '',
  },
  // Panneau dédié : la consigne a besoin de dire SUR QUOI elle peut porter, ce qu'un
  // simple paragraphe d'aide ne faisait pas. Les autres champs restent rendus par le schéma.
  ConfigComponent: PriceWatchReportConfig,
  runtime: 'client',
  cardSummary: (c) => `seuils ${c.competitorThresholdPct || 5} % · ${c.familyThresholdPct || 40} %`,
  run: async (ctx, config) => {
    const uid = getWorkspaceUid()
    if (!uid) throw new Error(t('run.notSignedIn'))
    // Même dérivation que « Comparer catalogue » : sans saisie, le suivi est celui du
    // workflow — un rapport branché à côté du comparateur vise ainsi la bonne source.
    const watchId = stableId((config.watchId ?? '').trim() || ctx.workflowId || DEFAULT_WATCH_ID)

    const report = await loadStoredReport(uid, watchId)
    if (!report) throw new Error(t('run.pwReport.noReport', { watchId }))

    // Consigne libre : c'est ELLE qui compose le mail. Le rapport standard reste le repli —
    // un modèle indisponible ou un JSON invalide ne doit pas priver du mail du matin.
    // Chiffre de la carte sur l'écran « Suivi » — jumeau du node serveur.
    ctx.reportCount?.(report.kpis?.products ?? 0)
    const prompt = (config.prompt ?? '').trim()
    if (prompt) {
      ctx.log('info', t('run.pwReport.composing'))
      // Ce qui a BOUGÉ depuis le relevé précédent : le rapport `latest` est une photo,
      // il ne porte pas les mouvements. Sans eux, une consigne du genre « les produits en
      // baisse depuis le dernier run » n'aurait aucune donnée à quoi se raccrocher.
      const moves = eventsOfLastRun(await loadPriceEvents(uid, watchId).catch(() => []))
      const composed = await composeReportHtml(report, prompt, moves,
        (i) => ctx.log('info', t('run.pwReport.composedBy', { provider: i.provider, model: i.model })))
      if (composed) {
        const day = new Date().toISOString().slice(0, 10)
        const raw = (config.fileName ?? '').trim() || `veille-tarifaire-${day}.html`
        const name = raw.toLowerCase().endsWith('.html') ? raw : `${raw}.html`
        ctx.log('info', t('run.pwReport.done', {
          products: (report.kpis?.products ?? 0).toLocaleString('fr-FR'),
          sites: (report.byCompetitor ?? []).filter((c) => c.matched > 0).length,
          size: (composed.length / 1024).toFixed(1),
        }))
        return { html: composed, file: new File([composed], name, { type: 'text/html;charset=utf-8' }) }
      }
      ctx.log('warn', t('run.pwReport.composeFailed'))
    }

    const html = renderPriceWatchReport(report, {
      title: (config.title ?? '').trim() || DEFAULT_PW_REPORT.title,
      competitorThresholdPct: Math.abs(Number(config.competitorThresholdPct) || DEFAULT_PW_REPORT.competitorThresholdPct),
      familyThresholdPct: Math.abs(Number(config.familyThresholdPct) || DEFAULT_PW_REPORT.familyThresholdPct),
      examples: Math.max(0, Number(config.examples) || DEFAULT_PW_REPORT.examples),
    }, watchId)

    const day = new Date().toISOString().slice(0, 10)
    const raw = (config.fileName ?? '').trim() || `veille-tarifaire-${day}.html`
    const fileName = raw.toLowerCase().endsWith('.html') ? raw : `${raw}.html`
    const file = new File([html], fileName, { type: 'text/html;charset=utf-8' })

    ctx.log('info', t('run.pwReport.done', {
      products: (report.kpis?.products ?? 0).toLocaleString('fr-FR'),
      sites: (report.byCompetitor ?? []).filter((c) => c.matched > 0).length,
      size: (file.size / 1024).toFixed(1),
    }))
    return { html, file }
  },
}

nodeRegistry.register(pwReportNode)
