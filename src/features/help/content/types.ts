// src/features/help/content/types.ts
import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

export type HelpCategory = 'Démarrage' | 'Édition' | 'Import' | 'Données' | 'Export'

export type MenuTarget = {
  path: string
  highlightId?: string
}

export type HelpBlock =
  | { type: 'text'; md: string }
  | { type: 'screenshot'; src: string; alt: string; caption?: string }
  | { type: 'mockup'; Component: ComponentType }
  | { type: 'menu-link'; target: MenuTarget; label: string; icon?: LucideIcon }
  | { type: 'shortcut'; keys: string[]; label: string }

export type HelpSection = {
  id: string
  title: string
  category: HelpCategory
  intro: string
  blocks: HelpBlock[]
}

export const HELP_CATEGORIES: HelpCategory[] = [
  'Démarrage',
  'Édition',
  'Import',
  'Données',
  'Export',
]
