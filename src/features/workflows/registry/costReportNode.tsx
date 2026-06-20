// src/features/workflows/registry/costReportNode.tsx
// Node « Rapport de coûts IA » : génère un HTML/CSS autonome récapitulant la
// consommation IA & scraping du mois (mêmes données que le panneau live), prêt à
// être archivé sur Drive (→ Export Google Drive) ou envoyé par mail (→ Envoyer via
// Gmail, port « attachment »). Client-only : lit Firestore + les stores du
// navigateur (cf. SERVER_UNSUPPORTED côté serveur).
import { ReceiptText } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { useAuthStore } from '@/stores/auth.store'
import { collectCostReport } from './costReport'

interface CostReportConfig {
  title: string
  fileName: string
}

interface SheetOut { columns: { key: string; label: string }[]; rows: Record<string, unknown>[] }
interface CostReportOutputs { html: string; file: File; summary: SheetOut }

function CostReportConfigUi({
  config,
  onChange,
}: {
  config: CostReportConfig
  onChange: (next: CostReportConfig) => void
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
          placeholder="Consommation IA & Scraping"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">Nom du fichier (optionnel)</label>
        <input
          type="text"
          value={config.fileName}
          onChange={(e) => onChange({ ...config, fileName: e.target.value })}
          className="w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
          placeholder="rapport-couts-AAAA-MM.html"
        />
      </div>
      <p className="text-[10px] text-neutral-500 leading-relaxed">
        Relie la sortie <strong className="text-neutral-300">file</strong> (en tête) vers « Export Google Drive »
        (port <strong className="text-neutral-300">file</strong>, Drive connecté requis) pour archiver,
        ou vers « Envoyer via Gmail » (port <strong className="text-neutral-300">attachment</strong>, mode
        « Fichier source ») pour l’envoyer en pièce jointe <code className="text-neutral-400">.html</code>.
      </p>
      <p className="text-[10px] text-neutral-500 leading-relaxed">
        Pour l’afficher dans le <strong className="text-neutral-300">corps</strong> du mail (pas en pièce jointe),
        relie la sortie <strong className="text-neutral-300">html</strong> vers « Envoyer via Gmail »
        (port <strong className="text-neutral-300">data</strong>), coche <strong className="text-neutral-300">HTML</strong>
        et place <code className="text-neutral-400">{'{{html}}'}</code> dans le corps. Ou
        <strong className="text-neutral-300"> summary</strong> → <code className="text-neutral-400">{'{{table}}'}</code> pour un tableau simple.
      </p>
    </div>
  )
}

const costReportNode: NodeSpec<CostReportConfig, Record<string, never>, CostReportOutputs> = {
  type: 'cost-report',
  category: 'export',
  label: 'Rapport de coûts IA',
  description:
    'Génère un rapport HTML/CSS de la consommation IA & scraping du mois (tokens, coûts €/$, soldes, Bright Data) — à stocker sur Drive ou envoyer par mail.',
  icon: ReceiptText,
  inputs: [],
  // `file` en tête : c'est la sortie à relier vers « Export Google Drive » (port file)
  // ou « Envoyer via Gmail » (port attachment, ou data — tolérance de câblage).
  outputs: [
    { name: 'file', type: 'file' },
    { name: 'html', type: 'any' },
    { name: 'summary', type: 'sheet' },
  ],
  configSchema: [],
  defaultConfig: { title: '', fileName: '' },
  runtime: 'client',
  connectors: ['brightdata'],
  ConfigComponent: CostReportConfigUi,
  cardSummary: (c) => c.title?.trim() || 'Coûts du mois',
  run: async (ctx, config) => {
    const user = useAuthStore.getState().user
    if (!user?.uid) throw new Error('Utilisateur non authentifié — impossible de lire les coûts.')

    ctx.reportConnector?.('brightdata')
    ctx.log('info', 'Agrégation des coûts IA & scraping du mois…')
    const report = await collectCostReport({ uid: user.uid, email: user.email, title: config.title })

    const month = new Date().toISOString().slice(0, 7)
    const name = config.fileName?.trim() || `rapport-couts-${month}.html`
    const fileName = name.toLowerCase().endsWith('.html') ? name : `${name}.html`
    const file = new File([report.html], fileName, { type: 'text/html;charset=utf-8' })

    const columns = report.summaryRows.length > 0
      ? Object.keys(report.summaryRows[0]).map((k) => ({ key: k, label: k }))
      : []

    ctx.log(
      'info',
      `Rapport généré : total ${report.totalEur.toFixed(2)} € · ${report.tokensIn} in / ${report.tokensOut} out · ${(file.size / 1024).toFixed(1)} KB.`,
    )
    return { html: report.html, file, summary: { columns, rows: report.summaryRows } }
  },
}

nodeRegistry.register(costReportNode)
