// functions/src/dam/autocomplete.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'

export const damAutocomplete = onCall(
  { region: 'europe-west1', maxInstances: 5 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise')
    }

    const { prefix } = request.data as { prefix: string }

    if (!prefix || prefix.length < 2) {
      return { suggestions: [] }
    }

    const lower = prefix.toLowerCase()

    const db = admin.firestore()
    const snap = await db
      .collection('dam_popular_searches')
      .where('term', '>=', lower)
      .where('term', '<=', lower + '\uf8ff')
      .orderBy('term')
      .limit(8)
      .get()

    const suggestions = snap.docs.map((d) => d.data().term as string)
    return { suggestions }
  }
)
