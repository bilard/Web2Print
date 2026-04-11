import { useEffect, useRef } from 'react'
import { Canvas, FabricImage, Textbox } from 'fabric'
import { doc, updateDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase/config'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { usePaletteStore } from '@/stores/palette.store'
import { usePagesStore } from '@/stores/pages.store'
import { useMergeStore } from '@/stores/merge.store'
import { globalIdmlSource } from '@/features/idml/idmlSource'

/** Global save function — set by useAutoSave, callable from anywhere */
export let globalSave: (() => Promise<void>) | null = null

/** Block auto-save during initial canvas load to prevent overwriting good data */
let _loadingInProgress = false
export function setLoadingInProgress(v: boolean) { _loadingInProgress = v }

/**
 * Before serializing, scan all LIVE canvas objects for non-permanent image URLs.
 * Upload them to Storage and replace src on the live FabricImage.
 * Then serialize to JSON — the permanent URLs will be baked in.
 */
async function persistImagesAndSerialize(canvas: Canvas, projectId: string): Promise<string> {
  // Step 1: Find live FabricImage objects with blob: or data: src
  const liveImages: FabricImage[] = []
  for (const obj of canvas.getObjects()) {
    if (obj instanceof FabricImage) {
      const src = (obj as any).getSrc() || ''
      if (!src) continue
      if (src.startsWith('http://') || src.startsWith('https://')) continue
      if (src.startsWith('blob:') || src.startsWith('data:')) {
        liveImages.push(obj)
      }
    }
  }

  if (liveImages.length > 0) {
    console.log(`[Save] ${liveImages.length} images with non-permanent URLs, uploading to Storage...`)

    await Promise.allSettled(liveImages.map(async (img) => {
      try {
        const el = (img as any).getElement() as HTMLImageElement | HTMLCanvasElement | undefined
        if (!el) {
          console.warn('[Save] No element on FabricImage')
          return
        }

        // Draw image to a temporary canvas to get its pixels as a blob
        const tmpCanvas = document.createElement('canvas')
        const w = (el as any).naturalWidth || el.width
        const h = (el as any).naturalHeight || el.height
        tmpCanvas.width = w
        tmpCanvas.height = h
        const ctx = tmpCanvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(el as HTMLImageElement, 0, 0)

        const blob = await new Promise<Blob | null>((resolve) =>
          tmpCanvas.toBlob(resolve, 'image/png')
        )
        if (!blob) return

        const buffer = await blob.arrayBuffer()
        const name = img.data?.name || `image_${Date.now()}_${Math.random().toString(36).slice(2)}`
        const storageName = name.includes('.') ? name : `${name}.png`

        // Save under projects/links/ path (matches Storage security rules)
        const imgRef = ref(storage, `projects/${projectId}/links/${storageName}`)
        await uploadBytes(imgRef, buffer)
        const permUrl = await getDownloadURL(imgRef)

        // Save current crop/position props before setSrc (which may reset dimensions)
        const savedProps = {
          cropX: (img as any).cropX,
          cropY: (img as any).cropY,
          width: img.width,
          height: img.height,
          scaleX: img.scaleX,
          scaleY: img.scaleY,
        }

        // Replace src on the LIVE FabricImage object
        await img.setSrc(permUrl, { crossOrigin: 'anonymous' })

        // Restore crop/position props that setSrc may have reset
        img.set(savedProps)

        console.log(`[Save] Uploaded "${storageName}" → Storage OK, replaced live src`)
      } catch (err) {
        console.error(`[Save] FAILED to upload image:`, err)
      }
    }))

    canvas.requestRenderAll()
  }

  // Step 1b: Persist non-permanent URLs in data.originalSrc and data.variants
  for (const obj of canvas.getObjects()) {
    if (!(obj instanceof FabricImage)) continue
    const d = (obj as any).data
    if (!d) continue

    const uploadVariantUrl = async (url: string): Promise<string> => {
      if (!url || url.startsWith('http://') || url.startsWith('https://')) return url
      if (!url.startsWith('blob:') && !url.startsWith('data:')) return url
      try {
        const res = await fetch(url)
        const blob = await res.blob()
        const name = `variant_${Date.now()}_${Math.random().toString(36).slice(2)}.png`
        const imgRef = ref(storage, `projects/${projectId}/links/${name}`)
        await uploadBytes(imgRef, blob)
        return await getDownloadURL(imgRef)
      } catch {
        return url // keep as-is if upload fails
      }
    }

    if (d.originalSrc && (d.originalSrc.startsWith('blob:') || d.originalSrc.startsWith('data:'))) {
      d.originalSrc = await uploadVariantUrl(d.originalSrc)
    }

    if (Array.isArray(d.variants)) {
      for (let i = 0; i < d.variants.length; i++) {
        if (d.variants[i].startsWith('blob:') || d.variants[i].startsWith('data:')) {
          d.variants[i] = await uploadVariantUrl(d.variants[i])
        }
      }
    }
  }

  // Step 2: Restore template text/styles/size before serializing (so saved JSON has {{}} placeholders)
  type ResolvedEntry = {
    obj: Textbox
    resolved: string
    resolvedStyles: Record<number, Record<number, Record<string, unknown>>>
    resolvedWidth: number | undefined
  }
  const resolvedTexts: ResolvedEntry[] = []
  for (const obj of canvas.getObjects()) {
    if (obj instanceof Textbox && obj.data?.templateText) {
      const tmpl = obj.data.templateText as string
      if (obj.text !== tmpl) {
        const resolvedStyles = JSON.parse(JSON.stringify((obj as any).styles || {})) as Record<number, Record<number, Record<string, unknown>>>
        const resolvedWidth = obj.width
        resolvedTexts.push({ obj, resolved: obj.text ?? '', resolvedStyles, resolvedWidth })

        obj.set('text', tmpl)

        // Restaurer les styles du template (indices corrects pour le texte template)
        const tStyles = obj.data.templateStyles as Record<number, Record<number, Record<string, unknown>>> | undefined
        ;(obj as any).styles = tStyles && Object.keys(tStyles).length > 0
          ? JSON.parse(JSON.stringify(tStyles))
          : {}

        // Restaurer la largeur originale (avant auto-fit) pour que le template soit lisible
        const origW = obj.data.originalWidth as number | undefined
        if (origW && origW !== obj.width) {
          obj.set('width', origW)
          ;(obj as any).initDimensions?.()
        }
      }
    }
  }

  // Step 3: Serialize with all images now having permanent URLs
  const canvasJson = canvas.toObject(['data'])

  // Step 4: Restore resolved text/styles/size on canvas (user sees data, not templates)
  for (const { obj, resolved, resolvedStyles, resolvedWidth } of resolvedTexts) {
    obj.set('text', resolved)
    ;(obj as any).styles = resolvedStyles
    if (resolvedWidth !== undefined && resolvedWidth !== obj.width) {
      obj.set('width', resolvedWidth)
      ;(obj as any).initDimensions?.()
    }
  }

  return JSON.stringify(canvasJson)
}

export function useAutoSave(fabricRef: React.RefObject<Canvas | null>) {
  const { projectId, projectTitle, titleLoaded, setSaveStatus } = useEditorStore()
  const dataSource = useMergeStore((s) => s.dataSource)
  const saveInProgress = useRef(false)

  const save = async () => {
    const canvas = fabricRef.current
    if (!canvas || !projectId) return
    if (saveInProgress.current || _loadingInProgress) return
    saveInProgress.current = true
    setSaveStatus('saving')
    try {
      // Upload non-permanent images to Storage, then serialize
      const json = await persistImagesAndSerialize(canvas, projectId)
      const { canvasWidth, canvasHeight, canvasBg, canvasBgType, canvasBgGradient, canvasBgImage } = useUIStore.getState()
      const { colors: paletteColors, gradients: paletteGradients } = usePaletteStore.getState()

      // Generate thumbnail
      let thumbnail: string | null = null
      try {
        const savedVt = canvas.viewportTransform ? [...canvas.viewportTransform] : [1, 0, 0, 1, 0, 0]
        const savedW = canvas.getWidth()
        const savedH = canvas.getHeight()

        const thumbScale = 300 / Math.max(canvasWidth, canvasHeight)
        canvas.setViewportTransform([thumbScale, 0, 0, thumbScale, 0, 0])
        canvas.setDimensions({ width: canvasWidth * thumbScale, height: canvasHeight * thumbScale })

        thumbnail = canvas.toDataURL({ format: 'jpeg', quality: 0.7, multiplier: 1 })

        canvas.setDimensions({ width: savedW, height: savedH })
        canvas.setViewportTransform(savedVt as [number, number, number, number, number, number])
        canvas.requestRenderAll()
      } catch {
        // Ignore thumbnail errors
      }

      // Extract charSpacingMaps from live canvas objects (bypass Fabric serialization)
      // Key by text content (data.id is not preserved by Fabric serialization)
      const charSpacingMaps: Record<string, Record<string, number>> = {}
      for (const obj of canvas.getObjects()) {
        const csm = (obj as any).charSpacingMap
        const text = (obj as any).text
        if (csm && text) {
          charSpacingMaps[text] = csm
        }
      }

      const { projectTitle: title } = useEditorStore.getState()
      await updateDoc(doc(db, 'projects', projectId), {
        title,
        canvasData: json,
        charSpacingMaps: Object.keys(charSpacingMaps).length > 0 ? JSON.stringify(charSpacingMaps) : null,
        dataSource: dataSource ? JSON.stringify(dataSource) : null,
        mergeFormulas: Object.keys(useMergeStore.getState().formulas).length > 0
          ? JSON.stringify(useMergeStore.getState().formulas) : null,
        mergeFormulaConfigs: Object.keys(useMergeStore.getState().formulaConfigs).length > 0
          ? JSON.stringify(useMergeStore.getState().formulaConfigs) : null,
        mergeHideLineIfEmpty: Object.keys(useMergeStore.getState().hideLineIfEmpty).length > 0
          ? JSON.stringify(useMergeStore.getState().hideLineIfEmpty) : null,
        canvasWidth,
        canvasHeight,
        canvasBg,
        canvasBgType,
        canvasBgGradient: JSON.stringify(canvasBgGradient),
        canvasBgImage,
        paletteColors: JSON.stringify(paletteColors),
        paletteGradients: JSON.stringify(paletteGradients),
        thumbnail,
        idmlSourceFileName: globalIdmlSource?.fileName ?? null,
        updatedAt: Date.now(),
      })
      setSaveStatus('saved')
    } catch (err) {
      console.error('Save error', err)
      setSaveStatus('unsaved')
    } finally {
      saveInProgress.current = false
    }
  }

  // Expose save globally — use ref to always point to latest save closure
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    globalSave = () => saveRef.current()
    return () => { globalSave = null }
  }, [])  

  // Track canvas changes → mark as unsaved + refresh page thumbnail (debounced)
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !projectId) return

    let thumbTimer: ReturnType<typeof setTimeout> | null = null

    const refreshThumbnail = () => {
      if (thumbTimer) clearTimeout(thumbTimer)
      thumbTimer = setTimeout(() => {
        const { pages, currentPageIndex, updatePage } = usePagesStore.getState()
        const page = pages[currentPageIndex]
        if (!page || !canvas) return
        const thumbnail = canvas.toDataURL({ multiplier: 0.15, format: 'jpeg', quality: 0.5 } as any)
        updatePage(page.id, { thumbnail })
      }, 500)
    }

    const markUnsaved = () => {
      setSaveStatus('unsaved')
      refreshThumbnail()
    }

    canvas.on('object:modified', markUnsaved)
    canvas.on('object:added', markUnsaved)
    canvas.on('object:removed', markUnsaved)

    // Generate initial thumbnail
    refreshThumbnail()

    return () => {
      if (thumbTimer) clearTimeout(thumbTimer)
      canvas.off('object:modified', markUnsaved)
      canvas.off('object:added', markUnsaved)
      canvas.off('object:removed', markUnsaved)
    }
  }, [fabricRef.current, projectId])  

  // Save title immediately when it changes — but only after initial load
  useEffect(() => {
    if (!projectId || !projectTitle || !titleLoaded) return

    const saveTitle = async () => {
      try {
        await updateDoc(doc(db, 'projects', projectId), {
          title: projectTitle,
          updatedAt: Date.now(),
        })
      } catch (err) {
        console.error('Title save error', err)
      }
    }
    saveTitle()
  }, [projectTitle, projectId, titleLoaded])

  return { save }
}
