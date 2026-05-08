import { useCallback, useEffect, useRef } from 'react'
import { Textbox, FabricImage } from 'fabric'
import { doc, getDoc } from 'firebase/firestore'
import { ref, getDownloadURL, listAll } from 'firebase/storage'
import { db, storage } from '@/lib/firebase/config'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { syncToStore } from '@/features/editor/useAddObject'
import { useMergeStore, type DataSourceRef, type MergeColumn, type MergeRow } from '@/stores/merge.store'
import { useEditorStore } from '@/stores/editor.store'
import { resolveText, resolveBinding, hasPlaceholders, isImageUrl, remapStyles } from './mergeEngine'
import { evaluateFormula as evaluateExcelFormula } from '@/features/excel/formulaEngine'
import type { ExcelSheet, CellValue } from '@/features/excel/types'

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
  const applyRowRef = useRef<((row: MergeRow, cols?: MergeColumn[]) => Promise<void>) | null>(null)

  const connectSource = useCallback(async (source: DataSourceRef) => {
    // Lit le payload séparé en priorité, fallback sur l'ancien champ inline
    // pour les docs pas encore migrés (cf. useExcelFirebase.saveToFirebase).
    const payloadSnap = await getDoc(doc(db, 'excel_data_payload', source.excelDocId))
    let sheets: ExcelSheet[]
    if (payloadSnap.exists()) {
      sheets = JSON.parse(payloadSnap.data().json)
    } else {
      const legacySnap = await getDoc(doc(db, 'excel_data', source.excelDocId))
      if (!legacySnap.exists()) throw new Error('Dataset introuvable')
      const data = legacySnap.data()
      if (typeof data.sheets !== 'string') throw new Error('Dataset vide ou corrompu')
      sheets = JSON.parse(data.sheets)
    }
    const sheet = sheets[source.sheetIndex] ?? sheets[0]

    const cols: MergeColumn[] = sheet.columns.map((c) => ({
      key: c.key,
      label: c.label,
      fieldType: c.fieldType,
    }))

    // Pre-compute formula columns so {{formula_key}} resolves correctly in templates
    const formulaCols = sheet.columns.filter((c) => c.fieldType === 'formula' && c.formula)
    const mergeRows: MergeRow[] = sheet.rows.map((r) => {
      const row: MergeRow = { ...r }
      for (const col of formulaCols) {
        const value = evaluateExcelFormula(col.formula!, row as Record<string, CellValue>, sheet.columns)
        if (col.formulaResultType === 'number' && col.formulaDecimals != null) {
          const num = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'))
          row[col.key] = isNaN(num) ? String(value ?? '') : num.toFixed(col.formulaDecimals)
        } else {
          row[col.key] = value == null ? '' : String(value)
        }
      }
      return row
    })

    // Capturer les templateText AVANT connect() (sinon le re-render
    // déclenché par connect() exécute le memo avant la capture)
    const canvas = globalFabricCanvas
    if (canvas) {
      for (const obj of canvas.getObjects()) {
        if (obj instanceof Textbox && obj.text && hasPlaceholders(obj.text)) {
          if (!obj.data) obj.data = {}
          obj.data.templateText = obj.text
          // Ne pas écraser templateStyles s'il existe déjà (provient d'un bind ou d'un rechargement correct)
          if (!obj.data.templateStyles) {
            const styles = (obj as any).styles
            if (styles && Object.keys(styles).length > 0) {
              obj.data.templateStyles = JSON.parse(JSON.stringify(styles))
            }
          }
        }
      }
    }

    connect(source, cols, mergeRows)

    // Appliquer la première ligne puis auto-fit les blocs purement liés
    if (canvas) {
      await applyRowRef.current?.(mergeRows[0], cols)
      // Auto-fit uniquement les Textbox dont tout le contenu est un placeholder unique
      for (const obj of canvas.getObjects()) {
        if (!(obj instanceof Textbox)) continue
        if (!obj.data) continue
        const tmpl = obj.data.templateText as string | undefined
        if (!tmpl) continue
        const isSinglePlaceholder = /^\{\{[^}]+\}\}$/.test(tmpl.trim())
        if (isSinglePlaceholder && typeof (obj as any).calcTextWidth === 'function') {
          // Mémoriser la largeur originale (avant auto-fit) pour restauration à la sauvegarde
          if (obj.data.originalWidth === undefined) {
            obj.data.originalWidth = obj.width
          }
          const minW = (obj as any).calcTextWidth()
          const fitW = Math.max(minW, 10)
          obj.data.autoFitWidth = fitW  // Persister pour restauration au chargement
          obj.set({ width: fitW, scaleX: 1, scaleY: 1 })
          ;(obj as any).initDimensions?.()
          obj.setCoords()
        }
      }
      canvas.requestRenderAll()
      // Persister la nouvelle taille des blocs auto-fit dans le store
      syncToStore(canvas)
    }
  }, [connect])

  const disconnectSource = useCallback(() => {
    const canvas = globalFabricCanvas
    if (canvas) {
      for (const obj of canvas.getObjects()) {
        if (obj instanceof Textbox && obj.data?.templateText) {
          obj.set('text', obj.data.templateText as string)
          // Restaurer les styles originaux du template
          if (obj.data.templateStyles) {
            ;(obj as any).styles = JSON.parse(JSON.stringify(obj.data.templateStyles))
            ;(obj as any).dirty = true
          }
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

  const applyRow = useCallback(async (row: MergeRow, _cols?: MergeColumn[]) => {
    const canvas = globalFabricCanvas
    if (!canvas) return

    for (const obj of canvas.getObjects()) {
      if (obj.data?.isGrid || obj.data?.isPageBg) continue

      // Résolution texte {{variable}}
      if (obj instanceof Textbox) {
        // Auto-capture templateText si pas encore stocké mais texte contient {{}}
        if (!obj.data?.templateText && obj.text && hasPlaceholders(obj.text)) {
          if (!obj.data) obj.data = {}
          obj.data.templateText = obj.text
          const styles = (obj as any).styles
          if (styles && Object.keys(styles).length > 0) {
            obj.data.templateStyles = JSON.parse(JSON.stringify(styles))
          }
        }
        if (obj.data?.templateText) {
          const { formulas, hideLineIfEmpty, formulaConfigs } = useMergeStore.getState()
          const tmpl = obj.data.templateText as string
          const tStyles = obj.data.templateStyles as Record<number, Record<number, Record<string, unknown>>> | undefined
          const isSinglePlaceholder = /^\{\{[^}]+\}\}$/.test(tmpl.trim())
          const resolved = resolveText(tmpl, row, formulas, hideLineIfEmpty, formulaConfigs)
          obj.set('text', resolved)

          // Repositionner les styles des caractères littéraux (%, DT, etc.)
          if (tStyles && Object.keys(tStyles).length > 0) {
            const remapped = remapStyles(tmpl, tStyles, row, formulas, hideLineIfEmpty, formulaConfigs)
            ;(obj as any).styles = remapped
          }

          // Auto-fit pour blocs à placeholder unique (taille adaptée à chaque valeur)
          if (isSinglePlaceholder && typeof (obj as any).calcTextWidth === 'function') {
            ;(obj as any).initDimensions?.()
            const minW = (obj as any).calcTextWidth()
            const fitW = Math.max(minW, 10)
            obj.data.autoFitWidth = fitW
            obj.set({ width: fitW, scaleX: 1, scaleY: 1 })
            // Re-appliquer les styles après initDimensions (par précaution)
            if (tStyles && Object.keys(tStyles).length > 0) {
              const remapped = remapStyles(tmpl, tStyles, row, formulas, hideLineIfEmpty, formulaConfigs)
              ;(obj as any).styles = remapped
            }
          }

          obj.setCoords()
          ;(obj as any).dirty = true
        }
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

  // Synchroniser applyRowRef après chaque render pour éviter dépendance circulaire
  applyRowRef.current = applyRow

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
        // Restaurer les styles du template pour que handleEditingExited capture les bons indices
        const tStyles = target.data.templateStyles as Record<number, Record<number, Record<string, unknown>>> | undefined
        if (tStyles && Object.keys(tStyles).length > 0) {
          ;(target as any).styles = JSON.parse(JSON.stringify(tStyles))
        }
        canvas.requestRenderAll()
      }
    }

    const handleEditingExited = (e: { target?: unknown }) => {
      const target = e.target
      if (!(target instanceof Textbox)) return
      const currentText = target.text ?? ''

      if (hasPlaceholders(currentText)) {
        // Le texte a des {{}} → mettre à jour le template et capturer les styles actuels
        if (!target.data) target.data = {}
        target.data.templateText = currentText
        // Sauvegarder les styles tels que tapés (dans le template)
        const currentStyles = (target as any).styles as Record<number, Record<number, Record<string, unknown>>>
        if (currentStyles && Object.keys(currentStyles).length > 0) {
          target.data.templateStyles = JSON.parse(JSON.stringify(currentStyles))
        } else {
          delete target.data.templateStyles
        }
        const { formulas, hideLineIfEmpty, formulaConfigs } = useMergeStore.getState()
        const row = rows[currentRowIndex]
        if (row) {
          const resolved = resolveText(currentText, row, formulas, hideLineIfEmpty, formulaConfigs)
          target.set('text', resolved)
          const tStyles = target.data.templateStyles as Record<number, Record<number, Record<string, unknown>>> | undefined
          if (tStyles && Object.keys(tStyles).length > 0) {
            ;(target as any).styles = remapStyles(currentText, tStyles, row, formulas, hideLineIfEmpty, formulaConfigs)
          }
        }
      } else if (target.data?.templateText) {
        // Le texte n'a pas de {{}} mais un template existe →
        // l'utilisateur a peut-être juste changé une propriété (couleur, etc.)
        // On re-résout depuis le template existant sans le supprimer
        const { formulas, hideLineIfEmpty, formulaConfigs } = useMergeStore.getState()
        const row = rows[currentRowIndex]
        const tmpl = target.data.templateText as string
        const tStyles = target.data.templateStyles as Record<number, Record<number, Record<string, unknown>>> | undefined
        if (row) {
          const resolved = resolveText(tmpl, row, formulas, hideLineIfEmpty, formulaConfigs)
          target.set('text', resolved)
          if (tStyles && Object.keys(tStyles).length > 0) {
            ;(target as any).styles = remapStyles(tmpl, tStyles, row, formulas, hideLineIfEmpty, formulaConfigs)
          }
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
