import { useProgressStore } from '@/stores/progress.store'

/**
 * Barre de progression globale discrète (2 px, en haut de l'écran, accent indigo).
 * Visible tant qu'un traitement est en cours. Déterministe (largeur) si `progress`
 * est renseigné, sinon indéterminée (gradient glissant). Montée une fois dans App.
 */
export function TopProgressBar() {
  const active = useProgressStore((s) => s.active)
  const progress = useProgressStore((s) => s.progress)
  const visible = active > 0
  const determinate = progress !== null

  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-x-0 top-0 z-[100] h-0.5 pointer-events-none transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="relative h-full w-full overflow-hidden bg-indigo-500/10">
        {determinate ? (
          <div
            className="h-full bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.6)] transition-[width] duration-300 ease-out"
            style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
          />
        ) : (
          visible && (
            <div className="progress-indeterminate absolute top-0 h-full w-1/3 rounded-full bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.6)]" />
          )
        )}
      </div>
    </div>
  )
}
