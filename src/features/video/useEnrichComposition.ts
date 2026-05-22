import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { enrichCompositionWithImages, type EnrichOptions } from './enrichCompositionWithImages'
import type { Composition } from './promptToComposition'

export interface EnrichInput {
  composition: Composition
  aspect: EnrichOptions['aspect']
  topic?: string
  brand?: string
}

export interface EnrichProgress {
  /** Nombre de scènes traitées (succès ou échec). */
  done: number
  /** Total des scènes à enrichir. */
  total: number
  /** Index de la dernière scène traitée. */
  lastSceneIndex?: number
}

export function useEnrichComposition() {
  const [progress, setProgress] = useState<EnrichProgress | null>(null)

  const mutation = useMutation<Composition, Error, EnrichInput>({
    mutationFn: async (input) => {
      setProgress({ done: 0, total: input.composition.scenes.length })
      return enrichCompositionWithImages({
        composition: input.composition,
        aspect: input.aspect,
        topic: input.topic,
        brand: input.brand,
        onProgress: (done, total, sceneIndex) => {
          setProgress({ done, total, lastSceneIndex: sceneIndex })
        },
      })
    },
    onSettled: () => {
      // Garde le progress visible 800ms avant de l'effacer pour laisser l'UI respirer.
      setTimeout(() => setProgress(null), 800)
    },
  })

  return {
    enrich: mutation.mutate,
    enriching: mutation.isPending,
    error: mutation.error,
    enriched: mutation.data,
    progress,
    reset: () => {
      mutation.reset()
      setProgress(null)
    },
  }
}
