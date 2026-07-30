// Modal « Visuels (IA) » : génère les images produits (Nano Banana ou Higgsfield) depuis
// les colonnes ([Nom], [Description]…), les stocke dans le DAM Drive et écrit le lien
// dans la colonne image. Par défaut, seules les cellules vides sont générées.
import { useMemo, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useExcelStore } from '@/stores/excel.store'
import { useColumnImageGen, type ImageGenEngine } from './useColumnImageGen'
import { ImageGenTestPreview, ImageGenCounters, ImageGenLog, ImageGenUsage } from './ImageGenProgress'
import type { ExcelRow } from '@/features/excel/types'
import { t } from '@/lib/i18n'

interface Props { open: boolean; onClose: () => void; visibleRowIds: string[] }

export function ColumnImageGenModal({ open, onClose, visibleRowIds }: Props) {
  const sheets = useExcelStore((s) => s.sheets)
  const activeSheetIndex = useExcelStore((s) => s.activeSheetIndex)
  const sheet = sheets[activeSheetIndex]
  const { items, log, running, usage, runTest, runAll, abort, ensureTargetColumn } = useColumnImageGen()

  const imageCols = useMemo(() => (sheet?.columns ?? []).filter((c) => c.fieldType === 'image'), [sheet])
  const [engine, setEngine] = useState<ImageGenEngine>('nano')
  // Prompt par défaut : références adaptées aux labels réels des colonnes
  // (nom = colonne primaire ou nom/désignation ; description si présente).
  const [prompt, setPrompt] = useState(() => {
    const cols = sheet?.columns ?? []
    const nameCol = cols.find((c) => c.isPrimary) ?? cols.find((c) => /nom|d[ée]signation|libell[ée]|name|titre/i.test(c.label))
    const descCol = cols.find((c) => /desc/i.test(c.label))
    // ⚠ CAUSE RÉELLE des titres et listes de puces incrustés (« VISSEUIE »,
    // « BATIERIE ») : la DESCRIPTION injectée EST une liste de caractéristiques.
    // Reçue brute, le modèle la prend pour du contenu à afficher et la dessine.
    // Elle est donc explicitement cadrée comme une aide à l'IDENTIFICATION —
    // et le nom du produit n'est plus injecté dans une phrase de composition.
    return `Photo packshot professionnelle, produit SEUL au centre du cadre, sur fond blanc uni, éclairage studio, ombre portée douce, style catalogue e-commerce.\n\n`
      + `Produit à représenter : [${nameCol?.label ?? 'Nom'}]\n`
      + (descCol ? `Caractéristiques (elles servent UNIQUEMENT à savoir quel objet dessiner — ne les écris JAMAIS dans l'image) : [${descCol.label}]\n` : '')
      + `\nINTERDIT dans l'image : tout texte ajouté — titre, légende, liste à puces, caractéristiques, mesures, prix, logo plaqué, filigrane, cartouche. `
      + `Le seul lettrage acceptable est celui imprimé sur le produit lui-même (étiquette, marque), net et crédible. Rien d'autre que le produit dans le cadre.`
  })
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
    } catch (e) { toast.error(e instanceof Error ? e.message : t('tst.xl.testFailed')) }
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
            <label className="block mb-1 text-white/60">{t('xl.ai.instruction')}</label>
            <textarea
              value={prompt} onChange={(e) => { setPrompt(e.target.value); setTestSrc(null) }} rows={4}
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
            <span className="text-white/60">{t('xl.ai.scope')}</span>
            <label className="flex items-center gap-2">
              <input type="radio" checked={scopeAll} onChange={() => setScopeAll(true)} /> Toutes ({sheet.rows.length})
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={!scopeAll} onChange={() => setScopeAll(false)} /> Filtrées ({visibleRowIds.length})
            </label>
          </div>

          {testSrc && <ImageGenTestPreview src={testSrc} />}
          {items.length > 0 && <ImageGenCounters items={items} />}
          <ImageGenUsage usage={usage} />
          <ImageGenLog lines={log} />
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
          <div className="text-[12px] text-white/50">
            {running ? 'Génération en cours…' : `≈ ${toGenerate} visuel(s) à générer → DAM Drive / ${sheet.name}`}
          </div>
          <div className="flex items-center gap-2">
            {running ? (
              <button onClick={abort} className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white/80">{t('xl.ai.stop')}</button>
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
