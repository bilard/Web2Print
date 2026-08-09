// Où en est le run, en chiffres. PUR.
//
// ⚠ Un run affichait « En cours » et rien d'autre : ni combien de cartes sont passées, ni
// laquelle travaille, ni combien de lignes ont été traitées. Sur une chaîne de veille qui
// tourne une heure, on avançait à l'aveugle — et la seule façon de savoir était de
// déplier la console et de lire les journaux à la main.
import type { NodeRunState, NodeStatus, Workflow } from '../types'

/** Une carte du run, telle qu'on veut la LIRE : son état, ce qu'elle a produit, son temps. */
export interface RunCard {
  id: string
  label: string
  status: NodeStatus
  count?: number
  durationMs?: number
  /** Passages de cette carte dans le run. Un run segmenté en fait plusieurs. */
  cycles?: number
}

export interface RunProgress {
  /** Cartes qui vont travailler dans ce run (les orphelines n'en font pas partie). */
  total: number
  done: number
  running: number
  failed: number
  skipped: number
  /** Part accomplie, 0 → 1. Une carte en cours compte pour une demie : elle a commencé. */
  ratio: number
  /** Libellés des cartes en cours, pour dire CE QUI travaille et pas seulement combien. */
  runningLabels: string[]
  /** Somme des compteurs live remontés par les cartes (fiches scrapées, lignes écrites…). */
  items: number
  /** Depuis le démarrage de la première carte, en ms. 0 si rien n'a commencé. */
  elapsedMs: number
  /**
   * Cycles COMPLETS : le nombre de fois que toutes les cartes démarrées ont bouclé.
   *
   * ⚠ Le chiffre qui manquait. Sur un run segmenté, aucune carte n'atteint jamais 100 % au
   * sens du graphe — elles repassent. « 3/11 cartes » laissait croire à un blocage alors
   * que le travail avance, cycle après cycle.
   */
  cyclesDone: number
  /** Lignes traitées par minute, sur toute la durée du run. `null` avant la première
   *  minute : un débit calculé sur trois secondes annonce n'importe quoi. */
  itemsPerMin: number | null
  /**
   * Temps restant estimé, en ms. `null` tant que l'estimation ne vaut rien.
   *
   * ⚠ Extrapolation LINÉAIRE sur la part accomplie, et rien de plus. Les cartes n'ont pas
   * la même durée — une moisson de vingt minutes suit un import de trois secondes — donc
   * l'estimation saute à chaque carte franchie. Elle répond à « encore longtemps ? », pas
   * à « à quelle heure exactement ». En dessous de 10 % accomplis, elle ne répond même
   * pas à ça : on ne l'affiche pas.
   */
  etaMs: number | null
  /**
   * Les cartes, dans l'ORDRE OÙ ELLES ONT TOURNÉ.
   *
   * ⚠ Pas l'ordre du graphe : sur un flux à douze cartes, il ne correspond ni au dessin
   * ni à l'exécution, et on cherche « où on en est » dans une liste qui ne raconte rien.
   * Les démarrées d'abord, par heure de démarrage ; les autres derrière, en attente.
   */
  cards: RunCard[]
}

const COUNTS_AS_DONE: NodeStatus[] = ['success', 'error', 'skipped']

/**
 * Avancement d'un run à partir de l'état des cartes.
 *
 * ⚠ Le dénominateur est le nombre de cartes qui VONT tourner, pas celui du graphe : une
 * carte orpheline ne s'exécutera jamais, et la compter ferait plafonner la barre à 80 %
 * pour toujours — le genre de détail qui fait douter de tout l'écran.
 */
export function runProgress(
  wf: Pick<Workflow, 'nodes' | 'edges'>,
  states: Record<string, NodeRunState>,
  labelOf: (nodeId: string) => string,
  now = Date.now(),
): RunProgress {
  const connected = new Set<string>()
  for (const e of wf.edges) { connected.add(e.source); connected.add(e.target) }
  const willRun = wf.nodes.filter((n) => wf.edges.length === 0 || connected.has(n.id))

  let done = 0, running = 0, failed = 0, skipped = 0, items = 0
  let firstStart = Infinity
  const runningLabels: string[] = []
  for (const node of willRun) {
    const st = states[node.id]
    if (!st) continue
    if (st.startedAt != null) firstStart = Math.min(firstStart, st.startedAt)
    if (typeof st.count === 'number') items += st.count
    if (st.status === 'running') { running++; runningLabels.push(labelOf(node.id)); continue }
    if (st.status === 'error') { failed++; done++; continue }
    if (st.status === 'skipped') { skipped++; done++; continue }
    if (COUNTS_AS_DONE.includes(st.status)) done++
  }

  const cards: RunCard[] = willRun.map((node) => {
    const st = states[node.id]
    return {
      id: node.id,
      label: labelOf(node.id),
      status: st?.status ?? 'pending',
      ...(typeof st?.count === 'number' ? { count: st.count } : {}),
      ...(st?.durationMs != null ? { durationMs: st.durationMs } : {}),
      ...(st?.cycles != null ? { cycles: st.cycles } : {}),
    }
  }).sort((a, b) => {
    const sa = states[a.id]?.startedAt ?? Infinity
    const sb = states[b.id]?.startedAt ?? Infinity
    return sa - sb
  })

  const total = willRun.length
  // Une carte en cours compte pour une demie : afficher 0 tant qu'elle n'a pas fini
  // laisserait la barre immobile pendant les vingt minutes d'une moisson.
  const ratio = total === 0 ? 0 : Math.min(1, (done + running * 0.5) / total)
  const elapsedMs = firstStart === Infinity ? 0 : Math.max(0, now - firstStart)
  // Le plus PETIT nombre de passages parmi les cartes démarrées : un cycle n'est complet
  // que si toutes l'ont bouclé. Prendre le maximum annoncerait des tours que la carte la
  // plus lente n'a pas faits.
  const started = cards.filter((c) => (c.cycles ?? 0) > 0)
  const cyclesDone = started.length === 0 ? 0 : Math.min(...started.map((c) => c.cycles ?? 0))
  return {
    cyclesDone,
    total, done, running, failed, skipped, ratio, runningLabels, items, cards,
    elapsedMs,
    itemsPerMin: elapsedMs >= 60_000 && items > 0 ? Math.round(items / (elapsedMs / 60_000)) : null,
    etaMs: ratio >= 0.1 && ratio < 1 && elapsedMs > 0
      ? Math.round((elapsedMs / ratio) * (1 - ratio))
      : null,
  }
}
