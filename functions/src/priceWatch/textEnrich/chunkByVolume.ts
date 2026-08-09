// functions/src/priceWatch/textEnrich/chunkByVolume.ts
// ⚠ COPIE de src/features/priceWatch/textEnrich/chunkByVolume.ts (bundles séparés : `functions/`
// est hermétique, `rootDir: "src"`). Toute modification là-bas doit être reportée ici —
// cf. textReviseParity.test.ts.
// Découpe un lot par VOLUME DE TEXTE, pas par nombre de fiches. PUR.
//
// ⚠ Vingt fiches par appel est un compte, pas une mesure. Sur un catalogue de pièces,
// une fiche pèse trente caractères (« ATTACHE / TÔLE ZINGUE ») ou trois cents (la liste
// des modèles compatibles d'un bobineau) : le même lot de vingt passe confortablement ou
// dépasse le budget de réponse du modèle. Quand il le dépasse, la sortie est tronquée, le
// JSON devient invalide, et l'écran reste à « 0 / 10 » sans un mot.
//
// On compte donc les caractères ENVOYÉS, et on borne aussi le nombre de fiches : un lot
// d'une seule fiche énorme reste un lot valide, mais deux cents fiches minuscules dans un
// même appel rendent la progression illisible et une erreur coûteuse.

/** Budget de texte par appel, en caractères d'ENTRÉE. La réponse fait grossièrement la
 *  même taille (on réécrit ce qu'on reçoit), et le plafond de sortie est fixé bien
 *  au-dessus — la marge absorbe les notes du modèle. */
const CHUNK_CHARS = 4000
/** Bornes de confort, indépendantes du volume. */
const CHUNK_MIN_ITEMS = 1
const CHUNK_MAX_ITEMS = 10

/**
 * Regroupe `items` en lots dont le poids cumulé reste sous `maxChars`.
 *
 * Une fiche plus lourde à elle seule que le budget part dans son propre lot : la
 * refuser reviendrait à ne jamais traiter les fiches les plus riches, qui sont
 * précisément celles qui gagnent le plus à être réécrites.
 */
export function chunkByVolume<T>(
  items: T[],
  weigh: (item: T) => number,
  maxChars = CHUNK_CHARS,
  maxItems = CHUNK_MAX_ITEMS,
): T[][] {
  const out: T[][] = []
  let current: T[] = []
  let weight = 0

  for (const item of items) {
    const w = Math.max(0, weigh(item))
    const full = current.length >= Math.max(CHUNK_MIN_ITEMS, maxItems)
    const tooHeavy = current.length > 0 && weight + w > maxChars
    if (full || tooHeavy) {
      out.push(current)
      current = []
      weight = 0
    }
    current.push(item)
    weight += w
  }
  if (current.length > 0) out.push(current)
  return out
}
