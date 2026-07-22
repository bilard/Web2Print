// functions/src/workflow/nodes/sourceSites.ts
// Jumeau SERVEUR (headless/cron) du node « Sites sources »
// (src/features/workflows/registry/sourceSitesNode.tsx). Émet sur le port `sites` la
// liste des sites ACTIFS + le watchId, consommés par Moisson / Comparer / Recherche
// dirigée via `resolveSitesInput`. Aucune UI ni Firestore — logique pure.
import { registerServerNode } from '../registry'
import { deriveWatchId, rowsToCompetitorSites, type SourceSiteRow } from '../../priceWatch/sourceSites'

registerServerNode({
  type: 'source-sites',
  run: async (ctx, config) => {
    const watchId = deriveWatchId(String(config.watchId ?? ''), ctx.workflowId)
    const rows = (Array.isArray(config.sites) ? config.sites : []) as SourceSiteRow[]
    const sites = rowsToCompetitorSites(rows)
    if (sites.length === 0) ctx.log('warn', 'Aucun site actif — les nodes branchés ne scraperont rien.')
    else ctx.log('info', `${sites.length} site(s) actif(s) émis (suivi « ${watchId} »).`)
    return { sites: { watchId, sites } }
  },
})
