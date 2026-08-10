// Ce que les nodes PUBLIENT de leur avancement, et ce que l'écran « Suivi » relit.
//
// ⚠ Un document minuscule, écrit au fil de l'eau. Le « reste à traduire » ne se recalcule
// PAS à l'ouverture de l'écran : il faudrait relire le catalogue source (jusqu'à 433 k
// fiches), c'est-à-dire le chemin exact qui a déjà saturé la mémoire du cron.
import type { EnrichKind } from '@/features/textEnrich/revision'

/** Avancement du chantier TEXTES (traduction, amélioration, structuration). */
export interface TextsProgress {
  /** Champs EXAMINÉS au dernier passage — le dénominateur honnête. */
  considered: number
  /** Champs sautés parce que déjà traités. */
  alreadyDone: number
  /** Champs retenus pour ce passage, ventilés par nature de travail. */
  pending: Partial<Record<EnrichKind, number>>
  /**
   * Ventilation par langue des champs restant à TRADUIRE. Absent hors traduction.
   * `lang: null` = le détecteur s'est abstenu ; jamais fondu dans le français.
   */
  byLang?: { lang: string | null; count: number }[]
  /**
   * Motif d'entrée dans la file : jamais traité (`fresh`) ou texte source modifié
   * depuis (`stale`). Absent en mode PIM, qui ne rend pas cette ventilation —
   * l'écran dit alors « non ventilé » plutôt que d'afficher un faux zéro.
   */
  reasons?: { fresh: number; stale: number }
  /** Avancement du passage EN COURS. */
  done: number
  total: number
  /** Début du passage, et dernière écriture — un passage muet est un passage mort. */
  startedAt: number
  beatAt: number
  /** Qui écrit : le navigateur ou le cron. */
  origin: 'client' | 'server'
}

/** Le document `.../ops/progress` d'un suivi. */
export interface WatchOpsProgress {
  updatedAt: number
  texts?: TextsProgress
}

/** Une panne, telle qu'on veut la relire des semaines plus tard. */
export interface WatchIncident {
  ts: number
  /** Domaine du concurrent en cause, quand l'incident en désigne un. */
  domain?: string
  /** Carte du flux qui a signalé la panne. */
  nodeLabel?: string
  message: string
  runId?: string
  origin: 'client' | 'server'
}

/** Au-delà, un incident ne renseigne plus personne et encombre la collection. */
export const OPS_INCIDENT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
