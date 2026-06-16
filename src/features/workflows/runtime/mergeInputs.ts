// src/features/workflows/runtime/mergeInputs.ts
// Fusion fan-in : quand PLUSIEURS edges arrivent sur le même port d'entrée d'un node
// (ex : 2 nodes « Produits » câblés sur `concurrents` de compare-prices). Sans ça,
// l'executor écrasait (dernière valeur gagne) → une sheet vide pouvait effacer une
// sheet pleine. ⚠️ Logique DUPLIQUÉE À L'IDENTIQUE côté serveur
// (functions/src/workflow/mergeInputs.ts) : parité client/serveur obligatoire.
interface SheetLike { rows?: unknown[]; columns?: { key?: string }[]; [k: string]: unknown }

function isSheet(v: unknown): v is SheetLike {
  return !!v && typeof v === 'object' && !Array.isArray(v) && Array.isArray((v as SheetLike).rows)
}

/** Union de colonnes par `key` (garde l'ordre de `a`, ajoute les nouvelles de `b`). */
function mergeColumns(a?: { key?: string }[], b?: { key?: string }[]): { key?: string }[] | undefined {
  if (!a?.length) return b
  if (!b?.length) return a
  const seen = new Set(a.map((c) => c?.key))
  return [...a, ...b.filter((c) => !seen.has(c?.key))]
}

/** Combine deux valeurs reçues sur le même port. Sheets → concat rows + union colonnes ;
 *  arrays → concat ; tout le reste → `incoming` (dernière valeur, comportement historique). */
export function mergeInputValue(existing: unknown, incoming: unknown): unknown {
  if (isSheet(existing) && isSheet(incoming)) {
    return {
      ...existing,
      ...incoming,
      rows: [...(existing.rows ?? []), ...(incoming.rows ?? [])],
      columns: mergeColumns(existing.columns, incoming.columns),
    }
  }
  if (Array.isArray(existing) && Array.isArray(incoming)) return [...existing, ...incoming]
  return incoming
}
