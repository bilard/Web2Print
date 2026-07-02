// src/features/catalog/CatalogHome.tsx
// Section Dashboard du module : liste des catalogues + création.
// Le builder lui-même est plein écran sur /catalog/:id.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookText, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { deleteCatalog, listCatalogs, newCatalogDoc, saveCatalog, type CatalogSummary } from './catalogsApi'
import { useCatalogStore } from '@/stores/catalog.store'

export function CatalogHome() {
  const navigate = useNavigate()
  const [items, setItems] = useState<CatalogSummary[]>([])
  const [loading, setLoading] = useState(true)
  const reset = useCatalogStore((s) => s.reset)
  const hydrate = useCatalogStore((s) => s.hydrate)

  useEffect(() => {
    listCatalogs().then(setItems).catch((e) => toast.error(String(e?.message ?? e))).finally(() => setLoading(false))
  }, [])

  const createCatalog = async () => {
    try {
      const doc = newCatalogDoc('Nouveau catalogue')
      const id = await saveCatalog(doc)
      reset()
      hydrate(doc, id)
      navigate(`/catalog/${id}`)
    } catch (e) { toast.error(`Création impossible : ${String((e as Error).message)}`) }
  }

  const remove = async (id: string) => {
    await deleteCatalog(id)
    setItems((xs) => xs.filter((x) => x.id !== id))
    toast.success('Catalogue supprimé')
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white flex items-center gap-2"><BookText className="w-5 h-5 text-cyan-400" /> Catalogue studio</h1>
        <button onClick={createCatalog} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[#fff] text-sm font-medium">
          <Plus className="w-4 h-4" /> Nouveau catalogue
        </button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Chargement…</p> : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun catalogue. Créez le premier : sélection PIM → prompt → PDF.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id} className="flex items-center justify-between bg-surface rounded-lg px-4 py-3 hover:bg-surface-2">
              <button onClick={() => navigate(`/catalog/${c.id}`)} className="text-left flex-1">
                <span className="text-sm font-medium text-white">{c.name}</span>
                {c.updatedAt && <span className="ml-3 text-xs text-muted-foreground">{c.updatedAt.toLocaleDateString('fr-FR')}</span>}
              </button>
              <button onClick={() => remove(c.id)} className="p-2 text-muted-foreground hover:text-red-400" title="Supprimer">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
