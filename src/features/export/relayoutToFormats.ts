// src/features/export/relayoutToFormats.ts
// Orchestration du re-layout multi-format : envoie l'image source + les descripteurs
// au LLM (1 seul appel pour tous les formats), applique le placement renvoyé, et
// RETOMBE sur projectObjectsToFormat (homothétie) en cas d'échec. Ne lève jamais.
import { generateJson } from '@/features/ai/llmRouter'
import { projectObjectsToFormat, type DeclineTarget } from './declineLayout'
import {
  buildDescriptors,
  buildRelayoutPrompt,
  applyRelayout,
  RelayoutSchema,
  relayoutJsonSchema,
  type DesignObject,
} from './relayoutMultiFormat'

export interface RelayoutOutcome {
  /** Objets transformés par id de format cible. */
  byFormat: Record<string, DesignObject[]>
  /** true si on a utilisé le repli géométrique (LLM indisponible/échec). */
  usedFallback: boolean
}

function geometricFallback(
  objects: readonly DesignObject[],
  srcW: number,
  srcH: number,
  targets: readonly DeclineTarget[],
): Record<string, DesignObject[]> {
  const out: Record<string, DesignObject[]> = {}
  for (const t of targets) out[t.id] = projectObjectsToFormat(objects, srcW, srcH, t.w, t.h)
  return out
}

export async function relayoutToFormats(params: {
  imageDataUri: string
  objects: readonly DesignObject[]
  srcW: number
  srcH: number
  targets: readonly DeclineTarget[]
}): Promise<RelayoutOutcome> {
  const { imageDataUri, objects, srcW, srcH, targets } = params
  const descriptors = buildDescriptors(objects, srcW, srcH)
  if (descriptors.length === 0) {
    return { byFormat: geometricFallback(objects, srcW, srcH, targets), usedFallback: true }
  }
  try {
    const res = await generateJson({
      task: 'design.relayoutMultiFormat',
      prompt: buildRelayoutPrompt(descriptors, targets, srcW, srcH),
      schema: RelayoutSchema,
      schemaForLLM: relayoutJsonSchema,
      schemaForClaude: relayoutJsonSchema,
      version: 'relayout-v1',
      imageDataUris: [imageDataUri],
    })
    const out: Record<string, DesignObject[]> = {}
    for (const t of targets) {
      const fmt = res.formats.find((f) => f.id === t.id)
      out[t.id] = fmt
        ? applyRelayout(objects, srcW, srcH, t.w, t.h, fmt.elements)
        : projectObjectsToFormat(objects, srcW, srcH, t.w, t.h)
    }
    return { byFormat: out, usedFallback: false }
  } catch (err) {
    console.warn('[relayoutToFormats] LLM indisponible, repli géométrique :', err)
    return { byFormat: geometricFallback(objects, srcW, srcH, targets), usedFallback: true }
  }
}
