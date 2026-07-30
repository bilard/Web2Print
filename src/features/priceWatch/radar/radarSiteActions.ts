// Actions par CONCURRENT depuis la PWA radarPrice (parité du tableau « Sites sources » de
// l'app) : activer/désactiver, forcer un moteur, scraper ce site seul, purger ses données,
// le retirer. Tout ce qui touche à la config vit dans le node « Sites sources » du
// workflow — on le relit, on le patche, on le réenregistre (saveWorkflow resynchronise
// aussi le planning). Aucune dépendance React.
import { getWorkflow, saveWorkflow } from '@/features/workflows/persistence/workflowsApi'
import { normalizeDomain, type SourceSiteRow } from '../sourceSites'
import { stableId } from '../core'
import { t } from '@/lib/i18n'

/** Type du node porteur de la liste des concurrents. */
const SOURCE_SITES = 'source-sites'

export interface SourceSitesConfigDoc {
  /** Id du node « Sites sources » (absent = liste non gérée par ce node). */
  nodeId: string
  rows: SourceSiteRow[]
}

/** Lit la liste des sites du workflow. null = pas de node « Sites sources » (liste
 *  historique dans la config locale du node Moisson → non modifiable depuis le mobile). */
export async function loadSourceSites(uid: string, workflowId: string): Promise<SourceSitesConfigDoc | null> {
  const wf = await getWorkflow(uid, workflowId)
  if (!wf) return null
  const node = wf.nodes.find((n) => n.type === SOURCE_SITES)
  if (!node) return null
  const rows = ((node.config as { sites?: SourceSiteRow[] })?.sites ?? []).filter((r) => !!r?.domain)
  return { nodeId: node.id, rows }
}

/** Applique une transformation à la liste des sites et réenregistre le workflow. */
async function writeRows(
  uid: string,
  workflowId: string,
  transform: (rows: SourceSiteRow[]) => SourceSiteRow[],
): Promise<void> {
  const wf = await getWorkflow(uid, workflowId)
  // Jamais d'écriture à partir d'un workflow non chargé : on écraserait le graphe.
  if (!wf) throw new Error(t('err.pw.noWorkflow'))
  const node = wf.nodes.find((n) => n.type === SOURCE_SITES)
  if (!node) throw new Error(t('err.pw.noSourceSitesNode'))
  const cfg = node.config as { sites?: SourceSiteRow[] }
  const nodes = wf.nodes.map((n) =>
    n.id === node.id ? { ...n, config: { ...cfg, sites: transform(cfg.sites ?? []) } } : n)
  await saveWorkflow(uid, { ...wf, nodes })
}

/** Le site visé, identifié par son domaine (l'index d'affichage n'est pas fiable ici). */
const sameSite = (row: SourceSiteRow, domain: string) =>
  stableId(normalizeDomain(row.domain)) === stableId(normalizeDomain(domain))

/** Modifie UN site (activation, moteur forcé, drapeau d'accès connecté). ⚠ Une clé mise à
 *  `undefined` doit être RETIRÉE, pas conservée : Firestore refuse `undefined`. */
export async function patchSourceSite(
  uid: string, workflowId: string, domain: string, patch: Partial<SourceSiteRow>,
): Promise<void> {
  await writeRows(uid, workflowId, (rows) => rows.map((r) => {
    if (!sameSite(r, domain)) return r
    const merged = { ...r, ...patch } as SourceSiteRow & Record<string, unknown>
    for (const k of Object.keys(patch)) if ((patch as Record<string, unknown>)[k] === undefined) delete merged[k]
    return merged
  }))
}

/** Retire un site de la moisson (ses données collectées restent — purge séparée). */
export async function removeSourceSite(uid: string, workflowId: string, domain: string): Promise<void> {
  await writeRows(uid, workflowId, (rows) => rows.filter((r) => !sameSite(r, domain)))
}
