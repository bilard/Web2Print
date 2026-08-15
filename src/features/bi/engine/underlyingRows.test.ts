// ⚠⚠ Ce que ces tests protègent : un détail qui ne compose pas le total qu'on a cliqué.
// Un écart entre « 22 509 » et les lignes affichées derrière ce chiffre ruine la confiance
// dans TOUT le tableau de bord — on ne sait plus laquelle des deux vues ment.
import { describe, it, expect } from 'vitest'
import { underlyingRows } from './underlyingRows'
import type { DataSource, Row } from '../registry/types'

const source: DataSource = {
  id: 'watch.summary', labelKey: 'bi.source.watchSummary', engine: 'client',
  dimensions: [
    { id: 'domain', labelKey: 'bi.dim.competitor', kind: 'text', get: (r) => r.domain },
    // Champ CALCULÉ : le détail doit montrer ce que la tuile mesure, pas la donnée brute.
    { id: 'progress', labelKey: 'bi.dim.watchProgress', kind: 'number', format: 'pct',
      get: (r) => (typeof r.raw === 'number' ? r.raw * 100 : null) },
  ],
  measures: [],
}

const rows: Row[] = [
  { domain: 'alpha.fr', raw: 0.5, ignoré: 'x' },
  { domain: 'beta.fr', raw: 1 },
  { domain: 'alpha.fr', raw: null },
]

describe('lignes sous-jacentes', () => {
  it('retient EXACTEMENT ce que le filtre du moteur retient', () => {
    const r = underlyingRows(rows, [{ field: 'domain', op: 'eq', value: 'alpha.fr' }], source)
    expect(r.total).toBe(2)
    expect(r.rows.map((x) => x.domain)).toEqual(['alpha.fr', 'alpha.fr'])
  })

  it('montre la valeur CALCULÉE de la dimension, pas la donnée d’avant', () => {
    const r = underlyingRows(rows, [], source)
    expect(r.rows[0].progress).toBe(50)
    // Un champ que la source n'expose pas n'a rien à faire dans le détail.
    expect(r.rows[0]).not.toHaveProperty('ignoré')
  })

  it('plafonne l’échantillon mais compte TOUTES les lignes', () => {
    // ⚠ Sans `total`, un détail tronqué en silence se lirait comme un détail complet.
    const many: Row[] = Array.from({ length: 12 }, (_, i) => ({ domain: `s${i}.fr`, raw: 0 }))
    const r = underlyingRows(many, [], source, 5)
    expect(r.rows).toHaveLength(5)
    expect(r.total).toBe(12)
    expect(r.truncated).toBe(true)
  })

  it('⚠ retire les colonnes que RIEN ne renseigne', () => {
    // Vu à l'écran : « Référence secondaire » alignait cinq cents tirets et poussait les
    // colonnes utiles hors du tiroir.
    const source2: DataSource = {
      ...source,
      dimensions: [
        ...source.dimensions,
        { id: 'vide', labelKey: 'bi.dim.column', kind: 'text', get: () => null },
      ],
    }
    const r = underlyingRows(rows, [], source2)
    expect(r.columns.map((c) => c.key)).toEqual(['domain', 'progress'])
  })

  it('ne se dit pas tronqué quand tout tient', () => {
    const r = underlyingRows(rows, [], source, 200)
    expect(r.truncated).toBe(false)
    expect(r.total).toBe(3)
  })
})
