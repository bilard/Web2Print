import { FolderOpen, Loader2, AlertCircle, CheckCircle, X } from 'lucide-react'
import type { IdmlUploadState } from './useIdmlUpload'

interface Props {
  processing: boolean
  state: IdmlUploadState | null
  error: string | null
  onConfirm: () => void
  onClose: () => void
}

export function IdmlSummaryModal({ processing, state, error, onConfirm, onClose }: Props) {
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
          {/* Chargement */}
          {processing && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
              <p className="text-sm text-white/70">Analyse du dossier...</p>
            </div>
          )}

          {/* Erreur */}
          {error && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-white">Erreur</p>
                <p className="text-xs text-white/40 mt-1 max-w-xs">{error}</p>
              </div>
              <button
                onClick={onClose}
                className="bg-white/10 hover:bg-white/15 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Fermer
              </button>
            </div>
          )}

          {/* Résumé */}
          {!processing && !error && state && (
            <div className="flex flex-col gap-4">
              <div className="border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Résumé</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Fichier IDML', value: state.assembly.idmlFile?.name ?? '—' },
                    { label: 'PDF référence', value: state.assembly.pdfFile?.name ?? '—' },
                    { label: 'Fonts chargées', value: `${state.loadedFonts.length} / ${state.assembly.fontFiles.length}` },
                    { label: 'Images', value: String(state.assembly.imageFiles.length) },
                    { label: 'Spreads', value: String(state.spreadCount) },
                    { label: 'Fichiers XML', value: state.idmlContents ? String(Object.keys(state.idmlContents.spreads).length + 2) : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-white/30 uppercase tracking-wider">{label}</span>
                      <span className="text-xs text-white/70 truncate">{value}</span>
                    </div>
                  ))}
                </div>

                {state.loadedFonts.length > 0 && (
                  <div>
                    <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Fonts disponibles</p>
                    <div className="flex flex-wrap gap-1">
                      {state.loadedFonts.map((f) => (
                        <span
                          key={f.name}
                          className="text-[10px] bg-white/5 border border-white/10 rounded px-2 py-0.5 text-white/50"
                        >
                          {f.family}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={onConfirm}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm py-2.5 rounded-xl transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Créer le projet et importer
              </button>
              <p className="text-[10px] text-white/20 text-center">Appuyez sur Entrée pour importer</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
