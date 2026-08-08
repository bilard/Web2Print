// La config de la carte, et sa traduction en plans de champs. PUR.
//
// La config est ce que l'utilisateur règle et ce qui est SÉRIALISÉ dans le workflow ; le
// plan est ce que le moteur consomme. Les séparer évite de figer la forme stockée sur les
// besoins du moteur — un plan gagnera des options que d'anciens workflows n'auront pas.
import type { EnrichKind } from './revision'
import { DEFAULT_MIN_LENGTH, isPlanOrdered, type FieldPlan } from './fieldPlan'
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

export const DEFAULT_TEXT_ENRICH_CONFIG: TextEnrichConfig = {
  projectId: '',
  plans: [
    {
      enabled: true, key: 'nom', kind: 'translate', minLength: DEFAULT_MIN_LENGTH.name,
      prompt: '', promptVersion: 'v1',
    },
    {
      enabled: true, key: 'nom', kind: 'improve', minLength: DEFAULT_MIN_LENGTH.name,
      prompt: '', promptVersion: 'v1',
    },
    {
      enabled: true, key: 'description', kind: 'translate', minLength: DEFAULT_MIN_LENGTH.description,
      prompt: '', promptVersion: 'v1',
    },
    {
      enabled: true, key: 'description', kind: 'improve', minLength: DEFAULT_MIN_LENGTH.description,
      prompt: '', promptVersion: 'v1',
    },
  ],
  brandField: 'marque',
  refField: 'reference',
  eanField: 'ean',
  withNote: true,
  capUsd: 5,
  // ⚠ Volontairement BAS. Un catalogue en compte des centaines de milliers, et le premier
  // passage est celui où la consigne est encore approximative : mieux vaut le découvrir
  // sur cinq cents fiches que sur cent mille. C'est un garde-fou, pas un objectif.
  maxUnits: 500,
  dryRun: false,
}

/** Traduit la config en plans consommables. Les entrées désactivées disparaissent, et
 *  l'ordre de la liste est CONSERVÉ — c'est lui qui garantit traduire-avant-enrichir. */
export function configToPlans(config: TextEnrichConfig): FieldPlan[] {
  return config.plans
    .filter((p) => p.enabled && p.key.trim() !== '')
    .map((p) => ({
      key: p.key.trim(),
      kind: p.kind,
      minLength: p.minLength,
      prompt: p.prompt,
      promptVersion: p.promptVersion,
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
export function configProblem(config: TextEnrichConfig): 'no-project' | 'no-plan' | 'no-prompt' | 'unordered' | null {
  if (config.projectId.trim() === '') return 'no-project'
  const plans = configToPlans(config)
  if (plans.length === 0) return 'no-plan'
  // La consigne EST la demande de l'utilisateur : sans elle, le modèle n'aurait que la
  // ligne générique de la nature du travail, et produirait du texte de catalogue générique
  // — exactement ce qu'il ne faut pas écrire dans des fiches.
  if (plans.some((p) => p.prompt.trim() === '')) return 'no-prompt'
  // Enrichir avant de traduire revient à payer pour un texte qu'on va remplacer.
  if (!isPlanOrdered(plans)) return 'unordered'
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
  return { refs: read(config.refField), eans: read(config.eanField), brands: read(config.brandField) }
}
