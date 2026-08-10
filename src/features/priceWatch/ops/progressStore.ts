// Publication de l'avancement des textes, côté NAVIGATEUR.
//
// ⚠ Jumeau serveur obligatoire : `functions/src/priceWatch/opsProgress.ts`. Un compteur
// publié ici et pas là-bas ferait mentir l'écran uniquement la nuit — le pire des
// mensonges, celui qu'on ne constate jamais en travaillant.
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { opsProgressDoc } from '../paths'
import type { TextsProgress } from './opsTypes'

/** Une écriture au plus toutes les dix secondes. */
export const OPS_WRITE_INTERVAL_MS = 10_000

/** PUR — testable sans Firestore. `force` sert la première et la dernière écriture d'un
 *  passage : celles-là ne s'attendent pas, ce sont les seules qu'on regarde. */
export function shouldPublish(lastAt: number, now: number, force: boolean): boolean {
  return force || lastAt === 0 || now - lastAt >= OPS_WRITE_INTERVAL_MS
}

/**
 * Dernière écriture PAR SUIVI.
 *
 * ⚠ Un compteur global se ferait taire tout seul : rien n'interdit deux cartes « Textes »
 * dans un flux, ni deux suivis dans le même onglet, et la seconde n'écrirait jamais.
 *
 * ⚠ Limite assumée : deux cartes « Textes » sur le MÊME suivi publient dans le même champ
 * du même document — la dernière écriture gagne. Le document décrit un suivi, pas une
 * carte. Si ce cas devient courant, il faudra clefer par carte, ce qui change la forme du
 * document et l'écran.
 */
const lastAtByWatch = new Map<string, number>()

/** Écrit l'avancement. Fire-and-forget : un échec ne doit jamais perturber le passage. */
export async function publishTextsProgress(
  uid: string, watchId: string, texts: TextsProgress, opts: { force?: boolean } = {},
): Promise<void> {
  const now = Date.now()
  if (!shouldPublish(lastAtByWatch.get(watchId) ?? 0, now, opts.force === true)) return
  lastAtByWatch.set(watchId, now)
  try {
    await setDoc(doc(db, opsProgressDoc(uid, watchId)), { updatedAt: now, texts }, { merge: true })
  } catch (e) {
    console.warn('[suivi] publication de l’avancement refusée :', e)
  }
}

/** Remet le compteur d'espacement à zéro — un nouveau passage publie immédiatement. */
export function resetPublishThrottle(watchId: string): void { lastAtByWatch.delete(watchId) }
