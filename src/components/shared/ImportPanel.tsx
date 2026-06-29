import { useState, useRef, useCallback, useEffect } from 'react'
import { FolderOpen, Presentation, Loader2, FileSpreadsheet, Shapes, Wand2, FileText, FolderUp } from 'lucide-react'
import { toast } from 'sonner'
import { useCan } from '@/features/access/useAccess'
import { useIdmlUpload } from '@/features/idml/useIdmlUpload'
import { IdmlSummaryModal } from '@/features/idml/IdmlSummaryModal'
import { traverseDataTransfer, dataTransferHasDirectory } from '@/lib/dragdrop'
import { OptionHelp } from '@/components/shared/OptionHelp'
import { convertImageToEditableSvg } from '@/features/svg/imageToSvg'
import { convertPdfToEditableSvg, type PdfFontAsset } from '@/features/svg/pdfToSvg'
import { withProgress } from '@/stores/progress.store'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { ImportFolderToDriveModal } from '@/features/dam/ImportFolderToDriveModal'

export interface ImportSelection {
  type: 'idml' | 'pptx' | 'image' | 'svg' | 'xlsx' | 'image-to-svg' | 'pdf-to-svg'
  files: File[]
  /** Dimensions canvas suggérées (présent pour image-to-svg / pdf-to-svg : matche les pixels natifs de la source). */
  canvas?: { width: number; height: number }
  /** Polices chargées pour le rendu (pdf-to-svg) — à uploader dans le projet créé. */
  fonts?: PdfFontAsset[]
}

interface ImportPanelProps {
  onImport: (selection: ImportSelection) => void
  loading: boolean
}

export function ImportPanel({ onImport, loading }: ImportPanelProps) {
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [idmlProcessing, setIdmlProcessing] = useState(false)
  const [idmlError, setIdmlError] = useState<string | null>(null)
  const [pendingIdmlFiles, setPendingIdmlFiles] = useState<File[]>([])
  const { state: idmlState, processFiles, reset: resetIdml } = useIdmlUpload()

  const pptxInputRef = useRef<HTMLInputElement>(null)
  const idmlInputRef = useRef<HTMLInputElement>(null)
  const svgInputRef = useRef<HTMLInputElement>(null)
  const xlsxInputRef = useRef<HTMLInputElement>(null)
  const imageToSvgInputRef = useRef<HTMLInputElement>(null)
  const pdfToSvgInputRef = useRef<HTMLInputElement>(null)
  const [convertingImage, setConvertingImage] = useState(false)
  const [convertingPdf, setConvertingPdf] = useState(false)
  const [folderToDriveOpen, setFolderToDriveOpen] = useState(false)

  // Permissions par type d'import (owner court-circuite → true).
  const canIdml = useCan('import.idml')
  const canPptx = useCan('import.pptx')
  const canSvg = useCan('import.svg')
  const canExcel = useCan('import.excel')
  const canImageToSvg = useCan('import.imageToSvg')
  const canPdfToSvg = useCan('import.pdfToSvg')
  const canDamUpload = useCan('dam.upload')

  useModuleIntent('import', (action) => {
    if (!action.startsWith('format:')) return
    const key = action.slice('format:'.length)
    const el = document.querySelector<HTMLElement>(`[data-import-format="${key}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-indigo-500')
    window.setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-500'), 1500)
  })

  const showIdmlModal = idmlProcessing || idmlState.step === 'ready' || !!idmlError

  const handleIdmlFiles = useCallback(async (files: File[]) => {
    if (!files.length) return
    setPendingIdmlFiles(files)
    setIdmlError(null)
    setIdmlProcessing(true)
    const result = await processFiles(files)
    setIdmlProcessing(false)
    if (!result) setIdmlError('Composants manquants ou fichier invalide.')
  }, [processFiles])

  const handleIdmlConfirm = useCallback(() => {
    onImport({ type: 'idml', files: pendingIdmlFiles })
    resetIdml()
    setPendingIdmlFiles([])
  }, [onImport, pendingIdmlFiles, resetIdml])

  const handleIdmlClose = useCallback(() => {
    setIdmlError(null)
    resetIdml()
    setPendingIdmlFiles([])
  }, [resetIdml])

  // Entrée pour confirmer
  useEffect(() => {
    if (idmlState.step !== 'ready' || idmlProcessing) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); handleIdmlConfirm() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [idmlState.step, idmlProcessing, handleIdmlConfirm])

  const handlePptxFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().match(/\.pptx?$/)) {
      toast.error('Type non supporté : attendu .pptx', { description: file.name })
      return
    }
    onImport({ type: 'pptx', files: [file] })
  }, [onImport])

  const handleSvgFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.svg')) {
      toast.error('Type non supporté : attendu .svg', { description: file.name })
      return
    }
    onImport({ type: 'svg', files: [file] })
  }, [onImport])

  const handleXlsxFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().match(/\.(xlsx|xls|csv)$/)) {
      toast.error('Type non supporté : attendu .xlsx, .xls ou .csv', { description: file.name })
      return
    }
    onImport({ type: 'xlsx', files: [file] })
  }, [onImport])

  const handleImageToSvgFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      toast.error('Type non supporté : attendu une image raster (.png, .jpg, .webp, .gif)', { description: file.name })
      return
    }
    setConvertingImage(true)
    try {
      const { file: svgFile, width, height } = await withProgress('Conversion image → SVG…', () => convertImageToEditableSvg(file))
      onImport({ type: 'image-to-svg', files: [svgFile], canvas: { width, height } })
    } catch (err) {
      console.error('Image → SVG conversion error', err)
      toast.error('Échec de la conversion image → SVG', { description: err instanceof Error ? err.message : String(err) })
      setConvertingImage(false)
    }
  }, [onImport])

  const handlePdfToSvgFile = useCallback(async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Type non supporté : attendu un PDF', { description: file.name })
      return
    }
    setConvertingPdf(true)
    try {
      const { file: svgFile, width, height, fonts } = await withProgress('Rasterisation PDF → SVG…', () => convertPdfToEditableSvg(file))
      onImport({ type: 'pdf-to-svg', files: [svgFile], canvas: { width, height }, fonts })
    } catch (err) {
      console.error('PDF → SVG conversion error', err)
      toast.error('Échec de la conversion PDF → SVG', { description: err instanceof Error ? err.message : String(err) })
      setConvertingPdf(false)
    }
  }, [onImport])

  const onDrop = (type: string) => async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(null)
    if (type === 'pptx' && e.dataTransfer.files[0]) handlePptxFile(e.dataTransfer.files[0])
    if (type === 'idml') {
      const items = e.dataTransfer.items
      const files = dataTransferHasDirectory(items)
        ? await traverseDataTransfer(items)
        : Array.from(e.dataTransfer.files)
      handleIdmlFiles(files)
    }
    if (type === 'svg' && e.dataTransfer.files[0]) handleSvgFile(e.dataTransfer.files[0])
    if (type === 'xlsx' && e.dataTransfer.files[0]) handleXlsxFile(e.dataTransfer.files[0])
    if (type === 'image-to-svg' && e.dataTransfer.files[0]) handleImageToSvgFile(e.dataTransfer.files[0])
    if (type === 'pdf-to-svg' && e.dataTransfer.files[0]) handlePdfToSvgFile(e.dataTransfer.files[0])
  }

  if (loading || convertingImage || convertingPdf) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-sm text-white/40">
          {convertingImage ? 'Conversion image → SVG…' : convertingPdf ? 'Rasterisation PDF → SVG…' : 'Création du projet et import...'}
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* IDML Assembly Import */}
        {canIdml && (
        <div
          data-import-format="idml"
          onDragOver={(e) => { e.preventDefault(); setDragOver('idml') }}
          onDragLeave={() => setDragOver(null)}
          onDrop={onDrop('idml')}
          onClick={() => idmlInputRef.current?.click()}
          className={`flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            dragOver === 'idml'
              ? 'border-amber-500 bg-amber-500/10'
              : 'border-white/10 hover:border-amber-500/40 bg-surface hover:bg-surface-2'
          }`}
        >
          <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center">
            <FolderOpen className="w-7 h-7 text-amber-400" />
          </div>
          <div data-tour="opt-import-idml" className="text-center">
            <p className="text-sm font-medium text-white flex items-center justify-center gap-1">
              Import IDML
              <OptionHelp text="Importe un projet Adobe InDesign (dossier IDML + PDF + polices). Conserve la mise en page, les styles et le texte éditable." />
            </p>
            <p className="text-xs text-white/30 mt-1">IDML + PDF + Fonts</p>
          </div>
          <input
            ref={idmlInputRef}
            type="file"
            className="hidden"
            {...({ webkitdirectory: 'true', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
            onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) handleIdmlFiles(files); e.target.value = '' }}
          />
        </div>
        )}

        {/* PPTX Import */}
        {canPptx && (
        <div
          data-import-format="pptx"
          onDragOver={(e) => { e.preventDefault(); setDragOver('pptx') }}
          onDragLeave={() => setDragOver(null)}
          onDrop={onDrop('pptx')}
          onClick={() => pptxInputRef.current?.click()}
          className={`flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            dragOver === 'pptx'
              ? 'border-orange-500 bg-orange-500/10'
              : 'border-white/10 hover:border-orange-500/40 bg-surface hover:bg-surface-2'
          }`}
        >
          <div className="w-14 h-14 bg-orange-500/10 rounded-2xl flex items-center justify-center">
            <Presentation className="w-7 h-7 text-orange-400" />
          </div>
          <div data-tour="opt-import-pptx" className="text-center">
            <p className="text-sm font-medium text-white flex items-center justify-center gap-1">
              Importer PPTX
              <OptionHelp text="Importe une présentation PowerPoint. Chaque diapositive devient une page éditable (textes, formes, images)." />
            </p>
            <p className="text-xs text-white/30 mt-1">PowerPoint, slides éditables</p>
          </div>
          <input
            ref={pptxInputRef}
            type="file"
            accept=".pptx,.ppt"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePptxFile(f); e.target.value = '' }}
          />
        </div>
        )}

        {/* SVG Import — éditable */}
        {canSvg && (
        <div
          data-import-format="svg"
          onDragOver={(e) => { e.preventDefault(); setDragOver('svg') }}
          onDragLeave={() => setDragOver(null)}
          onDrop={onDrop('svg')}
          onClick={() => svgInputRef.current?.click()}
          className={`flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            dragOver === 'svg'
              ? 'border-purple-500 bg-purple-500/10'
              : 'border-white/10 hover:border-purple-500/40 bg-surface hover:bg-surface-2'
          }`}
        >
          <div className="w-14 h-14 bg-purple-500/10 rounded-2xl flex items-center justify-center">
            <Shapes className="w-7 h-7 text-purple-400" />
          </div>
          <div data-tour="opt-import-svg" className="text-center">
            <p className="text-sm font-medium text-white flex items-center justify-center gap-1">
              Importer SVG
              <OptionHelp text="Importe un fichier vectoriel SVG. Chaque forme et texte reste éditable individuellement sur le canvas." />
            </p>
            <p className="text-xs text-white/30 mt-1">Vectoriel éditable</p>
          </div>
          <input
            ref={svgInputRef}
            type="file"
            accept=".svg,image/svg+xml"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSvgFile(f); e.target.value = '' }}
          />
        </div>
        )}

        {/* Excel / CSV Import */}
        {canExcel && (
        <div
          data-import-format="excel"
          onDragOver={(e) => { e.preventDefault(); setDragOver('xlsx') }}
          onDragLeave={() => setDragOver(null)}
          onDrop={onDrop('xlsx')}
          onClick={() => xlsxInputRef.current?.click()}
          className={`flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            dragOver === 'xlsx'
              ? 'border-emerald-500 bg-emerald-500/10'
              : 'border-white/10 hover:border-emerald-500/40 bg-surface hover:bg-surface-2'
          }`}
        >
          <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
            <FileSpreadsheet className="w-7 h-7 text-emerald-400" />
          </div>
          <div data-tour="opt-import-excel" className="text-center">
            <p className="text-sm font-medium text-white flex items-center justify-center gap-1">
              Importer Excel
              <OptionHelp text="Importe un tableau (Excel/CSV) dans le PIM. Ces données alimentent le publipostage : une variante du visuel par ligne." />
            </p>
            <p className="text-xs text-white/30 mt-1">Données & fusion variable</p>
          </div>
          <input
            ref={xlsxInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleXlsxFile(f); e.target.value = '' }}
          />
        </div>
        )}

        {/* Image → SVG éditable (raster verrouillé + overlays vectoriels) */}
        {canImageToSvg && (
        <div
          data-import-format="image-to-svg"
          onDragOver={(e) => { e.preventDefault(); setDragOver('image-to-svg') }}
          onDragLeave={() => setDragOver(null)}
          onDrop={onDrop('image-to-svg')}
          onClick={() => imageToSvgInputRef.current?.click()}
          className={`flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            dragOver === 'image-to-svg'
              ? 'border-pink-500 bg-pink-500/10'
              : 'border-white/10 hover:border-pink-500/40 bg-surface hover:bg-surface-2'
          }`}
        >
          <div className="w-14 h-14 bg-pink-500/10 rounded-2xl flex items-center justify-center">
            <Wand2 className="w-7 h-7 text-pink-400" />
          </div>
          <div data-tour="opt-import-image-to-svg" className="text-center">
            <p className="text-sm font-medium text-white flex items-center justify-center gap-1">
              Image → SVG éditable
              <OptionHelp text="Convertit une image : le visuel est verrouillé en fond et les textes détectés (Vision) deviennent des calques éditables par-dessus." />
            </p>
            <p className="text-xs text-white/30 mt-1">Raster verrouillé + overlays</p>
          </div>
          <input
            ref={imageToSvgInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageToSvgFile(f); e.target.value = '' }}
          />
        </div>
        )}

        {/* PDF → SVG éditable (page 1 rasterisée + overlays vectoriels) */}
        {canPdfToSvg && (
        <div
          data-import-format="pdf-to-svg"
          onDragOver={(e) => { e.preventDefault(); setDragOver('pdf-to-svg') }}
          onDragLeave={() => setDragOver(null)}
          onDrop={onDrop('pdf-to-svg')}
          onClick={() => pdfToSvgInputRef.current?.click()}
          className={`flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            dragOver === 'pdf-to-svg'
              ? 'border-pink-500 bg-pink-500/10'
              : 'border-white/10 hover:border-pink-500/40 bg-surface hover:bg-surface-2'
          }`}
        >
          <div className="w-14 h-14 bg-pink-500/10 rounded-2xl flex items-center justify-center">
            <FileText className="w-7 h-7 text-pink-400" />
          </div>
          <div data-tour="opt-import-pdf-to-svg" className="text-center">
            <p className="text-sm font-medium text-white flex items-center justify-center gap-1">
              PDF → SVG éditable
              <OptionHelp text="Rasterise la page 1 d'un PDF en fond verrouillé, puis détecte les textes pour les rendre éditables en surimpression." />
            </p>
            <p className="text-xs text-white/30 mt-1">Page 1 rasterisée + overlays</p>
          </div>
          <input
            ref={pdfToSvgInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdfToSvgFile(f); e.target.value = '' }}
          />
        </div>
        )}

        {/* Importer un dossier d'images → Google Drive (DAM) */}
        {canDamUpload && (
        <div
          data-import-format="folder-to-drive"
          onClick={() => setFolderToDriveOpen(true)}
          className="flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all border-white/10 hover:border-teal-500/40 bg-surface hover:bg-surface-2"
        >
          <div className="w-14 h-14 bg-teal-500/10 rounded-2xl flex items-center justify-center">
            <FolderUp className="w-7 h-7 text-teal-400" />
          </div>
          <div data-tour="opt-import-folder-to-drive" className="text-center">
            <p className="text-sm font-medium text-white flex items-center justify-center gap-1">
              Dossier → Drive
              <OptionHelp text="Envoie N images d'un dossier local vers le dossier Google Drive de votre choix (DAM). Idéal pour téléverser un lot de visuels d'un coup." />
            </p>
            <p className="text-xs text-white/30 mt-1">N images vers Google Drive</p>
          </div>
        </div>
        )}
      </div>

      <p className="text-xs text-white/15 mt-6 text-center">
        Le fichier sera importé dans un nouveau projet et ouvert dans l'éditeur.
      </p>

      {/* Modal résumé IDML */}
      {showIdmlModal && (
        <IdmlSummaryModal
          processing={idmlProcessing}
          state={idmlState.step === 'ready' ? idmlState : null}
          error={idmlError}
          onConfirm={handleIdmlConfirm}
          onClose={handleIdmlClose}
        />
      )}

      {/* Modal import dossier → Drive */}
      <ImportFolderToDriveModal open={folderToDriveOpen} onClose={() => setFolderToDriveOpen(false)} />
    </div>
  )
}
