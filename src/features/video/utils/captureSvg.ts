import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage, auth } from '@/lib/firebase/config'
import { generateCurrentPageSvg } from '@/features/export/useExportSvg'
import { globalFabricCanvas } from '@/features/editor/globalCanvas'
import { useEditorStore, type CanvasObjectProps } from '@/stores/editor.store'
import type { Animation3DConfig } from '@/features/animation3d/types'
import { t } from '@/lib/i18n'

/** Animation posée par objet (« Animer l'objet ») rejouée dans la vidéo
 *  (Couche B-fidèle). `id` = id injecté sur le `<g>` SVG correspondant. */
export interface CapturedObjectAnim {
  id: string
  config: Animation3DConfig
}

/** Préfixe des ids injectés sur les objets animés avant `toSVG()`, pour que le
 *  template design-reveal puisse cibler chaque objet et rejouer son preset. */
const ANIM_ID_PREFIX = 'w2panim-'

export interface SvgCaptureResult {
  url: string
  storagePath: string
  bytes: number
  width: number
  height: number
  svg: string
  /** Animations par-objet à rejouer dans la vidéo (presets 2D uniquement ;
   *  flip3D/relief3D/particles sont des overlays Three.js non « cuisables »
   *  dans un SVG plat et sont exclus). */
  objectAnimations: CapturedObjectAnim[]
}

/** Presets « cuisables » dans un SVG plat. Les overlays 3D en sont exclus. */
const BAKEABLE_PRESETS = new Set([
  'pulseScale', 'hueCycle', 'slideEntrance', 'slideVertical',
  'motionPath', 'vibrate', 'bounce', 'wave', 'glowAccent', 'rotate3D',
])

interface StoreAnim { id: string; config: Animation3DConfig }

/** Collecte (récursif) les objets du store qui portent une animation cuisable. */
function collectStoreAnims(objs: CanvasObjectProps[]): StoreAnim[] {
  const out: StoreAnim[] = []
  const visit = (list: CanvasObjectProps[]) => {
    for (const o of list) {
      if (o.animation3D?.preset && BAKEABLE_PRESETS.has(o.animation3D.preset)) {
        out.push({ id: o.id, config: o.animation3D })
      }
      if (o.children) visit(o.children)
    }
  }
  visit(objs)
  return out
}

interface FabricLike { data?: { id?: string }; id?: unknown; _objects?: FabricLike[] }

/** Trouve (récursif, y compris dans les groupes) un objet Fabric par `data.id`. */
function findFabricById(objs: FabricLike[], dataId: string): FabricLike | null {
  for (const o of objs) {
    if (o.data?.id === dataId) return o
    if (o._objects) {
      const sub = findFabricById(o._objects, dataId)
      if (sub) return sub
    }
  }
  return null
}

async function uploadSvgToStorage(
  svg: string,
  width: number,
  height: number,
): Promise<Omit<SvgCaptureResult, 'objectAnimations'>> {
  const user = auth.currentUser
  if (!user) throw new Error(t('err.auth.notSignedIn'))

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.svg`
  const storagePath = `video-captures/${user.uid}/${fileName}`

  const ref = storageRef(storage, storagePath)
  await uploadBytes(ref, blob, {
    contentType: 'image/svg+xml',
    cacheControl: 'private, max-age=3600',
  })
  const url = await getDownloadURL(ref)

  return {
    url,
    storagePath,
    bytes: blob.size,
    width,
    height,
    svg,
  }
}

export async function captureCurrentPageSvg(
  opts?: { tagIds?: string[] },
): Promise<SvgCaptureResult> {
  const storeAnims = collectStoreAnims(useEditorStore.getState().canvasObjects)
  const objectAnimations: CapturedObjectAnim[] = []
  const restores: { obj: FabricLike; prev: unknown }[] = []
  const canvas = globalFabricCanvas as unknown as { getObjects(): FabricLike[] } | null

  // Ids à taguer : objets à preset (pour objectAnimations) + ids cités par le plan de motion.
  const presetIds = new Set(storeAnims.map((a) => a.id))
  const extraIds = (opts?.tagIds ?? []).filter((id) => !presetIds.has(id))
  const allToTag: { id: string; config?: Animation3DConfig }[] = [
    ...storeAnims.map((a) => ({ id: a.id, config: a.config })),
    ...extraIds.map((id) => ({ id })),
  ]

  if (canvas && allToTag.length > 0) {
    const roots = canvas.getObjects()
    for (const a of allToTag) {
      const fobj = findFabricById(roots, a.id)
      if (!fobj) continue
      const svgId = ANIM_ID_PREFIX + a.id
      restores.push({ obj: fobj, prev: fobj.id })
      fobj.id = svgId
      if (a.config) objectAnimations.push({ id: svgId, config: a.config })
    }
  }

  try {
    const result = await generateCurrentPageSvg({ cropToContent: false, embedFonts: true })
    if (!result) throw new Error(t('err.vd.noCanvas'))
    const uploaded = await uploadSvgToStorage(result.svg, result.width, result.height)
    return { ...uploaded, objectAnimations }
  } finally {
    for (const r of restores) r.obj.id = r.prev
  }
}
