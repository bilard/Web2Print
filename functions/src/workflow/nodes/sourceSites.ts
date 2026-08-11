// functions/src/workflow/nodes/sourceSites.ts
// Jumeau SERVEUR (headless/cron) du node « Sites sources »
// (src/features/workflows/registry/sourceSitesNode.tsx). Émet sur le port `sites` la
// liste des sites ACTIFS + le watchId, consommés par Moisson / Comparer / Recherche
// dirigée via `resolveSitesInput`.
import { getFirestore } from 'firebase-admin/firestore'
import { registerServerNode } from '../registry'
import { deriveWatchId, rowsToCompetitorSites, normalizeDomain, type SourceSiteRow } from '../../priceWatch/sourceSites'
import { stableId } from '../../priceWatch/helpers'
import { competitorDoc } from '../../priceWatch/paths'
import { t } from '../../i18n'

registerServerNode({
  type: 'source-sites',
  run: async (ctx, config) => {
    const watchId = deriveWatchId(String(config.watchId ?? ''), ctx.workflowId)
    const rows = (Array.isArray(config.sites) ? config.sites : []) as SourceSiteRow[]
    const sites = rowsToCompetitorSites(rows)
    if (sites.length === 0) ctx.log('warn', t(ctx.locale, 'run.ss.noActiveSite'))
    else ctx.log('info', t(ctx.locale, 'run.ss.emitted', { count: sites.length, watchId, suffix: '.' }))

    // Jumeau du client : marque l'état coché/décoché dans la méta du concurrent. Le
    // cockpit lit Firestore et n'a aucun autre moyen de connaître un état qui vit dans
    // la config du workflow — sans ça, un site décoché pèse encore sur les jauges.
    const db = getFirestore()
    const active = new Set(sites.map((s) => s.id))
    await Promise.all(rows.map((row) => {
      const domain = normalizeDomain(String(row?.domain ?? ''))
      if (!domain) return Promise.resolve()
      return db.doc(competitorDoc(ctx.uid, watchId, stableId(domain)))
        .set({ enabled: active.has(stableId(domain)) }, { merge: true })
        .catch(() => undefined)
    }))
    // Chiffre de la carte sur l'écran « Suivi » : sans lui, le badge reste muet.
    ctx.reportCount?.(sites.length)
    return { sites: { watchId, sites } }
  },
})
