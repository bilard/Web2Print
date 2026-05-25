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
      // Config en paires {key, value} : un objet à clés arbitraires n'est pas
      // remplissable par la sortie structurée de Gemini (responseSchema sans
      // properties → {} systématique). Les paires ont un schéma défini → remplies.
      config: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
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
          config: {
            type: 'array',
            description:
              'Config du node sous forme de paires. "key" = nom EXACT d\'un champ listé dans "config:" du catalogue ; "value" = la valeur (texte). Émets une paire par champ remplissable.',
            items: {
              type: 'object',
              properties: { key: { type: 'string' }, value: { type: 'string' } },
              required: ['key', 'value'],
            },
          },
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
- "config" est une LISTE de paires {key, value} : "key" = nom EXACT d'un champ listé dans "config:"
  du catalogue, "value" = la valeur en texte. Émets une paire pour CHAQUE champ que la demande permet
  de remplir (omets ceux que tu ignores). Ex. pour send-gmail :
  [{key:"to",value:"x@y.com"},{key:"subject",value:"…"},{key:"body",value:"…"},{key:"attachmentMode",value:"source"}].
- Produis un pipeline acyclique, du plus en amont (sources) vers l'aval (exports/persistance).
- Remplis la config de CHAQUE node avec les valeurs EXPLICITES de la demande, en utilisant les noms
  de champs EXACTS listés dans "config:" du catalogue (ils incluent les champs des UIs custom).
- Si tu places un node "send-gmail" : "to" = l'email indiqué dans la demande (motif xxx@yyy) ;
  "subject" = l'objet indiqué dans la demande, sinon le titre du workflow ; "body" = le message
  indiqué dans la demande ; "attachmentMode" = "source".
- Pour joindre/sauvegarder un fichier PRODUIT en amont : "export-design" sort un port "file" — relie-le
  vers le port d'entrée "attachment" de "send-gmail" ET vers le port "file" de "gdrive-export".
- IMPORTANT : "pdf-to-svg" et "image-to-svg" ne produisent qu'un RASTER verrouillé (pas éditable).
  Dès que leur "svg" est consommé en aval (export, Drive, mail), insère un node "decompose" ENTRE la
  conversion et le consommateur, pour obtenir un SVG décomposé/éditable (textes & formes) — sinon on
  exporte juste l'image d'origine. Chaîne type : pdf-to-svg (svg) → decompose (svg) → export-design (file).`,
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
