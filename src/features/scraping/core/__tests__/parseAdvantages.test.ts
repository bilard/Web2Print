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
