// src/features/catalog/useCoverImage.ts
// Visuel de couverture via Nano Banana. L'image générée est uploadée à la galerie
// (useImageGallery) : on stocke son URL dans le doc catalogue.
import { useState } from 'react'
import { toast } from 'sonner'
import { useImageGeneration } from '@/features/nanobana/useImageGeneration'
import { useCatalogStore } from '@/stores/catalog.store'
import { pagePx } from './components/pages/catalogCss'

export function useCoverImage() {
  const { generateImage } = useImageGeneration()
  const [generating, setGenerating] = useState(false)

  const generateCover = async (prompt: string, target: 'cover' | 'back') => {
    if (!prompt.trim()) { toast.error('Renseignez d’abord le prompt image (plan IA ou saisie manuelle)'); return }
    setGenerating(true)
    try {
      const s = useCatalogStore.getState()
      const { w, h } = pagePx(s.format)
      const image = await generateImage({ prompt, targetWidth: w, targetHeight: h })
      if (!image) { toast.error('Génération du visuel échouée — couverture typographique conservée'); return }
      if (target === 'cover') s.setCoverImageUrl(image.url)
      else s.setBackCoverImageUrl(image.url)
      toast.success('Visuel de couverture généré')
    } finally { setGenerating(false) }
  }
  return { generating, generateCover }
}
