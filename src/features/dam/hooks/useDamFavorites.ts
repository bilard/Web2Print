import { useCallback, useEffect, useState } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../../lib/firebase/config'
import { useAuthStore } from '../../../stores/auth.store'
import type { DamImage } from '../types'

export function useDamFavorites() {
  const user = useAuthStore((s) => s.user)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user?.uid) return

    const q = query(
      collection(db, 'dam_favorites'),
      where('userId', '==', user.uid)
    )

    const unsub = onSnapshot(q, (snap) => {
      const ids = new Set<string>()
      snap.docs.forEach((d) => ids.add(d.data().assetId))
      setFavoriteIds(ids)
    })

    return unsub
  }, [user?.uid])

  const toggleFavorite = useCallback(
    async (image: DamImage) => {
      if (!user?.uid) return

      const docId = `${user.uid}_${image.id}`
      const ref = doc(db, 'dam_favorites', docId)

      if (favoriteIds.has(image.id)) {
        await deleteDoc(ref)
      } else {
        const assetRef = doc(db, 'dam_assets', image.id)
        await setDoc(assetRef, {
          sourceProvider: image.sourceProvider,
          sourceId: image.sourceId,
          sourceUrl: image.sourceUrl,
          thumbnailUrl: image.thumbnailUrl,
          previewUrl: image.previewUrl,
          fullUrl: image.fullUrl,
          width: image.width,
          height: image.height,
          photographer: image.photographer,
          photographerUrl: image.photographerUrl,
          description: image.description,
          tags: image.tags,
          color: image.color,
          orientation: image.orientation,
          addedBy: user.uid,
          addedAt: serverTimestamp(),
          usageCount: 0,
        }, { merge: true })

        await setDoc(ref, {
          userId: user.uid,
          assetId: image.id,
          createdAt: serverTimestamp(),
        })
      }
    },
    [user?.uid, favoriteIds]
  )

  const isFavorite = useCallback(
    (imageId: string) => favoriteIds.has(imageId),
    [favoriteIds]
  )

  return { favoriteIds, loading, toggleFavorite, isFavorite }
}
