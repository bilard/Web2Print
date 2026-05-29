import type { HelpSection } from './types'
import { gettingStarted } from './getting-started'
import { editorSection } from './editor'
import { damSection } from './dam'
import { importIdmlSection } from './import-idml'
import { importPptxSection } from './import-pptx'
import { importExcelSection } from './import-excel'
import { importMediaSection } from './import-media'
import { taxonomiesSection } from './taxonomies'
import { briefsSection } from './briefs'
import { scrapingSection } from './scraping'
import { exportSection } from './export'
import { telegramSection } from './telegram'
import { workflowSection } from './workflow'

export const helpSections: HelpSection[] = [
  gettingStarted,
  editorSection,
  damSection,
  importIdmlSection,
  importPptxSection,
  importExcelSection,
  importMediaSection,
  taxonomiesSection,
  briefsSection,
  scrapingSection,
  exportSection,
  workflowSection,
  telegramSection,
]

export const helpSectionsById: Map<string, HelpSection> = new Map(
  helpSections.map((s) => [s.id, s]),
)
