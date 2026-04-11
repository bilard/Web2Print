import { FabricImage, Pattern, type Canvas, type FabricObject } from 'fabric'
import { syncToStore } from './useAddObject'

/**
 * Applique une image comme Pattern fill sur un FabricObject.
 *
 * Comportement "cover" : l'image est scalée uniformément pour remplir
 * la bounding box de l'objet, l'excédent est centré via `patternTransform`.
 *
 * Passe par `FabricImage.fromURL` (et non `new Image()`) pour deux raisons :
 *  1. Fabric gère proprement l'async et le CORS (Pexels/Unsplash) via son loader interne
 *  2. L'élément DOM extrait est déjà décodé au moment où on crée le Pattern,
 *     donc le rendu Canvas n'affiche pas un frame vide
 *
 * Utilisé par :
 *  - `PropertiesPanel > ImageFillPicker` (upload local ou galerie Nano Banana)
 *  - `DamImageCard` quand `damPickerMode === 'fill'`
 */
export async function applyImageFill(
  fObj: FabricObject,
  canvas: Canvas,
  url: string
): Promise<void> {
  try {
    const fabricImg = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
    const element = (fabricImg as any).getElement?.() as
      | HTMLImageElement
      | HTMLCanvasElement
      | undefined
    if (!element) {
      console.warn('[applyImageFill] Unable to extract image element from FabricImage')
      return
    }

    const objW = ((fObj as any).width ?? 100) as number
    const objH = ((fObj as any).height ?? 100) as number
    const imgW = (fabricImg.width ?? 100) as number
    const imgH = (fabricImg.height ?? 100) as number
    const scale = Math.max(objW / imgW, objH / imgH)
    const offsetX = (objW - imgW * scale) / 2
    const offsetY = (objH - imgH * scale) / 2

    const pattern = new Pattern({
      source: element as any,
      repeat: 'no-repeat',
      patternTransform: [scale, 0, 0, scale, offsetX, offsetY],
    })

    fObj.set('fill', pattern)
    ;(fObj as any).data = { ...(fObj as any).data, fillImage: url }
    ;(fObj as any).dirty = true
    ;(fObj as any)._cacheCanvas = null
    fObj.setCoords()
    canvas.fire('object:modified', { target: fObj })
    canvas.requestRenderAll()
    syncToStore(canvas)
  } catch (err) {
    console.error('[applyImageFill] Failed to apply image fill:', err)
  }
}
