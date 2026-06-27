// src/features/dam/damCleanup.ts
// Suppression des assets DAM (Drive) — TOUJOURS vers la CORBEILLE (récupérable).
// Approche par EMPLACEMENT+NOM (CF damTrashByName) : robuste, indépendante des
// liens en cellule (qui peuvent ne pas être persistés). Plus les opérations
// génériques fichiers (corbeille/restaurer/supprimer définitivement).
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'

const damDelete = httpsCallable<{ fileIds: string[]; op?: 'trash' | 'restore' | 'delete' }, { trashed: number }>(functions, 'damDelete')

const damTrashByName = httpsCallable<
  { folderName: string; subFolder?: string; namePrefix?: string },
  { trashed: number }
>(functions, 'damTrashByName')

const DAM_ROOT = 'Web2Print — Assets DAM'

/** Corbeille les assets DAM d'UN produit par EMPLACEMENT+nom. subFolder = nom du
 *  scraping ; namePrefix = libellé produit (= préfixe des fichiers uploadés). */
export async function trashProductDamAssets(subFolder: string, namePrefix: string): Promise<number> {
  if (!namePrefix) return 0
  const { data } = await damTrashByName({ folderName: DAM_ROOT, subFolder, namePrefix })
  return data.trashed
}

/** Corbeille le SOUS-DOSSIER DAM entier d'un scraping (suppression d'une feuille). */
export async function trashScrapeFolder(subFolder: string): Promise<number> {
  if (!subFolder) return 0
  const { data } = await damTrashByName({ folderName: DAM_ROOT, subFolder })
  return data.trashed
}

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
