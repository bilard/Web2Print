// Sortie brute d'un BOT (node « BrowserAct ») → lignes exploitables. PUR + server-safe.
//
// Le format n'est pas garanti : un bot rend du JSON, du CSV, du XML ou du Markdown selon
// son nœud « Output Data », et sa STRUCTURE est inconnue (il est construit site par site,
// l'utilisateur nomme ses champs comme il veut). On ne normalise donc PAS les champs ici —
// le node rend les lignes telles quelles et l'utilisateur les mappe en aval.
//
// ⚠ La conversion en fiches concurrent (déduction des champs par nom de clé puis par
// forme de valeur) a existé pour un moteur de scraping BrowserAct, retiré depuis :
// exécuter un bot par page polluait la moisson. Voir l'historique git si le besoin
// revient — le node de workflow, lui, reste le bon canal.

/**
 * Sortie brute d'un bot → lignes. Le format n'est pas garanti (JSON, CSV, XML ou
 * Markdown selon le nœud « Output Data ») : on accepte un tableau JSON, un objet unique,
 * les enveloppes usuelles, et le JSONL. Le reste rend [] plutôt qu'un demi-résultat.
 */
export function parseBotRows(output: string | undefined): Record<string, unknown>[] {
  const raw = output?.trim()
  if (!raw) return []
  const asRows = (v: unknown): Record<string, unknown>[] => {
    if (Array.isArray(v)) return v.flatMap(asRows)
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      for (const k of ['data', 'items', 'results', 'rows', 'products', 'output']) {
        if (Array.isArray(o[k])) return asRows(o[k])
      }
      return [o]
    }
    return []
  }
  try { return asRows(JSON.parse(raw)) } catch { /* JSONL ci-dessous */ }
  const rows: Record<string, unknown>[] = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('{')) continue
    try { rows.push(...asRows(JSON.parse(t))) } catch { /* ligne illisible : ignorée */ }
  }
  return rows
}
