// Modèle de coûts UNIFIÉ du tableau de bord Finances. PUR (testable). Agrège tous les
// connecteurs (LLM par provider + Jina/Firecrawl + Bright Data + Remove.bg) en lignes
// homogènes {volume, coût, budget, restant}. Les coûts sont STOCKÉS en USD ; l'€ est une
// conversion d'affichage (pas de coût € persisté).
import type { UsageStatsLike } from './types'

export const USD_TO_EUR = 0.92
export const eur = (usd: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(usd * USD_TO_EUR)

type CostGroup = 'LLM' | 'Scraping' | 'Image'

export interface CostRow {
  key: string
  label: string
  group: CostGroup
  volume: string
  costUsd: number
  budgetUsd: number | null
  remainingUsd: number | null
}

const LLM_LABEL: Record<string, string> = {
  claude: 'Claude (Anthropic)', gemini: 'Gemini (Google)', openai: 'OpenAI',
  deepseek: 'DeepSeek', qwen: 'Qwen', kimi: 'Kimi', glm: 'GLM', openrouter: 'OpenRouter',
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M tokens`
  if (n >= 1_000) return `${(n / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k tokens`
  return `${n} tokens`
}

export interface Budgets {
  monthlyBudgetUsd?: Record<string, number | null>
  brightDataBudgetUsd?: number | null
}

export function buildCostRows(stats: UsageStatsLike, budgets: Budgets): CostRow[] {
  const rows: CostRow[] = []

  // LLM par provider
  for (const [provider, u] of Object.entries(stats.aiCost.byProvider)) {
    const budget = budgets.monthlyBudgetUsd?.[provider] ?? null
    if (u.costUsd <= 0 && !budget) continue
    rows.push({
      key: `llm:${provider}`,
      label: LLM_LABEL[provider] ?? provider,
      group: 'LLM',
      volume: fmtTokens(u.tokensIn + u.tokensOut),
      costUsd: u.costUsd,
      budgetUsd: budget && budget > 0 ? budget : null,
      remainingUsd: budget && budget > 0 ? Math.max(0, budget - u.costUsd) : null,
    })
  }

  // Scraping — Jina / Firecrawl (scrapeUsage)
  for (const [platform, u] of Object.entries(stats.scrape.byPlatform)) {
    if (u.costUsd <= 0) continue
    const label = platform === 'jina' ? 'Jina (scraping)' : platform === 'firecrawl' ? 'Firecrawl' : platform
    rows.push({
      key: `scrape:${platform}`,
      label,
      group: 'Scraping',
      volume: u.tokens > 0 ? fmtTokens(u.tokens) : `${u.requests} req`,
      costUsd: u.costUsd,
      budgetUsd: null,
      remainingUsd: null,
    })
  }

  // Bright Data
  const bdBudget = budgets.brightDataBudgetUsd ?? null
  if (stats.brightData.costUsd > 0 || (bdBudget && bdBudget > 0)) {
    rows.push({
      key: 'scrape:brightdata',
      label: 'Bright Data',
      group: 'Scraping',
      volume: `${stats.brightData.requests.toLocaleString('fr-FR')} req`,
      costUsd: stats.brightData.costUsd,
      budgetUsd: bdBudget && bdBudget > 0 ? bdBudget : null,
      remainingUsd: bdBudget && bdBudget > 0 ? Math.max(0, bdBudget - stats.brightData.costUsd) : null,
    })
  }

  // Remove.bg
  if (stats.removebg.costUsd > 0) {
    rows.push({
      key: 'image:removebg',
      label: 'Remove.bg',
      group: 'Image',
      volume: `${stats.removebg.images} img`,
      costUsd: stats.removebg.costUsd,
      budgetUsd: null,
      remainingUsd: null,
    })
  }

  return rows.sort((a, b) => b.costUsd - a.costUsd)
}

export interface CostTotals {
  totalUsd: number
  byGroup: Record<CostGroup, number>
  tokensLlm: number
}

export function costTotals(stats: UsageStatsLike): CostTotals {
  const byGroup: Record<CostGroup, number> = { LLM: 0, Scraping: 0, Image: 0 }
  let tokensLlm = 0
  for (const u of Object.values(stats.aiCost.byProvider)) { byGroup.LLM += u.costUsd; tokensLlm += u.tokensIn + u.tokensOut }
  for (const u of Object.values(stats.scrape.byPlatform)) byGroup.Scraping += u.costUsd
  byGroup.Scraping += stats.brightData.costUsd
  byGroup.Image += stats.removebg.costUsd
  return { totalUsd: byGroup.LLM + byGroup.Scraping + byGroup.Image, byGroup, tokensLlm }
}
