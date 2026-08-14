// ⚠⚠ Ce que ces tests protègent : un modèle hors catalogue est facturé ZÉRO par
// `recordAiUsage`, en silence. L'écran doit le DIRE. Le cas de référence est réel, lu dans
// `aiUsage/{uid}_2026-08` : DeepSeek, 319 621 tokens en entrée et 1 182 393 en sortie sous
// `deepseek-v4-flash`, coût enregistré 0 — affiché « 0,000000 € », donc lu comme gratuit.
import { describe, it, expect } from 'vitest'
import { buildOpsCostRows } from './opsCostRows'
import type { AiCostStats } from '@/features/stats/useUsageStats'
import type { AiProvider } from '@/lib/aiModels'

const PROVIDERS: AiProvider[] = ['claude', 'gemini', 'openai', 'deepseek', 'qwen', 'kimi', 'glm', 'openrouter']

const empty = () => ({ tokensIn: 0, tokensOut: 0, costUsd: 0, byModel: {} })

const statsWith = (byProvider: Partial<AiCostStats['byProvider']>): AiCostStats => ({
  total: 0,
  byProvider: {
    claude: empty(), gemini: empty(), openai: empty(), deepseek: empty(),
    qwen: empty(), kimi: empty(), glm: empty(), openrouter: empty(),
    ...byProvider,
  },
} as AiCostStats)

describe('lignes du bloc « Coûts des modèles »', () => {
  it('RATTRAPE le coût quand le tarif est connu depuis, sans le faire passer pour un relevé', () => {
    // Le cas réel : le coût est figé à 0 en base, mais `deepseek-v4-flash` est désormais au
    // catalogue (0,14 $ / 0,28 $ le million). 319 621 × 0,14 + 1 182 393 × 0,28, par million.
    const { rows, totalUsd, partial } = buildOpsCostRows(PROVIDERS, statsWith({
      deepseek: {
        tokensIn: 319_621, tokensOut: 1_182_393, costUsd: 0,
        byModel: { 'deepseek-v4-flash': { tokensIn: 319_621, tokensOut: 1_182_393, costUsd: 0 } },
      },
    }))
    expect(rows).toHaveLength(1)
    expect(rows[0].models[0]).toMatchObject({ id: 'deepseek-v4-flash', unpriced: false, estimated: true })
    expect(rows[0].models[0].costUsd).toBeCloseTo(0.3758, 4)
    // Le cumul du fournisseur vaut 0 en base : il ne doit pas écraser ce qu'on vient de
    // rattraper, sinon l'écran afficherait un total inférieur à la somme de ses lignes.
    expect(rows[0].costUsd).toBeCloseTo(0.3758, 4)
    expect(totalUsd).toBeCloseTo(0.3758, 4)
    // Plus rien d'inconnu : le total est un vrai total.
    expect(partial).toBe(false)
  })

  it('dénonce un modèle NON TARIFÉ au lieu de l’afficher gratuit', () => {
    const { rows, partial } = buildOpsCostRows(PROVIDERS, statsWith({
      deepseek: {
        tokensIn: 500, tokensOut: 900, costUsd: 0,
        byModel: { 'deepseek-v9-inconnu': { tokensIn: 500, tokensOut: 900, costUsd: 0 } },
      },
    }))
    expect(rows[0].models[0]).toMatchObject({ id: 'deepseek-v9-inconnu', unpriced: true, estimated: false })
    // Le total ne peut plus se présenter comme un total : il lui manque une facture.
    expect(partial).toBe(true)
  })

  it('un modèle du catalogue porte son LIBELLÉ, et son coût compte normalement', () => {
    const { rows, totalUsd, partial } = buildOpsCostRows(PROVIDERS, statsWith({
      deepseek: {
        tokensIn: 8017, tokensOut: 558, costUsd: 0.00278,
        byModel: { 'deepseek-chat': { tokensIn: 8017, tokensOut: 558, costUsd: 0.00278 } },
      },
    }))
    expect(rows[0].models[0]).toMatchObject({ label: 'DeepSeek Chat (V4)', unpriced: false, estimated: false })
    expect(totalUsd).toBeCloseTo(0.00278, 6)
    expect(partial).toBe(false)
  })

  it('un modèle inconnu garde son IDENTIFIANT brut — c’est lui, l’information utile', () => {
    const { rows } = buildOpsCostRows(PROVIDERS, statsWith({
      gemini: {
        tokensIn: 10, tokensOut: 5, costUsd: 0,
        byModel: { 'gemini-9.9-experimental': { tokensIn: 10, tokensOut: 5, costUsd: 0 } },
      },
    }))
    expect(rows[0].models[0].label).toBe('gemini-9.9-experimental')
    expect(rows[0].models[0].unpriced).toBe(true)
  })

  it('classe le plus cher d’abord, puis le plus gros volume à coût égal', () => {
    const { rows } = buildOpsCostRows(PROVIDERS, statsWith({
      gemini: {
        tokensIn: 30, tokensOut: 30, costUsd: 0.5,
        byModel: {
          petit: { tokensIn: 1, tokensOut: 1, costUsd: 0 },
          gros: { tokensIn: 20, tokensOut: 20, costUsd: 0 },
          cher: { tokensIn: 9, tokensOut: 9, costUsd: 0.5 },
        },
      },
    }))
    expect(rows[0].models.map((m) => m.id)).toEqual(['cher', 'gros', 'petit'])
  })

  it('ignore les fournisseurs qui n’ont rien consommé', () => {
    expect(buildOpsCostRows(PROVIDERS, statsWith({})).rows).toEqual([])
    expect(buildOpsCostRows(PROVIDERS, undefined).rows).toEqual([])
  })

  it('zéro token ET zéro coût sur un modèle n’est PAS un tarif manquant', () => {
    const { rows, partial } = buildOpsCostRows(PROVIDERS, statsWith({
      claude: {
        tokensIn: 100, tokensOut: 50, costUsd: 0.01,
        byModel: {
          'claude-opus-4-8': { tokensIn: 100, tokensOut: 50, costUsd: 0.01 },
          'claude-haiku-4-5': { tokensIn: 0, tokensOut: 0, costUsd: 0 },
        },
      },
    }))
    expect(rows[0].models.find((m) => m.id === 'claude-haiku-4-5')?.unpriced).toBe(false)
    expect(partial).toBe(false)
  })
})
