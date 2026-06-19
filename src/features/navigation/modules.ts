import { useMemo } from 'react'
import { Library, FilePlus, FileSpreadsheet, Upload, FolderTree, Image as ImageIcon, Database, BookOpen, MessageSquare, Send, Workflow, Film, ShieldCheck, TrendingUpDown, Settings } from 'lucide-react'
import { useIsAdmin } from '@/features/access/useAccess'
import { useAccessStore } from '@/stores/access.store'

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
  | 'hyperframes' | 'telegram' | 'access' | 'price-watch'

export interface ModuleChild {
  /** Suffixe d'action, ex. 'tab:favorites'. */
  id: string
  label: string
  /** Clé complète envoyée dans location.state.intent : '<module>:<id>'. */
  intent: string
  /** Permission `.view`/`.x` supplémentaire pour cet enfant (sinon hérite du parent). */
  permission?: string
  /** Si la fonction est une vraie route (ex. nouveau workflow), naviguer ici au lieu de section+intent. */
  routeTo?: string
}

export interface ModuleItem {
  id: Section
  icon: React.ComponentType<{ className?: string }>
  label: string
  accent: string
  activeBg: string
  activeText: string
  children?: ModuleChild[]
}

export const MODULE_ITEMS: ModuleItem[] = [
  { id: 'blank',  icon: FilePlus,       label: 'Nouveau document', accent: 'text-violet-400',  activeBg: 'bg-violet-500/[0.1]',  activeText: 'text-violet-300' },
  { id: 'import', icon: Upload,         label: 'Importer',         accent: 'text-amber-400',   activeBg: 'bg-amber-500/[0.1]',   activeText: 'text-amber-300',
    children: [
      { id: 'format:idml',        label: 'IDML',          intent: 'import:format:idml',        permission: 'import.idml' },
      { id: 'format:pptx',        label: 'PPTX',          intent: 'import:format:pptx',        permission: 'import.pptx' },
      { id: 'format:image',       label: 'Image',         intent: 'import:format:image',       permission: 'import.image' },
      { id: 'format:svg',         label: 'SVG',           intent: 'import:format:svg',         permission: 'import.svg' },
      { id: 'format:excel',       label: 'Excel/CSV',     intent: 'import:format:excel',       permission: 'import.excel' },
      { id: 'format:image-to-svg',label: 'Image → SVG',  intent: 'import:format:image-to-svg',permission: 'import.imageToSvg' },
      { id: 'format:pdf-to-svg',  label: 'PDF → SVG',    intent: 'import:format:pdf-to-svg',  permission: 'import.pdfToSvg' },
    ],
  },
  { id: 'library',icon: Library,        label: 'Bibliothèque',     accent: 'text-sky-400',     activeBg: 'bg-sky-500/[0.1]',     activeText: 'text-sky-300' },
  { id: 'images', icon: ImageIcon,      label: 'DAM',              accent: 'text-pink-400',    activeBg: 'bg-pink-500/[0.1]',    activeText: 'text-pink-300',
    children: [
      { id: 'tab:stock',       label: 'Banque d\'images',   intent: 'images:tab:stock' },
      { id: 'tab:my-images',   label: 'Mes images',         intent: 'images:tab:my-images' },
      { id: 'tab:favorites',   label: 'Favoris',            intent: 'images:tab:favorites' },
      { id: 'tab:collections', label: 'Collections',        intent: 'images:tab:collections' },
      { id: 'tab:recent',      label: 'Récents',            intent: 'images:tab:recent' },
      { id: 'tab:projects',    label: 'Projets',            intent: 'images:tab:projects' },
      { id: 'tab:generate',    label: 'Générer',            intent: 'images:tab:generate',  permission: 'dam.generate' },
      { id: 'tab:videos',      label: 'Animations HTML',    intent: 'images:tab:videos',    permission: 'dam.animations' },
      { id: 'tab:gdrive',      label: 'Google Drive',       intent: 'images:tab:gdrive',    permission: 'dam.gdrive' },
    ],
  },
  { id: 'data',   icon: FileSpreadsheet,label: 'PIM',              accent: 'text-emerald-400', activeBg: 'bg-emerald-500/[0.1]', activeText: 'text-emerald-300',
    children: [
      { id: 'action:import',       label: 'Importer un fichier', intent: 'data:action:import' },
      { id: 'action:scrape',       label: 'Scraper le web',      intent: 'data:action:scrape' },
      { id: 'action:create-empty', label: 'Créer BDD vide',      intent: 'data:action:create-empty' },
      { id: 'action:update',       label: 'Mise à jour',         intent: 'data:action:update' },
      { id: 'action:export-xlsx',  label: 'Exporter Excel',      intent: 'data:action:export-xlsx' },
      { id: 'action:export-ec',    label: 'Export EasyCatalog',  intent: 'data:action:export-ec' },
    ],
  },
  { id: 'taxonomies', icon: FolderTree, label: 'Taxonomies',       accent: 'text-teal-400',    activeBg: 'bg-teal-500/[0.1]',    activeText: 'text-teal-300',
    children: [
      { id: 'tab:tree',       label: 'Arbre',                intent: 'taxonomies:tab:tree' },
      { id: 'tab:briefs',     label: 'Briefs',               intent: 'taxonomies:tab:briefs' },
      { id: 'action:import',  label: 'Importer une taxonomie', intent: 'taxonomies:action:import' },
    ],
  },
  { id: 'scraping-templates', icon: Database, label: 'Templates scraping', accent: 'text-indigo-400', activeBg: 'bg-indigo-500/[0.1]', activeText: 'text-indigo-300',
    children: [
      { id: 'action:new', label: 'Nouveau template', intent: 'scraping-templates:action:new' },
    ],
  },
  { id: 'scraping-hub', icon: BookOpen, label: 'Scraping Hub', accent: 'text-sky-400', activeBg: 'bg-sky-500/[0.1]', activeText: 'text-sky-300',
    children: [
      { id: 'tab:rules',   label: 'Règles',                  intent: 'scraping-hub:tab:rules' },
      { id: 'tab:vendors', label: 'Fournisseurs & Templates', intent: 'scraping-hub:tab:vendors' },
      { id: 'tab:debug',   label: 'Debug Jina/LLM',          intent: 'scraping-hub:tab:debug' },
    ],
  },
  { id: 'workflows', icon: Workflow, label: 'Workflows', accent: 'text-indigo-400', activeBg: 'bg-indigo-500/[0.1]', activeText: 'text-indigo-300',
    children: [
      { id: 'action:new',               label: 'Nouveau workflow',   intent: 'workflows:action:new' },
      { id: 'action:my-templates',      label: 'Mes modèles',        intent: 'workflows:action:my-templates' },
      { id: 'action:builtin-templates', label: 'Modèles intégrés',   intent: 'workflows:action:builtin-templates' },
    ],
  },
  { id: 'price-watch', icon: TrendingUpDown, label: 'Veille tarifaire', accent: 'text-orange-400', activeBg: 'bg-orange-500/[0.1]', activeText: 'text-orange-300' },
  { id: 'telegram', icon: Send, label: 'Telegram', accent: 'text-blue-400', activeBg: 'bg-blue-500/[0.1]', activeText: 'text-blue-300' },
  { id: 'hyperframes', icon: Film, label: 'Animation', accent: 'text-fuchsia-400', activeBg: 'bg-fuchsia-500/[0.1]', activeText: 'text-fuchsia-300',
    children: [
      { id: 'action:generate', label: 'Générer une animation', intent: 'hyperframes:action:generate' },
      { id: 'action:list',     label: 'Mes animations',        intent: 'hyperframes:action:list' },
    ],
  },
  { id: 'chat', icon: MessageSquare, label: 'Chat IA', accent: 'text-violet-400', activeBg: 'bg-violet-500/[0.1]', activeText: 'text-violet-300' },
  { id: 'settings', icon: Settings, label: 'Réglages', accent: 'text-slate-400', activeBg: 'bg-slate-500/[0.1]', activeText: 'text-slate-300',
    children: [
      { id: 'tab:profile',    label: 'Profil',        intent: 'settings:tab:profile' },
      { id: 'tab:ai',         label: 'IA',            intent: 'settings:tab:ai' },
      { id: 'tab:connectors', label: 'Connecteurs',   intent: 'settings:tab:connectors' },
      { id: 'tab:cookies',    label: 'Cookies',       intent: 'settings:tab:cookies' },
      { id: 'tab:firebase',   label: 'Firebase',      intent: 'settings:tab:firebase' },
      { id: 'tab:stats',      label: 'Statistiques',  intent: 'settings:tab:stats' },
      { id: 'tab:data',       label: 'Données',       intent: 'settings:tab:data' },
    ],
  },
  { id: 'access', icon: ShieldCheck, label: 'Utilisateurs & rôles', accent: 'text-rose-400', activeBg: 'bg-rose-500/[0.1]', activeText: 'text-rose-300',
    children: [
      { id: 'tab:users', label: 'Utilisateurs', intent: 'access:tab:users' },
      { id: 'tab:roles', label: 'Rôles',        intent: 'access:tab:roles' },
    ],
  },
]

/** Permission `.view` qui gate la visibilité de chaque module (absent ⇒ toujours visible). */
export const SECTION_PERMISSION: Partial<Record<Section, string>> = {
  import: 'import.view',
  library: 'library.view',
  images: 'dam.view',
  data: 'pim.view',
  taxonomies: 'taxonomies.view',
  'scraping-templates': 'scrapingTemplates.view',
  'scraping-hub': 'scrapingHub.view',
  workflows: 'workflows.view',
  'price-watch': 'priceWatch.view',
  hyperframes: 'hyperframes.view',
  chat: 'chat.view',
  telegram: 'telegram.view',
}

/** `access` = admin uniquement ; sinon owner OU permission `.view` présente. */
function canSeeModule(id: Section, isAdmin: boolean, permissions: Set<string>): boolean {
  if (id === 'access') return isAdmin
  const perm = SECTION_PERMISSION[id]
  return isAdmin || !perm || permissions.has(perm)
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
