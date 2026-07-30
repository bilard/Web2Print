import { createContext, useContext, type ReactNode } from 'react'
import { KeyRound, Link2, ArrowRight, Table2, Eye } from 'lucide-react'
import { CloseButton } from '@/components/shared/CloseButton'
import { DOMAIN_HEX, TABLES, type FieldSchema, type TableSchema } from './firestoreSchema'
import { t } from '@/lib/i18n'

/** Ouvre le panneau de schéma (droite) pour une table ; `field` met un champ en surbrillance. */
type OpenSchema = (tableId: string, field?: string) => void
const Ctx = createContext<OpenSchema | null>(null)

export function SchemaPanelProvider({ value, children }: { value: OpenSchema; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Hook consommé par les cartes de table : ouvre le panneau schéma sur un champ. */
export function useOpenSchema(): OpenSchema {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useOpenSchema hors de SchemaPanelProvider')
  return ctx
}

const TYPE_LABEL: Record<FieldSchema['type'], string> = {
  string: 'Texte', number: 'Nombre', boolean: 'Booléen',
  timestamp: 'Horodatage', object: 'Objet (map)', array: 'Tableau (liste)',
}

function FieldCard({ f, hex, active, onFocusTable }: {
  f: FieldSchema
  hex: string
  active: boolean
  onFocusTable: (id: string) => void
}) {
  const fkTable = f.fk ? TABLES.find((t) => t.id === f.fk) : undefined
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 transition-colors ${active ? 'bg-white/[0.06]' : 'border-white/[0.07] bg-surface/40'}`}
      style={active ? { borderColor: `${hex}99`, boxShadow: `0 0 0 1px ${hex}55` } : undefined}
    >
      <div className="flex items-center gap-2">
        {f.pk && <span className="rounded bg-amber-500/90 px-1 py-0.5 text-[8px] font-bold tracking-wide text-[#1a1206]">PK</span>}
        {f.fk && <span className="rounded bg-indigo-500/90 px-1 py-0.5 text-[8px] font-bold tracking-wide text-[#fff]">FK</span>}
        <span className={`flex-1 truncate font-mono text-[13px] ${f.pk ? 'text-white underline decoration-dotted underline-offset-2' : 'text-white/85'}`}>
          {f.name}
        </span>
        <span className="shrink-0 font-mono text-[11px] italic text-white/40">{f.type}</span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/45">
        <span>{TYPE_LABEL[f.type]}</span>
        {f.pk && <span className="inline-flex items-center gap-1 text-amber-300/80"><KeyRound className="h-3 w-3" /> Clé primaire</span>}
        {fkTable && (
          <button
            onClick={() => onFocusTable(fkTable.id)}
            title={t('dg.goToTable', { table: fkTable.label })}
            className="inline-flex items-center gap-1 text-indigo-300/90 transition-colors hover:text-indigo-200"
          >
            <Link2 className="h-3 w-3" /> {fkTable.label} <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>

      {f.note && <p className="mt-1.5 text-[11px] leading-snug text-white/45">{f.note}</p>}
    </div>
  )
}

/** Panneau latéral droit : schéma complet d'une table (tous les champs, type, clé, FK, note).
 *  Lecture seule. `highlightField` surligne le champ cliqué ; FK → recadrage de la table cible. */
export function TableSchemaPanel({ table, highlightField, onClose, onFocusTable, onShowData }: {
  table: TableSchema
  highlightField?: string
  onClose: () => void
  onFocusTable: (id: string) => void
  onShowData: (id: string) => void
}) {
  const hex = DOMAIN_HEX[table.domain]
  const Icon = table.icon
  return (
    <div className="absolute right-0 top-0 bottom-0 z-20 flex w-[330px] flex-col border-l-2 bg-well shadow-[-12px_0_30px_rgba(0,0,0,0.4)]" style={{ borderColor: `${hex}99` }}>
      {/* En-tête */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3" style={{ background: `${hex}14` }}>
        <Icon className="h-4 w-4 shrink-0" style={{ color: hex }} />
        <span className="flex-1 truncate font-mono text-[14px] font-bold text-white">{table.label}</span>
        <CloseButton onClick={onClose} className="shrink-0" />
      </div>

      {/* Description + compteur */}
      <div className="shrink-0 border-b border-white/10 px-4 py-2.5">
        <p className="text-[11px] italic leading-snug text-white/45">{table.description}</p>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/35">
          <Table2 className="h-3 w-3" /> {table.fields.length} champ{table.fields.length > 1 ? 's' : ''}
        </div>
      </div>

      {/* Liste des champs */}
      <div className="flex-1 space-y-2 overflow-auto p-3">
        {table.fields.map((f) => (
          <FieldCard key={f.name} f={f} hex={hex} active={f.name === highlightField} onFocusTable={onFocusTable} />
        ))}
      </div>

      {/* Pied : ouvrir les données live */}
      {table.query && (
        <div className="shrink-0 border-t border-white/10 p-3">
          <button
            onClick={() => onShowData(table.id)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-500/90 py-2 text-[12px] font-semibold text-[#fff] transition-colors hover:bg-indigo-500"
          >
            <Eye className="h-3.5 w-3.5" /> Voir les données
          </button>
        </div>
      )}
    </div>
  )
}
