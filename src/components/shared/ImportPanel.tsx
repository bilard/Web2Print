import { useState, useRef, useCallback, useEffect } from 'react'
import { FolderOpen, Presentation, Upload, Loader2, ImageIcon, FileSpreadsheet, Shapes, Wand2, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { useIdmlUpload } from '@/features/idml/useIdmlUpload'
import { IdmlSummaryModal } from '@/features/idml/IdmlSummaryModal'
import { traverseDataTransfer, dataTransferHasDirectory } from '@/lib/dragdrop'
import { convertImageToEditableSvg } from '@/features/svg/imageToSvg'
import { convertPdfToEditableSvg } from '@/features/svg/pdfToSvg'

export interface ImportSelection {
  type: 'idml' | 'pptx' | 'image' | 'svg' | 'xlsx' | 'image-to-svg' | 'pdf-to-svg'
  files: File[]
  /** Dimensions canvas suggérées (présent pour image-to-svg / pdf-to-svg : matche les pixels natifs de la source). */
  canvas?: { width: number; height: number }
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
  const imageInputRef = useRef<HTMLInputElement>(null)
  const svgInputRef = useRef<HTMLInputElement>(null)
  const xlsxInputRef = useRef<HTMLInputElement>(null)
  const imageToSvgInputRef = useRef<HTMLInputElement>(null)
  const pdfToSvgInputRef = useRef<HTMLInputElement>(null)
  const [convertingImage, setConvertingImage] = useState(false)
  const [convertingPdf, setConvertingPdf] = useState(false)

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

  const handleImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Type non supporté : attendu une image (.png, .jpg, .webp, .gif, .svg)', { description: file.name })
      return
    }
    onImport({ type: 'image', files: [file] })
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
      const { file: svgFile, width, height } = await convertImageToEditableSvg(file)
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
      const { file: svgFile, width, height } = await convertPdfToEditableSvg(file)
      onImport({ type: 'pdf-to-svg', files: [svgFile], canvas: { width, height } })
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
    if (type === 'image' && e.dataTransfer.files[0]) handleImageFile(e.dataTransfer.files[0])
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
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver('idml') }}
          onDragLeave={() => setDragOver(null)}
          onDrop={onDrop('idml')}
          onClick={() => idmlInputRef.current?.click()}
          className={`flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            dragOver === 'idml'
              ? 'border-amber-500 bg-amber-500/10'
              : 'border-white/10 hover:border-amber-500/40 bg-[#1a1a1a] hover:bg-[#1e1e1e]'
          }`}
        >
          <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center">
            <FolderOpen className="w-7 h-7 text-amber-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white">Import IDML</p>
            <p className="text-xs text-white/30 mt-1">IDML + PDF + Fonts</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/20">
            <Upload className="w-3 h-3" />
            Glisser ou cliquer
          </div>
          <p className="text-[10px] text-white/15">Sélectionner le dossier Assembly</p>
          <input
            ref={idmlInputRef}
            type="file"
            className="hidden"
            {...({ webkitdirectory: 'true', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
            onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) handleIdmlFiles(files); e.target.value = '' }}
          />
        </div>

        {/* PPTX Import */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver('pptx') }}
          onDragLeave={() => setDragOver(null)}
          onDrop={onDrop('pptx')}
          onClick={() => pptxInputRef.current?.click()}
          className={`flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            dragOver === 'pptx'
              ? 'border-orange-500 bg-orange-500/10'
              : 'border-white/10 hover:border-orange-500/40 bg-[#1a1a1a] hover:bg-[#1e1e1e]'
          }`}
        >
          <div className="w-14 h-14 bg-orange-500/10 rounded-2xl flex items-center justify-center">
            <Presentation className="w-7 h-7 text-orange-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white">Importer PPTX</p>
            <p className="text-xs text-white/30 mt-1">PowerPoint, slides éditables</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/20">
            <Upload className="w-3 h-3" />
            Glisser ou cliquer
          </div>
          <p className="text-[10px] text-white/15">.pptx</p>
          <input
            ref={pptxInputRef}
            type="file"
            accept=".pptx,.ppt"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePptxFile(f); e.target.value = '' }}
          />
        </div>

        {/* Image Import */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver('image') }}
          onDragLeave={() => setDragOver(null)}
          onDrop={onDrop('image')}
          onClick={() => imageInputRef.current?.click()}
          className={`flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            dragOver === 'image'
              ? 'border-sky-500 bg-sky-500/10'
              : 'border-white/10 hover:border-sky-500/40 bg-[#1a1a1a] hover:bg-[#1e1e1e]'
          }`}
        >
          <div className="w-14 h-14 bg-sky-500/10 rounded-2xl flex items-center justify-center">
            <ImageIcon className="w-7 h-7 text-sky-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white">Importer une image</p>
            <p className="text-xs text-white/30 mt-1">PNG, JPG, SVG, WebP</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/20">
            <Upload className="w-3 h-3" />
            Glisser ou cliquer
          </div>
          <p className="text-[10px] text-white/15">.png .jpg .svg .webp .gif</p>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = '' }}
          />
        </div>

        {/* SVG Import — éditable */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver('svg') }}
          onDragLeave={() => setDragOver(null)}
          onDrop={onDrop('svg')}
          onClick={() => svgInputRef.current?.click()}
          className={`flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            dragOver === 'svg'
              ? 'border-purple-500 bg-purple-500/10'
              : 'border-white/10 hover:border-purple-500/40 bg-[#1a1a1a] hover:bg-[#1e1e1e]'
          }`}
        >
          <div className="w-14 h-14 bg-purple-500/10 rounded-2xl flex items-center justify-center">
            <Shapes className="w-7 h-7 text-purple-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white">Importer SVG</p>
            <p className="text-xs text-white/30 mt-1">Vectoriel éditable</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/20">
            <Upload className="w-3 h-3" />
            Glisser ou cliquer
          </div>
          <p className="text-[10px] text-white/15">.svg (Illustrator)</p>
          <input
            ref={svgInputRef}
            type="file"
            accept=".svg,image/svg+xml"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSvgFile(f); e.target.value = '' }}
          />
        </div>

        {/* Excel / CSV Import */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver('xlsx') }}
          onDragLeave={() => setDragOver(null)}
          onDrop={onDrop('xlsx')}
          onClick={() => xlsxInputRef.current?.click()}
          className={`flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            dragOver === 'xlsx'
              ? 'border-emerald-500 bg-emerald-500/10'
              : 'border-white/10 hover:border-emerald-500/40 bg-[#1a1a1a] hover:bg-[#1e1e1e]'
          }`}
        >
          <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
            <FileSpreadsheet className="w-7 h-7 text-emerald-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white">Importer Excel</p>
            <p className="text-xs text-white/30 mt-1">Données & fusion variable</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/20">
            <Upload className="w-3 h-3" />
            Glisser ou cliquer
          </div>
          <p className="text-[10px] text-white/15">.xlsx .xls .csv</p>
          <input
            ref={xlsxInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleXlsxFile(f); e.target.value = '' }}
          />
        </div>

        {/* Image → SVG éditable (raster verrouillé + overlays vectoriels) */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver('image-to-svg') }}
          onDragLeave={() => setDragOver(null)}
          onDrop={onDrop('image-to-svg')}
          onClick={() => imageToSvgInputRef.current?.click()}
          className={`flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            dragOver === 'image-to-svg'
              ? 'border-pink-500 bg-pink-500/10'
              : 'border-white/10 hover:border-pink-500/40 bg-[#1a1a1a] hover:bg-[#1e1e1e]'
          }`}
        >
          <div className="w-14 h-14 bg-pink-500/10 rounded-2xl flex items-center justify-center">
            <Wand2 className="w-7 h-7 text-pink-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white">Image → SVG éditable</p>
            <p className="text-xs text-white/30 mt-1">Raster verrouillé + overlays</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/20">
            <Upload className="w-3 h-3" />
            Glisser ou cliquer
          </div>
          <p className="text-[10px] text-white/15">.png .jpg .webp .gif → .svg</p>
          <input
            ref={imageToSvgInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageToSvgFile(f); e.target.value = '' }}
          />
        </div>

        {/* PDF → SVG éditable (page 1 rasterisée + overlays vectoriels) */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver('pdf-to-svg') }}
          onDragLeave={() => setDragOver(null)}
          onDrop={onDrop('pdf-to-svg')}
          onClick={() => pdfToSvgInputRef.current?.click()}
          className={`flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            dragOver === 'pdf-to-svg'
              ? 'border-pink-500 bg-pink-500/10'
              : 'border-white/10 hover:border-pink-500/40 bg-[#1a1a1a] hover:bg-[#1e1e1e]'
          }`}
        >
          <div className="w-14 h-14 bg-pink-500/10 rounded-2xl flex items-center justify-center">
            <FileText className="w-7 h-7 text-pink-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white">PDF → SVG éditable</p>
            <p className="text-xs text-white/30 mt-1">Page 1 rasterisée + overlays</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/20">
            <Upload className="w-3 h-3" />
            Glisser ou cliquer
          </div>
          <p className="text-[10px] text-white/15">.pdf (page 1) → .svg</p>
          <input
            ref={pdfToSvgInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdfToSvgFile(f); e.target.value = '' }}
          />
        </div>
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
    </div>
  )
}
