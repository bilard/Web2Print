// Node « Rapport de fréquentation » : génère un HTML/CSS autonome récapitulant le
// trafic du site (pages vues, visiteurs, sessions, durée, top pages/sources/pays) sur
// une période, prêt à être archivé sur Drive (→ Export Google Drive) ou envoyé par mail
// (→ Envoyer via Gmail). Lecture owner-only de `analyticsEvents` (cf. règles Firestore).
import { BarChart3 } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { useAuthStore } from '@/stores/auth.store'
import { collectAnalyticsReport, PERIOD_LABEL, type AnalyticsPeriod } from './analyticsReport'

interface AnalyticsReportConfig {
  title: string
  period: AnalyticsPeriod
  fileName: string
}

interface SheetOut { columns: { key: string; label: string }[]; rows: Record<string, unknown>[] }
interface AnalyticsReportOutputs { html: string; file: File; summary: SheetOut }

const PERIODS: AnalyticsPeriod[] = ['7d', '30d', '90d', '12m']

function AnalyticsReportConfigUi({
  config,
  onChange,
}: {
  config: AnalyticsReportConfig
  onChange: (next: AnalyticsReportConfig) => void
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">Titre du rapport</label>
        <input
          type="text"
          value={config.title}
          onChange={(e) => onChange({ ...config, title: e.target.value })}
          className="w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
          placeholder="Statistiques de fréquentation"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">Période</label>
        <select
          value={config.period}
          onChange={(e) => onChange({ ...config, period: e.target.value as AnalyticsPeriod })}
          className="w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
        >
          {PERIODS.map((p) => (
            <option key={p} value={p}>{PERIOD_LABEL[p]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">Nom du fichier (optionnel)</label>
        <input
          type="text"
          value={config.fileName}
          onChange={(e) => onChange({ ...config, fileName: e.target.value })}
          className="w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
          placeholder="rapport-trafic-AAAA-MM-JJ.html"
        />
      </div>
      <p className="text-[10px] text-neutral-500 leading-relaxed">
        Relie la sortie <strong className="text-neutral-300">html</strong> vers « Envoyer via Gmail »
        (port <strong className="text-neutral-300">data</strong>), coche <strong className="text-neutral-300">HTML</strong>
        et place <code className="text-neutral-400">{'{{html}}'}</code> dans le corps. Ou la sortie
        <strong className="text-neutral-300"> file</strong> vers « Export Google Drive » / « Envoyer via Gmail »
        (port <strong className="text-neutral-300">attachment</strong>) pour archiver le rapport riche en <code className="text-neutral-400">.html</code>.
      </p>
      <p className="text-[10px] text-neutral-500 leading-relaxed">
        Lecture réservée au propriétaire du site (collection <code className="text-neutral-400">analyticsEvents</code>).
      </p>
    </div>
  )
}

const analyticsReportNode: NodeSpec<AnalyticsReportConfig, Record<string, never>, AnalyticsReportOutputs> = {
  type: 'analytics-report',
  category: 'export',
  labelKey: 'node.analytics-report.label',
  descriptionKey: 'node.analytics-report.desc',
  icon: BarChart3,
  inputs: [],
  // `file` en tête : sortie à relier vers « Export Google Drive » (port file) ou
  // « Envoyer via Gmail » (port attachment). `html` = variante email-safe (corps de mail).
  outputs: [
    { name: 'file', type: 'file' },
    { name: 'html', type: 'any' },
    { name: 'summary', type: 'sheet' },
  ],
  configSchema: [],
  defaultConfig: { title: '', period: '30d', fileName: '' },
  runtime: 'client',
  ConfigComponent: AnalyticsReportConfigUi,
  cardSummary: (c) => `${c.title?.trim() || 'Trafic'} · ${PERIOD_LABEL[c.period ?? '30d']}`,
  run: async (ctx, config) => {
    const user = useAuthStore.getState().user
    if (!user?.uid) throw new Error('Utilisateur non authentifié — impossible de lire les statistiques.')

    ctx.log('info', `Agrégation du trafic (${PERIOD_LABEL[config.period ?? '30d']})…`)
    let report
    try {
      report = await collectAnalyticsReport({ period: config.period, title: config.title })
    } catch (e) {
      const code = (e as { code?: string })?.code
      if (code === 'permission-denied') {
        throw new Error('Accès refusé : seules les statistiques du propriétaire du site sont lisibles.', { cause: e })
      }
      throw e
    }

    const day = new Date().toISOString().slice(0, 10)
    const name = config.fileName?.trim() || `rapport-trafic-${day}.html`
    const fileName = name.toLowerCase().endsWith('.html') ? name : `${name}.html`
    const file = new File([report.html], fileName, { type: 'text/html;charset=utf-8' })

    const columns = report.summaryRows.length > 0
      ? Object.keys(report.summaryRows[0]).map((k) => ({ key: k, label: k }))
      : []

    ctx.log(
      'info',
      `Rapport généré : ${report.kpis.pageViews} pages vues · ${report.kpis.visitors} visiteurs · ${report.kpis.sessions} sessions.`,
    )
    return { html: report.emailHtml, file, summary: { columns, rows: report.summaryRows } }
  },
}

nodeRegistry.register(analyticsReportNode)
