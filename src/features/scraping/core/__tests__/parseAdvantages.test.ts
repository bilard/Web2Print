// src/features/scraping/core/__tests__/parseAdvantages.test.ts
import { describe, it, expect } from 'vitest'
import { parseAdvantagesFromMarkdown, mergeGroupsIntoAdvantages } from '../parsers/parseAdvantages'

const MD_FLAT = `## Points forts

- Robuste et très durable
- Compacte et légère
- Batterie longue durée
`

const MD_GROUPED = `## Avantages performance

- Couple maxi 250 Nm
- 3 vitesses variables

## Avantages confort

- Poignée ergonomique
- LED intégrée au boîtier
`

describe('parseAdvantagesFromMarkdown', () => {
  it('extrait une liste plate sans groupes', () => {
    const advs = parseAdvantagesFromMarkdown(MD_FLAT)
    expect(advs).toHaveLength(3)
    expect(advs[0]).toEqual({ text: 'Robuste et très durable' })
  })

  it('extrait avec groupes quand sections multiples', () => {
    const advs = parseAdvantagesFromMarkdown(MD_GROUPED)
    expect(advs).toHaveLength(4)
    expect(advs.find(a => a.text.includes('Couple maxi'))).toMatchObject({ group: expect.stringContaining('performance') })
    expect(advs.find(a => a.text.includes('Poignée'))).toMatchObject({ group: expect.stringContaining('confort') })
  })

  it('renvoie tableau vide si pas d\'avantages', () => {
    expect(parseAdvantagesFromMarkdown('# Produit\n\nDescription seulement')).toEqual([])
  })

  it('Milwaukee : "## caractéristiques" seul + bullets longs → traité comme features', () => {
    // Ambiguïté FR : "Caractéristiques" peut être specs (Dyson) OU features (Milwaukee).
    // Heuristique : si ≥ 3 bullets longs (≥ 30 chars) sans pattern "name: value",
    // c'est une section de features.
    const md = `# Perceuse Milwaukee M18 FPD3

## caractéristiques

*   Rendement supérieur avec un couple puissant de 158 Nm
*   Design compact avec 175 mm de long pour accéder facilement aux espaces étroits
*   AUTOSTOP™, un mécanisme de sécurité breveté permettant un arrêt immédiat
*   Nouveau mandrin métal 13 mm offrant une meilleure prise des mors
*   LED pour une meilleure visibilité dans des situations de faible éclairage
`
    const advs = parseAdvantagesFromMarkdown(md)
    expect(advs.length).toBeGreaterThanOrEqual(5)
    expect(advs.some(a => a.text.includes('158 Nm'))).toBe(true)
    expect(advs.some(a => a.text.includes('AUTOSTOP'))).toBe(true)
    expect(advs.some(a => a.text.includes('mandrin'))).toBe(true)
  })

  it('Dyson : "## Caractéristiques" + paires nom/valeur → reste section specs (pas de features)', () => {
    // Cas inverse : section "Caractéristiques" avec paires courtes "name: value"
    // → c'est des specs, pas des features → ne doit PAS extraire d'advantages.
    const md = `# Aspirateur

## Avantages produits

- Filtration HEPA renforcée

## Caractéristiques

- Puissance: 1500 W
- Capacité: 2 L
- Poids: 5 kg
`
    const advs = parseAdvantagesFromMarkdown(md)
    // Seule la section Avantages doit produire des items
    expect(advs.some(a => a.text.includes('HEPA'))).toBe(true)
    expect(advs.some(a => a.text.includes('Puissance'))).toBe(false)
    expect(advs.some(a => a.text.includes('Capacité'))).toBe(false)
  })
})

describe('mergeGroupsIntoAdvantages', () => {
  it('ajoute les groupes sans supprimer d\'items existants', () => {
    const existing = [{ text: 'Robuste' }, { text: 'Compacte' }]
    const md = [{ text: 'Robuste', group: 'Performance' }, { text: 'Légère', group: 'Confort' }]
    const merged = mergeGroupsIntoAdvantages(existing, md)
    expect(merged).toHaveLength(3)
    expect(merged.find(a => a.text === 'Robuste')).toMatchObject({ group: 'Performance' })
    expect(merged.find(a => a.text === 'Compacte')).toBeDefined()
    expect(merged.find(a => a.text === 'Légère')).toMatchObject({ group: 'Confort' })
  })

  it('ne duplique pas un item déjà présent', () => {
    const existing = [{ text: 'Robuste' }]
    const md = [{ text: 'Robuste', group: 'Performance' }]
    const merged = mergeGroupsIntoAdvantages(existing, md)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ text: 'Robuste', group: 'Performance' })
  })
})

// Extrait RÉEL d'une fiche Castorama (Jina, 2026-07-11) : heading Kingfisher
// « Caractéristiques et avantages » — sortait de la zone features (backtracking
// sur `caract…s?` sans \b) → 0 avantage sur toutes les fiches Castorama.
const CASTORAMA_MD = `# Abri de jardin OAKLAND 757 en résine - KETER

### Caractéristiques et avantages

Pour les Soldes d’été, Castorama vous accompagne avec une sélection de produits pour aménager, rénover et entretenir votre maison et votre extérieur

*   Structure en polypropylène brossé avec un effet bois selon la technologie Duotech traité anti-UV.
*   Surface hors tout : 4,5 m²
*   Système d'aération pour garder le contenu au sec et aéré
*   Double porte cadenassable (cadenas non fourni)
*   Garantie : 10 ans

### Spécifications techniques

| Type d'article | Abri de jardin |
| --- |
| Marque | Keter |
`

describe('parseAdvantagesFromMarkdown — « Caractéristiques et avantages » (Castorama)', () => {
  it('entre dans la zone features et capture les bullets prose', () => {
    const advs = parseAdvantagesFromMarkdown(CASTORAMA_MD)
    const texts = advs.map((a) => a.text)
    expect(texts.some((t) => t.includes('polypropylène brossé'))).toBe(true)
    expect(texts.some((t) => t.includes("Système d'aération"))).toBe(true)
  })

  it('exclut la bannière commerciale et les paires « Nom : Valeur » (déjà specs)', () => {
    const advs = parseAdvantagesFromMarkdown(CASTORAMA_MD)
    const texts = advs.map((a) => a.text)
    expect(texts.some((t) => t.includes('Soldes'))).toBe(false)
    expect(texts.some((t) => t.startsWith('Surface hors tout'))).toBe(false)
    expect(texts.some((t) => t.startsWith('Garantie'))).toBe(false)
  })

  it('ne pollue pas le groupe avec « et avantages » résiduel', () => {
    const advs = parseAdvantagesFromMarkdown(CASTORAMA_MD)
    expect(advs.every((a) => a.group !== 'et avantages')).toBe(true)
  })
})
