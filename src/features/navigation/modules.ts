import { useMemo } from 'react'
import { Library, FilePlus, FileSpreadsheet, Upload, FolderTree, Image as ImageIcon, Database, BookOpen, BookText, MessageSquare, Send, Workflow, Film, ShieldCheck, TrendingUpDown, Tag, Sparkles, BarChart3, Wallet } from 'lucide-react'
import { useIsAdmin } from '@/features/access/useAccess'
import { useAccessStore } from '@/stores/access.store'
import type { TranslationKey } from '@/lib/i18n'

/**
 * Source de vérité unique des modules de l'app.
 *
 * Les modules ne sont PAS des routes : ce sont des `section` rendues dans
 * `DashboardPage` (état local `activeSection`). Pour ouvrir un module depuis
 * n'importe où, on navigue vers `/dashboard` avec `state: { section }` —
 * `DashboardPage` lit `location.state.section` et ré-ouvre la section (même
 * si on est déjà sur le dashboard, car `location.key` change à chaque nav).
 *
 * `DashboardPage` (sidebar) ET `ModuleNavDrawer` (menu global) consomment cette
 * liste : ajouter un module ici le fait apparaître dans les deux automatiquement.
 */
export type Section =
  | 'blank' | 'import' | 'library' | 'images' | 'data' | 'chat' | 'settings'
  | 'taxonomies' | 'scraping-templates' | 'scraping-hub' | 'workflows'
  | 'hyperframes' | 'telegram' | 'access' | 'price-watch' | 'retail-promo' | 'catalog'
  | 'demo-express' | 'mfr-insights' | 'finances'

/**
 * Toutes les sections existantes — Y COMPRIS celles absentes de `MODULE_ITEMS`
 * (`settings` s'ouvre par l'engrenage du pied de sidebar, pas par un module).
 *
 * ⚠️ Le `Record<Section, true>` est le cliquet : ajouter une valeur au type
 * `Section` sans l'inscrire ici casse la compilation. Sans ça, une section hors
 * sidebar échappait au test de gouvernance — c'est exactement ce qui a laissé
 * l'engrenage Paramètres ouvert à tous les rôles.
 */
const SECTION_SET: Record<Section, true> = {
  blank: true, import: true, library: true, images: true, data: true, chat: true,
  settings: true, taxonomies: true, 'scraping-templates': true, 'scraping-hub': true,
  workflows: true, hyperframes: true, telegram: true, access: true, 'price-watch': true,
  'retail-promo': true, catalog: true, 'demo-express': true, 'mfr-insights': true,
  finances: true,
}
export const ALL_SECTIONS = Object.keys(SECTION_SET) as Section[]

export type ModuleGroupId = 'create' | 'product-data' | 'web' | 'publish' | 'automation' | 'admin'

/**
 * Thèmes du menu, dans l'ordre d'affichage (sidebar + drawer).
 *
 * ⚠️ Les libellés sont des CLÉS de traduction, jamais du texte : le
 * regroupement et les tests s'appuient sur `id`, l'affichage sur `t(labelKey)`.
 */
export const MODULE_GROUPS: { id: ModuleGroupId; labelKey: TranslationKey }[] = [
  { id: 'create',       labelKey: 'nav.group.create' },
  { id: 'product-data', labelKey: 'nav.group.product-data' },
  { id: 'web',          labelKey: 'nav.group.web' },
  { id: 'publish',      labelKey: 'nav.group.publish' },
  { id: 'automation',   labelKey: 'nav.group.automation' },
  { id: 'admin',        labelKey: 'nav.group.admin' },
]

export interface ModuleChild {
  /** Suffixe d'action, ex. 'tab:favorites'. */
  id: string
  labelKey: TranslationKey
  /** Clé complète envoyée dans location.state.intent : '<module>:<id>'. */
  intent: string
  /** Permission `.view`/`.x` supplémentaire pour cet enfant (sinon hérite du parent). */
  permission?: string
  /** Si la fonction est une vraie route (ex. nouveau workflow), naviguer ici au lieu de section+intent. */
  routeTo?: string
}

export interface ModuleItem {
  id: Section
  group: ModuleGroupId
  icon: React.ComponentType<{ className?: string }>
  labelKey: TranslationKey
  accent: string
  activeBg: string
  activeText: string
  children?: ModuleChild[]
}

export const MODULE_ITEMS: ModuleItem[] = [
  // ── Création ──
  { id: 'blank',  group: 'create', icon: FilePlus,       labelKey: 'nav.blank',   accent: 'text-violet-400',  activeBg: 'bg-violet-500/[0.1]',  activeText: 'text-violet-300' },
  { id: 'import', group: 'create', icon: Upload,         labelKey: 'nav.import',  accent: 'text-amber-400',   activeBg: 'bg-amber-500/[0.1]',   activeText: 'text-amber-300',
    children: [
      // Ouvre l'assistant d'import PIM (animation de conversion des formules Excel).
      { id: 'action:excel',       labelKey: 'nav.import.excel',      intent: 'import:action:excel',       permission: 'import.excel' },
      { id: 'format:idml',        labelKey: 'nav.import.idml',       intent: 'import:format:idml',        permission: 'import.idml' },
      { id: 'format:pptx',        labelKey: 'nav.import.pptx',       intent: 'import:format:pptx',        permission: 'import.pptx' },
      { id: 'format:image',       labelKey: 'nav.import.image',      intent: 'import:format:image',       permission: 'import.image' },
      { id: 'format:svg',         labelKey: 'nav.import.svg',        intent: 'import:format:svg',         permission: 'import.svg' },
      { id: 'format:image-to-svg',labelKey: 'nav.import.imageToSvg', intent: 'import:format:image-to-svg',permission: 'import.imageToSvg' },
      { id: 'format:pdf-to-svg',  labelKey: 'nav.import.pdfToSvg',   intent: 'import:format:pdf-to-svg',  permission: 'import.pdfToSvg' },
    ],
  },
  { id: 'library', group: 'create', icon: Library,        labelKey: 'nav.library', accent: 'text-sky-400',     activeBg: 'bg-sky-500/[0.1]',     activeText: 'text-sky-300',
    children: [
      { id: 'view:grid', labelKey: 'nav.library.grid', intent: 'library:view:grid' },
      { id: 'view:list', labelKey: 'nav.library.list', intent: 'library:view:list' },
    ],
  },
  // ── Données produits ──
  { id: 'images', group: 'product-data', icon: ImageIcon,      labelKey: 'nav.images', accent: 'text-pink-400',    activeBg: 'bg-pink-500/[0.1]',    activeText: 'text-pink-300',
    children: [
      { id: 'tab:stock',       labelKey: 'nav.images.stock',       intent: 'images:tab:stock' },
      { id: 'tab:my-images',   labelKey: 'nav.images.mine',        intent: 'images:tab:my-images' },
      { id: 'tab:favorites',   labelKey: 'nav.images.favorites',   intent: 'images:tab:favorites' },
      { id: 'tab:collections', labelKey: 'nav.images.collections', intent: 'images:tab:collections' },
      { id: 'tab:recent',      labelKey: 'nav.images.recent',      intent: 'images:tab:recent' },
      { id: 'tab:projects',    labelKey: 'nav.images.projects',    intent: 'images:tab:projects' },
      { id: 'tab:generate',    labelKey: 'nav.images.generate',    intent: 'images:tab:generate',  permission: 'dam.generate' },
      { id: 'tab:videos',      labelKey: 'nav.images.videos',      intent: 'images:tab:videos',    permission: 'dam.animations' },
      { id: 'tab:gdrive',      labelKey: 'nav.images.gdrive',      intent: 'images:tab:gdrive',    permission: 'dam.gdrive' },
    ],
  },
  { id: 'data',   group: 'product-data', icon: FileSpreadsheet,labelKey: 'nav.data', accent: 'text-emerald-400', activeBg: 'bg-emerald-500/[0.1]', activeText: 'text-emerald-300',
    children: [
      { id: 'action:import',       labelKey: 'nav.data.import',      intent: 'data:action:import' },
      { id: 'action:scrape',       labelKey: 'nav.data.scrape',      intent: 'data:action:scrape' },
      { id: 'action:create-empty', labelKey: 'nav.data.createEmpty', intent: 'data:action:create-empty' },
      { id: 'action:update',       labelKey: 'nav.data.update',      intent: 'data:action:update' },
      { id: 'action:export-xlsx',  labelKey: 'nav.data.exportXlsx',  intent: 'data:action:export-xlsx' },
      { id: 'action:export-ec',    labelKey: 'nav.data.exportEc',    intent: 'data:action:export-ec' },
    ],
  },
  { id: 'taxonomies', group: 'product-data', icon: FolderTree, labelKey: 'nav.taxonomies', accent: 'text-teal-400',    activeBg: 'bg-teal-500/[0.1]',    activeText: 'text-teal-300',
    children: [
      { id: 'tab:tree',       labelKey: 'nav.taxonomies.tree',   intent: 'taxonomies:tab:tree' },
      { id: 'tab:briefs',     labelKey: 'nav.taxonomies.briefs', intent: 'taxonomies:tab:briefs' },
      { id: 'action:import',  labelKey: 'nav.taxonomies.import', intent: 'taxonomies:action:import' },
    ],
  },
  { id: 'mfr-insights', group: 'product-data', icon: BarChart3, labelKey: 'nav.mfrInsights', accent: 'text-indigo-400', activeBg: 'bg-indigo-500/[0.1]', activeText: 'text-indigo-300',
    children: [
      { id: 'tab:overview', labelKey: 'nav.mfrInsights.overview', intent: 'mfr-insights:tab:overview' },
      { id: 'tab:fields',   labelKey: 'nav.mfrInsights.fields',   intent: 'mfr-insights:tab:fields' },
      { id: 'tab:products', labelKey: 'nav.mfrInsights.products', intent: 'mfr-insights:tab:products' },
    ],
  },
  // ── Web & veille ──
  { id: 'scraping-templates', group: 'web', icon: Database, labelKey: 'nav.scrapingTemplates', accent: 'text-indigo-400', activeBg: 'bg-indigo-500/[0.1]', activeText: 'text-indigo-300',
    children: [
      { id: 'action:new', labelKey: 'nav.scrapingTemplates.new', intent: 'scraping-templates:action:new' },
    ],
  },
  { id: 'scraping-hub', group: 'web', icon: BookOpen, labelKey: 'nav.scrapingHub', accent: 'text-sky-400', activeBg: 'bg-sky-500/[0.1]', activeText: 'text-sky-300',
    children: [
      { id: 'tab:rules',   labelKey: 'nav.scrapingHub.rules',   intent: 'scraping-hub:tab:rules' },
      { id: 'tab:vendors', labelKey: 'nav.scrapingHub.vendors', intent: 'scraping-hub:tab:vendors' },
      { id: 'tab:debug',   labelKey: 'nav.scrapingHub.debug',   intent: 'scraping-hub:tab:debug' },
    ],
  },
  { id: 'price-watch', group: 'web', icon: TrendingUpDown, labelKey: 'nav.priceWatch', accent: 'text-orange-400', activeBg: 'bg-orange-500/[0.1]', activeText: 'text-orange-300',
    children: [
      { id: 'section:pending',    labelKey: 'nav.priceWatch.pending',    intent: 'price-watch:section:pending' },
      { id: 'section:comparison', labelKey: 'nav.priceWatch.comparison', intent: 'price-watch:section:comparison' },
    ],
  },
  // ── Publication ──
  { id: 'demo-express', group: 'publish', icon: Sparkles, labelKey: 'nav.demoExpress', accent: 'text-lime-400', activeBg: 'bg-lime-500/[0.1]', activeText: 'text-lime-300',
    children: [
      { id: 'action:new', labelKey: 'nav.demoExpress.new', intent: 'demo-express:action:new' },
    ],
  },
  { id: 'retail-promo', group: 'publish', icon: Tag, labelKey: 'nav.retailPromo', accent: 'text-rose-400', activeBg: 'bg-rose-500/[0.1]', activeText: 'text-rose-300',
    children: [
      { id: 'action:new',  labelKey: 'nav.retailPromo.new',  intent: 'retail-promo:action:new' },
      { id: 'action:list', labelKey: 'nav.retailPromo.list', intent: 'retail-promo:action:list' },
    ],
  },
  { id: 'catalog', group: 'publish', icon: BookText, labelKey: 'nav.catalog', accent: 'text-cyan-400', activeBg: 'bg-cyan-500/[0.1]', activeText: 'text-cyan-300',
    children: [
      { id: 'action:new',  labelKey: 'nav.catalog.new',  intent: 'catalog:action:new' },
      { id: 'action:list', labelKey: 'nav.catalog.list', intent: 'catalog:action:list' },
    ],
  },
  { id: 'hyperframes', group: 'publish', icon: Film, labelKey: 'nav.hyperframes', accent: 'text-fuchsia-400', activeBg: 'bg-fuchsia-500/[0.1]', activeText: 'text-fuchsia-300',
    children: [
      { id: 'action:generate', labelKey: 'nav.hyperframes.generate', intent: 'hyperframes:action:generate' },
      { id: 'action:list',     labelKey: 'nav.hyperframes.list',     intent: 'hyperframes:action:list' },
    ],
  },
  // ── Automatisation & IA ──
  { id: 'workflows', group: 'automation', icon: Workflow, labelKey: 'nav.workflows', accent: 'text-indigo-400', activeBg: 'bg-indigo-500/[0.1]', activeText: 'text-indigo-300',
    children: [
      { id: 'action:new',               labelKey: 'nav.workflows.new',              intent: 'workflows:action:new' },
      { id: 'action:my-templates',      labelKey: 'nav.workflows.myTemplates',      intent: 'workflows:action:my-templates' },
      { id: 'action:builtin-templates', labelKey: 'nav.workflows.builtinTemplates', intent: 'workflows:action:builtin-templates' },
    ],
  },
  { id: 'chat', group: 'automation', icon: MessageSquare, labelKey: 'nav.chat', accent: 'text-violet-400', activeBg: 'bg-violet-500/[0.1]', activeText: 'text-violet-300',
    children: [
      { id: 'action:new',       labelKey: 'nav.chat.new',      intent: 'chat:action:new' },
      { id: 'category:writing', labelKey: 'nav.chat.writing',  intent: 'chat:category:writing' },
      { id: 'category:learning',labelKey: 'nav.chat.learning', intent: 'chat:category:learning' },
      { id: 'category:code',    labelKey: 'nav.chat.code',     intent: 'chat:category:code' },
      { id: 'category:daily',   labelKey: 'nav.chat.daily',    intent: 'chat:category:daily' },
      { id: 'category:ideas',   labelKey: 'nav.chat.ideas',    intent: 'chat:category:ideas' },
      { id: 'category:image',   labelKey: 'nav.chat.image',    intent: 'chat:category:image' },
    ],
  },
  { id: 'telegram', group: 'automation', icon: Send, labelKey: 'nav.telegram', accent: 'text-blue-400', activeBg: 'bg-blue-500/[0.1]', activeText: 'text-blue-300',
    children: [
      { id: 'action:new', labelKey: 'nav.telegram.new', intent: 'telegram:action:new' },
    ],
  },
  // ── Administration ──
  { id: 'finances', group: 'admin', icon: Wallet, labelKey: 'nav.finances', accent: 'text-emerald-400', activeBg: 'bg-emerald-500/[0.1]', activeText: 'text-emerald-300' },
  { id: 'access', group: 'admin', icon: ShieldCheck, labelKey: 'nav.access', accent: 'text-rose-400', activeBg: 'bg-rose-500/[0.1]', activeText: 'text-rose-300',
    children: [
      { id: 'tab:users',     labelKey: 'nav.access.users',     intent: 'access:tab:users' },
      { id: 'tab:roles',     labelKey: 'nav.access.roles',     intent: 'access:tab:roles' },
      { id: 'tab:audit',     labelKey: 'nav.access.audit',     intent: 'access:tab:audit' },
      { id: 'tab:analytics', labelKey: 'nav.access.analytics', intent: 'access:tab:analytics' },
    ],
  },
]

/**
 * Modules réservés à l'admin : jamais gouvernés par une permission de rôle.
 *
 * `access` en fait partie DÉFINITIVEMENT — y donner accès, c'est donner le droit
 * de modifier les rôles, donc de s'auto-attribuer n'importe quel droit.
 * `finances` en est sorti : les compteurs sont clefés par `{uid}`, un membre n'y
 * voit que SA propre consommation.
 *
 * ⚠️ Toute section hors de cette liste DOIT avoir une entrée `SECTION_PERMISSION`
 * (invariant testé) : sans clé, la règle `!perm ⇒ visible` la montre à TOUS.
 */
export const ADMIN_ONLY_SECTIONS: readonly Section[] = ['access']

/** Permission `.view` qui gate la visibilité de chaque module (absent ⇒ toujours visible). */
export const SECTION_PERMISSION: Partial<Record<Section, string>> = {
  // « Nouveau document » crée un projet qui atterrit dans la Bibliothèque :
  // même droit que le bouton « Créer » de la bibliothèque.
  blank: 'library.create',
  import: 'import.view',
  library: 'library.view',
  images: 'dam.view',
  data: 'pim.view',
  taxonomies: 'taxonomies.view',
  'mfr-insights': 'mfrInsights.view',
  'demo-express': 'demoExpress.view',
  'scraping-templates': 'scrapingTemplates.view',
  'scraping-hub': 'scrapingHub.view',
  workflows: 'workflows.view',
  'price-watch': 'priceWatch.view',
  'retail-promo': 'retailPromo.view',
  catalog: 'catalog.view',
  hyperframes: 'hyperframes.view',
  chat: 'chat.view',
  telegram: 'telegram.view',
  // Hors sidebar : l'engrenage du pied de sidebar. Sans clé ici, il s'affichait
  // pour TOUS les rôles alors que `settings.view` existait pour le gouverner.
  settings: 'settings.view',
  finances: 'finances.view',
}

/**
 * Modules admin (`ADMIN_ONLY_SECTIONS`) = admin uniquement ; sinon admin OU
 * permission `.view` présente.
 *
 * ⚠️ SEULE implémentation du filtrage : la sidebar du Dashboard en avait une
 * copie qui avait oublié `finances` — le module fuitait donc vers tous les rôles
 * alors que le menu global (`useVisibleModules`) le cachait bien. Tout nouvel
 * écran qui filtre des modules appelle CETTE fonction.
 */
export function canSeeModule(id: Section, isAdmin: boolean, permissions: ReadonlySet<string>): boolean {
  if (ADMIN_ONLY_SECTIONS.includes(id)) return isAdmin
  const perm = SECTION_PERMISSION[id]
  return isAdmin || !perm || permissions.has(perm)
}

/** Regroupe une liste (déjà filtrée) de modules par thème, dans l'ordre de MODULE_GROUPS. */
export function groupModules(modules: ModuleItem[]): { group: (typeof MODULE_GROUPS)[number]; items: ModuleItem[] }[] {
  return MODULE_GROUPS
    .map((group) => ({ group, items: modules.filter((m) => m.group === group.id) }))
    .filter((g) => g.items.length > 0)
}

/** Modules visibles pour l'utilisateur courant (mêmes droits que la sidebar du Dashboard). */
export function useVisibleModules(): ModuleItem[] {
  const isAdmin = useIsAdmin()
  const permissions = useAccessStore((s) => s.permissions)
  return useMemo(
    () => MODULE_ITEMS.filter((m) => canSeeModule(m.id, isAdmin, permissions)),
    [isAdmin, permissions],
  )
}
