import { useCallback } from 'react'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, updateDoc } from 'firebase/firestore'
import { storage, db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useEditorStore } from '@/stores/editor.store'
import { useNanoBanaStore } from '@/stores/nanobana.store'
import { useImageCompression } from './useImageCompression'
import type { GalleryImage } from './types'

export function useImageGallery() {
  const userId = useAuthStore((s) => s.user?.uid)
  const projectId = useEditorStore((s) => s.projectId)
  const { setImages, setLoading, addImage, removeImage } = useNanoBanaStore()
  const { compress, thumbnail } = useImageCompression()

  /** Load all images from Firestore (project-scoped) */
  const loadGallery = useCallback(async () => {
    if (!userId || !projectId) return
    setLoading(true)
    try {
      const q = query(collection(db, `projects/${projectId}/gallery`), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      const images = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GalleryImage)
      setImages(images)
    } catch (err) {
      console.error('Gallery load error', err)
    } finally {
      setLoading(false)
    }
  }, [userId, projectId, setImages, setLoading])

  /** Upload an image with compression + thumbnail */
  const uploadToGallery = useCallback(
    async (file: File, tags: string[] = []): Promise<GalleryImage | null> => {
      if (!userId || !projectId) return null

      const ts = Date.now()
      const rand = Math.random().toString(36).slice(2, 7)
      const baseName = file.name.replace(/\.[^.]+$/, '')

      // Compress the image
      const result = await compress(file)
      const ext = file.type === 'image/png' ? 'png' : 'jpg'

      // Upload compressed image
      const imgPath = `projects/${projectId}/gallery/${ts}_${rand}.${ext}`
      const imgRef = ref(storage, imgPath)
      await uploadBytes(imgRef, result.blob)
      const url = await getDownloadURL(imgRef)

      // Upload thumbnail
      const thumbBlob = await thumbnail(file)
      const thumbPath = `projects/${projectId}/gallery/thumbs/${ts}_${rand}_thumb.jpg`
      const thumbRef = ref(storage, thumbPath)
      await uploadBytes(thumbRef, thumbBlob)
      const thumbnailUrl = await getDownloadURL(thumbRef)

      // Save metadata to Firestore
      const imageData: Omit<GalleryImage, 'id'> = {
        name: baseName,
        url,
        thumbnailUrl,
        storagePath: imgPath,
        width: result.width,
        height: result.height,
        sizeBytes: result.originalSize,
        compressedSizeBytes: result.compressedSize,
        mimeType: file.type,
        createdAt: ts,
        tags,
      }

      const docRef = await addDoc(collection(db, `projects/${projectId}/gallery`), imageData)
      const image: GalleryImage = { id: docRef.id, ...imageData }
      addImage(image)
      return image
    },
    [userId, projectId, compress, thumbnail, addImage],
  )

  /** Delete an image from Storage + Firestore */
  const deleteFromGallery = useCallback(
    async (image: GalleryImage) => {
      if (!userId || !projectId) return
      // Suppression Storage — non bloquante (le fichier peut être absent)
      if (image.storagePath) {
        try { await deleteObject(ref(storage, image.storagePath)) } catch { /* absent ou déjà supprimé */ }
        const thumbPath = image.storagePath
          .replace(/\/gallery\//, '/gallery/thumbs/')
          .replace(/\.\w+$/, '_thumb.jpg')
        try { await deleteObject(ref(storage, thumbPath)) } catch { /* miniature absente */ }
      }
      // Suppression Firestore — toujours exécutée
      try {
        await deleteDoc(doc(db, `projects/${projectId}/gallery`, image.id))
      } catch (err) {
        console.error('Delete Firestore error', err)
      }
      // Retrait du store — toujours exécuté
      removeImage(image.id)
    },
    [userId, projectId, removeImage],
  )

  /** Update image tags */
  const updateTags = useCallback(
    async (imageId: string, tags: string[]) => {
      if (!userId || !projectId) return
      await updateDoc(doc(db, `projects/${projectId}/gallery`, imageId), { tags })
    },
    [userId, projectId],
  )

  return { loadGallery, uploadToGallery, deleteFromGallery, updateTags }
}
