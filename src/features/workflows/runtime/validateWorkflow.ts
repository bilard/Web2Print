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
import { breaksServerRun, ignoredOnServer } from './serverCapability'
import { t } from '@/lib/i18n'

export interface WorkflowIssue {
  nodeId: string
  nodeLabel: string
  severity: 'error' | 'warning'
  message: string
  /** Correction applicable en un clic depuis le pré-vol. `drop-node` = retirer la carte
   *  et recoudre le flux (cf. `dropNodeAndRewire`) : sans elle, « corriger » voulait dire
   *  supprimer la carte À LA MAIN puis retrouver quel lien rebrancher. */
  fix?: 'drop-node' | 'order-before-compare'
}

/** Complétude non exprimable via `required` (valeur portée par la ConfigComponent,
 *  ou satisfiable par un PORT branché — 2ᵉ argument = « ce port est-il câblé ? »). */
const SEMANTIC_CHECKS: Record<string, (config: Record<string, unknown>, wired: (port: string) => boolean) => string | null> = {
  upload: (c) => (c.fileKey ? null : t('wfv.noFileSelected')),
  // La liste des sites peut venir du port `sites` (node « Sites sources ») OU de la
  // textarea locale — requis « l'un ou l'autre », inexprimable en configSchema.required.
  'harvest-competitor': (c, wired) =>
    wired('sites') || !isEmpty(c.sites) ? null : t('wfv.noSite'),
  'compare-catalog': (c, wired) =>
    wired('sites') || !isEmpty(c.sites) ? null : t('wfv.noSite'),
  'directed-search': (c, wired) =>
    wired('sites') || !isEmpty(c.sites) ? null : t('wfv.noSite'),
  'source-sites': (c) =>
    Array.isArray(c.sites) && (c.sites as { enabled?: boolean }[]).some((r) => r?.enabled)
      ? null : t('wfv.noActiveSite'),
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
  const labelOf = (type: string) => { const sp = getSpec(type); return sp ? t(sp.labelKey) : type }

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
        message: t('wfv.watchIdMismatch', {
          watchId: w.watchId,
          others: distinct.length - 1,
          list: distinct.filter((d) => d !== w.watchId).join(', '),
        }),
      })
    }
  }

  // 2. Un comparatif qui ne suit pas ses alimenteurs compare l'index d'un run ANTÉRIEUR.
  //    ⚠ Contrôlé alimenteur PAR alimenteur : la règle ne regardait que « au moins un »,
  //    si bien qu'une moisson branchée couvrait une recherche dirigée qui, elle, partait
  //    en parallèle. Ses trouvailles arrivaient donc APRÈS la comparaison — le comparatif
  //    ne les voyait pas, et rien ne le disait.
  const feeders = active.filter((n) => INDEX_FEEDERS.has(n.type))
  for (const cmp of active.filter((n) => n.type === 'compare-catalog')) {
    const loose = feeders.filter((f) => !reaches(wf, f.id, cmp.id))
    if (loose.length === 0) continue
    for (const f of loose) {
      issues.push({
        nodeId: f.id,
        nodeLabel: labelOf(f.type),
        severity: 'warning',
        message: t('wfv.feederNotOrdered', { compare: labelOf(cmp.type) }),
        fix: 'order-before-compare',
      })
    }
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

  // Une planification active change le lieu d'exécution : le run part des Cloud
  // Functions, pas du navigateur. Détecté ici plutôt que via `findActiveCron`, qui vit
  // dans la couche de persistance (Firestore) et rendrait ce module impur.
  const scheduled = wf.nodes.some(
    (n) => n.type === 'cron' && (n.config as { enabled?: boolean } | undefined)?.enabled === true,
  )

  const issues: WorkflowIssue[] = []
  for (const node of wf.nodes) {
    if (!willRun(node.id)) continue
    const spec = getSpec(node.type)
    const label = spec ? t(spec.labelKey) : node.type
    if (!spec) {
      issues.push({ nodeId: node.id, nodeLabel: label, severity: 'error', message: t('wfv.unknownType', { type: node.type }) })
      continue
    }
    const config = (node.config ?? {}) as Record<string, unknown>

    // 1a. Entrées requises non connectées → source manquante.
    for (const port of spec.inputs) {
      if (!port.required) continue
      const wired = wf.edges.some((e) => e.target === node.id && e.targetHandle === port.name)
      if (!wired) {
        issues.push({ nodeId: node.id, nodeLabel: label, severity: 'error', message: t('wfv.inputNotWired', { port: port.name }) })
      }
    }
    // 1b. Config requise manquante (inclut les paramètres d'export requis).
    for (const field of spec.configSchema) {
      if (!field.required) continue
      if (isEmpty(config[field.name])) {
        issues.push({ nodeId: node.id, nodeLabel: label, severity: 'error', message: t('wfv.configRequired', { field: String(field.label ?? field.name) }) })
      }
    }
    // 2. Contrôles sémantiques.
    const wiredPort = (port: string) => wf.edges.some((e) => e.target === node.id && e.targetHandle === port)
    const sem = SEMANTIC_CHECKS[node.type]?.(config, wiredPort)
    if (sem) issues.push({ nodeId: node.id, nodeLabel: label, severity: 'error', message: sem })

    // 3. Cette carte ne tourne pas côté SERVEUR, et le workflow est planifié.
    // C'est une panne certaine, connue d'avance, et jusqu'ici invisible : le cron marque
    // la carte en erreur et SAUTE tout l'aval — un comparatif qui ne compare rien, un
    // mail qui ne part pas —, et on ne l'apprend qu'en dépliant les logs du run nocturne.
    // Signalée seulement si une planification est active : lancé depuis le navigateur, le
    // même workflow s'exécute parfaitement.
    if (scheduled && breaksServerRun(node.type)) {
      issues.push({
        nodeId: node.id, nodeLabel: label, severity: 'error',
        message: t('wfv.serverUnsupported'), fix: 'drop-node',
      })
    } else if (scheduled && ignoredOnServer(node.type)) {
      // Le run ne casse plus, mais il ne fait pas ce travail non plus : le dire, sinon un
      // run planifié « réussi » laisse croire que les textes ont été traités.
      issues.push({
        nodeId: node.id, nodeLabel: label, severity: 'warning',
        message: t('wfv.serverIgnored'), fix: 'drop-node',
      })
    }
  }
  issues.push(...crossNodeIssues(wf, getSpec, willRun))
  return issues
}
