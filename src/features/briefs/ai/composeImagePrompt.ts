import { getApiKey } from '@/lib/apiKeys'
import type { Brief, CartItem } from '@/features/briefs/types'

const MODEL = 'gemini-3.1-pro-preview'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

interface GroundedResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}

export type ImageTarget =
  | { kind: 'hero' }
  | { kind: 'product'; item: CartItem }
  | { kind: 'staging_scene'; items: CartItem[] }

/**
 * Traduit FIDÈLEMENT le brief créatif en un prompt image Nano Banana.
 *
 * Différence clé avec les anciens builders : on n'écrase PAS la direction
 * artistique par un template figé. Tout ce que le client a écrit
 * (contextSummary, réponses dynamiques, palette, ambiance, ton, sujet…) est
 * réinjecté dans le prompt via un LLM text qui compose un prompt image en
 * anglais, visuel et concret, prêt pour Nano Banana 2.
 */
export async function composeImagePrompt(
  brief: Brief,
  target: ImageTarget,
  scene: string,
): Promise<string> {
  const apiKey = getApiKey('gemini')

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

  let subjectDirective = ''
  if (target.kind === 'hero') {
    subjectDirective =
      'Subject: the hero visual of the campaign — capture the event/brand atmosphere and emotional core. No print product must be visible. Wide editorial framing.'
  } else if (target.kind === 'product') {
    subjectDirective = `Subject: a photorealistic hero shot of a single "${target.item.name}" (print product), shown realistically in the described environment. Show the product clearly with believable materials and finishing.`
  } else {
    const list = target.items
      .slice(0, 8)
      .map((i) => i.name)
      .join(', ')
    subjectDirective = `Subject: a branded promotional staging featuring these print products: ${list}. Arrange them naturally in the described environment, editorial composition.`
  }

  // Fallback déterministe si pas de clé ou erreur : on concatène tout verbatim.
  const verbatimFallback = (): string => {
    const parts: string[] = []
    parts.push(`Photorealistic photograph. Scene: ${scene}.`)
    parts.push(subjectDirective)
    if (context) parts.push(`Creative brief (verbatim, must be honored): ${context}`)
    if (answerLines) parts.push(`Project details:\n${answerLines}`)
    parts.push(
      'Honor the art direction, palette, mood and subject described above literally. Photorealistic, high-end editorial quality, print-ready.',
    )
    return parts.join('\n\n')
  }

  if (!apiKey) return verbatimFallback()

  const metaPrompt = `You are an expert art director. Convert the following creative brief into ONE image-generation prompt for Nano Banana 2 (Gemini image model).

Rules:
- Output English only.
- Maximum ~140 words.
- Be visually concrete: subject, composition, framing, lighting, palette, mood, materials, typography style if mentioned.
- Preserve EVERY piece of art direction from the brief (palette, ambiance, tone, iconography, era, subject, venue, artist…). Do NOT generalize to a bland "professional environment".
- Do NOT invent brand logos or text overlays.
- Do NOT mention print formats, bleed, cut marks, legal mentions, or any production constraint — those belong to the print file, not the image.
- Start directly with the visual description. No preamble, no bullet lists, no markdown.

Client context:
- Company / organizer: ${company || '(not specified)'}
- Sector: ${sector || '(not specified)'}
- Real-world scene (already researched): ${scene}

Creative brief (verbatim — this is the source of truth):
${context || '(none)'}

${answerLines ? `Additional project answers:\n${answerLines}\n` : ''}
${subjectDirective}

Now write the Nano Banana prompt:`

  try {
    const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: metaPrompt }] }],
        generationConfig: { temperature: 0.6 },
      }),
    })
    if (!res.ok) {
      console.warn('[composeImagePrompt] HTTP', res.status, (await res.text()).slice(0, 200))
      return verbatimFallback()
    }
    const data = (await res.json()) as GroundedResponse
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || '')
      .join(' ')
      .trim()
    if (!text) return verbatimFallback()
    const clean = text.replace(/^["'«»]+|["'«»]+$/g, '').trim()
    console.log('[composeImagePrompt]', target.kind, '→', clean)
    return clean
  } catch (err) {
    console.warn('[composeImagePrompt] échec', err)
    return verbatimFallback()
  }
}
