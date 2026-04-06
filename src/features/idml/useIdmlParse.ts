import { useState, useCallback, useRef } from 'react'
import { parseIdml } from './idmlParser'
import { idmlToFabricObjects } from './idmlToFabric'
import { uploadFontsToStorage, uploadImagesToStorage } from './assemblyLoader'
import { globalFabricCanvas, globalFitCanvas } from '@/features/editor/CanvasContainer'
import { syncToStore } from '@/features/editor/useAddObject'
import { globalSave } from '@/features/editor/useAutoSave'
import { useEditorStore } from '@/stores/editor.store'
import { setGlobalIdmlSource, uploadIdmlToStorage } from './idmlSource'
import type { IdmlUploadState } from './useIdmlUpload'
import type { IdmlDocument } from './idmlParser'
import type { FabricObject } from 'fabric'

/** Poll for globalFabricCanvas to become non-null */
function waitForCanvas(timeoutMs: number): Promise<typeof globalFabricCanvas> {
  return new Promise((resolve) => {
    if (globalFabricCanvas) return resolve(globalFabricCanvas)
    const start = Date.now()
    const interval = setInterval(() => {
      if (globalFabricCanvas) {
        clearInterval(interval)
        resolve(globalFabricCanvas)
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval)
        resolve(null)
      }
    }, 100)
  })
}

export type ParseStep = 'idle' | 'parsing' | 'converting' | 'rendering' | 'done' | 'error'

export interface IdmlParseState {
  step: ParseStep
  idmlDoc: IdmlDocument | null
  fabricObjects: FabricObject[]
  objectCount: number
  error: string | null
}

export function useIdmlParse() {
  const setIdmlSourceFileName = useEditorStore((s) => s.setIdmlSourceFileName)
  const [state, setState] = useState<IdmlParseState>({
    step: 'idle', idmlDoc: null, fabricObjects: [], objectCount: 0, error: null,
  })
  const runningRef = useRef(false)

  const parseAndRender = useCallback(async (upload: IdmlUploadState) => {
    const { idmlContents } = upload
    if (!idmlContents) {
      setState((s) => ({ ...s, step: 'error', error: 'Pas de contenu IDML' }))
      return
    }
    if (runningRef.current) return
    runningRef.current = true

    setState((s) => ({ ...s, step: 'parsing', error: null }))

    try {
      await new Promise((r) => setTimeout(r, 50))

      // 0. Stocker le buffer IDML original pour l'export (mémoire + Storage)
      if (upload.assembly.idmlFile) {
        try {
          const buffer = await upload.assembly.idmlFile.arrayBuffer()
          const fileName = upload.assembly.idmlFile.name
          const pid = useEditorStore.getState().projectId
          setGlobalIdmlSource(buffer, fileName, pid)
          setIdmlSourceFileName(fileName)

          // Upload vers Firebase Storage en background (persistance entre sessions)
          if (pid) {
            uploadIdmlToStorage(pid, buffer, fileName).catch((err) =>
              console.warn('[IDML Source] Upload Storage échoué:', err),
            )
          }
        } catch (err) {
          console.warn('[IDML Source] Impossible de stocker le buffer:', err)
        }
      }

      // 1. Parse IDML XML → IdmlDocument
      const idmlDoc = parseIdml(
        idmlContents.spreads,
        idmlContents.stories,
        idmlContents.resources,
        idmlContents.designMap,
        idmlContents.masterSpreads,
      )

      console.log(`[IDML Parse] ${idmlDoc.objects.length} objects, page ${idmlDoc.pageWidth}x${idmlDoc.pageHeight}`)
      setState((s) => ({ ...s, step: 'converting', idmlDoc }))
      await new Promise((r) => setTimeout(r, 20))

      // 2. Upload images to Storage FIRST and get permanent URLs
      //    This way FabricImage objects are created with permanent URLs from the start
      let imageMap = upload.imageMap
      const pid = useEditorStore.getState().projectId
      if (pid && upload.assembly.imageFiles.length > 0) {
        try {
          console.log('[IDML Parse] Uploading images to Storage before creating Fabric objects...')
          const storageUrls = await uploadImagesToStorage(pid, upload.assembly.imageFiles)
          if (storageUrls.size > 0) {
            // Merge: for each blob URL entry, if we have a Storage URL for the same filename, use it
            const mergedMap = new Map<string, string>()
            // First add all Storage URLs
            for (const [key, url] of storageUrls) {
              mergedMap.set(key, url)
            }
            // For any blob URL key not in Storage URLs, keep the blob URL as fallback
            for (const [key, url] of imageMap) {
              if (!mergedMap.has(key)) {
                mergedMap.set(key, url)
              }
            }
            imageMap = mergedMap
            console.log(`[IDML Parse] Using ${storageUrls.size / 2} permanent Storage URLs for images`)
          }
        } catch (err) {
          console.warn('[IDML Parse] Image upload failed, using blob URLs:', err)
        }
      }

      // 3. Ensure fonts are ready
      await document.fonts.ready

      // 4. Convert to Fabric objects (using permanent Storage URLs when available)
      const fabricObjects = await idmlToFabricObjects(idmlDoc.objects, imageMap)
      console.log(`[IDML Parse] ${fabricObjects.length} Fabric objects created`)

      setState((s) => ({ ...s, step: 'rendering', fabricObjects, objectCount: fabricObjects.length }))
      await new Promise((r) => setTimeout(r, 20))

      // 5. Add to canvas — wait for it to be ready (race condition with mount)
      let canvas = globalFabricCanvas
      if (!canvas) {
        console.log('[IDML Parse] Waiting for globalFabricCanvas...')
        canvas = await waitForCanvas(5000)
      }
      if (!canvas) {
        console.warn('[IDML Parse] globalFabricCanvas still null after waiting')
        setState((s) => ({ ...s, step: 'error', error: 'Canvas non disponible' }))
        return
      }

      const toRemove = canvas.getObjects().filter((o) => !o.data?.isGrid && !o.data?.isPageBg)
      for (const o of toRemove) canvas.remove(o)

      const { useUIStore } = await import('@/stores/ui.store')
      useUIStore.getState().setCanvasSize(
        Math.round(idmlDoc.pageWidth),
        Math.round(idmlDoc.pageHeight),
        '#ffffff',
      )

      for (const obj of fabricObjects) {
        canvas.add(obj)
        obj.on('modified', () => syncToStore(canvas))
      }

      canvas.requestRenderAll()
      syncToStore(canvas)

      // Force Fabric.js to re-measure all text objects after fonts are fully loaded
      await document.fonts.ready
      for (const obj of canvas.getObjects()) {
        if ('initDimensions' in obj && typeof (obj as any).initDimensions === 'function') {
          ;(obj as any).initDimensions()
          ;(obj as any).dirty = true
          ;(obj as any)._clearCache?.()
        }
      }
      canvas.requestRenderAll()

      // Second pass after a short delay to catch late font loads
      setTimeout(async () => {
        await document.fonts.ready
        for (const obj of canvas.getObjects()) {
          if ('initDimensions' in obj && typeof (obj as any).initDimensions === 'function') {
            ;(obj as any).initDimensions()
            ;(obj as any).dirty = true
            ;(obj as any)._clearCache?.()
          }
        }
        canvas.requestRenderAll()
      }, 300)

      // Fit canvas to spread dimensions — multiple attempts for reliability
      requestAnimationFrame(() => {
        if (globalFitCanvas) globalFitCanvas()
        setTimeout(() => globalFitCanvas?.(), 200)
      })

      setState((s) => ({ ...s, step: 'done' }))
      runningRef.current = false

      // 6. Force save canvas data to Firestore (images already in Storage)
      setTimeout(() => {
        globalSave?.().then(() => {
          console.log('[IDML Parse] Canvas saved to Firestore after import')
        }).catch((err) => {
          console.warn('[IDML Parse] Post-import save failed:', err)
        })
      }, 500)

      // 7. Upload fonts to Storage in background, then refresh assets panel
      if (pid && upload.assembly.fontFiles.length > 0) {
        uploadFontsToStorage(pid, upload.assembly.fontFiles, upload.assembly.fontListFile)
          .then(() => useEditorStore.getState().bumpAssetsVersion())
          .catch((err) => console.warn('[Fonts] Upload failed:', err))
      }

      // 8. Signal assets panel to reload (images were uploaded in step 2)
      if (pid && upload.assembly.imageFiles.length > 0) {
        useEditorStore.getState().bumpAssetsVersion()
      }

    } catch (err) {
      console.error('IDML parse error', err)
      runningRef.current = false
      setState((s) => ({ ...s, step: 'error', error: String(err) }))
    }
  }, [setIdmlSourceFileName])

  const reset = useCallback(() => {
    runningRef.current = false
    setState({ step: 'idle', idmlDoc: null, fabricObjects: [], objectCount: 0, error: null })
  }, [])

  return { state, parseAndRender, reset }
}
