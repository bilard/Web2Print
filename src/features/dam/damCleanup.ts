// src/features/dam/damCleanup.ts
// Nettoyage DAM à la suppression d'un produit : déplace dans la corbeille Drive
// (récupérable) les images centralisées du produit supprimé qui ne sont
// référencées par AUCUN autre produit (anti-casse des images partagées). Ne
// touche QUE les références Drive (les URLs CDN ne nous appartiennent pas).
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { isDriveImageRef, extractDriveFileId } from './driveAssets'
import type { ExcelColumn, ExcelRow, ExcelSheet } from '@/features/excel/types'

const damDelete = httpsCallable<{ fileIds: string[]; op?: 'trash' | 'restore' | 'delete' }, { trashed: number }>(functions, 'damDelete')

async function driveFileOp(fileIds: string[], op: 'trash' | 'restore' | 'delete'): Promise<number> {
  const ids = fileIds.filter((x) => typeof x === 'string' && x.length > 0)
  if (ids.length === 0) return 0
  const { data } = await damDelete({ fileIds: ids, op })
  return data.trashed
}

/** Déplace des fichiers Drive dans la corbeille (récupérable). */
export function trashDriveFiles(fileIds: string[]): Promise<number> {
  return driveFileOp(fileIds, 'trash')
}

/** Sort des fichiers de la corbeille Drive. */
export function restoreDriveFiles(fileIds: string[]): Promise<number> {
  return driveFileOp(fileIds, 'restore')
}

/** Supprime DÉFINITIVEMENT des fichiers Drive (irréversible). */
export function deleteDriveFilesForever(fileIds: string[]): Promise<number> {
  return driveFileOp(fileIds, 'delete')
}

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

/** Tous les fileId Drive référencés par une feuille (toutes lignes, cols image/url). */
function driveFileIdsOfSheet(sheet: ExcelSheet): Set<string> {
  const ids = new Set<string>()
  for (const row of sheet.rows) for (const id of driveFileIdsOfRow(row, sheet.columns)) ids.add(id)
  return ids
}

/**
 * Corbeille les assets Drive d'une FEUILLE supprimée (scraping) non référencés
 * par une AUTRE feuille restante. Retourne le nombre déplacé en corbeille.
 */
export async function trashSheetDamAssets(deletedSheet: ExcelSheet, otherSheets: ExcelSheet[]): Promise<number> {
  const toTrash = driveFileIdsOfSheet(deletedSheet)
  if (toTrash.size === 0) return 0
  for (const other of otherSheets) {
    for (const id of driveFileIdsOfSheet(other)) toTrash.delete(id)
    if (toTrash.size === 0) return 0
  }
  const { data } = await damDelete({ fileIds: [...toTrash] })
  return data.trashed
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
