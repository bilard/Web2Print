// Verdicts d'audit : ce que l'acheteur a VALIDÉ ou REJETÉ parmi les appariements.
//
// L'indice de fiabilité désigne les rapprochements à contrôler ; il ne les contrôle pas.
// Sans trace du jugement humain, le même doute reparaît à chaque ouverture et le travail
// déjà fait est perdu — c'est ce qui rend un écran d'audit inutilisable au-delà de la
// première session.
//
// Modèle : UN document par concurrent, portant une table `url → verdict`. Pas un document
// par ligne — statuer trois cents fiches déclencherait trois cents écritures et autant de
// lectures à l'ouverture. La clé est un HACHÉ court de l'URL : les URL produit font
// couramment 100 caractères et un document Firestore plafonne à 1 Mo.
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { competitorDoc } from '../paths'

/** `ok` = c'est bien le même produit. `ko` = rapprochement faux, à ignorer. */
export type Verdict = 'ok' | 'ko'

/** Table des jugements d'un concurrent, indexée par URL de fiche. */
export type VerdictMap = Map<string, Verdict>

const verdictDoc = (uid: string, watchId: string, siteId: string) =>
  `${competitorDoc(uid, watchId, siteId)}/audit/verdicts`

/**
 * Haché 64 bits (deux FNV-1a de graines différentes), en base 36. ~13 caractères contre
 * la centaine d'une URL produit. Le 32 bits seul collisionnerait sur ~5 % des paires à
 * 20 000 fiches — un verdict recopié sur le mauvais produit, invisible et faux.
 */
export function urlKey(url: string): string {
  let a = 0x811c9dc5, b = 0x01000193
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0
  }
  return a.toString(36) + b.toString(36)
}

export async function loadVerdicts(uid: string, watchId: string, siteId: string): Promise<VerdictMap> {
  const snap = await getDoc(doc(db, verdictDoc(uid, watchId, siteId)))
  const raw = (snap.data()?.v ?? {}) as Record<string, string>
  const out: VerdictMap = new Map()
  for (const [k, v] of Object.entries(raw)) if (v === 'ok' || v === 'ko') out.set(k, v)
  return out
}

/**
 * Pose ou retire un verdict. L'écriture est un MERGE sur la seule clé touchée : deux
 * onglets ouverts sur le même concurrent ne s'écrasent pas l'un l'autre.
 */
export async function saveVerdict(
  uid: string, watchId: string, siteId: string, url: string, verdict: Verdict | null,
): Promise<void> {
  const { deleteField } = await import('firebase/firestore')
  await setDoc(
    doc(db, verdictDoc(uid, watchId, siteId)),
    { v: { [urlKey(url)]: verdict ?? deleteField() }, updatedAt: serverTimestamp() },
    { merge: true },
  )
}
