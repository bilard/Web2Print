import { useEffect, useState } from 'react'
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '../../../lib/firebase/config'
import { useAuthStore } from '../../../stores/auth.store'
import { DamImageCard } from './DamImageCard'
import { DamMasonry } from './DamMasonry'
import type { DamImage } from '../types'

interface Props {
  sortBy?: 'addedAt' | 'usageCount'
}

export function DamRecentImages({ sortBy = 'addedAt' }: Props) {
  const user = useAuthStore((s) => s.user)
  const [images, setImages] = useState<DamImage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.uid) {
      setImages([])
      setLoading(false)
      return
    }

    setLoading(true)

    const snapshotHandler = (snap: { docs: { id: string; data: () => any }[] }) => {
      const assets = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DamImage))
      setImages(assets)
      setLoading(false)
    }

    const primaryQuery = query(
      collection(db, 'dam_assets'),
      where('addedBy', '==', user.uid),
      orderBy(sortBy, 'desc'),
      limit(60)
    )

    const unsub = onSnapshot(
      primaryQuery,
      snapshotHandler,
      (err) => {
        console.warn('dam_assets listener failed, falling back without orderBy:', err)
        // Fallback: requête sans orderBy si l'index n'existe pas
        const fallbackQuery = query(
          collection(db, 'dam_assets'),
          where('addedBy', '==', user.uid),
          limit(60)
        )
        const fallbackUnsub = onSnapshot(
          fallbackQuery,
          snapshotHandler,
          (err2) => {
            console.error('dam_assets fallback listener failed:', err2)
            setImages([])
            setLoading(false)
          }
        )
        // Remplace la fonction d'unsub pour le prochain cleanup
        ;(unsub as any)._fallback = fallbackUnsub
      }
    )

    return () => {
      unsub()
      ;(unsub as any)._fallback?.()
    }
  }, [user?.uid, sortBy])

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-white/30 text-sm">Chargement...</div>
  }

  if (images.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-white/30 text-sm">Aucune image sauvegardée</div>
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4">
      <DamMasonry
        images={images}
        renderItem={(image) => (
          <DamImageCard
            image={image}
            onDeleted={(id) => setImages((prev) => prev.filter((i) => i.id !== id))}
          />
        )}
      />
    </div>
  )
}
