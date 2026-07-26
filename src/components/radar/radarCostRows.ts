// Construit les lignes du tableau « Consommation IA & Scraping » de radarPrice : TOUS les
// providers IA (même à 0, comme le desktop) + connecteurs scraping/image. PUR.
import { AI_MODELS, type AiProvider } from '@/lib/aiModels'
import { getSelectedModel } from '@/stores/aiSettings.store'
import type { UsageStatsLike } from '@/features/finance/types'

type BadgeKind = 'ok' | 'warning' | 'over' | 'unset'

export interface RadarCostRow {
  key: string
  label: string
  model: string
  dot: string // classe Tailwind (bg-*)
  billingUrl?: string
  volume: string
  pricingLabel?: string
  costUsd: number
  budgetUsd: number | null
  avail: { usd: number | null; kind: 'restant' | 'solde API' | 'partagé' | null }
  badge: BadgeKind
  pct: number | null
}

export interface RadarCostTotals { totalUsd: number; tokensIn: number; tokensOut: number; over: number; warn: number }

const PROVIDER_META: Record<AiProvider, { label: string; dot: string; billing: string }> = {
  claude: { label: 'Claude (Anthropic)', dot: 'bg-orange-400', billing: 'https://console.anthropic.com/settings/billing' },
  gemini: { label: 'Gemini (Google)', dot: 'bg-sky-400', billing: 'https://aistudio.google.com/app/plan_information' },
  openai: { label: 'OpenAI', dot: 'bg-emerald-400', billing: 'https://platform.openai.com/settings/organization/billing/overview' },
  deepseek: { label: 'DeepSeek', dot: 'bg-indigo-400', billing: 'https://platform.deepseek.com/top_up' },
  qwen: { label: 'Qwen', dot: 'bg-violet-400', billing: 'https://bailian.console.aliyun.com/#/expense-center' },
  kimi: { label: 'Kimi', dot: 'bg-amber-400', billing: 'https://platform.moonshot.cn/console/account' },
  glm: { label: 'GLM (Z.ai)', dot: 'bg-blue-400', billing: 'https://z.ai/manage-apikey/apikey-list' },
  openrouter: { label: 'OpenRouter', dot: 'bg-fuchsia-400', billing: 'https://openrouter.ai/settings/credits' },
}
const PROVIDERS: AiProvider[] = ['claude', 'gemini', 'openai', 'deepseek', 'qwen', 'kimi', 'glm', 'openrouter']
const GEMINI_IMAGE_ID = 'gemini-3.1-flash-image-preview'
/** Providers exposant un vrai solde API (fetch live) plutôt qu'un budget mensuel. */
const API_BALANCE_PROVIDERS = new Set(['deepseek', 'openrouter'])

const fmtTok = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)} M` : n >= 10_000 ? `${(n / 1_000).toFixed(1)} k` : n.toLocaleString('fr-FR')

function badgeOf(costUsd: number, budgetUsd: number | null): BadgeKind {
  if (budgetUsd === null || budgetUsd <= 0) return 'unset'
  const pct = costUsd / budgetUsd
  return pct >= 1 ? 'over' : pct >= 0.8 ? 'warning' : 'ok'
}

export interface RadarCostInputs {
  stats: UsageStatsLike
  monthlyBudgetUsd: Record<string, number | null>
  brightDataBudgetUsd: number | null
  balances: Record<string, number | null> // { deepseek?, openrouter? } soldes API live
  brightDataBalanceUsd: number | null
  brightDataConsumedUsd: number | null
}

export function buildRadarCostRows(input: RadarCostInputs): { rows: RadarCostRow[]; totals: RadarCostTotals } {
  const { stats, monthlyBudgetUsd, brightDataBudgetUsd, balances, brightDataBalanceUsd, brightDataConsumedUsd } = input
  const rows: RadarCostRow[] = []
  let tokensIn = 0, tokensOut = 0, totalUsd = 0, over = 0, warn = 0

  for (const p of PROVIDERS) {
    const u = stats.aiCost.byProvider[p] ?? { tokensIn: 0, tokensOut: 0, costUsd: 0 }
    const budget = monthlyBudgetUsd[p] ?? null
    const model = AI_MODELS[p].find((m) => m.id === getSelectedModel(p)) ?? AI_MODELS[p][0]
    const badge = badgeOf(u.costUsd, budget)
    const pct = budget && budget > 0 ? u.costUsd / budget : null
    // Solde API live prioritaire (DeepSeek/OpenRouter), sinon budget restant.
    const apiBal = API_BALANCE_PROVIDERS.has(p) ? balances[p] ?? null : null
    const avail = apiBal != null
      ? { usd: apiBal, kind: 'solde API' as const }
      : budget && budget > 0 ? { usd: Math.max(0, budget - u.costUsd), kind: 'restant' as const } : { usd: null, kind: null }
    tokensIn += u.tokensIn; tokensOut += u.tokensOut; totalUsd += u.costUsd
    if (badge === 'over') over++; else if (badge === 'warning') warn++
    rows.push({
      key: `llm:${p}`, label: PROVIDER_META[p].label, model: model?.label ?? p, dot: PROVIDER_META[p].dot, billingUrl: PROVIDER_META[p].billing,
      volume: `${fmtTok(u.tokensIn)} / ${fmtTok(u.tokensOut)}`,
      pricingLabel: model ? `$${model.pricing.input}/${model.pricing.output} par M tokens` : undefined,
      costUsd: u.costUsd, budgetUsd: budget && budget > 0 ? budget : null, avail, badge, pct,
    })
    // Ligne image Gemini (budget partagé avec le texte Gemini).
    if (p === 'gemini') {
      const img = AI_MODELS.gemini.find((m) => m.id === GEMINI_IMAGE_ID)
      const leaf = stats.aiCost.byProvider.gemini as unknown as { byModel?: Record<string, { tokensIn: number; tokensOut: number; costUsd: number }> } | undefined
      const iu = leaf?.byModel?.[GEMINI_IMAGE_ID] ?? { tokensIn: 0, tokensOut: 0, costUsd: 0 }
      rows.push({
        key: 'llm:gemini-image', label: 'Gemini (Google)', model: 'Gemini 3.1 Flash Image (NB2)', dot: 'bg-sky-400', billingUrl: PROVIDER_META.gemini.billing,
        volume: `${fmtTok(iu.tokensIn)} / ${fmtTok(iu.tokensOut)}`,
        pricingLabel: img ? `$${img.pricing.input}/${img.pricing.output} par M tokens` : undefined,
        costUsd: iu.costUsd, budgetUsd: null, avail: { usd: null, kind: 'partagé' }, badge: 'unset', pct: null,
      })
    }
  }

  // Connecteurs scraping (scrapeUsage : Jina tokens, Firecrawl req).
  for (const [platform, u] of Object.entries(stats.scrape.byPlatform)) {
    const label = platform === 'jina' ? 'Jina' : platform === 'firecrawl' ? 'Firecrawl' : platform
    const billing = platform === 'jina' ? 'https://jina.ai/api-dashboard/' : platform === 'firecrawl' ? 'https://www.firecrawl.dev/app/billing' : undefined
    totalUsd += u.costUsd
    rows.push({
      key: `scrape:${platform}`, label, model: 'Scraping', dot: 'bg-teal-400', billingUrl: billing,
      volume: u.tokens > 0 ? `${fmtTok(u.tokens)} tokens` : `${u.requests.toLocaleString('fr-FR')} req`,
      costUsd: u.costUsd, budgetUsd: null, avail: { usd: null, kind: null }, badge: 'unset', pct: null,
    })
  }

  // Bright Data (solde compte live si owner, sinon coût du mois).
  const bdConsumed = brightDataConsumedUsd ?? stats.brightData.costUsd
  if (bdConsumed > 0 || stats.brightData.requests > 0 || brightDataBalanceUsd != null) {
    totalUsd += bdConsumed
    rows.push({
      key: 'scrape:brightdata', label: 'Bright Data', model: 'Scraping', dot: 'bg-teal-400', billingUrl: 'https://brightdata.com/cp/setting/billing',
      volume: `${stats.brightData.requests.toLocaleString('fr-FR')} req`,
      costUsd: bdConsumed,
      budgetUsd: brightDataBudgetUsd && brightDataBudgetUsd > 0 ? brightDataBudgetUsd : null,
      avail: brightDataBalanceUsd != null ? { usd: brightDataBalanceUsd, kind: 'solde API' }
        : brightDataBudgetUsd && brightDataBudgetUsd > 0 ? { usd: Math.max(0, brightDataBudgetUsd - bdConsumed), kind: 'restant' } : { usd: null, kind: null },
      badge: badgeOf(bdConsumed, brightDataBudgetUsd ?? null), pct: brightDataBudgetUsd && brightDataBudgetUsd > 0 ? bdConsumed / brightDataBudgetUsd : null,
    })
  }

  return { rows, totals: { totalUsd, tokensIn, tokensOut, over, warn } }
}
