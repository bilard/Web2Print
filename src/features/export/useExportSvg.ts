import { useCallback } from 'react'
import { FabricImage, type FabricObject } from 'fabric'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'

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

export function useExportSvg() {
  const projectTitle = useEditorStore((s) => s.projectTitle)

  const exportSvg = useCallback(async (): Promise<void> => {
    const canvas = globalFabricCanvas
    if (!canvas) return

    canvas.discardActiveObject()
    canvas.requestRenderAll()

    // Retire la grille pendant l'export.
    const gridObjects = canvas.getObjects().filter((o) => o.data?.isGrid)
    gridObjects.forEach((o) => canvas.remove(o))

    // Sauvegarde l'état qu'on va modifier le temps de l'export.
    const savedCanvasBgColor = canvas.backgroundColor
    const tempExcluded: FabricObject[] = []

    // Couleur de fond Fabric = thème dark de l'éditeur (#111111) — Fabric
    // l'injecterait comme `<rect fill="…" width="100%" height="100%">` couvrant
    // tout l'export. On la neutralise.
    canvas.backgroundColor = ''

    // Inclut le pageBg (rect blanc / image / dégradé du document) à l'export
    // en désactivant temporairement son `excludeFromExport`.
    for (const o of canvas.getObjects()) {
      if (o.data?.isPageBg && (o as FabricObject & { excludeFromExport?: boolean }).excludeFromExport) {
        ;(o as FabricObject & { excludeFromExport?: boolean }).excludeFromExport = false
        tempExcluded.push(o)
      }
    }

    // Assigne un ID à tous les clipPaths qui n'en ont pas — voir commentaire
    // sur ensureClipPathIds plus haut.
    for (const o of canvas.getObjects()) ensureClipPathIds(o)

    // Embarque les images <img> en data: URLs pour qu'Illustrator n'ait pas
    // à résoudre des liens externes (Unsplash/DAM/etc).
    const imageRestorations = embedImagesAsDataUrls(canvas)

    const { canvasWidth, canvasHeight, canvasBg } = useUIStore.getState()

    const svgMarkup = canvas.toSVG({
      viewBox: { x: 0, y: 0, width: canvasWidth, height: canvasHeight },
      width: `${canvasWidth}`,
      height: `${canvasHeight}`,
    })

    // Restauration de l'état canvas.
    restoreImageElements(imageRestorations)
    canvas.backgroundColor = savedCanvasBgColor
    for (const o of tempExcluded) {
      ;(o as FabricObject & { excludeFromExport?: boolean }).excludeFromExport = true
    }
    gridObjects.forEach((o) => canvas.add(o))
    canvas.requestRenderAll()

    // Post-traitement :
    //   1. Remonte les <clipPath> inline dans <defs> et retire les
    //      clip-path parasites à l'intérieur (compat Illustrator).
    //   2. Trie les <stop> par offset croissant et convertit rgba()
    //      en rgb()+stop-opacity (Illustrator ne tolère ni l'un ni l'autre).
    let finalSvg = normalizeGradientStops(flattenClipPathsToDefs(svgMarkup))

    // Filet de sécurité : injecte un rect de fond après le `<svg …>` si la
    // couleur de fond du document est définie et que le pageBg n'a pas couvert
    // l'arrière-plan (cas d'un fond image/dégradé qui n'aurait pas exporté).
    if (canvasBg && canvasBg !== 'transparent' && tempExcluded.length === 0) {
      const bgRect = `<rect x="0" y="0" width="${canvasWidth}" height="${canvasHeight}" fill="${canvasBg}"/>`
      finalSvg = finalSvg.replace(/(<svg[^>]*>)/, `$1${bgRect}`)
    }

    const blob = new Blob([finalSvg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectTitle.replace(/[^a-z0-9]/gi, '_')}.svg`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [projectTitle])

  return { exportSvg }
}
