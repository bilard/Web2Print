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

1) REGROUPE les éléments en 2 ou 3 BLOCS MAXIMUM (vise 3). Chaque index "i" dans EXACTEMENT un bloc. Règles de regroupement STRICTES :
   - Bloc PRIX/PROMO : TOUS les éléments promotionnels qui se chevauchent ou se touchent (le prix, le "%" de remise, les bulles/pastilles, les mentions "OFFRE"/"GRATUIT"/"+Xg") vont ENSEMBLE dans le MÊME bloc. NE SÉPARE JAMAIS un prix de son badge de remise.
   - Bloc PRODUIT : la photo/visuel produit + le logo + le contenant (ex. "150 ml"). Le FOND/CADRE pleine page va aussi avec (ou en bloc dédié couvrant toute la page).
   - Bloc TEXTE : les libellés/champs de fusion ({{...}}, titre, marque, description).

2) Pour le FORMAT CIBLE (ratio différent), PLACE chaque bloc : région "xPct"/"yPct" (coin haut-gauche) + "wPct"/"hPct" (taille), fractions [0..1] de la page CIBLE. IMPÉRATIFS :
   - REMPLIS la page de façon ÉQUILIBRÉE : agrandis les blocs pour OCCUPER l'espace, PAS de grands vides. La somme des blocs doit couvrir l'essentiel de la page.
   - En PAYSAGE : dispose les blocs CÔTE À CÔTE (ex. produit à gauche ~50%, prix en haut-droite, texte en bas-droite). En PORTRAIT : EMPILE-les.
   - Le bloc FOND/CADRE couvre toute la page (xPct=0,yPct=0,wPct=1,hPct=1).
   - Préserve la hiérarchie (prix gros et proéminent, logo petit). Ne fais JAMAIS déborder un bloc (0 ≤ xPct, xPct+wPct ≤ 1, idem y).

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
