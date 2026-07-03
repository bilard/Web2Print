// src/features/imaging/detourImage.ts
// Détourage d'un asset référencé par une cellule/valeur (webViewLink Drive ou URL)
// → PNG alpha uploadé dans le DAM (sous-dossier « Détourés ») → nouveau webViewLink.
import { extractDriveFileId, isDriveImageRef, resolveDriveImageUrl } from '@/features/dam/driveAssets'
import { damSlug, uploadImageToDam } from '@/features/dam/uploadImageToDam'
import { removeBackground } from './removeBackground'

const SUB_FOLDER = 'Détourés'

/** Détoure UNE référence image (webViewLink Drive ou URL) → webViewLink du PNG détouré. */
export async function detourImageRef(ref: string, baseName: string): Promise<string> {
  const fileId = isDriveImageRef(ref) ? extractDriveFileId(ref) : null
  const src = fileId ? await resolveDriveImageUrl(fileId) : ref
  const { url } = await removeBackground(src)
  try {
    return await uploadImageToDam(url, `${damSlug(baseName)}-detoure.png`, SUB_FOLDER)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Détoure la PREMIÈRE image de `value` et renvoie la valeur mise à jour (la
 * référence d'origine y est remplacée par le webViewLink du PNG détouré).
 */
export async function detourImageValue(value: string, baseName: string): Promise<string> {
  const segments = value.split(/[\n|]/).map((s) => s.trim()).filter(Boolean)
  const ref = segments[0]
  if (!ref) throw new Error('Aucune image dans cette cellule')
  const webViewLink = await detourImageRef(ref, baseName)
  // Chaîne « détourée | originale » : l'ORIGINALE (dernier segment, jamais un
  // détourage précédent) reste en secours — supprimer le PNG du Drive fait
  // retomber l'affichage sur elle, naturellement.
  return `${webViewLink} | ${segments[segments.length - 1]}`
}
