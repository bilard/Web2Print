import { useState, useRef, useCallback, useEffect } from 'react'
import { FolderOpen, Presentation, Upload, Loader2, ImageIcon, FileSpreadsheet, Shapes } from 'lucide-react'
import { useIdmlUpload } from '@/features/idml/useIdmlUpload'
import { IdmlSummaryModal } from '@/features/idml/IdmlSummaryModal'

export interface ImportSelection {
  type: 'idml' | 'pptx' | 'image' | 'svg' | 'xlsx'
  files: File[]
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
    if (!file.name.toLowerCase().match(/\.pptx?$/)) return
    onImport({ type: 'pptx', files: [file] })
  }, [onImport])

  const handleImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    onImport({ type: 'image', files: [file] })
  }, [onImport])

  const handleSvgFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.svg')) return
    onImport({ type: 'svg', files: [file] })
  }, [onImport])

  const handleXlsxFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().match(/\.(xlsx|xls|csv)$/)) return
    onImport({ type: 'xlsx', files: [file] })
  }, [onImport])

  const onDrop = (type: string) => (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(null)
    if (type === 'pptx' && e.dataTransfer.files[0]) handlePptxFile(e.dataTransfer.files[0])
    if (type === 'idml') handleIdmlFiles(Array.from(e.dataTransfer.files))
    if (type === 'image' && e.dataTransfer.files[0]) handleImageFile(e.dataTransfer.files[0])
    if (type === 'svg' && e.dataTransfer.files[0]) handleSvgFile(e.dataTransfer.files[0])
    if (type === 'xlsx' && e.dataTransfer.files[0]) handleXlsxFile(e.dataTransfer.files[0])
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-sm text-white/40">Création du projet et import...</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
