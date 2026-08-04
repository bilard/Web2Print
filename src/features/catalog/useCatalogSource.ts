import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
// Connexion de la source (projet PIM ou dataset Excel legacy) : charge lignes+colonnes,
// auto-mappe champs fiche et niveaux taxonomiques, sélectionne tout par défaut.
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { listPimProjects, loadPimMergeData, makePimSourceRef, type PimProjectSummary } from '@/features/merge/pimSource'
import { listExcelDatasets, loadExcelMergeData, makeExcelSourceRef, type SavedDataset } from '@/features/merge/excelSource'
import { defaultPromoFieldMap, defaultCustomFields } from '@/features/retail-promo/promoMapping'
import type { DataSourceRef, MergeColumn, MergeRow } from '@/stores/merge.store'
import { guessLevelKeys } from './catalogTree'
import { useCatalogStore } from '@/stores/catalog.store'
import { t } from '@/lib/i18n'

/** Post-connect commun : source + sélection totale + auto-mapping + toast. */
function applyConnectedSource(sourceRef: DataSourceRef, columns: MergeColumn[], rows: MergeRow[]) {
  const s = useCatalogStore.getState()
  s.setSource(sourceRef, columns, rows)
  s.setSelectedRowIds(rows.map((r) => r._id))
  const fieldMap = defaultPromoFieldMap(columns)
  s.setFieldMap(fieldMap)
  useCatalogStore.setState({ fieldMapOverrides: {} })
  s.setCustomFields(defaultCustomFields(columns, fieldMap))
  s.setLevelKeys(guessLevelKeys(columns))
  toast.success(t('tst.cat.productsLoaded', { count: rows.length }))
}

export function useCatalogSource() {
  const [projects, setProjects] = useState<PimProjectSummary[]>([])
  const [datasets, setDatasets] = useState<SavedDataset[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    const uid = getWorkspaceUid()
    if (!uid) { setLoadingProjects(false); return }
    // allSettled : une panne isolée sur les datasets Excel (ou l'inverse) ne doit
    // pas vider la liste des projets PIM qui, elle, a réussi.
    Promise.allSettled([listPimProjects(uid), listExcelDatasets(uid)])
      .then(([proj, ds]) => {
        if (proj.status === 'fulfilled') setProjects(proj.value)
        else toast.error(String(proj.reason?.message ?? proj.reason))
        if (ds.status === 'fulfilled') setDatasets(ds.value)
        else toast.error(String(ds.reason?.message ?? ds.reason))
      })
      .finally(() => setLoadingProjects(false))
  }, [])

  const connect = async (projectId: string, projectName: string) => {
    setConnecting(true)
    try {
      const { columns, rows } = await loadPimMergeData(projectId)
      applyConnectedSource(makePimSourceRef(projectId, projectName), columns, rows)
    } catch (e) { toast.error(String((e as Error).message)) }
    finally { setConnecting(false) }
  }

  const connectExcelDataset = async (ds: SavedDataset) => {
    setConnecting(true)
    try {
      const { columns, rows } = await loadExcelMergeData(ds.docId, 0)
      applyConnectedSource(makeExcelSourceRef(ds.docId, 0, ds.fileName), columns, rows)
    } catch (e) { toast.error(String((e as Error).message)) }
    finally { setConnecting(false) }
  }

  return { projects, datasets, loadingProjects, connecting, connect, connectExcelDataset }
}
