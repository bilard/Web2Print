// functions/src/dam/searchSimilar.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { searchPexelsSimilar } from './pexelsClient'

export const searchSimilar = onCall(
  { region: 'europe-west1', maxInstances: 5 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise')
    }

    const { imageUrl } = request.data as { imageUrl: string }

    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new HttpsError('invalid-argument', 'imageUrl est requis')
    }

    const result = await searchPexelsSimilar(imageUrl)
    return result
  }
)
