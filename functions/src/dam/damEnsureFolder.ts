// functions/src/dam/damEnsureFolder.ts
// Callable : résout (crée au besoin) le dossier cible du DAM AVANT les uploads
// concurrents — sinon chaque upload parallèle recrée le sous-dossier (course →
// dossiers « <scrape> » en double, images éparpillées). Renvoie rootId + targetId.
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getGoogleAccessToken } from '../google/serverAuth'
import { ensureDamTarget } from './driveFolders'

export const damEnsureFolder = onCall(
  { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 30, maxInstances: 5 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise')
    const { folderName, subFolder } = (request.data ?? {}) as { folderName?: string; subFolder?: string }
    const token = await getGoogleAccessToken(request.auth.uid)
    const { rootId, targetId } = await ensureDamTarget(token, folderName ?? 'Web2Print — Assets DAM', subFolder)
    return { rootId, targetId }
  },
)
