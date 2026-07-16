/** Types du module « Vérification Fabricant ». */

/** Statut de comparaison d'un champ Source ⇄ Fabricant. */
export type CompareStatus = 'match' | 'diff' | 'mfr-only' | 'source-only'

/** Un champ comparé entre la source (revendeur) et le fabricant. */
export interface FieldComparison {
  /** Clé stable (ex: 'spec:puissance', 'id:brand', 'price:ttc'). */
  key: string
  /** Libellé d'affichage FR. */
  label: string
  /** Famille : identité produit, prix (informatif), spec technique, ou contenu
   *  marketing (description/avantages — informatif, non scoré). */
  group: 'identity' | 'price' | 'spec' | 'content'
  /** Valeur côté source (revendeur), null si absente. */
  sourceValue: string | null
  /** Valeur côté fabricant, null si absente. */
  mfrValue: string | null
  status: CompareStatus
  /** Vrai si la valeur fabricant a été ADOPTÉE dans le master de la source
   *  (provenance fabricant conservée en permanence). */
  adopted?: boolean
  /** Vrai si cette ligne est une 2e occurrence d'une même clé canonique (ex:
   *  plusieurs specs « Couple ») : gardée pour ne rien perdre, mais NON adoptable
   *  (l'adoption par clé canonique serait ambiguë). */
  dupCanon?: boolean
}

/** Paires de specs rapprochées par le LLM (clés = libellés normalisés). */
export type LlmSpecPairs = Record<string, string>

/** Nature d'une ligne du journal d'activité (pilote icône + couleur). */
export type VerifyLogKind =
  | 'search'    // analyse source / requête de recherche
  | 'candidate' // domaine ou page fabricant identifiée
  | 'scrape'    // extraction de la page fabricant
  | 'metric'    // chiffres (specs, EAN, nb résultats)
  | 'align'     // alignement des libellés de specs
  | 'compare'   // synthèse de comparaison (✓ / + / ≠)
  | 'ok'        // succès (certifié, terminé)
  | 'warn'      // avertissement (bloqué, EAN différents, abandon)
  | 'save'      // enregistrement dans la fiche
  | 'info'      // neutre

/** Une entrée structurée du journal « Vérifier chez le Fabricant ». */
export interface VerifyLogEntry {
  kind: VerifyLogKind
  text: string
  /** Sous-étape indentée (ex. résultats d'une recherche). */
  sub?: boolean
}

/** Canal d'émission de logs partagé par le pipeline de vérification. */
export type VerifyLogFn = (text: string, kind?: VerifyLogKind, sub?: boolean) => void

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
