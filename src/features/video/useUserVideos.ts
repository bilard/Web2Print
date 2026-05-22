import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot, doc, deleteDoc, updateDoc, Timestamp } from 'firebase/firestore'
import { ref as storageRef, deleteObject, updateMetadata } from 'firebase/storage'
import { db, storage } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { AspectFormat } from './types'
import type { StyleConfig } from './promptToStyleConfig'

export interface SavedVideo {
  renderId: string
  ownerId: string
  url: string
  storagePath: string | null
  durationMs: number | null
  aspect: AspectFormat
  caption: string | null
  brand: string | null
  prompt: string | null
  styleConfig: StyleConfig | null
  createdAt: Timestamp | null
  title?: string | null
}

export function useUserVideos() {
  const user = useAuthStore((s) => s.user)
  const [videos, setVideos] = useState<SavedVideo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.uid) {
      setVideos([])
      setLoading(false)
      return
    }

    setLoading(true)
    const q = query(
      collection(db, 'videos'),
      where('ownerId', '==', user.uid),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as SavedVideo)
        list.sort((a, b) => {
          const ta = a.createdAt?.toMillis() ?? 0
          const tb = b.createdAt?.toMillis() ?? 0
          return tb - ta
        })
        setVideos(list)
        setLoading(false)
      },
      (err) => {
        console.warn('videos listener error:', err.message)
        setLoading(false)
      },
    )
    return unsub
  }, [user?.uid])

  const deleteVideo = async (video: SavedVideo) => {
    await deleteDoc(doc(db, 'videos', video.renderId))
    if (video.storagePath) {
      try {
        await deleteObject(storageRef(storage, video.storagePath))
      } catch {
        // best-effort: object may already be gone or under different ownership
      }
    }
  }

  const renameVideo = async (video: SavedVideo, title: string) => {
    const trimmed = title.trim()
    await updateDoc(doc(db, 'videos', video.renderId), {
      title: trimmed.length > 0 ? trimmed : null,
    })

    if (video.storagePath && trimmed.length > 0) {
      const safe = trimmed.replace(/[/\\:*?"<>|\x00-\x1f]/g, '_').slice(0, 120)
      const asciiFallback = safe.normalize('NFKD').replace(/[^\x20-\x7e]/g, '_')
      try {
        await updateMetadata(storageRef(storage, video.storagePath), {
          contentDisposition: `attachment; filename="${asciiFallback}.mp4"; filename*=UTF-8''${encodeURIComponent(safe)}.mp4`,
        })
      } catch (e) {
        console.warn('Could not update storage metadata:', e)
      }
    }
  }

  return { videos, loading, deleteVideo, renameVideo }
}
