// functions/src/telegram/askLlmServer.ts
// Réponse « libre » serveur avec contexte web — port du pipeline client
// (askLlmFromInbox) : PLAN (faut-il chercher ?) → FETCH (Jina : URLs du message
// + recherche) → ANSWER (réponse contextualisée). Dégrade gracieusement : sans
// résultat web, on répond avec les connaissances du modèle.
import { callLlm, parseLlmJson } from '../workflow/llm'
import { jinaRead, jinaSearch } from '../workflow/jina'

const MAX_PAGE_CHARS = 6000
const MAX_SNIPPETS = 5

interface Plan {
  needsWeb?: boolean
  searchQuery?: string
  answer?: string
}

export interface AskResult {
  answer: string
  model: string
  sources: string[]
}

function extractUrls(text: string): string[] {
  return Array.from(new Set(text.match(/https?:\/\/[^\s,;]+/gi) ?? [])).slice(0, 2)
}

function planPrompt(question: string): string {
  return `Tu prépares la réponse à un message Telegram. Décide s'il faut une recherche web
(temps réel, actualités, prix, météo, contenu d'une URL) ou si tu peux répondre directement.
Réponds UNIQUEMENT en JSON : {"needsWeb": true|false, "searchQuery": "mots-clés si needsWeb",
"answer": "réponse directe en français si needsWeb=false, sinon vide"}.

Message : ${question}`
}

function answerPrompt(question: string, context: string): string {
  return `Tu es l'assistant Telegram de l'application Web2Print. Réponds en FRANÇAIS, concis
(chat mobile), texte simple. Appuie-toi sur le CONTEXTE WEB ci-dessous quand il est pertinent ;
sinon réponds avec tes connaissances.

═══ CONTEXTE WEB ═══
${context || '(aucun résultat web)'}

═══ MESSAGE ═══
${question}`
}

export async function askLlmServer(uid: string, question: string): Promise<AskResult> {
  const sources: string[] = []
  const chunks: string[] = []
  const urls = extractUrls(question)

  // 1) PLAN — sauf si le message contient déjà des URLs (lecture directe).
  let searchQuery = ''
  if (urls.length === 0) {
    const { text, model } = await callLlm(uid, planPrompt(question))
    const plan = parseLlmJson<Plan>(text)
    if (plan && plan.needsWeb === false && plan.answer?.trim()) {
      return { answer: plan.answer.trim(), model, sources: [] }
    }
    searchQuery = plan?.searchQuery?.trim() || question.slice(0, 120)
  }

  // 2) FETCH — best-effort : chaque échec Jina est ignoré.
  for (const url of urls) {
    try {
      const page = await jinaRead(uid, url)
      chunks.push(`【${page.title || url}】\n${page.content.slice(0, MAX_PAGE_CHARS)}`)
      sources.push(url)
    } catch { /* page illisible : on continue */ }
  }
  if (urls.length === 0 && searchQuery) {
    try {
      const results = await jinaSearch(uid, searchQuery)
      for (const r of results.slice(0, MAX_SNIPPETS)) {
        chunks.push(`【${r.title}】 ${r.url}\n${r.snippet}`)
        sources.push(r.url)
      }
      // Lit la première page en entier pour les questions factuelles.
      if (results[0]?.url) {
        try {
          const page = await jinaRead(uid, results[0].url)
          chunks.push(`【Contenu complet — ${page.title}】\n${page.content.slice(0, MAX_PAGE_CHARS)}`)
        } catch { /* snippet seul */ }
      }
    } catch { /* recherche indisponible : réponse sans contexte */ }
  }

  // 3) ANSWER.
  const { text, model } = await callLlm(uid, answerPrompt(question, chunks.join('\n\n')))
  return { answer: text.trim(), model, sources: sources.slice(0, 5) }
}
