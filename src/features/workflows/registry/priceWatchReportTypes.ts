// Config du node « Rapport veille tarifaire ».
//
// ⚠ Dans son propre module, et non dans celui du node : le panneau de config a besoin du
// type, le node a besoin du panneau — les deux s'importeraient l'un l'autre. C'est la
// cause récurrente des dépendances circulaires de ce projet.
export interface PwReportConfig {
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
