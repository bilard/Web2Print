import { useMutation } from '@tanstack/react-query'
import { getApiKey } from '@/lib/apiKeys'

const MODEL = 'claude-opus-4-7'

const SYSTEM_PROMPT =
  "Tu es un directeur artistique spécialisé dans la rédaction de prompts pour la génération d'images promotionnelles print (affiches, flyers, bannières). " +
  "Ta mission : reformuler un brief court en un prompt dense et actionnable pour un modèle génératif d'image. " +
  "Tu clarifies : le sujet principal, l'ambiance visuelle, la palette de couleurs, la typographie suggérée, la hiérarchie des éléments (titre, prix, CTA, visuel produit), le style graphique (moderne, bold, rétro…). " +
  "Tu gardes l'intention d'origine, tu n'inventes aucun chiffre ni marque absents. " +
  "Réponds UNIQUEMENT en français, en un paragraphe dense (3-6 phrases), sans préambule, sans guillemets, sans commentaire méta, sans liste à puces."

interface AnthropicTextResponse {
  content?: Array<{ type: string; text?: string }>
}

async function improveDesignPrompt(current: string): Promise<string> {
  const apiKey = getApiKey('anthropic')
  if (!apiKey) throw new Error('Clé Anthropic absente. Configurez-la dans Réglages.')

  const trimmed = current.trim()
  if (!trimmed) throw new Error('Le prompt est vide.')

  const response = await fetch('/api/claude-vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content:
            'Voici le brief actuel à améliorer. Renvoie UNIQUEMENT la version améliorée, sans introduction ni explication :\n\n' +
            trimmed,
        },
      ],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Claude API ${response.status} : ${body.slice(0, 300)}`)
  }

  const data = (await response.json()) as AnthropicTextResponse
  const text = data.content?.find((b) => b.type === 'text')?.text?.trim()
  if (!text) throw new Error('Claude : réponse vide')
  return text
}

export function useImproveDesignPrompt() {
  return useMutation({
    mutationFn: (current: string) => improveDesignPrompt(current),
  })
}
