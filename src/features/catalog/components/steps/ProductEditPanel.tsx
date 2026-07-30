// Édition de la DATA d'un produit depuis l'Aperçu (double-clic sur une fiche) :
// formulaire riche sur toutes les colonnes, avec DEUX portées de sauvegarde —
// « Publication » (corrections propres à ce catalogue, rowOverrides) ou
// « Master » (écrit la source PIM/Excel : tous les canaux la verront).
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Database, FileOutput, Loader2, RotateCcw, Star, X } from 'lucide-react'
import { useCatalogStore } from '@/stores/catalog.store'
import { saveRowToMaster } from '../../masterWrite'
import { isImageValue, ProductImageField } from './ProductImageField'
import { t } from '@/lib/i18n'

interface Props {
  rowId: string
  onClose: () => void
}

const str = (v: unknown): string => (v == null ? '' : String(v))

export function ProductEditPanel({ rowId, onClose }: Props) {
  const rawRows = useCatalogStore((s) => s.rawRows)
  const rawColumns = useCatalogStore((s) => s.rawColumns)
  const fieldMap = useCatalogStore((s) => s.fieldMap)
  const overrides = useCatalogStore((s) => s.rowOverrides[rowId])
  const sourceRef = useCatalogStore((s) => s.sourceRef)
  const setRowOverride = useCatalogStore((s) => s.setRowOverride)
  const clearRowOverride = useCatalogStore((s) => s.clearRowOverride)
  const applyMasterPatch = useCatalogStore((s) => s.applyMasterPatch)
  const plan = useCatalogStore((s) => s.plan)
  const setPlan = useCatalogStore((s) => s.setPlan)
  // Vedette = présence dans les featuredIds du plan (grande carte + ruban).
  const isVedette = !!plan?.sections.some((sec) => sec.featuredIds?.includes(rowId))
  const toggleVedette = () => {
    if (!plan) return
    // On ne connaît pas ici la section taxonomique du produit : l'id est posé
    // sur TOUTES les sections — inerte hors de la sienne (le moteur ne teste
    // featuredIds que contre les produits du nœud), nettoyé au prochain plan.
    const sections = plan.sections.map((sec) => ({
      ...sec,
      featuredIds: isVedette
        ? (sec.featuredIds ?? []).filter((id) => id !== rowId)
        : [...new Set([...(sec.featuredIds ?? []), rowId])],
    }))
    setPlan({ ...plan, sections })
    toast.success(t(isVedette ? 'tst.cat.featuredOff' : 'tst.cat.featuredOn'))
  }
  const row = useMemo(() => rawRows.find((r) => r._id === rowId), [rawRows, rowId])
  // Colonnes MAPPÉES sur la fiche d'abord (nom, marque, prix…), puis le reste.
  const columns = useMemo(() => {
    const mapped = new Set(Object.values(fieldMap))
    return [...rawColumns].sort((a, b) => Number(mapped.has(b.key)) - Number(mapped.has(a.key)))
  }, [rawColumns, fieldMap])
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {}
    for (const c of rawColumns) d[c.key] = str(overrides?.[c.key] ?? row?.[c.key])
    return d
  })
  const [busy, setBusy] = useState(false)
  if (!row) return null

  /** Champs dont la valeur saisie diffère de la SOURCE (master actuel). */
  const diffVsSource = () => {
    const patch: Record<string, string> = {}
    for (const c of rawColumns) if (draft[c.key] !== str(row[c.key])) patch[c.key] = draft[c.key]
    return patch
  }
  const savePublication = () => {
    const patch: Record<string, string | null> = {}
    for (const c of rawColumns) {
      const cur = str(overrides?.[c.key] ?? '')
      const next = draft[c.key] === str(row[c.key]) ? '' : draft[c.key]
      if (next !== cur) patch[c.key] = next === '' ? null : next
    }
    setRowOverride(rowId, patch)
    toast.success(t('tst.cat.fixesSaved'))
    onClose()
  }
  const saveMaster = async () => {
    if (!sourceRef) { toast.error(t('tst.cat.noSource')); return }
    const patch = diffVsSource()
    if (Object.keys(patch).length === 0) { toast.info(t('tst.cat.noMasterChange')); return }
    setBusy(true)
    try {
      await saveRowToMaster(sourceRef, rowId, patch)
      applyMasterPatch(rowId, patch) // reflet immédiat sans re-fetch
      setRowOverride(rowId, Object.fromEntries(Object.keys(patch).map((k) => [k, null]))) // l'override ne masque plus le master
      toast.success(t('tst.cat.masterUpdated'))
      onClose()
    } catch (e) {
      toast.error(t('tst.cat.masterFailed', { message: String((e as Error).message).slice(0, 120) }))
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside className="w-[440px] h-full bg-surface border-l border-border flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white truncate">{str(row[fieldMap.name ?? '']) || 'Produit'}</h2>
            <p className="text-[11px] text-muted-foreground">{t('cat.product.editHint')}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-white"><X className="w-4 h-4" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {plan && (
            <label className="flex items-center gap-2 px-3 py-2 rounded-md bg-surface-2 border border-white/[0.06] text-xs text-white/85 cursor-pointer select-none"
              title={t('cat.product.featured')}>
              <input type="checkbox" checked={isVedette} onChange={toggleVedette} className="accent-indigo-600" />
              <Star className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              Ruban vedette (mise en avant dans ce catalogue)
            </label>
          )}
          {overrides && Object.keys(overrides).length > 0 && (
            <button onClick={() => { clearRowOverride(rowId); onClose() }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-xs">
              <RotateCcw className="w-3.5 h-3.5" /> Retirer les corrections publication ({Object.keys(overrides).length} champ·s) — revenir au master
            </button>
          )}
          {columns.map((c) => {
            const long = (draft[c.key] ?? '').length > 70 || (draft[c.key] ?? '').includes('\n')
            const overridden = overrides?.[c.key] != null
            const formula = c.fieldType === 'formula'
            return (
              <label key={c.key} className="block space-y-1">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  {c.label}
                  {overridden && <span className="px-1.5 rounded bg-amber-500/15 text-amber-400 text-[9px] uppercase tracking-wide">publication</span>}
                  {formula && <span className="px-1.5 rounded bg-surface-2 text-muted-foreground text-[9px] uppercase tracking-wide">formule</span>}
                </span>
                {/* Champ IMAGE : vignette résolue (DAM/Drive → blob) + lien vers l'asset, URL éditable dessous. */}
                {isImageValue(c.key, c.label, draft[c.key] ?? '') && <ProductImageField url={draft[c.key]} />}
                {long ? (
                  <textarea value={draft[c.key] ?? ''} rows={3} disabled={formula}
                    onChange={(e) => setDraft((d) => ({ ...d, [c.key]: e.target.value }))}
                    className="w-full px-2.5 py-1.5 rounded-md bg-surface-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-600 resize-y disabled:opacity-50" />
                ) : (
                  <input value={draft[c.key] ?? ''} disabled={formula}
                    onChange={(e) => setDraft((d) => ({ ...d, [c.key]: e.target.value }))}
                    className="w-full px-2.5 py-1.5 rounded-md bg-surface-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-600 disabled:opacity-50" />
                )}
              </label>
            )
          })}
        </div>
        <footer className="p-3 border-t border-border space-y-2 shrink-0">
          <button onClick={savePublication} disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-[#fff] text-sm font-medium"
            title="N'affecte que ce catalogue — la source (master) reste intacte">
            <FileOutput className="w-4 h-4" /> Enregistrer dans la publication
          </button>
          <button onClick={() => void saveMaster()} disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-indigo-500 text-indigo-300 hover:bg-indigo-600 hover:text-[#fff] disabled:opacity-50 text-sm font-medium"
            title={t('cat.product.writeSource')}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />} Enregistrer dans le Master
          </button>
        </footer>
      </aside>
    </div>
  )
}
