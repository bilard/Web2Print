// src/features/dam/damFolder.ts
// Source UNIQUE du dossier Drive où sont centralisés les assets produits du DAM
// (images scrapées, imports, génération IA). ensureDriveFolder est idempotent
// (cherche le dossier existant visible par l'app sous drive.file, sinon le crée) ;
// on mémoïse l'id obtenu — il est stable quel que soit le token, donc partagé par
// scraping / import Excel / Higgsfield.
import { ensureDriveFolder } from '@/features/gdrive/gdriveCore'

const DAM_FOLDER_NAME = 'Web2Print — Assets DAM'

let cachedFolderId: Promise<string> | null = null

/** Renvoie l'id du dossier DAM (le crée au besoin), mémoïsé pour la session. */
export function ensureDamFolder(token: string): Promise<string> {
  if (!cachedFolderId) {
    cachedFolderId = ensureDriveFolder(token, DAM_FOLDER_NAME).catch((err) => {
      cachedFolderId = null // un échec n'est pas mémoïsé
      throw err
    })
  }
  return cachedFolderId
}
