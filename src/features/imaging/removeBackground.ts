// src/features/imaging/removeBackground.ts
// Moteur de détourage automatique de l'app — deux étages :
//   1) rembg (Cloud Run, gratuit/illimité, modèle isnet-general-use) par DÉFAUT ;
//   2) Remove.bg (API payante) si la clé est configurée ET que l'utilisateur ne
//      l'a pas désactivée (interrupteur Paramètres → Connecteurs).
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '@/lib/firebase/config'
import { getApiKey } from '@/lib/apiKeys'
import { recordRemoveBgUsage } from '@/features/stats/removeBgUsageTracking'

/** Service rembg (projet web2print-render, comme hf-render) — URL canonique Cloud Run. */
const REMBG_URL = 'https://rembg-tggty5kqja-ew.a.run.app'

const DISABLE_FLAG = 'designstudio_removebg_api_disabled'

/** Remove.bg (payant) actif ? — vrai par défaut quand une clé existe. */
export function isRemoveBgApiEnabled(): boolean {
  return localStorage.getItem(DISABLE_FLAG) !== '1'
}

export function setRemoveBgApiEnabled(enabled: boolean): void {
  if (enabled) localStorage.removeItem(DISABLE_FLAG)
  else localStorage.setItem(DISABLE_FLAG, '1')
}

const imageProxyFn = httpsCallable<{ url: string }, { data: string; mimeType: string }>(functions, 'imageProxy')

/** Récupère les octets d'une image (data:/blob:/https) — proxy serveur si CORS bloque. */
async function imageBlob(imageUrl: string): Promise<Blob> {
  try {
    const res = await fetch(imageUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.blob()
  } catch (e) {
    if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) throw e
    const { data } = await imageProxyFn({ url: imageUrl })
    const bin = atob(data.data)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new Blob([bytes], { type: data.mimeType })
  }
}

async function removeViaRembg(imageUrl: string): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Non connecté')
  const [token, blob] = await Promise.all([user.getIdToken(), imageBlob(imageUrl)])
  const res = await fetch(`${REMBG_URL}/remove`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error ?? `Détourage rembg : erreur ${res.status}`)
  }
  return URL.createObjectURL(await res.blob())
}

async function removeViaRemoveBgApi(imageUrl: string, apiKey: string): Promise<string> {
  const formData = new FormData()
  if (imageUrl.startsWith('http')) formData.append('image_url', imageUrl)
  else formData.append('image_file', await imageBlob(imageUrl), 'image.png')
  formData.append('size', 'auto')
  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey },
    body: formData,
  })
  if (!response.ok) {
    const errData = await response.json().catch(() => ({})) as { errors?: { title?: string }[] }
    throw new Error(errData.errors?.[0]?.title ?? `Remove.bg : erreur ${response.status}`)
  }
  // Conso réelle dans X-Credits-Charged (1 en pleine résolution, ~0.25 en preview).
  const credits = Number(response.headers.get('X-Credits-Charged'))
  void recordRemoveBgUsage(Number.isFinite(credits) && credits > 0 ? credits : 1)
  return URL.createObjectURL(await response.blob())
}

export interface RemoveBackgroundResult {
  /** URL blob du PNG détouré. */
  url: string
  provider: 'removebg' | 'rembg'
}

/**
 * Détoure une image (URL data:/blob:/https) → PNG alpha. Remove.bg si activé
 * avec clé, sinon rembg ; échec Remove.bg (crédits épuisés…) → repli rembg.
 */
export async function removeBackground(imageUrl: string): Promise<RemoveBackgroundResult> {
  const apiKey = getApiKey('removebg')
  if (apiKey && isRemoveBgApiEnabled()) {
    try {
      return { url: await removeViaRemoveBgApi(imageUrl, apiKey), provider: 'removebg' }
    } catch (e) {
      console.warn('[détourage] Remove.bg indisponible, repli rembg :', e)
    }
  }
  return { url: await removeViaRembg(imageUrl), provider: 'rembg' }
}
