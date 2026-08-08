// Les entrées du rail qui ne désignent pas un concurrent : « Mon catalogue » et
// « Traduire et améliorer les textes ».
//
// ⚠ Elles sont EXCLUSIVES entre elles et avec le choix d'un concurrent — les trois vues
// occupent la même zone centrale. Grouper les deux boutons ici évite d'oublier une
// exclusion quand une troisième vue s'ajoutera : le composant ne connaît qu'un mode
// courant, il ne peut pas en laisser deux allumés.
import { Boxes, Languages } from 'lucide-react'
import { intlLocale, useTranslation } from '@/lib/i18n'

/** Vue centrale hors concurrent. `null` = on regarde un concurrent. */
export type ExplorerMode = 'catalog' | 'enrich' | null

export function ExplorerRailModes({ mode, catalogCount, onPick }: {
  mode: ExplorerMode
  /** Nombre de produits au catalogue, affiché en regard de l'entrée. */
  catalogCount: number
  onPick: (mode: ExplorerMode) => void
}) {
  const { t, locale } = useTranslation()

  const entry = (
    value: Exclude<ExplorerMode, null>,
    Icon: typeof Boxes,
    label: string,
    count?: number,
  ) => (
    <button type="button"
      // Recliquer l'entrée active revient au concurrent : une vue qu'on ne peut pas
      // refermer par où on l'a ouverte oblige à chercher la sortie.
      onClick={() => onPick(mode === value ? null : value)}
      className={`flex items-center gap-1.5 px-2.5 py-2 text-[11px] border-b border-white/[0.06] transition-colors ${
        mode === value ? 'bg-indigo-500/15 text-white' : 'text-white/55 hover:bg-white/[0.04] hover:text-white'
      }`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      {count != null && (
        <span className="ml-auto tabular-nums text-white/30">{count.toLocaleString(intlLocale(locale))}</span>
      )}
    </button>
  )

  return (
    <>
      {entry('catalog', Boxes, t('pwx.catalog.title'), catalogCount)}
      {entry('enrich', Languages, t('pwte.title'))}
    </>
  )
}
