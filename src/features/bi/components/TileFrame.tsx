// Cadre COMMUN à toutes les tuiles : titre, témoin de direct, âge de la donnée, états.
// ⚠ L'âge est affiché sur chaque tuile : un chiffre sans âge est invérifiable.
//
// ⚠⚠ L'âge BAT ici, dans le cadre, et surtout PAS dans `TileBody` (`DashboardGrid`) : c'est
// lui qui porte `useTileData`, et un état qui s'y rafraîchit relancerait l'agrégation de la
// tuile toutes les dix secondes. Le cadre ne sait rien de la donnée, il ne fait que compter.
import { useEffect, useState } from 'react'
import { TileSkeleton, TileEmpty, TileError, TileNotice } from './TileStates'
import { useTranslation } from '@/lib/i18n'
import type { BiMessage } from '../types'

/** Pas du battement de l'âge. Dix secondes : l'affichage passe à la seconde sous une minute,
 *  et rien de plus fin n'est lisible au-delà. */
const AGE_TICK_MS = 10_000

interface Props {
  title: string
  /** Dernière donnée reçue (ms epoch), `null` si rien n'est encore arrivé. */
  updatedAt: number | null
  /** La tuile est branchée sur un flux, par opposition à une photo datée. */
  live: boolean
  state: 'loading' | 'empty' | 'error' | 'ready'
  skeleton: 'chart' | 'table' | 'kpi'
  /**
   * Ce que la tuile a à DIRE. Selon l'état : la cause d'une erreur, la raison d'un cadre vide
   * (« ouvrez une base… ») — ou, sur une tuile qui rend bien des chiffres, la RÉSERVE qui les
   * accompagne (relevé incomplet).
   *
   * ⚠⚠ En état `ready`, il s'affiche AU-DESSUS du contenu et non à sa place : un total
   * sous-compté doit être lu avec son avertissement, pas remplacé par lui.
   * ⚠ Traduite ICI, au rendu : le moteur est pur et `useTileData` mémoïse — ni l'un ni
   * l'autre ne peut appeler `t` sans figer la langue ou casser la mémoïsation.
   */
  message?: BiMessage
  /** ⚠ Le bouton « retirer les filtres » ne retire que les filtres GLOBAUX : sans aucun, il
   *  ne ferait rien. Un booléen (primitif) plutôt que la liste : `TileBody` est mémoïsé. */
  hasFilters: boolean
  /** Mode édition de la grille : seul ce mode autorise le déplacement (`isDraggable`). */
  editing: boolean
  onRetry: () => void
  onClearFilters: () => void
  children: React.ReactNode
}

function ageLabel(updatedAt: number | null, now: number): string {
  if (updatedAt == null) return '—'
  const s = Math.max(0, Math.round((now - updatedAt) / 1000))
  if (s < 60) return `${s} s`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`
}

/**
 * Horloge du cadre. ⚠⚠ Sans elle, l'âge n'était calculé qu'au RENDU : une tuile stable
 * affichait « 0 s » indéfiniment. Un âge qui ne vieillit jamais est plus trompeur que pas
 * d'âge du tout — il certifie une fraîcheur qu'il n'a pas vérifiée.
 */
function useTickingNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    // Rien à faire vieillir tant qu'aucune donnée n'est arrivée : pas de minuterie inutile
    // sur les vingt tuiles d'un tableau en chargement.
    if (!enabled) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), AGE_TICK_MS)
    return () => clearInterval(id)
  }, [enabled])
  return now
}

export function TileFrame({
  title, updatedAt, live, state, skeleton, message, hasFilters, editing,
  onRetry, onClearFilters, children,
}: Props) {
  const { t } = useTranslation()
  const text = message === undefined ? undefined
    : message.kind === 'key' ? t(message.key, message.params) : message.text
  const now = useTickingNow(updatedAt != null)
  // ⚠ En consultation (`editing` faux), aucun déplacement n'est possible (`isDraggable`
  // reste faux côté grille) : l'affordance visuelle ne doit pas non plus l'annoncer, sous
  // peine d'un curseur « déplaçable » qui ment sur ce que le clic va faire.
  const handleClass = editing ? 'cursor-move bi-tile-handle' : ''
  return (
    <div className="h-full flex flex-col bg-surface rounded-lg border border-white/[0.06] overflow-hidden">
      <div className={`flex items-center gap-2 px-3 py-2 border-b border-white/[0.05] shrink-0 ${handleClass}`}>
        <h3 className="text-[12px] font-semibold text-white truncate flex-1">{title}</h3>
        {live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
        <span className="text-[10px] tabular-nums text-white/35 shrink-0" title={t('bi.tile.ageTitle')}>
          {ageLabel(updatedAt, now)}
        </span>
      </div>
      {/* ⚠ `min-h-0` : sans lui, un enfant flex refuse de rétrécir et c'est la PAGE qui
          s'allonge. Le débordement scrolle DANS la tuile. */}
      <div className="flex-1 min-h-0 overflow-auto p-3">
        {state === 'loading' ? <TileSkeleton kind={skeleton} />
          : state === 'error' ? <TileError message={text ?? ''} onRetry={onRetry} />
          : state === 'empty'
            ? <TileEmpty message={text} hasFilters={hasFilters} onClearFilters={onClearFilters} />
          : <>{text && <TileNotice text={text} />}{children}</>}
      </div>
    </div>
  )
}
