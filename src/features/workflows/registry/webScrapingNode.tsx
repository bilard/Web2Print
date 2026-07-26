// Node UNIFIÉ « Web Scraping » : un seul node avec un sélecteur de Mode (Scrape /
// Liste / Recherche / Question) qui aiguille vers les runs des anciens nodes (devenus
// alias dépréciés, masqués de la palette). Unifie l'UX côté workflow sans réécrire le
// moteur. Cf. docs/superpowers/specs/2026-06-16-scraping-unification-design.md.
import { Globe } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { ConfigFieldRenderer } from '../editor/configFields'

/** Mode du node unifié → type de l'ancien node qui porte la logique. */
const MODE_TO_TYPE: Record<string, string> = {
  scrape: 'scrape-url',
  list: 'list-products',
  crawl: 'crawl',
  search: 'web-search',
  ask: 'web-ask',
}

const MODE_OPTIONS = [
  { value: 'scrape', label: 'Scrape — URL(s) → champs' },
  { value: 'list', label: 'Liste — pages catégorie → produits' },
  { value: 'crawl', label: 'Crawl — découverte de fiches (client)' },
  { value: 'search', label: 'Recherche web' },
  { value: 'ask', label: 'Question web (IA)' },
]

const MODE_LABEL: Record<string, string> = {
  scrape: 'Scrape', list: 'Liste produits', crawl: 'Crawl', search: 'Recherche', ask: 'Question',
}

type Cfg = Record<string, unknown>

/** Config conditionnelle : sélecteur de mode + les champs du node cible (réutilise
 *  leur configSchema existant via ConfigFieldRenderer). */
function WebScrapingConfig({ config, onChange }: { config: Cfg; onChange: (c: Cfg) => void; availableColumns?: string[] }) {
  const mode = (config.mode as string) ?? 'scrape'
  const target = nodeRegistry.get(MODE_TO_TYPE[mode] ?? 'scrape-url')
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs text-neutral-400 mb-1 block">Mode</span>
        <select
          value={mode}
          onChange={(e) => onChange({ ...config, mode: e.target.value })}
          className="w-full text-[13px] bg-well border border-neutral-800 rounded px-2 py-1.5 text-neutral-200 focus:outline-none focus:border-indigo-500/60"
        >
          {MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      {target?.configSchema.map((f) => (
        <label key={f.name} className="block">
          <span className="text-xs text-neutral-400 mb-1 block">{f.label}</span>
          <ConfigFieldRenderer
            field={f}
            value={config[f.name] ?? f.default}
            onChange={(v) => onChange({ ...config, [f.name]: v })}
          />
          {f.help ? <span className="text-[11px] text-neutral-600 mt-1 block">{f.help}</span> : null}
        </label>
      ))}
    </div>
  )
}

const webScrapingNode: NodeSpec<Cfg, Record<string, unknown>, Record<string, unknown>> = {
  type: 'web-scraping',
  category: 'import',
  label: 'Web Scraping',
  description:
    'Récupère des données du web (Jina / Bright Data / LLM) selon un Mode : Scrape (URL → champs), ' +
    'Liste (pages catégorie → produits, avec pagination), Recherche web, Question web (IA). ' +
    'Remplace les anciens nodes Scrape URL / Produits d’une page liste / Recherche / Question.',
  icon: Globe,
  // Ports superset des modes : query/question en entrée (Recherche/Question),
  // sheet/text/assets en sortie. Les URLs des modes Scrape/Liste sont en config.
  inputs: [
    { name: 'query', type: 'any', required: false },
    { name: 'question', type: 'any', required: false },
  ],
  outputs: [
    { name: 'sheet', type: 'sheet' },
    { name: 'text', type: 'any' },
    { name: 'assets', type: 'asset[]' },
  ],
  configSchema: [], // rendu par ConfigComponent (champs conditionnels au mode)
  defaultConfig: { mode: 'scrape' },
  runtime: 'any',
  connectors: ['jina', 'llm'],
  cardSummary: (config) => MODE_LABEL[(config.mode as string) ?? 'scrape'] ?? '',
  ConfigComponent: WebScrapingConfig,
  run: async (ctx, config, inputs) => {
    const mode = (config.mode as string) ?? 'scrape'
    const target = nodeRegistry.get(MODE_TO_TYPE[mode])
    if (!target) throw new Error(`Mode de scraping inconnu : ${mode}`)
    return target.run(ctx, config as never, inputs as never) as Promise<Record<string, unknown>>
  },
}

nodeRegistry.register(webScrapingNode)
