// « Montre-moi les concurrents les moins chers » → un tableau de bord.
//
// ⚠⚠ Le modèle ne choisit RIEN qu'il n'ait sous les yeux : on lui donne les identifiants
// exacts des mesures et dimensions de la source, et on lui interdit d'en inventer. Ce qu'il
// invente malgré tout est écarté à la traduction (`planToBoard`) et rapporté à l'écran —
// jamais remplacé en silence par une mesure approchante.
import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'
import { biLabel } from '../components/biLabel'
import type { DataSource } from '../registry/types'
import type { SourceId } from '../types'
import type { BoardPlan } from './boardPlan'
import type { TranslationKey, TransParams } from '@/lib/i18n'

/** Plafond de champs décrits au modèle. Une source de feuille peut porter 300 colonnes : les
 *  envoyer toutes gonfle le prompt sans rien apporter — les premières sont les principales. */
const MAX_FIELDS = 80
/** Un tableau lisible tient en une douzaine de visuels. Au-delà, on ne lit plus rien. */
const MAX_TILES = 12

const planSchema = z.object({
  name: z.string(),
  /**
   * Source retenue par le modèle. ⚠⚠ OPTIONNELLE : les plans d'avant n'en portaient pas, et
   * un champ requis ferait échouer la validation de tout appel qui l'omet. Absente ou
   * inconnue, l'appelant garde la source active — le comportement d'avant.
   */
  source: z.string().optional(),
  tiles: z.array(z.object({
    kind: z.string(),
    title: z.string(),
    measure: z.string(),
    dimension: z.string().optional(),
    limit: z.number().optional(),
    sortDesc: z.boolean().optional(),
  })).max(MAX_TILES),
})

const SCHEMA_FOR_LLM = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Nom court du tableau de bord.' },
    source: { type: 'string', description: 'Identifiant EXACT de la source la mieux adaptée, pris dans la liste fournie.' },
    tiles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', description: 'kpi | bar | line | area | pie | doughnut | table | pivot | gauge | scatter | funnel | heatmap' },
          title: { type: 'string', description: 'Titre lisible de la tuile.' },
          measure: { type: 'string', description: 'Identifiant EXACT d’une mesure de la liste fournie.' },
          dimension: { type: 'string', description: 'Identifiant EXACT d’une dimension. Absent pour kpi et gauge.' },
          limit: { type: 'number', description: 'Nombre maximum de groupes affichés (ex. 10 pour un top 10).' },
          sortDesc: { type: 'boolean', description: 'Tri décroissant sur la mesure. Vrai par défaut.' },
        },
        required: ['kind', 'title', 'measure'],
      },
    },
  },
  required: ['name', 'tiles'],
}

type Translate = (key: TranslationKey, params?: TransParams) => string

/**
 * Décrit les sources CANDIDATES et ce qu'une ligne y représente.
 *
 * ⚠⚠ La MAILLE est ce qui manquait au modèle. Il ne recevait qu'une source, sans savoir ce
 * qu'elle décrit : sur une synthèse par concurrent, « les produits où je suis plus cher »
 * ne pouvait produire qu'un tableau par concurrent — plausible, hors sujet, et rien ne le
 * disait. Vu à l'écran, c'est ce qui a motivé ce choix explicite.
 */
function sourceMenu(sources: { id: SourceId; source: DataSource }[], t: Translate): string {
  return sources
    .map(({ id, source }) => `- ${id} : ${t(source.labelKey)} — une ligne = ${GRAIN[id] ?? '?'}`)
    .join('\n')
}

/** Ce qu'une LIGNE représente dans chaque source. */
const GRAIN: Partial<Record<SourceId, string>> = {
  'pim.products': 'un produit du catalogue',
  'watch.summary': 'un concurrent suivi',
  'watch.products': 'un produit apparié, avec mon prix et le meilleur prix concurrent',
  'watch.catalog': 'un produit du catalogue source de la veille',
  'watch.site': 'une fiche collectée chez un concurrent',
  'dam.assets': 'un visuel du DAM',
  'ai.usage': 'un appel de modèle facturé',
  'wf.runs': 'une exécution de workflow',
  'traffic.events': 'une visite',
}

/** Décrit la source au modèle : ses identifiants, avec leur nom lisible. */
function catalogue(source: DataSource, t: Translate): string {
  const dims = source.dimensions.slice(0, MAX_FIELDS)
    .map((d) => `- ${d.id} : ${d.label ?? t(d.labelKey)} (${d.kind})`).join('\n')
  const measures = source.measures.slice(0, MAX_FIELDS)
    .map((m) => `- ${m.id} : ${biLabel(m, t)}`).join('\n')
  return `DIMENSIONS (pour grouper) :\n${dims}\n\nMESURES (pour chiffrer) :\n${measures}`
}

export async function askBoardPlan(
  question: string, source: DataSource, t: Translate,
  /** Sources entre lesquelles le modèle peut CHOISIR. La première est celle affichée. */
  candidates: { id: SourceId; source: DataSource }[] = [],
): Promise<BoardPlan> {
  const others = candidates.filter((c) => c.source !== source)
  const prompt = [
    'Tu conçois un tableau de bord décisionnel à partir de la demande d’un utilisateur.',
    '',
    `DEMANDE : ${question}`,
    '',
    `SOURCE AFFICHÉE : ${t(source.labelKey)}`,
    catalogue(source, t),
    ...(others.length === 0 ? [] : [
      '',
      'AUTRES SOURCES DISPONIBLES — choisis-en une (champ `source`) si elle répond MIEUX à la',
      'demande que la source affichée, notamment quand la maille ne correspond pas :',
      sourceMenu(others, t),
      '⚠ Si tu changes de source, ne propose AUCUN champ : ceux listés plus haut appartiennent',
      'à la source affichée. Donne seulement `source`, `name` et les titres, sans `measure`.',
    ]),
    '',
    'RÈGLES ABSOLUES :',
    `- N’utilise QUE les identifiants ci-dessus. N’en invente aucun, ne les traduis pas.`,
    '- `kpi` et `gauge` n’ont PAS de dimension : ce sont des chiffres uniques.',
    '- Tout autre type EXIGE une dimension.',
    `- Entre 3 et ${MAX_TILES} tuiles. Commence par 2 à 4 indicateurs, puis les graphes.`,
    '- Les titres sont en français, courts, et disent ce que la tuile montre.',
    '- Sur un axe à nombreuses valeurs, pose un `limit` (10 ou 15) pour rester lisible.',
  ].join('\n')

  return generateJson<BoardPlan>({
    task: 'workflow.generate',
    version: 'bi.boardFromPrompt.v1',
    prompt,
    // ⚠ Le schéma zod reste PERMISSIF sur `kind` (une chaîne) : un type inconnu doit être
    // écarté par notre validation, avec un message, plutôt que de faire échouer TOUT l'appel
    // — une seule tuile mal typée ne doit pas coûter le tableau entier.
    schema: planSchema as unknown as z.ZodSchema<BoardPlan>,
    schemaForLLM: SCHEMA_FOR_LLM as unknown as Record<string, unknown>,
  })
}
