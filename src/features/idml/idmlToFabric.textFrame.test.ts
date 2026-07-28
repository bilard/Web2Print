import { describe, it, expect } from 'vitest'
import { Textbox } from 'fabric'
import { idmlToFabricObjects } from './idmlToFabric'
import { getTextFrame } from '@/features/editor/textFrame'
import type { IdmlObject, IdmlParagraph } from './idmlTypes'

const PARA: IdmlParagraph = {
  text: '22,99',
  fontSize: 30,
  fontFamily: 'Arial',
  fontWeight: '400',
  fontStyle: 'normal',
  color: { r: 200, g: 0, b: 0, a: 1 },
  alignment: 'center',
}

function textFrame(over: Partial<IdmlObject> = {}): IdmlObject {
  return {
    id: 'u123',
    type: 'TextFrame',
    cx: 100, cy: 200,
    idmlPageOffsetX: 0, idmlPageOffsetY: 0,
    width: 120, height: 60,
    scaleX: 1, scaleY: 1,
    rotation: 0,
    fill: { r: 255, g: 255, b: 0, a: 1 },
    stroke: null,
    strokeWeight: 0,
    opacity: 1,
    paragraphs: [PARA],
    ...over,
  }
}

describe('import IDML — le bloc de texte est UN seul objet', () => {
  it('ne produit plus de rectangle de fond distinct', async () => {
    const objs = await idmlToFabricObjects([textFrame()])
    expect(objs).toHaveLength(1)
    expect(objs[0]).toBeInstanceOf(Textbox)
    expect(objs.some((o) => String(o.data?.id).endsWith('__bg'))).toBe(false)
  })

  it('porte le fond du cadre, et non un fond de texte Fabric', async () => {
    const [block] = await idmlToFabricObjects([textFrame()])
    expect(getTextFrame(block)?.fill).toBe('#ffff00')
    expect((block as Textbox).backgroundColor).toBeFalsy()
  })

  it('conserve le contour du bloc — perdu avant cette version', async () => {
    const [block] = await idmlToFabricObjects([
      textFrame({ stroke: { r: 0, g: 0, b: 255, a: 1 }, strokeWeight: 2 }),
    ])
    const frame = getTextFrame(block)
    expect(frame?.stroke).toBe('#0000ff')
    expect(frame?.strokeWidth).toBe(2)
  })

  it('importe un cadre vide sans fond mais avec contour (avant : objet perdu)', async () => {
    const objs = await idmlToFabricObjects([
      textFrame({ paragraphs: [], fill: null, stroke: { r: 0, g: 0, b: 0, a: 1 }, strokeWeight: 1 }),
    ])
    expect(objs).toHaveLength(1)
    expect(objs[0].stroke).toBe('#000000')
  })

  it('reprend la hauteur du cadre InDesign, pas celle du texte', async () => {
    const [block] = await idmlToFabricObjects([textFrame({ height: 90 })])
    expect(block.height).toBe(90)
  })

  it('centre le bloc sur les coordonnées IDML, marges comprises', async () => {
    const [block] = await idmlToFabricObjects([
      textFrame({ insetTop: 8, verticalJustification: 'top' }),
    ])
    // Le texte descend À L'INTÉRIEUR du bloc ; le bloc, lui, ne bouge pas.
    expect(block.left).toBe(100)
    expect(block.top).toBe(200)
    expect(block.data?.idmlCx).toBe(100)
  })

  it('traduit AutoSizingType en mode de redimensionnement', async () => {
    const [fixe] = await idmlToFabricObjects([textFrame()])
    const [haut] = await idmlToFabricObjects([textFrame({ autoSizingType: 'HeightOnly' })])
    const [deux] = await idmlToFabricObjects([textFrame({ autoSizingType: 'HeightAndWidth' })])
    expect(getTextFrame(fixe)?.autoSizing).toBe('off')
    expect(getTextFrame(haut)?.autoSizing).toBe('height')
    expect(getTextFrame(deux)?.autoSizing).toBe('both')
  })

  it('transporte les retraits du style de paragraphe', async () => {
    const [block] = await idmlToFabricObjects([
      textFrame({ paragraphs: [{ ...PARA, rightIndent: 17.008, spaceBefore: 4 }] }),
    ])
    const indents = getTextFrame(block)?.paraIndents?.[0]
    expect(indents?.right).toBeCloseTo(17.008, 3)
    expect(indents?.spaceBefore).toBeCloseTo(4, 5)
  })
})
