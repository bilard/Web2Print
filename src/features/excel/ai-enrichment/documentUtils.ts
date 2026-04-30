import type { EnrichedDocument } from './types'

/**
 * Libellé d'affichage garanti non-vide pour un document. Chaîne de fallback :
 * name → filename → basename(url) → url → 'Document'. Évite les cartes UI
 * blanches quand le LLM ou le scrapeur ont raté l'extraction du nom.
 */
export function displayDocumentName(doc: EnrichedDocument): string {
  const name = doc.name?.trim()
  if (name) return name
  const filename = doc.filename?.trim()
  if (filename) return filename
  const fromUrl = basenameFromUrl(doc.url)
  if (fromUrl) return fromUrl
  if (doc.url) return doc.url
  return 'Document'
}

/**
 * Extrait le basename d'une URL et le décode pour affichage humain.
 * Ex: "https://x.com/files/notice-X12345-fr.pdf?v=2" → "notice-X12345-fr.pdf"
 * Renvoie une chaîne vide si l'URL n'a pas de basename exploitable.
 */
export function basenameFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop() ?? ''
    if (!last) return ''
    return decodeURIComponent(last)
  } catch {
    const last = url.split('?')[0].split('#')[0].split('/').pop() ?? ''
    try { return decodeURIComponent(last) } catch { return last }
  }
}

/** Construit un EnrichedDocument depuis une URL et un libellé optionnel. */
export function buildDocument(url: string, name?: string | null): EnrichedDocument {
  const filename = basenameFromUrl(url) || url
  const cleanName = name && name.trim().length >= 2 ? name.trim() : filename
  return { name: cleanName, url, filename }
}

/**
 * Parse une cellule Excel `ai_documents` en tableau d'EnrichedDocument.
 * Tolère trois formats hérités :
 *  1. JSON.stringify d'un tableau d'EnrichedDocument (nouveau format canonique)
 *  2. Liste séparée par ' | ' d'entrées `titre##url` (legacy)
 *  3. Liste séparée par ' | ' d'URLs brutes (legacy)
 *
 * Garantie : ne jamais produire de données silencieusement fausses — chaque
 * entrée parsée a une URL valide ou est rejetée.
 */
export function parseDocumentsCell(raw: string | null | undefined): EnrichedDocument[] {
  if (!raw || typeof raw !== 'string') return []
  const trimmed = raw.trim()
  if (!trimmed) return []

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) {
        return parsed
          .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
          .map((d) => {
            const url = typeof d.url === 'string' ? d.url : ''
            if (!/^https?:\/\//.test(url)) return null
            const filename = typeof d.filename === 'string' && d.filename
              ? d.filename
              : basenameFromUrl(url) || url
            const name = typeof d.name === 'string' && d.name ? d.name : filename
            return { name, url, filename }
          })
          .filter((d): d is EnrichedDocument => d !== null)
      }
    } catch {
      // tombe en legacy
    }
  }

  return trimmed
    .split(' | ')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      if (entry.includes('##')) {
        const idx = entry.indexOf('##')
        const name = entry.slice(0, idx).trim()
        const url = entry.slice(idx + 2).trim()
        if (!/^https?:\/\//.test(url)) return null
        return buildDocument(url, name)
      }
      if (!/^https?:\/\//.test(entry)) return null
      return buildDocument(entry)
    })
    .filter((d): d is EnrichedDocument => d !== null)
}

/**
 * Coerce une entrée hétérogène (LLM output, ancien code, scrapeur custom) en
 * EnrichedDocument. Accepte :
 *  - string URL → buildDocument(url)
 *  - string `titre##url` → split + buildDocument
 *  - { name?, url }, { name?, value }, { name?, href }, { text?, url } → normalisé
 * Renvoie null si l'URL n'est pas exploitable.
 */
export function coerceDocument(input: unknown): EnrichedDocument | null {
  if (typeof input === 'string') {
    if (input.includes('##')) {
      const idx = input.indexOf('##')
      const name = input.slice(0, idx).trim()
      const url = input.slice(idx + 2).trim()
      if (!/^https?:\/\//.test(url)) return null
      return buildDocument(url, name)
    }
    if (!/^https?:\/\//.test(input)) return null
    return buildDocument(input)
  }
  if (input && typeof input === 'object') {
    const r = input as Record<string, unknown>
    const url = typeof r.url === 'string' ? r.url
      : typeof r.value === 'string' ? r.value
      : typeof r.href === 'string' ? r.href
      : ''
    if (!/^https?:\/\//.test(url)) return null
    const name = typeof r.name === 'string' && r.name ? r.name
      : typeof r.text === 'string' && r.text ? r.text
      : typeof r.label === 'string' && r.label ? r.label
      : null
    const filename = typeof r.filename === 'string' && r.filename
      ? r.filename
      : basenameFromUrl(url) || url
    return { name: name ?? filename, url, filename }
  }
  return null
}

/** Coerce et déduplique par URL. */
export function coerceDocuments(input: unknown): EnrichedDocument[] {
  if (!Array.isArray(input)) return []
  const out: EnrichedDocument[] = []
  const seen = new Set<string>()
  for (const item of input) {
    const doc = coerceDocument(item)
    if (!doc) continue
    if (seen.has(doc.url)) continue
    seen.add(doc.url)
    out.push(doc)
  }
  return out
}
