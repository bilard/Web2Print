import { useState, useEffect } from 'react'
import { Database, FileSpreadsheet, PenLine, Loader2, ChevronRight } from 'lucide-react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useRetailPromoStore } from '../retailPromo.store'
import { useRetailPromoSource } from '../useRetailPromoSource'
import { defaultPromoFieldMap } from '../promoMapping'
import { listPimProjects, type PimProjectSummary } from '@/features/merge/pimSource'

type Mode = 'choose' | 'pim' | 'excel' | 'manual'

interface SavedDataset { docId: string; fileName: string; totalRows: number }

interface ManualProduct { name: string; newPrice: string; oldPrice: string }

export function StepSource() {
  const user = useAuthStore((s) => s.user)
  const { setSource, setFieldMap, setStep } = useRetailPromoStore()
  const { connectPim, connectExcel, setManual, isLoading, error } = useRetailPromoSource()
  const [mode, setMode] = useState<Mode>('choose')
  const [pimProjects, setPimProjects] = useState<PimProjectSummary[]>([])
  const [datasets, setDatasets] = useState<SavedDataset[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [manualProduct, setManualProduct] = useState<ManualProduct>({ name: '', newPrice: '', oldPrice: '' })

  useEffect(() => {
    if (mode === 'pim' && user) {
      setLoadingItems(true)
      listPimProjects(user.uid).then(setPimProjects).finally(() => setLoadingItems(false))
    }
    if (mode === 'excel' && user) {
      setLoadingItems(true)
      getDocs(query(collection(db, 'excel_data'), where('userId', '==', user.uid)))
        .then((snap) => setDatasets(snap.docs.map((d) => ({
          docId: d.id,
          fileName: (d.data() as { fileName?: string }).fileName ?? d.id,
          totalRows: (d.data() as { totalRows?: number }).totalRows ?? 0,
        })).sort((a, b) => a.fileName.localeCompare(b.fileName))))
        .finally(() => setLoadingItems(false))
    }
  }, [mode, user])

  const handleSelectPim = async (p: PimProjectSummary) => {
    const result = await connectPim(p.id, p.name)
    setSource(result.sourceRef, result.columns, result.rows)
    setFieldMap(defaultPromoFieldMap(result.columns))
    setStep('mapping')
  }

  const handleSelectExcel = async (ds: SavedDataset) => {
    const result = await connectExcel(ds.docId, 0, ds.fileName)
    setSource(result.sourceRef, result.columns, result.rows)
    setFieldMap(defaultPromoFieldMap(result.columns))
    setStep('mapping')
  }

  const handleManualConfirm = () => {
    if (!manualProduct.name.trim()) return
    const result = setManual([manualProduct])
    setSource(result.sourceRef, result.columns, result.rows)
    setFieldMap(defaultPromoFieldMap(result.columns))
    setStep('mapping')
  }

  if (mode === 'choose') return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-white">Source des produits</h2>
      <p className="text-sm text-white/60">Choisissez d'où proviennent vos données produit.</p>
      <p className="text-xs text-white/40 -mt-2">Choisissez un dataset existant&nbsp;: chaque produit deviendra un visuel promo. Étapes&nbsp;: correspondance des champs → aperçu &amp; export PNG (ou ZIP).</p>
      {[
        { id: 'excel', icon: Database, label: 'Mes bases de données', desc: 'Vos catalogues du PIM (ex. Catalogue_GSB_2026, Scraping…)' },
        { id: 'manual', icon: PenLine, label: 'Saisie manuelle', desc: '1 produit pour tester rapidement' },
        { id: 'pim', icon: FileSpreadsheet, label: 'Projets PIM enrichis', desc: 'Collection pim_projects (avancé)' },
      ].map(({ id, icon: Icon, label, desc }) => (
        <button key={id} onClick={() => setMode(id as Mode)}
          className="flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-surface hover:bg-surface-2 transition-colors text-left">
          <Icon className="w-6 h-6 text-[#6366f1]" />
          <div className="flex-1">
            <p className="font-medium text-white">{label}</p>
            <p className="text-xs text-white/50">{desc}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-white/30" />
        </button>
      ))}
    </div>
  )

  if (mode === 'pim') return (
    <div className="flex flex-col gap-3">
      <button onClick={() => setMode('choose')} className="text-sm text-white/50 hover:text-white text-left">← Retour</button>
      <h2 className="text-lg font-semibold text-white">Catalogue PIM</h2>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {(isLoading || loadingItems) && <Loader2 className="w-5 h-5 animate-spin text-white/50" />}
      {pimProjects.map((p) => (
        <button key={p.id} onClick={() => void handleSelectPim(p)}
          className="p-3 rounded-lg border border-white/10 bg-surface hover:bg-surface-2 text-left text-white text-sm transition-colors">
          {p.name}
        </button>
      ))}
      {!loadingItems && pimProjects.length === 0 && (
        <div className="text-sm text-white/50 space-y-2">
          <p>Aucun projet PIM dans votre compte.</p>
          <button onClick={() => setMode('manual')} className="text-[#6366f1] hover:underline">→ Utiliser la saisie manuelle</button>
          <span className="text-white/30"> · </span>
          <button onClick={() => setMode('excel')} className="text-[#6366f1] hover:underline">→ Importer un Excel</button>
        </div>
      )}
    </div>
  )

  if (mode === 'excel') return (
    <div className="flex flex-col gap-3">
      <button onClick={() => setMode('choose')} className="text-sm text-white/50 hover:text-white text-left">← Retour</button>
      <h2 className="text-lg font-semibold text-white">Mes bases de données</h2>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {(isLoading || loadingItems) && <Loader2 className="w-5 h-5 animate-spin text-white/50" />}
      {datasets.map((ds) => (
        <button key={ds.docId} onClick={() => void handleSelectExcel(ds)}
          className="p-3 rounded-lg border border-white/10 bg-surface hover:bg-surface-2 text-left transition-colors">
          <p className="text-white text-sm font-medium">{ds.fileName}</p>
          <p className="text-white/40 text-xs">{ds.totalRows} lignes</p>
        </button>
      ))}
      {!loadingItems && datasets.length === 0 && <p className="text-white/40 text-sm">Aucune BDD importée.</p>}
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <button onClick={() => setMode('choose')} className="text-sm text-white/50 hover:text-white text-left">← Retour</button>
      <h2 className="text-lg font-semibold text-white">Saisie manuelle</h2>
      <input placeholder="Nom du produit *" value={manualProduct.name}
        onChange={(e) => setManualProduct((p) => ({ ...p, name: e.target.value }))}
        className="px-3 py-2 rounded-lg bg-well border border-white/10 text-white text-sm outline-none focus:border-[#6366f1]" />
      <input placeholder="Prix promo (ex: 12,99)" value={manualProduct.newPrice}
        onChange={(e) => setManualProduct((p) => ({ ...p, newPrice: e.target.value }))}
        className="px-3 py-2 rounded-lg bg-well border border-white/10 text-white text-sm outline-none focus:border-[#6366f1]" />
      <input placeholder="Prix barré (ex: 19,99)" value={manualProduct.oldPrice}
        onChange={(e) => setManualProduct((p) => ({ ...p, oldPrice: e.target.value }))}
        className="px-3 py-2 rounded-lg bg-well border border-white/10 text-white text-sm outline-none focus:border-[#6366f1]" />
      <button onClick={handleManualConfirm} disabled={!manualProduct.name.trim()}
        className="mt-2 px-4 py-2 rounded-lg bg-[#6366f1] text-[#fff] font-medium text-sm disabled:opacity-40 transition-opacity">
        Continuer
      </button>
    </div>
  )
}
