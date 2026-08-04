import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { useCallback, useEffect, useState } from 'react'
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  arrayRemove,
  serverTimestamp,
} from 'firebase/firestore'
import { ref as storageRef, deleteObject } from 'firebase/storage'
import { db, storage } from '../../../lib/firebase/config'
import type { DamImage } from '../types'

export function useDamSaveImage() {
  const uid = useWorkspaceUid()
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!uid) {
      setSavedIds(new Set())
      return
    }

    const q = query(
      collection(db, 'dam_assets'),
      where('addedBy', '==', uid)
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        const ids = new Set<string>()
        snap.docs.forEach((d) => ids.add(d.id))
        setSavedIds(ids)
      },
      (err) => {
        console.warn('dam_assets listener error:', err.message)
      }
    )

    return unsub
  }, [uid])

  const toggleSave = useCallback(
    async (image: DamImage) => {
      if (!uid) return

      const ref = doc(db, 'dam_assets', image.id)

      if (savedIds.has(image.id)) {
        setSavedIds((prev) => {
          const next = new Set(prev)
          next.delete(image.id)
          return next
        })
        await deleteDoc(ref)
      } else {
        setSavedIds((prev) => new Set(prev).add(image.id))
        await setDoc(ref, {
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
          addedBy: uid,
          addedAt: serverTimestamp(),
          usageCount: 0,
        })
      }
    },
    [uid, savedIds]
  )

  const isSaved = useCallback(
    (imageId: string) => savedIds.has(imageId),
    [savedIds]
  )

  // Hard-delete an asset: cascades through variants (Firestore + Storage),
  // removes the asset from every uid collection, deletes the favorite record,
  // then finally deletes the dam_assets doc itself.
  const deleteAsset = useCallback(
    async (imageId: string) => {
      if (!uid) return

      // 1. Delete all variants owned by the uid for this asset
      const variantsQ = query(
        collection(db, 'dam_variants'),
        where('ownerId', '==', uid),
        where('parentAssetId', '==', imageId)
      )
      const variantsSnap = await getDocs(variantsQ)

      await Promise.all(
        variantsSnap.docs.map(async (d) => {
          const data = d.data() as { renderedUrl?: string }
          // Best-effort Storage cleanup
          try {
            const basePath = data.renderedUrl?.split('/o/')[1]?.split('?')[0]
            if (basePath) {
              const decoded = decodeURIComponent(basePath)
              const thumbPath = decoded.replace('.jpg', '-thumb.jpg')
              await Promise.all([
                deleteObject(storageRef(storage, decoded)).catch(() => {}),
                deleteObject(storageRef(storage, thumbPath)).catch(() => {}),
              ])
            }
          } catch {
            // ignore cleanup errors
          }
          await deleteDoc(d.ref)
        })
      )

      // 2. Remove the asset ID from every uid collection that references it
      const collectionsQ = query(
        collection(db, 'dam_collections'),
        where('ownerId', '==', uid)
      )
      const collectionsSnap = await getDocs(collectionsQ)
      await Promise.all(
        collectionsSnap.docs.map((d) => {
          const data = d.data() as { assetIds?: string[] }
          if (data.assetIds?.includes(imageId)) {
            return updateDoc(d.ref, {
              assetIds: arrayRemove(imageId),
              updatedAt: serverTimestamp(),
            })
          }
          return Promise.resolve()
        })
      )

      // 3. Delete the favorite record (if any)
      await deleteDoc(doc(db, 'dam_favorites', `${uid}_${imageId}`)).catch(() => {})

      // 4. Delete the dam_assets doc itself
      await deleteDoc(doc(db, 'dam_assets', imageId))

      // 5. Sync local state
      setSavedIds((prev) => {
        const next = new Set(prev)
        next.delete(imageId)
        return next
      })
    },
    [uid]
  )

  return { toggleSave, isSaved, deleteAsset, savedIds }
}
