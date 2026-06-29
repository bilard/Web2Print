import type { Object as FabricObject } from 'fabric'
import type { ConditionalRule } from '@/features/merge/conditionalRules'
import type { PromoBlockId, PlacedBlock } from '../promoTypes'

interface BlockBuildCtx {
  x: number
  y: number
  w: number
  h: number
  /** Couleurs de la palette, toutes résolues (non optionnelles). */
  palette: Required<NonNullable<PlacedBlock['palette']>>
  fontFamily: string
  resolvedTheme: 'light' | 'dark'
}

export interface PromoBlockDef {
  id: PromoBlockId
  label: string
  /** Règles portées par ce bloc (metadata + runtime via data.conditionalRules). */
  conditionalRules: ConditionalRule[]
  build(ctx: BlockBuildCtx): FabricObject
}
