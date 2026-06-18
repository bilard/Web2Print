// src/features/data-graph/useDataCounts.ts
import { useEffect, useState } from 'react'
import { usePimStore } from '@/stores/pim.store'
import { useExcelStore } from '@/stores/excel.store'
import { useAuthStore } from '@/stores/auth.store'
import { listWorkflows } from '@/features/workflows/persistence/workflowsApi'

/** Compteurs « live » des entités de données.
 *  ⚠️ Sémantique honnête : ce sont les éléments CHARGÉS en mémoire (projet/feuilles
 *  ouverts), pas des totaux Firestore globaux. `undefined` = non encore connu. */
export interface DataCounts {
  projects?: number
  sources?: number
  products?: number
  fields?: number
  taxonomies?: number
  sheets?: number
  columns?: number
  rows?: number
  workflows?: number
}

/** Agrège les compteurs depuis les stores hydratés + une lecture async des workflows
 *  (non bloquante : le graphe s'affiche, le compteur arrive après). */
export function useDataCounts(): DataCounts {
  const projects = usePimStore((s) => s.projects)
  const products = usePimStore((s) => s.products)
  const sheets = useExcelStore((s) => s.sheets)
  const uid = useAuthStore((s) => s.user?.uid)

  const [workflows, setWorkflows] = useState<number | undefined>(undefined)
  useEffect(() => {
    if (!uid) return
    let alive = true
    listWorkflows(uid)
      .then((wfs) => { if (alive) setWorkflows(wfs.length) })
      .catch(() => { if (alive) setWorkflows(undefined) })
    return () => { alive = false }
  }, [uid])

  const sources = projects.reduce((n, p) => n + p.sources.length, 0)
  const fieldKeys = new Set<string>()
  const taxoPaths = new Set<string>()
  for (const p of products) {
    for (const k of Object.keys(p.fields)) fieldKeys.add(k)
    if (p.taxonomyPath.length) taxoPaths.add(p.taxonomyPath.join(' / '))
  }
  const columns = sheets.reduce((n, s) => n + s.columns.length, 0)
  const rows = sheets.reduce((n, s) => n + s.rows.length, 0)

  return {
    projects: projects.length,
    sources,
    products: products.length,
    fields: fieldKeys.size,
    taxonomies: taxoPaths.size,
    sheets: sheets.length,
    columns,
    rows,
    workflows,
  }
}
