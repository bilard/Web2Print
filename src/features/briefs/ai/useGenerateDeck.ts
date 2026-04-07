import { useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { generateJson } from './geminiClient'
import {
  buildPrompt,
  RESPONSE_SCHEMA_FOR_GEMINI,
  DeckResponseSchema,
  VERSION,
} from './prompts/deckStructure.prompt'
import type { Brief } from '@/features/briefs/types'

interface Args {
  brief: Brief
}

export function useGenerateDeck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ brief }: Args) => {
      const prompt = buildPrompt({ brief })
      const result = await generateJson({
        prompt,
        schema: DeckResponseSchema,
        schemaForGemini: RESPONSE_SCHEMA_FOR_GEMINI,
        version: VERSION,
      })

      // Filtre les SKUs cités qui n'existent pas dans le panier (sécurité)
      const cartSkus = new Set(brief.cart?.items.map((it) => it.sku) ?? [])
      const cleanedSlides = result.slides.map((s) => {
        if (s.type === 'product_grid') {
          return { ...s, productSkus: s.productSkus.filter((k) => cartSkus.has(k)) }
        }
        return s
      })

      await updateDoc(doc(db, 'briefs', brief.id), {
        'deck.slides': cleanedSlides,
        'aiVersions.deck': VERSION,
        updatedAt: serverTimestamp(),
      })

      return { slides: cleanedSlides, reasoning: result.reasoning }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['brief', vars.brief.id] })
    },
  })
}
