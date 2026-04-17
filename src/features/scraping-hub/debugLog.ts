/**
 * Rolling buffer localStorage des 30 dernières requêtes Jina + LLM.
 * Utilisé par l'onglet Debug du Scraping Hub.
 */

const STORAGE_KEY = 'scraping.debugLog'
const MAX_ENTRIES = 30

export type DebugEntry =
  | {
      id: string
      timestamp: number
      kind: 'jina'
      url: string
      method: 'GET'
      headers: Record<string, string>
      response?: string // markdown, tronqué à 50 Ko
      durationMs: number
      error?: string
    }
  | {
      id: string
      timestamp: number
      kind: 'llm'
      provider: string
      model: string
      task: string
      temperature: number
      messages: Array<{ role: string; content: string }>
      tool_name?: string
      response?: string // JSON stringifié, tronqué à 50 Ko
      durationMs: number
      error?: string
    }

function truncate(s: string, max = 50_000): string {
  return s.length > max ? s.slice(0, max) + `\n…[tronqué à ${max} caractères]` : s
}

export function readDebugLog(): DebugEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as DebugEntry[]
  } catch {
    return []
  }
}

export function appendDebugEntry(entry: DebugEntry): void {
  const current = readDebugLog()
  if (entry.response) entry.response = truncate(entry.response)
  if (entry.kind === 'llm') {
    entry.messages = entry.messages.map((m) => ({ role: m.role, content: truncate(m.content) }))
  }
  const next = [entry, ...current].slice(0, MAX_ENTRIES)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch (err) {
    console.warn('[debugLog] localStorage write failed', err)
  }
}

export function clearDebugLog(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
