import { Check, Loader2, AlertTriangle, Sparkles, X, Bug } from 'lucide-react'
import { useState } from 'react'
import type { Step } from './useGenerateDesign'
import type { DesignResult } from './types'
import type { DesignPlan } from './artDirectorSchema'
import { analyzeAndReport } from './analyzeSvgOverlaps'

interface Props {
  step: Step
  progress: string
  error: string | null
  lastResult: DesignResult | null
  lastPlan: DesignPlan | null
  nanobananaImage?: string
  onClose: () => void
  onRetry: () => void
}

interface StepDef {
  id: Exclude<Step, 'idle' | 'done' | 'error'>
  agent: string
  role: string
  description: string
}

const PIPELINE: StepDef[] = [
  {
    id: 'planning',
    agent: 'Art Director',
    role: 'Planification',
    description: 'Analyse du brief et composition de la structure visuelle (zones, typographie, palette, slots images).',
  },
  {
    id: 'illustrating',
    agent: 'SVG Engineer + Nano Banana',
    role: 'Génération',
    description: 'Construction du SVG vectoriel et génération des images IA des slots, en parallèle.',
  },
  {
    id: 'sanitizing',
    agent: 'Sanitizer',
    role: 'Validation',
    description: 'Nettoyage et validation du SVG pour assurer la compatibilité avec Fabric.js.',
  },
  {
    id: 'rendering',
    agent: 'Canvas',
    role: 'Rendu',
    description: 'Import du design sur le canvas, ajustement à la taille du document.',
  },
]

export function DesignProgress({ step, progress, error, lastResult, lastPlan, nanobananaImage, onClose, onRetry }: Props) {
  const [showDebug, setShowDebug] = useState(false)
  const [debugReport, setDebugReport] = useState<ReturnType<typeof analyzeAndReport> | null>(null)

  if (step === 'idle') return null

  const handleDebugSvg = () => {
    if (!lastResult?.svg) return
    try {
      const report = analyzeAndReport(lastResult.svg)
      setDebugReport(report)
      setShowDebug(true)

      // Aussi afficher le SVG brut dans la console
      console.group('[SVG Debug] Full SVG Output')
      console.log(lastResult.svg)
      console.log(`SVG Length: ${lastResult.svg.length} chars`)
      console.log(`Format: ${lastResult.widthMm} × ${lastResult.heightMm} mm (bleed: ${lastResult.bleedMm}mm)`)
      console.log(`Fonts used: ${lastResult.fontsUsed.join(', ')}`)
      console.log(`Palette: ${lastResult.palette.join(', ')}`)
      console.groupEnd()

      // Afficher le plan si disponible
      if (lastPlan) {
        console.group('[SVG Debug] Art Director Plan (Planned Zones)')
        console.log('Concept:', lastPlan.concept)
        console.log('Main Device:', lastPlan.mainDevice)
        console.table(
          lastPlan.zones.map((z) => ({
            'Zone ID': z.id,
            'Role': z.role,
            'X (mm)': z.bboxMm.x.toFixed(2),
            'Y (mm)': z.bboxMm.y.toFixed(2),
            'W (mm)': z.bboxMm.w.toFixed(2),
            'H (mm)': z.bboxMm.h.toFixed(2),
            'Fill': z.fill || 'transparent',
          }))
        )
        console.groupEnd()
      }
    } catch (err) {
      console.error('[DesignProgress] Debug analysis failed:', err)
    }
  }

  const handleExportSvg = () => {
    if (!lastResult?.svg) return
    const blob = new Blob([lastResult.svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'design.svg'
    a.click()
    URL.revokeObjectURL(url)
  }

  const guessErrorStep = (msg: string): StepDef['id'] => {
    if (msg.includes('Art Director')) return 'planning'
    if (msg.includes('SVG') || msg.includes('Nano')) return 'illustrating'
    if (msg.includes('Validation')) return 'sanitizing'
    return 'rendering'
  }
  const currentIdx = step === 'done'
    ? PIPELINE.length
    : step === 'error'
      ? Math.max(0, PIPELINE.findIndex((p) => p.id === guessErrorStep(error ?? progress ?? '')))
      : Math.max(0, PIPELINE.findIndex((p) => p.id === step))
  const pct = step === 'done' ? 100 : step === 'error' ? 0 : Math.round(((currentIdx + 0.5) / PIPELINE.length) * 100)

  const isRunning = step !== 'done' && step !== 'error'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-[#1a1a1a] border border-neutral-800 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800 bg-[#0f0f0f]">
          <div className="flex items-center gap-2">
            {step === 'done' ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : step === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-indigo-400" />
            )}
            <h2 className="text-sm font-medium text-neutral-100">
              {step === 'done' ? 'Design généré' : step === 'error' ? 'Génération échouée' : 'Génération en cours…'}
            </h2>
          </div>
          {!isRunning && (
            <button
              type="button"
              onClick={onClose}
              className="text-neutral-500 hover:text-neutral-200 transition-colors"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="px-5 pt-4 pb-3">
          <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ease-out ${
                step === 'error' ? 'bg-red-500' : step === 'done' ? 'bg-emerald-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-neutral-500">
            <span>{currentIdx + (step === 'done' ? 0 : 1)}/{PIPELINE.length}</span>
            <span>{pct}%</span>
          </div>
        </div>

        <ul className="px-5 pb-4 space-y-3 flex-1 overflow-y-auto">
          {PIPELINE.map((p, i) => {
            const isDone = step === 'done' || i < currentIdx
            const isActive = i === currentIdx && isRunning
            const isPending = !isDone && !isActive
            const failed = step === 'error' && i === currentIdx

            return (
              <li key={p.id} className="flex gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      failed
                        ? 'bg-red-500/20 ring-1 ring-red-500/50'
                        : isDone
                          ? 'bg-emerald-500/20 ring-1 ring-emerald-500/50'
                          : isActive
                            ? 'bg-indigo-500/20 ring-1 ring-indigo-500/50'
                            : 'bg-neutral-800 ring-1 ring-neutral-700'
                    }`}
                  >
                    {failed ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    ) : isDone ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : isActive ? (
                      <Loader2 className="w-3.5 h-3.5 text-indigo-300 animate-spin" />
                    ) : (
                      <span className="text-[10px] font-medium text-neutral-500">{i + 1}</span>
                    )}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-sm font-medium ${
                        isDone ? 'text-emerald-200' : isActive ? 'text-indigo-100' : failed ? 'text-red-300' : 'text-neutral-400'
                      }`}
                    >
                      {p.agent}
                    </span>
                    <span className="text-[11px] uppercase tracking-wide text-neutral-500">{p.role}</span>
                  </div>
                  <p className={`text-xs mt-0.5 ${isPending ? 'text-neutral-600' : 'text-neutral-400'}`}>
                    {p.description}
                  </p>
                  {isActive && progress && (
                    <p className="text-xs mt-1 text-indigo-300 italic">▸ {progress}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {nanobananaImage && (step === 'illustrating' || step === 'sanitizing' || step === 'rendering' || step === 'done') && (
          <div className="px-5 py-3 border-t border-neutral-800 bg-neutral-900">
            <p className="text-xs text-neutral-400 mb-2">📷 Référence créative (Nano Banana)</p>
            <img
              src={nanobananaImage}
              alt="Nano Banana reference"
              className="w-full rounded border border-neutral-700 object-contain max-h-96"
            />
          </div>
        )}

        {step === 'done' && lastResult && (
          <div className="px-5 py-3 border-t border-neutral-800 bg-emerald-500/5 space-y-1">
            <p className="text-xs text-emerald-300 font-medium">Design prêt sur le canvas</p>
            {lastResult.rationale && (
              <p className="text-[11px] text-neutral-400 leading-relaxed">{lastResult.rationale}</p>
            )}
            {(lastResult.slots?.length ?? 0) > 0 && (
              <p className="text-[11px] text-neutral-500">
                {lastResult.slots.length} slot(s) image à remplir manuellement
              </p>
            )}
            {lastPlan && (
              <p className="text-[10px] text-neutral-600">
                {lastPlan.zones?.length ?? 0} zones · {lastPlan.typography?.hierarchy?.length ?? 0} textes · {lastPlan.slots?.length ?? 0} slots images
              </p>
            )}
          </div>
        )}

        {step === 'error' && error && (
          <div className="px-5 py-3 border-t border-neutral-800 bg-red-500/5">
            <p className="text-xs text-red-300 leading-relaxed">{error}</p>
          </div>
        )}

        {showDebug && debugReport && (
          <div className="px-5 py-3 border-t border-neutral-800 bg-amber-500/5 space-y-2 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="text-xs text-amber-300 font-medium">SVG Debug Analysis</p>
              <button
                type="button"
                onClick={() => setShowDebug(false)}
                className="text-neutral-500 hover:text-neutral-200 text-xs"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] text-neutral-400">
                <span className="font-semibold">{debugReport.zones.length}</span> text zones détectées
              </p>
              {debugReport.zones.length > 0 && (
                <table className="w-full text-[9px] text-neutral-300">
                  <thead>
                    <tr className="border-b border-neutral-700">
                      <th className="text-left px-2 py-1 text-neutral-500">Zone</th>
                      <th className="text-left px-2 py-1 text-neutral-500">X</th>
                      <th className="text-left px-2 py-1 text-neutral-500">Y</th>
                      <th className="text-left px-2 py-1 text-neutral-500">W×H</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debugReport.zones.slice(0, 5).map((z) => (
                      <tr key={z.id} className="border-b border-neutral-800">
                        <td className="px-2 py-1 font-mono">{z.id.substring(0, 12)}</td>
                        <td className="px-2 py-1">{z.x.toFixed(1)}</td>
                        <td className="px-2 py-1">{z.y.toFixed(1)}</td>
                        <td className="px-2 py-1">{z.width.toFixed(1)}×{z.height.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {debugReport.overlaps.length > 0 ? (
                <div className="bg-red-500/10 border border-red-500/30 rounded p-2 mt-2">
                  <p className="text-red-300 font-semibold text-[10px] mb-1">⚠️ {debugReport.overlaps.length} chevauchement(s) détecté(s)</p>
                  {debugReport.overlaps.slice(0, 3).map((o, i) => (
                    <p key={i} className="text-[9px] text-red-200">
                      {o.zone1Id.substring(0, 10)} ↔ {o.zone2Id.substring(0, 10)} ({o.overlapArea.toFixed(1)}mm²)
                    </p>
                  ))}
                </div>
              ) : (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-2 mt-2">
                  <p className="text-emerald-300 text-[10px] font-semibold">✓ Aucun chevauchement détecté</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-800 bg-[#0f0f0f]">
          <div>
            {isRunning && (
              <span className="text-[11px] text-neutral-500">
                Ne ferme pas cette fenêtre pendant la génération
              </span>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            {step === 'done' && (
              <>
                {lastResult && (
                  <>
                    <button
                      type="button"
                      onClick={handleDebugSvg}
                      className="px-3 py-1.5 rounded border border-amber-700 text-amber-300 text-sm hover:bg-amber-500/10 transition-colors flex items-center gap-2"
                      title="Analyser le SVG pour les chevauchements"
                    >
                      <Bug className="w-3.5 h-3.5" />
                      Analyser
                    </button>
                    <button
                      type="button"
                      onClick={handleExportSvg}
                      className="px-3 py-1.5 rounded border border-neutral-700 text-neutral-300 text-sm hover:bg-neutral-800 transition-colors"
                      title="Télécharger le SVG brut"
                    >
                      Export SVG
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded border border-neutral-700 text-neutral-300 text-sm hover:bg-neutral-800 transition-colors"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-400 transition-colors"
                >
                  Voir le résultat
                </button>
              </>
            )}
            {step === 'error' && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded border border-neutral-700 text-neutral-300 text-sm hover:bg-neutral-800 transition-colors"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  onClick={onRetry}
                  className="px-3 py-1.5 rounded bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-400 transition-colors"
                >
                  Réessayer
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
