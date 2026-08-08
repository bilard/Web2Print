// Le prompt de l'écran « Traduire et améliorer les textes », et le schéma de sa réponse.
// PUR — aucun appel, aucun état.
//
// ⚠ NOM et DESCRIPTION sont DEUX champs distincts. Ils tenaient dans un seul, séparés par
// « | », et il suffisait que le modèle rende le nom seul — ce qu'il fait dès que la
// description est courte ou qu'elle répète le titre — pour que la description disparaisse
// sans le moindre message. Un séparateur dans le texte n'est pas un contrat, c'est un pari.
//
// ⚠ LA CONSIGNE DE L'UTILISATEUR PART EN TÊTE, VERBATIM : aucun brief maison ne la précède
// ni ne la reformule. Ce qui suit n'est que la tâche et des contraintes de FORME.
import { z } from 'zod'

export const ScreenBatchSchema = z.object({
  results: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    note: z.string().optional(),
  })),
})

export const screenSchemaForLLM: Record<string, unknown> = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      description: 'Un objet par produit reçu, avec le MÊME identifiant.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: "L'identifiant reçu, recopié tel quel" },
          name: { type: 'string', description: 'Le nom du produit en français' },
          description: {
            type: 'string',
            description: "La description en français. Obligatoire dès que le produit en avait une ; chaîne vide s'il n'en avait pas.",
          },
          note: { type: 'string', description: 'Ce que tu as changé, en une phrase courte' },
        },
        required: ['id', 'name', 'description'],
      },
    },
  },
  required: ['results'],
}

export interface PromptProduct {
  id: string
  name: string
  description?: string
  lang?: string | null
}

/**
 * Construit le prompt d'un lot.
 *
 * `instruction` est la consigne libre de l'utilisateur, recopiée telle quelle en tête.
 */
export function buildScreenPrompt(products: PromptProduct[], instruction: string): string {
  const items = products.map((p) => [
    `--- id=${JSON.stringify(p.id)}`,
    p.lang ? `langue détectée : ${p.lang}` : '',
    `nom: ${p.name}`,
    // La description est annoncée MÊME vide : sans la ligne, le modèle ne sait pas si elle
    // manque ou si on a oublié de la joindre, et il comble le silence en la réinventant.
    `description: ${p.description ?? ''}`,
  ].filter(Boolean).join('\n')).join('\n\n')

  return [
    instruction.trim(),
    instruction.trim() ? '' : undefined,
    'Traduis en français le nom et la description de chaque produit ci-dessous.',
    'Rends TOUJOURS les deux champs : « name » et « description ». Si le produit a une description, elle doit ressortir traduite — ne la fusionne pas dans le nom et ne la laisse pas vide. S’il n’en a pas, laisse « description » vide plutôt que d’en inventer une.',
    '',
    'Contraintes de forme :',
    '- recopie EXACTEMENT les références, codes article et codes-barres, chiffre pour chiffre ;',
    '- recopie EXACTEMENT les valeurs chiffrées et leurs unités ;',
    '- n’ajoute aucune marque absente et ne traduis pas celles qui sont là ;',
    '- n’invente aucune caractéristique.',
    '',
    items,
  ].filter((x) => x !== undefined).join('\n')
}
