// src/features/data-graph/FieldInspector.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { KeyRound, Link2, ArrowRight, X } from 'lucide-react'
import { DOMAIN_HEX, TABLES, type FieldSchema, type TableSchema } from './firestoreSchema'

interface OpenState {
  field: FieldSchema
  table: TableSchema
  rect: { left: number; right: number; top: number }
}

interface InspectorCtx {
  open: (field: FieldSchema, table: TableSchema, rect: OpenState['rect']) => void
}

const Ctx = createContext<InspectorCtx | null>(null)

/** Hook consommé par les cartes de table : ouvre la fiche « paramètres » d'un champ. */
export function useFieldInspector(): InspectorCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useFieldInspector hors de FieldInspectorProvider')
  return ctx
}

const POPOVER_W = 260

/** Fournit l'inspecteur de champ + rend la fiche flottante (position: fixed, donc
 *  insensible au zoom/overflow de ReactFlow). `onFocusTable` recadre une table FK. */
export function FieldInspectorProvider({
  children,
  onFocusTable,
}: {
  children: ReactNode
  onFocusTable: (id: string) => void
}) {
  const [state, setState] = useState<OpenState | null>(null)

  // Fermeture au clavier (Échap) et au scroll/zoom du diagramme.
  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setState(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state])

  return (
    <Ctx.Provider value={{ open: (field, table, rect) => setState({ field, table, rect }) }}>
      {children}
      {state && (
        <FieldPopover
          {...state}
          onClose={() => setState(null)}
          onFocusTable={(id) => {
            setState(null)
            onFocusTable(id)
          }}
        />
      )}
    </Ctx.Provider>
  )
}

const TYPE_LABEL: Record<FieldSchema['type'], string> = {
  string: 'Texte', number: 'Nombre', boolean: 'Booléen',
  timestamp: 'Horodatage', object: 'Objet (map)', array: 'Tableau (liste)',
}

function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 px-3 py-2">
      <span className="w-[72px] shrink-0 text-[10px] font-semibold uppercase tracking-wide text-white/35">{label}</span>
      <span className="min-w-0 flex-1 text-[12px] text-white/80">{children}</span>
    </div>
  )
}

function FieldPopover({ field, table, rect, onClose, onFocusTable }: OpenState & {
  onClose: () => void
  onFocusTable: (id: string) => void
}) {
  const hex = DOMAIN_HEX[table.domain]
  const fkTable = field.fk ? TABLES.find((t) => t.id === field.fk) : undefined

  // À droite du champ par défaut ; bascule à gauche s'il déborderait l'écran.
  const overflowsRight = rect.right + 8 + POPOVER_W > window.innerWidth
  const left = overflowsRight ? rect.left - 8 - POPOVER_W : rect.right + 8
  const top = Math.min(rect.top, window.innerHeight - 220)

  return (
    <>
      {/* Voile transparent : clic dehors = fermeture */}
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        className="fixed z-50 overflow-hidden rounded-xl border bg-surface shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
        style={{ left, top, width: POPOVER_W, borderColor: `${hex}66` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête : nom du champ + table d'appartenance */}
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: `${hex}1f` }}>
          <span className="flex-1 truncate font-mono text-[13px] font-bold text-white">{field.name}</span>
          <span className="shrink-0 font-mono text-[10px] text-white/40">{table.label}</span>
          <button onClick={onClose} title="Fermer" className="shrink-0 text-white/40 transition-colors hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="divide-y divide-white/[0.06]">
          <Prop label="Type"><span className="font-mono text-white/70">{field.type}</span> · {TYPE_LABEL[field.type]}</Prop>

          <Prop label="Clé">
            {field.pk ? (
              <span className="inline-flex items-center gap-1.5"><KeyRound className="h-3 w-3 text-amber-400" /> Clé primaire</span>
            ) : field.fk ? (
              <span className="inline-flex items-center gap-1.5"><Link2 className="h-3 w-3 text-indigo-400" /> Clé étrangère</span>
            ) : (
              <span className="text-white/35">—</span>
            )}
          </Prop>

          {fkTable && (
            <Prop label="Référence">
              <button
                onClick={() => onFocusTable(fkTable.id)}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-well px-2 py-1 font-mono text-[11px] text-white/80 transition-colors hover:border-white/25 hover:text-white"
              >
                {fkTable.label}
                <ArrowRight className="h-3 w-3" />
              </button>
            </Prop>
          )}

          {field.note && <Prop label="Note"><span className="text-white/55">{field.note}</span></Prop>}
        </div>
      </div>
    </>
  )
}
