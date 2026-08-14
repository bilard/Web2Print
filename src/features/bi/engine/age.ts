// Âge d'une donnée, dit brièvement. PUR — aucune horloge implicite : `now` est FOURNI.
//
// ⚠⚠ Extrait de `TileFrame` pour être partagé avec la barre d'état de l'écran. Le dupliquer
// aurait laissé deux échelles diverger : une tuile disant « 2 min » pendant que le pied dit
// « 120 s » ferait douter des deux.
//
// ⚠ Aucun `t()` ici : le module est pur, et l'unité (« s », « min », « h ») est la même dans
// les trois langues du catalogue. Le composant, lui, compose la phrase qui l'entoure.

/** `null` = rien n'est encore arrivé. Le tiret cadratin le dit sans prétendre à une durée. */
export function ageLabel(updatedAt: number | null, now: number): string {
  if (updatedAt == null) return '—'
  const s = Math.max(0, Math.round((now - updatedAt) / 1000))
  if (s < 60) return `${s} s`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`
}
