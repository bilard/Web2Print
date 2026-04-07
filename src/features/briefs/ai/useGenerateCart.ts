import { useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { generateJson } from './geminiClient'
import {
  buildPrompt,
  RESPONSE_SCHEMA_FOR_GEMINI,
  CartResponseSchema,
  VERSION,
} from './prompts/cartGeneration.prompt'
import { filterValidSkus } from './skuGuardRail'
import { getProductCatalog } from '@/features/briefs/catalog/catalog.factory'
import type { CatalogProduct } from '@/features/briefs/catalog/ProductCatalogProvider'
import type { Brief, CartItem } from '@/features/briefs/types'
import { computeSubtotal } from '@/features/briefs/cart/cartMath'

interface Args {
  brief: Brief
}

export function useGenerateCart() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ brief }: Args) => {
      const provider = getProductCatalog()
      // Pour le MVP on récupère tout le catalogue (mock = 5 produits).
      // Au lot Magento on filtrera par selectedNodeIds → magentoCategoryIds.
      const catalog = await provider.search({})

      const askGemini = async (extraInstruction?: string) => {
        let prompt = buildPrompt({
          clientValues: brief.client.values,
          answers: brief.dynamicForm?.answers ?? {},
          catalog,
        })
        if (extraInstruction) prompt += `\n\n${extraInstruction}`
        return generateJson({
          prompt,
          schema: CartResponseSchema,
          schemaForGemini: RESPONSE_SCHEMA_FOR_GEMINI,
          version: VERSION,
        })
      }

      // 1er essai
      let response = await askGemini()
      let guard = filterValidSkus(response.items, catalog.map((c) => c.sku))

      // Retry si trop d'hallucinations
      if (guard.shouldRetry) {
        response = await askGemini(
          `Attention : lors de ta première tentative, ${guard.invalidSkus.length} SKUs n'existaient pas dans le catalogue (${guard.invalidSkus.join(', ')}). Utilise UNIQUEMENT les SKUs présents dans le catalogue ci-dessus.`,
        )
        guard = filterValidSkus(response.items, catalog.map((c) => c.sku))
      }

      const cartItems: CartItem[] = guard.kept.map((s) => {
        const product = catalog.find((c) => c.sku === s.sku) as CatalogProduct
        return {
          sku: product.sku,
          name: product.name,
          categoryNodeId: product.magentoCategoryIds?.[0] ?? '',
          quantity: s.quantity,
          unitPrice: product.price,
          imageUrl: product.imageUrl,
          description: product.description,
          aiJustification: s.aiJustification,
          source: 'ai',
        }
      })

      const subtotal = computeSubtotal(cartItems)

      await updateDoc(doc(db, 'briefs', brief.id), {
        'cart.items': cartItems,
        'cart.subtotal': subtotal,
        'cart.aiReasoning': response.reasoning,
        'aiVersions.cart': VERSION,
        updatedAt: serverTimestamp(),
      })

      return { items: cartItems, reasoning: response.reasoning, droppedSkus: guard.invalidSkus }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['brief', vars.brief.id] })
      qc.invalidateQueries({ queryKey: ['briefs'] })
    },
  })
}
