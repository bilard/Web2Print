// src/features/catalog/useCatalogSource.ts
// Connexion de la source PIM : charge lignes+colonnes, auto-mappe champs fiche
// et niveaux taxonomiques, sélectionne tout par défaut.
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase/config'
import { listPimProjects, loadPimMergeData, makePimSourceRef, type PimProjectSummary } from '@/features/merge/pimSource'
import { defaultPromoFieldMap } from '@/features/retail-promo/promoMapping'
import { guessLevelKeys } from './catalogTree'
import { useCatalogStore } from '@/stores/catalog.store'

export function useCatalogSource() {
  const [projects, setProjects] = useState<PimProjectSummary[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) { setLoadingProjects(false); return }
    listPimProjects(uid).then(setProjects).catch((e) => toast.error(String(e?.message ?? e))).finally(() => setLoadingProjects(false))
  }, [])

  const connect = async (projectId: string, projectName: string) => {
    setConnecting(true)
    try {
      const { columns, rows } = await loadPimMergeData(projectId)
      const s = useCatalogStore.getState()
      s.setSource(makePimSourceRef(projectId, projectName), columns, rows)
      s.setSelectedRowIds(rows.map((r) => r._id))
      s.setFieldMap(defaultPromoFieldMap(columns))
      s.setLevelKeys(guessLevelKeys(columns))
      toast.success(`${rows.length} produits chargés`)
    } catch (e) { toast.error(String((e as Error).message)) }
    finally { setConnecting(false) }
  }

  return { projects, loadingProjects, connecting, connect }
}
