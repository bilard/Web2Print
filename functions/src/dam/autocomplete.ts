// functions/src/dam/autocomplete.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'

/**
 * Autocomplétion déléguée à l'endpoint public d'Unsplash utilisé par leur propre
 * site (https://unsplash.com/nautocomplete/{prefix}).
 *
 * Réponse : `{ autocomplete: [{ query: string; priority: number }, ...] }`
 *
 * Cet endpoint n'est pas officiellement documenté mais il est public, sans clé
 * API, et renvoie les mêmes suggestions que la barre de recherche d'unsplash.com.
 */
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

    const clean = prefix.trim().toLowerCase()
    const url = `https://unsplash.com/nautocomplete/${encodeURIComponent(clean)}`

    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      })

      if (!res.ok) {
        return { suggestions: [] }
      }

      const data = (await res.json()) as { autocomplete?: Array<{ query: string; priority?: number }> }
      const suggestions = (data.autocomplete ?? [])
        .map((item) => item.query)
        .filter((q): q is string => typeof q === 'string' && q.length > 0)
        .slice(0, 8)

      return { suggestions }
    } catch (err) {
      console.error('[damAutocomplete] Unsplash fetch failed:', err)
      return { suggestions: [] }
    }
  }
)
