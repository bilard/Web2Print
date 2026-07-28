import { FabricImage, Pattern, type Canvas, type FabricObject } from 'fabric'
import { collectObjectsDeep } from './deepObjects'
import { debugLog } from '@/lib/debugLog'

/**
 * Recharge en CORS anonyme toutes les images distantes du canvas — images
 * natives ET sources de remplissage (Pattern).
 *
 * ⚠️ Une image `http(s)` chargée SANS `crossOrigin` souille le canvas. Les
 * conséquences vont bien au-delà de l'export :
 *  - `toDataURL` échoue (vignette du projet, miniatures, aperçus) ;
 *  - et surtout `isTargetTransparent` lève une `SecurityError`, ce qui fait
 *    échouer `findTarget` — donc PLUS AUCUN objet n'est sélectionnable ni
 *    redimensionnable dès qu'un seul objet est en `perPixelTargetFind` (posé
 *    par l'import SVG/PDF sur toutes les formes).
 *
 * Le cas se produit à la RÉOUVERTURE d'un projet : `loadFromJSON` recrée les
 * Pattern depuis leur URL sans `crossOrigin`, alors que l'application initiale
 * (`applyImageFill`) la demandait bien. D'où un canvas parfaitement utilisable
 * avant enregistrement, et figé après.
 */
export async function reloadCorsSources(canvas: Canvas): Promise<void> {
  const objects = collectObjectsDeep(canvas.getObjects())
  const jobs: Promise<void>[] = []

  const needsReload = (el: unknown): el is HTMLImageElement => {
    const img = el as HTMLImageElement | null
    return (
      !!img &&
      typeof img.src === 'string' &&
      img.src.startsWith('http') &&
      !img.crossOrigin
    )
  }

  const reload = async (src: string): Promise<HTMLImageElement | HTMLCanvasElement | null> => {
    try {
      const fresh = await FabricImage.fromURL(src, { crossOrigin: 'anonymous' })
      return (fresh as unknown as { getElement?: () => HTMLImageElement }).getElement?.() ?? null
    } catch (err) {
      console.warn('[CORS] rechargement impossible :', src, err)
      return null
    }
  }

  for (const obj of objects) {
    if (obj instanceof FabricImage) {
      const el = (obj as unknown as { getElement?: () => HTMLImageElement }).getElement?.()
      if (needsReload(el)) {
        jobs.push(
          reload(el.src).then((fresh) => {
            if (fresh) obj.setElement(fresh as HTMLImageElement)
          })
        )
      }
      continue
    }
    // Remplissage image d'une forme (bloc image d'un import IDML/SVG)
    for (const key of ['fill', 'stroke'] as const) {
      const filler = (obj as unknown as Record<string, unknown>)[key]
      if (!(filler instanceof Pattern)) continue
      const el = filler.source as unknown
      if (!needsReload(el)) continue
      jobs.push(
        reload(el.src).then((fresh) => {
          if (!fresh) return
          filler.source = fresh as HTMLImageElement
          markDirty(obj)
        })
      )
    }
  }

  if (jobs.length === 0) return
  debugLog(`[CORS] rechargement de ${jobs.length} image(s) distante(s)`)
  await Promise.all(jobs)
  canvas.requestRenderAll()
}

function markDirty(obj: FabricObject): void {
  const any = obj as FabricObject & { dirty?: boolean; _cacheCanvas?: HTMLCanvasElement | undefined }
  any.dirty = true
  any._cacheCanvas = undefined
}

/**
 * Rend le ciblage au pixel INCASSABLE.
 *
 * `perPixelTargetFind` fait lire les pixels de l'objet ; si le canvas est
 * souillé par une image distante, `getImageData` lève et l'exception remonte
 * jusqu'à `findTarget` — l'éditeur devient alors totalement inerte (aucune
 * sélection, aucun redimensionnement). On se rabat sur le ciblage par cadre :
 * un objet un peu trop « attrapant » reste infiniment préférable à un canvas
 * qui ne répond plus.
 */
export function makeTargetFindSafe(canvas: Canvas): void {
  const target = canvas as Canvas & { __safeTargetFind?: boolean }
  if (target.__safeTargetFind) return
  target.__safeTargetFind = true

  const original = canvas.isTargetTransparent.bind(canvas)
  let warned = false
  canvas.isTargetTransparent = (obj: FabricObject, x: number, y: number): boolean => {
    try {
      return original(obj, x, y)
    } catch {
      if (!warned) {
        warned = true
        console.warn(
          '[Canvas] ciblage au pixel indisponible (canvas souillé par une image distante) — repli sur le cadre englobant'
        )
      }
      return false
    }
  }
}
