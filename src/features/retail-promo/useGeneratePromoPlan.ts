import { useState, useCallback } from 'react'
import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'
import { promoPlanJsonSchema, repairPromoPlan } from './promoPlan'
import { listPromoBlocks } from './blocks/registry'
import { nearestTemplate } from './templates'
import type { PromoLayout } from './promoTypes'
// Side-effect : enregistre les 8 blocs dans le registre (même mécanique que initWorkflowsRegistry)
import '@/features/retail-promo/blocks'

const PromoPlanZod = z.object({
  background: z.string().optional(),
  blocks: z.array(z.object({
    blockId: z.string(),
    xPct: z.number(), yPct: z.number(), wPct: z.number(), hPct: z.number(),
  })),
})

export function buildPromoPlanPrompt(args: {
  brief: string
  width: number
  height: number
  sample: Record<string, unknown>
  blocks: { id: string; label: string }[]
}): string {
  const cat = args.blocks.map((b) => `- ${b.id} : ${b.label}`).join('\n')
  return [
    `Tu es directeur artistique retail. Compose une affiche promo print ultra-lisible.`,
    `Format de page : ${args.width}×${args.height} px.`,
    `Brief : ${args.brief}`,
    `Produit-échantillon (placeholders disponibles) : ${JSON.stringify(args.sample)}`,
    `Blocs disponibles (utilise uniquement ces blockId) :\n${cat}`,
    `Réponds STRICTEMENT au schéma : un tableau "blocks" où chaque bloc a blockId + xPct,yPct,wPct,hPct exprimés en POURCENTAGE de page dans [0,1]. Hiérarchie : prix et remise dominants, lecture en Z.`,
  ].join('\n\n')
}

export function useGeneratePromoPlan() {
  const [isLoading, setLoading] = useState(false)

  const generate = useCallback(async (args: {
    brief: string
    width: number
    height: number
    sample: Record<string, unknown>
  }): Promise<PromoLayout> => {
    setLoading(true)
    const fallback = nearestTemplate(args.width, args.height)
    try {
      const blocks = listPromoBlocks().map((b) => ({ id: b.id, label: b.label }))
      const prompt = buildPromoPlanPrompt({ ...args, blocks })
      const raw = await generateJson({
        task: 'design.promoPlan',
        prompt,
        schema: PromoPlanZod,
        schemaForLLM: promoPlanJsonSchema,
        schemaForClaude: promoPlanJsonSchema,
        version: 'promo-plan-v1',
      })
      const merged = { ...fallback, ...raw, width: args.width, height: args.height }
      return repairPromoPlan(merged, fallback)
    } catch {
      return fallback // LLM indisponible/quota → repli template curé
    } finally {
      setLoading(false)
    }
  }, [])

  return { generate, isLoading }
}
