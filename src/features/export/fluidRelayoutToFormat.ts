// src/features/export/fluidRelayoutToFormat.ts
// Orchestration du re-layout « fluide » par blocs : image source + descripteurs
// par objet → LLM (regroupe en blocs + place les blocs) → applyFluidBlocks.
// RETOMBE sur projectObjectsToFormat(...,'cover') (composition entière préservée)
// en cas d'échec/indisponibilité. Ne lève jamais.
import { generateJson } from '@/features/ai/llmRouter'
import { projectObjectsToFormat, type DeclineTarget } from './declineLayout'
import { buildDescriptors, type DesignObject } from './relayoutMultiFormat'
import { applyFluidBlocks, FluidSchema, fluidJsonSchema } from './fluidBlocks'

export interface FluidOutcome {
  objects: DesignObject[]
  usedFallback: boolean
}

const PROMPT = `Tu es directeur artistique. On te donne une AFFICHE/CRÉA (image de référence) et la liste de ses ÉLÉMENTS (index "i", "type", "role" éventuel, "text" éventuel, boîte source "xPct"/"yPct"/"wPct"/"hPct" en fractions [0..1] de la page source).

1) REGROUPE les éléments en 2 à 5 BLOCS cohérents — un bloc = des éléments qui forment une unité visuelle (le VISUEL PRODUIT et ce qui le recouvre, le bloc PRIX/PROMO, le bloc TEXTE, le FOND/CADRE). Chaque index "i" doit appartenir à EXACTEMENT un bloc.

2) Pour le FORMAT CIBLE (ratio différent de la source), PLACE chaque bloc : région "xPct"/"yPct" (coin haut-gauche, fractions [0..1] de la page CIBLE) et "wPct"/"hPct" (taille de la région). EXPLOITE l'espace selon l'orientation : en paysage, dispose les blocs CÔTE À CÔTE (ex. produit à gauche, prix/texte à droite) ; en portrait, EMPILE-les. Le bloc FOND/CADRE couvre toute la page (xPct=0,yPct=0,wPct=1,hPct=1). Préserve la hiérarchie (le prix reste proéminent, le logo petit). Ne fais pas déborder un bloc hors de la page.

Réponds UNIQUEMENT en JSON {"formats":[{"id":"<id format>","blocks":[{"indices":[…],"xPct":…,"yPct":…,"wPct":…,"hPct":…}]}]}.`

export async function fluidRelayoutToFormat(params: {
  imageDataUri: string
  objects: readonly DesignObject[]
  srcW: number
  srcH: number
  target: DeclineTarget
}): Promise<FluidOutcome> {
  const { imageDataUri, objects, srcW, srcH, target } = params
  const coverFallback = (): FluidOutcome => ({
    objects: projectObjectsToFormat(objects, srcW, srcH, target.w, target.h, 'cover'),
    usedFallback: true,
  })

  const descriptors = buildDescriptors(objects, srcW, srcH)
  if (descriptors.length === 0) return coverFallback()

  try {
    const prompt = `${PROMPT}

PAGE SOURCE : ${srcW}×${srcH} (ratio ${Math.round((srcW / srcH) * 100) / 100}).

FORMAT CIBLE : ${JSON.stringify({ id: target.id, label: target.label, w: target.w, h: target.h, ratio: Math.round((target.w / target.h) * 100) / 100 })}

ÉLÉMENTS :
${JSON.stringify(descriptors)}`

    const res = await generateJson({
      task: 'design.fluidRelayout',
      prompt,
      schema: FluidSchema,
      schemaForLLM: fluidJsonSchema,
      schemaForClaude: fluidJsonSchema,
      version: 'fluid-v1',
      imageDataUris: [imageDataUri],
    })
    const fmt = res.formats.find((f) => f.id === target.id) ?? res.formats[0]
    if (!fmt || fmt.blocks.length === 0) return coverFallback()
    return {
      objects: applyFluidBlocks(objects, srcW, srcH, target.w, target.h, fmt.blocks),
      usedFallback: false,
    }
  } catch (err) {
    console.warn('[fluidRelayoutToFormat] LLM indisponible, repli cover :', err)
    return coverFallback()
  }
}
