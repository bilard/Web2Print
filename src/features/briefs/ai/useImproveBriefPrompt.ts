import { useMutation } from '@tanstack/react-query'
import { getApiKey } from '@/lib/apiKeys'

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const MODEL = 'claude-opus-4-6'

interface AnthropicTextResponse {
  content?: Array<{ type: string; text?: string }>
}

async function improvePrompt(current: string): Promise<string> {
  const apiKey = getApiKey('anthropic')
  if (!apiKey) throw new Error('Clé Anthropic absente. Configurez-la dans Réglages.')

  const system =
    "Tu es un assistant spécialisé dans la rédaction de briefs créatifs pour des projets print et communication visuelle. " +
    "Ta mission : reformuler et enrichir un brief client pour le rendre plus clair, structuré et exploitable par une IA générative, " +
    "sans inventer d'informations absentes. Tu gardes le ton et l'intention d'origine, mais tu clarifies l'événement, le public cible, " +
    "les supports attendus, les contraintes et l'ambiance recherchée. Tu écris en français, en un paragraphe dense ou une liste courte, " +
    "sans préambule ni conclusion, sans guillemets, sans commentaire méta."

  const user =
    "Voici le brief actuel à améliorer. Renvoie UNIQUEMENT la version améliorée, sans introduction ni explication :\n\n" +
    current.trim()

  const res = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0.6,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic API ${res.status} : ${body.slice(0, 300)}`)
  }

  const data = (await res.json()) as AnthropicTextResponse
  const text = data.content?.find((b) => b.type === 'text')?.text?.trim()
  if (!text) throw new Error('Claude : réponse vide')
  return text
}

export function useImproveBriefPrompt() {
  return useMutation({
    mutationFn: (current: string) => improvePrompt(current),
  })
}
