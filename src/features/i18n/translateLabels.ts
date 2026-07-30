import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'
import { LOCALE_ENDONYM, type Locale } from '@/stores/locale.store'

/**
 * Traduction des libellés RÉÉCRITS par un compte.
 *
 * Ce n'est pas de la traduction générique : le compte vient justement de
 * remplacer le mot du catalogue par SON mot métier. Le prompt doit donc porter
 * cette intention — traduire « contenance » par l'équivalent que le même métier
 * emploierait dans l'autre langue, et non par le synonyme le plus courant.
 *
 * ⚠️ Les `{variables}` du gabarit sont des jetons d'interpolation : traduites ou
 * perdues, elles s'affichent telles quelles à l'écran (« Bonjour {name} » →
 * « Bonjour {nombre} » ne serait jamais remplacé). Le prompt l'interdit, et
 * `checkPlaceholders` le vérifie après coup — le modèle n'est pas cru sur parole.
 */

const TranslationsSchema = z.object({
  translations: z.array(z.object({ locale: z.string(), text: z.string() })),
})

const SCHEMA_FOR_LLM = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          locale: { type: 'string', description: 'Code de la langue : fr, en, es, de ou it' },
          text: { type: 'string', description: 'Le libellé traduit, sans guillemets ajoutés' },
        },
        required: ['locale', 'text'],
      },
    },
  },
  required: ['translations'],
}

/** Jetons `{param}` d'un gabarit — doivent survivre à la traduction à l'identique. */
function placeholders(s: string): string[] {
  return (s.match(/\{(\w+)\}/g) ?? []).sort()
}

export interface TranslateLabelInput {
  /** Texte source, tel que le compte vient de le réécrire. */
  text: string
  /** Langue dans laquelle `text` est écrit. */
  sourceLocale: Locale
  /** Langues à produire. */
  targets: Locale[]
  /**
   * Clé de traduction — donne le CONTEXTE d'écran au modèle (`pim.column.volume`
   * dit qu'on parle d'une colonne du PIM, pas d'un volume sonore). Un libellé
   * d'un ou deux mots est trop court pour se traduire sans ce repère.
   */
  key: string
  /** Vocabulaire du métier, saisi par le compte (« GSB bricolage », « GSA »…). */
  businessContext?: string
}

/** Traduction d'un libellé vers plusieurs langues, en un appel. */
export async function translateLabel(
  input: TranslateLabelInput,
): Promise<Partial<Record<Locale, string>>> {
  const { text, sourceLocale, targets, key, businessContext } = input
  if (targets.length === 0) return {}

  const targetList = targets.map((l) => `- ${l} (${LOCALE_ENDONYM[l]})`).join('\n')
  const vars = placeholders(text)

  const prompt = [
    "Tu traduis des libellés d'INTERFACE d'un logiciel professionnel de production graphique.",
    '',
    `Libellé source (${LOCALE_ENDONYM[sourceLocale]}) : "${text}"`,
    `Identifiant technique de ce libellé : ${key}`,
    businessContext ? `Secteur et vocabulaire du client : ${businessContext}` : '',
    '',
    'Langues à produire :',
    targetList,
    '',
    'Règles impératives :',
    "1. Ce libellé a été choisi DÉLIBÉRÉMENT par le client pour coller à son métier.",
    "   Traduis le terme que ce métier emploierait réellement dans la langue cible,",
    '   pas le synonyme de dictionnaire le plus fréquent.',
    "2. Garde la longueur d'un libellé d'interface : pas de phrase explicative,",
    '   pas de ponctuation finale si la source n\'en a pas.',
    '3. Respecte la casse et le registre de la source (impératif, infinitif, nom).',
    vars.length > 0
      ? `4. Les jetons ${vars.join(', ')} sont des variables : recopie-les EXACTEMENT, sans les traduire ni les renommer. Ils peuvent changer de place dans la phrase.`
      : "4. N'ajoute aucune variable ni aucun {jeton} qui ne serait pas dans la source.",
    "5. Pour l'anglais, utilise l'orthographe BRITANNIQUE (colour, catalogue, licence, organise).",
    '',
    'Rends une entrée par langue demandée.',
  ]
    .filter(Boolean)
    .join('\n')

  const result = await generateJson({
    task: 'i18n.labelTranslation',
    prompt,
    schema: TranslationsSchema,
    schemaForLLM: SCHEMA_FOR_LLM,
    version: 'i18n.labelTranslation.v1',
  })

  const out: Partial<Record<Locale, string>> = {}
  const expected = placeholders(text)
  for (const { locale, text: translated } of result.translations) {
    if (!targets.includes(locale as Locale)) continue
    const value = translated.trim()
    if (value === '') continue
    // Variable perdue ou inventée : la traduction afficherait « {count} » brut à
    // l'écran, ou perdrait la valeur. On préfère ne rien poser — la clé restera
    // sur son repli français, ce qui est visible et corrigeable à la main.
    if (placeholders(value).join() !== expected.join()) {
      console.warn(`[translateLabels] ${locale} rejeté sur ${key} : variables divergentes`)
      continue
    }
    out[locale as Locale] = value
  }
  return out
}
