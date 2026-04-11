import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { deleteObject, listAll, ref as storageRef } from 'firebase/storage'
import { db, storage } from '@/lib/firebase/config'
import { generateJson } from '@/features/ai/llmRouter'
import {
  buildPrompt,
  RESPONSE_SCHEMA_FOR_GEMINI,
  CartResponseSchema,
  VERSION,
} from './prompts/cartGeneration.prompt'
import { filterValidSkus } from './skuGuardRail'
import { getProductCatalog } from '@/features/briefs/catalog/catalog.factory'
import { MockCatalogProvider } from '@/features/briefs/catalog/MockCatalogProvider'
import type {
  CatalogProduct,
  ProductCatalogProvider,
} from '@/features/briefs/catalog/ProductCatalogProvider'
import { extractCatalogKeywords } from './extractCatalogKeywords'
import type { Brief, CartItem } from '@/features/briefs/types'
import type { Taxonomy } from '@/features/taxonomy/types'
import { computeSubtotal } from '@/features/briefs/cart/cartMath'

export interface CartProgressEvent {
  step:
    | 'taxonomy'
    | 'keywords'
    | 'scraping'
    | 'fallback'
    | 'ai-select'
    | 'ai-retry'
    | 'save'
    | 'done'
    | 'error'
  message: string
  /** Données contextuelles utiles pour l'affichage (ex: liste de keywords, nb produits). */
  data?: Record<string, unknown>
}

interface Args {
  brief: Brief
  /** Callback optionnel : émet un événement de progression lisible par l'UI. */
  onProgress?: (event: CartProgressEvent) => void
}

export function useGenerateCart() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ brief, onProgress }: Args) => {
      const emit = (e: CartProgressEvent) => {
        try { onProgress?.(e) } catch { /* ignore */ }
      }

      // 1. Charge la taxonomie pour récupérer sourceUrl (si définie)
      emit({ step: 'taxonomy', message: 'Chargement de la nomenclature…' })
      let sourceUrl: string | undefined
      let nomenclatureName: string | undefined
      try {
        const taxSnap = await getDoc(doc(db, 'taxonomies', brief.taxonomyId))
        if (taxSnap.exists()) {
          const tax = taxSnap.data() as Taxonomy
          sourceUrl = tax.sourceUrl?.trim() || undefined
          nomenclatureName = tax.name
        }
      } catch (err) {
        console.warn('[useGenerateCart] impossible de charger la taxonomie', err)
      }
      emit({
        step: 'taxonomy',
        message: sourceUrl
          ? `Nomenclature "${nomenclatureName ?? '—'}" → source ${sourceUrl}`
          : `Aucune URL source — utilisation du catalogue mock`,
        data: { sourceUrl, nomenclatureName },
      })

      // 2. Si une sourceUrl est définie, extrait des mots-clés depuis le brief
      let keywords: string[] = []
      if (sourceUrl) {
        emit({ step: 'keywords', message: 'Extraction des mots-clés produit depuis le contexte du brief…' })
        keywords = await extractCatalogKeywords({
          clientValues: brief.client.values,
          answers: brief.dynamicForm?.answers ?? {},
          nomenclatureName,
        })
        emit({
          step: 'keywords',
          message: `Mots-clés retenus : ${keywords.length > 0 ? keywords.join(', ') : '(aucun)'}`,
          data: { keywords },
        })
      }

      // 3. Instancie le provider ; si le scraping échoue on retombe sur le mock.
      if (sourceUrl) {
        emit({ step: 'scraping', message: `Scraping en cours sur ${sourceUrl}…` })
      }
      let provider: ProductCatalogProvider = getProductCatalog({
        sourceUrl,
        keywords,
      })
      let catalog: CatalogProduct[] = []
      try {
        catalog = await provider.search({})
        if (sourceUrl) {
          emit({
            step: 'scraping',
            message: `${catalog.length} produit(s) récupéré(s) depuis le site source`,
            data: { count: catalog.length },
          })
        }
      } catch (err) {
        console.warn(
          '[useGenerateCart] scraping du catalogue échoué, fallback sur MockCatalogProvider',
          err,
        )
        emit({
          step: 'fallback',
          message: `Scraping échoué (${(err as Error).message || 'erreur inconnue'}) — bascule sur le catalogue mock`,
        })
        provider = new MockCatalogProvider()
        catalog = await provider.search({})
      }
      if (catalog.length === 0) {
        console.warn('[useGenerateCart] provider a renvoyé 0 produits, fallback mock')
        emit({ step: 'fallback', message: 'Aucun produit trouvé sur la source — bascule sur le mock' })
        provider = new MockCatalogProvider()
        catalog = await provider.search({})
      }

      const askGemini = async (extraInstruction?: string) => {
        let prompt = buildPrompt({
          clientValues: brief.client.values,
          answers: brief.dynamicForm?.answers ?? {},
          catalog,
        })
        if (extraInstruction) prompt += `\n\n${extraInstruction}`
        return generateJson({
          task: 'brief.cartGeneration',
          prompt,
          schema: CartResponseSchema,
          schemaForLLM: RESPONSE_SCHEMA_FOR_GEMINI,
          version: VERSION,
        })
      }

      // 1er essai
      emit({
        step: 'ai-select',
        message: `Sélection IA parmi ${catalog.length} produit(s)…`,
        data: { candidateCount: catalog.length },
      })
      let response = await askGemini()
      let guard = filterValidSkus(response.items, catalog.map((c) => c.sku))

      // Retry si trop d'hallucinations
      if (guard.shouldRetry) {
        emit({
          step: 'ai-retry',
          message: `Nouvelle tentative (${guard.invalidSkus.length} SKU inconnus au 1er essai)`,
          data: { invalidSkus: guard.invalidSkus },
        })
        response = await askGemini(
          `Attention : lors de ta première tentative, ${guard.invalidSkus.length} SKUs n'existaient pas dans le catalogue (${guard.invalidSkus.join(', ')}). Utilise UNIQUEMENT les SKUs présents dans le catalogue ci-dessus.`,
        )
        guard = filterValidSkus(response.items, catalog.map((c) => c.sku))
      }

      // Garde-fou contextuel : on rejette tout SKU dont la famille n'a pas été
      // déclarée pertinente par le LLM lui-même. Évite que le LLM "complète"
      // avec des produits hors-sujet (drapeaux pour un brief garage, etc.).
      const relevantFamilies = new Set(response.relevantFamilies ?? [])
      const offTopicSkus: string[] = []
      const filteredKept = guard.kept.filter((s) => {
        const product = catalog.find((c) => c.sku === s.sku)
        const family = (product?.attributes as { family?: string } | undefined)?.family
        if (family && relevantFamilies.size > 0 && !relevantFamilies.has(family)) {
          offTopicSkus.push(s.sku)
          return false
        }
        return true
      })

      if (offTopicSkus.length > 0) {
        console.warn(
          '[useGenerateCart] SKUs rejetés car hors familles pertinentes déclarées',
          { offTopicSkus, relevantFamilies: [...relevantFamilies] },
        )
      }

      const cartItems: CartItem[] = filteredKept.map((s) => {
        const product = catalog.find((c) => c.sku === s.sku) as CatalogProduct
        const attrs = (product.attributes ?? {}) as { sourceUrl?: string }
        // Firestore refuse les champs `undefined` → on n'inclut que ce qui est défini.
        const item: CartItem = {
          sku: product.sku,
          name: product.name,
          categoryNodeId: product.magentoCategoryIds?.[0] ?? '',
          quantity: s.quantity,
          unitPrice: product.price ?? 0,
          source: 'ai',
        }
        if (product.imageUrl) item.imageUrl = product.imageUrl
        if (attrs.sourceUrl) item.sourceUrl = attrs.sourceUrl
        if (product.description) item.description = product.description
        if (s.aiJustification) item.aiJustification = s.aiJustification
        return item
      })

      const subtotal = computeSubtotal(cartItems)

      emit({
        step: 'save',
        message: `Sauvegarde du panier (${cartItems.length} produits, sous-total ${subtotal.toFixed(2)} €)`,
      })
      await updateDoc(doc(db, 'briefs', brief.id), {
        'cart.items': cartItems,
        'cart.subtotal': subtotal,
        'cart.aiReasoning': response.reasoning,
        'aiVersions.cart': VERSION,
        updatedAt: serverTimestamp(),
      })

      // Nettoyage des images orphelines : on supprime les docs product_* dont
      // le SKU n'est plus dans le panier, ainsi que staging_scene (qui dépend
      // de tous les produits et doit être régénérée). hero est conservée.
      try {
        const keepIds = new Set<string>(['hero', ...cartItems.map((i) => `product_${i.sku}`)])
        const imagesSnap = await getDocs(collection(db, 'briefs', brief.id, 'images'))
        await Promise.all(
          imagesSnap.docs
            .filter((d) => !keepIds.has(d.id))
            .map((d) => deleteDoc(d.ref)),
        )
        // Purge storage : supprime tous les blobs dont le nom (sans extension)
        // n'est pas dans keepIds.
        const folderRef = storageRef(storage, `briefs/${brief.id}/images`)
        const listed = await listAll(folderRef).catch(() => null)
        if (listed) {
          await Promise.all(
            listed.items
              .filter((item) => {
                const base = item.name.replace(/\.[^.]+$/, '')
                return !keepIds.has(base)
              })
              .map((item) => deleteObject(item).catch(() => undefined)),
          )
        }
        qc.invalidateQueries({ queryKey: ['brief-images', brief.id] })
      } catch (err) {
        console.warn('[useGenerateCart] cleanup images orphelines échoué', err)
      }

      emit({ step: 'done', message: `Terminé — ${cartItems.length} produits dans le panier` })
      return {
        items: cartItems,
        reasoning: response.reasoning,
        droppedSkus: [...guard.invalidSkus, ...offTopicSkus],
        relevantFamilies: [...relevantFamilies],
        rejectedFamilies: response.rejectedFamilies ?? [],
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['brief', vars.brief.id] })
      qc.invalidateQueries({ queryKey: ['briefs'] })
    },
  })
}
