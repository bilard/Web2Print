import type { PromoLayout, PlacedBlock, PromoBlockId } from './promoTypes'

export const PROMO_BLOCK_IDS: readonly PromoBlockId[] = [
  'prix-barre', 'badge-remise', 'bandeau-lot', 'bandeau-validite',
  'mentions', 'badge-statut', 'cadre-photo', 'accroche',
]

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

function isPlacedBlock(b: unknown): b is PlacedBlock {
  if (!b || typeof b !== 'object') return false
  const o = b as Record<string, unknown>
  return (
    PROMO_BLOCK_IDS.includes(o.blockId as PromoBlockId) &&
    ['xPct', 'yPct', 'wPct', 'hPct'].every((k) => typeof o[k] === 'number' && Number.isFinite(o[k]))
  )
}

export function validatePromoPlan(raw: unknown): raw is PromoLayout {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  return (
    typeof o.width === 'number' && typeof o.height === 'number' &&
    typeof o.background === 'string' &&
    Array.isArray(o.blocks) && o.blocks.length > 0 && o.blocks.every(isPlacedBlock)
  )
}

export function repairPromoPlan(raw: unknown, fallback: PromoLayout): PromoLayout {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const blocks = Array.isArray(o.blocks)
    ? o.blocks.filter(isPlacedBlock).map((b) => ({
        ...b,
        xPct: clamp01(b.xPct), yPct: clamp01(b.yPct),
        wPct: clamp01(b.wPct), hPct: clamp01(b.hPct),
      }))
    : []
  if (blocks.length === 0) return { ...fallback }
  return {
    id: typeof o.id === 'string' ? o.id : fallback.id,
    label: typeof o.label === 'string' ? o.label : fallback.label,
    width: typeof o.width === 'number' ? o.width : fallback.width,
    height: typeof o.height === 'number' ? o.height : fallback.height,
    background: typeof o.background === 'string' ? o.background : fallback.background,
    blocks,
  }
}

/** Schéma JSON pour l'appel LLM (Claude/Gemini structuré) — tâche 8. (export ajouté à T8) */
const promoPlanJsonSchema = {
  type: 'object',
  required: ['blocks'],
  properties: {
    background: { type: 'string', description: 'Couleur de fond hex, ex #ffffff' },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['blockId', 'xPct', 'yPct', 'wPct', 'hPct'],
        properties: {
          blockId: { type: 'string', enum: [...PROMO_BLOCK_IDS] },
          xPct: { type: 'number' }, yPct: { type: 'number' },
          wPct: { type: 'number' }, hPct: { type: 'number' },
        },
      },
    },
  },
} as const
