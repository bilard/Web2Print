// Upload d'une image produit remplacée vers le DAM (Google Drive), pour ne stocker
// qu'une RÉFÉRENCE Drive (webViewLink) dans la fiche au lieu d'un data-URL lourd.
// Délègue au pont générique features/dam/uploadImageToDam.
import { damSlug, uploadImageToDam } from '@/features/dam/uploadImageToDam'

// Nom HISTORIQUE du module (renommé « Création studio » en 2026-07) conservé tel
// quel : le changer créerait un second sous-dossier Drive à côté de l'existant.
const SUB_FOLDER = 'Promo Retail'

/**
 * Uploade une image (data:/blob:/http) vers le DAM et renvoie son webViewLink Drive
 * (reconnu par isDriveImageRef → résoluble via resolveDriveImageUrl).
 */
export async function uploadPromoImageToDam(src: string, name: string): Promise<string> {
  return uploadImageToDam(src, damSlug(name), SUB_FOLDER)
}
