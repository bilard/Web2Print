// Rail des vues, à gauche du canevas. Une seule vue existe — « Rapport » — et les quatre
// autres sont ANNONCÉES sans être feintes (`BiSoonButton` : désactivées, avec leur infobulle).
//
// ⚠ En consultation le rail disparaît : ses quatre entrées désactivées n'y seraient que du
// bruit, puisque la seule vue disponible est déjà celle qu'on regarde.
import { LayoutDashboard, Table2, Network, BellRing, CalendarClock } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { BiSoonButton } from './BiSoonButton'
import type { TranslationKey } from '@/lib/i18n'

const SOON: { key: TranslationKey; Icon: typeof Table2 }[] = [
  { key: 'bi.view.data', Icon: Table2 },
  { key: 'bi.view.model', Icon: Network },
  { key: 'bi.view.alerts', Icon: BellRing },
  { key: 'bi.view.schedule', Icon: CalendarClock },
]

export function BiViewRail() {
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('bi.view.rail')}
      className="flex flex-col items-center gap-1 shrink-0 w-[46px] py-2 bg-surface border-r border-white/[0.06]"
    >
      <button
        type="button" aria-pressed="true" title={t('bi.view.report')}
        className="w-8 h-8 grid place-items-center rounded-lg bg-indigo-500/15 text-indigo-400"
      >
        <LayoutDashboard className="w-4 h-4" />
      </button>
      {SOON.map(({ key, Icon }, i) => (
        <div key={key} className="contents">
          {/* Le trait sépare ce qui CONSTRUIT le rapport de ce qui le DIFFUSE. */}
          {i === 2 && <span className="w-[22px] h-px bg-white/[0.08] my-1.5" />}
          <BiSoonButton label={t(key)} iconOnly icon={<Icon className="w-4 h-4" />} />
        </div>
      ))}
    </nav>
  )
}
