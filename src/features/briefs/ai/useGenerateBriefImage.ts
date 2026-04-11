import { useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { generateImage } from './geminiImageClient'
import { uploadBriefImage } from '@/features/briefs/storage/briefImagesStorage'
import { loadBrandKitReferences } from './brandKitLoader'
import type { Brief, CartItem } from '@/features/briefs/types'
import { composeImagePrompt, type ImageTarget } from './composeImagePrompt'
import { inferSceneDescription } from './inferSceneDescription'

type Target =
  | { kind: 'hero' }
  | { kind: 'product'; item: CartItem }
  | { kind: 'staging_scene' }

interface Args {
  brief: Brief
  target: Target
}

function imageIdFor(target: Target): string {
  if (target.kind === 'hero') return 'hero'
  if (target.kind === 'staging_scene') return 'staging_scene'
  return `product_${target.item.sku}`
}

function toComposeTarget(brief: Brief, target: Target): ImageTarget {
  if (target.kind === 'hero') return { kind: 'hero' }
  if (target.kind === 'staging_scene')
    return { kind: 'staging_scene', items: brief.cart?.items ?? [] }
  return { kind: 'product', item: target.item }
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
      const scene = await inferSceneDescription(brief)
      const prompt = await composeImagePrompt(brief, toComposeTarget(brief, target), scene)
      const brandKit = (brief.client.values as Record<string, unknown>).brandKit as
        | Parameters<typeof loadBrandKitReferences>[0]
        | undefined
      const refs = await loadBrandKitReferences(brandKit).catch(() => [])
      const { blob, mimeType } = await generateImage(prompt, refs)
      const url = await uploadBriefImage(brief.id, id, blob, mimeType)

      await setDoc(doc(db, 'briefs', brief.id, 'images', id), {
        id,
        type: target.kind,
        productSku: target.kind === 'product' ? target.item.sku : null,
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
