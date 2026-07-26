// Contrôle de COHÉRENCE avant lancement : détecte les trous (source non connectée,
// paramètre requis / d'export manquant) AVANT d'exécuter, pour ne plus les découvrir
// après coup. Deux sources de vérité :
//   1. déclaratif — `inputs[].required` (source manquante) + `configSchema[].required`
//      (paramètre requis, dont ceux des nodes d'export) ;
//   2. sémantique — quelques nodes dont la complétude n'est PAS déclarée dans le schéma
//      (ex. « Upload » porte le fichier choisi hors configSchema).
// PUR : le resolver de spec est injecté (testable sans registre).
import type { Workflow, NodeSpec } from '../types'

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
  return issues
}
