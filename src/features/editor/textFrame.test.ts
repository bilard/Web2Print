import { describe, it, expect } from 'vitest'
import { Textbox } from 'fabric'
import { applyTextFrame, getTextFrame, indentsFor, patchTextFrame, type TextFrameProps } from './textFrame'

function makeBlock(props: Partial<TextFrameProps> = {}, text = 'Bonjour le monde') {
  const tb = new Textbox(text, { width: 200, fontSize: 20, originX: 'center', originY: 'center' })
  applyTextFrame(tb, { frameW: 200, frameH: 120, autoSizing: 'off', ...props })
  return tb
}

describe('textFrame — dimensions du bloc', () => {
  it('impose la hauteur du CADRE, pas celle du texte, en cadre fixe', () => {
    const tb = makeBlock({ frameH: 150 })
    expect(tb.height).toBe(150)
  })

  it('grandit avec le texte en redimensionnement automatique de hauteur', () => {
    const long = 'Un texte assez long pour occuper plusieurs lignes dans un cadre étroit et déborder.'
    const tb = makeBlock({ frameH: 10, autoSizing: 'height' }, long)
    // Le cadre suit le texte : plus haut que la hauteur importée.
    expect(tb.height).toBeGreaterThan(10)
  })

  it('ne descend jamais sous la hauteur importée en auto-hauteur', () => {
    const tb = makeBlock({ frameH: 400, autoSizing: 'height' }, 'court')
    expect(tb.height).toBe(400)
  })
})

describe('textFrame — largeur automatique', () => {
  const type = (tb: Textbox, text: string) => {
    tb.set({ text })
    ;(tb as unknown as { initDimensions: () => void }).initDimensions()
  }

  it('tient sur une seule ligne au lieu de replier le texte', () => {
    // Cadre étroit + texte long : InDesign élargit le cadre, il ne replie pas.
    const tb = makeBlock({ frameW: 40, autoSizing: 'width' }, 'des mots des mots des mots')
    expect(tb.textLines.length).toBe(1)
    expect(tb.width).toBeGreaterThan(40)
  })

  it('rétrécit quand on supprime des caractères', () => {
    const tb = makeBlock({ autoSizing: 'width' }, '788888888888888888888888')
    const large = tb.width ?? 0
    type(tb, '73,05')
    expect(tb.width).toBeLessThan(large / 2)
  })

  it('élargit le cadre quand on ajoute des caractères', () => {
    const tb = makeBlock({ autoSizing: 'width' }, '73,05')
    const petit = tb.width ?? 0
    type(tb, '73,05 avec beaucoup plus de texte encore')
    expect(tb.width).toBeGreaterThan(petit)
  })

  it('tient compte du retrait droit dans la largeur du cadre', () => {
    const sans = makeBlock({ autoSizing: 'width' }, '22,99')
    const avec = makeBlock({ autoSizing: 'width', indents: { right: 17 } }, '22,99')
    expect((avec.width ?? 0) - (sans.width ?? 0)).toBeCloseTo(17, 1)
  })
})

describe('textFrame — point d’ancrage du redimensionnement', () => {
  const grow = (anchorX: 'left' | 'center' | 'right') => {
    const tb = makeBlock({ autoSizing: 'width', anchorX, anchorY: 'top' }, 'court')
    tb.set({ left: 300, top: 100 })
    const rightEdgeBefore = 300 + (tb.width ?? 0) / 2
    const leftEdgeBefore = 300 - (tb.width ?? 0) / 2
    tb.set({ text: 'un texte nettement plus long qu’avant' })
    ;(tb as unknown as { initDimensions: () => void }).initDimensions()
    return {
      leftEdge: (tb.left ?? 0) - (tb.width ?? 0) / 2,
      rightEdge: (tb.left ?? 0) + (tb.width ?? 0) / 2,
      leftEdgeBefore, rightEdgeBefore,
    }
  }

  it('ancré à droite : le bord DROIT ne bouge pas, le cadre s’étend à gauche', () => {
    const r = grow('right')
    expect(r.rightEdge).toBeCloseTo(r.rightEdgeBefore, 5)
    expect(r.leftEdge).toBeLessThan(r.leftEdgeBefore)
  })

  it('ancré à gauche : le bord GAUCHE ne bouge pas', () => {
    const r = grow('left')
    expect(r.leftEdge).toBeCloseTo(r.leftEdgeBefore, 5)
    expect(r.rightEdge).toBeGreaterThan(r.rightEdgeBefore)
  })

  it('ancré au centre : les deux bords s’écartent également', () => {
    const r = grow('center')
    expect(r.leftEdgeBefore - r.leftEdge).toBeCloseTo(r.rightEdge - r.rightEdgeBefore, 5)
  })
})

describe('textFrame — justification verticale', () => {
  const topOf = (tb: Textbox) => (tb as unknown as { _getTopOffset: () => number })._getTopOffset()

  it('aligne le texte en haut, sous la marge supérieure', () => {
    const tb = makeBlock({ frameH: 200, insetTop: 12, verticalAlign: 'top' })
    expect(topOf(tb)).toBeCloseTo(-100 + 12, 5)
  })

  it('descend le texte quand il est aligné en bas', () => {
    const tb = makeBlock({ frameH: 200, verticalAlign: 'bottom' })
    const tbTop = makeBlock({ frameH: 200, verticalAlign: 'top' })
    expect(topOf(tb)).toBeGreaterThan(topOf(tbTop))
  })

  it('centre le texte entre les deux marges', () => {
    const tb = makeBlock({ frameH: 200, verticalAlign: 'center' })
    const textH = (tb as unknown as { calcTextHeight: () => number }).calcTextHeight()
    expect(topOf(tb)).toBeCloseTo(-textH / 2, 5)
  })
})

describe('textFrame — retraits de paragraphe', () => {
  const lineLeft = (tb: Textbox, i: number) =>
    (tb as unknown as { _getLineLeftOffset: (n: number) => number })._getLineLeftOffset(i)

  it('décale la première ligne du paragraphe, pas les lignes de repli', () => {
    // Un seul paragraphe, replié sur plusieurs lignes visuelles.
    const tb = makeBlock({ indents: { left: 10, firstLine: 25 } }, 'des mots des mots des mots des mots')
    expect(tb.textLines.length).toBeGreaterThan(1)
    expect(lineLeft(tb, 0)).toBeCloseTo(35, 5)
    expect(lineLeft(tb, 1)).toBeCloseTo(10, 5)
  })

  it('applique le retrait de 1re ligne à CHAQUE paragraphe', () => {
    const tb = makeBlock({ indents: { firstLine: 18 } }, 'un\ndeux')
    expect(lineLeft(tb, 0)).toBeCloseTo(18, 5)
    expect(lineLeft(tb, 1)).toBeCloseTo(18, 5)
  })

  it('ajoute la marge gauche du cadre au retrait', () => {
    const tb = makeBlock({ insetLeft: 6, indents: { left: 4 } }, 'a')
    expect(lineLeft(tb, 0)).toBeCloseTo(10, 5)
  })

  it("réduit la largeur de composition du retrait à droite", () => {
    const long = 'des mots des mots des mots des mots des mots des mots'
    const sans = makeBlock({}, long)
    const avec = makeBlock({ indents: { right: 90 } }, long)
    expect(avec.textLines.length).toBeGreaterThan(sans.textLines.length)
  })

  it('insère un espace après le paragraphe', () => {
    const tb = makeBlock({ indents: { spaceAfter: 30 } }, 'un\ndeux')
    const sans = makeBlock({}, 'un\ndeux')
    const h = (b: Textbox, i: number) =>
      (b as unknown as { getHeightOfLine: (n: number) => number }).getHeightOfLine(i)
    expect(h(tb, 0) - h(sans, 0)).toBeCloseTo(30, 5)
    // La dernière ligne ne porte pas d'espace après.
    expect(h(tb, 1)).toBeCloseTo(h(sans, 1), 5)
  })
})

describe('indentsFor — priorité des sources', () => {
  const frame: TextFrameProps = {
    frameW: 100, frameH: 100,
    indents: { right: 5 },
    paraIndents: [{ left: 20, right: 40 }],
  }

  it('la valeur réglée dans la palette prime sur celle importée', () => {
    expect(indentsFor(frame, 0).right).toBe(5)
  })

  it('conserve la valeur importée quand la palette ne la surcharge pas', () => {
    expect(indentsFor(frame, 0).left).toBe(20)
  })
})

describe('textFrame — survie à la sauvegarde', () => {
  it('sérialise le cadre dans data (FABRIC_SERIALIZED_PROPS inclut « data »)', () => {
    const tb = makeBlock({ fill: '#ffff00', stroke: '#ff0000', strokeWidth: 2, cornerRadius: 6, frameH: 140 })
    const json = tb.toObject(['data']) as { data?: { textFrame?: TextFrameProps } }
    expect(json.data?.textFrame).toMatchObject({
      fill: '#ffff00', stroke: '#ff0000', strokeWidth: 2, cornerRadius: 6, frameH: 140,
    })
  })

  it('retrouve sa hauteur de cadre après rechargement', () => {
    const source = makeBlock({ frameH: 140 })
    const json = source.toObject(['data']) as { data?: Record<string, unknown> }
    // Simule loadFromJSON : un Textbox nu qui récupère `data`, puis le patch de load.
    const reloaded = new Textbox('Bonjour le monde', { width: 200, fontSize: 20 })
    ;(reloaded as unknown as { data?: unknown }).data = json.data
    patchTextFrame(reloaded)
    expect(reloaded.height).toBe(140)
  })
})

describe('textFrame — cohabitation avec les données de fusion', () => {
  it('conserve la référence de `data` et les liens de champs', () => {
    const tb = new Textbox('{{Prix}}', { width: 200 })
    const data = { id: 'u42', type: 'text', templateText: '{{Prix}}', mergeFields: ['Prix'] }
    ;(tb as unknown as { data: typeof data }).data = data
    applyTextFrame(tb, { frameW: 200, frameH: 60, fill: '#ffff00' })
    // `data` circule par référence dans l'auto-save et les connecteurs : le
    // remplacer périmerait ces références.
    expect((tb as unknown as { data: unknown }).data).toBe(data)
    expect((data as { templateText?: string }).templateText).toBe('{{Prix}}')
    expect(getTextFrame(tb)?.fill).toBe('#ffff00')
  })
})

describe('textFrame — rendu', () => {
  it('peint un cadre arrondi et bordé sans planter', () => {
    const tb = makeBlock({ fill: '#ffff00', stroke: '#0000ff', strokeWidth: 3, cornerRadius: 8 })
    const el = document.createElement('canvas')
    el.width = 400
    el.height = 300
    const ctx = el.getContext('2d')
    expect(ctx).toBeTruthy()
    expect(() => tb.render(ctx as CanvasRenderingContext2D)).not.toThrow()
  })

  it('peint aussi les contours intérieur et extérieur', () => {
    const el = document.createElement('canvas')
    const ctx = el.getContext('2d') as CanvasRenderingContext2D
    for (const strokeAlign of ['inside', 'outside', 'center'] as const) {
      const tb = makeBlock({ stroke: '#000000', strokeWidth: 4, cornerRadius: 5, strokeAlign })
      expect(() => tb.render(ctx)).not.toThrow()
    }
  })
})

describe('patchTextFrame — idempotence et non-régression', () => {
  it('ne patche pas un Textbox sans cadre', () => {
    const tb = new Textbox('sans cadre', { width: 120 })
    patchTextFrame(tb)
    expect(getTextFrame(tb)).toBeNull()
    // La hauteur reste celle calculée par Fabric.
    expect(tb.height).toBeGreaterThan(0)
  })

  it('appliqué deux fois, ne double pas les décalages', () => {
    const tb = makeBlock({ frameH: 180, insetTop: 10 })
    const before = (tb as unknown as { _getTopOffset: () => number })._getTopOffset()
    patchTextFrame(tb)
    patchTextFrame(tb)
    expect((tb as unknown as { _getTopOffset: () => number })._getTopOffset()).toBeCloseTo(before, 5)
  })
})
