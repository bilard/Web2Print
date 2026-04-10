import { useEffect, useState } from 'react'
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'
import { db } from '../../../lib/firebase/config'
import { useAuthStore } from '../../../stores/auth.store'
import { DamImageCard } from './DamImageCard'
import type { DamImage } from '../types'

export function DamRecentImages() {
  const user = useAuthStore((s) => s.user)
  const [images, setImages] = useState<DamImage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.uid) return

    const load = async () => {
      setLoading(true)
      const q = query(
        collection(db, 'dam_assets'),
        where('addedBy', '==', user.uid),
        orderBy('addedAt', 'desc'),
        limit(60)
      )
      const snap = await getDocs(q)
      const assets = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DamImage))
      setImages(assets)
      setLoading(false)
    }

    load()
  }, [user?.uid])

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-white/30 text-sm">Chargement...</div>
  }

  if (images.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-white/30 text-sm">Aucune image récente</div>
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4">
      <div className="columns-4 gap-2 [column-fill:_balance]">
        {images.map((image) => (
          <div key={image.id} className="break-inside-avoid mb-2">
            <DamImageCard image={image} />
          </div>
        ))}
      </div>
    </div>
  )
}
