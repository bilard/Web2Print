// ⚠⚠ Ce que ces tests protègent : le cron écrit sa consommation au MÊME endroit et sous
// les MÊMES noms que le navigateur. Une divergence ne casse rien visiblement — elle fait
// simplement disparaître la dépense des écrans et du plafond mensuel.
import { describe, it, expect } from 'vitest'
import { normalizeProvider, usageMonth, buildUsageUpdate } from './aiUsageServer'
import { pricingOf, costOf, SERVER_MODEL_PRICING } from './modelPricing'

describe('compteur de consommation serveur', () => {
  it('range Anthropic sous le nom du CLIENT', () => {
    // `anthropic` et `claude` sont le même fournisseur : écrire sous l'alias serveur
    // créerait une neuvième colonne que l'écran n'affiche pas.
    expect(normalizeProvider('anthropic')).toBe('claude')
    expect(normalizeProvider('claude')).toBe('claude')
    expect(normalizeProvider('deepseek')).toBe('deepseek')
  })

  it('refuse un provider que le client ne connaît pas', () => {
    expect(normalizeProvider('mistral')).toBeNull()
    expect(normalizeProvider('')).toBeNull()
  })

  it('clé mensuelle en UTC, identique à celle du client', () => {
    expect(usageMonth(new Date('2026-08-14T22:30:00Z'))).toBe('2026-08')
    expect(usageMonth(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01')
  })
})

describe('tarifs serveur', () => {
  it('chiffre le cas réel du terrain', () => {
    // 319 621 tokens en entrée / 1 182 393 en sortie sous deepseek-v4-flash — la
    // consommation qui s'affichait « 0,000000 € » faute de tarif.
    const p = pricingOf('deepseek-v4-flash')!
    expect(p).toEqual({ input: 0.14, output: 0.28 })
    expect(costOf(319_621, 1_182_393, p)).toBeCloseTo(0.3758, 4)
  })

  it('un modèle inconnu n’invente PAS de tarif', () => {
    expect(pricingOf('deepseek-v9-inconnu')).toBeUndefined()
  })

  it('aucun tarif nul ne traîne dans le catalogue', () => {
    // Un zéro ici serait indiscernable d'un modèle gratuit et rendrait la dépense muette.
    for (const [id, p] of Object.entries(SERVER_MODEL_PRICING)) {
      expect(p.input + p.output, `${id} : tarif à zéro`).toBeGreaterThan(0)
    }
  })
})

describe('forme du document écrit', () => {
  it('⚠⚠ la clé de modèle garde ses POINTS, comme celle du navigateur', () => {
    // Vérifié dans la base de production : `byModel: ['gemini-3.1-pro-preview']`. Un objet
    // imbriqué passé à `set()` écrit des clés de MAP, pas des chemins de champ — échapper
    // le point créerait `gemini-3_1-pro-preview`, une seconde ligne pour le même modèle,
    // que le catalogue ne reconnaîtrait pas et que l'écran dirait « tarif inconnu ».
    const doc = buildUsageUpdate('gemini', 'gemini-3.1-pro-preview', 10, 20, 0.5) as {
      byProvider: Record<string, { byModel: Record<string, unknown> }>
    }
    expect(Object.keys(doc.byProvider.gemini.byModel)).toEqual(['gemini-3.1-pro-preview'])
  })

  it('écrit les mêmes champs que le client, au même endroit', () => {
    const doc = buildUsageUpdate('deepseek', 'deepseek-chat', 1, 2, 3) as Record<string, Record<string, unknown>>
    expect(Object.keys(doc).sort()).toEqual(['byProvider', 'total'])
    expect(Object.keys(doc.total)).toEqual(['costUsd'])
    const prov = (doc.byProvider as Record<string, Record<string, unknown>>).deepseek
    expect(Object.keys(prov).sort()).toEqual(['byModel', 'costUsd', 'tokensIn', 'tokensOut'])
  })

  it('un modèle sans nom ne crée pas de clé vide', () => {
    const doc = buildUsageUpdate('openai', '', 1, 1, 0) as {
      byProvider: Record<string, { byModel: Record<string, unknown> }>
    }
    expect(Object.keys(doc.byProvider.openai.byModel)).toEqual(['inconnu'])
  })
})
