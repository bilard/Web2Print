import { getApiKey } from '@/lib/apiKeys'
import { recordAiUsage } from '@/features/stats/aiUsageTracking'
import { useAiActivityStore, nextAiActivityId } from '@/stores/aiActivity.store'

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const CLAUDE_MODEL = 'claude-opus-4-7'

const GEMINI_MODEL = 'gemini-3.1-pro-preview'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const SYSTEM_PROMPT =
  "You rewrite short image briefs into rich Nano Banana 2 prompts (Google Gemini 3.1 image gen).\n\n" +
  "RULES:\n" +
  "1. Keep EVERY concrete element the user named: brand names, slogans/baselines, exact counts (3 products = 3), dimensions, colors, scene intent.\n" +
  "2. Brands and slogans/baselines stay in their original language. Wrap slogans in double quotes and tell NB2 to render them legibly.\n" +
  "3. Use given physical dimensions to drive in-scene scale (e.g. 3×3 m tent → realistic grass and human-scale references around it).\n" +
  "4. Enrich the rest in English: composition, framing, lighting, palette, materials, lens, photographic quality.\n" +
  "5. Output ONE dense paragraph, 100-180 words. No preamble, no markdown, no bullets, no surrounding quotes, no commentary.\n\n" +
  "EXAMPLE\n" +
  "User brief: « Mets le sac à dos Quechua bleu et la tente Forclaz orange dans la nature avec le slogan \"Bien plus que du sport\". » \n" +
  "Output: Lifestyle outdoor photograph showcasing two distinct Quechua and Forclaz products staged in a single continuous mountain meadow scene at golden hour. " +
  "A blue Quechua backpack rests in the left foreground, original colorway preserved, fabric textures sharp; an orange Forclaz tent stands pitched in the midground, " +
  "roughly 2 m tall, dewy grass blades at realistic 5–10 cm scale around its footprint. Decathlon branding visible on both items, with the baseline " +
  "\"Bien plus que du sport\" rendered legibly across the lower third of the frame in clean sans-serif. Soft warm rim light, lush pine treeline behind, " +
  "low haze, mid-altitude meadow. Wide-angle 35 mm lens, eye-level composition, shallow depth of field. Photorealistic, highly detailed, sharp focus, " +
  "professional outdoor brand photography, 8k."

const userInstruction = (current: string) =>
  "Rewrite the following brief into one Nano Banana 2 prompt following the rules. Return ONLY the rewritten prompt paragraph, nothing else.\n\nBRIEF:\n" +
  current.trim()

/** Nettoie guillemets accidentels en début/fin de chaîne. */
const stripWrappingQuotes = (s: string) => s.replace(/^["'`]+|["'`]+$/g, '').trim()

interface AnthropicTextResponse {
  content?: Array<{ type: string; text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
  stop_reason?: string
}

interface GeminiTextResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> }
    finishReason?: string
  }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    thoughtsTokenCount?: number
    totalTokenCount?: number
  }
}

async function improveViaClaude(current: string): Promise<string> {
  const apiKey = getApiKey('anthropic')
  if (!apiKey) throw new Error('Clé Anthropic absente.')

  const activity = useAiActivityStore.getState()
  const activityId = nextAiActivityId('img-prompt')
  activity.start({
    id: activityId,
    provider: 'claude',
    model: CLAUDE_MODEL,
    label: 'Amélioration prompt image',
    kind: 'json',
  })

  try {
    const res = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userInstruction(current) }],
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Anthropic API ${res.status} : ${body.slice(0, 300)}`)
    }

    const data = (await res.json()) as AnthropicTextResponse
    const tokensIn = data.usage?.input_tokens ?? 0
    const tokensOut = data.usage?.output_tokens ?? 0
    const costUsd = recordAiUsage({
      provider: 'claude',
      model: CLAUDE_MODEL,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
    })

    const text = data.content?.find((b) => b.type === 'text')?.text?.trim()
    console.log(
      `[improveImagePrompt][Claude] stop=${data.stop_reason} outTok=${tokensOut} len=${text?.length ?? 0}`,
    )
    if (!text) {
      activity.end(activityId, 'error', { errorMessage: 'Réponse vide' })
      throw new Error('Claude : réponse vide')
    }
    if (data.stop_reason === 'max_tokens') {
      console.warn('[improveImagePrompt][Claude] sortie tronquée par max_tokens — augmente max_tokens.')
    }

    activity.end(activityId, 'success', { inputTokens: tokensIn, outputTokens: tokensOut, costUsd })
    return stripWrappingQuotes(text)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    activity.end(activityId, 'error', { errorMessage: message })
    throw err
  }
}

async function improveViaGemini(current: string): Promise<string> {
  const apiKey = getApiKey('gemini')
  if (!apiKey) throw new Error('Clé Gemini absente.')

  const activity = useAiActivityStore.getState()
  const activityId = nextAiActivityId('img-prompt')
  activity.start({
    id: activityId,
    provider: 'gemini',
    model: GEMINI_MODEL,
    label: 'Amélioration prompt image (fallback)',
    kind: 'json',
  })

  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userInstruction(current) }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingLevel: 'LOW', includeThoughts: false },
        },
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Gemini API ${res.status} : ${body.slice(0, 300)}`)
    }

    const data = (await res.json()) as GeminiTextResponse
    const tokensIn = data.usageMetadata?.promptTokenCount ?? 0
    const tokensOut = data.usageMetadata?.candidatesTokenCount ?? 0
    const thoughtsTokens = data.usageMetadata?.thoughtsTokenCount ?? 0
    const finishReason = data.candidates?.[0]?.finishReason
    const costUsd = recordAiUsage({
      provider: 'gemini',
      model: GEMINI_MODEL,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
    })

    const text = data.candidates?.[0]?.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('')
      .trim()
    console.log(
      `[improveImagePrompt][Gemini] finishReason=${finishReason} outTok=${tokensOut} thoughtTok=${thoughtsTokens} len=${text?.length ?? 0}`,
    )
    if (!text) {
      activity.end(activityId, 'error', { errorMessage: 'Réponse vide' })
      throw new Error('Gemini : réponse vide')
    }
    if (finishReason && finishReason !== 'STOP') {
      console.warn(`[improveImagePrompt][Gemini] finishReason=${finishReason} (sortie potentiellement tronquée).`)
    }

    activity.end(activityId, 'success', { inputTokens: tokensIn, outputTokens: tokensOut, costUsd })
    return stripWrappingQuotes(text)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    activity.end(activityId, 'error', { errorMessage: message })
    throw err
  }
}

/**
 * Réécrit un prompt utilisateur pour la génération d'image Nano Banana 2.
 * Le meta-prompt cible spécifiquement les axes que NB2 sait exploiter :
 * sujet précis, style visuel, composition/cadrage, éclairage, palette, qualité.
 *
 * Cascade : Claude Opus 4.7 (primaire) → Gemini 3.1 Pro (fallback). Le fallback
 * couvre les cas de quota plafonné côté Anthropic — fréquent en fin de mois.
 * Renvoie un prompt en ANGLAIS (NB2 nettement plus précis en EN).
 */
export async function improveImagePrompt(current: string): Promise<string> {
  const hasClaude = !!getApiKey('anthropic')
  const hasGemini = !!getApiKey('gemini')

  if (hasClaude) {
    try {
      return await improveViaClaude(current)
    } catch (err) {
      if (!hasGemini) throw err
      console.warn('[improveImagePrompt] Claude a échoué, fallback Gemini. Cause:', err)
      return await improveViaGemini(current)
    }
  }

  if (hasGemini) return await improveViaGemini(current)

  throw new Error('Aucune clé disponible (ni Anthropic ni Gemini). Configurez-les dans Réglages.')
}
