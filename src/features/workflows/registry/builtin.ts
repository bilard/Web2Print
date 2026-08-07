import { portTypeRegistry, registerBuiltinPorts } from '../runtime/ports'

// Side-effect imports register node specs into nodeRegistry
import './importNodes'
import './textInputNode'
import './scrapeNodes'
import './webSearchNode'
import './webAskNode'
import './gdriveNodes'
import './enrichmentNodes'
import './aiNodes'
import './transformationNodes'
import './persistenceNodes'
import './taxonomyNodes'
import './exportNodes'
import './logicNodes'
import './priceWatchNode'
import './priceWatchTrackNode'
import './sourceSitesNode'
import './harvestCompetitorNode'
import './visualMatchNode'
import './directedSearchNode'
import './compareCatalogNode'
import './listProductsNode'
import './crawlNode'
import './webScrapingNode' // node unifié (doit suivre les anciens : il les référence)
import './comparePricesNode'
import './chartNode'
import './costReportNode'
import './priceWatchReportNode'
import './sendWindowNode'
import './analyticsReportNode'
import './communicationNodes'
import './telegramNodes'
import './webhookNode'
import './approvalNode'
import './decomposeNode'
import './higgsfield'
import './browserActNode'
import './cronNodes'

let initialized = false

export function initWorkflowsRegistry(): void {
  if (initialized) return
  initialized = true
  if (portTypeRegistry.list().length === 0) registerBuiltinPorts()
  // Node specs are registered via the side-effect imports above.
}
