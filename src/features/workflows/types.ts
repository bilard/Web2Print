import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { TranslationKey } from '@/lib/i18n'

export type PortType = string

export interface Port {
  name: string
  type: PortType
  required?: boolean
}

type ConfigFieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'checkbox'
  | 'select'
  | 'expression'
  /** Heure de la journée — sélecteur natif, stocké « HH:MM ». */
  | 'time'
  /** Jours de la semaine — pastilles L M M J V S D, stockées « 1,2,3,4,5 » (0 = dimanche).
   *  Vide = tous les jours, et c'est la forme normalisée des sept jours cochés. */
  | 'weekdays'
  | 'columnRef'
  /** Plusieurs colonnes ORDONNÉES, stockées en une chaîne « A > B > C ». */
  | 'columnList'
  /** Choix MULTIPLE parmi des options fixes (cases à cocher), stocké « a,b,c ». */
  | 'multiSelect'

export interface ConfigField {
  name: string
  kind: ConfigFieldKind
  /** Libellé BRUT (nom de colonne dynamique, valeur issue des données…). */
  label?: string
  /** Libellé traduit — préféré à `label` quand présent. */
  labelKey?: TranslationKey
  required?: boolean
  /** `labelKey` est préféré à `label` — même règle que le champ lui-même. `label`
   *  reste utile quand l'option porte une valeur issue des DONNÉES (nom de colonne). */
  options?: { value: string; label?: string; labelKey?: TranslationKey }[]
  default?: unknown
  help?: string
  helpKey?: TranslationKey
  disabledNoteKey?: TranslationKey
  /** Grise + désactive le champ (sans le cacher) quand il n'a aucun effet dans l'état
   *  courant — ex : « Heure » quand le cron relance après la fin, ou « Sites concurrents »
   *  quand un node « Sites sources » est branché et l'emporte. Le champ reste visible pour
   *  ne pas dérouter, avec la mention `disabledNote`.
   *  2ᵉ argument : « ce port d'entrée est-il câblé ? » — un champ rendu inutile par une
   *  connexion ne peut pas le savoir depuis la seule config. */
  disabledWhen?: (config: Record<string, unknown>, wired: (port: string) => boolean) => boolean
  /** Raison affichée quand `disabledWhen` est vrai. Défaut : « sans effet ici ». */
  disabledNote?: string
}

type NodeRuntime = 'client' | 'server' | 'any'

export interface NodeSpec<C = unknown, I = unknown, O = unknown> {
  type: string
  category:
    | 'import'
    | 'enrichment'
    | 'transformation'
    | 'persistence'
    | 'export'
    | 'utility'
    | 'logic'
    | 'communication'
  /** ⚠️ CLÉS de traduction. Le `type` reste l'identifiant : c'est lui que
   *  l'IA « prompt-to-flow » émet et que le moteur compare. */
  labelKey: TranslationKey
  descriptionKey?: TranslationKey
  icon: LucideIcon
  /** Masqué de la palette « + » (toujours enregistré/exécutable pour les workflows
   *  existants). Ex : anciens nodes de scraping remplacés par le node unifié. */
  hidden?: boolean
  inputs: Port[]
  outputs: Port[]
  configSchema: ConfigField[]
  defaultConfig: C
  runtime: NodeRuntime
  /**
   * Connecteurs / services externes utilisés par le node (ids du registre
   * `registry/connectors.ts`), affichés en pastilles sous le titre de la carte.
   * Optionnel : si absent, un mapping par type prend le relais
   * (cf. `connectorsForSpec` / `CONNECTORS_BY_TYPE` dans `registry/connectors.ts`).
   */
  connectors?: string[]
  /**
   * Résumé court dérivé de la config courante, affiché sous le titre de la carte
   * (ex. planning d'un node cron). Recalculé à chaque édition de la config.
   * Retourner une chaîne vide pour ne rien afficher.
   */
  cardSummary?: (config: C) => string
  /**
   * Colonnes (clés) de la sheet produite par ce node, déclarées statiquement —
   * alimentent l'autocomplétion en aval AVANT tout run. Les colonnes dynamiques
   * (dépendant des données) apparaissent en plus après une exécution.
   */
  outputColumns?: string[]
  run: (ctx: RunContextApi, config: C, inputs: I) => Promise<O>
  ConfigComponent?: ComponentType<{
    config: C
    onChange: (next: C) => void
    /**
     * Colonnes/champs disponibles via les nodes upstream (typiquement les
     * en-têtes d'un CSV importé). Permet aux UIs de proposer une auto-
     * complétion sur les variables {{...}}.
     */
    availableColumns?: string[]
  }>
}

export interface WorkflowNode {
  id: string
  type: string
  position: { x: number; y: number }
  config: unknown
}

export interface WorkflowEdge {
  id: string
  source: string
  sourceHandle: string
  target: string
  targetHandle: string
}

export interface Workflow {
  id: string
  schemaVersion: number
  name: string
  description: string
  ownerId: string
  createdAt: number
  updatedAt: number
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  /** Dossier de regroupement (null/absent = « Sans dossier »). */
  folderId?: string | null
}

/** Dossier de regroupement des workflows dans l'écran liste. */
export interface WorkflowFolder {
  id: string
  name: string
  createdAt: number
}

export type NodeStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped'

export interface NodeRunState {
  status: NodeStatus
  startedAt?: number
  endedAt?: number
  durationMs?: number
  logs: { ts: number; level: 'info' | 'warn' | 'error'; msg: string }[]
  error?: string
  outputs?: Record<string, unknown>
  /** Connecteurs réellement utilisés/tentés pendant ce run (ex. ['jina','brightdata']). */
  connectors?: string[]
  /** Compteur live (ex. nombre de produits scrapés au fil de l'eau), affiché sur l'edge sortant. */
  count?: number
}

export interface RunContextApi {
  signal: AbortSignal
  /** Id du workflow en cours — sert d'identité par défaut (ex. suivi de veille). Absent dans un body de loop. */
  workflowId?: string
  /** Nom du workflow en cours — libellé lisible par défaut (ex. nom du suivi affiché). */
  workflowName?: string
  log: (level: 'info' | 'warn' | 'error', msg: string) => void
  setProgress?: (pct: number) => void
  /** Signale le connecteur (ex. 'jina', 'brightdata', 'llm') en cours d'usage — affiché en live sur la carte. */
  reportConnector?: (connectorId: string) => void
  /** Remonte un compteur live (ex. nombre de produits scrapés) — affiché sur l'edge sortant. */
  reportCount?: (value: number) => void
  /**
   * Suspend ce node ET tout ce qui en dépend, sans erreur.
   *
   * Le run reste vert : rien n'a échoué, il n'y avait simplement pas lieu d'agir. C'est
   * ce qui manquait pour cadencer un envoi — un workflow qui tourne toutes les trente
   * minutes ne doit pas poster quarante-huit mails, mais son run n'est pas en faute pour
   * autant. La propagation aux nodes suivants est celle, existante, du statut `skipped`.
   */
  skip?: (reason: string) => void
  /**
   * Persiste une mise à jour PARTIELLE de la config du node (fusionnée + autosave).
   * Ex. : un export qui crée un fichier mémorise son ID pour mettre à jour LE MÊME
   * fichier aux runs suivants. Optionnel : absent en exécution headless (cron).
   */
  patchConfig?: (partial: Record<string, unknown>) => void
  /**
   * Config brut (sans interpolation des {{...}}) — utile pour les nodes qui
   * ont besoin de ré-interpoler eux-mêmes (ex : Send Gmail en mode "iterate"
   * pour envoyer un mail différent par row).
   */
  rawConfig?: unknown
}
