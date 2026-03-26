import { useEffect, useState } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { EditorHeader } from '@/components/panels/EditorHeader'
import { ToolBar } from '@/components/panels/ToolBar'
import { RightPanelStack } from '@/components/panels/RightPanelStack'
import { EditorFooter } from '@/components/panels/EditorFooter'
import { TextToolbar } from '@/components/panels/TextToolbar'
import { SettingsSheet } from '@/components/shared/SettingsSheet'
import { CanvasContainer } from '@/features/editor/CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'
import { useProjectStore } from '@/stores/project.store'
import { usePreloadFonts } from '@/features/assets/useFonts'
import { useIdmlUpload } from '@/features/idml/useIdmlUpload'
import { useIdmlParse } from '@/features/idml/useIdmlParse'
import { usePptxParse } from '@/features/pptx/usePptxParse'
import { FabricImage } from 'fabric'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'

export default function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const setProjectId = useEditorStore((s) => s.setProjectId)
  const setProjectTitle = useEditorStore((s) => s.setProjectTitle)
  const { pendingImport, setPendingImport } = useProjectStore()
  const { processFiles: processIdmlFiles } = useIdmlUpload()
  const { parseAndRender: parseIdml } = useIdmlParse()
  const { parseAndRender: parsePptx, state: pptxState } = usePptxParse()
  const [idmlImporting, setIdmlImporting] = useState(false)
  usePreloadFonts()

  useEffect(() => {
    if (id) setProjectId(id)
    const navTitle = (location.state as any)?.title
    if (navTitle) setProjectTitle(navTitle)
    // Reset projectId on unmount so useLoadCanvas re-triggers on next visit
    return () => {
      useEditorStore.getState().setProjectId(null)
    }
  }, [id, setProjectId, setProjectTitle, location.state])

  // Handle pending import from dashboard
  useEffect(() => {
    if (!pendingImport) return
    const timer = setTimeout(async () => {
      const { type, files } = pendingImport
      setPendingImport(null)

      if (type === 'idml' && files.length > 0) {
        setIdmlImporting(true)
        try {
          const state = await processIdmlFiles(files)
          if (state && state.step === 'ready') {
            await parseIdml(state)
          }
        } catch (err) {
          console.error('IDML import error', err)
        } finally {
          setIdmlImporting(false)
        }
      }

      if (type === 'pptx' && files.length > 0) {
        await parsePptx(files[0])
      }

      if (type === 'image' && files.length > 0) {
        const file = files[0]
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result as string
          const imgEl = new Image()
          imgEl.onload = () => {
            const canvas = globalFabricCanvas
            if (!canvas) return
            const fabricImg = new FabricImage(imgEl)
            const cw = canvas.getWidth()
            const ch = canvas.getHeight()
            const scale = Math.min(cw / imgEl.width, ch / imgEl.height, 1)
            fabricImg.set({
              scaleX: scale,
              scaleY: scale,
              left: (cw - imgEl.width * scale) / 2,
              top: (ch - imgEl.height * scale) / 2,
            })
            canvas.add(fabricImg)
            canvas.setActiveObject(fabricImg)
            canvas.requestRenderAll()
          }
          imgEl.src = dataUrl
        }
        reader.readAsDataURL(file)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [pendingImport]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-screen bg-[#0f0f0f] overflow-hidden">
      <EditorHeader />
      <TextToolbar />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ToolBar />
        <div className="flex-1 min-w-0 relative overflow-hidden">
          <CanvasContainer />

          {idmlImporting && (
            <div className="absolute inset-0 z-30 bg-black/60 flex flex-col items-center justify-center gap-3 pointer-events-none">
              <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
              <p className="text-amber-200 font-medium">Import IDML en cours...</p>
            </div>
          )}

          {(pptxState.step === 'parsing' || pptxState.step === 'converting' || pptxState.step === 'rendering') && (
            <div className="absolute inset-0 z-30 bg-black/60 flex flex-col items-center justify-center gap-3 pointer-events-none">
              <Loader2 className="w-10 h-10 text-orange-400 animate-spin" />
              <p className="text-orange-200 font-medium">Import PowerPoint en cours...</p>
              {pptxState.objectCount > 0 && (
                <p className="text-orange-200/60 text-sm">{pptxState.objectCount} objets</p>
              )}
            </div>
          )}
        </div>
        <RightPanelStack />
      </div>

      <EditorFooter />
      <SettingsSheet />
    </div>
  )
}
