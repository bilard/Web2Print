// Volet « Champs » : ce que la source active offre, cherchable, typé — et GLISSABLE.
//
// ⚠ La source est celle DÉRIVÉE de la feuille active (`effectivePimSource`), fournie par le
// tableau de bord : afficher le registre statique proposerait des colonnes que le moteur ne
// connaît pas, et la tuile reconfigurée tomberait en erreur au premier calcul.
import { useState } from 'react'
import { Search, Sigma, Type, Calendar, ToggleLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
import { BiPanel, BiEyebrow } from './BiPanel'
import { BiDraggableField } from './BiDraggableField'
import { biLabel } from './biLabel'
import { groupMeasures } from '../registry/groupMeasures'
import { KIND_COLOR, AGG_COLOR, tinted } from './fieldColors'
import { bestWellFor } from '../builder/wellRules'
import { dropInWell } from '../builder/wellEdits'
import type { DraggedField } from '../builder/wells'
import type { DataSource, FieldKind } from '../registry/types'
import type { Tile } from '../types'

/** Largeur reprise de la maquette validée. */
const WIDTH = 246

const KIND_ICON: Record<FieldKind, typeof Type> = {
  text: Type, number: Sigma, date: Calendar, bool: ToggleLeft,
}

export function BiFieldsPanel({ source, tile, canEdit, onApply }: {
  source: DataSource
  /** Tuile sélectionnée — celle que le double-clic reconfigure. */
  tile: Tile | null
  canEdit: boolean
  onApply: (next: Tile) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  // ⚠ Aucune mémoïsation ici, À DESSEIN : `t` est une fermeture RECRÉÉE à chaque rendu, et la
  // mettre en dépendance recalculerait quand même. Filtrer une centaine de libellés ne coûte
  // rien — ce volet ne porte aucun graphe, contrairement aux tuiles que la grille mémoïse.
  const q = query.trim().toLowerCase()
  const keep = (label: string) => !q || label.toLowerCase().includes(q)
  const dimensions = source.dimensions
    .map((d) => ({ field: { role: 'dimension' as const, id: d.id, label: biLabel(d, t) }, kind: d.kind }))
    .filter((d) => keep(d.field.label))
  // ⚠⚠ Groupées par TYPE : une source de veille dérive plus de cent mesures, et à plat celle
  // qu'on cherche se perd entre deux voisines qui ne lui ressemblent pas.
  const measureGroups = groupMeasures(source.measures)
    .map((g) => ({
      ...g,
      fields: g.measures
        .map((m) => ({ role: 'measure' as const, id: m.id, label: biLabel(m, t) }))
        .filter((f) => keep(f.label)),
    }))
    // Un groupe vidé par la recherche disparaît : un intertitre sans rien dessous se lit
    // comme un résultat manquant.
    .filter((g) => g.fields.length > 0)

  /** Double-clic : la zone la plus probable. ⚠ Un refus se DIT — sans un mot, le double-clic
   *  se lit comme un geste sans effet, et l'utilisateur recommence. */
  const add = (field: DraggedField) => {
    if (!tile) { toast.info(t('bi.well.refuse.noSelection')); return }
    const well = bestWellFor(tile, field, source)
    if (!well) { toast.info(t('bi.fields.noWell')); return }
    onApply(dropInWell(tile, well, field, source))
  }

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
        {dimensions.map(({ field, kind }) => {
          const Icon = KIND_ICON[kind]
          return (
            <BiDraggableField
              key={field.id} field={field} disabled={!canEdit} onAdd={() => add(field)}
              /* ⚠ La teinte dit le TYPE : sur cent champs, elle remplace la lecture. */
              icon={<Icon className="w-3 h-3" style={{ color: KIND_COLOR[kind] }} />}
            />
          )
        })}
      </Group>

      {measureGroups.map((g) => (
        <Group key={g.key} label={`${t('bi.fields.measures')} · ${t(g.labelKey)}`}
          color={AGG_COLOR[g.key] ?? AGG_COLOR.declared}>
          {g.fields.map((field) => (
            <BiDraggableField
              key={field.id} field={field} disabled={!canEdit} onAdd={() => add(field)}
              icon={<Sigma className="w-3 h-3" style={{ color: AGG_COLOR[g.key] ?? AGG_COLOR.declared }} />}
            />
          ))}
        </Group>
      ))}

      <p className="text-[11px] text-white/25 leading-snug">{t('bi.fields.drag')}</p>
    </BiPanel>
  )
}

function Group({ label, children, color }: {
  label: string
  children: React.ReactNode
  /** Teinte de la famille : une pastille devant l'intertitre, et un liseré le long des
   *  champs. Sans elle, dix intertitres gris se ressemblent au défilement. */
  color?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <BiEyebrow>
        {color && (
          <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
            style={{ background: color }} />
        )}
        {label}
      </BiEyebrow>
      <div className="mt-1 flex flex-col border-l pl-1"
        style={{ borderColor: color ? tinted(color, '40') : 'transparent' }}>
        {children}
      </div>
    </div>
  )
}
