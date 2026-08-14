// ⚠⚠ Le cas que ces tests protègent est RÉEL, lu dans `aiUsage/{uid}_2026-08` : DeepSeek,
// ~328 600 / 1 180 000 tokens sous `deepseek-v4-flash`, coût enregistré 0,0034 $ — cent fois
// moins que la réalité, parce que le tarif n'est arrivé au catalogue qu'en cours de mois.
// Un coût non nul n'est PAS la preuve qu'il est complet.
import { describe, it, expect } from 'vitest'
import { resolveModelCost, resolveProviderCost, summarizeModels } from './modelCost'

describe('resolveModelCost', () => {
  it('rattrape un coût PARTIEL : le tarif est arrivé en cours de mois', () => {
    // deepseek-v4-flash : 0,14 $ / 0,28 $ le million.
    const r = resolveModelCost('deepseek', 'deepseek-v4-flash', {
      tokensIn: 319_621, tokensOut: 1_182_393, costUsd: 0.0034,
    })
    expect(r.costUsd).toBeCloseTo(0.3758, 4)
    expect(r.estimated).toBe(true)
    expect(r.unpriced).toBe(false)
  })

  it('rattrape un coût resté à ZÉRO', () => {
    const r = resolveModelCost('deepseek', 'deepseek-v4-flash', {
      tokensIn: 319_621, tokensOut: 1_182_393, costUsd: 0,
    })
    expect(r.costUsd).toBeCloseTo(0.3758, 4)
    expect(r.estimated).toBe(true)
  })

  it('laisse intact un coût correctement enregistré', () => {
    // deepseek-chat : 0,27 $ / 1,10 $ le million → 0,00278 $, ce que la base porte déjà.
    const r = resolveModelCost('deepseek', 'deepseek-chat', {
      tokensIn: 8017, tokensOut: 558, costUsd: 0.00278,
    })
    expect(r.costUsd).toBeCloseTo(0.00278, 6)
    expect(r.estimated).toBe(false)
  })

  it('ne chiffre PAS un modèle hors catalogue — il le dit', () => {
    const r = resolveModelCost('deepseek', 'deepseek-v9-inconnu', { tokensIn: 500, tokensOut: 900, costUsd: 0 })
    expect(r.unpriced).toBe(true)
    expect(r.costUsd).toBe(0)
    expect(r.estimated).toBe(false)
  })

  it('zéro token n’est pas un tarif manquant', () => {
    const r = resolveModelCost('claude', 'claude-haiku-4-5', { tokensIn: 0, tokensOut: 0, costUsd: 0 })
    expect(r).toEqual({ costUsd: 0, unpriced: false, estimated: false })
  })
})

describe('resolveProviderCost', () => {
  it('somme les modèles rattrapés, sans jamais descendre sous le cumul de la base', () => {
    const cost = resolveProviderCost('deepseek', {
      // Le cumul du fournisseur porte la même sous-évaluation que ses lignes.
      costUsd: 0.0034,
      byModel: {
        'deepseek-v4-flash': { tokensIn: 319_621, tokensOut: 1_182_393, costUsd: 0.0034 },
        'deepseek-chat': { tokensIn: 8017, tokensOut: 558, costUsd: 0.00278 },
      },
    })
    expect(cost).toBeCloseTo(0.3758 + 0.00278, 4)
  })

  it('garde le cumul de la base quand aucun détail par modèle n’a été écrit', () => {
    // Écritures antérieures à `byModel` : rien à rattraper, rien à perdre non plus.
    expect(resolveProviderCost('claude', { costUsd: 1.23, byModel: {} })).toBeCloseTo(1.23, 6)
  })
})

describe('summarizeModels — le texte Gemini ne peut pas dépendre du modèle COCHÉ', () => {
  it('somme tous les modèles sauf ceux exclus', () => {
    // ⚠⚠ Cas réel : la dépense vient de `gemini-3.1-pro-preview` alors que les Réglages
    // cochent un autre modèle. En lisant `byModel[modèle coché]`, la ligne affichait 0 / 0.
    const s = summarizeModels('gemini', {
      'gemini-3.1-pro-preview': { tokensIn: 1000, tokensOut: 2000, costUsd: 0.05 },
      'gemini-3.1-flash-image-preview': { tokensIn: 10, tokensOut: 20, costUsd: 0.6 },
    }, ['gemini-3.1-flash-image-preview'])
    expect(s.tokensIn).toBe(1000)
    expect(s.tokensOut).toBe(2000)
    expect(s.dominantId).toBe('gemini-3.1-pro-preview')
    expect(s.hasDetail).toBe(true)
  })

  it('dit que le détail MANQUE quand rien n’a été écrit par modèle', () => {
    // L'appelant doit alors retomber sur le cumul du fournisseur — sans quoi il afficherait
    // zéro sur des écritures antérieures à `byModel`.
    expect(summarizeModels('gemini', {}, ['gemini-3.1-flash-image-preview']))
      .toMatchObject({ hasDetail: false, tokensIn: 0, costUsd: 0, dominantId: null })
  })

  it('remonte les drapeaux de TOUS les modèles, pas seulement du dominant', () => {
    const s = summarizeModels('deepseek', {
      'deepseek-chat': { tokensIn: 8017, tokensOut: 558, costUsd: 0.00278 },
      'deepseek-v9-inconnu': { tokensIn: 5, tokensOut: 5, costUsd: 0 },
    })
    expect(s.unpriced).toBe(true)
    expect(s.dominantId).toBe('deepseek-chat')
  })
})
