// Config du node « Rapport veille tarifaire ».
//
// ⚠ Dans son propre module, et non dans celui du node : le panneau de config a besoin du
// type, le node a besoin du panneau — les deux s'importeraient l'un l'autre. C'est la
// cause récurrente des dépendances circulaires de ce projet.
export interface PwReportConfig {
  /**
   * Concurrents retenus : « matched » (défaut) ne parle que de ceux dont les prix se
   * comparent ; « all » ajoute ceux qu'on collecte sans réussir à les relier au catalogue.
   * Rapport de POSITIONNEMENT contre rapport de COUVERTURE — deux usages distincts.
   */
  scope?: 'matched' | 'all'
  title: string
  /** Consigne libre : décrit ce que le mail doit contenir. Vide = rapport standard. */
  prompt: string
  /** Identifiant du suivi. Vide = celui du workflow, comme les autres nodes de veille. */
  watchId: string
  competitorThresholdPct: number
  familyThresholdPct: number
  examples: number
  fileName: string
}
