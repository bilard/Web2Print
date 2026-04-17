export const HIGHLIGHT_IDS = [
  'editor-header.save',
  'editor-header.export',
  'toolbar.text',
  'toolbar.image',
  'layers-panel',
  'dashboard.new-project',
] as const

export type HighlightId = typeof HIGHLIGHT_IDS[number]
