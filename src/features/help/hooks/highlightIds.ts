export const HIGHLIGHT_IDS = [
  // Dashboard
  'dashboard.new-project',
  'dashboard.sidebar.blank',
  'dashboard.sidebar.import',
  'dashboard.sidebar.library',
  'dashboard.sidebar.images',
  'dashboard.sidebar.data',
  'dashboard.sidebar.taxonomies',
  'dashboard.sidebar.scraping-templates',
  'dashboard.sidebar.scraping-hub',
  'dashboard.sidebar.chat',
  'dashboard.sidebar.workflows',
  'dashboard.sidebar.telegram',

  // Editor header
  'editor-header.save',
  'editor-header.export',
  'editor-header.undo',
  'editor-header.redo',

  // Editor toolbar (left)
  'toolbar.select',
  'toolbar.text',
  'toolbar.rect',
  'toolbar.ellipse',
  'toolbar.line',
  'toolbar.image',

  // Editor footer (bottom)
  'editor-footer.zoom-out',
  'editor-footer.zoom-reset',
  'editor-footer.zoom-in',
  'editor-footer.page-settings',
  'editor-footer.grid',
  'editor-footer.snap',

  // Right panels
  'layers-panel',
] as const

export type HighlightId = typeof HIGHLIGHT_IDS[number]
