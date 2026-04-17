import type { HelpSection } from './types'

const stub = (id: string, title: string, category: HelpSection['category']): HelpSection => ({
  id,
  title,
  category,
  intro: 'Rédaction à venir.',
  blocks: [
    {
      type: 'text',
      md: '_Cette section sera rédigée prochainement._',
    },
  ],
})

export const STUBS: HelpSection[] = [
  stub('import-idml', 'Import InDesign (IDML)', 'Import'),
  stub('import-pptx', 'Import PowerPoint (PPTX)', 'Import'),
  stub('import-excel', 'Import Excel & PIM', 'Import'),
  stub('dam', 'Bibliothèque d\'assets (DAM)', 'Édition'),
  stub('taxonomies', 'Taxonomies', 'Données'),
  stub('briefs', 'Briefs & génération IA', 'Données'),
  stub('scraping', 'Scraping produits', 'Données'),
  stub('export', 'Export multi-format', 'Export'),
]
