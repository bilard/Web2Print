import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useBriefImages } from '@/features/briefs/useBriefImages'
import { useGenerateBriefImage } from '@/features/briefs/ai/useGenerateBriefImage'
import { BriefImageCard } from './BriefImageCard'
import type { Brief, CartItem } from '@/features/briefs/types'

interface Props {
  brief: Brief
}

export function BriefImagesGallery({ brief }: Props) {
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

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      <BriefImageCard
        label="Hero"
        imageUrl={byId.get('hero')?.url}
        loading={pending === 'hero'}
        onRegenerate={() => regenerate('hero', { kind: 'hero' })}
      />
      {items.map((item) => {
        const id = `product_${item.sku}`
        return (
          <BriefImageCard
            key={id}
            label={item.name}
            imageUrl={byId.get(id)?.url}
            loading={pending === id}
            onRegenerate={() => regenerate(id, { kind: 'product', item })}
          />
        )
      })}
    </div>
  )
}
