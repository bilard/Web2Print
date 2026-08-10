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
import type { Workflow, NodeSpec, PortType } from '../types'
import { isCompatible } from './ports'
import { deriveWatchId } from '@/features/priceWatch/sourceSites'
import { drivenBySourceSites, watchIdOf } from './alignWatchIds'
import { breaksServerRun, ignoredOnServer } from './serverCapability'
import { t } from '@/lib/i18n'

/**
 * Correction applicable EN UN CLIC depuis le pré-vol. Sans elle, « corriger » voulait dire
 * supprimer la carte à la main puis retrouver quel lien rebrancher.
 *
 * ⚠ Un OBJET et non un littéral : `wire-input` doit dire QUOI brancher où. Aplati en
 * drapeaux, le dialogue perdait aussi l'association message ↔ correction — un bouton en
 * bas de carte pour l'un des trois messages, sans qu'on sache lequel.
 */
export type IssueFix =
  | { kind: 'drop-node' }
  | { kind: 'order-before-compare' }
  | {
      kind: 'wire-input'
      sourceId: string
      sourceHandle: string
      targetHandle: string
      /** Nom de la carte à brancher, pour que le bouton dise ce qu'il va faire. */
      sourceLabel: string
    }
  | {
      kind: 'align-watch-id'
      /** Suivi retenu, déjà dérivé (l'écrire en config est idempotent). */
      watchId: string
      /** Cartes à réécrire. Jamais celles qu'un « Sites sources » pilote : leur config
       *  locale est ignorée à l'exécution, y écrire donnerait un alignement fantôme. */
      nodeIds: string[]
    }

export interface WorkflowIssue {
  nodeId: string
  nodeLabel: string
  severity: 'error' | 'warning'
  message: string
  fix?: IssueFix
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
  // Le projet PIM n'est requis QUE sans feuille branchée : la feuille l'emporte et fournit
  // les fiches (cf. `configProblem(config, hasSheet)`, qui porte déjà cette règle côté
  // exécution). Déclaré `required` dans le schéma, il produisait un « paramètre requis,
  // non renseigné » sur une carte que le run traite sans broncher.
  'text-enrich': (c, wired) =>
    wired('sheet') || !isEmpty(c.projectId)
      ? null : t('wfv.configRequired', { field: t('node.text-enrich.projectId') }),
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
// ⚠ « Enrichir les textes » en fait partie depuis qu'elle PUBLIE ses réécritures dans le
// suivi : laissée hors de ce jeu, son réglage vide retombait sur `stableId(id du flux)` —
// elle écrivait donc à côté, en journalisant fièrement « N fiches publiées », pendant que
// l'écran de relecture lisait une collection vide.
// Exporté : c'est aussi l'ensemble que relit `firstWatchId.ts` pour rattacher un incident
// NAVIGATEUR au bon journal — même liste, un seul endroit qui la tient à jour côté client.
export const WATCH_NODES = new Set(['harvest-competitor', 'compare-catalog', 'directed-search', 'price-watch-track', 'text-enrich'])
/** Nodes qui ALIMENTENT l'index concurrent (le comparatif, lui, le consomme). */
const INDEX_FEEDERS = new Set(['harvest-competitor', 'directed-search'])

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
 * La SEULE façon de câbler une entrée orpheline, quand il n'y en a qu'une.
 *
 * ⚠ Rend `undefined` dès qu'il y a zéro ou plusieurs candidats. Zéro : la correction
 * serait « ajouter une carte source », ce qu'un dialogue de contrôle n'a pas à décider.
 * Plusieurs : brancher le premier venu serait un pari silencieux sur la donnée traitée —
 * c'est précisément le genre de choix invisible que ce pré-vol existe pour éviter.
 *
 * La compatibilité des types est celle de l'éditeur (`isCompatible`) : une seconde règle
 * finirait par diverger de ce que la souris autorise. Les candidats en AVAL de la cible
 * sont écartés — les brancher fabriquerait un cycle.
 */
function soleWiring(
  wf: Workflow,
  getSpec: (type: string) => NodeSpec | undefined,
  willRun: (id: string) => boolean,
  targetId: string,
  port: { name: string; type: PortType },
): IssueFix | undefined {
  const candidates: { sourceId: string; sourceHandle: string; sourceLabel: string }[] = []
  for (const n of wf.nodes) {
    if (n.id === targetId || !willRun(n.id)) continue
    if (reaches(wf, targetId, n.id)) continue
    const spec = getSpec(n.type)
    if (!spec) continue
    for (const out of spec.outputs) {
      if (!isCompatible(out.type, port.type)) continue
      candidates.push({ sourceId: n.id, sourceHandle: out.name, sourceLabel: t(spec.labelKey) })
    }
  }
  if (candidates.length !== 1) return undefined
  return { kind: 'wire-input', ...candidates[0], targetHandle: port.name }
}

/**
 * Sur quel suivi aligner les cartes qui divergent — ou `undefined` quand aucune cible
 * n'est défendable.
 *
 * ⚠⚠ Ce module est PUR : il ne sait pas sous quel `watchId` l'index existe déjà en base.
 * Aligner le comparatif sur un chemin que RIEN ne repeuplera lui fait relire du vide —
 * c'est le scénario où un rapport de 20 980 appariés est retombé à 72. La cible n'est donc
 * proposée que si le run va l'alimenter :
 *
 *  1. un « Sites sources » branché fait autorité — il impose déjà son suivi à l'exécution,
 *     et c'est la valeur que l'utilisateur voit sur une carte. Deux qui divergent : on
 *     s'abstient, aucune écriture de config ne les réconcilierait ;
 *  2. sinon, le suivi UNANIME des cartes qui ÉCRIVENT l'index (moisson, recherche
 *     dirigée) : elles le repeupleront dans ce run, l'alignement se referme de lui-même ;
 *  3. aucun alimenteur actif — un recalcul de comparatif seul, par exemple : la cible
 *     serait un pari sur des données qu'on ne voit pas. Pas de bouton.
 */
function alignFix(
  wf: Workflow,
  active: Workflow['nodes'],
  watchers: { n: Workflow['nodes'][number]; watchId: string }[],
): IssueFix | undefined {
  const uniqueOf = (ids: string[]) => {
    const vals = [...new Set(ids)]
    return vals.length === 1 ? vals[0] : undefined
  }
  const sourceSites = active.filter((n) => n.type === 'source-sites')
  const target = sourceSites.length > 0
    ? uniqueOf(sourceSites.map((n) => deriveWatchId(String((n.config as { watchId?: unknown } | undefined)?.watchId ?? ''), wf.id)))
    : uniqueOf(watchers.filter((w) => INDEX_FEEDERS.has(w.n.type)).map((w) => w.watchId))
  if (!target) return undefined

  const nodeIds = watchers
    .filter((w) => w.watchId !== target && !drivenBySourceSites(wf, w.n.id))
    .map((w) => w.n.id)
  // Une carte divergente que la config ne peut pas atteindre laisserait la panne en place
  // sous un bouton qui annonce l'avoir réglée. Mieux vaut pas de bouton du tout.
  const unreachable = watchers.some((w) => w.watchId !== target && drivenBySourceSites(wf, w.n.id))
  if (nodeIds.length === 0 || unreachable) return undefined
  return { kind: 'align-watch-id', watchId: target, nodeIds }
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
    .map((n) => ({ n, watchId: watchIdOf(wf, n.id, (n.config ?? {}) as Record<string, unknown>) }))
  const distinct = [...new Set(watchers.map((w) => w.watchId))]
  if (distinct.length > 1) {
    const fix = alignFix(wf, active, watchers)
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
        fix,
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
        fix: { kind: 'order-before-compare' },
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
        issues.push({
          nodeId: node.id, nodeLabel: label, severity: 'error',
          message: t('wfv.inputNotWired', { port: port.name }),
          fix: soleWiring(wf, getSpec, willRun, node.id, port),
        })
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
        message: t('wfv.serverUnsupported'), fix: { kind: 'drop-node' },
      })
    } else if (scheduled && ignoredOnServer(node.type)) {
      // Le run ne casse plus, mais il ne fait pas ce travail non plus : le dire, sinon un
      // run planifié « réussi » laisse croire que les textes ont été traités.
      issues.push({
        nodeId: node.id, nodeLabel: label, severity: 'warning',
        message: t('wfv.serverIgnored'), fix: { kind: 'drop-node' },
      })
    }
  }
  issues.push(...crossNodeIssues(wf, getSpec, willRun))
  return issues
}
