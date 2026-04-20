import {
  loadSVGFromString,
  FabricText,
  IText,
  Textbox,
  Group,
  Path,
  Rect,
  Ellipse,
  Line,
  Polygon,
  FabricImage,
  type FabricObject,
} from 'fabric'
import { registerDynamicFontVariant } from '@/features/assets/useFonts'
import { parseTextElements } from './svgTextParser'
import { remapStylesToFabric } from './textboxConverter'
import type { TextMetadata } from './svgTextParser'

export interface SvgParseResult {
  objects: FabricObject[]
  width: number
  height: number
}

function extractViewBox(svgText: string): { width: number; height: number } | null {
  const viewBoxMatch = svgText.match(/viewBox\s*=\s*"([^"]+)"/i)
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return { width: parts[2], height: parts[3] }
    }
  }
  const widthMatch = svgText.match(/<svg[^>]*\swidth\s*=\s*"([^"]+)"/i)
  const heightMatch = svgText.match(/<svg[^>]*\sheight\s*=\s*"([^"]+)"/i)
  if (widthMatch && heightMatch) {
    const w = parseFloat(widthMatch[1])
    const h = parseFloat(heightMatch[1])
    if (Number.isFinite(w) && Number.isFinite(h)) return { width: w, height: h }
  }
  return null
}

/** Nettoie une font-family CSS ("NALHand, 'NAL Hand'") → "NALHand". */
function cleanFontFamily(ff: unknown): string | undefined {
  if (typeof ff !== 'string' || !ff) return undefined
  const first = ff.split(',')[0].trim().replace(/^['"]|['"]$/g, '')
  return first || undefined
}

/**
 * Convertit un FabricText (produit par le parser SVG) en IText ou Textbox éditable.
 *
 * Si metadata contient une width, crée un Textbox avec styles remappés.
 * Sinon, crée un IText.
 * Stocke metadata dans obj.data pour utilisation ultérieure.
 */
function fabricTextToEditableText(
  src: FabricText,
  metadata?: TextMetadata
): IText | Textbox {
  const anySrc = src as unknown as Record<string, unknown>
  const text = typeof src.text === 'string' ? src.text : String(anySrc.text ?? '')

  const opts: Record<string, unknown> = {
    left: src.left,
    top: src.top,
    originX: src.originX,
    originY: src.originY,
    scaleX: src.scaleX,
    scaleY: src.scaleY,
    angle: src.angle,
    skewX: src.skewX,
    skewY: src.skewY,
    flipX: src.flipX,
    flipY: src.flipY,
    opacity: src.opacity,
    visible: src.visible,
    fontSize: src.fontSize,
    fontFamily: cleanFontFamily(src.fontFamily) ?? 'Inter',
    fontWeight: src.fontWeight,
    fontStyle: src.fontStyle,
    underline: src.underline,
    overline: src.overline,
    linethrough: src.linethrough,
    textAlign: src.textAlign,
    lineHeight: src.lineHeight,
    charSpacing: src.charSpacing,
    fill: src.fill,
    stroke: src.stroke,
    strokeWidth: src.strokeWidth,
    shadow: src.shadow,
    textBackgroundColor: src.textBackgroundColor,
    direction: src.direction,
  }

  if (metadata?.width) {
    opts.width = metadata.width

    // Reconstruct text with line breaks between tspans to preserve original SVG layout
    const reconstructedText = metadata.tspans
      .map((tspan) => tspan.textContent)
      .join('\n')

    const styles = remapStylesToFabric(reconstructedText, metadata.tspans)
    if (Object.keys(styles).length > 0) {
      opts.styles = styles
    }
    const textbox = new Textbox(reconstructedText, opts as any)
    const anyTextbox = textbox as FabricObject & { data?: Record<string, unknown> }
    anyTextbox.data = {
      ...(anyTextbox.data ?? {}),
      originalWidth: metadata.width,
      svgTextMetadata: metadata,
    }
    return textbox
  }

  return new IText(text, opts as any)
}

/** Remplace récursivement chaque FabricText non-IText par un IText ou Textbox éditable. */
function upgradeTextsInPlace(
  objects: FabricObject[],
  textMetadataMap: Map<number, TextMetadata>
): FabricObject[] {
  let textIndex = 0

  return objects.map((obj) => {
    if (obj instanceof Group) {
      const children = (obj._objects ?? []) as FabricObject[]
      const upgraded = upgradeTextsInPlace(children, textMetadataMap)
      // Remplace les enfants en conservant les dimensions du groupe
      obj._objects = upgraded
      return obj
    }
    if (obj instanceof FabricText && !(obj instanceof IText) && !(obj instanceof Textbox)) {
      const metadata = textMetadataMap.get(textIndex)
      const result = fabricTextToEditableText(obj, metadata)
      textIndex++
      return result
    }
    return obj
  })
}

type LayerType =
  | 'rect'
  | 'ellipse'
  | 'text'
  | 'image'
  | 'path'
  | 'line'
  | 'group'
  | 'polygon'

function layerTypeFor(obj: FabricObject): LayerType {
  if (obj instanceof IText || obj instanceof Textbox || obj instanceof FabricText) return 'text'
  if (obj instanceof Group) return 'group'
  if (obj instanceof FabricImage) return 'image'
  if (obj instanceof Path) return 'path'
  if (obj instanceof Rect) return 'rect'
  if (obj instanceof Ellipse) return 'ellipse'
  if (obj instanceof Line) return 'line'
  if (obj instanceof Polygon) return 'polygon'
  return 'path'
}

/** Noms d'import — restent vides pour qu'on affiche l'auto-nom `<Type>` dans la panel Calques. */
function humanName(_type: LayerType, _i: number): string {
  return ''
}

/* -------------------------------------------------------------------------
 * Préservation de la hiérarchie des groupes SVG (Illustrator)
 * ----------------------------------------------------------------------- */

type StructNode =
  | { kind: 'leaf'; index: number; name?: string }
  | { kind: 'group'; children: StructNode[]; name?: string }

const RENDERABLE = new Set([
  'path', 'rect', 'circle', 'ellipse', 'line', 'polygon', 'polyline',
  'text', 'tspan', 'image', 'use',
])
const SKIP_TAGS = new Set([
  'defs', 'style', 'metadata', 'title', 'desc',
  'clippath', 'mask', 'pattern', 'filter',
  'lineargradient', 'radialgradient', 'stop',
  'symbol',
])

/**
 * Parcourt le XML du SVG et construit une arborescence (StructNode) reflétant les <g>.
 * Les feuilles sont indexées dans l'ordre DFS des éléments rendus — cet ordre correspond
 * à celui que Fabric émet dans son tableau plat via loadSVGFromString.
 */
function parseSvgStructure(svgText: string): StructNode[] {
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  } catch {
    return []
  }
  const svg = doc.documentElement
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') return []

  let leafIndex = 0

  function walk(el: Element): StructNode | null {
    const tag = el.tagName.toLowerCase()
    if (SKIP_TAGS.has(tag)) return null

    if (tag === 'g') {
      const children: StructNode[] = []
      for (const child of Array.from(el.children)) {
        const node = walk(child)
        if (node) children.push(node)
      }
      if (children.length === 0) return null
      const name = el.getAttribute('id') ?? undefined
      return { kind: 'group', children, name }
    }

    if (RENDERABLE.has(tag)) {
      // <text> émet un seul FabricText — ne pas descendre dans <tspan>
      if (tag === 'text' || tag === 'tspan' || tag === 'use') {
        if (tag === 'tspan') return null  // déjà comptabilisé par parent <text>
      }
      const idx = leafIndex++
      const name = el.getAttribute('id') ?? undefined
      return { kind: 'leaf', index: idx, name }
    }

    // Autre conteneur non skip (rare) : traverser
    const children: StructNode[] = []
    for (const child of Array.from(el.children)) {
      const node = walk(child)
      if (node) children.push(node)
    }
    return children.length > 0 ? { kind: 'group', children } : null
  }

  const topLevel: StructNode[] = []
  for (const child of Array.from(svg.children)) {
    const node = walk(child)
    if (node) topLevel.push(node)
  }
  return topLevel
}

/** Assemble les objets Fabric plats en une hiérarchie nested en suivant la struct SVG. */
function buildHierarchy(flat: FabricObject[], struct: StructNode[]): FabricObject[] {
  function build(node: StructNode): FabricObject | null {
    if (node.kind === 'leaf') {
      const obj = flat[node.index]
      if (!obj) return null
      if (node.name) {
        const anyObj = obj as FabricObject & { data?: Record<string, unknown> }
        anyObj.data = { ...(anyObj.data ?? {}), name: node.name }
      }
      return obj
    }
    const children = node.children
      .map(build)
      .filter((c): c is FabricObject => c !== null)
    if (children.length === 0) return null
    const group = new Group(children)
    const anyGroup = group as FabricObject & { data?: Record<string, unknown> }
    anyGroup.data = {
      ...(anyGroup.data ?? {}),
      type: 'group',
      name: node.name ?? '',
    }
    return group
  }
  return struct.map(build).filter((o): o is FabricObject => o !== null)
}

let svgCounter = 0
function svgId(): string {
  svgCounter += 1
  return `svg_${Date.now().toString(36)}_${svgCounter}`
}

/** Parcourt récursivement et enregistre chaque fontFamily utilisé pour qu'il apparaisse dans le TextToolbar. */
function registerUsedFonts(objects: FabricObject[]) {
  for (const obj of objects) {
    if (obj instanceof Group) {
      registerUsedFonts((obj._objects ?? []) as FabricObject[])
      continue
    }
    if (obj instanceof IText || obj instanceof Textbox || obj instanceof FabricText) {
      const family = (obj as unknown as { fontFamily?: string }).fontFamily
      if (typeof family === 'string' && family.trim()) {
        registerDynamicFontVariant(family, '400', 'normal', '', family)
      }
    }
  }
}

/** Parcourt l'arbre (y compris les enfants de Group) et applique data + flags Fabric. */
function decorateAll(objects: FabricObject[]): void {
  for (const obj of objects) {
    const kind = layerTypeFor(obj)
    const anyObj = obj as FabricObject & { data?: Record<string, unknown> }
    const existing = anyObj.data ?? {}
    anyObj.data = {
      ...existing,
      id: (existing.id as string | undefined) ?? svgId(),
      type: kind,
      name: (existing.name as string | undefined) ?? humanName(kind, 0),
    }
    obj.set({
      objectCaching: true,
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
    })
    if (obj instanceof Group) {
      const children = (obj._objects ?? []) as FabricObject[]
      decorateAll(children)
    }
  }
}

export async function parseSvgToFabric(svgText: string): Promise<SvgParseResult> {
  // Phase 1: XML parse to extract text metadata
  const textMetadataList = parseTextElements(svgText)
  const textMetadataMap = new Map(textMetadataList.map((m, i) => [i, m]))

  // Phase 2: Fabric parse (normal)
  const parsed = await loadSVGFromString(svgText)
  const rawObjects = (parsed.objects ?? []).filter((o): o is FabricObject => !!o)

  // Phase 3: Upgrade texts with metadata
  const flatObjects = upgradeTextsInPlace(rawObjects, textMetadataMap)
  registerUsedFonts(flatObjects)

  // Reconstruit la hiérarchie des <g> depuis le XML source. Fallback : liste plate.
  const structure = parseSvgStructure(svgText)
  const objects = structure.length > 0
    ? buildHierarchy(flatObjects, structure)
    : flatObjects

  const dims = extractViewBox(svgText) ?? { width: 1920, height: 1080 }
  const optsWidth = Number((parsed.options as Record<string, unknown>)?.width)
  const optsHeight = Number((parsed.options as Record<string, unknown>)?.height)
  const width = Number.isFinite(optsWidth) && optsWidth > 0 ? optsWidth : dims.width
  const height = Number.isFinite(optsHeight) && optsHeight > 0 ? optsHeight : dims.height

  decorateAll(objects)

  return { objects, width, height }
}
