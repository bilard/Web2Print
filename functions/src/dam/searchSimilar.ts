// functions/src/dam/searchSimilar.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineString } from 'firebase-functions/params'
import { searchPexels } from './pexelsClient'
import { searchUnsplash } from './unsplashClient'
import type { DamImageResult } from './types'

const geminiApiKey = defineString('GEMINI_API_KEY')

async function describeImage(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl)
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)
  const buffer = await res.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const mimeType = res.headers.get('content-type') || 'image/jpeg'

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey.value()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inlineData: { mimeType, data: base64 } },
              {
                text: 'Describe this image in 3-5 English keywords for stock photo search. Return ONLY the keywords separated by spaces, nothing else. Example: "mountain sunset landscape orange sky"',
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 256,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
  )

  if (!geminiRes.ok) {
    const err = await geminiRes.text()
    throw new Error(`Gemini API error: ${geminiRes.status} ${err}`)
  }

  const data = (await geminiRes.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]
  }
  // gemini-2.5-flash may include "thought" parts — skip them
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const text = parts
    .filter((p) => !p.thought && p.text)
    .map((p) => p.text!.trim())
    .join(' ')
    .trim()
  if (!text) {
    console.error('Gemini response:', JSON.stringify(data))
    throw new Error('Gemini returned no description')
  }
  return text
}

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

    let keywords: string
    try {
      keywords = await describeImage(imageUrl)
    } catch (err) {
      console.error('Image description failed:', err)
      throw new HttpsError('internal', 'Impossible d\'analyser l\'image')
    }

    const params = { query: keywords, page: 1, perPage: 15 }
    const [pexelsResult, unsplashResult] = await Promise.all([
      searchPexels(params).catch(() => ({ images: [], totalResults: 0, hasMore: false })),
      searchUnsplash(params).catch(() => ({ images: [], totalResults: 0, hasMore: false })),
    ])

    // Deduplicate & interleave
    const seen = new Set<string>()
    const pexelsImgs: DamImageResult[] = []
    const unsplashImgs: DamImageResult[] = []

    for (const img of pexelsResult.images) {
      const key = `${img.sourceProvider}_${img.sourceId}`
      if (!seen.has(key)) { seen.add(key); pexelsImgs.push(img) }
    }
    for (const img of unsplashResult.images) {
      const key = `${img.sourceProvider}_${img.sourceId}`
      if (!seen.has(key)) { seen.add(key); unsplashImgs.push(img) }
    }

    const allImages: DamImageResult[] = []
    const maxLen = Math.max(pexelsImgs.length, unsplashImgs.length)
    for (let i = 0; i < maxLen; i++) {
      if (i < pexelsImgs.length) allImages.push(pexelsImgs[i])
      if (i < unsplashImgs.length) allImages.push(unsplashImgs[i])
    }

    const totalResults = pexelsResult.totalResults + unsplashResult.totalResults
    const hasMore = pexelsResult.hasMore || unsplashResult.hasMore

    return { images: allImages, totalResults, hasMore, nextPage: 2 }
  }
)
