import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'
import { findPath } from './taxonomyUtils'
import type { Taxonomy } from './types'

export interface ProductClassificationInput {
  title?: string
  brand?: string
  description?: string
  sku?: string
  /** Fil d'Ariane scrapé depuis le site source (ex: ["Bricolage", "Outillage", "Perceuses"]). */
  sourceBreadcrumb?: string[]
  /** Catégorie taxonomique d'origine au format "A > B > C" (depuis colonnes taxonomy levels). */
  sourceCategoryPath?: string
  /** URL produit d'origine (utile pour donner du contexte au LLM). */
  sourceUrl?: string
}

export interface ProductClassificationResult {
  /** ID du nœud choisi. Chaîne vide si aucun match satisfaisant. */
  nodeId: string
  /** Confiance 0–1. */
  confidence: number
  /** 1–2 phrases expliquant le choix. */
  reasoning: string
}

const resultSchema = z.object({
  nodeId: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
})

const schemaForLLM: Record<string, unknown> = {
  type: 'object',
  properties: {
    nodeId: {
      type: 'string',
      description:
        "ID du nœud cible (recopié EXACTEMENT depuis la liste fournie). " +
        'Chaîne vide "" si aucun chemin ne correspond raisonnablement.',
    },
    confidence: {
      type: 'number',
      description: 'Confiance 0 à 1. < 0.5 = match faible, > 0.85 = match évident.',
      minimum: 0,
      maximum: 1,
    },
    reasoning: {
      type: 'string',
      description: '1–2 phrases en français expliquant le choix.',
    },
  },
  required: ['nodeId', 'confidence', 'reasoning'],
}

interface CandidateLine {
  id: string
  path: string
  isLeaf: boolean
}

function buildCandidates(taxonomy: Taxonomy): CandidateLine[] {
  const nodes = taxonomy.nodes
  const childCount = new Map<string, number>()
  for (const n of Object.values(nodes)) {
    if (n.parentId) childCount.set(n.parentId, (childCount.get(n.parentId) ?? 0) + 1)
  }
  return Object.values(nodes)
    .map((n) => {
      const ids = findPath(nodes, n.id)
      const path = ids.map((id) => nodes[id]?.label ?? '').filter(Boolean).join(' › ')
      return { id: n.id, path, isLeaf: (childCount.get(n.id) ?? 0) === 0 }
    })
    .sort((a, b) => a.path.localeCompare(b.path))
}

function formatProduct(input: ProductClassificationInput): string {
  const lines: string[] = []
  if (input.title) lines.push(`Titre : ${input.title}`)
  if (input.brand) lines.push(`Marque : ${input.brand}`)
  if (input.sku) lines.push(`Référence/SKU : ${input.sku}`)
  if (input.description) {
    const desc = input.description.length > 600 ? input.description.slice(0, 600) + '…' : input.description
    lines.push(`Description : ${desc}`)
  }
  if (input.sourceBreadcrumb && input.sourceBreadcrumb.length > 0) {
    lines.push(`Fil d'Ariane source : ${input.sourceBreadcrumb.join(' › ')}`)
  }
  if (input.sourceCategoryPath) lines.push(`Catégorie source (fichier) : ${input.sourceCategoryPath}`)
  if (input.sourceUrl) lines.push(`URL source : ${input.sourceUrl}`)
  return lines.join('\n')
}

export async function classifyProductInTaxonomy(
  taxonomy: Taxonomy,
  input: ProductClassificationInput,
): Promise<ProductClassificationResult> {
  const candidates = buildCandidates(taxonomy)
  if (candidates.length === 0) {
    return { nodeId: '', confidence: 0, reasoning: 'Taxonomie vide.' }
  }

  const productBlock = formatProduct(input)
  if (!productBlock.trim()) {
    return { nodeId: '', confidence: 0, reasoning: 'Aucune information produit exploitable.' }
  }

  const candidateLines = candidates
    .map((c) => `${c.id} | ${c.path}${c.isLeaf ? '' : ' (catégorie)'}`)
    .join('\n')

  const prompt = `Tu es un classificateur de produits e-commerce dans une taxonomie hiérarchique.
Choisis LE chemin LE PLUS SPÉCIFIQUE qui correspond au produit ci-dessous, parmi la liste de chemins disponibles.

RÈGLES IMPÉRATIVES :
- Privilégie les feuilles (chemins les plus profonds) quand un match clair existe.
- Si plusieurs feuilles d'une même branche conviennent, choisis la plus spécifique.
- Si aucune feuille ne convient mais une catégorie intermédiaire fait sens, prends-la.
- Si vraiment rien ne correspond, renvoie nodeId="" avec confidence faible.
- Le « Fil d'Ariane source » est un signal FORT mais ne doit pas remplacer la sémantique cible :
  mappe-le sur la taxonomie cible (un libellé proche dans la cible bat un libellé exact dans la source).
- Ne retourne JAMAIS un nodeId qui n'est pas dans la liste ci-dessous.

═══ PRODUIT ═══
${productBlock}

═══ TAXONOMIE CIBLE : « ${taxonomy.name} » (${candidates.length} chemins) ═══
Format : ID | chemin
${candidateLines}

Réponds via l'outil emit_response avec { nodeId, confidence (0-1), reasoning (1-2 phrases en français) }.`

  return generateJson({
    task: 'product.taxonomyClassification',
    prompt,
    schema: resultSchema,
    schemaForLLM,
    version: 'taxonomy.classify.v1',
  })
}
