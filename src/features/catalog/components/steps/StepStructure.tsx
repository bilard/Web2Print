// src/features/catalog/components/steps/StepStructure.tsx
// Étape 2 du wizard « Catalogue studio » : mapping des niveaux (Univers/Famille/
// Sous-famille), format de page, puis arbre de la taxonomie (renommable/réordonnable).
// L'arbre est TOUJOURS recalculé depuis rawRows+levelKeys+treeEdits — jamais stocké.
import { useMemo, useState } from 'react'
import { ArrowRight, Network, FileText, ListTree } from 'lucide-react'
import { useCatalogStore } from '@/stores/catalog.store'
import { buildCatalogTree } from '../../catalogTree'
import { CATALOG_FORMAT_PRESETS, type LevelKeys } from '../../catalogTypes'
import { StructureTreeNode } from './StructureTreeNode'
import { MmInput } from './MmInput'
import { LEVEL_STYLES } from './levelStyles'

const LEVEL_FIELDS: { key: keyof LevelKeys; label: string }[] = [
  { key: 'univers', label: 'Univers' },
  { key: 'famille', label: 'Famille' },
  { key: 'sousFamille', label: 'Sous-famille' },
]

const CUSTOM_ID = 'custom'

const selectClass = 'w-full px-3 py-1.5 rounded-md bg-surface-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-600'

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
    }
  }

  const rootIds = tree.map((n) => n.id)

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="grid gap-5 lg:grid-cols-[3fr_2fr] items-start">
          <section className="rounded-lg border border-border bg-surface p-4 space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Network className="w-4 h-4 text-indigo-400" /> Mapping des niveaux
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {LEVEL_FIELDS.map(({ key, label }, i) => (
                <div key={key} className="space-y-1">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`w-2 h-2 rounded-full ${LEVEL_STYLES[(i + 1) as 1 | 2 | 3].dot}`} /> {label}
                  </label>
                  <select value={levelKeys[key] ?? ''} onChange={(e) => updateLevel(key, e.target.value)} className={selectClass}>
                    <option value="">(aucun)</option>
                    {rawColumns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface p-4 space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <FileText className="w-4 h-4 text-indigo-400" /> Format de page
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              <select value={formatSelectValue} onChange={(e) => handleFormatSelect(e.target.value)} className="w-56 px-3 py-1.5 rounded-md bg-surface-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-600">
                {CATALOG_FORMAT_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                <option value={CUSTOM_ID}>Personnalisé</option>
              </select>
              {showCustom && (
                <div className="flex items-center gap-2">
                  <MmInput
                    value={format.widthMm}
                    onValueChange={(v) => setFormat({ ...format, widthMm: v })}
                  />
                  <span className="text-xs text-muted-foreground">mm ×</span>
                  <MmInput
                    value={format.heightMm}
                    onValueChange={(v) => setFormat({ ...format, heightMm: v })}
                  />
                  <span className="text-xs text-muted-foreground">mm</span>
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="rounded-lg border border-border bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <ListTree className="w-4 h-4 text-indigo-400" /> Arborescence
            </h2>
            <span className="text-xs text-muted-foreground">Double-clic : renommer · flèches : réordonner</span>
          </div>
          <div className="border border-border rounded-md bg-background/40 p-2">
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
    </div>
  )
}
