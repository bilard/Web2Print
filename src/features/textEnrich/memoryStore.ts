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

/**
 * Une tranche, telle qu'elle est ÉCRITE : la mémoire sérialisée dans UN champ.
 *
 * ⚠⚠ Écrite à plat (une entrée par référence), Firestore indexe CHAQUE clé et chaque
 * sous-champ : à quinze mille références par tranche, on dépasse la limite dure de 40 000
 * entrées d'index par document et l'écriture est refusée —
 * « INVALID_ARGUMENT: too many index entries for entity ». En production, la mémoire du
 * passage était alors PERDUE, et la nuit suivante retraitait — et refacturait — tout ce
 * qui venait d'être fait.
 *
 * Un champ unique, c'est une seule entrée d'index quel que soit le nombre de références.
 * Il est en plus exempté d'indexation (`firestore.indexes.json`), une chaîne de 900 ko
 * n'ayant rien à faire dans un index.
 */
interface MemoryChunkDoc { data?: string }

/** Relit une tranche, quel que soit son format. ⚠ Les tranches écrites AVANT ce
 *  changement sont à plat : les lire encore évite de repartir de zéro — donc de
 *  retraiter cent mille fiches déjà payées. */
function readChunk(raw: unknown): EnrichMemory {
  const d = (raw ?? {}) as MemoryChunkDoc
  if (typeof d.data !== 'string') return raw as EnrichMemory
  try {
    return JSON.parse(d.data) as EnrichMemory
  } catch {
    // Tranche illisible : mieux vaut retraiter sa part que faire tomber tout le passage.
    return {}
  }
}

/**
 * Budget d'octets par tranche. Jamais un cap par NOMBRE d'entrées : au compte, un lot
 * dépasse la limite dure de 1 Mo par document et l'écriture est REFUSÉE.
 *
 * ⚠ 700 ko et non 900 : la tranche est écrite SÉRIALISÉE, et l'échappement des guillemets
 * gonfle la chaîne d'environ 15 % par rapport à la taille mesurée ici. À 900 ko, une
 * tranche bien remplie frôlait le mégaoctet — la marge coûte une tranche de plus, l'échec
 * coûte la mémoire du passage.
 */
const CHUNK_BYTES = 700_000

const memoryCol = (uid: string, workflowId: string) =>
  `users/${uid}/workflowMemory/${workflowId}/textEnrich`

/** Mémoire du dernier passage. Vide = aucun passage, tout est à faire. */
export async function loadEnrichMemory(uid: string, workflowId: string): Promise<EnrichMemory> {
  const snap = await getDocs(collection(db, memoryCol(uid, workflowId)))
  const out: EnrichMemory = {}
  for (const d of snap.docs) {
    if (d.id === '_meta') continue
    Object.assign(out, readChunk(d.data()))
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
      batch.set(doc(db, col, `c${j}`), { data: JSON.stringify(chunks[j]) } satisfies MemoryChunkDoc)
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
