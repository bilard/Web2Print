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
  /**
   * Pourquoi le passage a rendu la main en laissant du travail. Absent quand il a fini,
   * ou quand il s'est tu sans rien dire — ce silence-là EST l'anomalie que l'écran doit
   * crier, et lui seul.
   *
   * ⚠ Seul le passage le sait : ni le flux ni ce document ne pouvaient le déduire. Sans
   * ce champ, l'écran affichait « passage arrêté » en orange après CHAQUE run, sur un
   * traitement parfaitement sain qui s'était simplement arrêté sur son budget.
   */
  stoppedBy?: 'spend' | 'deadline' | 'units'
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

/**
 * Une panne, telle qu'on veut la relire des semaines plus tard.
 *
 * ⚠ PAS de champ « domaine du concurrent en cause » : une carte en erreur (moisson,
 * recherche dirigée…) traite plusieurs sites en parallèle borné
 * (`mapWithConcurrency`, sans rattrapage par site) — la PREMIÈRE erreur à remonter
 * annule les fetchs des autres sites encore en vol sans que leurs propres erreurs ne
 * soient jamais capturées. Attribuer l'incident à UN domaine serait donc au mieux
 * partiel, au pire trompeur (« c'est CE site qui a cassé » quand deux ou trois
 * tournaient encore). Le champ existait, n'a jamais été renseigné par aucun
 * producteur, et rendait donc une promesse que l'écran ne tenait pas — retiré plutôt
 * que rafistolé. Le fiabiliser demanderait de faire remonter le site en cause depuis
 * CHAQUE type de carte de veille, client ET serveur — hors de proportion pour cette
 * seule case.
 */
export interface WatchIncident {
  ts: number
  /** Carte du flux qui a signalé la panne. */
  nodeLabel?: string
  message: string
  runId?: string
  origin: 'client' | 'server'
}

/**
 * Ce qu'un lancement fera du catalogue de textes — lu sur la carte « Textes » du flux.
 *
 * ⚠ Le type vit ICI, dans le module de types, et pas dans le hook qui le produit : le
 * formateur (`opsFormat`) en a besoin lui aussi, et l'exporter depuis un module de hook
 * rouvrirait la porte aux dépendances circulaires (cf. la baseline à 0 de `npm run cycles`).
 */
export type ResumeMode = 'loading' | 'on' | 'off' | 'noNode' | 'error' | 'noWorkflow'

/** Au-delà, un incident ne renseigne plus personne et encombre la collection. */
export const OPS_INCIDENT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
