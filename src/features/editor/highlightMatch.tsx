import { normalizeForSearch } from './useLayerFilter'

/**
 * Retourne un tableau de nœuds avec les occurrences de `query` (insensible aux accents/casse)
 * entourées d'un <mark>. Si query est vide ou absent, retourne simplement le texte.
 */
export function highlightMatch(text: string, query: string): (string | React.ReactElement)[] {
  const q = normalizeForSearch(query.trim())
  if (!q) return [text]

  const normalized = normalizeForSearch(text)
  const parts: (string | React.ReactElement)[] = []
  let lastIdx = 0
  let searchFrom = 0
  let key = 0

  while (true) {
    const matchIdx = normalized.indexOf(q, searchFrom)
    if (matchIdx === -1) break
    if (matchIdx > lastIdx) {
      parts.push(text.slice(lastIdx, matchIdx))
    }
    parts.push(
      <mark key={key++} className="bg-indigo-500/20 text-inherit rounded-sm px-0.5">
        {text.slice(matchIdx, matchIdx + q.length)}
      </mark>
    )
    lastIdx = matchIdx + q.length
    searchFrom = lastIdx
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx))
  return parts.length > 0 ? parts : [text]
}
