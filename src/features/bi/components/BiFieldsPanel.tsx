// Volet « Champs » : ce que la source active offre, cherchable, typé.
//
// ⚠⚠ La liste est en LECTURE à ce stade — les champs ne se glissent pas encore. Le volet le
// DIT plutôt que de laisser un utilisateur tirer une ligne qui ne partira jamais.
// ⚠ La source est celle DÉRIVÉE de la feuille active (`effectivePimSource`), fournie par le
// tableau de bord : afficher le registre statique proposerait des colonnes que le moteur ne
// connaît pas.
import { useState } from 'react'
import { Search, Sigma, Type, Calendar, ToggleLeft } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { BiPanel, BiEyebrow } from './BiPanel'
import { biLabel } from './biLabel'
import type { DataSource, FieldKind } from '../registry/types'

/** Largeur reprise de la maquette validée. */
const WIDTH = 246

const KIND_ICON: Record<FieldKind, typeof Type> = {
  text: Type, number: Sigma, date: Calendar, bool: ToggleLeft,
}

export function BiFieldsPanel({ source }: { source: DataSource }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  // ⚠ Aucune mémoïsation ici, À DESSEIN : `t` est une fermeture RECRÉÉE à chaque rendu, et la
  // mettre en dépendance recalculerait quand même. Filtrer une centaine de libellés ne coûte
  // rien — ce volet ne porte aucun graphe, contrairement aux tuiles que la grille mémoïse.
  const q = query.trim().toLowerCase()
  const dimensions = source.dimensions
    .map((d) => ({ id: d.id, label: biLabel(d, t), kind: d.kind }))
    .filter((d) => !q || d.label.toLowerCase().includes(q))
  const measures = source.measures
    .map((m) => ({ id: m.id, label: biLabel(m, t) }))
    .filter((m) => !q || m.label.toLowerCase().includes(q))

  return (
    <BiPanel label={t('bi.panel.fields')} width={WIDTH} visibility="hidden lg:flex">
      <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-well px-2 py-1.5">
        <Search className="w-3 h-3 text-white/30 shrink-0" />
        <input
          type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={t('bi.fields.search')} aria-label={t('bi.fields.search')}
          className="flex-1 min-w-0 bg-transparent text-[11.5px] text-white/80 placeholder:text-white/25 focus:outline-none"
        />
      </div>

      <Group label={t('bi.fields.dimensions')}>
        {dimensions.map((d) => {
          const Icon = KIND_ICON[d.kind]
          return <Field key={d.id} label={d.label} icon={<Icon className="w-3 h-3 text-white/30" />} />
        })}
      </Group>

      <Group label={t('bi.fields.measures')}>
        {measures.map((m) => (
          <Field key={m.id} label={m.label} icon={<Sigma className="w-3 h-3 text-indigo-400" />} />
        ))}
      </Group>

      <p className="text-[11px] text-white/25 leading-snug">{t('bi.fields.dragSoon')}</p>
    </BiPanel>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <BiEyebrow>{label}</BiEyebrow>
      <div className="mt-1 flex flex-col">{children}</div>
    </div>
  )
}

function Field({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md px-1 py-1 text-[11.5px] text-white/55 hover:bg-white/[0.04]">
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  )
}
