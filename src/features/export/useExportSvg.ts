import { useCallback } from 'react'
import { FabricImage, type FabricObject } from 'fabric'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { buildFontFaceCss } from '@/features/assets/fontBufferRegistry'

/**
 * Pré-assigne `clipPathId` à chaque clipPath du graphe d'objets.
 *
 * Fabric `getSvgCommons()` (fabric/dist/index.js:4028) lit
 * `this.clipPath.clipPathId` pour produire `clip-path="url(#…)"`. Quand un
 * parent rend son clipPath via `_createBaseSVGMarkup`, il assigne le
 * `clipPathId` juste avant de sérialiser — mais SEULEMENT au premier niveau.
 * Si le clipPath a lui-même un `clipPath` (cas fréquent à l'import IDML —
 * 29/58 références dans nos tests), le clipPathId du clipPath imbriqué reste
 * `undefined` et Fabric écrit `url(#undefined)` dans le `<clipPath>` parent.
 * Les viewers SVG (Illustrator inclus) interprètent ça comme un clip vide →
 * l'élément clippé disparaît.
 */
let clipIdCounter = 0
function ensureClipPathIds(obj: FabricObject): void {
  const cp = (obj as FabricObject & { clipPath?: FabricObject & { clipPathId?: string } }).clipPath
  if (cp) {
    if (!cp.clipPathId) cp.clipPathId = `wpClip_${++clipIdCounter}`
    ensureClipPathIds(cp as unknown as FabricObject)
  }
  const children = (obj as FabricObject & { _objects?: FabricObject[] })._objects
  if (children) {
    for (const child of children) ensureClipPathIds(child)
  }
}

/**
 * Embarque chaque FabricImage en data: URL le temps de l'export SVG.
 *
 * Fabric `getSrc(true)` (fabric/dist/index.js:19505) appelle
 * `element.toDataURL()` UNIQUEMENT si `_element` est un `<canvas>`. Pour les
 * images chargées via `<img>` (DAM, Unsplash, IDML lié), il retombe sur
 * `element.src` — l'URL d'origine. Illustrator ouvre alors le SVG, voit un
 * `<image href="https://images.unsplash.com/…">` et tente de résoudre le lien
 * sur disque → boîte « Impossible de trouver le fichier lié ».
 *
 * On remplace temporairement `_element` / `_originalElement` par un canvas
 * off-screen qui répond à `toDataURL()`, puis on restaure après `toSVG()`.
 * Si le canvas est CORS-tainted (image chargée sans `crossOrigin`), on laisse
 * l'URL telle quelle — c'est dégradé mais on évite de planter l'export.
 */
type ImageRestore = { obj: FabricImage; origElement: unknown; origOriginal: unknown }

function embedImagesAsDataUrls(canvas: { getObjects(): FabricObject[] }): ImageRestore[] {
  const restorations: ImageRestore[] = []
  const visit = (objs: FabricObject[]): void => {
    for (const obj of objs) {
      const children = (obj as FabricObject & { _objects?: FabricObject[] })._objects
      if (children) visit(children)

      // Détecter par `type` ET `instanceof` — `type` suffit quand
      // FabricImage vient d'une autre instance de module (e.g. plugin).
      const objType = (obj as FabricObject & { type?: string }).type
      if (objType !== 'image' && !(obj instanceof FabricImage)) continue
      const anyImg = obj as FabricObject & {
        _element?: HTMLImageElement | HTMLCanvasElement
        _originalElement?: HTMLImageElement | HTMLCanvasElement
      }
      const el = anyImg._element
      if (!el) continue
      // Déjà un canvas (Fabric utilisera toDataURL nativement).
      if (typeof (el as HTMLCanvasElement).toDataURL === 'function' && !(el instanceof HTMLImageElement)) continue
      const img = el as HTMLImageElement
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      if (!w || !h) continue

      const off = document.createElement('canvas')
      off.width = w
      off.height = h
      const ctx = off.getContext('2d')
      if (!ctx) continue
      try {
        ctx.drawImage(img, 0, 0)
        // Tente toDataURL — peut throw SecurityError si tainted CORS.
        off.toDataURL('image/png')
      } catch (err) {
        console.warn('[exportSvg] image non embarquée (CORS tainted):', img.src, err)
        continue
      }

      restorations.push({
        obj: anyImg as unknown as FabricImage,
        origElement: anyImg._element,
        origOriginal: anyImg._originalElement,
      })
      anyImg._element = off
      anyImg._originalElement = off
    }
  }
  visit(canvas.getObjects())
  return restorations
}

function restoreImageElements(restorations: ImageRestore[]): void {
  for (const r of restorations) {
    const anyImg = r.obj as FabricImage & {
      _element?: HTMLImageElement | HTMLCanvasElement
      _originalElement?: HTMLImageElement | HTMLCanvasElement
    }
    anyImg._element = r.origElement as HTMLImageElement | HTMLCanvasElement
    anyImg._originalElement = r.origOriginal as HTMLImageElement | HTMLCanvasElement
  }
}

/**
 * Réécrit le markup SVG produit par Fabric pour le rendre compatible avec
 * Illustrator (et autres éditeurs SVG stricts).
 *
 * Fabric pose ses `<clipPath>` *inline* dans le `<g>` parent et laisse aux
 * `<rect>`/`<path>` qui constituent le clip leur propre attribut
 * `clip-path="url(#…)"`. Sur Chrome/Firefox ça rend correctement, mais
 * Illustrator (et resvg, certains import-PDF) ne suivent pas la référence et
 * abandonnent les éléments clippés (rayures de couleur, calligraphie,
 * dégradés-dans-groupes…) — c'est ce que l'utilisateur voit comme « couleurs
 * manquantes ».
 *
 * Deux transformations :
 *   1. Tous les blocs `<clipPath …>…</clipPath>` sont extraits du flux et
 *      regroupés dans un `<defs>…</defs>` unique en tête de SVG.
 *   2. À l'intérieur de chaque `<clipPath>`, on supprime l'attribut
 *      `clip-path="url(#…)"` parasite que Fabric pose sur les rects/paths du
 *      clip (sémantiquement nul dans un clipPath, mais source de confusion
 *      pour les parseurs SVG stricts).
 */
function flattenClipPathsToDefs(svg: string): string {
  // 1. Extraire tous les <clipPath …>…</clipPath> du flux.
  const clipPaths: string[] = []
  const withoutClips = svg.replace(/<clipPath\b[\s\S]*?<\/clipPath>\s*/g, (match) => {
    // 2. Nettoie les `clip-path="…"` à l'intérieur du clipPath (parasites).
    const cleaned = match.replace(/\s+clip-path="url\(#[^"]+\)"/g, '')
    clipPaths.push(cleaned.trimEnd())
    return ''
  })

  if (clipPaths.length === 0) return svg

  // 3. Réinjecter dans le bloc <defs>…</defs> existant (Fabric l'ouvre toujours).
  const defsBlock = `<defs>\n${clipPaths.join('\n')}\n</defs>`
  if (/<defs>\s*<\/defs>/.test(withoutClips)) {
    return withoutClips.replace(/<defs>\s*<\/defs>/, defsBlock)
  }
  // Repli : pas de <defs> vide → insérer après l'ouverture <svg>.
  return withoutClips.replace(/(<svg[^>]*>)/, `$1\n${defsBlock}`)
}

/**
 * Normalise les `<linearGradient>` / `<radialGradient>` produits par Fabric
 * pour qu'Illustrator (et autres parseurs SVG stricts) interprète les couleurs.
 *
 * Deux problèmes côté Fabric :
 *   1. Les `<stop>` sont émis dans l'ordre d'insertion du `colorStops`. Quand
 *      l'import (IDML) pousse les stops en ordre décroissant (offset 1 → 0),
 *      la spec SVG l'interdit. Chrome/Firefox trient implicitement ;
 *      Illustrator garde l'ordre et collapse le gradient sur la première
 *      couleur (souvent du noir/transparent) → rect « noir ».
 *   2. Les couleurs sont posées en `style="stop-color:rgba(r,g,b,a);"`.
 *      Illustrator ne parse pas l'alpha dans `stop-color` — la couleur tombe
 *      au noir. La spec attend `stop-color` (rgb/hex) + `stop-opacity` séparés.
 */
function normalizeGradientStops(svg: string): string {
  return svg.replace(
    /(<(?:linear|radial)Gradient\b[^>]*>)([\s\S]*?)(<\/(?:linear|radial)Gradient>)/g,
    (_match, open: string, body: string, close: string) => {
      // Convertit rgba()→rgb()+stop-opacity dans chaque stop.
      const fixedBody = body.replace(
        /<stop\b([^/>]*?)\/?>/g,
        (_stopMatch, attrs: string) => {
          let fixed = attrs.replace(
            /style="([^"]*)"/,
            (_, style: string) => {
              const m = /stop-color\s*:\s*(rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\))/i.exec(style)
              if (!m) return `style="${style}"`
              const rgba = m[1]
              const alpha = parseFloat(m[2])
              const rgb = rgba.replace(/^rgba\(/i, 'rgb(').replace(/,\s*[\d.]+\s*\)$/, ')')
              const cleaned = style
                .replace(/stop-color\s*:[^;]+;?/i, '')
                .replace(/stop-opacity\s*:[^;]+;?/i, '')
                .replace(/;+\s*;+/g, ';')
                .replace(/^\s*;+|;+\s*$/g, '')
              const parts = [`stop-color:${rgb}`]
              if (alpha < 1) parts.push(`stop-opacity:${alpha}`)
              const merged = cleaned ? `${parts.join(';')};${cleaned}` : parts.join(';')
              return `style="${merged}"`
            },
          )
          return `<stop${fixed}/>`
        },
      )

      // Trie les <stop> par offset croissant.
      const stopRe = /<stop\b[^/]*\/>/g
      const stops = fixedBody.match(stopRe) ?? []
      if (stops.length < 2) return `${open}${fixedBody}${close}`
      const parsed = stops.map((s) => {
        const off = /offset="([^"]+)"/.exec(s)
        let value = 0
        if (off) {
          const raw = off[1].trim()
          value = raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw)
        }
        return { stop: s, offset: Number.isFinite(value) ? value : 0 }
      })
      parsed.sort((a, b) => a.offset - b.offset)
      const reorderedBody = parsed.map((p) => p.stop).join('\n')
      return `${open}\n${reorderedBody}\n${close}`
    },
  )
}

/**
 * Calcule la bounding box du contenu réel du canvas (exclut fond de page, grille,
 * marques d'impression, guides de crop). Renvoie null si vide. Utilisé en mode
 * vidéo (`cropToContent`) pour que la frame MP4 colle au design plutôt qu'à la
 * surface canvas (souvent dimensionnée au format source IDML/PDF avec marges
 * blanches autour).
 */
function computeContentBoundingBox(
  objects: FabricObject[],
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number; width: number; height: number } | null {
  const relevant = objects.filter((o) => {
    const d = (o as FabricObject & { data?: Record<string, unknown> }).data
    const excluded = (o as FabricObject & { excludeFromExport?: boolean }).excludeFromExport
    if (excluded) return false
    if (!d) return true
    return (
      !d.isGrid && !d.isPageBg && !d.isPrintMark &&
      !d.isCropGrid && !d.isCropDim && !d.isCropFrame && !d.isCropGhost
    )
  })
  if (relevant.length === 0) return null
  let minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity
  for (const o of relevant) {
    const r = o.getBoundingRect()
    if (!Number.isFinite(r.left) || !Number.isFinite(r.top)) continue
    minL = Math.min(minL, r.left)
    minT = Math.min(minT, r.top)
    maxR = Math.max(maxR, r.left + r.width)
    maxB = Math.max(maxB, r.top + r.height)
  }
  if (!Number.isFinite(minL)) return null
  // Clamp à la zone canvas (objets pourraient déborder en cas d'objets hors-zone).
  const x = Math.max(0, minL)
  const y = Math.max(0, minT)
  const w = Math.min(canvasWidth - x, maxR - x)
  const h = Math.min(canvasHeight - y, maxB - y)
  if (w <= 0 || h <= 0) return null
  return { x, y, width: w, height: h }
}

export interface GenerateSvgOptions {
  /** Cadre le viewBox SVG sur la bounding box du contenu réel (exclut fond, grille,
   *  marques d'impression). Utilisé par la capture vidéo pour que le MP4 final
   *  soit cadré sur le design, pas sur la surface canvas. */
  cropToContent?: boolean
  /** Embarque les fonts custom utilisées en `@font-face` base64 dans `<defs>`.
   *  Indispensable pour le rendu Cloud Run (browser headless sans FontFace API
   *  runtime) — sinon les textes fallback sur Arial/Times. */
  embedFonts?: boolean
}

/**
 * Extrait les `font-family` uniques utilisées dans le SVG. Lit l'attribut
 * `font-family="..."` (Fabric peut écrire une chaîne avec fallback, ex.
 * `"DIN OT", "Helvetica"`) — on prend la première family non générique.
 */
function extractFontFamilies(svg: string): Set<string> {
  const families = new Set<string>()
  const re = /font-family="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(svg)) !== null) {
    const first = m[1].split(',')[0]?.trim().replace(/^['"]|['"]$/g, '')
    if (first && !/^(serif|sans-serif|monospace|cursive|fantasy)$/i.test(first)) {
      families.add(first)
    }
  }
  return families
}

export interface GenerateSvgFromCanvasOptions extends GenerateSvgOptions {
  /** Largeur de référence pour la bounding box (en px canvas). */
  canvasWidth?: number
  /** Hauteur de référence pour la bounding box (en px canvas). */
  canvasHeight?: number
  /** Couleur de fond du canvas (ex. '#ffffff', 'transparent'). */
  canvasBg?: string
}

/**
 * Génère un SVG depuis un canvas Fabric explicitement passé en paramètre.
 * Utilisable sans `globalFabricCanvas` (ex. canvas offscreen de workflow).
 */
export async function generateSvgFromCanvas(
  canvas: import('fabric').Canvas,
  options?: GenerateSvgFromCanvasOptions,
): Promise<{
  svg: string
  width: number
  height: number
} | null> {
  canvas.discardActiveObject()
  canvas.requestRenderAll()

  const gridObjects = canvas.getObjects().filter((o) => o.data?.isGrid)
  gridObjects.forEach((o) => canvas.remove(o))

  const savedCanvasBgColor = canvas.backgroundColor
  const tempExcluded: FabricObject[] = []
  canvas.backgroundColor = ''

  for (const o of canvas.getObjects()) {
    if (o.data?.isPageBg && (o as FabricObject & { excludeFromExport?: boolean }).excludeFromExport) {
      ;(o as FabricObject & { excludeFromExport?: boolean }).excludeFromExport = false
      tempExcluded.push(o)
    }
  }

  for (const o of canvas.getObjects()) ensureClipPathIds(o)
  const imageRestorations = embedImagesAsDataUrls(canvas)

  // Dimensions : priorité aux options explicites, sinon dimensions réelles du canvas
  const canvasWidth = options?.canvasWidth ?? canvas.getWidth()
  const canvasHeight = options?.canvasHeight ?? canvas.getHeight()
  const canvasBg = options?.canvasBg ?? ''

  const bbox = options?.cropToContent
    ? computeContentBoundingBox(canvas.getObjects(), canvasWidth, canvasHeight)
    : null
  const vbX = bbox?.x ?? 0
  const vbY = bbox?.y ?? 0
  const vbW = bbox?.width ?? canvasWidth
  const vbH = bbox?.height ?? canvasHeight

  const svgMarkup = canvas.toSVG({
    viewBox: { x: vbX, y: vbY, width: vbW, height: vbH },
    width: `${vbW}`,
    height: `${vbH}`,
  })

  restoreImageElements(imageRestorations)
  canvas.backgroundColor = savedCanvasBgColor
  for (const o of tempExcluded) {
    ;(o as FabricObject & { excludeFromExport?: boolean }).excludeFromExport = true
  }
  gridObjects.forEach((o) => canvas.add(o))
  canvas.requestRenderAll()

  let finalSvg = normalizeGradientStops(flattenClipPathsToDefs(svgMarkup))

  if (canvasBg && canvasBg !== 'transparent' && tempExcluded.length === 0) {
    const bgRect = `<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="${canvasBg}"/>`
    finalSvg = finalSvg.replace(/(<svg[^>]*>)/, `$1${bgRect}`)
  }

  if (options?.embedFonts) {
    const families = extractFontFamilies(finalSvg)
    if (families.size > 0) {
      const css = buildFontFaceCss(families)
      if (css) {
        const styleBlock = `<style type="text/css"><![CDATA[\n${css}\n]]></style>`
        if (/<defs\b[^>]*>/.test(finalSvg)) {
          finalSvg = finalSvg.replace(/(<defs\b[^>]*>)/, `$1${styleBlock}`)
        } else {
          finalSvg = finalSvg.replace(/(<svg[^>]*>)/, `$1<defs>${styleBlock}</defs>`)
        }
      }
    }
  }

  return { svg: finalSvg, width: vbW, height: vbH }
}

export async function generateCurrentPageSvg(
  options?: GenerateSvgOptions,
): Promise<{
  svg: string
  width: number
  height: number
} | null> {
  const canvas = globalFabricCanvas
  if (!canvas) return null

  const { canvasWidth, canvasHeight, canvasBg } = useUIStore.getState()

  return generateSvgFromCanvas(canvas, {
    ...options,
    canvasWidth,
    canvasHeight,
    canvasBg,
  })
}

export function useExportSvg() {
  const projectTitle = useEditorStore((s) => s.projectTitle)

  const exportSvg = useCallback(async (): Promise<void> => {
    const result = await generateCurrentPageSvg()
    if (!result) return

    const blob = new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectTitle.replace(/[^a-z0-9]/gi, '_')}.svg`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [projectTitle])

  return { exportSvg }
}
