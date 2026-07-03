// src/features/imaging/detourImage.ts
// Détourage d'un asset référencé par une cellule/valeur (webViewLink Drive ou URL)
// → PNG alpha uploadé dans le DAM (sous-dossier « Détourés ») → nouveau webViewLink.
import { extractDriveFileId, isDriveImageRef, resolveDriveImageUrl } from '@/features/dam/driveAssets'
import { damSlug, uploadImageToDam } from '@/features/dam/uploadImageToDam'
import { removeBackground } from './removeBackground'

const SUB_FOLDER = 'Détourés'

/** 1re référence image d'une valeur de cellule (les cellules multi-images séparent par | ou retour-ligne). */
function firstImageRef(value: string): string {
  return value.split(/[\n|]/).map((s) => s.trim()).find(Boolean) ?? ''
}

/**
 * Détoure la PREMIÈRE image de `value` et renvoie la valeur mise à jour (la
 * référence d'origine y est remplacée par le webViewLink du PNG détouré).
 */
export async function detourImageValue(value: string, baseName: string): Promise<string> {
  const ref = firstImageRef(value)
  if (!ref) throw new Error('Aucune image dans cette cellule')
  const fileId = isDriveImageRef(ref) ? extractDriveFileId(ref) : null
  const src = fileId ? await resolveDriveImageUrl(fileId) : ref
  const { url } = await removeBackground(src)
  try {
    const webViewLink = await uploadImageToDam(url, `${damSlug(baseName)}-detoure.png`, SUB_FOLDER)
    return value.replace(ref, webViewLink)
  } finally {
    URL.revokeObjectURL(url)
  }
}
