// Volet « Filtres », en trois PORTÉES : le visuel, la page, le tableau de bord entier.
//
// ⚠⚠ Seule la portée « toutes les pages » a une réalité au contrat (`Dashboard.filters`) :
// elle est donc la seule à afficher quelque chose de vrai. Les deux autres sont des
// EMPLACEMENTS, et le disent — les peupler de faux filtres serait pire que de les laisser
// vides, puisqu'un filtre affiché mais inactif fausse la lecture de tous les chiffres.
import { useTranslation } from '@/lib/i18n'
import { BiPanel, BiEyebrow } from './BiPanel'
import type { FilterClause } from '../types'

/** Largeur reprise de la maquette validée. */
const WIDTH = 232

export function BiFiltersPanel({ hasSelection, globalFilters }: {
  /** Une tuile est sélectionnée : la portée « sur ce visuel » devient adressable. */
  hasSelection: boolean
  /** Filtres du tableau de bord — les seuls que le contrat porte aujourd'hui. */
  globalFilters: FilterClause[]
}) {
  const { t } = useTranslation()
  return (
    <BiPanel label={t('bi.panel.filters')} width={WIDTH} visibility="hidden xl:flex">
      <Scope label={t('bi.filters.onVisual')}>
        <Note text={hasSelection ? t('bi.well.drop') : t('bi.filters.pickVisual')} />
      </Scope>

      <Scope label={t('bi.filters.onPage')}>
        <Note text={t('bi.filters.pageSoon')} />
      </Scope>

      <Scope label={t('bi.filters.onAllPages')}>
        {globalFilters.length === 0
          ? <Note text={t('bi.filters.none')} />
          : globalFilters.map((f, i) => (
            // ⚠ L'index est une clé légitime ici : la liste est en LECTURE SEULE, elle n'est
            // ni réordonnée ni filtrée — c'est le constructeur qui lui donnera des gestes.
            <div key={`${f.field}:${i}`}
              className="rounded-lg border border-white/[0.06] bg-well px-2 py-1.5 flex items-center gap-2">
              <b className="text-[11.5px] font-semibold text-white truncate">{f.field}</b>
              <span className="ml-auto text-[11px] text-white/35 shrink-0">{f.op}</span>
            </div>
          ))}
      </Scope>
    </BiPanel>
  )
}

function Scope({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <BiEyebrow>{label}</BiEyebrow>
      {children}
    </div>
  )
}

function Note({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-white/[0.12] bg-well px-2 py-1.5 text-[11px] text-white/25 leading-snug">
      {text}
    </p>
  )
}
