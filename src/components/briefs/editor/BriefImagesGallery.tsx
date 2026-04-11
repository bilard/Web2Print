import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useBriefImages } from '@/features/briefs/useBriefImages'
import { useGenerateBriefImage } from '@/features/briefs/ai/useGenerateBriefImage'
import { BriefImageCard } from './BriefImageCard'
import type { Brief, CartItem } from '@/features/briefs/types'

interface Props {
  brief: Brief
  batchPending?: boolean
}

export function BriefImagesGallery({ brief, batchPending }: Props) {
  const { data: images = [] } = useBriefImages(brief.id)
  const generate = useGenerateBriefImage()
  const [pending, setPending] = useState<string | null>(null)

  const byId = useMemo(() => new Map(images.map((i) => [i.id, i])), [images])
  const items: CartItem[] = brief.cart?.items ?? []

  const regenerate = async (id: string, target: Parameters<typeof generate.mutateAsync>[0]['target']) => {
    setPending(id)
    try {
      await generate.mutateAsync({ brief, target })
      toast.success('Image générée')
    } catch (err) {
      toast.error((err as Error).message || 'Échec de la génération')
    } finally {
      setPending(null)
    }
  }

  const stagingId = 'staging_scene'
  const staging = byId.get(stagingId)

  return (
    <div className="space-y-6">
      {/* Mise en situation 3D globale */}
      {items.length > 0 && (
        <div>
          <h3 className="text-[12px] font-semibold text-white/80 mb-2">
            Mise en situation 3D — stand personnalisé
          </h3>
          <BriefImageCard
            label="Stand complet avec tous les produits personnalisés"
            imageUrl={staging?.url}
            loading={pending === stagingId || (batchPending && !staging)}
            onRegenerate={() => regenerate(stagingId, { kind: 'staging_scene' })}
          />
        </div>
      )}

      {/* Visuels par produit */}
      <div>
        <h3 className="text-[12px] font-semibold text-white/80 mb-2">
          Visuels par produit
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item, idx) => {
            const id = `product_${item.sku}`
            return (
              <BriefImageCard
                key={`${id}_${idx}`}
                label={item.name}
                imageUrl={byId.get(id)?.url}
                loading={pending === id || (batchPending && !byId.get(id))}
                onRegenerate={() => regenerate(id, { kind: 'product', item })}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
