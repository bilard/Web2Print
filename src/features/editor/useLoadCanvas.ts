import { useEffect, useRef } from 'react'
import { Canvas, IText, Textbox, classRegistry, Rect, Ellipse, Group, Path, Line, FabricImage, Circle, Polygon, Triangle } from 'fabric'
import { patchPerCharSpacing } from '@/features/idml/idmlToFabric'
import { doc, getDoc } from 'firebase/firestore'
import { ref, getDownloadURL, listAll } from 'firebase/storage'
import { db, storage } from '@/lib/firebase/config'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { usePaletteStore } from '@/stores/palette.store'
import { useMergeStore } from '@/stores/merge.store'
import { syncToStore } from './useAddObject'
import { ensurePageBgRect } from './useCanvas'
import { setLoadingInProgress } from './useAutoSave'
import { registerDynamicFontVariant } from '@/features/assets/useFonts'

// Force-register Fabric classes so loadFromJSON can deserialize them.
// Using classRegistry.setClass prevents Vite tree-shaking from removing them.
classRegistry.setClass(Rect, 'Rect')
classRegistry.setClass(Ellipse, 'Ellipse')
classRegistry.setClass(IText, 'IText')
classRegistry.setClass(Textbox, 'Textbox')
classRegistry.setClass(Group, 'Group')
classRegistry.setClass(Path, 'Path')
classRegistry.setClass(Line, 'Line')
classRegistry.setClass(FabricImage, 'Image')
classRegistry.setClass(Circle, 'Circle')
classRegistry.setClass(Polygon, 'Polygon')
classRegistry.setClass(Triangle, 'Triangle')

/**
 * After loadFromJSON, ensure all objects have a valid data.id
 * and re-attach per-object event listeners.
 */
function fixAndReattach(canvas: Canvas) {
  let idx = 0
  for (const obj of canvas.getObjects()) {
    if (!obj.data) obj.data = {}
    if (obj.data.isPageBg || obj.data.isGrid) continue

    if (!obj.data.id) {
      obj.data.id = `restored_${idx}_${Date.now()}`
    }

    if (!obj.data.type) {
      const fabricType = obj.type ?? ''
      if (fabricType === 'i-text' || fabricType === 'textbox') {
        obj.data.type = 'text'
      } else if (fabricType === 'rect') {
        obj.data.type = 'rect'
      } else if (fabricType === 'ellipse') {
        obj.data.type = 'ellipse'
      } else if (fabricType === 'line') {
        obj.data.type = 'line'
      } else if (fabricType === 'path') {
        obj.data.type = 'path'
      } else if (fabricType === 'image') {
        obj.data.type = 'image'
      } else if (fabricType === 'group') {
        obj.data.type = 'text'
      } else {
        obj.data.type = 'rect'
      }
    }

    if (!obj.data.name) {
      obj.data.name = (obj as any).text?.slice(0, 30) || obj.data.type || `Objet ${idx + 1}`
    }

    if (obj.type === 'group') {
      const grp = obj as any
      grp.subTargetCheck = true
      grp.interactive = true
      if (grp._objects) {
        for (const sub of grp._objects) {
          if (!sub.data) sub.data = {}
        }
      }
    }

    obj.on('modified', () => syncToStore(canvas))
    obj.on('moving', () => syncToStore(canvas))
    obj.on('scaling', () => syncToStore(canvas))
    obj.on('rotating', () => syncToStore(canvas))

    idx++
  }
}

/**
 * Load project fonts from Firebase Storage and register them via FontFace API.
 */
async function loadProjectFonts(projectId: string, canvas?: Canvas): Promise<void> {
  try {
    const fontsRef = ref(storage, `projects/${projectId}/fonts`)
    const result = await listAll(fontsRef)
    if (result.items.length === 0) return

    console.log(`[Fonts] Loading ${result.items.length} project fonts...`)

    const familyBuffers = new Map<string, { buffer: ArrayBuffer; weight: string; style: string }[]>()

    await Promise.allSettled(result.items.map(async (itemRef) => {
      try {
        const url = await getDownloadURL(itemRef)
        const name = itemRef.name
        const parts = name.replace(/\.[^.]+$/, '').split('__')
        const family = parts[0] || 'Arial'
        const weight = parts[1] || '400'
        const style = parts[2] || 'normal'
        const styleName = parts[3] || undefined  // StyleName from AdobeFnt25.lst

        const response = await fetch(url)
        const buffer = await response.arrayBuffer()
        const fontFace = new FontFace(family, buffer, { weight, style })
        await fontFace.load()
        document.fonts.add(fontFace)
        registerDynamicFontVariant(family, weight, style, name, styleName)
        console.log(`[Font] Restored "${family}" weight=${weight} style=${style} label="${styleName ?? 'auto'}"`)


        if (!familyBuffers.has(family)) familyBuffers.set(family, [])
        familyBuffers.get(family)!.push({ buffer, weight, style })
      } catch (err) {
        console.warn(`[Font] Failed to load ${itemRef.name}:`, err)
      }
    }))

    // For families missing weight 400, register lightest as fallback
    for (const [family, variants] of familyBuffers) {
      const normalVariants = variants.filter(v => v.style === 'normal')
      const hasRegular = normalVariants.some(v => v.weight === '400' || v.weight === 'normal')
      if (!hasRegular && normalVariants.length > 0) {
        const lightest = normalVariants.reduce((a, b) =>
          parseInt(a.weight) < parseInt(b.weight) ? a : b
        )
        try {
          const fallback = new FontFace(family, lightest.buffer, { weight: '400', style: 'normal' })
          await fallback.load()
          document.fonts.add(fallback)
          console.log(`[Font] Fallback: "${family}" weight=400 (from ${lightest.weight})`)
        } catch { /* ignore */ }
      }
    }

    // Invalidate text caches after font load
    if (canvas) {
      for (const obj of canvas.getObjects()) {
        if (obj instanceof IText) {
          ;(obj as any).dirty = true
          ;(obj as any).initDimensions()
        }
      }
      canvas.requestRenderAll()
    }
  } catch (err) {
    if ((err as any)?.code !== 'storage/object-not-found') {
      console.warn('[Fonts] Error loading project fonts:', err)
    }
  }
}

/**
 * Load project images from Firebase Storage.
 * Returns a map of filename → download URL.
 */
async function loadProjectImages(projectId: string): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>()
  try {
    const linksRef = ref(storage, `projects/${projectId}/links`)
    const result = await listAll(linksRef)
    if (result.items.length === 0) return urlMap

    console.log(`[Images] Loading ${result.items.length} project images from links/...`)
    await Promise.allSettled(result.items.map(async (itemRef) => {
      try {
        const url = await getDownloadURL(itemRef)
        urlMap.set(itemRef.name, url)
        urlMap.set(itemRef.name.toLowerCase(), url)
      } catch (err) {
        console.warn(`[Image] Failed to load ${itemRef.name}:`, err)
      }
    }))
    console.log(`[Images] ${urlMap.size / 2} project images loaded from Storage`)
  } catch (err) {
    if ((err as any)?.code !== 'storage/object-not-found') {
      console.warn('[Images] Error loading project images:', err)
    }
  }
  return urlMap
}

export function useLoadCanvas(fabricRef: React.RefObject<Canvas | null>) {
  const { projectId, setProjectTitle, setSaveStatus } = useEditorStore()
  const setSavedDataSource = useMergeStore((s) => s.setSavedDataSource)
  const loadedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!projectId) return
    // Prevent loading the same project multiple times
    if (loadedRef.current === projectId) return

    // Wait for canvas to be ready (ref changes don't trigger re-render)
    let cancelled = false
    let attempts = 0
    const waitForCanvas = () => {
      if (cancelled) return
      const canvas = fabricRef.current
      if (!canvas) {
        attempts++
        if (attempts < 200) setTimeout(waitForCanvas, 50)  // max ~10s
        else console.error('[Load] Canvas not ready after 10s')
        return
      }
      loadedRef.current = projectId
      load(canvas)
    }
    waitForCanvas()
    return () => { cancelled = true }

    async function load(canvas: Canvas) {
      const pid = projectId!
      // Block auto-save during load to prevent overwriting good data
      setLoadingInProgress(true)
      try {
        const snap = await getDoc(doc(db, 'projects', pid))
        if (!snap.exists()) return
        const data = snap.data()

        if (data.title) setProjectTitle(data.title)

        // Restore canvas/page dimensions if saved
        if (data.canvasWidth && data.canvasHeight) {
          const uiStore = useUIStore.getState()
          uiStore.setCanvasSize(
            data.canvasWidth,
            data.canvasHeight,
            data.canvasBg || '#ffffff',
          )
          if (data.canvasBgType) uiStore.setCanvasBgType(data.canvasBgType)
          if (data.canvasBgGradient) {
            try {
              const g = typeof data.canvasBgGradient === 'string'
                ? JSON.parse(data.canvasBgGradient)
                : data.canvasBgGradient
              uiStore.setCanvasBgGradient(g)
            } catch { /* ignore */ }
          }
          if (data.canvasBgImage !== undefined) uiStore.setCanvasBgImage(data.canvasBgImage)
        }

        // Restore project palette
        try {
          const palette = usePaletteStore.getState()
          const colors = data.paletteColors ? JSON.parse(data.paletteColors) : []
          const gradients = data.paletteGradients ? JSON.parse(data.paletteGradients) : []
          palette.setPalette(colors, gradients)
        } catch { /* ignore */ }

        // Load fonts and project images in parallel
        const [, projectImageUrls] = await Promise.all([
          loadProjectFonts(pid, canvas),
          loadProjectImages(pid),
        ])

        // Load canvas content
        if (data.canvasData) {
          const canvasJson = JSON.parse(data.canvasData)

          // Fix all image objects before loading
          if (canvasJson.objects) {
            for (const obj of canvasJson.objects) {
              // Ensure crossOrigin is set for all images (needed for Storage URLs)
              if (obj.type === 'image') {
                obj.crossOrigin = 'anonymous'
              }

              if (!obj.src || typeof obj.src !== 'string') continue
              // Already a permanent URL → skip
              if (obj.src.startsWith('http://') || obj.src.startsWith('https://')) continue

              const imgName = obj.data?.name
              const permUrl = imgName
                ? (projectImageUrls.get(imgName) || projectImageUrls.get(imgName.toLowerCase()))
                : undefined

              if (permUrl) {
                obj.src = permUrl
                console.log(`[Load] Image "${imgName}" → Storage URL`)
              } else if (obj.src.startsWith('blob:')) {
                // Blob URLs expire on page refresh → transparent pixel fallback
                console.warn(`[Load] Image "${imgName}" has expired blob URL, using placeholder`)
                obj.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
              }
            }
          }

          // Log object types being loaded
          const typeCounts: Record<string, number> = {}
          for (const obj of canvasJson.objects ?? []) {
            typeCounts[obj.type] = (typeCounts[obj.type] || 0) + 1
          }
          console.log(`[Load] Loading ${canvasJson.objects?.length ?? 0} objects from canvasData:`, typeCounts)

          try {
            await canvas.loadFromJSON(canvasJson)
          } catch (loadErr) {
            console.error('[Load] loadFromJSON failed, retrying without images:', loadErr)
            // Retry without images — at least load text/shapes
            if (canvasJson.objects) {
              const safeObjects = canvasJson.objects.filter((o: any) => o.type !== 'image')
              canvasJson.objects = safeObjects
              try {
                await canvas.loadFromJSON(canvasJson)
              } catch (retryErr) {
                console.error('[Load] Retry also failed:', retryErr)
              }
            }
          }

          // Verify and repair loaded objects
          const loadedObjs = canvas.getObjects()
          const loadedTypes: Record<string, number> = {}
          for (const obj of loadedObjs) {
            const t = obj.type ?? 'unknown'
            loadedTypes[t] = (loadedTypes[t] || 0) + 1
          }
          console.log(`[Load] After loadFromJSON: ${loadedObjs.length} objects on canvas:`, loadedTypes)

          // Check images: if any FabricImage has no element or zero dimensions, retry loading
          for (const obj of loadedObjs) {
            if (obj instanceof FabricImage) {
              const el = (obj as any)._element || (obj as any).getElement?.()
              const hasContent = el && (el.naturalWidth > 0 || el.width > 0)
              const imgName = obj.data?.name || 'unknown'
              if (!hasContent) {
                console.warn(`[Load] Image "${imgName}" has no content, attempting re-load...`)
                // Try to reload from Storage URL
                const permUrl = projectImageUrls.get(imgName) || projectImageUrls.get(imgName?.toLowerCase?.() || '')
                const srcUrl = permUrl || (obj as any).src || (obj as any)._originalElement?.src
                if (srcUrl && typeof srcUrl === 'string' && srcUrl.startsWith('http')) {
                  try {
                    const reloaded = await FabricImage.fromURL(srcUrl, { crossOrigin: 'anonymous' })
                    const docW = obj.width ?? reloaded.width ?? 100
                    const docH = obj.height ?? reloaded.height ?? 100
                    reloaded.set({
                      left: obj.left, top: obj.top,
                      scaleX: obj.scaleX, scaleY: obj.scaleY,
                      angle: obj.angle, opacity: obj.opacity,
                      selectable: obj.selectable, evented: obj.evented,
                      visible: obj.visible,
                      data: obj.data,
                      cropX: (obj as any).cropX, cropY: (obj as any).cropY,
                    })
                    canvas.remove(obj)
                    canvas.add(reloaded)
                    if (obj.data?.isBackground) canvas.sendObjectToBack(reloaded)
                    console.log(`[Load] Image "${imgName}" re-loaded successfully (${docW}x${docH})`)
                  } catch (reloadErr) {
                    console.error(`[Load] Image "${imgName}" re-load failed:`, reloadErr)
                  }
                }
              } else {
                console.log(`[Load] Image "${imgName}" loaded OK (${el?.naturalWidth || el?.width}x${el?.naturalHeight || el?.height})`)
              }
            }
          }

          fixAndReattach(canvas)

          // Re-apply per-character charSpacing (tracking IDML) from separate Firestore field
          try {
            if (data.charSpacingMaps) {
              const maps = JSON.parse(data.charSpacingMaps)
              for (const obj of canvas.getObjects()) {
                try {
                  const text = (obj as any).text
                  if (text && maps[text]) {
                    ;(obj as any).charSpacingMap = maps[text]
                    patchPerCharSpacing(obj)
                  }
                } catch (e) {
                  console.warn('[Load] charSpacing patch error:', e)
                }
              }
            }
          } catch (e) {
            console.warn('[Load] charSpacingMaps restore error:', e)
          }

          // Re-measure text with loaded fonts
          for (const obj of canvas.getObjects()) {
            if (obj instanceof IText || obj instanceof Textbox) {
              ;(obj as any).dirty = true
              ;(obj as any).initDimensions()
            }
          }

          syncToStore(canvas)

          if (data.dataSource) {
            try {
              setSavedDataSource(JSON.parse(data.dataSource))
            } catch { /* ignore */ }
          }
        }

        ensurePageBgRect(canvas)

        // Final font re-measure after all fonts ready
        document.fonts.ready.then(() => {
          for (const obj of canvas.getObjects()) {
            if (obj instanceof IText || obj instanceof Textbox) {
              ;(obj as any)._clearCache?.()
              ;(obj as any).dirty = true
              ;(obj as any).initDimensions()
            }
          }
          canvas.requestRenderAll()
          syncToStore(canvas)
          // Second pass for late-loading fonts
          setTimeout(() => {
            document.fonts.ready.then(() => {
              for (const obj of canvas.getObjects()) {
                if (obj instanceof IText || obj instanceof Textbox) {
                  ;(obj as any)._clearCache?.()
                  ;(obj as any).dirty = true
                  ;(obj as any).initDimensions()
                }
              }
              canvas.requestRenderAll()
              syncToStore(canvas)
            })
          }, 500)
        })

        setSaveStatus('saved')
      } catch (err) {
        console.error('Load canvas error', err)
      } finally {
        // Re-enable auto-save after load completes
        setLoadingInProgress(false)
      }
    }
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps
}
