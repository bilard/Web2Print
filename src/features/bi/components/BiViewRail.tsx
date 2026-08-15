// Rail des vues, à gauche du canevas : le RAPPORT (les visuels) et les DONNÉES (les lignes).
//
// ⚠⚠ Trois autres entrées y figuraient, désactivées — modèle sémantique, alertes,
// planification. Annoncer ce qui n'existe pas encombre l'écran d'un choix qu'on ne peut pas
// faire, et la question « à quoi sert ce rail ? » se pose d'elle-même. Les alertes, elles,
// existent bel et bien : elles se règlent par TUILE, dans le volet des visualisations, là où
// se trouve la mesure qu'elles surveillent.
//
// ⚠ La vue « Données » n'est pas un doublon du rapport : c'est ce qui permet de VÉRIFIER un
// chiffre en le confrontant à ses lignes.
import { LayoutDashboard, Table2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import type { TranslationKey } from '@/lib/i18n'

export type BiView = 'report' | 'data'

const VIEWS: { id: BiView; key: TranslationKey; Icon: typeof Table2 }[] = [
  { id: 'report', key: 'bi.view.report', Icon: LayoutDashboard },
  { id: 'data', key: 'bi.view.data', Icon: Table2 },
]

export function BiViewRail({ view, onChange }: {
  view: BiView
  onChange: (v: BiView) => void
}) {
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('bi.view.rail')}
      className="flex flex-col items-center gap-1 shrink-0 w-[46px] py-2 bg-surface border-r border-white/[0.06]"
    >
      {VIEWS.map(({ id, key, Icon }) => (
        <button
          key={id} type="button" aria-pressed={view === id} title={t(key)}
          onClick={() => onChange(id)}
          className={`w-8 h-8 grid place-items-center rounded-lg transition-colors ${
            view === id
              ? 'bg-indigo-500/15 text-indigo-400'
              : 'text-white/35 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </nav>
  )
}
