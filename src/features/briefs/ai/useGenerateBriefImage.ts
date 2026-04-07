import { useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { generateImage } from './geminiImageClient'
import { uploadBriefImage } from '@/features/briefs/storage/briefImagesStorage'
import type { Brief, CartItem } from '@/features/briefs/types'
import { buildHeroImagePrompt, buildProductImagePrompt } from './imagePromptBuilder'

type Target = { kind: 'hero' } | { kind: 'product'; item: CartItem }

interface Args {
  brief: Brief
  target: Target
}

function imageIdFor(target: Target): string {
  return target.kind === 'hero' ? 'hero' : `product_${target.item.sku}`
}

function promptFor(brief: Brief, target: Target): string {
  return target.kind === 'hero'
    ? buildHeroImagePrompt(brief)
    : buildProductImagePrompt(brief, target.item)
}

/**
 * Génère UNE image (hero ou produit) via Gemini, l'upload sur Storage,
 * et persiste les métadonnées dans la sous-collection briefs/{id}/images.
 * Régénération = écrasement (clé naturelle = imageId).
 */
export function useGenerateBriefImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ brief, target }: Args) => {
      const id = imageIdFor(target)
      const prompt = promptFor(brief, target)
      const { blob, mimeType } = await generateImage(prompt)
      const url = await uploadBriefImage(brief.id, id, blob, mimeType)

      await setDoc(doc(db, 'briefs', brief.id, 'images', id), {
        id,
        type: target.kind,
        productSku: target.kind === 'product' ? target.item.sku : undefined,
        prompt,
        url,
        updatedAt: serverTimestamp(),
      })

      return { id, url }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['brief-images', vars.brief.id] })
    },
  })
}
