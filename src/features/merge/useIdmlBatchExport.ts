/**
 * useIdmlBatchExport — Export IDML multi-pages.
 *
 * Itère les lignes de données, patche le XML IDML pour chacune,
 * et assemble un seul fichier .idml contenant un spread par ligne.
 */

import { useCallback, useRef, useState } from 'react'
import { useMergeStore } from '@/stores/merge.store'
import { useEditorStore } from '@/stores/editor.store'
import { getIdmlBuffer } from '@/features/idml/idmlSource'
import { extractIdmlContents, buildMultiPageIdml, type PatchOptions } from './idmlPatcher'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { resolveFileName } from './mergeEngine'

export interface IdmlExportConfig {
  rangeStart: number     // 0-indexed
  rangeEnd: number       // 0-indexed inclusive
  fileNamePattern: string // ex: "catalogue_{{client}}"
}

export function useIdmlBatchExport() {
  const projectId = useEditorStore((s) => s.projectId)
  const projectTitle = useEditorStore((s) => s.projectTitle)
  const idmlSourceFileName = useEditorStore((s) => s.idmlSourceFileName)
  const { rows, formulas, formulaConfigs, hideLineIfEmpty } = useMergeStore()

  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const cancelledRef = useRef(false)

  const exportIdmlMultiPage = useCallback(async (config: IdmlExportConfig) => {
    const { rangeStart, rangeEnd, fileNamePattern } = config

    // Validate range
    const start = Math.max(0, rangeStart)
    const end = Math.min(rows.length - 1, rangeEnd)
    const selectedRows = rows.slice(start, end + 1)

    if (selectedRows.length === 0) {
      return
    }

    setIsExporting(true)
    setProgress(0)
    setTotal(selectedRows.length)
    cancelledRef.current = false

    try {
      // Get IDML buffer
      const buffer = await getIdmlBuffer(projectId, idmlSourceFileName ?? undefined)
      if (!buffer) {
        throw new Error('Source IDML indisponible')
      }

      // Extract XML contents
      const contents = await extractIdmlContents(buffer)

      // Collect bindings from canvas objects
      const canvas = globalFabricCanvas
      const bindings: Record<string, Record<string, string>> = {}
      if (canvas) {
        for (const obj of canvas.getObjects()) {
          const b = obj.data?.bindings as Record<string, string> | undefined
          if (b && obj.data?.id) {
            bindings[obj.data.id as string] = b
          }
        }
      }

      const options: Omit<PatchOptions, 'row'> = {
        formulas,
        formulaConfigs,
        hideLineIfEmpty,
        bindings: Object.keys(bindings).length > 0 ? bindings : undefined,
      }

      // Build multi-page IDML
      const blob = await buildMultiPageIdml(
        buffer,
        contents,
        selectedRows,
        options,
        (current, total) => {
          setProgress(current)
          setTotal(total)
        },
        cancelledRef,
      )

      if (cancelledRef.current) {
        return
      }

      // Generate filename
      const baseName = fileNamePattern
        ? resolveFileName(fileNamePattern, selectedRows[0])
        : (projectTitle || idmlSourceFileName?.replace(/\.idml$/i, '') || 'export')

      // Download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${baseName}.idml`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[IDML Export] Erreur:', err)
      throw err
    } finally {
      setIsExporting(false)
    }
  }, [projectId, projectTitle, idmlSourceFileName, rows, formulas, formulaConfigs, hideLineIfEmpty])

  const cancel = useCallback(() => {
    cancelledRef.current = true
  }, [])

  return {
    exportIdmlMultiPage,
    cancel,
    progress,
    total,
    isExporting,
  }
}
