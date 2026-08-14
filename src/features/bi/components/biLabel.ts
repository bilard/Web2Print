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
export function biLabel(x: { labelKey: TranslationKey; label?: string }, t: Translate): string {
  if (x.label && x.labelKey.startsWith(AGG_PREFIX)) {
    return t('bi.measure.derived', { agg: t(x.labelKey), column: x.label })
  }
  // Une dimension de feuille porte son nom dans la donnée : il prime sur le catalogue.
  return x.label ?? t(x.labelKey)
}
