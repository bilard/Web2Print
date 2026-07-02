// src/pages/CatalogBuilderPage.tsx
// Builder plein écran d'un catalogue. Charge le doc, reconnecte la source PIM si
// besoin (les lignes ne sont pas persistées), puis rend l'étape active.
import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useCatalogStore } from '@/stores/catalog.store'
import { loadCatalog } from '@/features/catalog/catalogsApi'
import { isPimSource, loadPimMergeData, pimProjectIdFromSource } from '@/features/merge/pimSource'
import { useCatalogAutosave } from '@/features/catalog/useCatalogAutosave'
import { CatalogStepsNav } from '@/features/catalog/components/CatalogStepsNav'

const StepSource = lazy(() => import('@/features/catalog/components/steps/StepSource').then((m) => ({ default: m.StepSource })))
const StepStructure = lazy(() => import('@/features/catalog/components/steps/StepStructure').then((m) => ({ default: m.StepStructure })))
const StepPrompt = lazy(() => import('@/features/catalog/components/steps/StepPrompt').then((m) => ({ default: m.StepPrompt })))
const StepPreview = lazy(() => import('@/features/catalog/components/steps/StepPreview').then((m) => ({ default: m.StepPreview })))
const StepExport = lazy(() => import('@/features/catalog/components/steps/StepExport').then((m) => ({ default: m.StepExport })))

export default function CatalogBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const s = useCatalogStore()
  const { saving } = useCatalogAutosave()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!id) return
    const boot = async () => {
      if (s.catalogId !== id) {
        const doc = await loadCatalog(id)
        if (!doc) { toast.error('Catalogue introuvable'); navigate('/dashboard'); return }
        s.hydrate(doc, id)
      }
      const st = useCatalogStore.getState()
      if (st.sourceRef && st.rawRows.length === 0 && isPimSource(st.sourceRef)) {
        try {
          const { columns, rows } = await loadPimMergeData(pimProjectIdFromSource(st.sourceRef))
          st.setSource(st.sourceRef, columns, rows)
        } catch (e) { toast.error(`Source PIM indisponible : ${String((e as Error).message)}`) }
      }
      setReady(true)
    }
    void boot()
  }, [id])

  if (!ready) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Chargement du catalogue…</div>
  return (
    <div className="h-screen bg-background text-white flex flex-col">
      <header className="flex items-center gap-3 px-6 py-3 border-b border-border bg-surface">
        <button onClick={() => navigate('/dashboard', { state: { section: 'catalog' } })} className="p-2 rounded-md hover:bg-surface-2" title="Retour">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <input value={s.name} onChange={(e) => s.setName(e.target.value)}
          className="bg-transparent text-base font-semibold outline-none focus:bg-surface-2 rounded px-2 py-1 flex-1 max-w-md" />
        <span className="text-xs text-muted-foreground">{saving ? 'Enregistrement…' : 'Enregistré'}</span>
      </header>
      <CatalogStepsNav step={s.step} onStep={s.setStep} canLeave={s.rawRows.length > 0} />
      <main className="flex-1 min-h-0 overflow-hidden">
        <Suspense fallback={null}>
          {s.step === 'source' && <StepSource />}
          {s.step === 'structure' && <StepStructure />}
          {s.step === 'prompt' && <StepPrompt />}
          {s.step === 'preview' && <StepPreview />}
          {s.step === 'export' && <StepExport />}
        </Suspense>
      </main>
    </div>
  )
}
