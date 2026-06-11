// src/features/brandkit/useBrandKit.ts
// Kit de marque GLOBAL (par utilisateur, partagé entre tous les projets) :
// couleurs stockées dans users/{uid}.brandKit. Chargement one-shot au montage
// (pas de hook de sync permanent — cf. pièges des hooks de sync Firestore).
import { useCallback, useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'

export interface BrandKitColor {
  color: string
  name: string
}

interface UseBrandKit {
  /** null = chargement en cours. */
  colors: BrandKitColor[] | null
  addColors: (toAdd: BrandKitColor[]) => void
  removeColor: (color: string) => void
}

export function useBrandKit(): UseBrandKit {
  const uid = useAuthStore((s) => s.user?.uid)
  const [colors, setColors] = useState<BrandKitColor[] | null>(null)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        if (cancelled) return
        const kit = (snap.data()?.brandKit ?? {}) as { colors?: BrandKitColor[] }
        setColors(Array.isArray(kit.colors) ? kit.colors : [])
      })
      .catch(() => {
        if (!cancelled) setColors([])
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  const persist = useCallback(
    (next: BrandKitColor[]) => {
      setColors(next)
      if (uid) {
        void setDoc(doc(db, 'users', uid), { brandKit: { colors: next } }, { merge: true })
      }
    },
    [uid],
  )

  const addColors = useCallback(
    (toAdd: BrandKitColor[]) => {
      const current = colors ?? []
      const known = new Set(current.map((c) => c.color.toLowerCase()))
      const fresh = toAdd.filter((c) => c.color && !known.has(c.color.toLowerCase()))
      if (fresh.length > 0) persist([...current, ...fresh])
    },
    [colors, persist],
  )

  const removeColor = useCallback(
    (color: string) => {
      persist((colors ?? []).filter((c) => c.color !== color))
    },
    [colors, persist],
  )

  return { colors, addColors, removeColor }
}
