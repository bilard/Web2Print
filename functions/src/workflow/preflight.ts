// Contrôle de cohérence ENTRE nodes, côté SERVEUR — jumeau des contrôles croisés de
// `src/features/workflows/runtime/validateWorkflow.ts`.
//
// ⚠ Le contrôle client ne se déclenche qu'au clic sur « Lancer » dans l'éditeur. Les runs
// PLANIFIÉS (cron), déclenchés par webhook ou par Telegram n'en voyaient donc jamais la
// couleur : un workflow qui adresse deux suivis distincts s'exécutait chaque nuit en
// produisant un rapport vide, sans la moindre trace de la cause.
//
// Ne contient QUE les contrôles croisés : les contrôles déclaratifs (entrée requise,
// paramètre manquant) dépendent des NodeSpec, qui n'existent pas côté serveur.
//
// N'INTERROMPT RIEN : le résultat est journalisé. Bloquer une exécution planifiée sur une
// heuristique statique ferait plus de dégâts qu'elle n'en évite — et la moisson reste
// utile même quand le comparatif, lui, lira le mauvais suivi.
import { deriveWatchId } from '../priceWatch/sourceSites'

interface GraphNode { id: string; type: string; config?: unknown }
interface GraphEdge { source: string; target: string; targetHandle?: string }
interface Graph { id: string; nodes: GraphNode[]; edges: GraphEdge[] }

/** Nodes de la Veille tarifaire : tous doivent adresser le MÊME suivi. ⚠ « Enrichir les
 *  textes » en fait partie depuis qu'elle y publie ses réécritures — jumeau du pré-vol
 *  client (src/features/workflows/runtime/validateWorkflow.ts). */
const WATCH_NODES = new Set(['harvest-competitor', 'compare-catalog', 'directed-search', 'price-watch-track', 'text-enrich'])
/** Nodes qui ALIMENTENT l'index concurrent (le comparatif le consomme). */
const INDEX_FEEDERS = new Set(['harvest-competitor', 'directed-search'])

// Exporté : `execute.ts` s'en sert pour le libellé d'une carte en erreur consignée au
// journal des pannes (couvre les nodes de la veille tarifaire ; les autres retombent sur
// leur `type` brut — aucun catalogue de libellés traduits n'existe côté serveur).
export const LABELS: Record<string, string> = {
  'harvest-competitor': 'Moisson concurrents',
  'compare-catalog': 'Comparer catalogue',
  'directed-search': 'Recherche dirigée',
  'price-watch-track': 'Suivi de prix',
  'text-enrich': 'Enrichir les textes',
  'source-sites': 'Sites sources',
}

/** `config.watchId` d'un node, quelle que soit la forme réelle de sa config. */
function watchIdOf(node: GraphNode): string {
  const c = node.config
  if (!c || typeof c !== 'object') return ''
  const v = (c as Record<string, unknown>).watchId
  return typeof v === 'string' ? v : ''
}

/** Suivi réellement adressé : un node « Sites sources » branché IMPOSE le sien. */
function effectiveWatchId(wf: Graph, node: GraphNode): string {
  const src = wf.edges.find((e) => e.target === node.id && e.targetHandle === 'sites')
  const srcNode = src ? wf.nodes.find((n) => n.id === src.source) : undefined
  if (srcNode?.type === 'source-sites') {
    return deriveWatchId(watchIdOf(srcNode), wf.id)
  }
  return deriveWatchId(watchIdOf(node), wf.id)
}

/** Premier suivi adressé par ce workflow, ou `null` s'il n'en désigne aucun. Sert à
 *  rattacher un incident SERVEUR (crash de run) au bon journal — cf. `appendRunLiveError`.
 *  Ne tranche pas entre plusieurs suivis distincts (`preflightWarnings` le signale déjà) :
 *  un incident mal aiguillé reste préférable à aucun incident consigné. */
export function firstWatchId(wf: Graph): string | null {
  const connected = new Set<string>()
  for (const e of wf.edges) { connected.add(e.source); connected.add(e.target) }
  const active = wf.nodes.filter((n) => wf.edges.length === 0 || connected.has(n.id))
  const watcher = active.find((n) => WATCH_NODES.has(n.type))
  return watcher ? effectiveWatchId(wf, watcher) : null
}

/** `to` est-il atteignable depuis `from` en suivant les arêtes ? */
function reaches(wf: Graph, from: string, to: string): boolean {
  const seen = new Set([from])
  const queue = [from]
  while (queue.length) {
    const cur = queue.shift() as string
    if (cur === to) return true
    for (const e of wf.edges) {
      if (e.source === cur && !seen.has(e.target)) { seen.add(e.target); queue.push(e.target) }
    }
  }
  return false
}

/**
 * Lignes de journal décrivant les incohérences entre nodes. Vide = cohérent.
 * Formatées pour la console de run (préfixe ⚠), pas pour une exception.
 */
export function preflightWarnings(wf: Graph): string[] {
  const out: string[] = []
  const label = (t: string) => LABELS[t] ?? t
  // Même règle que l'exécuteur : un node orphelin ne s'exécute pas si le graphe a des liens.
  const connected = new Set<string>()
  for (const e of wf.edges) { connected.add(e.source); connected.add(e.target) }
  const active = wf.nodes.filter((n) => wf.edges.length === 0 || connected.has(n.id))

  const watchers = active.filter((n) => WATCH_NODES.has(n.type))
    .map((n) => ({ n, watchId: effectiveWatchId(wf, n) }))
  const distinct = [...new Set(watchers.map((w) => w.watchId))]
  if (distinct.length > 1) {
    out.push(
      `⚠ Ce workflow adresse ${distinct.length} suivis DIFFÉRENTS (${distinct.join(', ')}) : ` +
      watchers.map((w) => `« ${label(w.n.type)} » → ${w.watchId}`).join(' · ') +
      '. La moisson écrit dans un suivi et le comparatif relit dans un autre — le rapport sera VIDE. ' +
      'Aligne le champ « Identifiant du suivi », ou branche tous ces nodes au même « Sites sources ».')
  }

  const feeders = active.filter((n) => INDEX_FEEDERS.has(n.type))
  for (const cmp of active.filter((n) => n.type === 'compare-catalog')) {
    if (feeders.length === 0) continue
    if (feeders.some((f) => reaches(wf, f.id, cmp.id))) continue
    out.push(
      `⚠ « ${label(cmp.type)} » n'est branché derrière aucun node de collecte : ` +
      'il relira l\'index du run précédent, pas celui que ce run va produire.')
  }
  return out
}
