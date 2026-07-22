// src/features/priceWatch/catalog/authFetchClient.ts
// Client de la CF `fetchPageHtmlAuth` : récupère le HTML d'une page en étant connecté
// au site (login cookie serveur). Utilisé par la moisson pour les sites marqués `auth`
// (prix visibles uniquement authentifié, ex. progarden). Les identifiants ne transitent
// jamais par le navigateur — le serveur les lit en Firestore.
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'

const callAuthFetch = httpsCallable<{ host: string; url: string }, { html: string; length: number }>(
  functions,
  'fetchPageHtmlAuth',
  { timeout: 60_000 },
)

/**
 * Fetch authentifié d'une URL via la CF. `host` est la clé Firestore des identifiants
 * (= domaine CONFIGURÉ du site), passée explicitement pour matcher au byte près ce que le
 * formulaire a enregistré — ne PAS la dériver de l'URL (redirections www/locale). null si échec.
 */
export async function fetchAuthHtml(url: string, host: string): Promise<string | null> {
  try {
    const { data } = await callAuthFetch({ host, url })
    return data?.html && data.html.length > 300 ? data.html : null
  } catch {
    return null
  }
}
