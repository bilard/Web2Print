import { useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { generateImage } from './geminiImageClient'
import { uploadBriefImage } from '@/features/briefs/storage/briefImagesStorage'
import { buildHeroImagePrompt, buildProductImagePrompt } from './imagePromptBuilder'
import type { Brief } from '@/features/briefs/types'

interface Args {
  brief: Brief
  /** Callback de progression : appelé après chaque image générée. */
  onProgress?: (info: { done: number; total: number; currentLabel: string }) => void
}

interface BatchResult {
  generated: string[]
  failed: { id: string; error: string }[]
}

/**
 * Génère séquentiellement le hero + une image par produit du panier.
 * Continue sur erreur (chaque échec est listé dans `failed`).
 */
export function useGenerateAllBriefImages() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ brief, onProgress }: Args): Promise<BatchResult> => {
      const items = brief.cart?.items ?? []
      const total = 1 + items.length
      const generated: string[] = []
      const failed: { id: string; error: string }[] = []
      let done = 0

      const runOne = async (
        id: string,
        label: string,
        type: 'hero' | 'product',
        prompt: string,
        productSku?: string,
      ) => {
        try {
          const { blob, mimeType } = await generateImage(prompt)
          const url = await uploadBriefImage(brief.id, id, blob, mimeType)
          await setDoc(doc(db, 'briefs', brief.id, 'images', id), {
            id,
            type,
            productSku,
            prompt,
            url,
            updatedAt: serverTimestamp(),
          })
          generated.push(id)
        } catch (err) {
          failed.push({ id, error: (err as Error).message })
        } finally {
          done += 1
          onProgress?.({ done, total, currentLabel: label })
        }
      }

      // 1) Hero
      await runOne('hero', 'Image hero', 'hero', buildHeroImagePrompt(brief))

      // 2) Une image par produit
      for (const item of items) {
        await runOne(
          `product_${item.sku}`,
          item.name,
          'product',
          buildProductImagePrompt(brief, item),
          item.sku,
        )
      }

      return { generated, failed }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['brief-images', vars.brief.id] })
    },
  })
}
