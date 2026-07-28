// Garde de non-régression sur un VRAI IDML du repo : le chemin complet
// dézippage → parseIdml → objets Fabric, pour vérifier qu'un bloc de texte
// InDesign arrive bien en UN seul objet portant son cadre.
// (le fichier vit dans le repo ; le test est ignoré s'il est absent)
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { Textbox } from 'fabric'
import { parseIdml } from './idmlParser'
import { idmlToFabricObjects } from './idmlToFabric'
import { getTextFrame } from '@/features/editor/textFrame'
import type { IdmlDocument, IdmlObject } from './idmlTypes'

const REAL_FILE = 'IMPORTS/Monoprix/XML/Snipet_PROMO_converted.idml'

/** Dézippe l'IDML et regroupe ses parties comme le fait `unzipIdml` côté navigateur. */
async function loadRealDocument(): Promise<IdmlDocument> {
  const zip = await JSZip.loadAsync(readFileSync(REAL_FILE))
  const spreads: Record<string, string> = {}
  const stories: Record<string, string> = {}
  const resources: Record<string, string> = {}
  const masterSpreads: Record<string, string> = {}
  let designMap = ''

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    const lower = path.toLowerCase()
    if (!lower.endsWith('.xml')) continue
    const xml = await entry.async('text')
    if (lower.startsWith('masterspreads/')) masterSpreads[path] = xml
    else if (lower.startsWith('spreads/')) spreads[path] = xml
    else if (lower.startsWith('stories/')) stories[path] = xml
    else if (lower.startsWith('resources/')) resources[path] = xml
    else if (lower === 'designmap.xml') designMap = xml
  }
  return parseIdml(spreads, stories, resources, designMap, masterSpreads)
}

describe.skipIf(!existsSync(REAL_FILE))('IDML réel — blocs de texte', () => {
  it('convertit chaque bloc de texte rempli en UN seul objet Fabric', async () => {
    const docModel = await loadRealDocument()
    const frames = docModel.objects.filter(
      (o) => o.type === 'TextFrame' && (o.paragraphs?.length ?? 0) > 0 && !o.frameSvgPath,
    )
    expect(frames.length).toBeGreaterThan(0)

    const objs = await idmlToFabricObjects(frames)
    // Un bloc = un objet : plus aucun rectangle de fond « __bg ».
    expect(objs).toHaveLength(frames.length)
    expect(objs.some((o) => String(o.data?.id ?? '').endsWith('__bg'))).toBe(false)
    expect(objs.every((o) => o instanceof Textbox)).toBe(true)
  })

  it('reporte le fond des blocs remplis sur leur cadre', async () => {
    const docModel = await loadRealDocument()
    const filled = docModel.objects.filter(
      // `fill` peut exister avec alpha 0 (« Sans » dans InDesign) : ce n'est pas un fond.
      (o) => o.type === 'TextFrame' && (o.paragraphs?.length ?? 0) > 0 && !o.frameSvgPath
        && Boolean(o.fill) && (o.fill?.a ?? 0) > 0,
    )
    if (filled.length === 0) return // rien à vérifier dans ce fichier
    const objs = await idmlToFabricObjects(filled)
    for (const o of objs) {
      expect(getTextFrame(o)?.fill).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('hérite du dimensionnement automatique porté par le STYLE D\'OBJET', async () => {
    // Le bloc prix ne déclare rien : « Largeur seulement / milieu droit » vit dans
    // ObjectStyle/Price. L'ignorer figeait le cadre et repliait le prix fusionné.
    const docModel = await loadRealDocument()
    const prix = docModel.objects.find((o) => o.mergeTemplate === '{{Prix_normal}}')
    expect(prix).toBeDefined()
    expect(prix?.autoSizingType).toBe('WidthOnly')
    expect(prix?.autoSizingReferencePoint).toBe('RightCenterPoint')

    const [block] = await idmlToFabricObjects([prix as IdmlObject])
    expect(getTextFrame(block)).toMatchObject({ autoSizing: 'width', anchorX: 'right', anchorY: 'center' })
    expect((block as Textbox).textLines).toHaveLength(1)
  })

  it('garde le prix fusionné sur une ligne, bord droit immobile', async () => {
    const docModel = await loadRealDocument()
    const prix = docModel.objects.find((o) => o.mergeTemplate === '{{Prix_normal}}')
    const [block] = await idmlToFabricObjects([prix as IdmlObject])
    const tb = block as Textbox
    const rightEdge = () => (tb.left ?? 0) + (tb.width ?? 0) / 2
    const edge0 = rightEdge()
    const width0 = tb.width ?? 0

    const setText = (t: string) => {
      tb.set({ text: t })
      ;(tb as unknown as { initDimensions: () => void }).initDimensions()
    }

    // Une valeur plus longue élargit le cadre VERS LA GAUCHE, sans replier.
    setText('1 234,56')
    expect(tb.textLines).toHaveLength(1)
    expect(tb.width ?? 0).toBeGreaterThan(width0)
    expect(rightEdge()).toBeCloseTo(edge0, 4)

    // Une valeur plus courte le rétrécit — le bord droit ne bouge toujours pas.
    setText('9,90')
    expect(tb.textLines).toHaveLength(1)
    expect(tb.width ?? 0).toBeLessThan(width0)
    expect(rightEdge()).toBeCloseTo(edge0, 4)
  })

  it('ne dérive pas quand on recharge les données en boucle', async () => {
    const docModel = await loadRealDocument()
    const prix = docModel.objects.find((o) => o.mergeTemplate === '{{Prix_normal}}')
    const [block] = await idmlToFabricObjects([prix as IdmlObject])
    const tb = block as Textbox
    const setText = (t: string) => {
      tb.set({ text: t })
      ;(tb as unknown as { initDimensions: () => void }).initDimensions()
    }
    setText('100,00')
    const left = tb.left ?? 0
    const width = tb.width ?? 0

    // Vingt lignes de données, alternées : la position ne doit dépendre QUE de la
    // valeur affichée — pas du nombre de recompositions déjà subies.
    for (let i = 0; i < 20; i++) setText(i % 2 === 0 ? '9,90' : '1 234,56')
    setText('100,00')
    expect(tb.left ?? 0).toBeCloseTo(left, 4)
    expect(tb.width ?? 0).toBeCloseTo(width, 4)

    // Recomposer sans rien changer ne déplace rien non plus.
    for (let i = 0; i < 5; i++) (tb as unknown as { initDimensions: () => void }).initDimensions()
    expect(tb.left ?? 0).toBeCloseTo(left, 4)
  })

  it('capture la typographie du prix : entier gros, devise en exposant, centimes petits', async () => {
    // Le gabarit « 22€,99 » porte trois styles imbriqués InDesign. C'est de lui
    // que la fusion tire le formatage de chaque valeur (cf. buildPriceStyles).
    const docModel = await loadRealDocument()
    const prix = docModel.objects.find((o) => o.mergeTemplate === '{{Prix_normal}}')
    const [block] = await idmlToFabricObjects([prix as IdmlObject])
    const pf = (block.data as { priceFormat?: {
      integerStyle?: { fontSize?: number }
      currencyStyle?: { fontSize?: number; deltaY?: number }
      decimalsStyle?: { fontSize?: number }
      currency?: string
    } }).priceFormat
    expect(pf).toBeDefined()
    expect(pf?.currency).toBe('€')
    const entier = pf?.integerStyle?.fontSize ?? 0
    const devise = pf?.currencyStyle?.fontSize ?? 0
    const centimes = pf?.decimalsStyle?.fontSize ?? 0
    expect(entier).toBeGreaterThan(centimes)   // « 22 » plus gros que « ,99 »
    expect(centimes).toBeGreaterThan(devise)   // « ,99 » plus gros que « € »
    expect(pf?.currencyStyle?.deltaY).toBeLessThan(0) // devise remontée en exposant
  })

  it('donne à chaque bloc la hauteur de son cadre InDesign', async () => {
    const docModel = await loadRealDocument()
    const frames = docModel.objects.filter(
      (o) => o.type === 'TextFrame' && (o.paragraphs?.length ?? 0) > 0 && !o.frameSvgPath
        && (!o.autoSizingType || o.autoSizingType === 'Off') && !o.noLineBreaks,
    )
    if (frames.length === 0) return
    const objs = await idmlToFabricObjects(frames)
    objs.forEach((o, i) => {
      expect(o.height).toBeCloseTo(frames[i].height * frames[i].scaleY, 1)
    })
  })
})
