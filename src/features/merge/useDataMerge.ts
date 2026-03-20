import { useCallback, useEffect, useRef } from 'react'
import { Textbox, FabricImage } from 'fabric'
import { doc, getDoc } from 'firebase/firestore'
import { ref, getDownloadURL, listAll } from 'firebase/storage'
import { db, storage } from '@/lib/firebase/config'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useMergeStore, type DataSourceRef, type MergeColumn, type MergeRow } from '@/stores/merge.store'
import { useEditorStore } from '@/stores/editor.store'
import { resolveText, resolveBinding, hasPlaceholders, isImageUrl } from './mergeEngine'
import type { ExcelSheet } from '@/features/excel/types'

/** Cache des URLs d'assets du projet */
const assetUrlCache = new Map<string, string>()

/** Cache des images téléchargées (URL → dataURL) */
const imageCache = new Map<string, string>()

export function useDataMerge() {
  const projectId = useEditorStore((s) => s.projectId)
  const {
    dataSource, isConnected, rows, columns, currentRowIndex,
    connect, disconnect: storeDisconnect, nextRow, prevRow, setCurrentRow,
  } = useMergeStore()

  const prevRowIndexRef = useRef<number>(-1)

  const connectSource = useCallback(async (source: DataSourceRef) => {
    const docRef = doc(db, 'excel_data', source.excelDocId)
    const snap = await getDoc(docRef)
    if (!snap.exists()) throw new Error('Dataset introuvable')

    const data = snap.data()
    const sheets: ExcelSheet[] = JSON.parse(data.sheets)
    const sheet = sheets[source.sheetIndex] ?? sheets[0]

    const cols: MergeColumn[] = sheet.columns.map((c) => ({
      key: c.key,
      label: c.label,
      fieldType: c.fieldType,
    }))

    const mergeRows: MergeRow[] = sheet.rows.map((r) => ({ ...r }))

    connect(source, cols, mergeRows)

    // Capturer les templateText pour tous les textbox avec {{}}
    const canvas = globalFabricCanvas
    if (!canvas) return

    for (const obj of canvas.getObjects()) {
      if (obj instanceof Textbox && obj.text && hasPlaceholders(obj.text)) {
        if (!obj.data) obj.data = {}
        obj.data.templateText = obj.text
      }
    }

    // Appliquer la première ligne
    applyRow(mergeRows[0], cols)
  }, [connect])

  const disconnectSource = useCallback(() => {
    const canvas = globalFabricCanvas
    if (canvas) {
      for (const obj of canvas.getObjects()) {
        if (obj instanceof Textbox && obj.data?.templateText) {
          obj.set('text', obj.data.templateText as string)
          obj.setCoords()
        }
      }
      canvas.requestRenderAll()
    }
    storeDisconnect()
    prevRowIndexRef.current = -1
  }, [storeDisconnect])

  const getAssetUrl = useCallback(async (fileName: string): Promise<string | null> => {
    if (!projectId) return null
    if (assetUrlCache.has(fileName)) return assetUrlCache.get(fileName)!

    try {
      const folderRef = ref(storage, `projects/${projectId}/links`)
      const list = await listAll(folderRef)
      for (const item of list.items) {
        if (item.name === fileName || item.name.startsWith(fileName.split('.')[0])) {
          const url = await getDownloadURL(item)
          assetUrlCache.set(fileName, url)
          return url
        }
      }
    } catch { /* ignore */ }
    return null
  }, [projectId])

  const loadImage = useCallback(async (urlOrName: string): Promise<string | null> => {
    if (imageCache.has(urlOrName)) return imageCache.get(urlOrName)!

    let url = urlOrName
    if (!isImageUrl(urlOrName)) {
      const assetUrl = await getAssetUrl(urlOrName)
      if (!assetUrl) return null
      url = assetUrl
    }

    try {
      const res = await fetch(url)
      const blob = await res.blob()
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result as string
          imageCache.set(urlOrName, dataUrl)
          resolve(dataUrl)
        }
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    } catch {
      return null
    }
  }, [getAssetUrl])

  const applyRow = useCallback(async (row: MergeRow, cols?: MergeColumn[]) => {
    const canvas = globalFabricCanvas
    if (!canvas) return

    for (const obj of canvas.getObjects()) {
      if (obj.data?.isGrid || obj.data?.isPageBg) continue

      // Résolution texte {{variable}}
      if (obj instanceof Textbox && obj.data?.templateText) {
        const resolved = resolveText(obj.data.templateText as string, row)
        obj.set('text', resolved)
        obj.setCoords()
      }

      // Résolution bindings propriétés
      const bindings = obj.data?.bindings as Record<string, string> | undefined
      if (!bindings) continue

      for (const [prop, columnKey] of Object.entries(bindings)) {
        const value = resolveBinding(columnKey, row)
        if (value === null) continue

        if (prop === 'src' && obj instanceof FabricImage) {
          const imgData = await loadImage(value)
          if (imgData) {
            const imgEl = new Image()
            imgEl.src = imgData
            await new Promise<void>((resolve) => {
              imgEl.onload = () => {
                obj.setElement(imgEl)
                obj.setCoords()
                resolve()
              }
              imgEl.onerror = () => resolve()
            })
          }
        } else if (prop === 'fill' || prop === 'stroke') {
          obj.set(prop, value)
        } else if (prop === 'opacity') {
          const num = parseFloat(value)
          if (!isNaN(num)) obj.set('opacity', Math.min(1, Math.max(0, num)))
        }
      }
    }

    canvas.requestRenderAll()
  }, [loadImage])

  // Réagir aux changements de ligne
  useEffect(() => {
    if (!isConnected || rows.length === 0) return
    if (currentRowIndex === prevRowIndexRef.current) return
    prevRowIndexRef.current = currentRowIndex
    applyRow(rows[currentRowIndex])
  }, [isConnected, currentRowIndex, rows, applyRow])

  // Intercepter l'édition de texte en mode merge
  useEffect(() => {
    const canvas = globalFabricCanvas
    if (!canvas || !isConnected) return

    const handleEditingEntered = (e: { target?: unknown }) => {
      const target = e.target
      if (!(target instanceof Textbox)) return
      if (target.data?.templateText) {
        target.set('text', target.data.templateText)
        canvas.requestRenderAll()
      }
    }

    const handleEditingExited = (e: { target?: unknown }) => {
      const target = e.target
      if (!(target instanceof Textbox)) return
      const currentText = target.text ?? ''

      if (hasPlaceholders(currentText)) {
        if (!target.data) target.data = {}
        target.data.templateText = currentText
        const row = rows[currentRowIndex]
        if (row) {
          const resolved = resolveText(currentText, row)
          target.set('text', resolved)
        }
      } else {
        if (target.data?.templateText) {
          delete target.data.templateText
        }
      }
      canvas.requestRenderAll()
    }

    canvas.on('text:editing:entered', handleEditingEntered)
    canvas.on('text:editing:exited', handleEditingExited)

    return () => {
      canvas.off('text:editing:entered', handleEditingEntered)
      canvas.off('text:editing:exited', handleEditingExited)
    }
  }, [isConnected, rows, currentRowIndex])

  return {
    isConnected,
    dataSource,
    columns,
    rows,
    currentRowIndex,
    totalRows: rows.length,
    connectSource,
    disconnectSource,
    nextRow,
    prevRow,
    setCurrentRow,
    applyRow,
  }
}
