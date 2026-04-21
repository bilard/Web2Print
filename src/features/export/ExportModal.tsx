import { useState } from 'react'
import { X, Download, Image as ImageIcon, FileText, Presentation, Code2, Loader2, CheckCircle, Package, Shapes } from 'lucide-react'
import { useExportPng } from './useExportPng'
import { useExportPdf } from './useExportPdf'
import { useExportPptx } from './useExportPptx'
import { useExportHtml } from './useExportHtml'
import { useExportSvg } from './useExportSvg'
import { useExportIdml } from '@/features/idml/useExportIdml'
import { globalIdmlSource } from '@/features/idml/idmlSource'
import type { PngDpi } from './useExportPng'

type Format = 'png' | 'pdf' | 'pptx' | 'html' | 'svg' | 'idml'
type ExportStatus = 'idle' | 'exporting' | 'done' | 'error'

interface ExportModalProps {
  onClose: () => void
}

const ALL_FORMATS: { id: Format; label: string; icon: React.ComponentType<{ className?: string }>; desc: string; color: string; idmlOnly?: boolean }[] = [
  { id: 'png',  label: 'PNG',       icon: ImageIcon,    desc: 'Image haute résolution',  color: 'text-emerald-400' },
  { id: 'pdf',  label: 'PDF',       icon: FileText,     desc: 'Document imprimable',     color: 'text-red-400'     },
  { id: 'pptx', label: 'PowerPoint',icon: Presentation, desc: 'Présentation éditable',  color: 'text-orange-400'  },
  { id: 'html', label: 'HTML',      icon: Code2,        desc: 'Dossier web complet',     color: 'text-sky-400'     },
  { id: 'svg',  label: 'SVG',       icon: Shapes,       desc: 'Vectoriel éditable',      color: 'text-purple-400'  },
  { id: 'idml', label: 'IDML',      icon: Package,      desc: 'InDesign modifié',        color: 'text-violet-400', idmlOnly: true },
]

export function ExportModal({ onClose }: ExportModalProps) {
  const hasIdmlSource = !!globalIdmlSource
  const formats = ALL_FORMATS.filter((f) => !f.idmlOnly || hasIdmlSource)

  const [format, setFormat] = useState<Format>('png')
  const [dpi, setDpi] = useState<PngDpi>(150)
  const [pdfWithMarks, setPdfWithMarks] = useState(false)
  const [status, setStatus] = useState<ExportStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const { exportPng } = useExportPng()
  const { exportPdf } = useExportPdf()
  const { exportPptx } = useExportPptx()
  const { exportHtml } = useExportHtml()
  const { exportSvg } = useExportSvg()
  const { exportIdml } = useExportIdml()

  const handleExport = async () => {
    setStatus('exporting')
    setError(null)
    try {
      if (format === 'png') await exportPng(dpi)
      else if (format === 'pdf') await exportPdf({ withPrintMarks: pdfWithMarks })
      else if (format === 'pptx') await exportPptx()
      else if (format === 'html') await exportHtml()
      else if (format === 'svg') await exportSvg()
      else if (format === 'idml') await exportIdml()
      setStatus('done')
      setTimeout(onClose, 1500)
    } catch (err) {
      console.error(err)
      setError(String(err))
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-indigo-400" />
            <h2 className="font-semibold text-white text-sm">Exporter</h2>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Format selector */}
          <div>
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Format</p>
            <div className={`grid ${formats.length >= 6 ? 'grid-cols-3' : 'grid-cols-5'} gap-2`}>
              {formats.map(({ id, label, icon: Icon, desc, color }) => (
                <button
                  key={id}
                  onClick={() => setFormat(id)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                    format === id
                      ? 'border-indigo-500/60 bg-indigo-500/10'
                      : 'border-white/10 hover:border-white/20 bg-white/3'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${format === id ? 'text-indigo-400' : color}`} />
                  <span className={`text-xs font-medium ${format === id ? 'text-white' : 'text-white/60'}`}>{label}</span>
                  <span className="text-[10px] text-white/30 text-center leading-tight">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Options PNG */}
          {format === 'png' && (
            <div>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Résolution</p>
              <div className="flex gap-2">
                {([72, 150, 300] as PngDpi[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDpi(d)}
                    className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                      dpi === d
                        ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                        : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80'
                    }`}
                  >
                    {d} dpi
                    {d === 72 && <span className="block text-[10px] text-white/30">Web</span>}
                    {d === 150 && <span className="block text-[10px] text-white/30">Standard</span>}
                    {d === 300 && <span className="block text-[10px] text-white/30">Impression</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Options PDF */}
          {format === 'pdf' && (
            <div className="space-y-2">
              <label className="flex items-start gap-2 bg-white/3 border border-white/5 rounded-xl p-3 cursor-pointer hover:border-white/10 transition-colors">
                <input
                  type="checkbox"
                  checked={pdfWithMarks}
                  onChange={(e) => setPdfWithMarks(e.target.checked)}
                  className="mt-0.5 accent-indigo-500"
                />
                <div className="flex-1">
                  <p className="text-xs font-medium text-white/80">Export print (traits de coupe + bleed)</p>
                  <p className="text-[11px] text-white/40 leading-relaxed mt-0.5">
                    Étend le canvas au fond perdu défini dans Impression et ajoute des traits de coupe en L aux 4 coins. À cocher pour l'impression offset/numérique.
                  </p>
                </div>
              </label>
              <div className="bg-white/3 border border-white/5 rounded-xl p-3">
                <p className="text-xs text-white/40">
                  PDF avec image haute qualité + textes sélectionnables en couche invisible.
                </p>
              </div>
            </div>
          )}

          {/* Info PPTX */}
          {format === 'pptx' && (
            <div className="bg-white/3 border border-white/5 rounded-xl p-3">
              <p className="text-xs text-white/40">
                Slide aux dimensions exactes du canvas. Image en fond + textes éditables dans PowerPoint.
              </p>
            </div>
          )}

          {/* Info HTML */}
          {format === 'html' && (
            <div className="bg-white/3 border border-white/5 rounded-xl p-3 flex flex-col gap-1.5">
              <p className="text-xs text-white/40">
                Archive ZIP contenant <span className="text-white/60">index.html</span>, <span className="text-white/60">style.css</span> et un dossier <span className="text-white/60">assets/</span> avec les images. Textes sélectionnables, formes en CSS.
              </p>
            </div>
          )}

          {/* Info SVG */}
          {format === 'svg' && (
            <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 flex flex-col gap-1.5">
              <p className="text-xs text-white/50">
                Fichier <span className="text-purple-300 font-medium">.svg</span> vectoriel réimportable et éditable dans Illustrator, Figma ou ce même éditeur.
              </p>
              <p className="text-[10px] text-white/30">
                Textes, formes et chemins sont conservés sans perte de qualité.
              </p>
            </div>
          )}

          {/* Info IDML */}
          {format === 'idml' && (
            <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-3 flex flex-col gap-1.5">
              <p className="text-xs text-white/50">
                Fichier <span className="text-violet-300 font-medium">.idml</span> modifié exportable dans <span className="text-white/70">Adobe InDesign</span>.
              </p>
              <p className="text-xs text-white/30">
                Positions, tailles, rotations, couleurs et contenus textes sont mis à jour.
              </p>
              {globalIdmlSource && (
                <p className="text-[10px] text-violet-400/60 mt-0.5">
                  Source : {globalIdmlSource.fileName}
                </p>
              )}
            </div>
          )}

          {/* Status */}
          {status === 'error' && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-sm text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleExport}
              disabled={status === 'exporting'}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 text-white rounded-xl transition-colors"
            >
              {status === 'exporting' && <Loader2 className="w-4 h-4 animate-spin" />}
              {status === 'done' && <CheckCircle className="w-4 h-4" />}
              {status === 'idle' || status === 'error' ? <Download className="w-4 h-4" /> : null}
              {status === 'exporting' ? 'Export...' : status === 'done' ? 'Téléchargé !' : 'Exporter'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
