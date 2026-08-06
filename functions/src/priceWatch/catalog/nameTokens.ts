// EXTRAIT de src/features/priceWatch/catalog/nameMatch.ts — `nameTokens` seul.
// Le reste de ce module (appariement par NOM, voie « À confirmer ») n'a pas de chemin
// serveur : le copier ici en ferait du code mort. Seule la tokenisation est reprise,
// parce que le veto de famille (`partFamily`) s'en sert des DEUX côtés et doit découper
// les libellés exactement de la même façon.

// Mots vides FR + termes trop communs sur un catalogue de pièces (ne discriminent rien).
const STOP = new Set([
  'pour', 'de', 'la', 'le', 'les', 'un', 'une', 'et', 'au', 'aux', 'du', 'des', 'en', 'avec',
  'sur', 'ou', 'par', 'sans', 'type', 'ref', 'reference', 'origine', 'remplace', 'piece',
  'pieces', 'modele', 'the', 'and', 'for',
])

/**
 * Tokens significatifs d'un nom : minuscules sans accents, ponctuation retirée, mots vides
 * et tokens < 3 caractères écartés, dédupliqués. La partie « Origine: … » (réf constructeur)
 * est coupée — elle relève de l'appariement EXACT, pas d'ici.
 */
export function nameTokens(name: string | null | undefined): string[] {
  const cut = String(name ?? '').split(/origine\s*:/i)[0]
  const words = cut.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
  const out: string[] = []
  const seen = new Set<string>()
  for (const w of words) {
    if (w.length < 3 || STOP.has(w) || seen.has(w)) continue
    seen.add(w); out.push(w)
  }
  return out
}
