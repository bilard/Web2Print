// Cadre COMMUN à toutes les tuiles : titre, témoin de direct, âge de la donnée, états.
// ⚠ L'âge est affiché sur chaque tuile : un chiffre sans âge est invérifiable.
//
// ⚠⚠ L'âge BAT ici, dans le cadre, et surtout PAS dans `TileBody` (`DashboardGrid`) : c'est
// lui qui porte `useTileData`, et un état qui s'y rafraîchit relancerait l'agrégation de la
// tuile toutes les dix secondes. Le cadre ne sait rien de la donnée, il ne fait que compter.
import { Table2, TriangleAlert, Trash2 } from 'lucide-react'
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
  /** Teinte d'identité de la tuile (stable, cf. `accentOf`). */
  accent?: string
  /** Seuil franchi : la tuile s'entoure d'ambre et le DIT. ⚠ Un simple changement de couleur
   *  ne suffit pas — il faut pouvoir lire pourquoi, sans survol ni clic. */
  alert?: { label: string } | null
  /** Clic sur le cadre. ⚠ `pointerdown` et non `click` : le geste de déplacement avale le
   *  `click`, et une tuile qu'on vient de bouger doit rester celle que les volets décrivent. */
  onSelect: () => void
  /** Ouvre le détail : les LIGNES derrière le chiffre. Absent = la tuile n'en propose pas
   *  (rien à montrer tant qu'elle n'a pas de données). */
  onInspect?: () => void
  /** Suppression de la tuile. ⚠ N'apparaît qu'en ÉDITION : en consultation, un bouton qui
   *  détruit à un pixel du bouton qui explore serait un piège. */
  onRemove?: () => void
  onRetry: () => void
  onClearFilters: () => void
  children: React.ReactNode
}

export function TileFrame({
  title, updatedAt, live, state, skeleton, message, hasFilters, editing, selected,
  onSelect, onInspect, onRemove, onRetry, onClearFilters, alert, accent, children,
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
        selected ? 'border-indigo-500 ring-1 ring-indigo-500/70'
          : alert ? 'border-amber-500/60 ring-1 ring-amber-500/30' : 'border-white/[0.06]'
      }`}
    >
      {/* Filet d'identité : deux pixels de couleur en tête de tuile. C'est ce qui distingue
          une page de vingt cadres gris d'un tableau de bord qu'on lit. */}
      <span className="block h-[2px] shrink-0" style={{ background: accent ?? 'transparent' }} />
      <div className={`flex items-center gap-2 px-3 py-2 border-b border-white/[0.05] shrink-0 ${handleClass}`}>
        <h3 className="text-[12px] font-semibold text-white truncate flex-1">{title}</h3>
        {alert && (
          <span title={alert.label}
            className="shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-amber-500/15 text-amber-300 text-[10px] tabular-nums max-w-[55%]">
            <TriangleAlert className="w-3 h-3 shrink-0" />
            <span className="truncate">{alert.label}</span>
          </span>
        )}
        {/* ⚠ Le détail n'est proposé QUE sur une tuile qui rend des chiffres : ailleurs, le
            bouton ouvrirait un tiroir vide et se lirait comme une panne. */}
        {onInspect && state === 'ready' && (
          <button type="button" title={t('bi.detail.open')} aria-label={t('bi.detail.open')}
            /* ⚠ `stopPropagation` : le cadre entier sélectionne la tuile au `pointerdown`,
               et un tiroir qui s'ouvre ne doit pas en plus déplacer la sélection. */
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onInspect}
            className="bi-no-drag shrink-0 p-1 rounded text-white/30 hover:text-white hover:bg-white/[0.06]">
            <Table2 className="w-3.5 h-3.5" />
          </button>
        )}
        {editing && onRemove && (
          <button type="button" title={t('bi.tile.remove')} aria-label={t('bi.tile.remove')}
            /* ⚠ `stopPropagation` : le cadre sélectionne la tuile au `pointerdown`, et la
               poignée de déplacement l'entoure — sans cela, viser la corbeille amorcerait
               un glissement. */
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onRemove}
            className="bi-no-drag shrink-0 p-1 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10">
            <Trash2 className="w-3.5 h-3.5" />
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
