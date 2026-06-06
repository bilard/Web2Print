import type { HelpSection } from './types'
import { gettingStarted } from './getting-started'
import { onboardingSection } from './onboarding'
import { navigationSection } from './navigation'
import { editorSection } from './editor'
import { damSection } from './dam'
import { importIdmlSection } from './import-idml'
import { easyCatalogSection } from './easycatalog'
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
import { exportSection } from './export'
import { telegramSection } from './telegram'
import { workflowSection } from './workflow'
import { hyperframesSection } from './hyperframes'
import { chatSection } from './chat'
import { accessSection } from './access'
import { settingsSection } from './settings'

export const helpSections: HelpSection[] = [
  gettingStarted,
  onboardingSection,
  navigationSection,
  editorSection,
  hyperframesSection,
  importIdmlSection,
  easyCatalogSection,
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
  exportSection,
  workflowSection,
  telegramSection,
  chatSection,
  accessSection,
  settingsSection,
]

export const helpSectionsById: Map<string, HelpSection> = new Map(
  helpSections.map((s) => [s.id, s]),
)
