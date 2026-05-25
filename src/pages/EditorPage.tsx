import { useEffect, useState } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { EditorHeader } from '@/components/panels/EditorHeader'
import { ToolBar } from '@/components/panels/ToolBar'
import { RightPanelStack } from '@/components/panels/RightPanelStack'
import { EditorFooter } from '@/components/panels/EditorFooter'
import { TextToolbar } from '@/components/panels/TextToolbar'
import { SettingsSheet } from '@/components/shared/SettingsSheet'
import { DamPickerModal } from '@/features/dam/components/DamPickerModal'
import { useDamCanvasInsert } from '@/features/dam/hooks/useDamCanvasInsert'
import { CanvasContainer } from '@/features/editor/CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'
import { useProjectStore } from '@/stores/project.store'
import { usePreloadFonts } from '@/features/assets/useFonts'
import { useIdmlUpload } from '@/features/idml/useIdmlUpload'
import { useIdmlParse } from '@/features/idml/useIdmlParse'
import { usePptxParse } from '@/features/pptx/usePptxParse'
import { useSvgParse } from '@/features/svg/useSvgParse'
import { useImageToSvgDecompose } from '@/features/svg/useImageToSvgDecompose'
import { useLockBgImage } from '@/features/svg/useLockBgImage'
import { FabricImage } from 'fabric'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { applyPrintDefaults } from '@/features/print/printDefaults'

export default function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const setProjectId = useEditorStore((s) => s.setProjectId)
  const setProjectTitle = useEditorStore((s) => s.setProjectTitle)
  const {
    pendingImport,
    setPendingImport,
    pendingDamInsert,
    setPendingDamInsert,
  } = useProjectStore()
  const { processFiles: processIdmlFiles } = useIdmlUpload()
  const { parseAndRender: parseIdml } = useIdmlParse()
  const { parseAndRender: parsePptx, state: pptxState } = usePptxParse()
  const { parseAndRender: parseSvg, state: svgState } = useSvgParse()
  const {
    canDecompose,
    isRunning: decomposing,
    hasDecomposition,
    run: runDecompose,
  } = useImageToSvgDecompose()
  const [idmlImporting, setIdmlImporting] = useState(false)
  // Déclenche la décomposition auto après un import raster→SVG (Image→SVG / PDF→SVG).
  const [autoDecomposePending, setAutoDecomposePending] = useState(false)
  const { insertOnCanvas } = useDamCanvasInsert()
  usePreloadFonts()
  // Lock auto du calque bg-image-locked pour les projets image-to-svg : empêche
  // le drag accidentel et laisse passer les clics aux overlays manuels.
  useLockBgImage()

  // Image DAM en attente d'insertion (navigation depuis le dashboard ou DamGenerate).
  // On retry tant que `globalFabricCanvas` n'est pas prêt (init Fabric asynchrone),
  // jusqu'à ~2s max — au-delà on abandonne pour éviter de coincer l'app.
  useEffect(() => {
    if (!pendingDamInsert) return
    let cancelled = false
    let attempts = 0
    const tryInsert = () => {
      if (cancelled) return
      if (globalFabricCanvas) {
        const target = pendingDamInsert
        setPendingDamInsert(null)
        void insertOnCanvas(target)
        return
      }
      attempts++
      if (attempts < 20) {
        setTimeout(tryInsert, 100)
      } else {
        console.warn('[EditorPage] Canvas non prêt après 2s, insertion DAM abandonnée.')
        setPendingDamInsert(null)
      }
    }
    tryInsert()
    return () => {
      cancelled = true
    }
  }, [pendingDamInsert, insertOnCanvas, setPendingDamInsert])

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

      // Reset des paramètres d'impression aux défauts ; les repères restent
      // désactivés, l'utilisateur les active à la demande depuis le panneau.
      applyPrintDefaults()

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

      if ((type === 'svg' || type === 'image-to-svg' || type === 'pdf-to-svg') && files.length > 0) {
        await parseSvg(files[0])
        // Conversions raster→SVG : on enchaîne automatiquement la décomposition
        // (Vision → textes/formes éditables). Un .svg vectoriel importé n'a pas de
        // calque image-bg-locked, donc canDecompose restera false → pas de décompo.
        if (type === 'image-to-svg' || type === 'pdf-to-svg') {
          setAutoDecomposePending(true)
        }
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
  }, [pendingImport])

  // Auto-décomposition : attend que le calque image-bg-locked soit détecté
  // (canDecompose) après le rendu du SVG importé, puis lance la décompo UNE fois.
  useEffect(() => {
    if (!autoDecomposePending) return
    if (!canDecompose || decomposing || hasDecomposition) return
    setAutoDecomposePending(false)
    void runDecompose()
  }, [autoDecomposePending, canDecompose, decomposing, hasDecomposition, runDecompose])

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

          {(svgState.step === 'reading' || svgState.step === 'parsing' || svgState.step === 'rendering') && (
            <div className="absolute inset-0 z-30 bg-black/60 flex flex-col items-center justify-center gap-3 pointer-events-none">
              <Loader2 className="w-10 h-10 text-purple-400 animate-spin" />
              <p className="text-purple-200 font-medium">Import SVG en cours...</p>
              {svgState.objectCount > 0 && (
                <p className="text-purple-200/60 text-sm">{svgState.objectCount} objets</p>
              )}
            </div>
          )}
        </div>
        <RightPanelStack />
      </div>

      <EditorFooter />
      <SettingsSheet />
      <DamPickerModal />
    </div>
  )
}
