import { describe, it, expect } from 'vitest'
import { buildMatrix as buildClient } from './matrix'
// ⚠️ Import du JUMEAU SERVEUR par chemin relatif : `functions/` est un projet
// TypeScript distinct, mais le module est PUR — aucun accès Firestore, aucun
// import Node. C'est ce qui rend cette comparaison possible.
import { buildMatrix as buildServer } from '../../../../functions/src/priceWatch/catalog/matrix'

/**
 * PARITÉ des deux implémentations de la matrice de comparaison.
 *
 * Le test de jumeaux existant vérifie qu'un node est ENREGISTRÉ côté serveur,
 * pas que sa sortie corresponde. C'est ce trou qui a laissé partir un marquage
 * de colonnes posé d'un seul côté : les exports lancés depuis le navigateur
 * groupaient les colonnes par concurrent, ceux lancés par le cron non — même
 * workflow, deux résultats.
 */
const SITES = [
  { siteId: 's1', domain: 'kramp.com' },
  { siteId: 's2', domain: 'rubix.fr' },
]

const empty = new Map<string, never[]>()

describe('parité matrice client / serveur', () => {
  it('produit les MÊMES colonnes, clés et groupes compris', () => {
    const c = buildClient([], SITES, empty)
    const s = buildServer([], SITES, empty)
    expect(s.columns.map((x) => x.key)).toEqual(c.columns.map((x) => x.key))
    expect(s.columns.map((x) => x.label)).toEqual(c.columns.map((x) => x.label))
    expect(s.columns.map((x) => x.group ?? null)).toEqual(c.columns.map((x) => x.group ?? null))
  })

  it('marque bien chaque concurrent — sinon l’export ne groupe rien', () => {
    const c = buildClient([], SITES, empty)
    const groups = [...new Set(c.columns.map((x) => x.group).filter(Boolean))]
    expect(groups).toEqual(['kramp.com', 'rubix.fr'])
    // Les colonnes communes (EAN, nom, mon prix…) ne sont jamais groupées.
    expect(c.columns.filter((x) => !x.group).length).toBeGreaterThan(0)
  })

  it('garde les colonnes d’un concurrent CONTIGUËS (un groupe est une plage)', () => {
    const cols = buildClient([], SITES, empty).columns
    for (const g of ['kramp.com', 'rubix.fr']) {
      const idx = cols.map((x, i) => ({ x, i })).filter(({ x }) => x.group === g).map(({ i }) => i)
      expect(idx[idx.length - 1] - idx[0], `« ${g} » n'est pas d'un seul tenant`).toBe(idx.length - 1)
    }
  })
})
