// Source PIM pour le moteur de merge (« re-skin de promo ») : les produits master
// d'un projet PIM deviennent les lignes du panneau Données. Changer de produit
// ré-applique tous les bindings du canvas (textes {{...}}, images src, couleurs)
// → re-skin instantané d'un flyer décomposé. Indépendant d'excel.store : aucune
// contamination de la BDD legacy (cf. piège dual-store).
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { DataSourceRef, MergeColumn, MergeRow } from '@/stores/merge.store'
import { pimProductsToSheet } from '@/features/pim/productToSheet'
import type { Product, Source } from '@/features/pim/types'
import { ENRICHMENT_ALIASES } from '@/features/excel/ai-enrichment/useSaveEnrichedProduct'
import { t } from '@/lib/i18n'

/** Les refs PIM réutilisent DataSourceRef avec un excelDocId préfixé `pim:`. */
const PIM_SOURCE_PREFIX = 'pim:'

export function isPimSource(source: DataSourceRef): boolean {
  return source.excelDocId.startsWith(PIM_SOURCE_PREFIX)
}

export function pimProjectIdFromSource(source: DataSourceRef): string {
  return source.excelDocId.slice(PIM_SOURCE_PREFIX.length)
}

export function makePimSourceRef(projectId: string, projectName: string): DataSourceRef {
  return { excelDocId: `${PIM_SOURCE_PREFIX}${projectId}`, sheetIndex: 0, fileName: `PIM · ${projectName}` }
}

export interface PimProjectSummary {
  id: string
  name: string
  path: string[]
}

/** Projets PIM de l'utilisateur (pour le picker du panneau Données). */
export async function listPimProjects(uid: string): Promise<PimProjectSummary[]> {
  const snap = await getDocs(query(collection(db, 'pim_projects'), where('userId', '==', uid)))
  return snap.docs
    .map((d) => {
      const data = d.data() as { name?: string; path?: string[] }
      return { id: d.id, name: data.name ?? d.id, path: data.path ?? [] }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Charge les produits master d'un projet PIM et les convertit en données de merge.
 * Réutilise pimProductsToSheet (union des champs + colonnes prioritaires en tête).
 */
export async function loadPimMergeData(
  projectId: string,
): Promise<{ columns: MergeColumn[]; rows: MergeRow[] }> {
  const snap = await getDocs(collection(db, 'pim_projects', projectId, 'products'))
  const products = snap.docs.map((d) => ({ ...(d.data() as Product), _id: d.id }))
  if (products.length === 0) {
    throw new Error(t('err.mg.noProduct'))
  }
  const sheet = pimProductsToSheet(products, [] as Source[])
  const columns: MergeColumn[] = sheet.columns.map((c) => ({
    key: c.key,
    label: c.label,
    fieldType: c.fieldType,
    aliases: ENRICHMENT_ALIASES[c.key],
  }))
  const rows: MergeRow[] = sheet.rows.map((r) => ({ ...r }))
  return { columns, rows }
}
