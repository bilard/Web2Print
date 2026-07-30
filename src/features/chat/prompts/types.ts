import type { LucideIcon } from 'lucide-react'
import type { TranslationKey } from '@/lib/i18n'
import {
  Pencil,
  GraduationCap,
  Code2,
  Coffee,
  Lightbulb,
  ImagePlus,
  Sparkles,
} from 'lucide-react'

export const PROMPT_CATEGORIES = [
  'writing',
  'learning',
  'code',
  'daily',
  'ideas',
  'image',
  'custom',
] as const

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number]

export interface PromptCategoryMeta {
  id: PromptCategory
  labelKey: TranslationKey
  icon: LucideIcon
}

// ⚠️ CLÉS, pas `t()` : objet évalué au chargement du module.
export const CATEGORY_META: Record<PromptCategory, PromptCategoryMeta> = {
  writing:  { id: 'writing',  labelKey: 'ch.cat.writing',  icon: Pencil },
  learning: { id: 'learning', labelKey: 'ch.cat.learning', icon: GraduationCap },
  code:     { id: 'code',     labelKey: 'ch.cat.code',     icon: Code2 },
  daily:    { id: 'daily',    labelKey: 'ch.cat.daily',    icon: Coffee },
  ideas:    { id: 'ideas',    labelKey: 'ch.cat.ideas',    icon: Lightbulb },
  image:    { id: 'image',    labelKey: 'ch.cat.image',    icon: ImagePlus },
  custom:   { id: 'custom',   labelKey: 'ch.cat.custom',   icon: Sparkles },
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
