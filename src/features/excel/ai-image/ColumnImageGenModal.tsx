// src/features/excel/ai-image/ColumnImageGenModal.tsx
// Modal « Visuels (IA) » : génère les images produits (Nano Banana ou Higgsfield) depuis
// les colonnes ([Nom], [Description]…), les stocke dans le DAM Drive et écrit le lien
// dans la colonne image. Par défaut, seules les cellules vides sont générées.
import { useMemo, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useExcelStore } from '@/stores/excel.store'
import { useColumnImageGen, type ImageGenEngine } from './useColumnImageGen'
import { ImageGenTestPreview, ImageGenCounters } from './ImageGenProgress'
import type { ExcelRow } from '@/features/excel/types'

interface Props { open: boolean; onClose: () => void; visibleRowIds: string[] }

export function ColumnImageGenModal({ open, onClose, visibleRowIds }: Props) {
  const sheets = useExcelStore((s) => s.sheets)
  const activeSheetIndex = useExcelStore((s) => s.activeSheetIndex)
  const sheet = sheets[activeSheetIndex]
  const { items, running, runTest, runAll, abort, ensureTargetColumn } = useColumnImageGen()

  const imageCols = useMemo(() => (sheet?.columns ?? []).filter((c) => c.fieldType === 'image'), [sheet])
  const [engine, setEngine] = useState<ImageGenEngine>('nano')
  const [prompt, setPrompt] = useState('Photo packshot professionnelle du produit sur fond blanc, éclairage studio, style catalogue e-commerce : ')
  const [destKey, setDestKey] = useState<string>(imageCols[0]?.key ?? '__new__')
  const [onlyEmpty, setOnlyEmpty] = useState(true)
  const [scopeAll, setScopeAll] = useState(true)
  const [testSrc, setTestSrc] = useState<string | null>(null)

  const scopedRows: ExcelRow[] = useMemo(() => {
    if (!sheet) return []
    if (scopeAll) return sheet.rows
    const set = new Set(visibleRowIds)
    return sheet.rows.filter((r) => set.has(r._id))
  }, [sheet, scopeAll, visibleRowIds])

  const toGenerate = useMemo(() => {
    if (!onlyEmpty || destKey === '__new__') return scopedRows.length
    return scopedRows.filter((r) => { const v = r[destKey]; return v === null || v === undefined || String(v).trim() === '' }).length
  }, [scopedRows, destKey, onlyEmpty])

  if (!open || !sheet) return null

  const handleTest = async () => {
    try {
      setTestSrc(await runTest({ engine, prompt, rows: scopedRows, columns: sheet.columns, targetColKey: destKey, onlyEmpty }))
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Échec du test') }
  }
  const handleRun = async () => {
    const targetColKey = destKey === '__new__'
      ? ensureTargetColumn({ mode: 'new', label: 'Image (IA)' })
      : destKey
    if (destKey === '__new__') setDestKey(targetColKey)
    await runAll({ engine, prompt, rows: scopedRows, columns: sheet.columns, targetColKey, onlyEmpty, subFolder: sheet.name })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface border border-white/10 rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-white/90 font-medium">
            <ImagePlus className="w-4 h-4" /> Visuels produits (IA)
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white/90"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-[13px] text-white/80">
          <div className="flex items-center gap-4">
            <span className="text-white/60">Moteur</span>
            <label className="flex items-center gap-2">
              <input type="radio" checked={engine === 'nano'} onChange={() => setEngine('nano')} /> Nano Banana (Gemini)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={engine === 'higgsfield'} onChange={() => setEngine('higgsfield')} /> Higgsfield
            </label>
          </div>

          <div>
            <label className="block mb-1 text-white/60">Consigne (référencez vos colonnes avec [Nom])</label>
            <textarea
              value={prompt} onChange={(e) => { setPrompt(e.target.value); setTestSrc(null) }} rows={3}
              className="w-full bg-well border border-white/10 rounded p-2 text-white/90"
            />
            <div className="mt-1 flex flex-wrap gap-1">
              {sheet.columns.map((c) => (
                <button key={c.key} onClick={() => { setPrompt((p) => `${p}[${c.label}] `); setTestSrc(null) }}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-white/60 text-[12px]">
                  [{c.label}]
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-white/60">Colonne image</span>
            <select value={destKey} onChange={(e) => setDestKey(e.target.value)}
              className="bg-well border border-white/10 rounded px-2 py-0.5 text-white/90">
              {imageCols.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              <option value="__new__">+ Nouvelle colonne « Image (IA) »</option>
            </select>
          </div>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />
            Ne générer que les cellules vides (recommandé)
          </label>

          <div className="flex items-center gap-4">
            <span className="text-white/60">Portée</span>
            <label className="flex items-center gap-2">
              <input type="radio" checked={scopeAll} onChange={() => setScopeAll(true)} /> Toutes ({sheet.rows.length})
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={!scopeAll} onChange={() => setScopeAll(false)} /> Filtrées ({visibleRowIds.length})
            </label>
          </div>

          {testSrc && <ImageGenTestPreview src={testSrc} />}
          {items.length > 0 && <ImageGenCounters items={items} />}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
          <div className="text-[12px] text-white/50">
            {running ? 'Génération en cours…' : `≈ ${toGenerate} visuel(s) à générer → DAM Drive / ${sheet.name}`}
          </div>
          <div className="flex items-center gap-2">
            {running ? (
              <button onClick={abort} className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white/80">Arrêter</button>
            ) : (
              <>
                <button onClick={handleTest} disabled={!prompt.trim()}
                  className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white/80 disabled:opacity-40">
                  Tester (1 image)
                </button>
                <button onClick={handleRun} disabled={!prompt.trim() || toGenerate === 0}
                  className="px-3 py-1.5 rounded bg-accent text-[#fff] disabled:opacity-40">
                  Générer {toGenerate > 0 ? `(${toGenerate})` : ''}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
