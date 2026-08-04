import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { useCallback, useEffect, useState } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../../lib/firebase/config'
import type { DamCollection } from '../types'

export function useDamCollections() {
  const uid = useWorkspaceUid()
  const [collections, setCollections] = useState<DamCollection[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!uid) return
    setLoading(true)

    const q = query(
      collection(db, 'dam_collections'),
      where('ownerId', '==', uid)
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        const cols = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DamCollection))
        setCollections(cols)
        setLoading(false)
      },
      (err) => {
        console.warn('dam_collections listener error:', err.message)
        setLoading(false)
      }
    )

    return unsub
  }, [uid])

  const createCollection = useCallback(
    async (name: string, description = '') => {
      if (!uid) return null

      const ref = await addDoc(collection(db, 'dam_collections'), {
        name,
        description,
        coverAssetId: null,
        ownerId: uid,
        sharedWith: [],
        visibility: 'private',
        assetIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      return ref.id
    },
    [uid]
  )

  const addToCollection = useCallback(
    async (collectionId: string, assetId: string) => {
      const ref = doc(db, 'dam_collections', collectionId)
      await updateDoc(ref, {
        assetIds: arrayUnion(assetId),
        updatedAt: serverTimestamp(),
      })
    },
    []
  )

  const removeFromCollection = useCallback(
    async (collectionId: string, assetId: string) => {
      const ref = doc(db, 'dam_collections', collectionId)
      await updateDoc(ref, {
        assetIds: arrayRemove(assetId),
        updatedAt: serverTimestamp(),
      })
    },
    []
  )

  const deleteCollection = useCallback(
    async (collectionId: string) => {
      await deleteDoc(doc(db, 'dam_collections', collectionId))
    },
    []
  )

  const renameCollection = useCallback(
    async (collectionId: string, name: string) => {
      await updateDoc(doc(db, 'dam_collections', collectionId), {
        name,
        updatedAt: serverTimestamp(),
      })
    },
    []
  )

  return {
    collections,
    loading,
    createCollection,
    addToCollection,
    removeFromCollection,
    deleteCollection,
    renameCollection,
  }
}
