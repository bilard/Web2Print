// Lecture d'une valeur de cellule comme NOMBRE, pour tout le projet.
//
// ⚠⚠ Rend `null` quand la valeur n'est pas un nombre — jamais 0. Un appelant qui veut un
// repli l'écrit lui-même (`?? 0`) ; celui qui calcule une moyenne doit au contraire pouvoir
// ÉCARTER la valeur, sinon « 100 / vide / 300 » rendrait 133 au lieu de 200.

/**
 * « 12,5 », « 1 299,90 € », « -3.5 » → nombre. `null` si rien de numérique ne s'y lit.
 *
 * ⚠ Un seul remplacement de virgule (`replace(',', '.')`) : c'est la règle historique du node
 * Graphique, reprise telle quelle pour que son rendu ne change pas d'un pixel. Conséquence
 * assumée : un séparateur de milliers anglais (« 1,299.90 ») n'est pas lu.
 */
export function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '').trim()
  if (!s) return null
  const cleaned = s.replace(/\s/g, '').replace(',', '.').replace(/[^\d.+-]/g, '')
  // ⚠⚠ Sans chiffre, pas de nombre. Le nettoyage vide « Makita » et `Number('')` vaut 0 :
  // une colonne de texte se serait donc sommée comme une colonne de zéros, en silence. Les
  // appelants qui replient sur 0 (le node Graphique) retrouvent exactement leur ancien
  // résultat ; ceux qui écartent la valeur (le BI) cessent de compter du texte pour zéro.
  if (!/\d/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}
