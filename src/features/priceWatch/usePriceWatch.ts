import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
// Hooks lecture/validation du module Veille tarifaire. Les produits + sites sont
// désormais configurés DANS LE FLUX (node price-watch-track) ; ce module n'est
// plus qu'un tableau de bord lecture-seule des matchs (+ file « à confirmer »).
import { useEffect, useState, useCallback } from 'react'
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { matchesCol, matchKey, DEFAULT_WATCH_ID } from './paths'
import type { PriceMatch, MatchStatus } from './types'

/** S'abonne aux matchs du suivi courant (temps réel). */
export function usePriceMatches(): PriceMatch[] {
  const uid = useWorkspaceUid()
  const [items, setItems] = useState<PriceMatch[]>([])
  useEffect(() => {
    if (!uid) { setItems([]); return }
    const ref = collection(db, matchesCol(uid, DEFAULT_WATCH_ID))
    return onSnapshot(
      ref,
      (snap) => setItems(snap.docs.map((d) => d.data() as PriceMatch)),
      () => setItems([]), // handler d'erreur : règles/null safe (cf. mémoire onSnapshot)
    )
  }, [uid])
  return items
}

/** Confirmer / rejeter un rapprochement (file « à confirmer »). */
export function usePriceWatchMutations() {
  const uid = useWorkspaceUid()
  const setMatchStatus = useCallback(async (productId: string, siteId: string, status: MatchStatus) => {
    if (!uid) return
    await setDoc(
      doc(db, matchesCol(uid, DEFAULT_WATCH_ID), matchKey(productId, siteId)),
      { productId, siteId, status, updatedAt: Date.now() },
      { merge: true },
    )
  }, [uid])
  return { setMatchStatus }
}
