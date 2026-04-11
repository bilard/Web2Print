import { getApiKey } from '@/lib/apiKeys'
import type { Brief } from '@/features/briefs/types'

const MODEL = 'gemini-3.1-pro-preview'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

interface GroundedResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}

/**
 * Produit une description visuelle concise (en anglais) du décor le plus
 * pertinent pour générer les visuels du brief. Utilise Gemini avec Google
 * Search grounding : il peut donc chercher sur le web ce qu'est réellement
 * l'événement/lieu/personne mentionnés dans le contexte (ex: "concert de
 * Céline Dion au Stade de France") avant de décrire la scène.
 *
 * Retourne une phrase courte qui sera injectée dans les prompts Nano Banana.
 * En cas d'échec, retombe sur un décor générique.
 */
export async function inferSceneDescription(brief: Brief): Promise<string> {
  const apiKey = getApiKey('gemini')
  if (!apiKey) return 'a professional environment'

  const v = brief.client.values as Record<string, unknown>
  const str = (k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '')
  const company = str('companyName')
  const sector = str('sector')
  const context = str('contextSummary')

  const answers = brief.dynamicForm?.answers ?? {}
  const answerLines = Object.entries(answers)
    .filter(([, val]) => typeof val === 'string' && (val as string).trim().length > 0)
    .map(([k, val]) => `- ${k}: ${(val as string).trim()}`)
    .join('\n')

  const prompt = `You are preparing a photorealistic visual brief.

Client context:
- Company / organizer: ${company || '(not specified)'}
- Sector: ${sector || '(not specified)'}
- Free-form context: ${context || '(none)'}
${answerLines ? `\nProject answers:\n${answerLines}` : ''}

Task: Using Google Search to look up any specific venue, event, artist or brand mentioned above (e.g. a concert, a tour, a stadium, a historical event), produce ONE short English sentence (max 30 words) describing the REAL-WORLD scene where promotional print products for this project would be photographed.

Be specific and visually concrete: include the actual venue architecture/atmosphere, the event mood, crowd if relevant, lighting conditions, time of day. Do NOT mention brand logos, products, or print items — only the environment.

Respond with the sentence only, no preamble.`

  try {
    const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.5 },
      }),
    })
    if (!res.ok) {
      console.warn('[inferSceneDescription] HTTP', res.status, (await res.text()).slice(0, 200))
      return 'a professional environment'
    }
    const data = (await res.json()) as GroundedResponse
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || '')
      .join(' ')
      .trim()
    if (!text) return 'a professional environment'
    // Garde une seule phrase, enlève guillemets et ponctuation finale parasite.
    const clean = text
      .replace(/^["'«»]+|["'«»]+$/g, '')
      .split(/\n/)[0]
      .trim()
    console.log('[inferSceneDescription]', clean)
    return clean || 'a professional environment'
  } catch (err) {
    console.warn('[inferSceneDescription] échec', err)
    return 'a professional environment'
  }
}
