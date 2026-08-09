// functions/src/textEnrich/memoryStore.ts
// Jumeau SERVEUR de src/features/textEnrich/memoryStore.ts.
//
// ⚠ MÊME collection que le navigateur : un run lancé à la main et un run planifié doivent
// partager la mémoire, sinon le cron refait chaque nuit ce que le jour vient de traiter —
// et le refacture. Non couvert par le test de parité (l'un parle au SDK client, l'autre à
// l'Admin SDK) : c'est le CHEMIN et la forme des tranches qui doivent rester identiques.
import { getFirestore } from 'firebase-admin/firestore'
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

export async function loadEnrichMemory(uid: string, workflowId: string): Promise<EnrichMemory> {
  const snap = await getFirestore().collection(memoryCol(uid, workflowId)).get()
  const out: EnrichMemory = {}
  for (const d of snap.docs) {
    if (d.id === '_meta') continue
    Object.assign(out, readChunk(d.data()))
  }
  return out
}

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

/** ⚠ Les tranches EXCÉDENTAIRES sont supprimées : une mémoire qui rétrécit laisserait
 *  sinon des références fantômes que plus rien ne met à jour — et qui feraient sauter des
 *  fiches bien réelles. */
export async function saveEnrichMemory(
  uid: string, workflowId: string, memory: EnrichMemory,
): Promise<void> {
  const db = getFirestore()
  const col = memoryCol(uid, workflowId)
  const chunks = chunkByBytes(memory)
  const existing = await db.collection(col).get()

  for (let i = 0; i < chunks.length; i += 400) {
    const batch = db.batch()
    for (let j = i; j < Math.min(i + 400, chunks.length); j++) {
      batch.set(db.doc(`${col}/c${j}`), { data: JSON.stringify(chunks[j]) } satisfies MemoryChunkDoc)
    }
    await batch.commit()
  }

  const stale = existing.docs.filter((d) => {
    if (d.id === '_meta') return false
    const n = Number(d.id.replace(/^c/, ''))
    return Number.isFinite(n) && n >= chunks.length
  })
  for (let i = 0; i < stale.length; i += 400) {
    const batch = db.batch()
    for (const d of stale.slice(i, i + 400)) batch.delete(d.ref)
    await batch.commit()
  }

  const last = db.batch()
  last.set(db.doc(`${col}/_meta`), { chunks: chunks.length, keys: Object.keys(memory).length, at: Date.now() })
  await last.commit()
}
