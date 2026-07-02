// src/features/catalog/components/steps/StepStructure.tsx
// Étape 2 du wizard « Catalogue studio » : mapping des niveaux (Univers/Famille/
// Sous-famille), format de page, puis arbre de la taxonomie (renommable/réordonnable).
// L'arbre est TOUJOURS recalculé depuis rawRows+levelKeys+treeEdits — jamais stocké.
import { useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useCatalogStore } from '@/stores/catalog.store'
import { buildCatalogTree } from '../../catalogTree'
import { CATALOG_FORMAT_PRESETS, type LevelKeys } from '../../catalogTypes'
import { StructureTreeNode } from './StructureTreeNode'

const LEVEL_FIELDS: { key: keyof LevelKeys; label: string }[] = [
  { key: 'univers', label: 'Univers' },
  { key: 'famille', label: 'Famille' },
  { key: 'sousFamille', label: 'Sous-famille' },
]

const CUSTOM_ID = 'custom'
const MIN_MM = 50
const MAX_MM = 2000

function clampMm(v: number): number {
  if (Number.isNaN(v)) return MIN_MM
  return Math.min(MAX_MM, Math.max(MIN_MM, Math.round(v)))
}

const selectClass = 'w-full px-3 py-1.5 rounded-md bg-surface-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-600'
const inputClass = 'w-24 px-3 py-1.5 rounded-md bg-surface-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-600'

function MmInput({ value, onChange, onBlur, onKeyDown }: {
  value: string
  onChange: (v: string) => void
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className={inputClass}
    />
  )
}

export function StepStructure() {
  const rawColumns = useCatalogStore((s) => s.rawColumns)
  const rawRows = useCatalogStore((s) => s.rawRows)
  const selectedRowIds = useCatalogStore((s) => s.selectedRowIds)
  const levelKeys = useCatalogStore((s) => s.levelKeys)
  const treeEdits = useCatalogStore((s) => s.treeEdits)
  const format = useCatalogStore((s) => s.format)
  const setLevelKeys = useCatalogStore((s) => s.setLevelKeys)
  const setFormat = useCatalogStore((s) => s.setFormat)
  const setStep = useCatalogStore((s) => s.setStep)
  const [customMode, setCustomMode] = useState(false)
  const [draftW, setDraftW] = useState(String(format.widthMm))
  const [draftH, setDraftH] = useState(String(format.heightMm))

  const selectedRows = useMemo(() => {
    const ids = new Set(selectedRowIds)
    return rawRows.filter((r) => ids.has(r._id))
  }, [rawRows, selectedRowIds])

  const tree = useMemo(
    () => buildCatalogTree(selectedRows, rawColumns, levelKeys, treeEdits),
    [selectedRows, rawColumns, levelKeys, treeEdits],
  )

  const updateLevel = (key: keyof LevelKeys, value: string) => {
    const next: LevelKeys = { ...levelKeys }
    if (value) next[key] = value
    else delete next[key]
    setLevelKeys(next)
  }

  const matchedPreset = CATALOG_FORMAT_PRESETS.find(
    (p) => p.format.widthMm === format.widthMm && p.format.heightMm === format.heightMm,
  )
  const showCustom = customMode || !matchedPreset
  const formatSelectValue = showCustom ? CUSTOM_ID : (matchedPreset?.id ?? CUSTOM_ID)

  const handleFormatSelect = (value: string) => {
    if (value === CUSTOM_ID) { setCustomMode(true); return }
    const preset = CATALOG_FORMAT_PRESETS.find((p) => p.id === value)
    if (preset) {
      setCustomMode(false)
      setFormat(preset.format)
      setDraftW(String(preset.format.widthMm))
      setDraftH(String(preset.format.heightMm))
    }
  }

  const handleDimBlur = (dim: 'widthMm' | 'heightMm', draft: string) => {
    const n = Number(draft)
    if (Number.isNaN(n) || draft.trim() === '') {
      // Vide ou invalide → retomber sur la valeur courante
      if (dim === 'widthMm') setDraftW(String(format.widthMm))
      else setDraftH(String(format.heightMm))
    } else {
      // Nombre valide → clamper et appliquer
      const clamped = clampMm(n)
      setFormat({ ...format, [dim]: clamped })
      if (dim === 'widthMm') setDraftW(String(clamped))
      else setDraftH(String(clamped))
    }
  }

  const handleDimKeyDown = (dim: 'widthMm' | 'heightMm', draft: string, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
      handleDimBlur(dim, draft)
    }
  }

  const rootIds = tree.map((n) => n.id)

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 max-w-3xl mx-auto">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Mapping des niveaux</h2>
        <div className="grid grid-cols-3 gap-3">
          {LEVEL_FIELDS.map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <label className="text-xs text-muted-foreground">{label}</label>
              <select value={levelKeys[key] ?? ''} onChange={(e) => updateLevel(key, e.target.value)} className={selectClass}>
                <option value="">(aucun)</option>
                {rawColumns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Format de page</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={formatSelectValue} onChange={(e) => handleFormatSelect(e.target.value)} className="w-56 px-3 py-1.5 rounded-md bg-surface-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-600">
            {CATALOG_FORMAT_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            <option value={CUSTOM_ID}>Personnalisé</option>
          </select>
          {showCustom && (
            <div className="flex items-center gap-2">
              <MmInput
                value={draftW}
                onChange={setDraftW}
                onBlur={() => handleDimBlur('widthMm', draftW)}
                onKeyDown={(e) => handleDimKeyDown('widthMm', draftW, e)}
              />
              <span className="text-xs text-muted-foreground">mm ×</span>
              <MmInput
                value={draftH}
                onChange={setDraftH}
                onBlur={() => handleDimBlur('heightMm', draftH)}
                onKeyDown={(e) => handleDimKeyDown('heightMm', draftH, e)}
              />
              <span className="text-xs text-muted-foreground">mm</span>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-white">Arborescence</h2>
        <div className="border border-border rounded-md bg-surface p-2">
          {tree.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Aucun produit sélectionné.</p>
          ) : (
            tree.map((node, i) => (
              <StructureTreeNode key={node.id} node={node} siblingIds={rootIds} index={i} parentId="" depth={0} />
            ))
          )}
        </div>
      </section>

      <div className="flex justify-end pt-1">
        <button onClick={() => setStep('prompt')}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-[#fff] text-sm font-medium">
          Continuer → Prompt & style <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
