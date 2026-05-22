import { getApiKey } from '@/lib/apiKeys'

const MULTIMODAL_MODEL = 'gemini-3.1-pro-preview'
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

const MAX_INLINE_BYTES = 2 * 1024 * 1024
const MAX_TEXT_CHARS = 50_000

const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf', 'text/']

interface InlineDataPart {
  inline_data: { mime_type: string; data: string }
}
interface TextPart {
  text: string
}
type GeminiPart = InlineDataPart | TextPart

export interface FileExtractionSkip {
  name: string
  reason: string
}

export interface BriefContextResult {
  context: string
  skipped: FileExtractionSkip[]
  usedFiles: string[]
}

const SYSTEM_PROMPT = `Tu analyses des fichiers fournis par un utilisateur pour enrichir le brief d'une courte vidéo promotionnelle (10 s, 30 fps).

Extrait uniquement ce qui aide à orienter le visuel et le rythme :
- sujet principal et faits saillants (chiffres, dates, produits clés)
- ton implicite (premium / ludique / institutionnel / technique…)
- éléments graphiques notables (palette dominante, marques visibles, photos importantes)

Synthétise en français en 5 puces courtes maximum, sans markdown, sans introduction. Si un fichier est illisible ou hors sujet, ne mentionne pas le fichier.`

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)))
  }
  return btoa(bin)
}

function isAllowed(mime: string): boolean {
  if (!mime) return false
  return ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p))
}

export async function extractBriefContextFromFiles(
  files: File[],
  opts?: { signal?: AbortSignal },
): Promise<BriefContextResult> {
  const skipped: FileExtractionSkip[] = []
  const usedFiles: string[] = []
  if (files.length === 0) return { context: '', skipped, usedFiles }

  const apiKey = getApiKey('gemini')
  if (!apiKey) throw new Error('Clé Gemini absente. Configure-la dans Réglages.')

  const parts: GeminiPart[] = [{ text: SYSTEM_PROMPT }]

  for (const f of files) {
    if (!isAllowed(f.type)) {
      skipped.push({ name: f.name, reason: `Type non supporté (${f.type || 'inconnu'})` })
      continue
    }
    if (f.size > MAX_INLINE_BYTES) {
      skipped.push({ name: f.name, reason: 'Dépasse 2 MB (limite inline Gemini)' })
      continue
    }

    if (f.type.startsWith('text/')) {
      const text = await f.text()
      const trimmed = text.slice(0, MAX_TEXT_CHARS)
      parts.push({ text: `[Document texte : ${f.name}]\n${trimmed}` })
      if (text.length > MAX_TEXT_CHARS) {
        parts.push({ text: `(document tronqué à ${MAX_TEXT_CHARS} caractères)` })
      }
      usedFiles.push(f.name)
    } else {
      const buf = await f.arrayBuffer()
      const data = arrayBufferToBase64(buf)
      parts.push({ inline_data: { mime_type: f.type, data } })
      parts.push({ text: `(fichier : ${f.name})` })
      usedFiles.push(f.name)
    }
  }

  if (usedFiles.length === 0) {
    return { context: '', skipped, usedFiles }
  }

  const ctrl = new AbortController()
  const linkAbort = () => ctrl.abort()
  if (opts?.signal) opts.signal.addEventListener('abort', linkAbort)
  const timeout = setTimeout(() => ctrl.abort(), 120_000)

  try {
    const res = await fetch(`${ENDPOINT(MULTIMODAL_MODEL)}?key=${apiKey}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingLevel: 'LOW', includeThoughts: false },
        },
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Gemini multimodal ${res.status} : ${body.slice(0, 200)}`)
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return { context: text.trim(), skipped, usedFiles }
  } finally {
    clearTimeout(timeout)
    if (opts?.signal) opts.signal.removeEventListener('abort', linkAbort)
  }
}
