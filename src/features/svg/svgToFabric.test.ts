import { describe, it, expect } from 'vitest'
import { Group, IText, Textbox, type FabricObject } from 'fabric'
import { parseSvgToFabric } from './svgToFabric'

describe('parseSvgToFabric — intégration parser et styles multi-ligne', () => {
  it('imports multi-line SVG text with width and wrapping', async () => {
    const svg = `
      <svg viewBox="0 0 400 300">
        <text x="10" y="20" width="200" font-size="14" fill="black">
          <tspan>First Line</tspan>
          <tspan>Second Line</tspan>
        </text>
      </svg>
    `

    const result = await parseSvgToFabric(svg)
    expect(result.objects).toHaveLength(1)

    const textObj = result.objects[0]
    expect(textObj instanceof Textbox).toBe(true)
    expect((textObj as Textbox).width).toBe(200)
    expect((textObj as Textbox).text).toContain('First Line')
  })

  it('preserves rich text styles after wrapping', async () => {
    const svg = `
      <svg viewBox="0 0 400 300">
        <text x="10" y="20" width="200" font-size="14">
          <tspan fill="red" font-weight="bold">Bold Red</tspan>
          <tspan fill="blue"> Blue</tspan>
        </text>
      </svg>
    `

    const result = await parseSvgToFabric(svg)
    const textObj = result.objects[0] as Textbox
    const styles = (textObj as unknown as { styles?: Record<number, Record<number, Record<string, unknown>>> }).styles

    expect(styles).toBeDefined()
  })

  it('ignores text without width attribute', async () => {
    const svg = `
      <svg viewBox="0 0 400 300">
        <text x="10" y="20">No Width</text>
      </svg>
    `

    const result = await parseSvgToFabric(svg)
    const textObj = result.objects[0]

    // Should be IText, not Textbox
    expect(textObj instanceof IText).toBe(true)
    expect(textObj instanceof Textbox).toBe(false)
  })
})

describe('parseSvgToFabric — exports Illustrator bruts (sans pré-traitement)', () => {
  // Illustrator encode le positionnement via transform="translate(x y)" et
  // n'émet pas d'attribut width sur <text>. Les tspans sont pré-wrappés par
  // y-offsets (une ligne visuelle par tspan).
  it('convertit transform="translate(x y)" en Textbox positionné', async () => {
    // Un <text> Illustrator brut (transform + tspan) doit devenir un Textbox,
    // positionné quelque part dans la partie supérieure du viewBox (translate ~= (923, 6190))
    // et pas collé à l'origine (0, 0).
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 10000">
  <defs><style>.cls-a { font-family: NALHand, 'NAL Hand'; font-size: 300px; fill: #ad529a; }</style></defs>
  <text class="cls-a" transform="translate(923.19 6190.5)"><tspan x="0" y="0">Nathalie</tspan></text>
</svg>`
    const { objects } = await parseSvgToFabric(svg)
    const t = objects[0] as Textbox
    expect(t).toBeInstanceOf(Textbox)
    expect(t.text).toBe('Nathalie')
    expect(t.fontSize).toBeCloseTo(300, 0)
    // Le texte doit être placé près de (923, 6190), pas à l'origine.
    expect(t.left).toBeGreaterThan(500)
    expect(t.top).toBeGreaterThan(5000)
    expect(t.width).toBeGreaterThan(0)
  })

  it('infère width, lineHeight et textAlign=right pour des tspans y-offsets right-alignés', async () => {
    // Illustrator export: text-align right encodé via x croissants pour des lignes plus courtes
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 10000">
  <defs>
    <style>
      .cls-h { font-family: HelveticaNeueLTPro-Bd, 'Helvetica Neue LT Pro'; font-size: 500px; fill: #e3e3e3; }
    </style>
  </defs>
  <text class="cls-h" transform="translate(919.4 4223.17)"><tspan x="0" y="0">Lorem </tspan><tspan x="84" y="500">ipsum </tspan><tspan x="296.49" y="1000">dolor</tspan></text>
</svg>`
    const { objects } = await parseSvgToFabric(svg)
    const t = objects[0] as Textbox
    expect(t).toBeInstanceOf(Textbox)
    // Texte consolidé (pour reflow)
    expect(t.text?.replace(/\s+/g, ' ').trim()).toBe('Lorem ipsum dolor')
    // lineHeight inféré depuis y-spacing (500) / fontSize (500) = 1.0
    expect(t.lineHeight).toBeCloseTo(1.0, 1)
    // text-align inféré depuis le pattern x croissant sur lignes plus courtes
    expect(t.textAlign).toBe('right')
    // width doit être > 0 et approximer la ligne la plus large ("Lorem " à 500px)
    expect(t.width).toBeGreaterThan(500)
    expect(t.width).toBeLessThan(3000)
  })

  it('left-align quand tous les tspans ont x=0', async () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 10000">
  <defs>
    <style>
      .cls-p { font-family: Myriad, sans-serif; font-size: 72px; fill: #fff; }
    </style>
  </defs>
  <text class="cls-p" transform="translate(100 200)"><tspan x="0" y="0">Line one here.</tspan><tspan x="0" y="86.4">Line two.</tspan><tspan x="0" y="172.8">Line three longer.</tspan></text>
</svg>`
    const { objects } = await parseSvgToFabric(svg)
    const t = objects[0] as Textbox
    expect(t).toBeInstanceOf(Textbox)
    expect(t.textAlign === 'left' || t.textAlign === undefined).toBe(true)
    expect(t.lineHeight).toBeCloseTo(1.2, 1) // 86.4 / 72
    expect(t.width).toBeGreaterThan(200)
  })

  it('gère le shape complet de Test5.svg raw (3 blocs: heading + name + paragraph)', async () => {
    // Reproduit le format d'export Illustrator: transform + tspans avec x/y explicites,
    // sans width sur <text>. Couvre les 3 cas: heading right-aligné multi-ligne,
    // nom simple, paragraphe pré-wrappé avec nombreux tspans stylés.
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2892 10148">
  <defs><style>
    .cls-heading { font-family: HelveticaNeueLTPro-Bd, 'Helvetica Neue LT Pro'; font-size: 500px; fill: #ee8b00; }
    .cls-name { font-family: NALHand, 'NAL Hand'; font-size: 300px; fill: #ad529a; }
    .cls-para { font-family: MyriadPro-Regular, 'Myriad Pro'; font-size: 72px; fill: #fff; }
  </style></defs>
  <text class="cls-heading" transform="translate(919.4 4223.17)"><tspan x="0" y="0">Lorem </tspan><tspan x="84" y="500">ipsum </tspan><tspan x="296.49" y="1000">dolor</tspan></text>
  <text class="cls-name" transform="translate(923.19 6190.5)"><tspan x="0" y="0">Nathalie</tspan></text>
  <text class="cls-para" transform="translate(1707.63 5704.54)"><tspan x="0" y="0">Lorem ipsum dolor sit amet,</tspan><tspan x="0" y="86.4">consectetuer adipiscing elit,</tspan><tspan x="0" y="172.8">sed diam nonummy nibh</tspan><tspan x="0" y="259.2">euismod tincidunt ut laoreet</tspan></text>
</svg>`
    const { objects } = await parseSvgToFabric(svg)
    expect(objects).toHaveLength(3)

    const [heading, name, para] = objects as Textbox[]
    expect(heading).toBeInstanceOf(Textbox)
    expect(name).toBeInstanceOf(Textbox)
    expect(para).toBeInstanceOf(Textbox)

    // Heading: right-align inféré, 3 lignes avec lineHeight 1.0 (500/500)
    expect(heading.textAlign).toBe('right')
    expect(heading.lineHeight).toBeCloseTo(1.0, 1)

    // Paragraph: left-align (tous x=0), lineHeight 1.2 (86.4/72)
    expect(para.textAlign === 'left' || para.textAlign === undefined).toBe(true)
    expect(para.lineHeight).toBeCloseTo(1.2, 1)

    // Name: single-line, positionné
    expect(name.text).toBe('Nathalie')
    expect((name.width ?? 0)).toBeGreaterThan(0)
  })

  it("n'affecte pas un <text> déjà pré-traité (width explicite)", async () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
  <text x="50" y="60" width="400" font-size="20">Pre-processed text</text>
</svg>`
    const { objects } = await parseSvgToFabric(svg)
    const t = objects[0] as Textbox
    expect(t).toBeInstanceOf(Textbox)
    expect(t.width).toBe(400)
  })
})

describe('parseSvgToFabric — hiérarchie des groupes', () => {
  it('reconstruit un groupe top-level depuis un <g>', async () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <g id="myGroup">
    <rect x="10" y="10" width="50" height="50" fill="red"/>
    <rect x="80" y="10" width="50" height="50" fill="blue"/>
  </g>
</svg>`
    const { objects } = await parseSvgToFabric(svg)
    expect(objects).toHaveLength(1)
    expect(objects[0]).toBeInstanceOf(Group)
    const group = objects[0] as Group
    expect(group.getObjects()).toHaveLength(2)
  })

  it('préserve le nom d\'un groupe via son id SVG', async () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g id="Nathalie">
    <rect width="50" height="50"/>
  </g>
</svg>`
    const { objects } = await parseSvgToFabric(svg)
    expect(objects[0]).toBeInstanceOf(Group)
    const data = (objects[0] as unknown as { data: { name: string } }).data
    expect(data.name).toBe('Nathalie')
  })

  it('reconstruit des sous-groupes imbriqués (2 niveaux)', async () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <g id="outer">
    <g id="inner">
      <rect x="0" y="0" width="20" height="20"/>
      <rect x="30" y="0" width="20" height="20"/>
    </g>
    <rect x="100" y="0" width="20" height="20"/>
  </g>
</svg>`
    const { objects } = await parseSvgToFabric(svg)
    expect(objects).toHaveLength(1)
    const outer = objects[0] as Group
    expect(outer).toBeInstanceOf(Group)
    expect(outer.getObjects()).toHaveLength(2)

    const innerCandidate = outer.getObjects().find((o) => o instanceof Group)
    expect(innerCandidate).toBeInstanceOf(Group)
    expect((innerCandidate as Group).getObjects()).toHaveLength(2)
  })

  it('conserve l\'ordre et le nombre total de feuilles', async () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect x="0" y="0" width="10" height="10"/>
  <g>
    <rect x="20" y="0" width="10" height="10"/>
    <rect x="40" y="0" width="10" height="10"/>
  </g>
  <rect x="60" y="0" width="10" height="10"/>
</svg>`
    const { objects } = await parseSvgToFabric(svg)
    expect(objects).toHaveLength(3)
    expect(objects[0]).not.toBeInstanceOf(Group)
    expect(objects[1]).toBeInstanceOf(Group)
    expect(objects[2]).not.toBeInstanceOf(Group)
    expect((objects[1] as Group).getObjects()).toHaveLength(2)
  })

  it('ignore les groupes vides (sans enfants rendus)', async () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="grad">
      <stop offset="0" stop-color="red"/>
    </linearGradient>
  </defs>
  <g id="empty"></g>
  <rect x="0" y="0" width="10" height="10"/>
</svg>`
    const { objects } = await parseSvgToFabric(svg)
    expect(objects).toHaveLength(1)
    expect(objects[0]).not.toBeInstanceOf(Group)
  })
})

describe('parseSvgToFabric — option flatten (import .svg)', () => {
  // Structure type d'un export Illustrator : un wrapper d'isolation, un calque,
  // puis les blocs du design — dont un groupe d'objets (`bloc`) qui doit RESTER
  // un bloc unique.
  const NESTED_SVG = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  <g class="isolate">
    <g id="Calque_1">
      <g id="bloc">
        <rect x="10" y="20" width="40" height="30" fill="red"/>
        <rect x="60" y="20" width="40" height="30" fill="blue"/>
      </g>
      <rect x="120" y="20" width="40" height="30" fill="green"/>
      <rect x="180" y="20" width="40" height="30" fill="black"/>
    </g>
  </g>
</svg>`

  // Fabric positionne les formes parsées depuis un SVG sur leur CENTRE
  // (originX/originY = 'center') : on ramène au coin haut-gauche pour comparer
  // aux coordonnées du fichier source.
  const topLeftOf = (o: FabricObject) => ({
    x: (o.left ?? 0) - (o.originX === 'center' ? ((o.width ?? 0) * (o.scaleX ?? 1)) / 2 : 0),
    y: (o.top ?? 0) - (o.originY === 'center' ? ((o.height ?? 0) * (o.scaleY ?? 1)) / 2 : 0),
  })

  it('dissout le calque et les wrappers, mais PRÉSERVE les groupes d’objets', async () => {
    const { objects } = await parseSvgToFabric(NESTED_SVG, { flatten: true })
    // bloc (groupe) + 2 rects, et non 4 objets éclatés ni 1 méga-bloc
    expect(objects).toHaveLength(3)
    expect(objects[0]).toBeInstanceOf(Group)
    expect((objects[0] as Group).getObjects()).toHaveLength(2)
    expect(objects[1]).not.toBeInstanceOf(Group)
    expect(objects[2]).not.toBeInstanceOf(Group)
  })

  it('conserve EXACTEMENT la position des objets sortis du calque', async () => {
    const { objects } = await parseSvgToFabric(NESTED_SVG, { flatten: true })
    const green = topLeftOf(objects[1])
    expect(green.x).toBeCloseTo(120, 3)
    expect(green.y).toBeCloseTo(20, 3)
  })

  it('applique les transforms des <g> parents aux objets dégroupés', async () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  <g transform="translate(100 50)">
    <g transform="translate(5 5)">
      <rect x="10" y="20" width="40" height="30"/>
    </g>
  </g>
</svg>`
    const { objects } = await parseSvgToFabric(svg, { flatten: true })
    expect(objects).toHaveLength(1)
    const p = topLeftOf(objects[0])
    expect(p.x).toBeCloseTo(115, 3)
    expect(p.y).toBeCloseTo(75, 3)
  })

  it('conserve l’ordre d’empilement (z-order) des blocs', async () => {
    const { objects } = await parseSvgToFabric(NESTED_SVG, { flatten: true })
    expect(objects.slice(1).map((o) => o.fill)).toEqual(['green', 'black'])
  })

  it('mémorise le nom du calque d’origine dans data.groupPath', async () => {
    const { objects } = await parseSvgToFabric(NESTED_SVG, { flatten: true })
    const data = (objects[1] as unknown as { data: { groupPath?: string[] } }).data
    expect(data.groupPath).toEqual(['Calque_1'])
    const groupData = (objects[0] as unknown as { data: { groupPath?: string[]; name: string } }).data
    expect(groupData.groupPath).toEqual(['Calque_1', 'bloc'])
    expect(groupData.name).toBe('bloc')
  })

  it('dissout un <g clip-path> qui n’enveloppe qu’un seul objet', async () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g id="Calque_1">
    <g class="clip">
      <rect id="_PLACE_YOUR_IMAGE_" x="0" y="0" width="50" height="50"/>
    </g>
    <rect x="60" y="0" width="20" height="20"/>
  </g>
</svg>`
    const { objects } = await parseSvgToFabric(svg, { flatten: true })
    expect(objects).toHaveLength(2)
    expect(objects[0]).not.toBeInstanceOf(Group)
    const data = (objects[0] as unknown as { data: { name: string } }).data
    expect(data.name).toBe('_PLACE_YOUR_IMAGE_')
  })

  it('ne laisse JAMAIS un unique méga-bloc, même sans id de calque reconnu', async () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <g id="Artboard_XYZ">
    <rect x="0" y="0" width="20" height="20"/>
    <rect x="40" y="0" width="20" height="20"/>
    <text x="10" y="80">Titre</text>
  </g>
</svg>`
    const { objects } = await parseSvgToFabric(svg, { flatten: true })
    expect(objects).toHaveLength(3)
    expect(objects.some((o) => o instanceof Group)).toBe(false)
  })
})
