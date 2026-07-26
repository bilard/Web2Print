import { describe, it, expect } from 'vitest'
import { buildCostRows, costTotals } from './costModel'
import type { UsageStatsLike } from './types'

const stats: UsageStatsLike = {
  aiCost: {
    total: 12,
    byProvider: {
      claude: { tokensIn: 1_000_000, tokensOut: 500_000, costUsd: 10 },
      gemini: { tokensIn: 0, tokensOut: 0, costUsd: 0 },
      openai: { tokensIn: 200_000, tokensOut: 100_000, costUsd: 2 },
    },
  },
  scrape: { total: 3, byPlatform: { jina: { tokens: 5_000_000, requests: 0, costUsd: 3 }, firecrawl: { tokens: 0, requests: 0, costUsd: 0 } } },
  brightData: { requests: 400, costUsd: 1.2 },
  removebg: { images: 5, credits: 5, costUsd: 1 },
}

describe('buildCostRows', () => {
  const rows = buildCostRows(stats, { monthlyBudgetUsd: { claude: 20 }, brightDataBudgetUsd: 5 })

  it('inclut chaque connecteur consommé, trié par coût desc', () => {
    expect(rows.map((r) => r.key)).toEqual(['llm:claude', 'scrape:jina', 'llm:openai', 'scrape:brightdata', 'image:removebg'])
  })

  it('exclut les providers à 0 sans budget (gemini)', () => {
    expect(rows.find((r) => r.key === 'llm:gemini')).toBeUndefined()
  })

  it('calcule le restant = budget − dépensé', () => {
    expect(rows.find((r) => r.key === 'llm:claude')!.remainingUsd).toBe(10) // 20 - 10
    expect(rows.find((r) => r.key === 'scrape:brightdata')!.remainingUsd).toBeCloseTo(3.8) // 5 - 1.2
    expect(rows.find((r) => r.key === 'scrape:jina')!.remainingUsd).toBeNull() // pas de budget scraping
  })

  it('classe par groupe (LLM / Scraping / Image)', () => {
    expect(rows.find((r) => r.key === 'scrape:jina')!.group).toBe('Scraping')
    expect(rows.find((r) => r.key === 'image:removebg')!.group).toBe('Image')
  })
})

describe('costTotals', () => {
  it('agrège par groupe (Bright Data dans Scraping)', () => {
    const t = costTotals(stats)
    expect(t.byGroup.LLM).toBe(12)
    expect(t.byGroup.Scraping).toBeCloseTo(4.2) // jina 3 + BD 1.2
    expect(t.byGroup.Image).toBe(1)
    expect(t.totalUsd).toBeCloseTo(17.2)
    expect(t.tokensLlm).toBe(1_800_000)
  })
})
