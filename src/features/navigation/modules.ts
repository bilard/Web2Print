import { useMemo } from 'react'
import { Library, FilePlus, FileSpreadsheet, Upload, FolderTree, Image as ImageIcon, Database, BookOpen, MessageSquare, Send, Workflow, Film, ShieldCheck } from 'lucide-react'
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
  | 'hyperframes' | 'telegram' | 'access'

export interface ModuleItem {
  id: Section
  icon: React.ComponentType<{ className?: string }>
  label: string
  accent: string
  activeBg: string
  activeText: string
}

export const MODULE_ITEMS: ModuleItem[] = [
  { id: 'blank',  icon: FilePlus,       label: 'Nouveau document', accent: 'text-violet-400',  activeBg: 'bg-violet-500/[0.1]',  activeText: 'text-violet-300' },
  { id: 'import', icon: Upload,         label: 'Importer',         accent: 'text-amber-400',   activeBg: 'bg-amber-500/[0.1]',   activeText: 'text-amber-300' },
  { id: 'library',icon: Library,        label: 'Bibliothèque',     accent: 'text-sky-400',     activeBg: 'bg-sky-500/[0.1]',     activeText: 'text-sky-300' },
  { id: 'images', icon: ImageIcon,      label: 'DAM',              accent: 'text-pink-400',    activeBg: 'bg-pink-500/[0.1]',    activeText: 'text-pink-300' },
  { id: 'data',   icon: FileSpreadsheet,label: 'PIM',              accent: 'text-emerald-400', activeBg: 'bg-emerald-500/[0.1]', activeText: 'text-emerald-300' },
  { id: 'taxonomies', icon: FolderTree, label: 'Taxonomies',       accent: 'text-teal-400',    activeBg: 'bg-teal-500/[0.1]',    activeText: 'text-teal-300' },
  { id: 'scraping-templates', icon: Database, label: 'Templates scraping', accent: 'text-indigo-400', activeBg: 'bg-indigo-500/[0.1]', activeText: 'text-indigo-300' },
  { id: 'scraping-hub', icon: BookOpen, label: 'Scraping Hub', accent: 'text-sky-400', activeBg: 'bg-sky-500/[0.1]', activeText: 'text-sky-300' },
  { id: 'workflows', icon: Workflow, label: 'Workflows', accent: 'text-indigo-400', activeBg: 'bg-indigo-500/[0.1]', activeText: 'text-indigo-300' },
  { id: 'telegram', icon: Send, label: 'Telegram', accent: 'text-blue-400', activeBg: 'bg-blue-500/[0.1]', activeText: 'text-blue-300' },
  { id: 'hyperframes', icon: Film, label: 'Animation', accent: 'text-fuchsia-400', activeBg: 'bg-fuchsia-500/[0.1]', activeText: 'text-fuchsia-300' },
  { id: 'chat', icon: MessageSquare, label: 'Chat IA', accent: 'text-violet-400', activeBg: 'bg-violet-500/[0.1]', activeText: 'text-violet-300' },
  { id: 'access', icon: ShieldCheck, label: 'Utilisateurs & rôles', accent: 'text-rose-400', activeBg: 'bg-rose-500/[0.1]', activeText: 'text-rose-300' },
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
  hyperframes: 'hyperframes.view',
  chat: 'chat.view',
  telegram: 'telegram.view',
}

/** `access` = admin uniquement ; sinon owner OU permission `.view` présente. */
export function canSeeModule(id: Section, isAdmin: boolean, permissions: Set<string>): boolean {
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
