// src/features/priceWatch/usePriceWatch.ts
// Hooks CRUD du module Veille tarifaire (accès Firestore via features/, convention projet).
import { useEffect, useState, useCallback } from 'react'
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { productsCol, sitesCol, matchesCol, matchKey, DEFAULT_WATCH_ID } from './paths'
import type { TrackedProduct, CompetitorSite, PriceMatch, MatchStatus } from './types'

function useCollection<T extends { id: string }>(path: (uid: string, w: string) => string): T[] {
  const uid = useAuthStore((s) => s.user?.uid)
  const [items, setItems] = useState<T[]>([])
  useEffect(() => {
    if (!uid) { setItems([]); return }
    const ref = collection(db, path(uid, DEFAULT_WATCH_ID))
    return onSnapshot(
      ref,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as T[]),
      () => setItems([]), // handler d'erreur : règles/null safe (cf. mémoire onSnapshot)
    )
  }, [uid, path])
  return items
}

export function useTrackedProducts(): TrackedProduct[] { return useCollection<TrackedProduct>(productsCol) }
export function useCompetitorSites(): CompetitorSite[] { return useCollection<CompetitorSite>(sitesCol) }
export function usePriceMatches(): PriceMatch[] {
  const uid = useAuthStore((s) => s.user?.uid)
  const [items, setItems] = useState<PriceMatch[]>([])
  useEffect(() => {
    if (!uid) { setItems([]); return }
    const ref = collection(db, matchesCol(uid, DEFAULT_WATCH_ID))
    return onSnapshot(
      ref,
      (snap) => setItems(snap.docs.map((d) => d.data() as PriceMatch)),
      () => setItems([]),
    )
  }, [uid])
  return items
}

export function usePriceWatchMutations() {
  const uid = useAuthStore((s) => s.user?.uid)
  const saveProduct = useCallback(async (p: TrackedProduct) => {
    if (!uid) return
    await setDoc(doc(db, productsCol(uid, DEFAULT_WATCH_ID), p.id), { ...p, updatedAt: serverTimestamp() })
  }, [uid])
  const deleteProduct = useCallback(async (id: string) => {
    if (!uid) return
    await deleteDoc(doc(db, productsCol(uid, DEFAULT_WATCH_ID), id))
  }, [uid])
  const saveSite = useCallback(async (s: CompetitorSite) => {
    if (!uid) return
    await setDoc(doc(db, sitesCol(uid, DEFAULT_WATCH_ID), s.id), { ...s, updatedAt: serverTimestamp() })
  }, [uid])
  const deleteSite = useCallback(async (id: string) => {
    if (!uid) return
    await deleteDoc(doc(db, sitesCol(uid, DEFAULT_WATCH_ID), id))
  }, [uid])
  const setMatchStatus = useCallback(async (productId: string, siteId: string, status: MatchStatus) => {
    if (!uid) return
    await setDoc(
      doc(db, matchesCol(uid, DEFAULT_WATCH_ID), matchKey(productId, siteId)),
      { productId, siteId, status, updatedAt: Date.now() },
      { merge: true },
    )
  }, [uid])
  return { saveProduct, deleteProduct, saveSite, deleteSite, setMatchStatus }
}
