import type { Section } from '@/features/navigation/modules'

/**
 * Contexte = module/écran actif de l'app (sections du Dashboard + `editor`).
 *
 * À l'ouverture du panneau d'aide (bouton ?, ⇧?), on pré-sélectionne l'article
 * correspondant au contexte courant plutôt que le premier article. Les ids ci-dessous
 * sont des `HelpSection.id` (cf. `content/index.ts`) ; leurs gates `helpAccess` sont
 * alignés sur `SECTION_PERMISSION` (un user dans le module voit forcément l'article).
 */
export type HelpContext = Section | 'editor'

const CONTEXT_TO_ARTICLE: Record<HelpContext, string> = {
  blank: 'getting-started',
  import: 'import-idml',
  library: 'getting-started',
  images: 'dam',
  data: 'pim',
  chat: 'chat',
  settings: 'settings',
  taxonomies: 'taxonomies',
  'scraping-templates': 'scraping-templates',
  'scraping-hub': 'scraping-hub',
  workflows: 'workflow',
  hyperframes: 'hyperframes',
  telegram: 'telegram',
  access: 'access',
  'price-watch': 'price-watch',
  'retail-promo': 'retail-promo',
  catalog: 'getting-started',
  editor: 'editor',
}

/** Article d'aide associé au contexte courant, ou `null` (repli sur le défaut). */
export function resolveContextArticle(ctx: HelpContext | null): string | null {
  return ctx ? CONTEXT_TO_ARTICLE[ctx] ?? null : null
}

/**
 * Contexte déduit d'une route autonome (hors Dashboard). Le Dashboard pose son propre
 * contexte depuis `activeSection` ; ici on couvre les pages routées (`/editor`,
 * `/workflows`, `/taxonomies`, `/scraping-templates`). `null` ⇒ laisser le Dashboard décider.
 */
export function pathToContext(pathname: string): HelpContext | null {
  if (pathname.startsWith('/editor')) return 'editor'
  if (pathname.startsWith('/workflows')) return 'workflows'
  if (pathname.startsWith('/scraping-templates')) return 'scraping-templates'
  if (pathname.startsWith('/taxonomies')) return 'taxonomies'
  return null
}
