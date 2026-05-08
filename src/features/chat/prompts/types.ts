import type { LucideIcon } from 'lucide-react'
import {
  Pencil,
  GraduationCap,
  Code2,
  Coffee,
  Lightbulb,
  Sparkles,
} from 'lucide-react'

export const PROMPT_CATEGORIES = [
  'writing',
  'learning',
  'code',
  'daily',
  'ideas',
  'custom',
] as const

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number]

export interface PromptCategoryMeta {
  id: PromptCategory
  label: string
  icon: LucideIcon
}

export const CATEGORY_META: Record<PromptCategory, PromptCategoryMeta> = {
  writing:  { id: 'writing',  label: 'Écrire',          icon: Pencil },
  learning: { id: 'learning', label: 'Apprendre',       icon: GraduationCap },
  code:     { id: 'code',     label: 'Code',            icon: Code2 },
  daily:    { id: 'daily',    label: 'Vie quotidienne', icon: Coffee },
  ideas:    { id: 'ideas',    label: 'Idées',           icon: Lightbulb },
  custom:   { id: 'custom',   label: 'Personnalisé',    icon: Sparkles },
}

export interface Prompt {
  id: string
  title: string
  content: string
  category: PromptCategory
  favorite: boolean
  usageCount: number
  lastUsedAt: number | null
  createdAt: number
  updatedAt: number
}

export type PromptDraft = Pick<Prompt, 'title' | 'content' | 'category'>
