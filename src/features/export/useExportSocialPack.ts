// Déclinaisons multi-format v1 : exporte le design en pack de formats sociaux
// (post carré, story, paysage, bannière). Le design est rendu une fois pleine
// page puis posé en « contain » centré sur chaque format, fond = couleur de
// page. V2 (re-layout adaptatif par zones) documentée dans le design doc.
import { useCallback } from 'react'
import JSZip from 'jszip'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'
import { recordAudit } from '@/lib/auditLog'
import { useUIStore } from '@/stores/ui.store'

const PACK_TARGETS = [
  { id: 'post-carre', label: 'Post carré', w: 1080, h: 1080 },
  { id: 'story', label: 'Story / Reel', w: 1080, h: 1920 },
  { id: 'post-paysage', label: 'Post paysage', w: 1920, h: 1080 },
  { id: 'banniere', label: 'Bannière', w: 1500, h: 500 },
] as const

/** Rend la page (sans grille ni marques) en PNG haute résolution. */
async function snapshotPage(): Promise<{ img: HTMLImageElement; bg: string }> {
  const canvas = globalFabricCanvas
  if (!canvas) throw new Error('Canvas indisponible.')
  const { canvasWidth, canvasHeight, canvasBg } = useUIStore.getState()

  canvas.discardActiveObject()
  const hidden = canvas.getObjects().filter((o) => o.data?.isGrid || o.data?.isPrintMark)
  hidden.forEach((o) => canvas.remove(o))

  const savedVt = canvas.viewportTransform ? [...canvas.viewportTransform] : [1, 0, 0, 1, 0, 0]
  const savedW = canvas.getWidth()
  const savedH = canvas.getHeight()
  // 2× plafonné : assez net pour 1920 px de large sans exploser la mémoire.
  const scale = Math.min(2, 2600 / Math.max(canvasWidth, canvasHeight))

  let dataUrl: string
  try {
    canvas.setViewportTransform([scale, 0, 0, scale, 0, 0])
    canvas.setDimensions({ width: canvasWidth * scale, height: canvasHeight * scale })
    dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1, quality: 1 })
  } finally {
    canvas.setDimensions({ width: savedW, height: savedH })
    canvas.setViewportTransform(savedVt as [number, number, number, number, number, number])
    hidden.forEach((o) => canvas.add(o))
    canvas.requestRenderAll()
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('Rendu du design illisible.'))
    i.src = dataUrl
  })
  const bg = typeof canvasBg === 'string' && canvasBg ? canvasBg : '#ffffff'
  return { img, bg }
}

/** Pose le rendu en « contain » centré sur un canvas cible, fond couleur de page. */
function composeTarget(img: HTMLImageElement, bg: string, w: number, h: number): Promise<Blob> {
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')!
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)
  const fit = Math.min(w / img.width, h / img.height)
  const dw = img.width * fit
  const dh = img.height * fit
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob a échoué'))), 'image/png'),
  )
}

export function useExportSocialPack() {
  const projectTitle = useEditorStore((s) => s.projectTitle)

  const exportSocialPack = useCallback(async (): Promise<void> => {
    const { img, bg } = await snapshotPage()
    const zip = new JSZip()
    for (const t of PACK_TARGETS) {
      const blob = await composeTarget(img, bg, t.w, t.h)
      zip.file(`${t.id}_${t.w}x${t.h}.png`, blob)
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectTitle.replace(/[^a-z0-9]/gi, '_')}_pack_social.zip`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    recordAudit({ action: 'export.social', module: 'export', targetLabel: a.download })
  }, [projectTitle])

  return { exportSocialPack }
}
