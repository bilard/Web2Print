// src/features/telegram/runWorkflowFromInbox.ts
// Logique PURE de la commande /run : résoudre un workflow sauvegardé par son nom, et y injecter
// le texte d'entrée. Aucune dépendance Firebase — l'orchestration (listWorkflows + exécution)
// reste dans le worker. Testable isolément.
import type { Workflow } from '@/features/workflows/types'

export type RunResolution =
  | { ok: true; workflow: Workflow; input: string }
  | { ok: false; reason: 'no-name' | 'not-found'; available: string[] }

/**
 * Résout le workflow visé par `/run <nom> <texte>`. Le nom n'a pas de délimiteur : on retient le
 * plus LONG nom de workflow réel qui préfixe le texte (insensible à la casse) ; le reste est le
 * texte d'entrée. `/run` seul (rest vide) → liste les workflows disponibles (reason 'no-name').
 */
export function resolveRun(workflows: Workflow[], rest: string): RunResolution {
  const trimmed = rest.trim()
  const available = workflows.map((w) => w.name).filter(Boolean)
  if (!trimmed) return { ok: false, reason: 'no-name', available }

  const lower = trimmed.toLowerCase()
  const match = workflows
    .filter((w) => {
      const n = w.name?.toLowerCase()
      if (!n) return false
      // Nom exact, ou suivi d'un séparateur (espace ou « : ») — pas un simple préfixe de mot
      // (« Scrape » ne doit pas matcher « Scraper x »).
      return lower === n || (lower.startsWith(n) && /^[\s:]/.test(trimmed.slice(n.length)))
    })
    .sort((a, b) => b.name.length - a.name.length)[0]

  if (!match) return { ok: false, reason: 'not-found', available }
  // Strip d'un séparateur « : » naturel (`Scrape : url`, `Scrape: url`) — pas les tirets, pour ne
  // pas mordre un input légitime comme « -5 widgets ».
  const input = trimmed.slice(match.name.length).replace(/^\s*:\s*/, '').trim()
  return { ok: true, workflow: match, input }
}

/** Extrait les URLs http(s) d'un texte (une par ligne). Vide si aucune. */
function extractUrls(text: string): string {
  const matches = text.match(/https?:\/\/[^\s,;]+/gi)
  return matches ? Array.from(new Set(matches)).join('\n') : ''
}

// Nodes d'ENTRÉE alimentables par /run → champ de config recevant le texte d'entrée.
const ENTRY_FIELD: Record<string, string> = {
  'text-input': 'text', // Saisie texte
  'scrape-url': 'urls', // Scrape URL (lit ses URLs depuis la config, pas d'un port d'entrée)
}

/**
 * Injecte le texte d'entrée dans le node d'entrée du workflow. Routage par STRUCTURE (prévisible
 * depuis le graphe que l'utilisateur a construit) :
 *  - seul un Scrape URL présent → alimente ses `urls` ;
 *  - seul une Saisie texte présente → alimente son `text` ;
 *  - les deux présents → départage par le contenu (URL → Scrape URL, sinon Saisie texte) ;
 *  - aucun → rien (injected = 0, le worker avertit).
 * Retourne un CLONE (même id que l'original) : le worker l'exécute, et le persiste via saveWorkflow
 * quand injected > 0 pour que la valeur soit visible/réutilisable dans l'éditeur.
 */
export function injectInput(wf: Workflow, input: string): { workflow: Workflow; injected: number } {
  if (!input) return { workflow: wf, injected: 0 }
  const hasText = wf.nodes.some((n) => n.type === 'text-input')
  const hasScrape = wf.nodes.some((n) => n.type === 'scrape-url')

  let targetType: string | null = null
  if (hasText && hasScrape) targetType = /https?:\/\//i.test(input) ? 'scrape-url' : 'text-input'
  else if (hasScrape) targetType = 'scrape-url'
  else if (hasText) targetType = 'text-input'
  if (!targetType) return { workflow: wf, injected: 0 }

  const field = ENTRY_FIELD[targetType]
  // Pour Scrape URL, on extrait la/les URL(s) du texte (robuste aux préfixes parasites type
  // « /run Scrape https://… ») ; sinon on injecte le texte tel quel.
  const value =
    targetType === 'scrape-url' ? extractUrls(input) || input : input
  let injected = 0
  const nodes = wf.nodes.map((n) => {
    if (n.type !== targetType) return n
    injected++
    return { ...n, config: { ...(n.config as Record<string, unknown>), [field]: value } }
  })
  return { workflow: { ...wf, nodes }, injected }
}
