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
import { t } from '@/lib/i18n'

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
  hidden: true,
  // 'import' (pas 'enrichment') : c'est une SOURCE autonome (question → réponse), qui
  // doit pouvoir démarrer un workflow seule. La palette verrouille l'enrichissement
  // tant qu'aucun import n'est posé. Cohérent avec web-search / scrape-url (sources web).
  category: 'import',
  labelKey: 'node.web-ask.label',
  descriptionKey: 'node.web-ask.desc',
  icon: Sparkles,
  inputs: [{ name: 'question', type: 'any', required: false }],
  outputs: [
    { name: 'text', type: 'any' },
    { name: 'sheet', type: 'sheet' },
  ],
  configSchema: [
    { name: 'question', kind: 'textarea', labelKey: 'node.web-ask.question.label', required: true, helpKey: 'node.web-ask.question.help' },
    { name: 'maxResults', kind: 'number', labelKey: 'node.web.maxResults.label', default: 5, helpKey: 'node.web.maxResults.help' },
    { name: 'readPages', kind: 'number', labelKey: 'node.web.readPages.label', default: 2, helpKey: 'node.web.readPages.help' },
  ],
  defaultConfig: { question: '', maxResults: 5, readPages: 2 },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const upstream = typeof inputs.question === 'string' ? inputs.question.trim() : ''
    const question = upstream || (config.question ?? '').trim()
    if (!question) {
      throw new Error(t('run.ask.questionMissing'))
    }

    ctx.log('info', t('run.ask.searching', { question }))
    const { gatherWebContext } = await import('@/features/scraping/webContext')
    const web = await gatherWebContext({
      searchQuery: question,
      maxResults: Number(config.maxResults) || 5,
      readPages: Number(config.readPages) || 0,
    })

    if (web.results.length === 0) {
      ctx.log('warn', t('run.ask.noResult'))
    } else {
      ctx.log('info', t('run.ask.readSources', { results: web.results.length, sources: web.sources.length }))
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
