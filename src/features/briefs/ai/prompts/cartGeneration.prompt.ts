import { z } from 'zod'
import type { CatalogProduct } from '@/features/briefs/catalog/ProductCatalogProvider'

export const VERSION = 'cart-generation-2026-04-08-2'

const CartItemSuggestionSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  aiJustification: z.string().min(1),
})

export const CartResponseSchema = z.object({
  /** Familles de la nomenclature jugées pertinentes pour ce brief, dans l'ordre de priorité. */
  relevantFamilies: z.array(z.string()).min(1).max(9),
  /** Familles explicitement écartées + raison courte (force le LLM à raisonner par exclusion). */
  rejectedFamilies: z.array(z.object({ family: z.string(), reason: z.string() })),
  items: z.array(CartItemSuggestionSchema).min(1).max(20),
  reasoning: z.string(),
})

export const RESPONSE_SCHEMA_FOR_GEMINI = {
  type: 'object',
  properties: {
    relevantFamilies: { type: 'array', items: { type: 'string' } },
    rejectedFamilies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          family: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['family', 'reason'],
      },
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sku: { type: 'string' },
          quantity: { type: 'integer' },
          aiJustification: { type: 'string' },
        },
        required: ['sku', 'quantity', 'aiJustification'],
      },
    },
    reasoning: { type: 'string' },
  },
  required: ['relevantFamilies', 'rejectedFamilies', 'items', 'reasoning'],
}

interface BuildOpts {
  clientValues: Record<string, unknown>
  answers: Record<string, unknown>
  catalog: CatalogProduct[]
}

/**
 * Mélange déterministe (Fisher-Yates seedé) pour casser le biais d'ordre du catalogue
 * sans introduire d'aléa entre deux runs identiques.
 */
function stableShuffle<T>(arr: T[], seed: string): T[] {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  const rng = () => {
    h = (h * 16807) % 2147483647
    return (h & 0x7fffffff) / 0x7fffffff
  }
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function buildPrompt({ clientValues, answers, catalog }: BuildOpts): string {
  // Liste compacte et exhaustive des 9 familles de la nomenclature.
  const families = Array.from(
    new Set(
      catalog
        .map((p) => (p.attributes as { family?: string } | undefined)?.family)
        .filter((f): f is string => !!f),
    ),
  )

  // Mélange l'ordre du catalogue pour casser le biais "drapeaux d'abord".
  const seed = JSON.stringify(clientValues) + JSON.stringify(answers)
  const shuffled = stableShuffle(catalog, seed)

  const catalogSummary = shuffled
    .map((p) => {
      const family = (p.attributes as { family?: string } | undefined)?.family ?? '—'
      const category = (p.attributes as { category?: string } | undefined)?.category ?? '—'
      return `- [${family} > ${category}] ${p.sku} | ${p.name} | ${p.price.toFixed(2)} € | ${p.description.slice(0, 120)}`
    })
    .join('\n')

  const clientUrl = typeof clientValues.clientWebsiteUrl === 'string' && clientValues.clientWebsiteUrl.trim()
    ? `\nURL du site client : ${clientValues.clientWebsiteUrl.trim()} — utilise-la comme contexte pour inférer l'univers visuel, le ton et les activités du client si les autres champs sont lacunaires.\n`
    : ''

  return `Tu es un expert commercial en signalétique, PLV et mobilier urbain. Tu construis un panier sur-mesure pour un client.${clientUrl}

⚠️ RÈGLE ABSOLUE DE PERTINENCE CONTEXTUELLE ⚠️
Tu DOIS proposer uniquement des produits DIRECTEMENT cohérents avec le contexte du client.
Exemple : si le client parle d'un GARAGE, tu ne proposes PAS de drapeaux, kakémonos, guirlandes ou beach flags — tu proposes du mobilier urbain (poteaux, miroirs de sécurité, signalétique de stationnement, rangement vélos, barrières de parking, etc.).
Exemple : si le client est une MAIRIE qui prépare des élections, tu proposes des urnes, isoloirs, panneaux électoraux — pas du mobilier de réception.
Exemple : si le client est un ÉVÉNEMENT SPORTIF, tu proposes beach flags, barnums, podiums — pas de la signalétique routière.

Tu ne piocheras JAMAIS un produit "par défaut" sans justification métier explicite.

────────────────────────────────────────
BRIEF CLIENT (lis attentivement, c'est ta source de vérité) :
${JSON.stringify(clientValues, null, 2)}

RÉPONSES COMPLÉMENTAIRES :
${JSON.stringify(answers, null, 2)}
────────────────────────────────────────

FAMILLES DISPONIBLES dans la nomenclature (9 au total) :
${families.map((f) => `  • ${f}`).join('\n')}

CATALOGUE COMPLET (ordre mélangé pour éviter tout biais — ${catalog.length} produits) :
${catalogSummary}

────────────────────────────────────────
PROCÉDURE OBLIGATOIRE en 3 étapes :

ÉTAPE 1 — relevantFamilies
   Identifie 1 à 4 familles de la nomenclature qui correspondent VRAIMENT au besoin client.
   Sois sélectif : un brief "garage" ne doit cocher que "Mobilier urbain" et éventuellement "Balisage - Sécurité".
   Un brief "mairie élections" ne doit cocher que "Élections - Cérémonies".

ÉTAPE 2 — rejectedFamilies
   Liste au moins 2 familles que tu écartes explicitement, avec une raison courte (1 phrase).
   Ce raisonnement par exclusion t'oblige à justifier la pertinence.

ÉTAPE 3 — items (3 à 8 produits)
   Pour chaque produit choisi :
   • le SKU DOIT exister exactement dans le catalogue ci-dessus (n'invente RIEN)
   • la famille du produit DOIT figurer dans relevantFamilies
   • la justification (aiJustification) DOIT relier explicitement le produit au contexte client (ex : "Pour signaler les places PMR du parking du garage")
   • la quantité doit être cohérente (nombre de places, surface, points de vente, etc.)

reasoning : 2-3 phrases qui décrivent ton raisonnement global de construction du panier.

Si AUCUN produit du catalogue ne correspond au besoin, dis-le dans reasoning et propose les 3 produits les plus proches en l'expliquant — ne remplis pas avec du remplissage générique.

Réponds en JSON strict conforme au schéma demandé.`
}
