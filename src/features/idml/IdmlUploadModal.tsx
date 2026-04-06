import { useCallback, useState, useEffect, useRef } from 'react'
import { X, FolderOpen, Loader2, AlertCircle } from 'lucide-react'
import { useIdmlUpload } from './useIdmlUpload'
import { useIdmlParse } from './useIdmlParse'
import type { IdmlUploadState } from './useIdmlUpload'

interface IdmlUploadModalProps {
  onReady: (state: IdmlUploadState) => void
  onClose: () => void
}

export function IdmlUploadModal({ onReady, onClose }: IdmlUploadModalProps) {
  const { state, processFiles, reset } = useIdmlUpload()
  const { parseAndRender } = useIdmlParse()
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const autoTriggered = useRef(false)

  const handleFiles = useCallback((files: FileList | File[]) => {
    processFiles(files)
  }, [processFiles])

  // Auto-trigger parse+render when upload is ready
  useEffect(() => {
    if (state.step === 'ready' && !autoTriggered.current) {
      autoTriggered.current = true
      parseAndRender(state).then(() => {
        onReady(state)
      })
    }
  }, [state.step]) // eslint-disable-line react-hooks/exhaustive-deps

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const items = e.dataTransfer.items
    const files: File[] = []

    const processEntry = (entry: FileSystemEntry): Promise<void> => {
      return new Promise((resolve) => {
        if (entry.isFile) {
          (entry as FileSystemFileEntry).file((f) => {
            Object.defineProperty(f, '_path', {
              value: entry.fullPath.replace(/^\//, ''),
              writable: false,
              enumerable: false,
            })
            files.push(f)
            resolve()
          })
        } else if (entry.isDirectory) {
          const reader = (entry as FileSystemDirectoryEntry).createReader()
          const allEntries: FileSystemEntry[] = []
          const readAll = () => {
            reader.readEntries((entries) => {
              if (entries.length === 0) {
                Promise.all(allEntries.map(processEntry)).then(() => resolve())
              } else {
                allEntries.push(...entries)
                readAll()
              }
            })
          }
          readAll()
        } else {
          resolve()
        }
      })
    }

    const entries = Array.from(items).map((i) => i.webkitGetAsEntry()).filter(Boolean) as FileSystemEntry[]
    Promise.all(entries.map(processEntry)).then(() => {
      if (files.length > 0) handleFiles(files)
    })
  }, [handleFiles])

  const { step, error } = state
  const isProcessing = !['idle', 'error'].includes(step) && step !== 'ready'
  const isDone = step === 'ready'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-amber-400" />
            <h2 className="font-semibold text-white text-sm">Import IDML</h2>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">

          {/* Drop zone — idle */}
          {step === 'idle' && (
            <div
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-4 transition-colors ${
                dragOver ? 'border-amber-500 bg-amber-500/10' : 'border-white/10 hover:border-white/20'
              }`}
            >
              <div className="w-14 h-14 bg-amber-500/10 rounded-xl flex items-center justify-center">
                <FolderOpen className="w-7 h-7 text-amber-400" />
              </div>
              <div className="text-center">
                <p className="text-sm text-white/70 font-medium">Glissez le dossier Assembly</p>
                <p className="text-xs text-white/30 mt-1">IDML + PDF + Fonts</p>
              </div>
              <label className="cursor-pointer bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                Parcourir
                <input
                  ref={fileInputRef}
                  type="file"
                  // @ts-ignore — webkitdirectory non standard
                  webkitdirectory="true"
                  multiple
                  className="hidden"
                  onChange={(e) => { if (e.target.files) handleFiles(e.target.files) }}
                />
              </label>
            </div>
          )}

          {/* Processing / Done */}
          {(isProcessing || isDone) && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
              </div>
              <p className="text-sm text-white/70">Import en cours...</p>
              <p className="text-[10px] text-white/30">
                {step === 'detecting' && 'Detection des fichiers...'}
                {step === 'loading_fonts' && 'Chargement des polices...'}
                {step === 'unzipping' && 'Extraction IDML...'}
                {step === 'ready' && 'Rendu sur le canvas...'}
              </p>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-white">Erreur</p>
                <p className="text-xs text-white/40 mt-1 max-w-xs">{error}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { reset(); autoTriggered.current = false }}
                  className="bg-white/10 hover:bg-white/15 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                  Reessayer
                </button>
                <button onClick={onClose}
                  className="text-white/40 hover:text-white text-sm px-4 py-2 rounded-lg transition-colors">
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
