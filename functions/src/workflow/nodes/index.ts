// functions/src/workflow/nodes/index.ts
import './pure'
import './network'
import './sinks'
import './priceWatch'

/** Types présents côté client mais non exécutables côté serveur (navigateur/OAuth/canvas). */
export const SERVER_UNSUPPORTED = new Set<string>([
  'export-pdf', 'image-to-svg', 'pdf-to-svg', 'decompose',
  'gsheets-import', 'gsheets-export', 'gdrive-import', 'gdrive-export', 'save-dam',
  'send-gmail', 'import-idml', 'import-svg', 'import-pptx', 'import-image',
  'import-csv', 'upload', 'export-excel', 'export-pptx', 'generate-image',
])
