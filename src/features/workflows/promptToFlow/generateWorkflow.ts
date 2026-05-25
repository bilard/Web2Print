// src/features/workflows/promptToFlow/generateWorkflow.ts
import { z } from 'zod'
import { generateJson, type LLMProviderId } from '@/features/ai/llmRouter'
import { buildRegistryContext } from './buildRegistryContext'
import type { RawGraph } from './types'

const rawSchema = z.object({
  title: z.string(),
  summary: z.string(),
  nodes: z.array(
    z.object({
      ref: z.string(),
      type: z.string(),
      label: z.string().optional(),
      config: z.record(z.string(), z.unknown()).optional(), // zod v4 : record à 2 args (clé, valeur)
    }),
  ),
  edges: z.array(
    z.object({ from: z.string(), fromPort: z.string(), to: z.string(), toPort: z.string() }),
  ),
})

const schemaForLLM: Record<string, unknown> = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Titre court du workflow.' },
    summary: { type: 'string', description: 'Résumé en une phrase.' },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string', description: 'Référence locale unique (ex: n1).' },
          type: { type: 'string', description: "Type exact d'un node du catalogue." },
          label: { type: 'string' },
          config: { type: 'object', description: 'Valeurs de config déduites du prompt.' },
        },
        required: ['ref', 'type'],
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'ref du node source.' },
          fromPort: { type: 'string', description: 'nom du port de sortie.' },
          to: { type: 'string', description: 'ref du node cible.' },
          toPort: { type: 'string', description: "nom du port d'entrée." },
        },
        required: ['from', 'fromPort', 'to', 'toPort'],
      },
    },
  },
  required: ['title', 'summary', 'nodes', 'edges'],
}

export interface GenerateWorkflowOptions {
  forceProvider?: LLMProviderId
  /** Messages d'erreur d'une tentative précédente, injectés pour réparation. */
  repairIssues?: string[]
}

function buildPrompt(catalog: string, userPrompt: string, opts?: GenerateWorkflowOptions): string {
  const parts: string[] = []
  parts.push(
    `Tu es un architecte de workflows data. À partir de la demande de l'utilisateur, conçois un
workflow en sélectionnant UNIQUEMENT des nodes du catalogue ci-dessous, en les connectant de
manière cohérente, et en émettant le résultat via l'outil.

RÈGLES IMPÉRATIVES :
- N'utilise QUE des "type" présents dans le catalogue. N'invente jamais de type ni de port.
- Connecte un port de sortie à un port d'entrée de TYPE compatible (même type, ou cible "any").
  Le suffixe "*" sur un port d'entrée signale qu'il est REQUIS : il doit recevoir une connexion.
- Les nodes "in: (aucun)" sont des sources (Upload, Scrape URL, imports Drive) : ne leur connecte
  aucune entrée.
- Donne à chaque node une "ref" locale unique (n1, n2, …) ; les edges référencent ces refs.
- Pré-remplis "config" au mieux à partir de la demande, en utilisant EXACTEMENT les noms de champs
  de config indiqués (ex: urlColumn, fields, prompt, titleColumn, expression…). Laisse vide si tu
  n'as pas l'information.
- Produis un pipeline acyclique, du plus en amont (sources) vers l'aval (exports/persistance).
- Si tu places un node "send-gmail" : mets dans "to" l'adresse email mentionnée dans la demande de
  l'utilisateur (motif xxx@yyy) ; mets "subject" au titre du workflow (le "title" que tu génères) ;
  et "attachmentMode" à "source" (joindre le fichier source).`,
  )
  parts.push(`═══ CATALOGUE DES NODES ═══\n${catalog}`)
  parts.push(`═══ DEMANDE DE L'UTILISATEUR ═══\n${userPrompt}`)
  if (opts?.repairIssues && opts.repairIssues.length > 0) {
    parts.push(
      `═══ CORRECTIONS À APPORTER ═══\nLa tentative précédente comportait ces problèmes. Corrige-les :\n` +
        opts.repairIssues.map((m) => `- ${m}`).join('\n'),
    )
  }
  return parts.join('\n\n')
}

/** Appelle le LLM pour produire un graphe brut. Ne valide PAS (voir validateGraph). */
export async function generateWorkflow(
  userPrompt: string,
  opts?: GenerateWorkflowOptions,
): Promise<RawGraph> {
  const prompt = buildPrompt(buildRegistryContext(), userPrompt, opts)
  return await generateJson({
    task: 'workflow.generate',
    prompt,
    schema: rawSchema,
    schemaForLLM,
    version: 'workflow.generate.v1',
    forceProvider: opts?.forceProvider,
  })
}
