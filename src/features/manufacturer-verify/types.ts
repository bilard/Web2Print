/** Types du module « Vérification Fabricant ». */

/** Statut de comparaison d'un champ Source ⇄ Fabricant. */
export type CompareStatus = 'match' | 'diff' | 'mfr-only' | 'source-only'

/** Un champ comparé entre la source (revendeur) et le fabricant. */
export interface FieldComparison {
  /** Clé stable (ex: 'spec:puissance', 'id:brand', 'price:ttc'). */
  key: string
  /** Libellé d'affichage FR. */
  label: string
  /** Famille : identité produit, prix, ou spec technique. */
  group: 'identity' | 'price' | 'spec'
  /** Valeur côté source (revendeur), null si absente. */
  sourceValue: string | null
  /** Valeur côté fabricant, null si absente. */
  mfrValue: string | null
  status: CompareStatus
}

/** Paires de specs rapprochées par le LLM (clés = libellés normalisés). */
export type LlmSpecPairs = Record<string, string>

/** Candidat de page produit fabricant proposé avant confirmation. */
export interface ManufacturerCandidate {
  /** URL de la page produit officielle. */
  url: string
  /** Titre de la page (résultat de recherche). */
  title: string
  /** Marque détectée (label affichable, ex: « Bosch Pro »). */
  brand: string
  /** Domaine officiel du fabricant. */
  domain: string
  /** Référence fabricant/MPN qui a servi au matching (échoée en clair). */
  matchedRef: string | null
  /** Confiance du rapprochement. */
  confidence: 'high' | 'medium' | 'low'
}

/** Synthèse chiffrée pour la vue verdict. */
export interface VerdictSummary {
  confirmed: number   // champs identiques source = fabricant
  completed: number   // champs présents seulement chez le fabricant
  divergent: number   // champs différents
  total: number
}
