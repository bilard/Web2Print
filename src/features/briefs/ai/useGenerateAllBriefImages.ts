import { useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { generateImage, type ReferenceImage } from './geminiImageClient'
import { uploadBriefImage } from '@/features/briefs/storage/briefImagesStorage'
import { composeImagePrompt } from './composeImagePrompt'
import { inferSceneDescription } from './inferSceneDescription'
import { loadBrandKitReferences } from './brandKitLoader'
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
 * Génère séquentiellement : hero + 1 image par produit du panier + 1 image
 * unique de mise en situation 3D (staging scene) regroupant tous les produits
 * personnalisés à la charte. Chaque appel Nano Banana 2 reçoit en références
 * les logos / éléments visuels du kit de communication client.
 *
 * Continue sur erreur (chaque échec est listé dans `failed`).
 */
export function useGenerateAllBriefImages() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ brief, onProgress }: Args): Promise<BatchResult> => {
      const items = brief.cart?.items ?? []
      const total = 1 + items.length + (items.length > 0 ? 1 : 0)
      const generated: string[] = []
      const failed: { id: string; error: string }[] = []
      let done = 0

      // Charge une fois le kit de communication en images de référence,
      // réutilisées pour toutes les générations de la boucle.
      const brandKit = (brief.client.values as Record<string, unknown>).brandKit as
        | Parameters<typeof loadBrandKitReferences>[0]
        | undefined
      let refs: ReferenceImage[] = []
      try {
        refs = await loadBrandKitReferences(brandKit)
      } catch (err) {
        console.warn('[generateAllImages] kit com non chargé:', err)
      }

      // Décor unique pour tout le batch : appel Gemini avec Google Search
      // grounding pour décrire précisément l'événement/lieu du brief.
      const scene = await inferSceneDescription(brief)

      interface Job {
        id: string
        label: string
        type: 'hero' | 'product' | 'staging_scene'
        productSku?: string
        buildPrompt: () => Promise<string>
      }

      const jobs: Job[] = [
        {
          id: 'hero',
          label: 'Image hero',
          type: 'hero',
          buildPrompt: () => composeImagePrompt(brief, { kind: 'hero' }, scene),
        },
        ...items.map<Job>((item) => ({
          id: `product_${item.sku}`,
          label: item.name,
          type: 'product',
          productSku: item.sku,
          buildPrompt: () => composeImagePrompt(brief, { kind: 'product', item }, scene),
        })),
        ...(items.length > 0
          ? [
              {
                id: 'staging_scene',
                label: 'Mise en situation 3D',
                type: 'staging_scene' as const,
                buildPrompt: () =>
                  composeImagePrompt(brief, { kind: 'staging_scene', items }, scene),
              },
            ]
          : []),
      ]

      const runOne = async (job: Job) => {
        try {
          const prompt = await job.buildPrompt()
          const { blob, mimeType } = await generateImage(prompt, refs)
          const url = await uploadBriefImage(brief.id, job.id, blob, mimeType)
          await setDoc(doc(db, 'briefs', brief.id, 'images', job.id), {
            id: job.id,
            type: job.type,
            productSku: job.productSku ?? null,
            prompt,
            url,
            updatedAt: serverTimestamp(),
          })
          generated.push(job.id)
        } catch (err) {
          console.error(`[generateAllImages] échec ${job.id}:`, err)
          failed.push({ id: job.id, error: (err as Error).message })
        } finally {
          done += 1
          onProgress?.({ done, total, currentLabel: job.label })
        }
      }

      // Exécution par vagues parallèles (concurrence 3) — reste sous les rate
      // limits Gemini Image (qui autorisent plus mais 3 est un plafond safe
      // même en comptes gratuits) et divise le temps total par ~3.
      const CONCURRENCY = 3
      for (let i = 0; i < jobs.length; i += CONCURRENCY) {
        const batch = jobs.slice(i, i + CONCURRENCY)
        await Promise.allSettled(batch.map(runOne))
      }

      return { generated, failed }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['brief-images', vars.brief.id] })
    },
  })
}
