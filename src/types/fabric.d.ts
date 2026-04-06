import 'fabric'

declare module 'fabric' {
  interface FabricObject {
    data?: {
      id?: string
      type?: string
      name?: string
      isGrid?: boolean
      isPageBg?: boolean
      [key: string]: unknown
    }
  }
}
