/**
 * Scrape supplier website et extrait logos/pictos/images du produit.
 * Convertit en PNG data URIs pour intégration dans le SVG final.
 */

import { getApiKey } from '@/lib/apiKeys'

interface ExtractAssetsResult {
  ok: boolean
  assets?: Array<{ type: string; url: string; title?: string }>
  error?: string
}

interface DownloadAssetResult {
  ok: boolean
  dataUri?: string
  error?: string
}

/**
 * Extraire l'URL depuis le prompt ou productImageUrl
 */
export function extractSupplierUrl(prompt: string, productImageUrl?: string): string | null {
  // Si productImageUrl est une URL (pas data:image), utilise-la
  if (productImageUrl && !productImageUrl.startsWith('data:')) {
    return productImageUrl
  }

  // Cherche une URL dans le prompt (http:// ou https://)
  const urlMatch = prompt.match(/https?:\/\/[^\s]+/)
  if (urlMatch) {
    return urlMatch[0].replace(/[.,!?;:'"]+$/, '') // Nettoie trailing punctuation
  }

  return null
}

/**
 * Scrape supplier URL et extrait logos/pictos pertinents au produit
 */
export async function extractProductAssets(
  supplierUrl: string,
  productName: string,
): Promise<ExtractAssetsResult> {
  const geminiKey = getApiKey('gemini')
  if (!geminiKey) {
    return { ok: false, error: 'Clé API Gemini absente' }
  }

  try {
    // Step 1: Scrape via Jina AI. Headers importants :
    //  - Accept: application/json → format structuré
    //  - X-With-Images-Summary: all → récupère toutes les images
    //  - X-Return-Format: markdown + images → combine les deux
    //  - X-Engine: browser → rend le JS (indispensable pour Makita et autres sites SPA)
    console.log('[generateProductAssets] Scraping:', supplierUrl)
    const jinaUrl = `https://r.jina.ai/${supplierUrl}`
    const jinaRes = await fetch(jinaUrl, {
      headers: {
        Accept: 'application/json',
        'X-With-Images-Summary': 'all',
        'X-Return-Format': 'markdown',
        'X-Engine': 'browser',
      },
    })

    if (!jinaRes.ok) {
      return { ok: false, error: `Jina scrape failed: ${jinaRes.status}` }
    }

    const jinaData = (await jinaRes.json()) as {
      data?: {
        markdown?: string
        content?: string
        images?: Array<{ url: string; alt?: string }> | Record<string, string>
      }
    }
    const markdown = jinaData.data?.markdown || jinaData.data?.content || ''
    // Jina retourne "images" sous forme de dict { alt: url } OU d'array [{url, alt}]
    const rawImages = jinaData.data?.images
    const scrapedImages: Array<{ url: string; alt?: string }> = Array.isArray(rawImages)
      ? rawImages
      : rawImages
        ? Object.entries(rawImages).map(([alt, url]) => ({ url, alt }))
        : []

    console.log('[generateProductAssets] Jina returned:', {
      markdownLength: markdown.length,
      imageCount: scrapedImages.length,
    })

    // Fallback : si Jina ne renvoie rien, tente un fetch HTML direct
    // et extrait les <img src> manuellement (pour les sites simples).
    let fallbackImages: Array<{ url: string; alt?: string }> = []
    if (scrapedImages.length === 0) {
      try {
        const htmlRes = await fetch(supplierUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Web2PrintScraper/1.0)' } })
        if (htmlRes.ok) {
          const html = await htmlRes.text()
          const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi
          const base = new URL(supplierUrl)
          const seen = new Set<string>()
          let m: RegExpExecArray | null
          while ((m = imgRe.exec(html))) {
            let url = m[1]
            if (url.startsWith('//')) url = base.protocol + url
            else if (url.startsWith('/')) url = base.origin + url
            else if (!url.startsWith('http')) continue
            if (seen.has(url)) continue
            seen.add(url)
            fallbackImages.push({ url, alt: m[2] })
            if (fallbackImages.length >= 20) break
          }
          console.log('[generateProductAssets] HTML fallback extracted:', fallbackImages.length, 'images')
        }
      } catch (err) {
        console.warn('[generateProductAssets] HTML fallback failed:', err)
      }
    }
    const allImages = scrapedImages.length > 0 ? scrapedImages : fallbackImages

    // Step 2: Gemini LLM to identify relevant assets for the product
    const extractPrompt = `
Vous avez scrapé le site d'un fournisseur. Identifiez les logos, pictos, images pertinents pour le produit.

Produit: ${productName}

**Contenu scrapé (texte + images détectées):**
${markdown.substring(0, 2000)}

**Images trouvées:**
${allImages.slice(0, 15).map((img, i) => `${i + 1}. URL: ${img.url}${img.alt ? ` | Alt: ${img.alt}` : ''}`).join('\n')}

**Identifiez UNIQUEMENT les assets pertinents (logo, pictos techniques, images du produit).**

Répondez au format JSON:
\`\`\`json
{
  "assets": [
    { "type": "logo", "url": "...", "title": "..." },
    { "type": "picto", "url": "...", "title": "..." },
    { "type": "image", "url": "...", "title": "..." }
  ]
}
\`\`\`

**Règles:**
- UNIQUEMENT URLs absolutes (http:// ou https://)
- MAX 5 assets
- Priorise: logo > pictos > images produit
- Inclue TOUJOURS le logo si trouvé
`.trim()

    const geminiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=' + geminiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: extractPrompt }] }],
      }),
    })

    if (!geminiRes.ok) {
      return { ok: false, error: `Gemini LLM failed: ${geminiRes.status}` }
    }

    const geminiData = (await geminiRes.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }

    const llmResult = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Parse JSON from LLM response
    const jsonMatch = llmResult.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { ok: false, error: 'LLM returned no JSON' }
    }

    const parsed = JSON.parse(jsonMatch[0]) as { assets?: Array<{ type: string; url: string; title?: string }> }
    const assets = parsed.assets || []

    // Validate URLs (absolute only)
    const validAssets = assets.filter((a) => a.url && (a.url.startsWith('http://') || a.url.startsWith('https://')))

    console.log('[generateProductAssets] Extracted assets:', validAssets.length)
    return { ok: true, assets: validAssets }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[generateProductAssets] Error:', msg)
    return { ok: false, error: msg }
  }
}

/**
 * Télécharge une image et la convertit en PNG data URI
 */
export async function downloadAssetAsPng(imageUrl: string): Promise<DownloadAssetResult> {
  try {
    console.log('[downloadAssetAsPng] Downloading:', imageUrl.substring(0, 50))

    // Utilise image proxy Firebase si disponible (CORS)
    const { httpsCallable } = await import('firebase/functions')
    const { functions } = await import('@/lib/firebase/config')

    const imageProxyFn = httpsCallable<{ url: string }, { data: string; mimeType: string }>(
      functions,
      'imageProxy',
    )

    const { data: proxyResult } = await imageProxyFn({ url: imageUrl })

    // Convert to PNG if needed (assume base64 data already in PNG format for simplicity)
    const dataUri = `data:${proxyResult.mimeType};base64,${proxyResult.data}`

    console.log('[downloadAssetAsPng] Success:', dataUri.substring(0, 50))
    return { ok: true, dataUri }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[downloadAssetAsPng] Failed:', msg)
    return { ok: false, error: msg }
  }
}

/**
 * Scrape supplier, extract product assets, and return PNG data URIs
 */
export async function generateProductAssets(
  supplierUrl: string,
  productName: string,
): Promise<{ ok: boolean; assets?: Array<{ type: string; dataUri: string; title?: string }>; error?: string }> {
  if (!supplierUrl || !productName) {
    return { ok: false, error: 'Missing supplierUrl or productName' }
  }

  // Extract assets from supplier website
  const extractResult = await extractProductAssets(supplierUrl, productName)
  if (!extractResult.ok || !extractResult.assets?.length) {
    console.warn('[generateProductAssets] No assets extracted')
    return { ok: true, assets: [] } // Non-fatal, continue without assets
  }

  // Download each asset in parallel
  console.log('[generateProductAssets] Downloading', extractResult.assets.length, 'assets in parallel')
  const downloadResults = await Promise.all(
    extractResult.assets.map(async (asset) => ({
      ...asset,
      downloadResult: await downloadAssetAsPng(asset.url),
    })),
  )

  // Filter successes
  const assets = downloadResults
    .filter((item) => item.downloadResult.ok && item.downloadResult.dataUri)
    .map((item) => ({
      type: item.type,
      dataUri: item.downloadResult.dataUri!,
      title: item.title,
    }))

  console.log('[generateProductAssets] Downloaded:', assets.length, '/', extractResult.assets.length)
  return { ok: true, assets }
}
