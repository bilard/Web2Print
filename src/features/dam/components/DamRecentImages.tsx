import { useEffect, useMemo, useState } from 'react'
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '../../../lib/firebase/config'
import { useAuthStore } from '../../../stores/auth.store'
import { DamImageCard } from './DamImageCard'
import { DamMasonry } from './DamMasonry'
import type { DamImage } from '../types'
import { EmptyState } from '@/components/shared/EmptyState'
import { ImageOff, Sparkles } from 'lucide-react'
import { useDamStore } from '../../../stores/dam.store'

interface Props {
  sortBy?: 'addedAt' | 'usageCount'
}

export function DamRecentImages({ sortBy = 'addedAt' }: Props) {
  const user = useAuthStore((s) => s.user)
  const [images, setImages] = useState<DamImage[]>([])
  const [loading, setLoading] = useState(true)
  const [tagFilter, setTagFilter] = useState('')

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

  const filtered = useMemo(() => {
    const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const tokens = norm(tagFilter).split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return images
    return images.filter((img) => {
      const hay = norm([...(img.tags ?? []), img.description ?? '', (img as { aiSubject?: string }).aiSubject ?? ''].join(' '))
      return tokens.every((t) => hay.includes(t))
    })
  }, [images, tagFilter])

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-white/30 text-sm">Chargement...</div>
  }

  if (images.length === 0) {
    return (
      <EmptyState
        icon={ImageOff}
        title="Aucune image sauvegardée"
        hint="Générez une image par IA ou sauvegardez un visuel depuis le Stock — elle sera taguée automatiquement pour la recherche."
        action={{ label: 'Créer une image par IA', icon: Sparkles, onClick: () => useDamStore.getState().setActiveTab('generate') }}
      />
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4">
      {/* Filtre par tags IA / description (matching client-side, insensible aux accents) */}
      <input
        type="text"
        value={tagFilter}
        onChange={(e) => setTagFilter(e.target.value)}
        placeholder="Filtrer par tags ou description… (ex : bouteille verte)"
        className="w-full mb-3 bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs text-white placeholder:text-white/25 focus:border-indigo-500 outline-none"
      />
      <DamMasonry
        images={filtered}
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
