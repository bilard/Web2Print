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

export default function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const setProjectId = useEditorStore((s) => s.setProjectId)
  const setProjectTitle = useEditorStore((s) => s.setProjectTitle)
  const { pendingImport, setPendingImport } = useProjectStore()
  const { processFiles: processIdmlFiles } = useIdmlUpload()
  const { parseAndRender: parseIdml } = useIdmlParse()
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
        // Process IDML assembly from dashboard import
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
        </div>
        <RightPanelStack />
      </div>

      <EditorFooter />
      <SettingsSheet />
    </div>
  )
}
