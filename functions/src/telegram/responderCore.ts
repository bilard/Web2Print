// functions/src/telegram/responderCore.ts
// Logique PURE du répondeur Telegram serveur — portée du worker navigateur
// (src/features/telegram/inboxWorker.ts + runWorkflowFromInbox.ts) pour rester
// wire-compatible : mêmes commandes, même résolution de nom, même injection.
import { SERVER_UNSUPPORTED } from '../workflow/nodes/index'
import type { ServerWorkflow, ServerNode } from '../workflow/types'

export type InboxCommand =
  | { kind: 'flow'; prompt: string }
  | { kind: 'run'; rest: string }
  | { kind: 'clear' }
  | { kind: 'ignore' }
  | { kind: 'simple' }

/** Même grammaire que le worker navigateur (inboxWorker.parseInboxCommand). */
export function parseInboxCommand(text: string): InboxCommand {
  const t = text.trim()
  if (/^\/start\b/i.test(t)) return { kind: 'ignore' }
  const flow = /^\/flow\b\s*([\s\S]*)$/i.exec(t)
  if (flow) return { kind: 'flow', prompt: flow[1].trim() }
  const run = /^\/run\b\s*([\s\S]*)$/i.exec(t)
  if (run) return { kind: 'run', rest: run[1].trim() }
  if (/^\/(clear|purge|vider)\b/i.test(t)) return { kind: 'clear' }
  return { kind: 'simple' }
}

export type RunResolution =
  | { ok: true; workflow: ServerWorkflow; input: string }
  | { ok: false; reason: 'no-name' | 'not-found'; available: string[] }

/** Plus LONG nom de workflow qui préfixe le texte (insensible à la casse) ; le reste = entrée. */
export function resolveRun(workflows: ServerWorkflow[], rest: string): RunResolution {
  const trimmed = rest.trim()
  const available = workflows.map((w) => w.name).filter(Boolean)
  if (!trimmed) return { ok: false, reason: 'no-name', available }

  const lower = trimmed.toLowerCase()
  const match = workflows
    .filter((w) => {
      const n = w.name?.toLowerCase()
      if (!n) return false
      return lower === n || (lower.startsWith(n) && /^[\s:]/.test(trimmed.slice(n.length)))
    })
    .sort((a, b) => b.name.length - a.name.length)[0]

  if (!match) return { ok: false, reason: 'not-found', available }
  const input = trimmed.slice(match.name.length).replace(/^\s*:\s*/, '').trim()
  return { ok: true, workflow: match, input }
}

function extractUrls(text: string): string {
  const matches = text.match(/https?:\/\/[^\s,;]+/gi)
  return matches ? Array.from(new Set(matches)).join('\n') : ''
}

const ENTRY_FIELD: Record<string, string> = {
  'text-input': 'text',
  'scrape-url': 'urls',
}

/** Injecte le texte d'entrée (même routage par structure que le worker navigateur). */
export function injectInput(wf: ServerWorkflow, input: string): { workflow: ServerWorkflow; injected: number } {
  if (!input) return { workflow: wf, injected: 0 }
  const hasText = wf.nodes.some((n) => n.type === 'text-input')
  const hasScrape = wf.nodes.some((n) => n.type === 'scrape-url')

  let targetType: string | null = null
  if (hasText && hasScrape) targetType = /https?:\/\//i.test(input) ? 'scrape-url' : 'text-input'
  else if (hasScrape) targetType = 'scrape-url'
  else if (hasText) targetType = 'text-input'
  if (!targetType) return { workflow: wf, injected: 0 }

  const field = ENTRY_FIELD[targetType]
  const value = targetType === 'scrape-url' ? extractUrls(input) || input : input
  let injected = 0
  const nodes: ServerNode[] = wf.nodes.map((n) => {
    if (n.type !== targetType) return n
    injected++
    return { ...n, config: { ...(n.config as Record<string, unknown>), [field]: value } }
  })
  return { workflow: { ...wf, nodes }, injected }
}

/** Nodes exigeant un fichier choisi à la main (mêmes types que le worker navigateur). */
const MANUAL_FILE_NODE_TYPES = new Set([
  'upload', 'import-csv', 'import-idml', 'import-svg', 'import-pptx', 'import-image',
])

/**
 * Types de nodes que le SERVEUR ne peut pas exécuter (rendu navigateur, fichier
 * manuel…). Vide = exécutable côté serveur immédiatement.
 */
export function browserOnlyTypes(wf: ServerWorkflow): string[] {
  const blocked = new Set<string>()
  for (const n of wf.nodes) {
    if (MANUAL_FILE_NODE_TYPES.has(n.type) || SERVER_UNSUPPORTED.has(n.type)) blocked.add(n.type)
  }
  return [...blocked]
}

const TELEGRAM_TEXT_LIMIT = 4096

export function truncateForTelegram(text: string): string {
  if (text.length <= TELEGRAM_TEXT_LIMIT) return text
  return text.slice(0, TELEGRAM_TEXT_LIMIT - 1) + '…'
}

/** Masque un token bot dans tout message persistant/renvoyé. */
export function maskToken(msg: string): string {
  return msg.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***')
}

/** Prompt de la réponse directe (message sans commande). */
export function buildAnswerPrompt(question: string): string {
  return [
    'Tu es l\'assistant Telegram de l\'application Web2Print (PIM, scraping, workflows, éditeur print).',
    'Réponds en FRANÇAIS, de façon concise et directe (c\'est un chat mobile).',
    'Pas de markdown lourd : texte simple, listes à puces sobres si besoin.',
    '',
    `Question : ${question}`,
  ].join('\n')
}
