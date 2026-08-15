// Cadre COMMUN à toutes les tuiles : titre, témoin de direct, âge de la donnée, états.
// ⚠ L'âge est affiché sur chaque tuile : un chiffre sans âge est invérifiable.
//
// ⚠⚠ L'âge BAT ici, dans le cadre, et surtout PAS dans `TileBody` (`DashboardGrid`) : c'est
// lui qui porte `useTileData`, et un état qui s'y rafraîchit relancerait l'agrégation de la
// tuile toutes les dix secondes. Le cadre ne sait rien de la donnée, il ne fait que compter.
import { Table2 } from 'lucide-react'
import { TileSkeleton, TileEmpty, TileError, TileNotice } from './TileStates'
import { useTranslation } from '@/lib/i18n'
import { ageLabel } from '../engine/age'
import { useTickingNow } from '../hooks/useTickingNow'
import type { BiMessage } from '../types'

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
  /** Tuile SÉLECTIONNÉE : c'est elle que les volets de droite décrivent et modifient. */
  selected: boolean
  /** Clic sur le cadre. ⚠ `pointerdown` et non `click` : le geste de déplacement avale le
   *  `click`, et une tuile qu'on vient de bouger doit rester celle que les volets décrivent. */
  onSelect: () => void
  /** Ouvre le détail : les LIGNES derrière le chiffre. Absent = la tuile n'en propose pas
   *  (rien à montrer tant qu'elle n'a pas de données). */
  onInspect?: () => void
  onRetry: () => void
  onClearFilters: () => void
  children: React.ReactNode
}

export function TileFrame({
  title, updatedAt, live, state, skeleton, message, hasFilters, editing, selected,
  onSelect, onInspect, onRetry, onClearFilters, children,
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
    <div
      onPointerDown={onSelect}
      className={`h-full flex flex-col bg-surface rounded-lg border overflow-hidden transition-colors ${
        selected ? 'border-indigo-500 ring-1 ring-indigo-500/70' : 'border-white/[0.06]'
      }`}
    >
      <div className={`flex items-center gap-2 px-3 py-2 border-b border-white/[0.05] shrink-0 ${handleClass}`}>
        <h3 className="text-[12px] font-semibold text-white truncate flex-1">{title}</h3>
        {/* ⚠ Le détail n'est proposé QUE sur une tuile qui rend des chiffres : ailleurs, le
            bouton ouvrirait un tiroir vide et se lirait comme une panne. */}
        {onInspect && state === 'ready' && (
          <button type="button" title={t('bi.detail.open')} aria-label={t('bi.detail.open')}
            /* ⚠ `stopPropagation` : le cadre entier sélectionne la tuile au `pointerdown`,
               et un tiroir qui s'ouvre ne doit pas en plus déplacer la sélection. */
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onInspect}
            className="shrink-0 p-1 rounded text-white/30 hover:text-white hover:bg-white/[0.06]">
            <Table2 className="w-3.5 h-3.5" />
          </button>
        )}
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
