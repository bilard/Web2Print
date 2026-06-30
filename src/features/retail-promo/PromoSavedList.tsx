import { useEffect, useState } from 'react'
import { Loader2, Trash2, Plus, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { useRetailPromoStore } from './retailPromo.store'
import { listPromos, loadPromoPayload, deletePromo, type SavedPromoMeta } from './promosApi'

interface Props { onOpened: () => void; onNew: () => void }

/** Écran « Mes promos » : fiches enregistrées, ouverture et suppression. */
export function PromoSavedList({ onOpened, onNew }: Props) {
  const { setSource, setFieldMap, setConfig, setStep, setImgOverride } = useRetailPromoStore()
  const [promos, setPromos] = useState<SavedPromoMeta[] | null>(null)
  const [opening, setOpening] = useState<string | null>(null)

  useEffect(() => { void listPromos().then(setPromos) }, [])

  const open = async (p: SavedPromoMeta) => {
    setOpening(p.id)
    try {
      const payload = await loadPromoPayload(p.id)
      if (!payload) throw new Error('Données de la fiche introuvables')
      setConfig(p.config)
      setFieldMap(p.fieldMap)
      setSource(p.sourceRef ?? { excelDocId: `saved_${p.id}`, sheetIndex: 0, fileName: p.name }, payload.columns, payload.rows)
      setImgOverride(payload.imgOverride ?? {})
      setStep('template')
      onOpened()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Échec de l\'ouverture') } finally { setOpening(null) }
  }
  const remove = async (id: string) => {
    await deletePromo(id)
    setPromos((prev) => prev?.filter((p) => p.id !== id) ?? null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Mes promos</h2>
        <button onClick={onNew} className="flex items-center gap-2 rounded-lg bg-[#6366f1] px-3 py-2 text-sm font-medium text-[#fff] hover:bg-[#5457e5]">
          <Plus className="h-4 w-4" /> Nouvelle fiche
        </button>
      </div>

      {promos === null ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>
      ) : promos.length === 0 ? (
        <p className="py-12 text-center text-sm text-white/40">Aucune fiche enregistrée. Créez-en une, puis cliquez « Enregistrer la fiche » à l'étape Aperçu.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {promos.map((p) => (
            <div key={p.id} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-surface p-4">
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#818cf8]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{p.name}</div>
                  <div className="text-xs text-white/40">{p.rowCount} produit{p.rowCount > 1 ? 's' : ''}</div>
                </div>
                <button onClick={() => void remove(p.id)} title="Supprimer" className="text-white/30 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
              </div>
              <button onClick={() => void open(p)} disabled={opening === p.id}
                className="mt-1 flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-40">
                {opening === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Ouvrir
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
