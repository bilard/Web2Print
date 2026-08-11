// Identité d'affichage des fournisseurs de modèles : nom lisible, pastille, page de
// rechargement.
//
// ⚠ Extrait de `LiveLlmUsagePanel` le jour où un SECOND écran (le suivi de la veille) a eu
// besoin des mêmes lignes. Recopier huit couples nom/couleur aurait suffi à les faire
// diverger au premier fournisseur ajouté — et `npm run dup:symbols` l'aurait relevé.
import type { AiProvider } from '@/lib/aiModels'

export interface ProviderMeta {
  label: string
  /** Classe Tailwind de la pastille de couleur. */
  dot: string
  /** Page de rechargement du compte, chez le fournisseur. */
  topup: string
}

export const PROVIDER_META: Record<AiProvider, ProviderMeta> = {
  claude:     { label: 'Claude (Anthropic)', dot: 'bg-orange-400',  topup: 'https://console.anthropic.com/settings/billing' },
  gemini:     { label: 'Gemini (Google)',    dot: 'bg-sky-400',     topup: 'https://aistudio.google.com/app/plan_information' },
  openai:     { label: 'OpenAI',             dot: 'bg-emerald-400', topup: 'https://platform.openai.com/settings/organization/billing/overview' },
  deepseek:   { label: 'DeepSeek',           dot: 'bg-indigo-400',  topup: 'https://platform.deepseek.com/top_up' },
  qwen:       { label: 'Qwen',               dot: 'bg-violet-400',  topup: 'https://bailian.console.aliyun.com/?productCode=p_efm#/expense-center' },
  kimi:       { label: 'Kimi',               dot: 'bg-amber-400',   topup: 'https://platform.moonshot.cn/console/account' },
  glm:        { label: 'GLM (Z.ai)',         dot: 'bg-blue-400',    topup: 'https://z.ai/manage-apikey/apikey-list' },
  openrouter: { label: 'OpenRouter',         dot: 'bg-fuchsia-400', topup: 'https://openrouter.ai/settings/credits' },
}

/** Ordre d'affichage, commun à tous les écrans qui listent les fournisseurs. */
export const PROVIDERS: AiProvider[] = ['claude', 'gemini', 'openai', 'deepseek', 'qwen', 'kimi', 'glm', 'openrouter']
