import 'fabric'
import type { TextMetadata } from '@/features/svg/svgTextParser'

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
      [key: string]: unknown
    }
  }
}
