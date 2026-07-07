import type { HelpSection } from './types'
import { gettingStarted } from './getting-started'
import { nouveautesSection } from './nouveautes'
import { onboardingSection } from './onboarding'
import { navigationSection } from './navigation'
import { editorSection } from './editor'
import { conditionalRulesSection } from './conditional-rules'
import { damSection } from './dam'
import { importIdmlSection } from './import-idml'
import { easyCatalogSection } from './easycatalog'
import { indesignXmlSection } from './indesign-xml'
import { importPptxSection } from './import-pptx'
import { importExcelSection } from './import-excel'
import { importImageSection } from './import-image'
import { importSvgSection } from './import-svg'
import { importImageToSvgSection } from './import-image-to-svg'
import { importPdfToSvgSection } from './import-pdf-to-svg'
import { pimSection } from './pim'
import { taxonomiesSection } from './taxonomies'
import { briefsSection } from './briefs'
import { scrapingSection } from './scraping'
import { scrapingTemplatesSection } from './scraping-templates'
import { scrapingHubSection } from './scraping-hub'
import { priceWatchSection } from './price-watch'
import { retailPromoSection } from './retail-promo'
import { catalogSection } from './catalog'
import { exportSection } from './export'
import { telegramSection } from './telegram'
import { workflowSection } from './workflow'
import { hyperframesSection } from './hyperframes'
import { chatSection } from './chat'
import { accessSection } from './access'
import { auditLogSection } from './audit-log'
import { settingsSection } from './settings'
import { explorerSection } from './explorer'

export const helpSections: HelpSection[] = [
  gettingStarted,
  nouveautesSection,
  onboardingSection,
  navigationSection,
  editorSection,
  conditionalRulesSection,
  hyperframesSection,
  importIdmlSection,
  easyCatalogSection,
  indesignXmlSection,
  importPptxSection,
  importExcelSection,
  importImageSection,
  importSvgSection,
  importImageToSvgSection,
  importPdfToSvgSection,
  damSection,
  pimSection,
  taxonomiesSection,
  briefsSection,
  scrapingSection,
  scrapingTemplatesSection,
  scrapingHubSection,
  priceWatchSection,
  retailPromoSection,
  catalogSection,
  exportSection,
  workflowSection,
  telegramSection,
  chatSection,
  accessSection,
  auditLogSection,
  settingsSection,
  explorerSection,
]

export const helpSectionsById: Map<string, HelpSection> = new Map(
  helpSections.map((s) => [s.id, s]),
)
