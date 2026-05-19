import { useMemo, useState } from 'react'
import { Plus, X, Tag, ChevronDown, ChevronRight, Palette, Layers, RefreshCw, FolderTree, Sparkles, Loader2, StopCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useExcelStore } from '@/stores/excel.store'
import { FieldTypeIcon } from './FieldTypeIcon'
import { buildTaxonomyFromLevels, buildTaxNodesFromLevels, getLevelColor, getMaxLevel } from './taxonomyBuilder'
import { useCreateTaxonomy } from '@/features/taxonomy/useTaxonomyMutations'
import { useTaxonomies } from '@/features/taxonomy/useTaxonomies'
import { useBulkAttachToTaxonomy } from '@/features/taxonomy/useBulkAttachToTaxonomy'
import type { TaxonomyCategory, TaxonomyTag, TaxonomyLevelMap } from './types'

const TAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#64748b',
]

export function TaxonomyManager() {
  const {
    sheets, activeSheetIndex, currentFileName,
    addTaxonomyCategory, updateTaxonomyCategory, deleteTaxonomyCategory,
    addTaxonomyTag, deleteTaxonomyTag,
    setTaxonomyFromLevels,
  } = useExcelStore()
  const createTaxonomy = useCreateTaxonomy()
  const { data: taxonomies } = useTaxonomies()
  const bulkAttach = useBulkAttachToTaxonomy()
  const sheet = sheets[activeSheetIndex]
  const [newCatName, setNewCatName] = useState('')
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const [selectedTaxoId, setSelectedTaxoId] = useState<string>('')
  const [overwriteLinked, setOverwriteLinked] = useState(false)

  // Sélection par défaut : 1ʳᵉ taxonomie disponible. Évite un select vide qui
  // désactive le bouton sans raison apparente.
  const effectiveTaxoId = useMemo(() => {
    if (!taxonomies || taxonomies.length === 0) return ''
    if (selectedTaxoId && taxonomies.some((t) => t.id === selectedTaxoId)) return selectedTaxoId
    return taxonomies[0].id
  }, [taxonomies, selectedTaxoId])

  if (!sheet) return null

  const levels: TaxonomyLevelMap = sheet.taxonomyLevels ?? {}
  const maxLevel = getMaxLevel(levels)
  const taxoColKeys = Object.entries(levels).filter(([, v]) => v > 0)

  const handleSetLevel = (colKey: string, level: number) => {
    const newLevels = { ...levels }
    if (level === 0) {
      delete newLevels[colKey]
    } else {
      newLevels[colKey] = level
    }
    const taxonomy = buildTaxonomyFromLevels(sheet, newLevels)
    setTaxonomyFromLevels(activeSheetIndex, newLevels, taxonomy)
  }

  const handleRegenerateTaxonomy = () => {
    const taxonomy = buildTaxonomyFromLevels(sheet, levels)
    setTaxonomyFromLevels(activeSheetIndex, levels, taxonomy)
  }

  const handleSaveToTaxonomies = async () => {
    const taxNodes = buildTaxNodesFromLevels(sheet, levels)
    if (Object.keys(taxNodes).length === 0) {
      toast.error('Aucun niveau assigné')
      return
    }
    const name = currentFileName ?? sheet.name ?? 'Nouvelle taxonomie'
    try {
      await createTaxonomy.mutateAsync({ name, nodes: taxNodes })
      toast.success(`Taxonomie « ${name} » créée (${Object.keys(taxNodes).length} nœuds)`)
    } catch {
      toast.error('Erreur lors de la création de la taxonomie')
    }
  }

  const handleBulkAttach = async () => {
    if (!taxonomies || bulkAttach.running) return
    const target = taxonomies.find((t) => t.id === effectiveTaxoId)
    if (!target) {
      toast.error('Sélectionnez une taxonomie cible')
      return
    }
    if (sheet.rows.length === 0) {
      toast.info('Aucun produit à classer dans la feuille active')
      return
    }
    await bulkAttach.run(target, { minConfidence: 0.5, overwriteLinked })
  }

  const handleAddCategory = () => {
    if (!newCatName.trim()) return
    const cat: TaxonomyCategory = {
      id: `cat_${Date.now()}`,
      name: newCatName.trim(),
      color: TAG_COLORS[sheet.taxonomy.length % TAG_COLORS.length],
      tags: [],
    }
    addTaxonomyCategory(activeSheetIndex, cat)
    setNewCatName('')
  }

  const handleAddTag = (catId: string) => {
    if (!newTagName.trim()) return
    const cat = sheet.taxonomy.find((c) => c.id === catId)
    if (!cat) return
    const tag: TaxonomyTag = {
      id: `tag_${Date.now()}`,
      label: newTagName.trim(),
      color: cat.color,
    }
    addTaxonomyTag(activeSheetIndex, catId, tag)
    setNewTagName('')
  }

  return (
    <div className="flex flex-col gap-4">
      {/* === Section 1: Column-based taxonomy levels === */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          Niveaux
        </h3>
        <p className="text-[10px] text-white/30 -mt-1">
          Assignez un niveau aux colonnes pour creer la hierarchie
        </p>

        {/* Column list with level selectors */}
        <div className="flex flex-col gap-1">
          {[...sheet.columns]
            .sort((a, b) => {
              const la = levels[a.key] ?? 0
              const lb = levels[b.key] ?? 0
              if (la > 0 && lb > 0) return la - lb
              if (la > 0) return -1
              if (lb > 0) return 1
              return 0
            })
            .map((col) => {
            const lvl = levels[col.key] ?? 0
            const isTaxo = lvl > 0
            return (
              <div
                key={col.key}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-colors ${
                  isTaxo
                    ? 'bg-white/5 border-white/10 border-l-2'
                    : 'bg-white/[0.02] border-white/[0.04] hover:border-white/10'
                }`}
                style={isTaxo ? { borderLeftColor: getLevelColor(lvl) } : undefined}
              >
                <FieldTypeIcon type={col.fieldType} className="w-3 h-3 text-white/25 shrink-0" />
                <span className="text-[11px] text-white/60 flex-1 truncate">{col.label}</span>
                <select
                  value={lvl}
                  onChange={(e) => handleSetLevel(col.key, parseInt(e.target.value))}
                  className="bg-transparent border border-white/[0.08] rounded text-[10px] text-white/40 px-1 py-0.5 outline-none hover:border-white/20 cursor-pointer shrink-0"
                >
                  <option value={0}>—</option>
                  {Array.from({ length: maxLevel + 2 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>N{n}</option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>

        {/* Regenerate + Save buttons if levels are assigned */}
        {taxoColKeys.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <button
              onClick={handleRegenerateTaxonomy}
              className="flex items-center justify-center gap-1.5 text-[10px] px-2 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Regenerer la taxonomie
            </button>
            <button
              onClick={handleSaveToTaxonomies}
              disabled={createTaxonomy.isPending}
              className="flex items-center justify-center gap-1.5 text-[10px] px-2 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed border border-teal-500/20 text-teal-400 transition-colors"
              title="Créer une taxonomie dans la liste des Taxonomies"
            >
              <FolderTree className="w-3 h-3" />
              Créer dans Taxonomies
            </button>
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="border-t border-white/[0.06]" />

      {/* === Section: Auto-attach products to a global taxonomy === */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          Attachement IA
        </h3>
        <p className="text-[10px] text-white/30 -mt-1">
          Classe automatiquement les produits de la feuille dans une taxonomie
        </p>

        {!taxonomies || taxonomies.length === 0 ? (
          <p className="text-[11px] text-white/30 italic py-2">
            Aucune taxonomie disponible. Créez-en une ci-dessus ou depuis la page Taxonomies.
          </p>
        ) : (
          <>
            <select
              value={effectiveTaxoId}
              onChange={(e) => setSelectedTaxoId(e.target.value)}
              disabled={bulkAttach.running}
              className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white/80 outline-none focus:border-indigo-500/50 disabled:opacity-50"
            >
              {taxonomies.map((t) => {
                const count = Object.keys(t.nodes).length
                return (
                  <option key={t.id} value={t.id} className="bg-[#1a1a1a]">
                    {t.name} ({count} nœuds)
                  </option>
                )
              })}
            </select>

            <label className="flex items-center gap-2 text-[10px] text-white/45 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={overwriteLinked}
                onChange={(e) => setOverwriteLinked(e.target.checked)}
                disabled={bulkAttach.running}
                className="accent-indigo-500"
              />
              Réécrire les produits déjà classés
            </label>

            {!bulkAttach.running ? (
              <button
                onClick={handleBulkAttach}
                disabled={!effectiveTaxoId || sheet.rows.length === 0}
                className="flex items-center justify-center gap-1.5 text-[10px] px-2 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed border border-indigo-500/20 text-indigo-300 transition-colors"
                title={
                  sheet.rows.length === 0
                    ? 'La feuille active ne contient aucun produit'
                    : `Lancer la classification IA sur ${sheet.rows.length} produit(s)`
                }
              >
                <Sparkles className="w-3 h-3" />
                Lancer l'attachement ({sheet.rows.length})
              </button>
            ) : (
              <button
                onClick={bulkAttach.abort}
                className="flex items-center justify-center gap-1.5 text-[10px] px-2 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 transition-colors"
              >
                <StopCircle className="w-3 h-3" />
                Interrompre
              </button>
            )}

            {(bulkAttach.running || bulkAttach.progress.done > 0) && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[10px] text-white/45 tabular-nums">
                  <span className="flex items-center gap-1">
                    {bulkAttach.running && <Loader2 className="w-3 h-3 animate-spin" />}
                    {bulkAttach.progress.done} / {bulkAttach.progress.total}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-emerald-400/80">✓ {bulkAttach.progress.classified}</span>
                    {bulkAttach.progress.skipped > 0 && (
                      <span className="text-white/30">— {bulkAttach.progress.skipped}</span>
                    )}
                    {bulkAttach.progress.errors > 0 && (
                      <span className="text-red-400/70">⚠ {bulkAttach.progress.errors}</span>
                    )}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full bg-indigo-400/70 transition-all"
                    style={{
                      width: `${
                        bulkAttach.progress.total === 0
                          ? 0
                          : Math.round((bulkAttach.progress.done / bulkAttach.progress.total) * 100)
                      }%`,
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Separator */}
      <div className="border-t border-white/[0.06]" />

      {/* === Section 2: Manual taxonomy management === */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
            <Tag className="w-4 h-4 text-indigo-400" />
            Categories
          </h3>
          <span className="text-[10px] text-white/25">{sheet.taxonomy.length}</span>
        </div>

        {/* Add category */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
            placeholder="Nouvelle categorie..."
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/80 placeholder:text-white/30 outline-none focus:border-indigo-500/50"
          />
          <button
            onClick={handleAddCategory}
            className="p-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Category list */}
        <div className="flex flex-col gap-1">
          {sheet.taxonomy.map((cat) => (
            <div key={cat.id} className="border border-white/10 rounded-lg overflow-hidden">
              {/* Category header */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5">
                <button
                  onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}
                  className="text-white/40 hover:text-white/70"
                >
                  {expandedCat === cat.id ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </button>
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="text-xs text-white/70 flex-1 truncate">{cat.name}</span>
                <span className="text-[9px] text-white/25">{cat.tags.length}</span>

                {/* Color picker */}
                <div className="relative group">
                  <button className="p-0.5 text-white/20 hover:text-white/50">
                    <Palette className="w-3 h-3" />
                  </button>
                  <div className="hidden group-hover:flex absolute right-0 top-full mt-1 bg-[#1e1e1e] border border-white/15 rounded-lg p-1.5 gap-1 flex-wrap w-28 z-50 shadow-xl">
                    {TAG_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => updateTaxonomyCategory(activeSheetIndex, cat.id, { color })}
                        className="w-5 h-5 rounded-full border border-white/10 hover:scale-110 transition-transform"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => deleteTaxonomyCategory(activeSheetIndex, cat.id)}
                  className="p-0.5 text-white/20 hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {/* Tags */}
              {expandedCat === cat.id && (
                <div className="px-2.5 py-2 flex flex-col gap-2">
                  {/* Existing tags */}
                  <div className="flex flex-wrap gap-1">
                    {cat.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border"
                        style={{
                          backgroundColor: `${tag.color}20`,
                          borderColor: `${tag.color}40`,
                          color: tag.color,
                        }}
                      >
                        {tag.label}
                        <button
                          onClick={() => deleteTaxonomyTag(activeSheetIndex, cat.id, tag.id)}
                          className="hover:opacity-70"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>

                  {/* Add tag input */}
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={expandedCat === cat.id ? newTagName : ''}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTag(cat.id)}
                      placeholder="Ajouter un tag..."
                      className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white/70 placeholder:text-white/30 outline-none focus:border-indigo-500/40"
                    />
                    <button
                      onClick={() => handleAddTag(cat.id)}
                      className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 text-white/50 rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {sheet.taxonomy.length === 0 && (
            <p className="text-[11px] text-white/20 text-center py-3">
              Assignez des niveaux ci-dessus ou ajoutez une categorie manuellement
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
