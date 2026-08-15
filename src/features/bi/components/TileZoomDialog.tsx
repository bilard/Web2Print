// La tuile en grand, dans une fenêtre par-dessus le tableau.
//
// ⚠⚠ Le zoom agrandit la BOÎTE du visuel, il ne le met pas à l'échelle en CSS : un
// `transform: scale()` sur un graphe (canvas) grossit des pixels et rend un dessin flou,
// alors qu'agrandir le conteneur fait REDESSINER chart.js à la bonne taille. On défile
// ensuite dans le visuel agrandi — le défilement natif fait le déplacement.
//
// ⚠ Le nuage 3D n'a PAS ces boutons : il porte son propre zoom (molette) et sa rotation.
// Agrandir sa boîte ne ferait qu'éloigner la caméra du cadre.
import { useEffect, useState, type ReactNode } from 'react'
import { X, ZoomIn, ZoomOut, Minimize2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import type { TileKind } from '../types'

/** Paliers de zoom. ⚠ Des paliers plutôt qu'un continu : on retrouve le même cadrage d'une
 *  tuile à l'autre, et « 100 % » veut dire quelque chose. */
const STEPS = [100, 150, 200, 300, 400]

export function TileZoomDialog({ title, kind, onClose, children }: {
  title: string
  kind: TileKind
  onClose: () => void
  /** Le visuel, rendu une SECONDE fois : celui de la grille reste en place derrière. */
  children: ReactNode
}) {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  // Le nuage 3D se zoome à la molette dans sa propre scène : deux zooms concurrents sur le
  // même geste rendraient les deux inutilisables.
  const zoomable = kind !== 'scatter3d'
  const zoom = zoomable ? STEPS[step] : 100

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label={t('bi.zoom.close')} onClick={onClose}
        className="absolute inset-0 bg-black/60" />
      <div className="relative flex h-[92vh] w-[95vw] flex-col overflow-hidden rounded-xl
        border border-white/10 bg-surface shadow-2xl">
        <header className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
          <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">{title}</h2>
          {zoomable && (
            <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-well p-0.5">
              <button type="button" title={t('bi.zoom.out')} aria-label={t('bi.zoom.out')}
                onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
                className="rounded p-1.5 text-white/60 hover:bg-white/[0.06] hover:text-white
                  disabled:opacity-30 disabled:hover:bg-transparent">
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="w-11 text-center text-[11px] tabular-nums text-white/70">{zoom} %</span>
              <button type="button" title={t('bi.zoom.in')} aria-label={t('bi.zoom.in')}
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                disabled={step === STEPS.length - 1}
                className="rounded p-1.5 text-white/60 hover:bg-white/[0.06] hover:text-white
                  disabled:opacity-30 disabled:hover:bg-transparent">
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button type="button" title={t('bi.zoom.reset')} aria-label={t('bi.zoom.reset')}
                onClick={() => setStep(0)} disabled={step === 0}
                className="rounded p-1.5 text-white/60 hover:bg-white/[0.06] hover:text-white
                  disabled:opacity-30 disabled:hover:bg-transparent">
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <button type="button" onClick={onClose} aria-label={t('bi.zoom.close')}
            className="shrink-0 rounded p-1.5 text-white/50 hover:bg-white/[0.06] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </header>
        {/* ⚠ `overflow-auto` sur le cadre et taille en POURCENTAGE à l'intérieur : à 100 % le
            visuel remplit la fenêtre, au-delà il déborde et on défile dedans. */}
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div style={{ width: `${zoom}%`, height: `${zoom}%` }}>{children}</div>
        </div>
      </div>
    </div>
  )
}
