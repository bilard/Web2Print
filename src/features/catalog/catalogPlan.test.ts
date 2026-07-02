import { describe, expect, it } from 'vitest'
import type { CatalogTreeNode } from './catalogTypes'
import { defaultCatalogPlan, sanitizeCatalogPlan } from './catalogPlan'

const node = (id: string, label: string, level: 1 | 2 | 3, productIds: string[] = [], children: CatalogTreeNode[] = []): CatalogTreeNode =>
  ({ id, label, level, children, productIds })

describe('defaultCatalogPlan', () => {
  it('une section grille 4 par nœud ayant des produits, thème neutre, couverture typographique', () => {
    const tree = [node('a', 'A', 1, ['p1'], [node('a/b', 'B', 2, ['p2'])]), node('c', 'C', 1)]
    const plan = defaultCatalogPlan(tree, 'Mon catalogue')
    expect(plan.sections.map((s) => s.nodeId)).toEqual(['a', 'a/b'])
    expect(plan.sections.every((s) => s.productsPerPage === 4 && s.featuredIds.length === 0)).toBe(true)
    expect(plan.cover.title).toBe('Mon catalogue')
    expect(plan.cover.imagePrompt).toBe('')
    expect(plan.theme.accent).toBe('#6366f1')
    expect(plan.tocTitle).toBe('Sommaire')
  })
})

describe('sanitizeCatalogPlan', () => {
  const tree = [node('a', 'A', 1, ['p1', 'p2', 'p3'])]
  const raw: Parameters<typeof sanitizeCatalogPlan>[0] = {
    theme: { accent: '#e11d48', pageBg: '#fff', ink: '#111', headerBg: '#0f172a', headerInk: '#fff', fontHeading: 'Archivo', fontBody: 'Inter' },
    sections: [
      { nodeId: 'a', productsPerPage: 5, featuredIds: ['p2', 'zzz'] },
      { nodeId: 'inconnu', productsPerPage: 4 },
    ],
    cover: { title: 'T', imagePrompt: 'photo outillage' },
    backCover: { title: 'T', text: 'Merci' },
    tocTitle: 'Sommaire',
  }
  it('clampe la grille à la valeur autorisée la plus proche, filtre nodeIds/featuredIds inconnus', () => {
    const plan = sanitizeCatalogPlan(raw, tree, 'X')
    expect(plan.sections).toHaveLength(1)
    expect(plan.sections[0].productsPerPage).toBe(4) // 5 → 4 (plus proche dans {1,2,3,4,6,8})
    expect(plan.sections[0].featuredIds).toEqual(['p2'])
  })
  it('complète les sections manquantes avec la grille par défaut', () => {
    const plan = sanitizeCatalogPlan({ ...raw, sections: [] }, tree, 'X')
    expect(plan.sections).toEqual([{ nodeId: 'a', productsPerPage: 4, featuredIds: [] }])
  })
  it('complète les champs texte optionnels manquants', () => {
    const plan = sanitizeCatalogPlan(raw, tree, 'X')
    expect(plan.cover.subtitle).toBe('')
    expect(plan.cover.baseline).toBe('')
  })
  it('remplace une couleur de thème non-hex par la valeur par défaut (ex. pageBg: "white")', () => {
    const plan = sanitizeCatalogPlan({ ...raw, theme: { ...raw.theme, pageBg: 'white' } }, tree, 'X')
    expect(plan.theme.pageBg).toBe('#ffffff')
    // Les couleurs hex valides restent inchangées.
    expect(plan.theme.accent).toBe('#e11d48')
  })
})
