// La config de la carte, et sa traduction en plans de champs. PUR.
//
// La config est ce que l'utilisateur règle et ce qui est SÉRIALISÉ dans le workflow ; le
// plan est ce que le moteur consomme. Les séparer évite de figer la forme stockée sur les
// besoins du moteur — un plan gagnera des options que d'anciens workflows n'auront pas.
import type { EnrichKind } from './revision'
import { DEFAULT_MIN_LENGTH, type FieldPlan } from './fieldPlan'
import { defaultNameTemplate } from './template'

/** Un champ à traiter, tel qu'il est réglé dans la carte. */
export interface PlanConfig {
  enabled: boolean
  /** Colonne visée dans les fiches produit. */
  key: string
  kind: EnrichKind
  minLength: number
  prompt: string
  /** ⚠ Change le marqueur d'idempotence : l'incrémenter rend les champs déjà traités à
   *  nouveau éligibles, et c'est la SEULE façon de rejouer un champ avec une consigne
   *  révisée. Sans elle, un second passage ne toucherait plus rien et paraîtrait cassé. */
  promptVersion: string
  /** Assembler le nom selon le gabarit « libellé - marque - référence - discriminant ». */
  useTemplate?: boolean
  includeEmpty?: boolean
}

export interface TextEnrichConfig {
  /** Projet PIM dont les fiches sont enrichies. */
  projectId: string
  plans: PlanConfig[]
  /** Colonnes portant les éléments intouchables, pour la vérification d'après-coup. */
  brandField: string
  refField: string
  /** Seconde colonne de référence — la CONSTRUCTEUR, typiquement.
   *
   *  ⚠ Elle existe parce que « Comparer catalogue » en gère deux (`refColumn` et
   *  `ref2Column`), et que l'appariement s'appuie sur les deux. N'en protéger qu'une
   *  laisserait un titre réécrit perdre la référence constructeur sans que rien ne
   *  refuse la proposition — et cette référence-là vit souvent en FIN de libellé,
   *  là où une réécriture coupe. */
  ref2Field: string
  eanField: string
  /** Demander au modèle ce qu'il a changé — c'est ce que lit l'écran de comparaison. */
  withNote: boolean
  /** Plafond de dépense du passage, en dollars. 0 = pas de plafond. */
  capUsd: number
  /** Borne dure sur le nombre de champs traités en un passage. */
  maxUnits: number
  /** Chiffrer le travail sans rien écrire ni appeler de modèle. */
  dryRun: boolean
}

/**
 * Lecture TOLÉRANTE d'un réglage texte.
 *
 * ⚠ La config d'un node est PERSISTÉE dans le workflow : une carte posée hier ne connaît
 * aucun champ ajouté depuis. Lire `config.ref2Field.trim()` sur une carte antérieure à ce
 * champ plante le run — après le chiffrage, donc après avoir fait espérer. Tout réglage
 * texte se lit donc à travers cette fonction, sans exception, et un nouveau champ ne
 * casse jamais les workflows déjà enregistrés.
 */
function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * Le réglage de départ.
 *
 * Les deux entrées « étoffer » sont présentes mais DÉSACTIVÉES : elles montrent le chemin
 * — traduire d'abord, étoffer ensuite — sans rendre la config invalide, puisqu'un même
 * champ ne peut porter deux plans dans un seul passage. Une fois la traduction faite, on
 * décoche les deux premières et on coche les deux autres.
 */
export const DEFAULT_TEXT_ENRICH_CONFIG: TextEnrichConfig = {
  projectId: '',
  plans: [
    {
      enabled: true, key: 'nom', kind: 'translate', minLength: DEFAULT_MIN_LENGTH.name,
      prompt: '', promptVersion: 'v1',
    },
    {
      enabled: true, key: 'description', kind: 'translate', minLength: DEFAULT_MIN_LENGTH.description,
      prompt: '', promptVersion: 'v1',
    },
    {
      enabled: false, key: 'nom', kind: 'improve', minLength: DEFAULT_MIN_LENGTH.name,
      prompt: '', promptVersion: 'v1',
    },
    {
      enabled: false, key: 'description', kind: 'improve', minLength: DEFAULT_MIN_LENGTH.description,
      prompt: '', promptVersion: 'v1',
    },
  ],
  brandField: 'marque',
  refField: 'reference',
  ref2Field: '',
  eanField: 'ean',
  withNote: true,
  capUsd: 5,
  // ⚠ Volontairement BAS. Un catalogue en compte des centaines de milliers, et le premier
  // passage est celui où la consigne est encore approximative : mieux vaut le découvrir
  // sur cinq cents fiches que sur cent mille. C'est un garde-fou, pas un objectif.
  maxUnits: 500,
  dryRun: false,
}

/** Traduit la config en plans consommables. Les entrées désactivées disparaissent. */
export function configToPlans(config: TextEnrichConfig): FieldPlan[] {
  // Même prudence sur le tableau : une config abîmée ou tronquée ne doit pas faire
  // tomber le run sur `.filter of undefined`.
  return (Array.isArray(config.plans) ? config.plans : [])
    .filter((p) => p.enabled && str(p.key).trim() !== '')
    .map((p) => ({
      key: str(p.key).trim(),
      kind: p.kind,
      minLength: p.minLength,
      prompt: str(p.prompt),
      promptVersion: str(p.promptVersion) || 'v1',
      ...(p.useTemplate
        ? {
            template: defaultNameTemplate({
              brand: config.brandField,
              supplierRef: config.refField,
              ean: config.eanField,
            }),
          }
        : {}),
      ...(p.includeEmpty ? { includeEmpty: true } : {}),
    }))
}

/** Ce qui empêche le passage de partir. Vérifié AVANT le premier appel : découvrir une
 *  consigne vide après trois cents fiches coûte de l'argent et une révision à annuler. */
type ProblemCode = 'no-project' | 'no-plan' | 'no-prompt' | 'duplicate-key'

/** Le problème, et LA COLONNE en cause quand il y en a une. Sans elle, « une consigne est
 *  vide » envoie chercher parmi quatre lignes repliées — et le message est le seul retour
 *  qu'on ait, puisque le node échoue avant d'écrire la moindre ligne de journal. */
export interface ConfigProblem { code: ProblemCode; key?: string }

export function configProblem(
  config: TextEnrichConfig,
  /** Une feuille est branchée en entrée : elle fournit les fiches, le projet devient
   *  inutile. Sans ce drapeau, la carte exigerait un projet PIM à qui n'en a pas. */
  hasSheet = false,
): ConfigProblem | null {
  if (!hasSheet && str(config.projectId).trim() === '') return { code: 'no-project' }
  const plans = configToPlans(config)
  if (plans.length === 0) return { code: 'no-plan' }
  // La consigne EST la demande de l'utilisateur : sans elle, le modèle n'aurait que la
  // ligne générique de la nature du travail, et produirait du texte de catalogue générique
  // — exactement ce qu'il ne faut pas écrire dans des fiches.
  // ⚠ La consigne n'est exigée que là où elle décide de QUELQUE CHOSE. « Traduire en FR »
  // se suffit : la nature du travail dit déjà tout, et réclamer en plus une phrase qui
  // répète « traduis en français » n'est qu'une friction. Pour « étoffer » et
  // « structurer », en revanche, rien ne dirait au modèle quel texte produire — il
  // inventerait un style, et l'écrirait dans les fiches.
  const promptless = plans.find((p) => p.kind !== 'translate' && str(p.prompt).trim() === '')
  if (promptless) return { code: 'no-prompt', key: promptless.key }
  // ⚠ DEUX PLANS SUR LA MÊME COLONNE, C'EST UNE COLLISION, pas un enchaînement.
  // Les unités d'un lot sont identifiées par `produit::champ` — le plan n'entre pas dans
  // la clé. Deux plans sur `nom` produisent donc deux unités indiscernables : le prompt
  // porte deux fois le même identifiant, la réponse du modèle en écrase une, et les deux
  // écritures visent la même cellule dans le même lot Firestore. On paie deux fois pour
  // un seul résultat, tiré du texte d'origine dans les deux cas — le second plan ne voit
  // JAMAIS le travail du premier, puisque les unités sont toutes calculées d'avance.
  //
  // Traduire PUIS étoffer un même champ se fait donc en deux passages, ce que le marqueur
  // d'idempotence rend naturel : après la traduction le champ porte `translate:fr:v1`, un
  // plan `improve` le retrouve éligible. C'est cette règle qui remplace l'ancienne
  // vérification d'ordre, laquelle croyait l'enchaînement possible en un passage.
  const seen = new Set<string>()
  for (const p of plans) {
    if (seen.has(p.key)) return { code: 'duplicate-key', key: p.key }
    seen.add(p.key)
  }
  return null
}

/** Éléments à ne jamais perdre, lus sur la fiche. */
export function protectedFieldsOf(
  config: TextEnrichConfig,
  row: Record<string, unknown>,
): { refs: string[]; eans: string[]; brands: string[] } {
  const read = (key: string): string[] => {
    const v = row[key]
    return v == null || v === '' ? [] : [String(v)]
  }
  return {
    refs: [...read(str(config.refField)), ...read(str(config.ref2Field))],
    eans: read(str(config.eanField)),
    brands: read(str(config.brandField)),
  }
}

/**
 * Colonnes protégées introuvables dans les fiches chargées.
 *
 * ⚠ Le défaut (`marque`, `reference`, `ean`) n'est qu'une SUPPOSITION. Si le projet nomme
 * ses colonnes « Référence » ou « EAN13 », `protectedFieldsOf` rend des listes vides, et
 * la vérification perd d'un coup ses trois contrôles les plus utiles : référence altérée,
 * code-barres perdu, marque inventée. Il ne reste que les valeurs chiffrées. Rien ne
 * signalerait la perte — le passage se déroulerait normalement, en écrivant des textes
 * que plus personne ne relit. D'où cet avertissement, émis avant le premier appel.
 */
export function missingProtectedColumns(
  config: TextEnrichConfig,
  rows: Record<string, unknown>[],
): string[] {
  const present = new Set<string>()
  for (const row of rows) for (const k of Object.keys(row)) present.add(k)
  return [config.brandField, config.refField, config.ref2Field, config.eanField]
    .map(str)
    .filter((k) => k.trim() !== '' && !present.has(k))
}
