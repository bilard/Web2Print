import { useCallback } from 'react'
import JSZip from 'jszip'
import { getIdmlBuffer, globalIdmlSource } from './idmlSource'
import { exportIdmlModified } from './idmlExporter'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'

export function useExportIdml() {
  const projectTitle = useEditorStore((s) => s.projectTitle)
  const projectId = useEditorStore((s) => s.projectId)

  const canExportIdml = !!globalIdmlSource

  const exportIdml = useCallback(async (): Promise<void> => {
    const buffer = await getIdmlBuffer(projectId)
    if (!buffer) {
      throw new Error('Aucune source IDML disponible. Importez un fichier IDML d\'abord.')
    }

    const canvas = globalFabricCanvas
    if (!canvas) {
      throw new Error('Canvas non disponible.')
    }

    const objects = canvas.getObjects().filter(
      (o) => !o.data?.isGrid && !o.data?.isPageBg,
    )

    const { idmlBlob, fillImages } = await exportIdmlModified(buffer, objects)

    const baseName = globalIdmlSource?.fileName?.replace(/\.idml$/i, '') ?? projectTitle ?? 'export'

    if (fillImages.length > 0) {
      // Export ZIP contenant l'IDML + Links/ pour qu'InDesign trouve les images
      const outerZip = new JSZip()
      const folderName = `${baseName}_modified`
      outerZip.file(`${folderName}/${baseName}_modified.idml`, idmlBlob)
      for (const img of fillImages) {
        outerZip.file(`${folderName}/Links/${img.name}`, img.bytes)
      }
      const zipBlob = await outerZip.generateAsync({ type: 'blob', compression: 'DEFLATE' })

      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${folderName}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      console.log(`[IDML Export] Téléchargé: "${folderName}.zip" (IDML + ${fillImages.length} image(s) dans Links/)`)
    } else {
      // Pas de fill images → export IDML simple
      const exportName = `${baseName}_modified.idml`
      const url = URL.createObjectURL(idmlBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = exportName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      console.log(`[IDML Export] Téléchargé: "${exportName}"`)
    }

  }, [projectTitle, projectId])

  return { exportIdml, canExportIdml }
}
