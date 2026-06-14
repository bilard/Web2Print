// src/features/export/fluidBlocks.ts
// Re-layout « fluide » par BLOCS. L'IA regroupe les éléments en blocs cohérents
// et place chaque bloc ; ICI on applique UNE SEULE affine par bloc (contain dans
// sa région) → la composition INTERNE d'un bloc est verrouillée (pas d'éparpillement
// possible). Module PUR (aucune dépendance Fabric/React). Schémas pour le LLM.
import { z } from 'zod'
import { projectObjectsToFormat } from './declineLayout'
import type { DesignObject } from './relayoutMultiFormat'

/** Bloc placé par le LLM : indices des objets + région cible (fractions [0..1]). */
export interface FluidBlock {
  indices: number[]
  xPct: number
  yPct: number
  wPct: number
  hPct: number
}

/** Schéma Zod (structure ; bornes clampées à l'application). */
export const FluidSchema = z.object({
  formats: z.array(
    z.object({
      id: z.string(),
      blocks: z.array(
        z.object({
          indices: z.array(z.number().int()),
          xPct: z.number(),
          yPct: z.number(),
          wPct: z.number(),
          hPct: z.number(),
        }),
      ),
    }),
  ),
})

/** JSON Schema (Gemini responseSchema / Claude input_schema). */
export const fluidJsonSchema = {
  type: 'object',
  properties: {
    formats: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          blocks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                indices: { type: 'array', items: { type: 'integer' } },
                xPct: { type: 'number' },
                yPct: { type: 'number' },
                wPct: { type: 'number' },
                hPct: { type: 'number' },
              },
              required: ['indices', 'xPct', 'yPct', 'wPct', 'hPct'],
            },
          },
        },
        required: ['id', 'blocks'],
      },
    },
  },
  required: ['formats'],
} as const

const clamp = (n: number, lo: number, hi: number): number =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo

/**
 * Applique le placement par bloc. Pour chaque bloc : bbox source de ses objets →
 * contain dans la région cible → MÊME facteur d'échelle + translation pour TOUS
 * ses objets (compo interne intacte). Objets sans bloc OU bloc à bbox nulle →
 * repli cover (`projectObjectsToFormat(...,'cover')`). Sources non mutées.
 */
export function applyFluidBlocks<T extends DesignObject>(
  objects: readonly T[],
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  blocks: readonly FluidBlock[],
): T[] {
  const result = objects.map((o) => o) // placeholders, remplacés ci-dessous
  const assigned = new Set<number>()

  for (const b of blocks) {
    const idxs = b.indices.filter((i) => i >= 0 && i < objects.length && !assigned.has(i))
    if (idxs.length === 0) continue
    // bbox source du bloc
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const i of idxs) {
      const o = objects[i]
      const ox = o.left ?? 0
      const oy = o.top ?? 0
      const ow = (o.width ?? 0) * (o.scaleX ?? 1)
      const oh = (o.height ?? 0) * (o.scaleY ?? 1)
      x0 = Math.min(x0, ox); y0 = Math.min(y0, oy)
      x1 = Math.max(x1, ox + ow); y1 = Math.max(y1, oy + oh)
    }
    const bw = x1 - x0
    const bh = y1 - y0
    if (!(bw > 0) || !(bh > 0)) continue // bbox nulle → laissés au repli cover
    const rx = clamp(b.xPct, 0, 1) * dstW
    const ry = clamp(b.yPct, 0, 1) * dstH
    const rw = Math.max(clamp(b.wPct, 0, 1), 0.01) * dstW
    const rh = Math.max(clamp(b.hPct, 0, 1), 0.01) * dstH
    const s = Math.min(rw / bw, rh / bh)
    const offX = rx + (rw - bw * s) / 2
    const offY = ry + (rh - bh * s) / 2
    for (const i of idxs) {
      const o = objects[i]
      result[i] = {
        ...o,
        left: ((o.left ?? 0) - x0) * s + offX,
        top: ((o.top ?? 0) - y0) * s + offY,
        scaleX: (o.scaleX ?? 1) * s,
        scaleY: (o.scaleY ?? 1) * s,
      }
      assigned.add(i)
    }
  }

  // Objets non assignés (aucun bloc, ou bloc à bbox nulle) → repli cover.
  return result.map((o, i) =>
    assigned.has(i) ? o : projectObjectsToFormat([objects[i]], srcW, srcH, dstW, dstH, 'cover')[0],
  )
}
