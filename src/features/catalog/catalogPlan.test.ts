import { describe, expect, it, test } from 'vitest'
import { DEFAULT_CARD_STYLE, DEFAULT_PAGE_STYLE, type CatalogTreeNode } from './catalogTypes'
import { defaultCatalogPlan, enforceLightPageBg, PlanSchema, sanitizeCatalogPlan } from './catalogPlan'

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
    const plan = sanitizeCatalogPlan({ ...raw, theme: { ...raw.theme!, pageBg: 'white' } }, tree, 'X')
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

  it('MODIFICATION CIBLÉE : réponse IA réduite à cardStyle → thème, sections, couvertures et sommaire du plan courant CONSERVÉS', () => {
    const current = {
      ...defaultCatalogPlan(tree, 'X'),
      theme: { ...defaultCatalogPlan(tree, 'X').theme, accent: '#e97817' },
      cover: { title: 'Mon titre', subtitle: 'Sub', baseline: 'Base', imagePrompt: 'pic' },
      tocTitle: 'Mon sommaire',
    }
    current.sections[0].productsPerPage = 6
    current.sections[0].featuredIds = ['p1']
    const plan = sanitizeCatalogPlan({ cardStyle: { vedettePriceInk: '#ffd700' } }, tree, 'X', current)
    expect(plan.theme.accent).toBe('#e97817') // thème INTACT (pas de jaune partout)
    expect(plan.cover.title).toBe('Mon titre')
    expect(plan.tocTitle).toBe('Mon sommaire')
    expect(plan.sections.find((s) => s.nodeId === 'a')).toMatchObject({ productsPerPage: 6, featuredIds: ['p1'] })
    expect(plan.cardStyle?.vedettePriceInk).toBe('#ffd700') // « met en jaune les TEXTES des prix des Vedettes »
  })

  it('création SANS thème renvoyé par l\'IA → repli thème par défaut (jamais de plan invalide)', () => {
    const plan = sanitizeCatalogPlan({ sections: raw.sections }, tree, 'X')
    expect(plan.theme.accent).toBe('#6366f1')
    expect(plan.cover.title).toBe('X')
  })

  it('layout borné (0–100, ids connus)', () => {
    const uTree = [node('u', 'U', 1, ['r1'])]
    const plan = sanitizeCatalogPlan({ cardStyle: { layout: { name: { x: 10, y: 20, w: 150 }, bogus: { x: 1, y: 1 } } } } as never, uTree, 'C')
    expect(plan.cardStyle?.layout?.name).toEqual({ x: 10, y: 20, w: 100 }) // w clampé
    expect((plan.cardStyle?.layout as Record<string, unknown>)?.bogus).toBeUndefined() // id inconnu ignoré
  })

  test('PlanSchema conserve layout (non strippé par zod)', () => {
    const parsed = PlanSchema.parse({ cardStyle: { layout: { name: { x: 10, y: 20, w: 50 } } } })
    expect(parsed.cardStyle?.layout?.name).toEqual({ x: 10, y: 20, w: 50 })
  })
})

describe('enforceLightPageBg — fond de page BLANC par défaut', () => {
  const TREE: CatalogTreeNode[] = []
  const darkPlan = () => {
    const p = defaultCatalogPlan(TREE, 'Démo')
    return { ...p, theme: { ...p.theme, pageBg: '#000000', ink: '#f5f5f5' } }
  }

  it('fond sombre spontané de l\'IA → ramené au blanc, encre relisible', () => {
    const out = enforceLightPageBg(darkPlan(), { notes: '', brief: 'Catalogue fidèle à la charte du site' })
    expect(out.theme.pageBg).toBe('#ffffff')
    expect(out.theme.ink).toBe('#111827')
  })

  it('directive explicite « FOND DE PAGE : #hex » (inspiration/consignes) → sombre conservé', () => {
    const out = enforceLightPageBg(darkPlan(), { notes: 'FOND DE PAGE (aplat) : #101014', brief: '' })
    expect(out.theme.pageBg).toBe('#000000')
  })

  it('demande de fond sombre dans le brief → conservé', () => {
    const out = enforceLightPageBg(darkPlan(), { notes: '', brief: 'Ambiance premium, fond de page noir' })
    expect(out.theme.pageBg).toBe('#000000')
  })

  it('plan courant déjà sombre (réglage utilisateur) → jamais écrasé', () => {
    const out = enforceLightPageBg(darkPlan(), { notes: '', brief: 'change la couleur des prix', current: darkPlan() })
    expect(out.theme.pageBg).toBe('#000000')
  })

  it('fond clair → intouché (encre comprise)', () => {
    const p = defaultCatalogPlan(TREE, 'Démo')
    const out = enforceLightPageBg(p, { notes: '', brief: '' })
    expect(out).toBe(p)
  })
})
