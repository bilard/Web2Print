import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import type { ReferenceImage } from './geminiImageClient'

const imageProxyFn = httpsCallable<{ url: string }, { data: string; mimeType: string }>(
  functions,
  'imageProxy',
)

async function fetchViaProxy(url: string): Promise<{ data: string; mimeType: string }> {
  const { data } = await imageProxyFn({ url })
  return data
}

interface BrandKitFile {
  url: string
  filename: string
  contentType: string
  size: number
  relativePath?: string
}

interface BrandKitValue {
  url?: string
  filename?: string
  contentType?: string
  size?: number
  files?: BrandKitFile[]
}

const SUPPORTED_IMAGE_TYPES = /^image\/(png|jpeg|jpg|webp)$/i
const MAX_REFS = 6
const MAX_BYTES = 4 * 1024 * 1024 // 4 MB par image de référence

/**
 * Extrait la liste de fichiers exploitables (images raster) depuis la valeur
 * `brandKit` du formulaire. Ignore les PDF, .ai, .eps et autres formats
 * non supportés par l'API Gemini Image en inlineData.
 */
function listSupportedFiles(kit: BrandKitValue | undefined): BrandKitFile[] {
  if (!kit) return []
  const all: BrandKitFile[] = kit.files?.length
    ? kit.files
    : kit.url
      ? [
          {
            url: kit.url,
            filename: kit.filename ?? 'fichier',
            contentType: kit.contentType ?? '',
            size: kit.size ?? 0,
          },
        ]
      : []

  return all.filter((f) => {
    if (f.size > MAX_BYTES) return false
    if (SUPPORTED_IMAGE_TYPES.test(f.contentType)) return true
    // Fallback sur extension si contentType absent
    return /\.(png|jpe?g|webp)$/i.test(f.filename)
  })
}

function guessMimeFromUrl(url: string): string | null {
  const m = url.toLowerCase().match(/\.(png|jpe?g|webp)(?:\?|#|$)/)
  if (!m) return null
  const ext = m[1] === 'jpg' ? 'jpeg' : m[1]
  return `image/${ext}`
}

async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const ctrl = new AbortController()
  const timeoutId = setTimeout(() => ctrl.abort(), 10_000)
  let res: Response
  try {
    res = await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(timeoutId)
  }
  if (!res.ok) throw new Error(`Fetch ${res.status} sur ${url}`)
  const blob = await res.blob()
  // Réponses `application/octet-stream` ou content-type vide (courant sur
  // certains CDN produit) : on replie sur l'extension d'URL.
  let mimeType = blob.type
  if (!mimeType || !/^image\/(png|jpe?g|webp)$/i.test(mimeType)) {
    mimeType = guessMimeFromUrl(url) ?? mimeType ?? 'image/png'
  }
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return { data: btoa(binary), mimeType }
}

/**
 * Charge les images de référence du kit client en base64, prêtes à être
 * envoyées à Gemini Nano Banana 2 en inlineData parts.
 *
 * Limite à MAX_REFS fichiers pour éviter de saturer le payload. Priorité
 * aux logos (détectés par nom de fichier).
 */
export async function loadBrandKitReferences(
  kit: BrandKitValue | undefined,
): Promise<ReferenceImage[]> {
  const files = listSupportedFiles(kit)
  if (files.length === 0) return []

  // Priorité : logos en premier
  const scored = files
    .map((f) => ({
      f,
      score: /logo/i.test(f.filename) ? 0 : /charte|chartre|brand|guide/i.test(f.filename) ? 1 : 2,
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_REFS)
    .map((s) => s.f)

  const refs: ReferenceImage[] = []
  for (const file of scored) {
    try {
      const { data, mimeType } = await fetchAsBase64(file.url)
      refs.push({ data, mimeType, label: file.filename })
    } catch (err) {
      console.warn(`[brandKitLoader] échec chargement ${file.filename}:`, err)
    }
  }
  return refs
}

/**
 * Charge en références Nano Banana 2 les photos catalogue des produits du
 * panier. Sans ces refs, NB doit deviner à quoi ressemble un "Barnum" ou un
 * "Oriflamme" et converge vers un générique branded (tente rouge). Avec la
 * photo du produit en ref, il sait produire la bonne forme physique.
 *
 * Tolérant : échecs CORS/404 ignorés (la génération continue sans cette ref).
 */
export async function loadProductImageReferences(
  items: Array<{ imageUrl?: string; name?: string }>,
  maxRefs = MAX_REFS,
): Promise<ReferenceImage[]> {
  const withImage = items.filter((i) => i.imageUrl).slice(0, maxRefs)
  const refs: ReferenceImage[] = []
  for (const item of withImage) {
    try {
      // Les URLs produit viennent de sites externes scrapés (doublet.fr…) qui
      // ne renvoient pas les headers CORS. On passe obligatoirement par la
      // Cloud Function `imageProxy` qui fetch server-side.
      const { data, mimeType } = await fetchViaProxy(item.imageUrl as string)
      refs.push({
        data,
        mimeType,
        label: item.name ? `Produit — ${item.name}` : 'Produit',
      })
    } catch (err) {
      console.warn(`[loadProductImageReferences] échec ${item.name ?? item.imageUrl}:`, err)
    }
  }
  return refs
}
