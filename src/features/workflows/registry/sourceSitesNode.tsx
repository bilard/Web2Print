// Node « Sites sources » : gestionnaire CENTRAL des sites concurrents de la veille
// tarifaire. La liste (activation par site, moteur forcé, stats de collecte) vit ICI et
// est émise sur le port `sites` — « Moisson concurrents » et « Comparer catalogue » la
// consomment via l'edge au lieu de dupliquer leur textarea (qui reste en repli).
import { ListChecks } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import {
  rowsToCompetitorSites, deriveWatchId, type SourceSitesPayload,
} from '@/features/priceWatch/sourceSites'
import { SourceSitesConfig } from './sourceSitesConfig'
import type { SourceSitesNodeConfig } from './sourceSitesTypes'
// `run()` n'est pas un composant : helper `t()` de module (lit la locale courante).
import { t } from '@/lib/i18n'

type SourceSitesOutputs = { sites: SourceSitesPayload }

const sourceSitesNode: NodeSpec<SourceSitesNodeConfig, Record<string, never>, SourceSitesOutputs> = {
  type: 'source-sites',
  category: 'import',
  labelKey: 'node.source-sites.label',
  descriptionKey: 'node.source-sites.desc',
  icon: ListChecks,
  inputs: [],
  outputs: [{ name: 'sites', type: 'sites' }],
  // Tout est rendu par le ConfigComponent (tableau de gestion + stats live).
  configSchema: [],
  defaultConfig: { watchId: '', sites: [] },
  cardSummary: (c) => {
    const total = (c.sites ?? []).length
    if (!total) return ''
    const active = rowsToCompetitorSites(c.sites).length
    return `${active} actif${active > 1 ? 's' : ''} / ${total} site${total > 1 ? 's' : ''}`
  },
  runtime: 'client',
  run: async (ctx, config) => {
    const watchId = deriveWatchId(config.watchId, ctx.workflowId)
    const sites = rowsToCompetitorSites(config.sites ?? [])
    if (sites.length === 0) {
      ctx.log('warn', t('run.ss.noActiveSite'))
    } else {
      const forced = sites.filter((s) => s.engine).length
      ctx.log('info', t('run.ss.emitted', {
        count: sites.length,
        watchId,
        suffix: forced ? t('run.ss.forcedEngine', { count: forced }) : '.',
      }))
    }
    ctx.reportCount?.(sites.length)
    return { sites: { watchId, sites } }
  },
  ConfigComponent: SourceSitesConfig,
}

nodeRegistry.register(sourceSitesNode)
