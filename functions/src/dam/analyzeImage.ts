import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineString } from 'firebase-functions/params'

const geminiApiKey = defineString('GEMINI_API_KEY')

interface AnalysisResult {
  subject: string
  description: string
  labels: string[]
  colors: string[]
  objects: string[]
  text: string[]
  brands: string[]
  mood: string
  style: string
  composition: string
  lighting: string
  tags: string[]
}

export const analyzeImage = onCall(
  { region: 'europe-west1', maxInstances: 5 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise')
    }

    const { imageUrl } = request.data as { imageUrl: string }
    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new HttpsError('invalid-argument', 'imageUrl est requis')
    }

    const res = await fetch(imageUrl)
    if (!res.ok) throw new HttpsError('internal', 'Failed to fetch image')
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
                  text: `You are an expert image analyst combining Google Cloud Vision, OCR, brand recognition, and art direction. Analyze this image in depth and return a JSON object with EXACTLY these fields:

- "subject": (French, 5-12 words) the MAIN subject, being as SPECIFIC as possible. If it's a product, vehicle, landmark, or known brand, name the exact make/model/year if visible. Example: "Chevrolet Corvette C3 Stingray bleue, vue rapprochée du logo" instead of just "sports car".
- "description": (French, 2-3 sentences) a rich description: what is visible, context, noteworthy details.
- "labels": array of 10-15 descriptive keywords (English, lowercase, no duplicates).
- "colors": array of 5-6 dominant hex colors sorted from most to least dominant (e.g. "#1e3a8a").
- "objects": array of 4-10 specific objects/elements visible (English).
- "text": array of ALL text strings visible in the image (OCR). Include logos, license plates, signs, badges, stamps, inscriptions. Preserve original case and punctuation. Return [] if none.
- "brands": array of brand names, logos, manufacturers or trademarks identifiable in the image (e.g. ["Chevrolet", "Corvette"]). Return [] if none.
- "mood": (French, 2-5 words) the atmosphere/feeling (e.g. "nostalgique, luxueux, classique").
- "style": (French, 2-6 words) artistic/photographic style (e.g. "photographie automobile vintage").
- "composition": (French, 3-8 words) framing and composition (e.g. "gros plan, faible profondeur de champ").
- "lighting": (French, 3-8 words) lighting characteristics (e.g. "lumière douce, reflets métalliques").
- "tags": array of 8-12 searchable tags mixing subject, style, usage context (French or English).

Be precise and specific. If you recognize a known product, monument, celebrity, brand, or vehicle, name it explicitly in "subject" and "brands". Use OCR aggressively on any visible text, even partial or stylized.

Return ONLY valid JSON, no markdown fences, no explanation.`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      const err = await geminiRes.text()
      throw new HttpsError('internal', `Gemini error: ${geminiRes.status} ${err}`)
    }

    const data = (await geminiRes.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]
    }

    const parts = data.candidates?.[0]?.content?.parts ?? []
    const text = parts
      .filter((p) => !p.thought && p.text)
      .map((p) => p.text!.trim())
      .join('')

    if (!text) {
      throw new HttpsError('internal', 'Gemini returned no analysis')
    }

    try {
      const result = JSON.parse(text) as AnalysisResult
      return {
        subject: result.subject ?? '',
        description: result.description ?? '',
        labels: result.labels ?? [],
        colors: result.colors ?? [],
        objects: result.objects ?? [],
        text: result.text ?? [],
        brands: result.brands ?? [],
        mood: result.mood ?? '',
        style: result.style ?? '',
        composition: result.composition ?? '',
        lighting: result.lighting ?? '',
        tags: result.tags ?? [],
      }
    } catch {
      throw new HttpsError('internal', 'Failed to parse Gemini response')
    }
  }
)
