// Répartition des langues, colonne par colonne. PUR.
//
// Sert à décider AVANT de dépenser : « 41 000 descriptions en néerlandais, 900 en
// allemand, et le nom déjà français partout » ne se devine pas en faisant défiler une
// feuille de cent mille lignes.
import { detectLanguage } from './detectLang'

export interface ColumnLanguageStats {
  column: string
  /** Lignes où la colonne porte un texte exploitable (huit caractères au moins). */
  counted: number
  /** Lignes vides ou trop courtes pour qu'on tente quoi que ce soit. */
  empty: number
  /** Textes assez longs mais dont la langue n'est pas tranchée. */
  undecided: number
  /** Nombre de lignes par langue reconnue, la plus fréquente d'abord. */
  byLang: { lang: string; count: number }[]
  /** Ce qui n'est PAS français parmi les lignes tranchées — la cible d'une traduction. */
  foreign: number
}

/**
 * Compte les langues d'une ou plusieurs colonnes.
 *
 * ⚠ « Indéterminé » n'est PAS « français ». Le détecteur s'abstient volontiers, en
 * particulier sur les libellés courts, et ranger ses abstentions du côté du français
 * ferait croire un catalogue déjà traduit. Les deux colonnes restent donc séparées, et
 * c'est `foreign` — jamais `counted - français` — qui chiffre le travail.
 */
export function languageStats(
  rows: Record<string, unknown>[],
  columns: string[],
): ColumnLanguageStats[] {
  return columns.map((column) => {
    const byLang = new Map<string, number>()
    let empty = 0
    let undecided = 0
    let foreign = 0

    for (const row of rows) {
      const raw = row[column]
      const text = raw == null ? '' : String(raw).trim()
      // Le seuil du détecteur : en deçà il rend « indéterminé » quoi qu'il arrive, et le
      // compter comme une abstention gonflerait cette colonne sans rien dire d'utile.
      if (text.length < 8) { empty++; continue }
      const { lang } = detectLanguage(text)
      if (!lang) { undecided++; continue }
      byLang.set(lang, (byLang.get(lang) ?? 0) + 1)
      if (lang !== 'fr') foreign++
    }

    return {
      column,
      counted: rows.length - empty,
      empty,
      undecided,
      byLang: [...byLang.entries()]
        .map(([lang, count]) => ({ lang, count }))
        .sort((a, b) => b.count - a.count || a.lang.localeCompare(b.lang)),
      foreign,
    }
  })
}
