import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot, doc, deleteDoc, updateDoc, Timestamp } from 'firebase/firestore'
import { ref as storageRef, deleteObject, updateMetadata } from 'firebase/storage'
import { db, storage } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { AspectFormat } from './types'
import type { StyleConfig } from './promptToStyleConfig'
import type { Composition } from './promptToComposition'

export interface SavedAnimation {
  animationId: string
  ownerId: string
  /** URL signée du ZIP HTML dans Firebase Storage (`dam/html-animations/...`). */
  url: string
  storagePath: string | null
  bytes: number | null
  aspect: AspectFormat
  composition: Composition | null
  styleConfig: StyleConfig | null
  caption: string | null
  brand: string | null
  prompt: string | null
  width: number | null
  height: number | null
  createdAt: Timestamp | null
  title?: string | null
}

export function useUserAnimations() {
  const user = useAuthStore((s) => s.user)
  const [animations, setAnimations] = useState<SavedAnimation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.uid) {
      setAnimations([])
      setLoading(false)
      return
    }

    setLoading(true)
    const q = query(
      collection(db, 'animations'),
      where('ownerId', '==', user.uid),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as SavedAnimation)
        list.sort((a, b) => {
          const ta = a.createdAt?.toMillis() ?? 0
          const tb = b.createdAt?.toMillis() ?? 0
          return tb - ta
        })
        setAnimations(list)
        setLoading(false)
      },
      (err) => {
        console.warn('animations listener error:', err.message)
        setLoading(false)
      },
    )
    return unsub
  }, [user?.uid])

  const deleteAnimation = async (anim: SavedAnimation) => {
    await deleteDoc(doc(db, 'animations', anim.animationId))
    if (anim.storagePath) {
      try {
        await deleteObject(storageRef(storage, anim.storagePath))
      } catch {
        // best-effort: object may already be gone
      }
    }
  }

  const renameAnimation = async (anim: SavedAnimation, title: string) => {
    const trimmed = title.trim()
    await updateDoc(doc(db, 'animations', anim.animationId), {
      title: trimmed.length > 0 ? trimmed : null,
    })

    if (anim.storagePath && trimmed.length > 0) {
      // eslint-disable-next-line no-control-regex -- on retire volontairement les caractères de contrôle d'un nom de fichier
      const safe = trimmed.replace(/[/\\:*?"<>|\x00-\x1f]/g, '_').slice(0, 120)
      const asciiFallback = safe.normalize('NFKD').replace(/[^\x20-\x7e]/g, '_')
      try {
        await updateMetadata(storageRef(storage, anim.storagePath), {
          contentDisposition: `attachment; filename="${asciiFallback}.zip"; filename*=UTF-8''${encodeURIComponent(safe)}.zip`,
        })
      } catch (e) {
        console.warn('Could not update storage metadata:', e)
      }
    }
  }

  return { animations, loading, deleteAnimation, renameAnimation }
}
