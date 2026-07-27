// Contrôle de COHÉRENCE avant lancement : détecte les trous (source non connectée,
// paramètre requis / d'export manquant) AVANT d'exécuter, pour ne plus les découvrir
// après coup. Deux sources de vérité :
//   1. déclaratif — `inputs[].required` (source manquante) + `configSchema[].required`
//      (paramètre requis, dont ceux des nodes d'export) ;
//   2. sémantique — quelques nodes dont la complétude n'est PAS déclarée dans le schéma
//      (ex. « Upload » porte le fichier choisi hors configSchema).
//   3. CROISÉ — cohérence ENTRE nodes. C'est la classe de pannes la plus coûteuse de la
//      Veille tarifaire : chaque node est valide isolément, mais ils ne parlent pas du
//      même suivi, ou le comparatif s'exécute sans rien à comparer. Rien ne le signale à
//      l'exécution : le rapport sort simplement VIDE, et on cherche ailleurs pendant des
//      jours.
// PUR : le resolver de spec est injecté (testable sans registre).
import type { Workflow, NodeSpec } from '../types'
import { deriveWatchId } from '@/features/priceWatch/sourceSites'

export interface WorkflowIssue {
  nodeId: string
  nodeLabel: string
  severity: 'error' | 'warning'
  message: string
}

/** Complétude non exprimable via `required` (valeur portée par la ConfigComponent,
 *  ou satisfiable par un PORT branché — 2ᵉ argument = « ce port est-il câblé ? »). */
const SEMANTIC_CHECKS: Record<string, (config: Record<string, unknown>, wired: (port: string) => boolean) => string | null> = {
  upload: (c) => (c.fileKey ? null : 'Aucun fichier sélectionné — ouvre la config du node.'),
  // La liste des sites peut venir du port `sites` (node « Sites sources ») OU de la
  // textarea locale — requis « l'un ou l'autre », inexprimable en configSchema.required.
  'harvest-competitor': (c, wired) =>
    wired('sites') || !isEmpty(c.sites) ? null : 'Aucun site : renseigne « Sites concurrents » ou branche un node « Sites sources ».',
  'compare-catalog': (c, wired) =>
    wired('sites') || !isEmpty(c.sites) ? null : 'Aucun site : renseigne « Sites concurrents » ou branche un node « Sites sources ».',
  'directed-search': (c, wired) =>
    wired('sites') || !isEmpty(c.sites) ? null : 'Aucun site : renseigne « Sites concurrents » ou branche un node « Sites sources ».',
  'source-sites': (c) =>
    Array.isArray(c.sites) && (c.sites as { enabled?: boolean }[]).some((r) => r?.enabled)
      ? null : 'Aucun site actif dans le gestionnaire — ajoute ou active au moins un site.',
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

/** Nodes de la Veille tarifaire : tous adressent le MÊME suivi (`watchId`) — la moisson
 *  écrit, le comparatif relit. Un écart d'un seul caractère = deux chemins Firestore
 *  distincts, donc 0 apparié, sans le moindre message. */
const WATCH_NODES = new Set(['harvest-competitor', 'compare-catalog', 'directed-search', 'price-watch-track'])
/** Nodes qui ALIMENTENT l'index concurrent (le comparatif, lui, le consomme). */
const INDEX_FEEDERS = new Set(['harvest-competitor', 'directed-search'])

/**
 * Suivi RÉELLEMENT adressé par un node : le node « Sites sources » branché GAGNE (il
 * impose son watchId), sinon la config locale, sinon l'identifiant du workflow.
 * Reproduit `resolveSitesInput` — toute divergence ici serait pire qu'aucun contrôle.
 */
function effectiveWatchId(wf: Workflow, nodeId: string, config: Record<string, unknown>): string {
  const src = wf.edges.find((e) => e.target === nodeId && e.targetHandle === 'sites')
  const srcNode = src ? wf.nodes.find((n) => n.id === src.source) : undefined
  if (srcNode?.type === 'source-sites') {
    const c = (srcNode.config ?? {}) as Record<string, unknown>
    return deriveWatchId(String(c.watchId ?? ''), wf.id)
  }
  return deriveWatchId(String(config.watchId ?? ''), wf.id)
}

/** Le node `to` est-il ATTEIGNABLE depuis `from` en suivant les arêtes ? */
function reaches(wf: Workflow, from: string, to: string): boolean {
  const seen = new Set([from])
  const queue = [from]
  while (queue.length) {
    const cur = queue.shift()!
    if (cur === to) return true
    for (const e of wf.edges) {
      if (e.source === cur && !seen.has(e.target)) { seen.add(e.target); queue.push(e.target) }
    }
  }
  return false
}

/**
 * Contrôles ENTRE nodes — invisibles à l'exécution, coûteux à diagnostiquer.
 * `willRun` reprend la règle de l'exécuteur (un orphelin ne compte pas).
 */
function crossNodeIssues(
  wf: Workflow, getSpec: (t: string) => NodeSpec | undefined, willRun: (id: string) => boolean,
): WorkflowIssue[] {
  const issues: WorkflowIssue[] = []
  const active = wf.nodes.filter((n) => willRun(n.id))
  const labelOf = (t: string) => getSpec(t)?.label ?? t

  // 1. Un seul suivi par workflow. La moisson écrit sous `watchId`, le comparatif relit
  //    sous le sien : deux valeurs = index introuvable, rapport vide, aucun message.
  const watchers = active
    .filter((n) => WATCH_NODES.has(n.type))
    .map((n) => ({ n, watchId: effectiveWatchId(wf, n.id, (n.config ?? {}) as Record<string, unknown>) }))
  const distinct = [...new Set(watchers.map((w) => w.watchId))]
  if (distinct.length > 1) {
    for (const w of watchers) {
      issues.push({
        nodeId: w.n.id,
        nodeLabel: labelOf(w.n.type),
        severity: 'error',
        message:
          `Ce node adresse le suivi « ${w.watchId} » alors que d'autres nodes du workflow en adressent ` +
          `${distinct.length - 1} autre(s) (${distinct.filter((d) => d !== w.watchId).join(', ')}). ` +
          `La moisson écrirait dans un suivi et le comparatif relirait dans un autre — 0 apparié, sans erreur visible. ` +
          `Aligne le champ « Identifiant du suivi », ou branche tous ces nodes au MÊME node « Sites sources ».`,
      })
    }
  }

  // 2. Un comparatif qui ne suit aucun alimenteur compare l'index d'un run ANTÉRIEUR.
  //    Légitime pour un recalcul, suspect quand la moisson est là mais pas branchée.
  const feeders = active.filter((n) => INDEX_FEEDERS.has(n.type))
  for (const cmp of active.filter((n) => n.type === 'compare-catalog')) {
    if (feeders.length === 0) continue
    if (feeders.some((f) => reaches(wf, f.id, cmp.id))) continue
    issues.push({
      nodeId: cmp.id,
      nodeLabel: labelOf(cmp.type),
      severity: 'warning',
      message:
        `Aucun node de collecte (${feeders.map((f) => labelOf(f.type)).join(', ')}) n'est branché EN AMONT : ` +
        `le comparatif relira l'index du run précédent, pas celui que ce run va produire. ` +
        `Relie « ${labelOf(feeders[0].type)} » à ce node si tu veux comparer des données fraîches.`,
    })
  }

  return issues
}

/**
 * Renvoie les incohérences des nodes QUI VONT S'EXÉCUTER (même règle que l'exécuteur :
 * un orphelin n'est ignoré que si le graphe a au moins un lien). Liste vide = cohérent.
 */
export function validateWorkflow(
  wf: Workflow,
  getSpec: (type: string) => NodeSpec | undefined,
): WorkflowIssue[] {
  const connected = new Set<string>()
  for (const e of wf.edges) { connected.add(e.source); connected.add(e.target) }
  const willRun = (id: string) => wf.edges.length === 0 || connected.has(id)

  const issues: WorkflowIssue[] = []
  for (const node of wf.nodes) {
    if (!willRun(node.id)) continue
    const spec = getSpec(node.type)
    const label = spec?.label ?? node.type
    if (!spec) {
      issues.push({ nodeId: node.id, nodeLabel: label, severity: 'error', message: `Type de node inconnu (« ${node.type} »).` })
      continue
    }
    const config = (node.config ?? {}) as Record<string, unknown>

    // 1a. Entrées requises non connectées → source manquante.
    for (const port of spec.inputs) {
      if (!port.required) continue
      const wired = wf.edges.some((e) => e.target === node.id && e.targetHandle === port.name)
      if (!wired) {
        issues.push({ nodeId: node.id, nodeLabel: label, severity: 'error', message: `Entrée « ${port.name} » non connectée (source manquante).` })
      }
    }
    // 1b. Config requise manquante (inclut les paramètres d'export requis).
    for (const field of spec.configSchema) {
      if (!field.required) continue
      if (isEmpty(config[field.name])) {
        issues.push({ nodeId: node.id, nodeLabel: label, severity: 'error', message: `Paramètre « ${field.label} » requis, non renseigné.` })
      }
    }
    // 2. Contrôles sémantiques.
    const wiredPort = (port: string) => wf.edges.some((e) => e.target === node.id && e.targetHandle === port)
    const sem = SEMANTIC_CHECKS[node.type]?.(config, wiredPort)
    if (sem) issues.push({ nodeId: node.id, nodeLabel: label, severity: 'error', message: sem })
  }
  issues.push(...crossNodeIssues(wf, getSpec, willRun))
  return issues
}
