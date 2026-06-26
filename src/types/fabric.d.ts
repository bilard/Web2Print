import 'fabric'
import type { TextMetadata } from '@/features/svg/svgTextParser'
import type { ConditionalRule } from '@/features/merge/conditionalRules'

declare module 'fabric' {
  interface FabricObject {
    data?: {
      id?: string
      type?: string
      name?: string
      isGrid?: boolean
      isPageBg?: boolean
      originalWidth?: number
      svgTextMetadata?: TextMetadata
      /** Règles conditionnelles d'affichage/transformation (cf. features/merge/conditionalRules). */
      conditionalRules?: ConditionalRule[]
      [key: string]: unknown
    }
  }
}
