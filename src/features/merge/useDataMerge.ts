import { useCallback, useEffect, useRef } from 'react'
import { IText, Textbox, FabricImage } from 'fabric'
import { doc, getDoc } from 'firebase/firestore'
import { ref, getDownloadURL, listAll } from 'firebase/storage'
import { db, storage } from '@/lib/firebase/config'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { syncToStore } from '@/features/editor/useAddObject'
import { useMergeStore, type DataSourceRef, type MergeColumn, type MergeRow } from '@/stores/merge.store'
import { useEditorStore } from '@/stores/editor.store'
import { resolveText, resolveBinding, hasPlaceholders, isImageUrl, remapStyles } from './mergeEngine'
import { collectObjectsDeep, refreshAncestorGroups } from '@/features/editor/deepObjects'
import { isPimSource, pimProjectIdFromSource, loadPimMergeData } from './pimSource'
import { evaluateFormula as evaluateExcelFormula } from '@/features/excel/formulaEngine'
import { ENRICHMENT_ALIASES } from '@/features/excel/ai-enrichment/useSaveEnrichedProduct'
import type { ExcelSheet, CellValue } from '@/features/excel/types'

/** Cache des URLs d'assets du projet */
const assetUrlCache = new Map<string, string>()

/** Cache des images téléchargées (URL → dataURL) */
const imageCache = new Map<string, string>()

/**
 * « Supprimer la ligne si vide » pour les champs SÉPARÉS d'un bloc (imports
 * PDF) : resolveText vide bien le texte, mais le Textbox occupait toujours sa
 * place — le trou ne se refermait pas. Cette passe masque les champs vidés
 * par l'option et REMONTE les frères du bloc situés en dessous, comme une
 * vraie suppression de ligne ; tout est réversible à chaque changement de
 * ligne (positions d'origine mémorisées dans data.mergeBaseTop).
 */
function compactHiddenMergeFields(canvas: NonNullable<typeof globalFabricCanvas>): void {
  const { hideLineIfEmpty } = useMergeStore.getState()
  const groups = new Set<import('fabric').Group>()
  for (const obj of collectObjectsDeep(canvas.getObjects())) {
    const g = (obj as FabricObjectWithData).group
    if (obj.data?.templateText && g) groups.add(g)
  }
  for (const g of groups) {
    const children = g.getObjects() as FabricObjectWithData[]
    // 1. Restaure l'état d'origine (positions + visibilité) du bloc.
    for (const c of children) {
      if (!c.data) c.data = {}
      if (c.data.mergeBaseTop === undefined) {
        c.data.mergeBaseTop = c.top ?? 0
        c.data.mergeBaseHeight = (c.height ?? 0) * (c.scaleY ?? 1)
      } else {
        c.set({ top: c.data.mergeBaseTop as number })
      }
      if (c.data.mergeHidden) {
        c.set({ visible: true })
        delete c.data.mergeHidden
      }
    }
    // 2. Masque les champs vidés par « Supprimer la ligne si vide ».
    const hidden: FabricObjectWithData[] = []
    for (const c of children) {
      const tmpl = c.data?.templateText as string | undefined
      if (!tmpl) continue
      const keys = Array.from(tmpl.matchAll(/\{\{([^}]+)\}\}/g), (m) => m[1])
      const text = (c as unknown as IText).text ?? ''
      if (text.trim() === '' && keys.some((k) => hideLineIfEmpty?.[k])) {
        c.set({ visible: false })
        c.data!.mergeHidden = true
        hidden.push(c)
      }
    }
    // 3. Compacte : remonte les frères situés SOUS chaque champ masqué.
    for (const h of hidden) {
      const hTop = (h.data?.mergeBaseTop as number) ?? h.top ?? 0
      const hHeight = (h.data?.mergeBaseHeight as number) ?? 0
      for (const c of children) {
        if (c === h || c.data?.mergeHidden) continue
        if ((c.top ?? 0) > hTop) c.set({ top: (c.top ?? 0) - hHeight })
      }
    }
    for (const c of children) c.setCoords()
    g.triggerLayout()
    g.set('dirty', true)
  }
}

type FabricObjectWithData = import('fabric').FabricObject & {
  data?: Record<string, unknown>
  group?: import('fabric').Group
}

export function useDataMerge() {
  const projectId = useEditorStore((s) => s.projectId)
  const {
    dataSource, isConnected, rows, columns, currentRowIndex,
    connect, disconnect: storeDisconnect, nextRow, prevRow, setCurrentRow,
  } = useMergeStore()

  const prevRowIndexRef = useRef<number>(-1)
  const applyRowRef = useRef<((row: MergeRow, cols?: MergeColumn[]) => Promise<void>) | null>(null)

  const connectSource = useCallback(async (source: DataSourceRef) => {
    let cols: MergeColumn[]
    let mergeRows: MergeRow[]

    if (isPimSource(source)) {
      // Source PIM (« re-skin de promo ») : les produits master du projet sont les lignes.
      const data = await loadPimMergeData(pimProjectIdFromSource(source))
      cols = data.columns
      mergeRows = data.rows
    } else {
      // Lit d'abord les méta dans `excel_data` (toujours autorisé) ; si `sheets`
      // est encore inline (legacy non migré), on l'utilise direct, sinon on va
      // chercher le blob dans `excel_data_payload`. NB : on n'attaque PAS le
      // payload en premier — la rule deny les reads sur doc inexistant.
      const metaSnap = await getDoc(doc(db, 'excel_data', source.excelDocId))
      if (!metaSnap.exists()) throw new Error('Dataset introuvable')
      const meta = metaSnap.data()
      let sheets: ExcelSheet[]
      if (typeof meta.sheets === 'string') {
        sheets = JSON.parse(meta.sheets)
      } else {
        const payloadSnap = await getDoc(doc(db, 'excel_data_payload', source.excelDocId))
        if (!payloadSnap.exists()) throw new Error('Dataset vide ou corrompu')
        sheets = JSON.parse(payloadSnap.data().json)
      }
      const sheet = sheets[source.sheetIndex] ?? sheets[0]

      cols = sheet.columns.map((c) => ({
        key: c.key,
        label: c.label,
        fieldType: c.fieldType,
        aliases: ENRICHMENT_ALIASES[c.key],
      }))

      // Pre-compute formula columns so {{formula_key}} resolves correctly in templates
      const formulaCols = sheet.columns.filter((c) => c.fieldType === 'formula' && c.formula)
      mergeRows = sheet.rows.map((r) => {
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
    }

    // Capturer les templateText AVANT connect() (sinon le re-render
    // déclenché par connect() exécute le memo avant la capture)
    const canvas = globalFabricCanvas
    if (canvas) {
      for (const obj of collectObjectsDeep(canvas.getObjects())) {
        if (obj instanceof IText && obj.text && hasPlaceholders(obj.text)) {
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
      for (const obj of collectObjectsDeep(canvas.getObjects())) {
        if (!(obj instanceof Textbox)) continue
        if (!obj.data) continue
        const tmpl = obj.data.templateText as string | undefined
        if (!tmpl) continue
        if (obj.data.mergeFrame) continue // cadre fixe (champ PDF) : pas d'auto-fit
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
          refreshAncestorGroups(obj)
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
      for (const obj of collectObjectsDeep(canvas.getObjects())) {
        if (obj instanceof IText && obj.data?.templateText) {
          // Restaure l'état du bloc (champ masqué/compacté par « Supprimer la ligne si vide »)
          if (obj.data.mergeHidden) { obj.set({ visible: true }); delete obj.data.mergeHidden }
          if (obj.data.mergeBaseTop !== undefined) obj.set({ top: obj.data.mergeBaseTop as number })
          obj.set('text', obj.data.templateText as string)
          // Restaurer les styles originaux du template
          if (obj.data.templateStyles) {
            ;(obj as any).styles = JSON.parse(JSON.stringify(obj.data.templateStyles))
            ;(obj as any).dirty = true
          }
          obj.setCoords()
          refreshAncestorGroups(obj)
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

    // ANCRAGE des blocs de champs : substitutions + triggerLayout recentrent
    // le groupe à chaque passe → dérive cumulative (le bloc « montait » à
    // chaque changement de ligne). On mémorise la bbox absolue de chaque bloc
    // AVANT la passe et on la ré-ancre après — les déplacements manuels de
    // l'utilisateur restent respectés (le snapshot part de la position courante).
    const groupAnchors = new Map<import('fabric').Group, { left: number; top: number }>()
    for (const obj of collectObjectsDeep(canvas.getObjects())) {
      const g = (obj as FabricObjectWithData).group
      if (obj.data?.templateText && g && !groupAnchors.has(g)) {
        const bb = g.getBoundingRect()
        groupAnchors.set(g, { left: bb.left, top: bb.top })
      }
    }

    for (const obj of collectObjectsDeep(canvas.getObjects())) {
      if (obj.data?.isGrid || obj.data?.isPageBg) continue

      // Résolution texte {{variable}} — IText couvre aussi les Textbox ;
      // les textes des imports PDF sont des IText.
      if (obj instanceof IText) {
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
          const { formulas, hideLineIfEmpty, formulaConfigs, columns } = useMergeStore.getState()
          const tmpl = obj.data.templateText as string
          const tStyles = obj.data.templateStyles as Record<number, Record<number, Record<string, unknown>>> | undefined
          // Cadre de composition fixe (champ PDF aligné/wrappé) : pas d'auto-fit.
          const isSinglePlaceholder = !obj.data?.mergeFrame && /^\{\{[^}]+\}\}$/.test(tmpl.trim())
          const resolved = resolveText(tmpl, row, formulas, hideLineIfEmpty, formulaConfigs, columns)
          obj.set('text', resolved)

          // Repositionner les styles des caractères littéraux (%, DT, etc.)
          if (tStyles && Object.keys(tStyles).length > 0) {
            const remapped = remapStyles(tmpl, tStyles, row, formulas, hideLineIfEmpty, formulaConfigs, columns)
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
              const remapped = remapStyles(tmpl, tStyles, row, formulas, hideLineIfEmpty, formulaConfigs, columns)
              ;(obj as any).styles = remapped
            }
          }

          obj.setCoords()
          ;(obj as any).dirty = true
          refreshAncestorGroups(obj)
        }
      }

      // Résolution bindings propriétés
      const bindings = obj.data?.bindings as Record<string, string> | undefined
      if (!bindings) continue

      const { columns: storeColumns } = useMergeStore.getState()
      for (const [prop, columnKey] of Object.entries(bindings)) {
        const value = resolveBinding(columnKey, row, storeColumns)
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
      refreshAncestorGroups(obj)
    }

    // Champs vidés par « Supprimer la ligne si vide » : masque + compacte le bloc.
    compactHiddenMergeFields(canvas)

    // Ré-ancre chaque bloc sur sa bbox d'avant la passe (zéro dérive).
    for (const [g, before] of groupAnchors) {
      g.setCoords()
      const after = g.getBoundingRect()
      const dx = before.left - after.left
      const dy = before.top - after.top
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        g.set({ left: (g.left ?? 0) + dx, top: (g.top ?? 0) + dy })
        g.setCoords()
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
      if (!(target instanceof IText)) return
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
      if (!(target instanceof IText)) return
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
        const { formulas, hideLineIfEmpty, formulaConfigs, columns } = useMergeStore.getState()
        const row = rows[currentRowIndex]
        if (row) {
          const resolved = resolveText(currentText, row, formulas, hideLineIfEmpty, formulaConfigs, columns)
          target.set('text', resolved)
          const tStyles = target.data.templateStyles as Record<number, Record<number, Record<string, unknown>>> | undefined
          if (tStyles && Object.keys(tStyles).length > 0) {
            ;(target as any).styles = remapStyles(currentText, tStyles, row, formulas, hideLineIfEmpty, formulaConfigs, columns)
          }
        }
      } else if (target.data?.templateText) {
        // Le texte n'a pas de {{}} mais un template existe →
        // l'utilisateur a peut-être juste changé une propriété (couleur, etc.)
        // On re-résout depuis le template existant sans le supprimer
        const { formulas, hideLineIfEmpty, formulaConfigs, columns } = useMergeStore.getState()
        const row = rows[currentRowIndex]
        const tmpl = target.data.templateText as string
        const tStyles = target.data.templateStyles as Record<number, Record<number, Record<string, unknown>>> | undefined
        if (row) {
          const resolved = resolveText(tmpl, row, formulas, hideLineIfEmpty, formulaConfigs, columns)
          target.set('text', resolved)
          if (tStyles && Object.keys(tStyles).length > 0) {
            ;(target as any).styles = remapStyles(tmpl, tStyles, row, formulas, hideLineIfEmpty, formulaConfigs, columns)
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
