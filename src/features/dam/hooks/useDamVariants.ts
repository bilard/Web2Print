import { useCallback, useEffect, useState } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  setDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  serverTimestamp,
  orderBy,
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage'
import { db, storage } from '../../../lib/firebase/config'
import { useAuthStore } from '../../../stores/auth.store'
import type { DamImage, DamImageVariant, DamVariantEdits } from '../types'
import { renderEditedImage } from '../utils/renderEditedImage'

export function useDamVariants(parentAssetId: string | null) {
  const user = useAuthStore((s) => s.user)
  const [variants, setVariants] = useState<DamImageVariant[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user?.uid || !parentAssetId) {
      setVariants([])
      return
    }
    setLoading(true)

    const q = query(
      collection(db, 'dam_variants'),
      where('ownerId', '==', user.uid),
      where('parentAssetId', '==', parentAssetId),
      orderBy('createdAt', 'desc')
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DamImageVariant))
        setVariants(items)
        setLoading(false)
      },
      (err) => {
        console.warn('dam_variants listener error:', err.message)
        // Fallback without orderBy in case index is missing
        const qFallback = query(
          collection(db, 'dam_variants'),
          where('ownerId', '==', user.uid),
          where('parentAssetId', '==', parentAssetId)
        )
        onSnapshot(qFallback, (snap2) => {
          const items = snap2.docs
            .map((d) => ({ id: d.id, ...d.data() } as DamImageVariant))
            .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
          setVariants(items)
          setLoading(false)
        })
      }
    )

    return unsub
  }, [user?.uid, parentAssetId])

  const saveVariant = useCallback(
    async (image: DamImage, edits: DamVariantEdits, name: string) => {
      if (!user?.uid) throw new Error('Non authentifié')
      setSaving(true)
      try {
        // 1. Pre-generate a Firestore doc ref so the Storage filename can use the
        //    SAME id as the doc — this keeps saveVariant and updateVariant on the
        //    same Storage path and prevents orphan files on update.
        const docRef = doc(collection(db, 'dam_variants'))
        const variantId = docRef.id
        const basePath = `dam-variants/${user.uid}/${variantId}`

        // 2. Render full-size image + thumbnail in parallel
        const [
          { blob: fullBlob, width, height },
          { blob: thumbBlob },
        ] = await Promise.all([
          renderEditedImage(image.fullUrl, edits, { format: 'image/jpeg', quality: 0.92 }),
          renderEditedImage(image.fullUrl, edits, { format: 'image/jpeg', quality: 0.8, maxDimension: 400 }),
        ])

        // 3. Upload both to Storage
        const fullRef = storageRef(storage, `${basePath}.jpg`)
        const thumbRef = storageRef(storage, `${basePath}-thumb.jpg`)
        await Promise.all([
          uploadBytes(fullRef, fullBlob, { contentType: 'image/jpeg' }),
          uploadBytes(thumbRef, thumbBlob, { contentType: 'image/jpeg' }),
        ])
        const [renderedUrl, renderedThumbUrl] = await Promise.all([
          getDownloadURL(fullRef),
          getDownloadURL(thumbRef),
        ])

        // 4. Save metadata to the pre-generated doc ref
        await setDoc(docRef, {
          parentAssetId: image.id,
          parentImageData: {
            sourceProvider: image.sourceProvider,
            sourceId: image.sourceId,
            fullUrl: image.fullUrl,
            previewUrl: image.previewUrl,
            thumbnailUrl: image.thumbnailUrl,
            width: image.width,
            height: image.height,
            photographer: image.photographer,
            description: image.description,
            color: image.color,
            orientation: image.orientation,
            tags: image.tags ?? [],
            photographerUrl: image.photographerUrl,
            sourceUrl: image.sourceUrl,
          },
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          name,
          edits,
          renderedUrl,
          renderedThumbUrl,
          renderedWidth: width,
          renderedHeight: height,
        })
      } finally {
        setSaving(false)
      }
    },
    [user?.uid]
  )

  const updateVariant = useCallback(
    async (variant: DamImageVariant, image: DamImage, edits: DamVariantEdits) => {
      if (!user?.uid) throw new Error('Non authentifié')
      setSaving(true)
      try {
        // 1. Re-render full + thumbnail with the new edits
        const { blob: fullBlob, width, height } = await renderEditedImage(
          image.fullUrl,
          edits,
          { format: 'image/jpeg', quality: 0.92 }
        )
        const { blob: thumbBlob } = await renderEditedImage(
          image.fullUrl,
          edits,
          { format: 'image/jpeg', quality: 0.8, maxDimension: 400 }
        )

        // 2. Overwrite the existing Storage files — same paths as the original save
        //    so the download URLs stay valid.
        const basePath = `dam-variants/${user.uid}/${variant.id}`
        const fullRef = storageRef(storage, `${basePath}.jpg`)
        const thumbRef = storageRef(storage, `${basePath}-thumb.jpg`)
        await Promise.all([
          uploadBytes(fullRef, fullBlob, { contentType: 'image/jpeg' }),
          uploadBytes(thumbRef, thumbBlob, { contentType: 'image/jpeg' }),
        ])
        // Re-fetch URLs — tokens may change on re-upload
        const [renderedUrl, renderedThumbUrl] = await Promise.all([
          getDownloadURL(fullRef),
          getDownloadURL(thumbRef),
        ])

        // 3. Patch Firestore metadata
        await updateDoc(doc(db, 'dam_variants', variant.id), {
          edits,
          renderedUrl,
          renderedThumbUrl,
          renderedWidth: width,
          renderedHeight: height,
          updatedAt: serverTimestamp(),
        })
      } finally {
        setSaving(false)
      }
    },
    [user?.uid]
  )

  const deleteVariant = useCallback(
    async (variant: DamImageVariant) => {
      await deleteDoc(doc(db, 'dam_variants', variant.id))
      // Best-effort storage cleanup (non-blocking)
      try {
        const basePath = variant.renderedUrl.split('/o/')[1]?.split('?')[0]
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
    },
    []
  )

  const recoverOrphans = useCallback(
    async (image: DamImage): Promise<number> => {
      if (!user?.uid) throw new Error('Non authentifié')
      setSaving(true)
      try {
        // 1. List all Storage files in the user's dam-variants folder
        const folderRef = storageRef(storage, `dam-variants/${user.uid}`)
        const listResult = await listAll(folderRef)

        // 2. Build the set of filenames already referenced by *any* existing variant
        //    doc belonging to this user (across every parent asset).
        const allVariantsQ = query(
          collection(db, 'dam_variants'),
          where('ownerId', '==', user.uid)
        )
        const snap = await getDocs(allVariantsQ)
        const referencedFilenames = new Set<string>()
        for (const d of snap.docs) {
          const data = d.data() as DamImageVariant
          for (const url of [data.renderedUrl, data.renderedThumbUrl]) {
            if (!url) continue
            // Extract filename from Firebase Storage URL
            const m = url.match(/dam-variants%2F[^%]+%2F([^?]+)/)
            if (m) referencedFilenames.add(decodeURIComponent(m[1]))
          }
        }

        // 3. Keep orphan MAIN files (skip *-thumb.jpg)
        const orphans = listResult.items.filter(
          (item) => !item.name.endsWith('-thumb.jpg') && !referencedFilenames.has(item.name)
        )
        if (orphans.length === 0) return 0

        // 4. For each orphan: fetch to read dimensions, build + upload thumbnail,
        //    then create a dam_variants doc pointing at it.
        let recovered = 0
        for (const orphan of orphans) {
          try {
            const renderedUrl = await getDownloadURL(orphan)

            // Load the orphan image to read natural dimensions & generate thumb
            const res = await fetch(renderedUrl)
            const blob = await res.blob()
            const objUrl = URL.createObjectURL(blob)
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = objUrl
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve()
              img.onerror = () => reject(new Error('Image load failed'))
            })
            const width = img.naturalWidth
            const height = img.naturalHeight

            // Build 400px thumbnail
            const scale = 400 / Math.max(width, height)
            const tw = Math.max(1, Math.round(width * scale))
            const th = Math.max(1, Math.round(height * scale))
            const canvas = document.createElement('canvas')
            canvas.width = tw
            canvas.height = th
            const ctx = canvas.getContext('2d')
            if (!ctx) throw new Error('Canvas unavailable')
            ctx.drawImage(img, 0, 0, tw, th)
            const thumbBlob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, 'image/jpeg', 0.8)
            )
            URL.revokeObjectURL(objUrl)
            if (!thumbBlob) throw new Error('Thumb encode failed')

            // Upload the thumb alongside the original file
            const thumbName = orphan.name.replace(/\.jpg$/i, '-thumb.jpg')
            const thumbRef = storageRef(storage, `dam-variants/${user.uid}/${thumbName}`)
            await uploadBytes(thumbRef, thumbBlob, { contentType: 'image/jpeg' })
            const renderedThumbUrl = await getDownloadURL(thumbRef)

            // Create the recovered Firestore doc
            const docRef = doc(collection(db, 'dam_variants'))
            await setDoc(docRef, {
              parentAssetId: image.id,
              parentImageData: {
                sourceProvider: image.sourceProvider,
                sourceId: image.sourceId,
                fullUrl: image.fullUrl,
                previewUrl: image.previewUrl,
                thumbnailUrl: image.thumbnailUrl,
                width: image.width,
                height: image.height,
                photographer: image.photographer,
                description: image.description,
                color: image.color,
                orientation: image.orientation,
                tags: image.tags ?? [],
                photographerUrl: image.photographerUrl,
                sourceUrl: image.sourceUrl,
              },
              ownerId: user.uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              name: `Récupéré — ${orphan.name.replace(/\.jpg$/i, '').slice(0, 12)}`,
              edits: {
                zoom: 1,
                rotation: 0,
                flipH: false,
                flipV: false,
                filters: { brightness: 100, contrast: 100, saturation: 100, hue: 0 },
                mask: { x: 0, y: 0, width: 1, height: 1, enabled: false },
              },
              renderedUrl,
              renderedThumbUrl,
              renderedWidth: width,
              renderedHeight: height,
            })
            recovered++
          } catch (err) {
            console.warn(`Recovery failed for ${orphan.name}:`, err)
          }
        }
        return recovered
      } finally {
        setSaving(false)
      }
    },
    [user?.uid]
  )

  const renameVariant = useCallback(async (variantId: string, name: string) => {
    await updateDoc(doc(db, 'dam_variants', variantId), {
      name,
      updatedAt: serverTimestamp(),
    })
  }, [])

  return {
    variants,
    loading,
    saving,
    saveVariant,
    updateVariant,
    deleteVariant,
    renameVariant,
    recoverOrphans,
  }
}
