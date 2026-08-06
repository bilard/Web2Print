// Pixels d'un FabricImage → data URL persistable.
//
// Pourquoi repasser par un canvas plutôt que réutiliser le `src` de l'image : le src
// peut être une URL distante (DAM, Drive, résultat d'un modèle) qui expire, ou une
// ressource cross-origin — dans les deux cas, sauvegarder le lien produit un document
// qui s'affiche vide plus tard. Les pixels, eux, survivent.
import type { FabricImage } from 'fabric'

export function captureImageDataUrl(target: FabricImage): string | null {
  const el = (target as unknown as { getElement?: () => HTMLImageElement }).getElement?.()
  if (!el) return null
  const c = document.createElement('canvas')
  c.width = el.naturalWidth || el.width
  c.height = el.naturalHeight || el.height
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(el, 0, 0)
  return c.toDataURL('image/png')
}
