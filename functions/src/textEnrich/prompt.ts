// functions/src/textEnrich/prompt.ts
// ⚠ COPIE de src/features/textEnrich/prompt.ts (bundles séparés : `functions/` est hermétique,
// `rootDir: "src"`). Toute modification là-bas doit être reportée ici — cf.
// textEnrichParity.test.ts.
// Le prompt d'un lot d'enrichissement, et le schéma de sa réponse. PUR.
//
// ⚠ LA CONSIGNE DE L'UTILISATEUR PART EN TÊTE, VERBATIM. Aucun brief maison ne la précède,
// ne la reformule ni ne la « complète ». Ce qui suit n'est que du CONTEXTE (les textes à
// traiter) et des CONTRAINTES techniques (ce que la vérification refusera de toute façon).
// En cas de conflit entre les deux, c'est la consigne qui gagne — l'utilisateur a été
// explicite là-dessus, et le contre-exemple lui a coûté quatre itérations sur un autre
// module : deux réécritures empilées entre sa demande et le modèle produisaient l'inverse
// de ce qu'il demandait.
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
- ISOPÉRIMÈTRE : le texte final porte EXACTEMENT les mêmes informations que l'original. Tu reformules, tu ne résumes JAMAIS ;
- reprends TOUS les modèles, TOUTES les références, TOUS les codes et TOUS les éléments d'une énumération, un par un, sans exception — même s'ils sont trente ;
- il est INTERDIT d'abréger une liste : jamais « … », jamais « etc. », jamais « et autres », jamais « entre autres » ;
- rien ne se perd en route : si une phrase de l'original porte une information (usage, montage, sécurité, référence), elle doit se retrouver dans le texte final ;
- recopie EXACTEMENT les références, codes article et codes-barres : chiffre pour chiffre, sans corriger ce qui te semble mal formé ;
- recopie EXACTEMENT les valeurs chiffrées et leurs unités : « 510 mm » ne devient ni « 51 cm » ni « environ 50 cm » ;
- n'ajoute JAMAIS une marque ou un fabricant absent du texte d'origine, et ne traduis pas ceux qui y sont ;
- n'invente aucune caractéristique : tu reformules ce qui est là, tu ne complètes pas avec ce que tu sais du produit ;
- réponds en français.`

/**
 * Le même contrat pour un champ déclaré SYNTHÈSE ASSUMÉE (`plan.allowSummary`).
 *
 * ⚠ Sans lui, un plan « fais une synthèse courte pour le nom du produit » recevait la
 * consigne de l'utilisateur ET l'ordre de ne rien raccourcir : deux demandes opposées dans
 * le même prompt, une réponse au hasard, et un refus de la garde derrière.
 */
const SUMMARY_RULES = `Contraintes de forme, à respecter quoi qu'il arrive :
- SYNTHÈSE ASSUMÉE : ce champ doit être RACCOURCI. Tu as le droit d'écarter des éléments de l'original — c'est ce qu'on te demande ;
- garde en priorité ce qui IDENTIFIE le produit : sa nature, sa marque, sa référence, son modèle ;
- ce que tu gardes doit être recopié EXACTEMENT : références, codes et valeurs chiffrées, chiffre pour chiffre ;
- n'ajoute JAMAIS une marque ou un fabricant absent du texte d'origine ;
- n'invente aucune caractéristique : tu choisis parmi ce qui est là, tu ne complètes pas avec ce que tu sais du produit ;
- réponds en français.`

/** Ce qu'on attend du modèle pour chaque texte du lot. */

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
  // ⚠ « s'il est déjà en français, rends-le tel quel » n'est pas une politesse : depuis
  // que les textes de langue NON TRANCHÉE peuvent entrer dans la file (70 % d'un
  // catalogue de pièces, cf. `includeUndetected`), le lot contient forcément du français.
  // Sans cette consigne, le modèle reformule — et une reformulation non demandée écrase
  // un texte fournisseur correct.
  translate: 'Traduis en français chacun des textes ci-dessous. Si un texte est DÉJÀ en français, rends-le tel quel, sans le reformuler.',
  improve: 'Rends chacun des textes ci-dessous plus explicite, à partir de ce qu’il contient déjà.',
  structure: 'Produis, pour chaque entrée, le morceau demandé — rien d’autre.',
}

/** Ce qu'un lot rend. Le client l'infère de son schéma zod ; ici on l'écrit, la
 *  validation étant faite par `parseLlmJson` en amont. */
export interface EnrichBatch {
  results: { id: string; text: string; note?: string }[]
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
    // Une consigne vide est LÉGITIME pour une traduction (la nature du travail dit déjà
    // tout) : on n'ouvre alors pas le prompt sur deux lignes blanches.
    ...(consigne ? [consigne, ''] : []),
    KIND_LINE[plan.kind],
    '',
    plan.allowSummary ? SUMMARY_RULES : RULES,
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
