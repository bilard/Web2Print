import { describe, expect, it } from 'vitest'
import { DEFAULT_CARD_STYLE, DEFAULT_PAGE_STYLE, type CatalogTreeNode } from './catalogTypes'
import { defaultCatalogPlan, sanitizeCatalogPlan } from './catalogPlan'

const node = (id: string, label: string, level: 1 | 2 | 3, productIds: string[] = [], children: CatalogTreeNode[] = []): CatalogTreeNode =>
  ({ id, label, level, children, productIds })

describe('defaultCatalogPlan', () => {
  it('une section grille 4 par nœud ayant des produits, thème neutre, couverture typographique', () => {
    const tree = [node('a', 'A', 1, ['p1'], [node('a/b', 'B', 2, ['p2'])]), node('c', 'C', 1)]
    const plan = defaultCatalogPlan(tree, 'Mon catalogue')
    expect(plan.sections.map((s) => s.nodeId)).toEqual(['a', 'a/b'])
    expect(plan.sections.every((s) => s.productsPerPage === 4 && s.featuredIds.length === 0 && s.randomDensity === false)).toBe(true)
    expect(plan.sizeByPrice).toBe(true)
    expect(plan.cover.title).toBe('Mon catalogue')
    expect(plan.cover.imagePrompt).toBe('')
    expect(plan.theme.accent).toBe('#6366f1')
    expect(plan.tocTitle).toBe('Sommaire')
  })

  it("un univers SANS produit direct (tout en sous-familles) reçoit quand même sa section — c'est elle qui porte la densité", () => {
    const tree = [node('u', 'U', 1, [], [node('u/f', 'F', 2, ['p1'])])]
    expect(defaultCatalogPlan(tree, 'X').sections.map((s) => s.nodeId)).toEqual(['u', 'u/f'])
    const sanitized = sanitizeCatalogPlan({
      theme: { accent: '#e11d48', pageBg: '#ffffff', ink: '#111111', headerBg: '#0f172a', headerInk: '#ffffff', fontHeading: 'Archivo', fontBody: 'Inter' },
      sections: [], cover: { title: 'T', imagePrompt: 'x' }, backCover: { title: 'T', text: '' }, tocTitle: 'S',
    }, tree, 'X')
    expect(sanitized.sections.map((s) => s.nodeId)).toEqual(['u', 'u/f'])
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
    expect(plan.sections).toEqual([{ nodeId: 'a', productsPerPage: 4, randomDensity: false, featuredIds: [] }])
  })
  it('plafonne les vedettes à 2 par univers (une vedette = une grande carte 2×2)', () => {
    const bigTree = [node('u', 'U', 1, ['a', 'b'], [
      node('u/f1', 'F1', 2, ['c', 'd']),
      node('u/f2', 'F2', 2, ['e', 'f']),
    ])]
    const plan = sanitizeCatalogPlan({
      ...raw,
      sections: [
        { nodeId: 'u', productsPerPage: 4, featuredIds: ['a', 'b'] },
        { nodeId: 'u/f1', productsPerPage: 4, featuredIds: ['c', 'd'] },
        { nodeId: 'u/f2', productsPerPage: 4, featuredIds: ['e'] },
      ],
    }, bigTree, 'X')
    const featured = plan.sections.flatMap((s) => s.featuredIds)
    expect(featured).toEqual(['a', 'b']) // budget 2 consommé par l'univers, le reste purgé
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

  it('RÉGÉNÉRATION : préserve les réglages manuels du plan courant (cardStyle, pageStyle, couleurs de chapitre, modèle appliqué)', () => {
    const current = {
      ...defaultCatalogPlan(tree, 'X'),
      cardStyle: { ...DEFAULT_CARD_STYLE, priceBg: '#00ff00', vedetteLabel: 'Top' },
      pageStyle: { ...DEFAULT_PAGE_STYLE, chapterColors: true },
      appliedTemplate: 'Standard',
      sizeByPrice: false,
    }
    current.sections[0].color = '#123456'
    const plan = sanitizeCatalogPlan(raw, tree, 'X', current)
    expect(plan.cardStyle?.priceBg).toBe('#00ff00')
    expect(plan.cardStyle?.vedetteLabel).toBe('Top')
    expect(plan.pageStyle?.chapterColors).toBe(true)
    expect(plan.appliedTemplate).toBe('Standard')
    expect(plan.sizeByPrice).toBe(false)
    expect(plan.sections.find((s) => s.nodeId === 'a')?.color).toBe('#123456')
  })

  it('cardStyle IA : hex valides appliqués PAR-DESSUS le style courant, valeurs invalides ignorées, label borné', () => {
    const current = { ...defaultCatalogPlan(tree, 'X'), cardStyle: { ...DEFAULT_CARD_STYLE, promoBg: '#111111' } }
    const plan = sanitizeCatalogPlan({
      ...raw,
      cardStyle: { vedettePriceBg: '#ffd700', priceBg: 'jaune', vedetteLabel: '  Coup de cœur  ' },
    }, tree, 'X', current)
    expect(plan.cardStyle?.vedettePriceBg).toBe('#ffd700') // « met en jaune les prix des Vedettes »
    expect(plan.cardStyle?.priceBg).toBe('') // 'jaune' n'est pas un hex → ignoré (défaut conservé)
    expect(plan.cardStyle?.promoBg).toBe('#111111') // réglage manuel préservé
    expect(plan.cardStyle?.vedetteLabel).toBe('Coup de cœur')
  })

  it("sans plan courant ni cardStyle IA, le plan reste SANS cardStyle (pas d'objet fantôme)", () => {
    expect(sanitizeCatalogPlan(raw, tree, 'X').cardStyle).toBeUndefined()
  })
})
