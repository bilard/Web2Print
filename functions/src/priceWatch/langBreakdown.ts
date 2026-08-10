// functions/src/priceWatch/langBreakdown.ts
// ⚠ COPIE de src/features/priceWatch/textEnrich/langBreakdown.ts (bundles séparés :
// `functions/` est hermétique, `rootDir: "src"`). Toute modification là-bas doit être
// reportée ici — cf. textsSnapshotParity.test.ts.
// Répartition des langues du catalogue affiché, PURE.
//
// « Seulement les textes non français » répond par oui ou non ; ça ne dit pas s'il reste
// quarante fiches en néerlandais ou douze mille en allemand — donc ni par quoi commencer,
// ni ce que va coûter la traduction. La ventilation, elle, se lit d'un coup d'œil.
export interface LangTally {
  /** Code langue, ou `null` quand le détecteur s'est abstenu. */
  lang: string | null
  count: number
}

/**
 * Compte les fiches par langue, dans l'ordre où on veut les traiter : les langues
 * ÉTRANGÈRES d'abord (la plus fournie en tête — c'est le lot qui rapporte le plus),
 * puis le français, puis l'indéterminé.
 *
 * ⚠ L'indéterminé est rangé à part et JAMAIS fondu dans le français : le détecteur
 * s'abstient volontiers sur les libellés courts, et le compter comme français ferait
 * croire un catalogue déjà traduit.
 */
export function langBreakdown(langs: (string | null)[]): LangTally[] {
  const counts = new Map<string | null, number>()
  for (const lang of langs) counts.set(lang, (counts.get(lang) ?? 0) + 1)

  const rank = (lang: string | null) => (lang == null ? 2 : lang === 'fr' ? 1 : 0)
  return [...counts.entries()]
    .map(([lang, count]) => ({ lang, count }))
    .sort((a, b) =>
      rank(a.lang) - rank(b.lang) ||
      b.count - a.count ||
      String(a.lang).localeCompare(String(b.lang)))
}
