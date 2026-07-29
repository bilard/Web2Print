// Résolution d'une référence image Google Drive (le webViewLink stocké dans une
// cellule image du PIM/DAM) vers une URL AFFICHABLE, téléchargée AUTHENTIFIÉE
// côté navigateur. Les assets restent PRIVÉS (jamais de partage public) : on lit
// les octets avec le token Drive de l'utilisateur (`alt=media`, CORS OK sur
// googleapis.com — cf. downloadDriveFile), puis on les sert via un objectURL
// same-origin (`blob:`) qui survit à toDataURL() de Fabric → pas de canvas tainté
// à l'export. Aucune Cloud Function : la lecture Drive marche directement depuis
// le client (preuve : gdriveCore.downloadDriveFile, exécuté en navigateur).

import { useGDriveStore } from '@/stores/gdrive.store'
import { getServerGoogleToken } from '@/features/gdrive/serverGoogleToken'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'

/**
 * Extrait l'ID d'un fichier Drive depuis un webViewLink ou une URL Drive.
 * Ex: https://drive.google.com/file/d/1AbC.../view?usp=drivesdk → 1AbC...
 *     https://drive.google.com/uc?id=1AbC...&export=view         → 1AbC...
 */
export function extractDriveFileId(url: string): string | null {
  if (typeof url !== 'string') return null
  const m =
    url.match(/\/file\/d\/([\w-]{20,})/) ||
    url.match(/[?&]id=([\w-]{20,})/) ||
    url.match(/\/d\/([\w-]{20,})/)
  return m ? m[1] : null
}

/** Construit le webViewLink canonique stocké en cellule pour un fileId donné. */
export function driveWebViewLink(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`
}

/** Vrai si la valeur de cellule pointe vers un asset Google Drive (≠ URL CDN brute). */
/**
 * Candidats d'une valeur image « en chaîne » : `détourée | originale` (ou
 * multi-images scrapées séparées par | / retour-ligne). Ordre = priorité ;
 * les résolveurs essaient chaque candidat jusqu'au premier qui répond —
 * supprimer un fichier du Drive fait donc RETOMBER sur l'image suivante.
 */
export function imageChainCandidates(value: string): string[] {
  return value.split(/[\n|]/).map((s) => s.trim()).filter(Boolean)
}

export function isDriveImageRef(value: string): boolean {
  return /(?:drive|docs)\.google\.com/.test(value) && extractDriveFileId(value) !== null
}

// Latch de session : une fois le jeton SERVEUR constaté indisponible (user connecté
// seulement en navigateur — cas courant), on cesse de retenter le callable
// mintGoogleToken pour CHAQUE fileId (sinon N images = N round-trips échoués,
// souvent concurrents car DamImage monte par ligne). Réinitialisé sur (dé)connexion
// Google serveur via resetDriveTokenSource().
let serverTokenUnavailable = false

/** À appeler quand l'état de connexion Google serveur change (cf. clearServerGoogleTokenCache). */
export function resetDriveTokenSource(): void {
  serverTokenUnavailable = false
}

/**
 * Token Drive : le jeton SERVEUR (refresh, scope `drive` complet → voit aussi les
 * assets uploadés côté serveur via save-dam ; auto-rafraîchi) en priorité, le jeton
 * NAVIGATEUR (panneau Google Drive, scope drive.file) en repli. Partagé par la
 * résolution (lecture) et la migration (upload).
 */
async function getDriveAccessToken(): Promise<string> {
  if (!serverTokenUnavailable) {
    try {
      return await getServerGoogleToken()
    } catch {
      serverTokenUnavailable = true // ne plus solliciter le callable serveur cette session
    }
  }
  const browserToken = useGDriveStore.getState().accessToken
  if (browserToken) return browserToken
  // Ni serveur ni navigateur : on relâche le latch pour retenter le serveur au prochain appel
  // (ex. l'utilisateur vient de connecter le compte).
  serverTokenUnavailable = false
  throw new Error('Google Drive non connecté — connecte ton compte (Réglages → Connecteurs).')
}

// ⚠ AUCUNE mémoïsation par fileId. Un visuel régénéré REMPLACE le contenu du
// même fichier Drive : l'id ne change pas, donc tout cache servait éternellement
// l'ancienne image — et le diagnostic coûtait des heures (« le PIM est à jour,
// pas le catalogue »). L'app est dynamique : la fraîcheur prime sur l'économie
// d'appels. Seules les requêtes EN VOL sont partagées, pour qu'une même image
// affichée dans dix cellules ne soit téléchargée qu'une fois — la promesse est
// retirée dès qu'elle est résolue.
const inFlight = new Map<string, Promise<string>>()

async function fetchDriveBlobUrl(fileId: string): Promise<string> {
  const token = await getDriveAccessToken()
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`Drive image ${fileId} : HTTP ${res.status}`)
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

/** URL affichable (`blob:`) pour un asset Drive — TOUJOURS retéléchargée.
 *  Les appels simultanés sur le même fichier partagent la requête en vol. */
export function resolveDriveImageUrl(fileId: string): Promise<string> {
  const running = inFlight.get(fileId)
  if (running) return running
  const p = fetchDriveBlobUrl(fileId).finally(() => { inFlight.delete(fileId) })
  inFlight.set(fileId, p)
  return p
}
