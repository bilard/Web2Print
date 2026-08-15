// Bandeau supérieur de l'écran BI : ce que je regarde, sur quelles données, dans quel mode.
//
// ⚠⚠ « Exporter » et « Partager » sont DÉSACTIVÉS et le disent (lot 4) : les afficher actifs
// pour ne rien faire au clic serait un mensonge, les cacher laisserait croire qu'ils
// n'existeront pas.
// ⚠ Le sélecteur de source arrive par une PROP plutôt que d'être construit ici : il porte le
// suivi de veille, le concurrent choisi et l'avancement d'un chargement lourd — des états qui
// appartiennent au tableau de bord, pas au bandeau.
import type { ReactNode } from 'react'
import { Share2, Download, Tv } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { BiPicker } from './BiPicker'
import { BiDocTitle } from './BiDocTitle'
import { BiModeSwitch } from './BiModeSwitch'
import { BiSoonButton } from './BiSoonButton'
import { BiExportMenu } from './BiExportMenu'
import { ageLabel } from '../engine/age'
import type { Dashboard } from '../types'

interface BiTopBarProps {
  current: Dashboard
  items: Dashboard[]
  canEdit: boolean
  onSelectBoard: (id: string) => void
  onRename: (name: string) => void
  /** `<SourcePicker …>` monté par `BiBoard`, qui possède seul le contexte de veille. */
  sourcePicker: ReactNode
  /** Fraîcheur de la donnée qui alimente les tuiles (ms epoch), `null` si rien n'est chargé. */
  updatedAt: number | null
  /** Horloge FOURNIE : le bandeau ne bat pas tout seul, sinon il re-rendrait tout l'écran. */
  now: number
  editing: boolean
  onToggleEdit: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  /** Le bouton « + Visuel » et le bouton de création, fournis par l'écran. */
  actions?: ReactNode
  /** Export du tableau en classeur. Absent = le bouton reste annoncé mais inactif. */
  onExport?: () => void
  /** Capture de l'écran tel quel. Fournis avec `onExport`, ils forment le menu d'export. */
  onExportPng?: () => Promise<void>
  onExportPdf?: () => Promise<void>
  /** Passage en mode TV (plein écran, pages défilantes). */
  onTv?: () => void
}

export function BiTopBar({
  current, items, canEdit, onSelectBoard, onRename, sourcePicker,
  updatedAt, now, editing, onToggleEdit, undo, redo, canUndo, canRedo, actions,
  onExport, onExportPng, onExportPdf, onTv,
}: BiTopBarProps) {
  const { t } = useTranslation()
  const boardOptions = items.map((d) => ({ id: d.id, label: d.name }))

  return (
    <header className="flex items-center gap-2.5 flex-wrap shrink-0 px-3 py-2 bg-surface border-b border-white/[0.06]">
      <BiDocTitle name={current.name} canEdit={canEdit} onRename={onRename} />

      {items.length > 1 && (
        <BiPicker
          label={t('bi.top.boardPicker')} value={current.id} options={boardOptions}
          onChange={onSelectBoard}
        />
      )}

      {sourcePicker}

      {/* Fraîcheur : un chiffre sans âge est invérifiable, y compris au niveau de l'écran. */}
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-well px-2 py-1 text-[11px] text-white/45">
        {updatedAt != null && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
        {updatedAt == null ? t('bi.status.noAge') : t('bi.status.age', { age: ageLabel(updatedAt, now) })}
      </span>

      <span className="flex-1" />

      <BiModeSwitch
        editing={editing} onToggleEdit={onToggleEdit} canEdit={canEdit}
        undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo}
      />
      {/* ⚠ Le bouton n'est actif que s'il y a quelque chose à exporter : un classeur vide
          se lirait comme un export raté. */}
      {onExport && onExportPng && onExportPdf ? (
        <BiExportMenu onXlsx={onExport} onPng={onExportPng} onPdf={onExportPdf} />
      ) : (
        <BiSoonButton label={t('bi.top.export')} icon={<Download className="w-3.5 h-3.5" />} />
      )}
      {/* ⚠ Le mode TV n'est proposé qu'en consultation : une page qui tourne toute seule
          pendant qu'on déplace une tuile ferait perdre le geste en cours. */}
      {onTv && !editing && (
        <button
          type="button" onClick={onTv} title={t('bi.top.tvTitle')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-well px-2.5 py-1 text-[12px] text-white/70 hover:text-white hover:border-white/15 transition-colors"
        >
          <Tv className="w-3.5 h-3.5" />{t('bi.top.tv')}
        </button>
      )}
      <BiSoonButton label={t('bi.top.share')} icon={<Share2 className="w-3.5 h-3.5" />} />
      {actions}
    </header>
  )
}
