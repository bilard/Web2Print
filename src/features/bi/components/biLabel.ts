// Comment se NOMME une mesure ou une dimension à l'écran. Un seul endroit : trois libellés
// différents pour la même colonne sur le même écran suffisent à faire douter des chiffres.
import type { TranslationKey, TransParams } from '@/lib/i18n'

type Translate = (key: TranslationKey, params?: TransParams) => string

/** Préfixe des clés d'agrégation. Le porter en constante évite qu'un renommage de catalogue
 *  passe inaperçu ici (les libellés composés redeviendraient de simples noms de colonnes). */
const AGG_PREFIX = 'bi.agg.'

/**
 * Compose le libellé d'une colonne de résultat ou d'une mesure.
 *
 * ⚠⚠ Une mesure DÉRIVÉE porte les deux : `labelKey` l'agrégation (traduite), `label` le nom
 * RÉEL de la colonne (qui vient de la donnée, jamais du catalogue). Les afficher séparément
 * donnerait « Somme » sur trois tuiles différentes, ou « Prix » pour la somme comme pour la
 * moyenne : dans les deux cas, deux mesures distinctes portant le même nom.
 */
export function biLabel(
  x: { labelKey: TranslationKey; label?: string; columnKey?: TranslationKey },
  t: Translate,
): string {
  // Nom de la colonne agrégée, quelle que soit sa provenance : la DONNÉE (`label`, une
  // colonne de feuille) ou le CATALOGUE (`columnKey`, une colonne de source déclarée en
  // dur). Sans le second, les mesures dérivées de la veille s'affichaient toutes « Somme ».
  const column = x.label ?? (x.columnKey ? t(x.columnKey) : undefined)
  if (column && x.labelKey.startsWith(AGG_PREFIX)) {
    return t('bi.measure.derived', { agg: t(x.labelKey), column })
  }
  // Une dimension de feuille porte son nom dans la donnée : il prime sur le catalogue.
  return x.label ?? t(x.labelKey)
}
