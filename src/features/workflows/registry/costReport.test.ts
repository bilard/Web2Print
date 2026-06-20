import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import { buildCostRows, buildHtml, buildEmailHtml, type BrightDataView } from './costReport'
import type { AiCostStats } from '@/features/stats/useUsageStats'
import { initialSelected, initialBudgets } from '@/stores/aiSettings.store'
import type { AiProvider } from '@/lib/aiModels'

const leaf = (i: number, o: number, c: number) => ({ tokensIn: i, tokensOut: o, costUsd: c })
const emptyP = () => ({ tokensIn: 0, tokensOut: 0, costUsd: 0, byModel: {} })

function mockStats(): AiCostStats {
  return {
    total: 0,
    byProvider: {
      claude: emptyP(),
      gemini: {
        tokensIn: 75_500, tokensOut: 66_199, costUsd: 1.8881 + 0.0626, byModel: {
          'gemini-3.5-flash': leaf(20_100, 3_599, 0.0626),
          'gemini-3.1-flash-image-preview': leaf(2_500, 62_600, 1.8881),
        },
      },
      openai: emptyP(),
      deepseek: leaf(1_140_000, 501_800, 0.8529) as AiCostStats['byProvider']['deepseek'],
      qwen: emptyP(),
      kimi: emptyP(),
      openrouter: emptyP(),
    } as AiCostStats['byProvider'],
  }
}

describe('buildCostRows', () => {
  it('éclate Gemini en 2 lignes (texte + image) sans double-compter', () => {
    const rows = buildCostRows(mockStats(), initialSelected(), initialBudgets())
    const gemini = rows.filter((r) => r.provider === 'gemini')
    expect(gemini).toHaveLength(2)
    const [text, image] = gemini
    expect(text.isSubRow).toBeFalsy()
    expect(text.costUsd).toBeCloseTo(0.0626, 4)
    expect(image.isSubRow).toBe(true)
    expect(image.costUsd).toBeCloseTo(1.8881, 4)
    // 7 providers, gemini compte double → 8 lignes
    expect(rows).toHaveLength(8)
  })

  it('reporte tokens/coût pour les providers simples', () => {
    const rows = buildCostRows(mockStats(), initialSelected(), initialBudgets())
    const ds = rows.find((r) => r.provider === 'deepseek')!
    expect(ds.tokensIn).toBe(1_140_000)
    expect(ds.costUsd).toBeCloseTo(0.8529, 4)
  })
})

describe('buildHtml', () => {
  it('produit un document HTML complet avec totaux et providers', () => {
    const rows = buildCostRows(mockStats(), initialSelected(), initialBudgets())
    const totalUsd = rows.reduce((s, r) => s + r.costUsd, 0) + 1.16
    const bd: BrightDataView = {
      consumedUsd: 1.16, balanceUsd: 2.27, pendingBalanceUsd: 0,
      accountStatus: 'active', nextBillingDate: '2026-07-01', isLive: true,
      localRequests: 0, kind: 'unset', show: true,
    }
    const html = buildHtml({
      title: 'Consommation IA & Scraping', month: '2026-06',
      dateLabel: '20 juin 2026', updatedLabel: '18:06:02',
      totalUsd, tokensIn: rows.reduce((s, r) => s + r.tokensIn, 0),
      tokensOut: rows.reduce((s, r) => s + r.tokensOut, 0),
      overCount: 0, warnCount: 0, rows,
      balances: { deepseek: 9.66, openrouter: 10 } as Record<string, number | null>,
      brightData: bd,
    })
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('Total ce mois')
    expect(html).toContain('Claude (Anthropic)')
    expect(html).toContain('Bright Data')
    expect(html).toContain('Gemini 3.1 Flash Image')
    expect(html).not.toContain('undefined')
    // Aperçu visuel inspectable manuellement.
    if (process.env.WRITE_PREVIEW) writeFileSync('/tmp/cost-report-preview.html', html)
  })
})

describe('buildEmailHtml', () => {
  const inputFixture = () => {
    const rows = buildCostRows(mockStats(), initialSelected(), initialBudgets())
    const bd: BrightDataView = {
      consumedUsd: 1.16, balanceUsd: 2.27, pendingBalanceUsd: 0,
      accountStatus: 'active', nextBillingDate: '2026-07-01', isLive: true,
      localRequests: 0, kind: 'unset', show: true,
    }
    return {
      title: 'Consommation IA & Scraping', month: '2026-06',
      dateLabel: '20 juin 2026', updatedLabel: '18:06:02',
      totalUsd: rows.reduce((s, r) => s + r.costUsd, 0) + 1.16,
      tokensIn: rows.reduce((s, r) => s + r.tokensIn, 0),
      tokensOut: rows.reduce((s, r) => s + r.tokensOut, 0),
      overCount: 0, warnCount: 0, rows,
      balances: { deepseek: 9.66, openrouter: 10 } as Record<string, number | null>,
      brightData: bd,
    }
  }

  it('contient les mêmes données que le dashboard', () => {
    const html = buildEmailHtml(inputFixture())
    expect(html).toContain('Total ce mois')
    expect(html).toContain('Claude (Anthropic)')
    expect(html).toContain('Bright Data')
    expect(html).toContain('Gemini 3.1 Flash Image')
    expect(html).not.toContain('undefined')
  })

  it('est email-safe : fragment, tables, styles inline, sans grid/flex ni <style>', () => {
    const html = buildEmailHtml(inputFixture())
    // Fragment autonome (pas un document complet) → injectable dans un corps de mail.
    expect(html).not.toContain('<!doctype')
    expect(html).not.toMatch(/<html[\s>]/i)
    expect(html).not.toContain('<style>')
    // Layout tabulaire + styles 100 % inline.
    expect(html).toContain('<table')
    expect(html).toContain('style="')
    // Aucune mise en page que Gmail strippe.
    expect(html).not.toContain('display:grid')
    expect(html).not.toContain('display:flex')
    // Fond sombre porté inline (lisible même si le client ne garde rien d'autre).
    expect(html).toContain('background:#0b0b0f')
    if (process.env.WRITE_PREVIEW) writeFileSync('/tmp/cost-report-email-preview.html', html)
  })
})
