import { useState } from 'react'
import { Download, Image as ImageIcon, FileText, Presentation, Code2, Loader2, CheckCircle, Package, Shapes, Share2, LayoutGrid } from 'lucide-react'
import { CloseButton } from '@/components/shared/CloseButton'
import { useExportPng } from './useExportPng'
import { useExportPdf } from './useExportPdf'
import { useExportPptx } from './useExportPptx'
import { useExportHtml } from './useExportHtml'
import { useExportSvg } from './useExportSvg'
import { useExportIdml } from '@/features/idml/useExportIdml'
import { useExportSocialPack } from './useExportSocialPack'
import { useDeclineToPages } from './useDeclineToPages'
import { DECLINE_TARGETS } from './declineLayout'
import { globalIdmlSource } from '@/features/idml/idmlSource'
import { withProgress } from '@/stores/progress.store'
import { notify } from '@/lib/notify'
import type { PngDpi } from './useExportPng'
import { t } from '@/lib/i18n'

type Format = 'png' | 'pdf' | 'pptx' | 'html' | 'svg' | 'idml' | 'pack' | 'decline'
type ExportStatus = 'idle' | 'exporting' | 'done' | 'error'

interface ExportModalProps {
  onClose: () => void
}

const ALL_FORMATS: { id: Format; label: string; icon: React.ComponentType<{ className?: string }>; desc: string; color: string; idmlOnly?: boolean }[] = [
  { id: 'png',  label: 'PNG',       icon: ImageIcon,    desc: t('ex.png.desc'),  color: 'text-emerald-400' },
  { id: 'pdf',  label: 'PDF',       icon: FileText,     desc: 'Document imprimable',     color: 'text-red-400'     },
  { id: 'pptx', label: 'PowerPoint',icon: Presentation, desc: t('ex.pptx.desc'),  color: 'text-orange-400'  },
  { id: 'html', label: 'HTML',      icon: Code2,        desc: 'Dossier web complet',     color: 'text-sky-400'     },
  { id: 'svg',  label: 'SVG',       icon: Shapes,       desc: t('ex.svg.desc'),      color: 'text-purple-400'  },
  { id: 'idml', label: 'IDML',      icon: Package,      desc: t('ex.idml.desc'),        color: 'text-violet-400', idmlOnly: true },
  { id: 'pack', label: 'Pack social', icon: Share2,      desc: t('ex.pack.desc'), color: 'text-pink-400' },
  { id: 'decline', label: t('ex.decline.label'), icon: LayoutGrid, desc: t('ex.decline.desc'), color: 'text-cyan-400' },
]

export function ExportModal({ onClose }: ExportModalProps) {
  const hasIdmlSource = !!globalIdmlSource
  const formats = ALL_FORMATS.filter((f) => !f.idmlOnly || hasIdmlSource)

  const [format, setFormat] = useState<Format>('png')
  const [dpi, setDpi] = useState<PngDpi>(150)
  const [pdfWithMarks, setPdfWithMarks] = useState(false)
  const [declineTargets, setDeclineTargets] = useState<string[]>(DECLINE_TARGETS.map((t) => t.id))
  const [status, setStatus] = useState<ExportStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const { exportPng } = useExportPng()
  const { exportPdf } = useExportPdf()
  const { exportPptx } = useExportPptx()
  const { exportHtml } = useExportHtml()
  const { exportSvg } = useExportSvg()
  const { exportIdml } = useExportIdml()
  const { exportSocialPack } = useExportSocialPack()
  const { declineToPages } = useDeclineToPages()

  const handleExport = async () => {
    // « Pages déclinées » ne télécharge rien : crée des pages dans le document.
    if (format === 'decline') {
      const targets = DECLINE_TARGETS.filter((t) => declineTargets.includes(t.id))
      if (targets.length === 0) {
        setError('Sélectionne au moins un format.')
        setStatus('error')
        return
      }
      setStatus('exporting')
      setError(null)
      try {
        const { created, usedFallback } = await withProgress(
          'Adaptation IA des formats…',
          () => declineToPages(targets),
        )
        setStatus('done')
        const pages = `${created} page${created > 1 ? 's' : ''} ajoutée${created > 1 ? 's' : ''}`
        if (usedFallback) {
          notify.warning('Déclinaisons créées (repli géométrique)', `${pages} — adaptation IA indisponible, mise à l'échelle simple appliquée.`)
        } else {
          notify.success('Déclinaisons créées', `${pages} — réadaptées par IA, ajuste-les puis exporte.`)
        }
        setTimeout(onClose, 1500)
      } catch (err) {
        console.error(err)
        setError(String(err))
        setStatus('error')
        notify.error('Déclinaison échouée', String(err).slice(0, 160))
      }
      return
    }

    setStatus('exporting')
    setError(null)
    try {
      await withProgress(`Export ${format.toUpperCase()}…`, async () => {
        if (format === 'png') await exportPng(dpi)
        else if (format === 'pdf') await exportPdf({ withPrintMarks: pdfWithMarks })
        else if (format === 'pptx') await exportPptx()
        else if (format === 'html') await exportHtml()
        else if (format === 'svg') await exportSvg()
        else if (format === 'idml') await exportIdml()
        else if (format === 'pack') await exportSocialPack()
      })
      setStatus('done')
      notify.success(`Export ${format.toUpperCase()} terminé`, 'Fichier téléchargé.')
      setTimeout(onClose, 1500)
    } catch (err) {
      console.error(err)
      setError(String(err))
      setStatus('error')
      notify.error(`Export ${format.toUpperCase()} échoué`, String(err).slice(0, 160))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-indigo-400" />
            <h2 className="font-semibold text-white text-sm">Exporter</h2>
          </div>
          <CloseButton onClick={onClose} />
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
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">{t('ex.resolution')}</p>
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

          {/* Options Pages déclinées */}
          {format === 'decline' && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Formats</p>
              <div className="grid grid-cols-2 gap-2">
                {DECLINE_TARGETS.map((t) => {
                  const on = declineTargets.includes(t.id)
                  return (
                    <label
                      key={t.id}
                      className={`flex items-center gap-2 rounded-xl border p-3 cursor-pointer transition-colors ${
                        on ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-white/10 bg-white/3 hover:border-white/20'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          setDeclineTargets((prev) =>
                            e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id),
                          )
                        }
                        className="accent-cyan-500"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-white/80">{t.label}</p>
                        <p className="text-[10px] text-white/30">{t.w}×{t.h}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
              <p className="text-[11px] text-white/40 leading-relaxed">
                Crée une <span className="text-white/60">page éditable</span> par format : la mise en page est <span className="text-white/60">réadaptée automatiquement au ratio (IA)</span>, puis ajustable à la main avant export. Repli sur mise à l'échelle simple si l'IA est indisponible.
              </p>
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
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 text-[#fff] rounded-xl transition-colors"
            >
              {status === 'exporting' && <Loader2 className="w-4 h-4 animate-spin" />}
              {status === 'done' && <CheckCircle className="w-4 h-4" />}
              {status === 'idle' || status === 'error' ? (format === 'decline' ? <LayoutGrid className="w-4 h-4" /> : <Download className="w-4 h-4" />) : null}
              {format === 'decline'
                ? (status === 'exporting' ? 'Création...' : status === 'done' ? 'Créé !' : 'Créer les pages')
                : (status === 'exporting' ? 'Export...' : status === 'done' ? 'Téléchargé !' : 'Exporter')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
