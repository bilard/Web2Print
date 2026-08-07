// VOLUMÉTRIE d'une carte de workflow : combien de lignes, de fiches, d'appariements.
//
// Le canvas ne disait rien des ordres de grandeur — on ouvrait le panneau, ou on lançait un
// run, pour savoir si une source portait mille lignes ou cent mille. Deux sources, dans cet
// ordre : la SORTIE du dernier run de la session (la plus fraîche, valable pour tous les
// nodes), puis, pour la veille tarifaire, le rapport PERSISTÉ — qui survit au rechargement
// et décrit ce que la base contient réellement.
import { useMemo } from 'react'
import { useRunContext } from '../../runtime/runContext'
import { useWorkflowStore } from '../../persistence/workflow.store'
import { useCatalogReport } from '@/features/priceWatch/useCatalogReport'
import { stableId } from '@/features/priceWatch/core'
import { DEFAULT_WATCH_ID } from '@/features/priceWatch/paths'

/** Nodes dont la volumétrie vit dans le rapport de veille, pas dans la sortie d'un run. */
const WATCH_NODES = new Set(['harvest-competitor', 'compare-catalog'])

/** Reproduit la dérivation du watchId côté node (config, sinon id du workflow). */
function watchIdOf(config: unknown, workflowId: string | undefined): string {
  const raw = (config as { watchId?: unknown } | undefined)?.watchId
  return stableId((typeof raw === 'string' ? raw : '').trim() || workflowId || DEFAULT_WATCH_ID)
}

const nf = (n: number) => n.toLocaleString('fr-FR')

/** Volumétrie lue dans les sorties d'un run : une feuille compte ses lignes, une liste ses
 *  éléments. Générique — c'est ce qui donne un chiffre aux nodes qui n'en déclarent aucun. */
function fromOutputs(outputs: Record<string, unknown> | undefined): string | null {
  if (!outputs) return null
  for (const v of Object.values(outputs)) {
    const sheet = v as { rows?: unknown[]; columns?: unknown[] } | null
    if (sheet && Array.isArray(sheet.rows) && Array.isArray(sheet.columns)) {
      return `${nf(sheet.rows.length)} lignes · ${sheet.columns.length} col.`
    }
    if (Array.isArray(v)) return `${nf(v.length)} éléments`
  }
  return null
}

/**
 * Ligne de volumétrie à afficher sous une carte. null quand rien n'est connu — on préfère
 * le silence à un « 0 » qui ferait croire à une collecte vide.
 */
export function useNodeVolume(nodeId: string, type: string, config: unknown): string | null {
  const outputs = useRunContext((s) => s.nodeStates[nodeId]?.outputs)
  const workflowId = useWorkflowStore((s) => s.current?.id)
  // Abonnement au rapport RÉSERVÉ aux nodes de veille : monter un onSnapshot par carte,
  // pour des nodes qui n'ont rien à y lire, coûterait une connexion par node du canvas.
  const watchId = WATCH_NODES.has(type) ? watchIdOf(config, workflowId) : null
  const report = useCatalogReport(watchId)

  return useMemo(() => {
    const live = fromOutputs(outputs)
    if (live) return live
    if (!report) {
      // Feuille choisie mais jamais lue : le nombre de colonnes est déjà un ordre de
      // grandeur, et il vient de la config (bouton « Actualiser les colonnes »).
      const cols = (config as { sheetColumns?: unknown } | undefined)?.sheetColumns
      return Array.isArray(cols) && cols.length > 0 ? `${cols.length} colonnes` : null
    }
    if (type === 'harvest-competitor') {
      const indexed = report.byCompetitor?.reduce((n, c) => n + (c.audit?.indexed ?? 0), 0) ?? 0
      const sites = report.byCompetitor?.filter((c) => (c.audit?.indexed ?? 0) > 0).length ?? 0
      return indexed > 0 ? `${nf(indexed)} fiches · ${sites} sites` : null
    }
    const matched = report.kpis?.products ?? 0
    return matched > 0 ? `${nf(matched)} appariés` : null
  }, [outputs, report, type, config])
}
