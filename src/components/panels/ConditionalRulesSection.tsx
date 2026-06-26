// src/components/panels/ConditionalRulesSection.tsx
//
// Panneau « Règles conditionnelles » de l'objet/calque sélectionné (façon
// EasyCatalog). Lit/écrit obj.data.conditionalRules, rejoue l'aperçu sur la
// ligne courante et persiste. Le moteur et l'applier vivent dans features/merge.
import { useEffect, useState } from 'react'
import { ChevronRight, GitBranch, Plus } from 'lucide-react'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { collectObjectsDeep } from '@/features/editor/deepObjects'
import { syncToStore } from '@/features/editor/useAddObject'
import { useMergeStore, type MergeColumn } from '@/stores/merge.store'
import { applyConditionalRulesForRow } from '@/features/merge/applyConditionalRules'
import { loadColumnsOnly } from '@/features/merge/loadColumns'
import { actionWithDefaults, type ConditionalRule } from '@/features/merge/conditionalRules'
import { ConditionalRuleRow } from './ConditionalRuleRow'

function newRuleId(): string {
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

/** Renseigne les paramètres d'action manquants (répare les règles « nues »
 *  enregistrées avant le correctif, ex. setColor sans color). */
function normalizeRules(rules: ConditionalRule[]): { rules: ConditionalRule[]; changed: boolean } {
  let changed = false
  const next = rules.map((r) => {
    const action = actionWithDefaults(r.action.type, r.action)
    if (JSON.stringify(action) !== JSON.stringify(r.action)) { changed = true; return { ...r, action } }
    return r
  })
  return { rules: next, changed }
}

export function ConditionalRulesSection({ selectedObjectId }: { selectedObjectId: string | null }) {
  const [open, setOpen] = useState(false)
  const [rules, setRules] = useState<ConditionalRule[]>([])
  const { columns, rows, currentRowIndex, fieldMap, isConnected } = useMergeStore()
  const savedDataSource = useMergeStore((s) => s.savedDataSource)

  // Champs disponibles pour les règles : ceux de la fusion live si connectée,
  // sinon le schéma de la dernière source connue (chargé sans aperçu). Permet de
  // configurer des règles — même sur un calque graphique — sans reconnexion.
  const [schemaColumns, setSchemaColumns] = useState<MergeColumn[]>([])
  useEffect(() => {
    if (columns.length || !savedDataSource) { setSchemaColumns([]); return }
    let cancelled = false
    loadColumnsOnly(savedDataSource)
      .then((cols) => { if (!cancelled) setSchemaColumns(cols) })
      .catch(() => { if (!cancelled) setSchemaColumns([]) })
    return () => { cancelled = true }
  }, [columns.length, savedDataSource])
  const availableColumns = columns.length ? columns : schemaColumns

  const canvas = globalFabricCanvas
  const obj = canvas && selectedObjectId
    ? collectObjectsDeep(canvas.getObjects()).find((o) => o.data?.id === selectedObjectId)
    : undefined

  // Recharger les règles quand la sélection change ; réparer au passage les
  // règles dont l'action n'a pas son paramètre (couleur/opacité/échelle).
  useEffect(() => {
    const sel = canvas && selectedObjectId
      ? collectObjectsDeep(canvas.getObjects()).find((o) => o.data?.id === selectedObjectId)
      : undefined
    const stored = (sel?.data?.conditionalRules as ConditionalRule[] | undefined) ?? []
    const { rules: normalized, changed } = normalizeRules(stored)
    setRules(normalized)
    if (changed && sel) {
      if (!sel.data) sel.data = {}
      sel.data.conditionalRules = normalized
      const { rows: r, currentRowIndex: idx, columns: c, fieldMap: fm, isConnected: conn } = useMergeStore.getState()
      if (canvas && conn && r[idx]) { applyConditionalRulesForRow(canvas, r[idx], c, fm); canvas.requestRenderAll() }
      if (canvas) canvas.fire('object:modified', { target: sel })
    }
  }, [selectedObjectId, canvas])

  if (!obj) return null

  const persist = (next: ConditionalRule[]) => {
    setRules(next)
    if (!obj.data) obj.data = {}
    obj.data.conditionalRules = next
    // Rejouer l'aperçu sur la ligne courante (effet immédiat dans l'éditeur).
    if (canvas && isConnected && rows[currentRowIndex]) {
      applyConditionalRulesForRow(canvas, rows[currentRowIndex], columns, fieldMap)
      canvas.requestRenderAll()
    }
    if (canvas) {
      syncToStore(canvas)
      // Marque « non sauvegardé » → l'autosave débouncé persiste (évite un
      // toObject complet par frappe / par drag du sélecteur de couleur).
      canvas.fire('object:modified', { target: obj })
    }
  }

  const addRule = () => persist([
    ...rules,
    {
      id: newRuleId(),
      field: availableColumns[0]?.key ?? '',
      operator: 'contains',
      value: '',
      action: { type: 'hide' },
    },
  ])

  // Conflit binding↔règle : une règle qui pilote une prop déjà câblée (fill via
  // binding + Changer la couleur) verrait sa restauration « ligne off » écrire
  // la couleur câblée de la ligne PRÉCÉDENTE. On avertit au lieu de le cacher.
  const bindings = (obj.data?.bindings as Record<string, string> | undefined) ?? {}
  const conflictProp =
    rules.some((r) => r.action.type === 'setColor') && bindings.fill ? 'couleur'
    : rules.some((r) => r.action.type === 'setOpacity') && bindings.opacity ? 'opacité'
    : null

  return (
    <section className="flex flex-col gap-2" data-tour="opt-prop-conditional">
      <div className="flex items-center gap-1">
        <button onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider hover:text-white/70 transition-colors">
          <ChevronRight className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} />
          <GitBranch className="w-3 h-3" /> Règles conditionnelles
          {rules.length > 0 && (
            <span className="text-indigo-400 normal-case">({rules.length})</span>
          )}
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-2">
          {!isConnected && availableColumns.length > 0 && (
            <p className="text-[10px] text-white/40 leading-snug">
              Les champs proviennent de « {savedDataSource?.fileName} ». Les règles s'évaluent
              à la fusion (reconnectez la source pour l'aperçu live).
            </p>
          )}
          {!isConnected && availableColumns.length === 0 && (
            <p className="text-[10px] text-white/40 leading-snug">
              Connectez une source de données pour choisir un champ et que les règles s'évaluent.
            </p>
          )}
          {conflictProp && (
            <p className="text-[10px] text-amber-400/80 leading-snug">
              ⚠ La {conflictProp} est aussi câblée à une colonne ; une règle qui la modifie
              peut entrer en conflit avec la liaison de données.
            </p>
          )}
          {rules.map((rule) => (
            <ConditionalRuleRow
              key={rule.id}
              rule={rule}
              columns={availableColumns}
              onChange={(next) => persist(rules.map((r) => (r.id === next.id ? next : r)))}
              onRemove={() => persist(rules.filter((r) => r.id !== rule.id))}
            />
          ))}
          <button onClick={addRule}
            className="flex items-center justify-center gap-1.5 text-[11px] text-indigo-400 hover:text-indigo-300 bg-well rounded py-1.5 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Ajouter une règle
          </button>
        </div>
      )}
    </section>
  )
}
