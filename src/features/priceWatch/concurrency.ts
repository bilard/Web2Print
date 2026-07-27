// Exécution en PARALLÈLE BORNÉ. PUR (dupliqué côté serveur).
//
// La moisson traitait ses concurrents dans un `for … await` : un seul fetch en vol pour
// tout le système, alors qu'un fetch de page liste dure des secondes (Jina/Firecrawl/
// Bright Data). 17 concurrents à la queue leu leu = un débit divisé par 17 sans aucune
// contrepartie — les sites sont indépendants et écrivent chacun leur propre document.
// La recherche dirigée le faisait déjà (Promise.all par site) ; la moisson non.
//
// Borné, et pas un `Promise.all` nu : lancer 17 fetchs simultanés déclencherait les
// limites de débit des fournisseurs et le circuit-breaker de crédits.

/** Plafond de sites moissonnés simultanément. Au-delà, les fournisseurs limitent (et
 *  Bright Data est facturé à la requête : mieux vaut un débit régulier qu'une rafale).
 *
 *  Relevé en prod (2026-07-27) : un tour complet sur ~16 concurrents durait 3 min pour
 *  une fenêtre de moisson de ~18 min (RUN_TIMEOUT 1700 s − RESERVE 600 s). Le débit était
 *  donc bridé par le parallélisme et le budget de pages, pas par le temps disponible.
 *  Porté à 8 : à 4 sites de front, les trois quarts de la fenêtre restaient inutilisés. */
export const HARVEST_CONCURRENCY = 8

/**
 * `items.map(fn)` avec au plus `limit` exécutions simultanées. L'ORDRE des résultats
 * suit celui des entrées (les tâches finissent dans le désordre — sans cette garantie,
 * les lignes du tableau de statut changeraient de place à chaque run).
 *
 * Une tâche qui rejette fait rejeter l'ensemble, comme `Promise.all` : l'appelant décide
 * s'il veut isoler les échecs (en ne rejetant jamais depuis `fn`).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  const width = Math.max(1, Math.min(Math.floor(limit), items.length))
  let next = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: width }, worker))
  return out
}
