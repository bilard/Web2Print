// Configuration du node « Sites sources » — gestionnaire central des sites
// concurrents d'une veille tarifaire.
//
// Type isolé du node : son panneau de configuration en a besoin, et le node
// importe le panneau. Sans ce module, les deux se référencent mutuellement.
import type { SourceSiteRow } from '@/features/priceWatch/sourceSites'

export interface SourceSitesNodeConfig {
  watchId: string
  sites: SourceSiteRow[]
}
