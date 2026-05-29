import { useCallback } from 'react'
import JSZip from 'jszip'
import { Textbox, FabricImage } from 'fabric'
import type { Canvas, FabricObject } from 'fabric'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'

/** Génère un div positionné absolument avec le texte transparent (accessible, sélectionnable) */
function textToHtmlOverlay(obj: FabricObject): string {
  if (!(obj instanceof Textbox)) return ''
  if (!obj.visible || !obj.text?.trim()) return ''

  const l = Math.round(obj.left ?? 0)
  const t = Math.round(obj.top ?? 0)
  const w = Math.round((obj.width ?? 0) * (obj.scaleX ?? 1))
  const h = Math.round((obj.height ?? 0) * (obj.scaleY ?? 1))
  const angle = obj.angle ?? 0

  const style = [
    `position:absolute`,
    `left:${l}px`,
    `top:${t}px`,
    `width:${w}px`,
    `height:${h}px`,
    angle !== 0 ? `transform:rotate(${angle}deg)` : '',
    `transform-origin:center center`,
    `font-size:${obj.fontSize ?? 16}px`,
    `font-family:'${obj.fontFamily ?? 'sans-serif'}',sans-serif`,
    `font-weight:${obj.fontWeight ?? 'normal'}`,
    `font-style:${obj.fontStyle ?? 'normal'}`,
    `text-align:${obj.textAlign ?? 'left'}`,
    `line-height:${obj.lineHeight ?? 1.2}`,
    `white-space:pre-wrap`,
    `word-break:break-word`,
    `box-sizing:border-box`,
    // Transparent : le visuel vient du PNG, le texte reste accessible
    `color:transparent`,
    `background:transparent`,
    `pointer-events:auto`,
    `user-select:text`,
    `-webkit-user-select:text`,
  ].filter(Boolean).join(';') + ';'

  const escaped = (obj.text ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')

  return `<div style="${style}" aria-label="${escaped.replace(/"/g, '&quot;')}">${escaped}</div>`
}

/** Collecte les noms de polices uniques depuis les objets texte */
function collectFonts(objects: FabricObject[]): string[] {
  const fonts = new Set<string>()
  for (const obj of objects) {
    if (obj instanceof Textbox && obj.fontFamily) {
      const family = obj.fontFamily.trim()
      if (family && family.toLowerCase() !== 'sans-serif' && family.toLowerCase() !== 'serif' && family.toLowerCase() !== 'monospace') {
        fonts.add(family)
      }
    }
  }
  return [...fonts]
}

function buildHtml(
  title: string,
  w: number,
  h: number,
  fonts: string[],
  textOverlays: string[],
): string {
  const escapedTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const fontLink = fonts.length > 0
    ? `\n  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link href="https://fonts.googleapis.com/css2?${fonts.map((f) => `family=${encodeURIComponent(f)}:wght@400;700`).join('&')}&display=swap" rel="stylesheet">`
    : ''

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">${fontLink}
  <title>${escapedTitle}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="page" style="width:${w}px;height:${h}px;">
    <!-- Visuel complet du design -->
    <img class="page-bg" src="assets/page.png" alt="${escapedTitle}" />
    <!-- Textes invisibles pour l'accessibilité et le copier-coller -->
    <div class="text-layer">
${textOverlays.map((el) => '      ' + el).join('\n')}
    </div>
  </main>
</body>
</html>`
}

function buildCss(): string {
  return `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #111;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 2rem;
  min-height: 100vh;
}

.page {
  position: relative;
  overflow: hidden;
  box-shadow: 0 8px 48px rgba(0, 0, 0, 0.6);
  flex-shrink: 0;
}

.page-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: fill;
}

.text-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.text-layer > * {
  pointer-events: auto;
}
`
}

export interface ExportHtmlBlobOptions {
  /** Largeur du canvas en px. */
  canvasWidth: number
  /** Hauteur du canvas en px. */
  canvasHeight: number
  /** Titre du projet (utilisé dans le <title> HTML). */
  title?: string
}

/**
 * Cœur paramétré : génère un Blob ZIP HTML autonome depuis le canvas Fabric fourni.
 * Ne déclenche aucun téléchargement. Utilisable depuis les workflows.
 */
export async function exportHtmlBlob(canvas: Canvas, opts: ExportHtmlBlobOptions): Promise<Blob> {
  const { canvasWidth, canvasHeight, title = 'Design' } = opts

  canvas.discardActiveObject()
  canvas.requestRenderAll()

  const gridObjs = canvas.getObjects().filter((o) => o.data?.isGrid)
  gridObjs.forEach((o) => canvas.remove(o))

  // Réinitialiser le viewport pour capturer le canvas complet à résolution native
  const origVpt = [...(canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0])]
  const origW = canvas.getWidth()
  const origH = canvas.getHeight()
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
  canvas.setDimensions({ width: canvasWidth, height: canvasHeight })
  canvas.requestRenderAll()

  let canvasPng: string
  try {
    canvasPng = canvas.toDataURL({ format: 'png', multiplier: 2, quality: 1 })
  } catch (err) {
    canvas.setViewportTransform(origVpt as [number, number, number, number, number, number])
    canvas.setDimensions({ width: origW, height: origH })
    gridObjs.forEach((o) => canvas.add(o))
    canvas.requestRenderAll()
    if (err instanceof DOMException && err.name === 'SecurityError') {
      throw new Error(
        '[exportHtmlBlob] Canvas tainté (SecurityError) — une image est chargée sans CORS. ' +
        'Vérifiez que les images Firebase Storage ont les en-têtes CORS appropriés.',
        { cause: err },
      )
    }
    throw err
  }

  // Restaurer
  canvas.setViewportTransform(origVpt as [number, number, number, number, number, number])
  canvas.setDimensions({ width: origW, height: origH })
  gridObjs.forEach((o) => canvas.add(o))
  canvas.requestRenderAll()

  const zip = new JSZip()
  const assets = zip.folder('assets')!

  assets.file('page.png', canvasPng.split(',')[1], { base64: true })

  const objects = canvas.getObjects().filter((o) => !o.data?.isGrid && !o.data?.isPageBg)
  let imgIdx = 0
  for (const obj of objects) {
    if (obj instanceof FabricImage) {
      const src = obj.getSrc()
      if (src.startsWith('data:')) {
        const ext = src.includes('data:image/png') ? 'png' : 'jpg'
        assets.file(`img_${imgIdx++}.${ext}`, src.split(',')[1], { base64: true })
      }
    }
  }

  const textOverlays = objects.map(textToHtmlOverlay).filter(Boolean)
  const fonts = collectFonts(objects)

  zip.file('index.html', buildHtml(title, canvasWidth, canvasHeight, fonts, textOverlays))
  zip.file('style.css', buildCss())

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

export function useExportHtml() {
  const projectTitle = useEditorStore((s) => s.projectTitle)
  const { canvasWidth, canvasHeight } = useUIStore()

  const exportHtml = useCallback(async (): Promise<void> => {
    const canvas = globalFabricCanvas
    if (!canvas) return

    const blob = await exportHtmlBlob(canvas, {
      canvasWidth,
      canvasHeight,
      title: projectTitle,
    })

    const slug = projectTitle.replace(/[^a-z0-9]/gi, '_')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}_html.zip`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }, [projectTitle, canvasWidth, canvasHeight])

  return { exportHtml }
}
