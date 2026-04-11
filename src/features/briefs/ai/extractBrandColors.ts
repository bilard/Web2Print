import { getApiKey } from '@/lib/apiKeys'

const MODEL = 'gemini-2.5-flash'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

export interface ExtractedBrandColors {
  primary?: string
  secondary?: string
}

const SCHEMA = {
  type: 'object',
  properties: {
    primary: { type: 'string', description: 'Couleur primaire au format hex #RRGGBB' },
    secondary: { type: 'string', description: 'Couleur secondaire au format hex #RRGGBB' },
  },
}

const PROMPT =
  'Analyse ce document de charte graphique. Identifie les 2 couleurs principales de la marque (primaire et secondaire). Retourne uniquement un JSON {"primary":"#RRGGBB","secondary":"#RRGGBB"}. Si une couleur ne peut être identifiée, omets-la.'

async function fileToBase64(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/**
 * Demande à Gemini d'extraire les couleurs primaire/secondaire d'un fichier
 * (PDF ou image). Renvoie {} si l'API échoue ou si rien n'est détecté.
 */
export async function extractBrandColorsFromFile(
  file: File | Blob,
  mimeType: string,
): Promise<ExtractedBrandColors> {
  const apiKey = getApiKey('gemini')
  if (!apiKey) return {}
  // Gemini accepte PDF et images en inline_data. ZIP non supporté.
  const supported = mimeType === 'application/pdf' || mimeType.startsWith('image/')
  if (!supported) return {}

  try {
    const data = await fileToBase64(file)
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), 120_000)
    const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mimeType, data } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: SCHEMA,
          temperature: 0.1,
        },
      }),
    })
    clearTimeout(timeoutId)
    if (!res.ok) return {}
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return {}
    const parsed = JSON.parse(text) as ExtractedBrandColors
    return {
      primary: normalizeHex(parsed.primary),
      secondary: normalizeHex(parsed.secondary),
    }
  } catch (err) {
    console.warn('[extractBrandColors] échec', err)
    return {}
  }
}

function normalizeHex(input: string | undefined): string | undefined {
  if (!input) return undefined
  const v = input.trim()
  return /^#?[0-9A-Fa-f]{6}$/.test(v) ? (v.startsWith('#') ? v : `#${v}`) : undefined
}
