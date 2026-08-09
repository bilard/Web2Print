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
export interface ScreenModes {
  /** Rendre en français ce qui ne l'est pas. */
  translate: boolean
  /** Réécrire pour vendre : phrases lisibles, bénéfices, sans inventer de caractéristique. */
  improve: boolean
}

/**
 * Ce qu'on demande pour UN champ, avec une consigne par OPÉRATION.
 *
 * ⚠ Traduire et améliorer sont deux demandes distinctes sur le même texte, et elles
 * n'appellent pas les mêmes mots : « garde les références telles quelles » pour la
 * traduction, « liste les adaptables et les origines » pour la réécriture. Une consigne
 * unique obligeait à écrire l'union des deux, que le modèle appliquait alors aux deux
 * opérations. Et les deux partent dans le MÊME appel : le second travail voit le premier,
 * là où deux passages séparés repartaient chacun du texte d'origine.
 */
export interface FieldTask {
  translate: boolean
  improve: boolean
  /** Consigne de TRADUCTION, recopiée telle quelle. */
  translatePrompt: string
  /** Consigne de RÉÉCRITURE, recopiée telle quelle. */
  improvePrompt: string
}

export interface FieldTasks {
  name: FieldTask
  description: FieldTask
}

/** La tâche CHAMP PAR CHAMP. Un champ sans opération est nommé lui aussi : le modèle doit
 *  savoir qu'il le recopie, sinon il comble le silence en le réécrivant quand même. */
function fieldLines(tasks: FieldTasks): string[] {
  const one = (label: string, key: 'name' | 'description'): string[] => {
    const task = tasks[key]
    if (!task.translate && !task.improve) {
      return [`- ${label} : recopie-le EXACTEMENT, sans y toucher.`]
    }
    const verb = task.translate && task.improve
      ? 'traduis en français ce qui ne l’est pas, PUIS réécris-le pour qu’il se lise et qu’il vende'
      : task.translate
        ? 'traduis-le en français, sans rien réécrire d’autre'
        : 'réécris-le pour qu’il se lise et qu’il vende, en français'
    const out = [`- ${label} : ${verb}.`]
    // Chaque consigne est rattachée à SON opération : mêlées, elles se contaminent.
    if (task.translate && task.translatePrompt.trim()) {
      out.push(`  · pour la traduction du ${label} : ${task.translatePrompt.trim()}`)
    }
    if (task.improve && task.improvePrompt.trim()) {
      out.push(`  · pour la réécriture du ${label} : ${task.improvePrompt.trim()}`)
    }
    return out
  }
  return [
    'Pour chaque produit ci-dessous, champ par champ :',
    ...one('nom', 'name'),
    ...one('description', 'description'),
    'Améliorer veut dire : des phrases complètes, l’usage et le bénéfice mis en avant, le jargon d’export supprimé. Cela ne veut JAMAIS dire ajouter une caractéristique que le texte d’origine ne porte pas.',
  ]
}

/** La tâche demandée au modèle, selon les cases cochées. C'est le chemin de l'ÉCRAN, qui
 *  pilote les deux champs d'un seul geste ; la carte de workflow, elle, passe des consignes
 *  par champ et par opération. Aucune case cochée = on ne lance pas (l'écran désactive le
 *  bouton), donc ce cas ne se rend jamais. */
function taskLines(modes: ScreenModes): string[] {
  if (modes.translate && modes.improve) {
    return [
      'Pour chaque produit ci-dessous : traduis en français ce qui ne l’est pas, PUIS réécris le texte de vente pour qu’il se lise et qu’il vende.',
      'Améliorer veut dire : des phrases complètes, l’usage et le bénéfice mis en avant, le jargon d’export supprimé. Cela ne veut JAMAIS dire ajouter une caractéristique que le texte d’origine ne porte pas.',
    ]
  }
  if (modes.improve) {
    return [
      'Réécris le texte de vente de chaque produit ci-dessous pour qu’il se lise et qu’il vende, en français.',
      'Des phrases complètes, l’usage et le bénéfice mis en avant, le jargon d’export supprimé. N’ajoute JAMAIS une caractéristique que le texte d’origine ne porte pas.',
    ]
  }
  return ['Traduis en français le nom et le texte de vente de chaque produit ci-dessous, sans rien réécrire d’autre.']
}

export function buildScreenPrompt(
  products: PromptProduct[],
  instruction: string,
  modes: ScreenModes = { translate: true, improve: false },
  /** Consignes par champ. Fournies, elles REMPLACENT les modes globaux — c'est le chemin
   *  de la carte de workflow ; l'écran, lui, pilote les deux champs d'un seul geste. */
  fields?: FieldTasks,
): string {
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
    ...(fields ? fieldLines(fields) : taskLines(modes)),
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
