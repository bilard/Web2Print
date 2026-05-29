// src/features/workflows/registry/webAskNode.ts
// Node « Question web (IA) » : combine recherche web + LLM. Récupère le contexte web
// (recherche Jina + lecture réelle des premières pages) puis fait SYNTHÉTISER une
// réponse par le LLM, ancrée sur les sources. Pendant « workflow » du chat Telegram.
// Sortie : `text` (réponse) + `sheet` (sources, pour traçabilité/export).
import { z } from 'zod'
import { Sparkles } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelSheet } from '@/features/excel/types'
import { generateJson } from '@/features/ai/llmRouter'
import { webResultsToSheet } from './webResultsSheet'

interface WebAskConfig {
  /** Question. Surchargée par une entrée `question` en amont. */
  question: string
  /** Nb max de résultats de recherche (1-20). */
  maxResults: number
  /** Nb de pages de résultats lues en entier (0-5). */
  readPages: number
}

interface WebAskInputs {
  /** Texte amont (ex. node Saisie texte) utilisé comme question s'il est fourni. */
  question?: unknown
}

interface WebAskOutputs {
  /** Réponse synthétisée par le LLM. */
  text: string
  /** Sources utilisées (titre/url/description). */
  sheet: ExcelSheet
}

const AnswerSchema = z.object({ answer: z.string() })
const ANSWER_SCHEMA_FOR_LLM = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: "Réponse à la question, concise et factuelle, dans la langue de la question." },
  },
  required: ['answer'],
} as const

export const webAskNode: NodeSpec<WebAskConfig, WebAskInputs, WebAskOutputs> = {
  type: 'web-ask',
  // 'import' (pas 'enrichment') : c'est une SOURCE autonome (question → réponse), qui
  // doit pouvoir démarrer un workflow seule. La palette verrouille l'enrichissement
  // tant qu'aucun import n'est posé. Cohérent avec web-search / scrape-url (sources web).
  category: 'import',
  label: 'Question web (IA)',
  description:
    'Pose une question : recherche le web (Jina), lit les premières pages, puis fait ' +
    "synthétiser une réponse par le LLM ancrée sur les sources. Sortie : réponse (text) + sources (sheet).",
  icon: Sparkles,
  inputs: [{ name: 'question', type: 'any', required: false }],
  outputs: [
    { name: 'text', type: 'any' },
    { name: 'sheet', type: 'sheet' },
  ],
  configSchema: [
    { name: 'question', kind: 'textarea', label: 'Question', required: true, help: 'Surchargée par une entrée « question » si branchée.' },
    { name: 'maxResults', kind: 'number', label: 'Nb de résultats', default: 5, help: '1 à 20.' },
    { name: 'readPages', kind: 'number', label: 'Pages lues en entier', default: 2, help: '0 à 5 — lit le contenu réel (données live).' },
  ],
  defaultConfig: { question: '', maxResults: 5, readPages: 2 },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const upstream = typeof inputs.question === 'string' ? inputs.question.trim() : ''
    const question = upstream || (config.question ?? '').trim()
    if (!question) {
      throw new Error('Question manquante — renseignez « Question » ou branchez une entrée question.')
    }

    ctx.log('info', `🔎 Recherche web : « ${question} »…`)
    const { gatherWebContext } = await import('@/features/scraping/webContext')
    const web = await gatherWebContext({
      searchQuery: question,
      maxResults: Number(config.maxResults) || 5,
      readPages: Number(config.readPages) || 0,
    })

    if (web.results.length === 0) {
      ctx.log('warn', '⚠️ Aucun résultat web — réponse depuis les connaissances du modèle (sans source).')
    } else {
      ctx.log('info', `${web.results.length} résultat(s), ${web.sources.length} source(s) lue(s) — synthèse IA…`)
    }

    const contextBlock = web.text || '(aucun contenu web récupéré)'
    const { answer } = await generateJson<{ answer: string }>({
      task: 'web.answer',
      version: 'web.answer.v1',
      prompt:
        "Réponds à la QUESTION en t'appuyant sur le CONTEXTE WEB ci-dessous (résultats de " +
        'recherche et/ou contenu de pages). Sois concis et factuel, dans la langue de la question. ' +
        "Si le contexte ne contient pas l'information, réponds au mieux avec tes connaissances et " +
        "signale honnêtement l'absence de source à jour.\n\n" +
        `## CONTEXTE WEB\n${contextBlock}\n\n## QUESTION\n${question}`,
      schema: AnswerSchema,
      schemaForLLM: ANSWER_SCHEMA_FOR_LLM as unknown as Record<string, unknown>,
    })

    return { text: answer, sheet: webResultsToSheet(web.results, 'Sources') }
  },
}

nodeRegistry.register(webAskNode)
