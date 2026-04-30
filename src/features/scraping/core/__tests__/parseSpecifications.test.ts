// src/features/scraping/core/__tests__/parseSpecifications.test.ts
import { describe, it, expect } from 'vitest'
import {
  parseSpecsFromMarkdown,
  extractSpecsFromHtml,
  extractCharacteristicsBlobs,
  parseCharacteristicsBlob,
  truncateBeforeNonProductSections,
} from '../parsers/parseSpecifications'

const MD_TABLE = `## Caractéristiques techniques

| Caractéristique | Valeur |
|---|---|
| Tension | 18 V |
| Couple maxi | 60 Nm |
| Poids | 1.5 kg |
`

const MD_GROUPED = `## Moteur

| Tension | 18 V |
| Puissance | 500 W |

## Batterie

| Capacité | 4 Ah |
| Type | Li-Ion |
`

const MD_INLINE = `## Spécifications

Tension : 18 V
Couple maxi : 60 Nm
Poids : 1.5 kg
`

describe('parseSpecsFromMarkdown', () => {
  it('parse une table simple', () => {
    const specs = parseSpecsFromMarkdown(MD_TABLE)
    expect(specs).toHaveLength(3)
    expect(specs[0]).toEqual({
      name: 'Tension',
      value: '18 V',
      group: expect.stringContaining('Caractéristiques'),
    })
  })

  it('respecte les groupes quand sections multiples', () => {
    const specs = parseSpecsFromMarkdown(MD_GROUPED)
    const tensionSpec = specs.find(s => s.name === 'Tension')
    const capSpec = specs.find(s => s.name === 'Capacité')
    expect(tensionSpec?.group).toMatch(/Moteur/i)
    expect(capSpec?.group).toMatch(/Batterie/i)
  })

  it('parse des paires inline (Clé : valeur)', () => {
    const specs = parseSpecsFromMarkdown(MD_INLINE)
    expect(specs).toHaveLength(3)
    expect(specs.find(s => s.name === 'Tension')?.value).toBe('18 V')
  })

  it('renvoie tableau vide si pas de specs', () => {
    expect(parseSpecsFromMarkdown('# Produit\n\nDescription')).toEqual([])
  })
})

describe('extractSpecsFromHtml', () => {
  it('extrait depuis un <table> orphelin avec ≥2 lignes de specs', () => {
    const html = `<table>
      <tr><th>Tension</th><td>18 V</td></tr>
      <tr><th>Couple maxi</th><td>60 Nm</td></tr>
    </table>`
    const md = extractSpecsFromHtml(html)
    expect(md).not.toBeNull()
    expect(md).toContain('Tension')
    expect(md).toContain('18 V')
    expect(md).toContain('Couple maxi')
  })

  it('renvoie null si pas de table exploitable', () => {
    expect(extractSpecsFromHtml('<div>nothing here</div>')).toBeNull()
  })

  it('extrait depuis JSON-LD additionalProperty', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Perceuse 18V',
      additionalProperty: [
        { name: 'Tension', value: '18', unitText: 'V' },
        { name: 'Poids', value: '1.5', unitText: 'kg' },
      ],
    })}</script>`
    const md = extractSpecsFromHtml(html)
    expect(md).toContain('Tension')
    expect(md).toContain('18 V')
    expect(md).toContain('Poids')
  })
})

describe('extractCharacteristicsBlobs', () => {
  it('extrait un blob "Caractéristiques ... Voir moins"', () => {
    const md = 'Texte avant Caractéristiques Tension : 18 V Couple : 60 Nm Voir moins texte après'
    const blobs = extractCharacteristicsBlobs(md)
    expect(blobs).toHaveLength(1)
    expect(blobs[0]).toContain('Tension : 18 V')
  })

  it('renvoie tableau vide si aucun blob', () => {
    expect(extractCharacteristicsBlobs('Texte sans le pattern')).toEqual([])
  })
})

describe('parseCharacteristicsBlob', () => {
  // Le regex repère la frontière de la prochaine clé via une majuscule initiale,
  // donc les valeurs doivent rester en lowercase pour ne pas être tronquées.
  it('parse un blob inline en paires', () => {
    const result = parseCharacteristicsBlob('Couleur : rouge Matière : plastique Poids : 1.5kg')
    expect(result['Couleur']).toBe('rouge')
    expect(result['Matière']).toBe('plastique')
    expect(result['Poids']).toBe('1.5kg')
  })

  it('filtre les clés contenant "tarif" ou "prix"', () => {
    const result = parseCharacteristicsBlob('Couleur : rouge Prix : 200€')
    expect(result['Couleur']).toBe('rouge')
    expect(result['Prix']).toBeUndefined()
  })
})

describe('truncateBeforeNonProductSections', () => {
  it('tronque avant la section "Documents"', () => {
    const md = '# Produit\n\nContenu produit\n\n## Documents\n\nDoc1.pdf'
    const result = truncateBeforeNonProductSections(md)
    expect(result).toContain('Contenu produit')
    expect(result).not.toContain('Documents')
    expect(result).not.toContain('Doc1.pdf')
  })

  it('tronque avant "Produits associés"', () => {
    const md = '# Produit\n\n## Spécifications\n\nTension : 18V\n\n## Produits associés\n\nAutre'
    const result = truncateBeforeNonProductSections(md)
    expect(result).toContain('Tension')
    expect(result).not.toContain('Produits associés')
  })

  it('renvoie le markdown complet si aucune section à tronquer', () => {
    const md = '# Produit\n\n## Spécifications\n\nTension : 18V'
    expect(truncateBeforeNonProductSections(md)).toBe(md)
  })
})
