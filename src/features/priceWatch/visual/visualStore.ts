// Persistance des verdicts visuels d'un concurrent.
//
// Ce n'est PAS un cache de données métier (interdit dans ce projet) : c'est le résultat
// d'un calcul payant sur une entrée immuable — une paire d'URL d'images. Le relancer à
// chaque ouverture d'écran facturerait plusieurs euros par consultation.
//
// ⚠ Chunké par OCTETS, jamais par nombre d'entrées. Une note d'analyse est un texte libre
// de longueur variable ; 16 000 verdicts dépassent la limite dure de 1 048 576 o par
// document, et Firestore répond alors INVALID_ARGUMENT en écriture — la passe entière
// serait perdue à la fin. Même piège que le catalogue source, déjà corrigé une fois.
import { doc, getDocs, setDoc, deleteDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { competitorDoc } from '../paths'
import { urlKey } from '../explorer/verdictStore'
import type { VisualResult } from './visualMatch'

/** Marge sous la limite dure de 1 Mo, alignée sur les autres tranches du module. */
const VISUAL_CHUNK_BYTES = 900_000

const visualCol = (uid: string, watchId: string, siteId: string) =>
  `${competitorDoc(uid, watchId, siteId)}/visual`

/** Un verdict, tel que persisté. `at` date l'analyse, `v` sa version de prompt. */
export interface StoredVisual extends VisualResult {
  at: number
  v: string
}

export type VisualMap = Map<string, StoredVisual>

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length
}

/** Découpe une table en tranches tenant chacune sous le plafond d'octets. */
export function chunkVisuals(entries: [string, StoredVisual][]): Record<string, StoredVisual>[] {
  const out: Record<string, StoredVisual>[] = []
  let cur: Record<string, StoredVisual> = {}
  let used = 0
  for (const [k, v] of entries) {
    const size = utf8Bytes(k) + utf8Bytes(JSON.stringify(v)) + 8
    if (used > 0 && used + size > VISUAL_CHUNK_BYTES) {
      out.push(cur); cur = {}; used = 0
    }
    cur[k] = v; used += size
  }
  if (used > 0 || out.length === 0) out.push(cur)
  return out
}

export async function loadVisuals(uid: string, watchId: string, siteId: string): Promise<VisualMap> {
  const snap = await getDocs(collection(db, visualCol(uid, watchId, siteId)))
  const out: VisualMap = new Map()
  for (const d of snap.docs) {
    const v = (d.data()?.v ?? {}) as Record<string, StoredVisual>
    for (const [k, entry] of Object.entries(v)) {
      if (entry && typeof entry.score === 'number') out.set(k, entry)
    }
  }
  return out
}

/**
 * Réécrit TOUTES les tranches. Appelé en fin de lot par la passe d'analyse, qui tient la
 * table complète en mémoire — un merge par entrée coûterait une écriture par produit.
 *
 * Les tranches devenues inutiles (table qui rétrécit) sont supprimées : laissées en
 * place, elles ressusciteraient d'anciens verdicts à la relecture.
 */
export async function saveVisuals(uid: string, watchId: string, siteId: string, map: VisualMap): Promise<void> {
  const chunks = chunkVisuals([...map.entries()])
  const col = visualCol(uid, watchId, siteId)
  await Promise.all(chunks.map((v, i) =>
    setDoc(doc(db, col, `c${i}`), { v, updatedAt: serverTimestamp() }),
  ))
  const existing = await getDocs(collection(db, col))
  await Promise.all(existing.docs
    .filter((d) => Number(d.id.slice(1)) >= chunks.length)
    .map((d) => deleteDoc(d.ref).catch(() => { /* tranche déjà absente */ })))
}

/** Trace de la dernière passe : combien de paires jugées, et quand. Écrite pour le
 *  journal d'exploitation — la REPRISE, elle, ne s'appuie sur rien d'autre que la
 *  présence d'un verdict, ce qui la rend insensible à un curseur périmé. */
export interface VisualPassState {
  /** Index de la dernière fiche traitée dans l'ordre stable des URL. */
  cursor: number
  analyzed: number
  updatedAt: number
}

const passDoc = (uid: string, watchId: string, siteId: string) =>
  `${competitorDoc(uid, watchId, siteId)}/visualPass/state`

export async function saveVisualPass(
  uid: string, watchId: string, siteId: string, state: VisualPassState,
): Promise<void> {
  await setDoc(doc(db, passDoc(uid, watchId, siteId)), state, { merge: true })
}

export { urlKey }
