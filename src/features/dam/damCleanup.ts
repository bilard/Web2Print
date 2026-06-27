// src/features/dam/damCleanup.ts
// Nettoyage DAM à la suppression d'un produit : déplace dans la corbeille Drive
// (récupérable) les images centralisées du produit supprimé qui ne sont
// référencées par AUCUN autre produit (anti-casse des images partagées). Ne
// touche QUE les références Drive (les URLs CDN ne nous appartiennent pas).
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { isDriveImageRef, extractDriveFileId } from './driveAssets'
import type { ExcelColumn, ExcelRow } from '@/features/excel/types'

const damDelete = httpsCallable<{ fileIds: string[] }, { trashed: number }>(functions, 'damDelete')

/** fileId Drive de toutes les cellules image/url d'une ligne (cellules multi-URLs incluses). */
function driveFileIdsOfRow(row: ExcelRow, columns: ExcelColumn[]): Set<string> {
  const ids = new Set<string>()
  for (const col of columns) {
    if (col.fieldType !== 'image' && col.fieldType !== 'url') continue
    const v = row[col.key]
    if (typeof v !== 'string' || !v) continue
    for (const tok of v.split(/\n| \| /)) {
      if (!isDriveImageRef(tok)) continue
      const id = extractDriveFileId(tok)
      if (id) ids.add(id)
    }
  }
  return ids
}

/**
 * Corbeille les assets Drive du produit supprimé non utilisés ailleurs.
 * Retourne le nombre déplacé en corbeille (0 si rien à faire). Non bloquant pour
 * l'appelant : la suppression du produit ne doit pas dépendre du succès Drive.
 */
export async function trashOrphanDamAssets(
  deletedRow: ExcelRow,
  columns: ExcelColumn[],
  otherRows: ExcelRow[],
): Promise<number> {
  const toTrash = driveFileIdsOfRow(deletedRow, columns)
  if (toTrash.size === 0) return 0
  for (const other of otherRows) {
    for (const id of driveFileIdsOfRow(other, columns)) toTrash.delete(id)
    if (toTrash.size === 0) return 0
  }
  const { data } = await damDelete({ fileIds: [...toTrash] })
  return data.trashed
}
