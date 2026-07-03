// src/features/pim/linkedPublications.ts
// PIM = source unique de vérité : recense les PUBLICATIONS reliées à une source
// (catalogues + fiches promo) et fournit le rechargement des données fraîches.
import { listCatalogs } from '@/features/catalog/catalogsApi'
import { listPromos, refreshPromoData } from '@/features/retail-promo/promosApi'
import { isPimSource, loadPimMergeData, pimProjectIdFromSource } from '@/features/merge/pimSource'
import { loadExcelMergeData } from '@/features/merge/excelSource'
import type { DataSourceRef, MergeColumn, MergeRow } from '@/stores/merge.store'

/** Identité de la source ouverte dans la page Données. */
export type SourceIdent = { kind: 'pim'; projectId: string } | { kind: 'excel'; docId: string }

export interface LinkedPublications {
  /** Catalogues reliés — TOUJOURS à jour (ils relisent la source à l'ouverture). */
  catalogs: { id: string; name: string }[]
  /** Fiches promo reliées — stockent un instantané, à rafraîchir explicitement. */
  promos: { id: string; name: string }[]
}

function refMatches(ref: DataSourceRef | null, ident: SourceIdent): boolean {
  if (!ref) return false
  if (ident.kind === 'pim') return isPimSource(ref) && pimProjectIdFromSource(ref) === ident.projectId
  return !isPimSource(ref) && ref.excelDocId === ident.docId
}

export async function listLinkedPublications(ident: SourceIdent): Promise<LinkedPublications> {
  const [catalogs, promos] = await Promise.all([listCatalogs(), listPromos()])
  return {
    catalogs: catalogs.filter((c) => refMatches(c.sourceRef, ident)).map((c) => ({ id: c.id, name: c.name })),
    promos: promos.filter((p) => refMatches(p.sourceRef, ident)).map((p) => ({ id: p.id, name: p.name })),
  }
}

async function loadSourceData(ident: SourceIdent): Promise<{ columns: MergeColumn[]; rows: MergeRow[] }> {
  return ident.kind === 'pim' ? loadPimMergeData(ident.projectId) : loadExcelMergeData(ident.docId, 0)
}

/** Rafraîchit l'instantané des fiches promo sélectionnées avec les données fraîches de la source. */
export async function refreshPromos(ident: SourceIdent, promoIds: string[]): Promise<void> {
  if (promoIds.length === 0) return
  const { columns, rows } = await loadSourceData(ident)
  for (const id of promoIds) await refreshPromoData(id, columns, rows)
}
