// Le magasin de la mémoire d'enrichissement sur feuille. Adaptateur Firestore FIN.
//
// ⚠ CHUNKÉ PAR OCTETS, jamais par nombre d'entrées. Cent quinze mille références font
// plusieurs mégaoctets ; découpé par compte, un lot dépasse la limite dure de 1 Mo par
// document et l'écriture est REFUSÉE — un échec qui ne remonte qu'en avertissement de fin
// de run, après quoi la mémoire est amputée et tout repart au passage suivant. C'est
// exactement l'accident déjà vécu sur le catalogue source.
//
// ⚠ `_meta` écrit EN DERNIER : écrit en premier, il annoncerait des tranches qui peuvent
// ne jamais arriver, et la relecture rendrait une mémoire trouée présentée comme complète.
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { EnrichMemory } from './sheetMemory'

/** Budget d'octets par tranche. Même valeur que le catalogue source, même raison. */
const CHUNK_BYTES = 900_000

const memoryCol = (uid: string, workflowId: string) =>
  `users/${uid}/workflowMemory/${workflowId}/textEnrich`

/** Mémoire du dernier passage. Vide = aucun passage, tout est à faire. */
export async function loadEnrichMemory(uid: string, workflowId: string): Promise<EnrichMemory> {
  const snap = await getDocs(collection(db, memoryCol(uid, workflowId)))
  const out: EnrichMemory = {}
  for (const d of snap.docs) {
    if (d.id === '_meta') continue
    Object.assign(out, d.data() as EnrichMemory)
  }
  return out
}

/** Découpe par POIDS, en gardant chaque référence entière dans sa tranche. */
function chunkByBytes(memory: EnrichMemory): EnrichMemory[] {
  const chunks: EnrichMemory[] = []
  let current: EnrichMemory = {}
  let bytes = 0
  for (const [key, entry] of Object.entries(memory)) {
    const size = key.length + JSON.stringify(entry).length + 4
    if (bytes + size > CHUNK_BYTES && bytes > 0) {
      chunks.push(current)
      current = {}
      bytes = 0
    }
    current[key] = entry
    bytes += size
  }
  if (bytes > 0) chunks.push(current)
  return chunks
}

/**
 * Réécrit la mémoire en entier.
 *
 * ⚠ Les tranches EXCÉDENTAIRES d'une écriture précédente sont supprimées : une mémoire qui
 * rétrécit (catalogue épuré, colonnes changées) laisserait sinon des références fantômes
 * que plus rien ne met à jour — et qui feraient sauter des fiches bien réelles.
 */
export async function saveEnrichMemory(
  uid: string, workflowId: string, memory: EnrichMemory,
): Promise<void> {
  const col = memoryCol(uid, workflowId)
  const chunks = chunkByBytes(memory)
  const existing = await getDocs(collection(db, col))

  for (let i = 0; i < chunks.length; i += 400) {
    const batch = writeBatch(db)
    for (let j = i; j < Math.min(i + 400, chunks.length); j++) {
      batch.set(doc(db, col, `c${j}`), chunks[j])
    }
    await batch.commit()
  }

  const stale = existing.docs.filter((d) => {
    if (d.id === '_meta') return false
    const n = Number(d.id.replace(/^c/, ''))
    return Number.isFinite(n) && n >= chunks.length
  })
  for (let i = 0; i < stale.length; i += 400) {
    const batch = writeBatch(db)
    for (const d of stale.slice(i, i + 400)) batch.delete(d.ref)
    await batch.commit()
  }

  const batch = writeBatch(db)
  batch.set(doc(db, col, '_meta'), { chunks: chunks.length, keys: Object.keys(memory).length, at: Date.now() })
  await batch.commit()
}
