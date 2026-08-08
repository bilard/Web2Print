// Le prompt d'un lot d'enrichissement, et le schéma de sa réponse. PUR.
//
// ⚠ LA CONSIGNE DE L'UTILISATEUR PART EN TÊTE, VERBATIM. Aucun brief maison ne la précède,
// ne la reformule ni ne la « complète ». Ce qui suit n'est que du CONTEXTE (les textes à
// traiter) et des CONTRAINTES techniques (ce que la vérification refusera de toute façon).
// En cas de conflit entre les deux, c'est la consigne qui gagne — l'utilisateur a été
// explicite là-dessus, et le contre-exemple lui a coûté quatre itérations sur un autre
// module : deux réécritures empilées entre sa demande et le modèle produisaient l'inverse
// de ce qu'il demandait.
import { z } from 'zod'
import type { EnrichKind } from './revision'
import { unitKey, type EnrichUnit } from './pass'
import { aiHints, renderTemplate } from './template'

/**
 * Contraintes de FORME, jamais de contenu.
 *
 * Elles ne remplacent pas la vérification qui suit — un modèle qui promet de recopier une
 * référence peut très bien l'altérer. Elles servent à ce qu'il ne le fasse pas par
 * mégarde, et à ce que ses refus soient rares.
 */
const RULES = `Contraintes de forme, à respecter quoi qu'il arrive :
- recopie EXACTEMENT les références, codes article et codes-barres : chiffre pour chiffre, sans corriger ce qui te semble mal formé ;
- recopie EXACTEMENT les valeurs chiffrées et leurs unités : « 510 mm » ne devient ni « 51 cm » ni « environ 50 cm » ;
- n'ajoute JAMAIS une marque ou un fabricant absent du texte d'origine, et ne traduis pas ceux qui y sont ;
- n'invente aucune caractéristique : tu reformules ce qui est là, tu ne complètes pas avec ce que tu sais du produit ;
- réponds en français.`

/** Ce qu'on attend du modèle pour chaque texte du lot. */
export const EnrichBatchSchema = z.object({
  results: z.array(z.object({
    id: z.string(),
    text: z.string(),
    /** Ce qui a été changé, en une phrase. Facultatif : le lot peut le désactiver. */
    note: z.string().optional(),
  })),
})
export type EnrichBatch = z.infer<typeof EnrichBatchSchema>

export function schemaForLLM(withNote: boolean): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        description: 'Un objet par texte reçu, avec le MÊME identifiant.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: "L'identifiant reçu, recopié tel quel" },
            text: { type: 'string', description: 'Le texte final, sans guillemets ni préfixe' },
            ...(withNote
              ? { note: { type: 'string', description: 'Ce que tu as changé, en une phrase courte et concrète' } }
              : {}),
          },
          required: withNote ? ['id', 'text', 'note'] : ['id', 'text'],
        },
      },
    },
    required: ['results'],
  }
}

/** Ce que le passage attend, selon la nature du travail. Court : la consigne de
 *  l'utilisateur porte l'essentiel, ceci ne fait que nommer la tâche. */
const KIND_LINE: Record<EnrichKind, string> = {
  translate: 'Traduis en français chacun des textes ci-dessous.',
  improve: 'Rends chacun des textes ci-dessous plus explicite, à partir de ce qu’il contient déjà.',
  structure: 'Produis, pour chaque entrée, le morceau demandé — rien d’autre.',
}

export interface PromptOptions {
  /** Demander une justification par texte (alimente l'écran de comparaison). */
  withNote?: boolean
}

/**
 * Construit le prompt d'un lot.
 *
 * Les unités d'un lot partagent la même consigne (elles viennent du même plan de champ) :
 * elle n'est donc écrite qu'une fois, en tête, et les textes suivent avec leur identifiant.
 */
export function buildBatchPrompt(units: EnrichUnit[], opts: PromptOptions = {}): string {
  if (units.length === 0) return ''
  const plan = units[0].plan
  const consigne = plan.prompt.trim()

  const items = units.map((u) => {
    const lines = [`--- ${JSON.stringify(u.field)} id=${JSON.stringify(unitKey(u))}`]
    if (u.sourceLang) lines.push(`langue détectée : ${u.sourceLang}`)
    lines.push(u.text)
    // Le gabarit ne demande au modèle QUE ses morceaux manquants : le reste est assemblé
    // sans lui, à partir de colonnes déjà remplies.
    const hints = plan.template ? aiHints(plan.template) : []
    if (hints.length > 0) lines.push(`à produire : ${hints.join(' ; ')}`)
    return lines.join('\n')
  })

  return [
    consigne,
    '',
    KIND_LINE[plan.kind],
    '',
    RULES,
    ...(opts.withNote ? ['- indique en une phrase ce que tu as changé.'] : []),
    '',
    'Textes :',
    items.join('\n\n'),
  ].filter((s) => s !== undefined).join('\n')
}

/**
 * Rattache les réponses à leurs unités.
 *
 * ⚠ LÈVE si un identifiant est inconnu, plutôt que de l'ignorer. Un modèle qui renvoie un
 * identifiant fabriqué a probablement décalé toute sa liste ; écrire ce qui « colle » et
 * jeter le reste répartirait les textes sur les mauvais produits — une corruption
 * silencieuse, découverte des semaines plus tard. Le même garde-fou existe dans le moteur
 * de complétion de colonne, pour la même raison.
 */
export function mapBatch(
  parsed: EnrichBatch,
  units: EnrichUnit[],
): { texts: Record<string, string>; notes: Record<string, string> } {
  const known = new Set(units.map(unitKey))
  const texts: Record<string, string> = {}
  const notes: Record<string, string> = {}
  for (const r of parsed.results) {
    if (!known.has(r.id)) throw new Error(`Réponse inattendue pour « ${r.id} » : le lot ne contenait pas ce texte.`)
    const text = String(r.text ?? '').trim()
    if (!text) continue
    texts[r.id] = text
    if (r.note) notes[r.id] = String(r.note).trim()
  }
  return { texts, notes }
}

/** Assemble le texte final d'une unité à gabarit : les morceaux du modèle rejoignent les
 *  colonnes déjà remplies. Sans gabarit, le texte du modèle est le résultat. */
export function finalText(unit: EnrichUnit, produced: string): string {
  if (!unit.plan.template) return produced
  return renderTemplate(unit.plan.template, unit.row, unit.text, [produced])
}
