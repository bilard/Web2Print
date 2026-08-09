// functions/src/priceWatch/textEnrich/screenPrompt.ts
// ⚠ COPIE de src/features/priceWatch/textEnrich/screenPrompt.ts (bundles séparés : `functions/`
// est hermétique, `rootDir: "src"`). Toute modification là-bas doit être reportée ici —
// cf. textReviseParity.test.ts.
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
 * Traitement demandé pour UN champ, avec sa consigne propre.
 *
 * ⚠ Le nom et le texte de vente n'appellent pas la même demande — « Nom - Discriminant -
 * Modèle - REF » pour l'un, « liste les adaptables et les origines » pour l'autre. Une
 * consigne unique pour les deux forçait à écrire l'union des deux demandes, que le modèle
 * applique alors aux deux champs : le nom héritait des listes destinées à la description.
 */
export interface FieldTask {
  /** Le champ est traité. Faux = le modèle le recopie tel quel. */
  enabled: boolean
  mode: 'translate' | 'improve' | 'both'
  /** Consigne PROPRE à ce champ, recopiée telle quelle. */
  prompt: string
}

export interface FieldTasks {
  name: FieldTask
  description: FieldTask
}

const VERB: Record<FieldTask['mode'], string> = {
  translate: 'traduis-le en français, sans rien réécrire d’autre',
  improve: 'réécris-le pour qu’il se lise et qu’il vende, en français',
  both: 'traduis-le en français ce qui ne l’est pas, PUIS réécris-le pour qu’il se lise et qu’il vende',
}

/** La tâche CHAMP PAR CHAMP. Un champ désactivé est nommé lui aussi : le modèle doit
 *  savoir qu'il le recopie, sinon il comble le silence en le réécrivant quand même. */
function fieldLines(tasks: FieldTasks): string[] {
  const one = (label: string, key: 'name' | 'description') => {
    const task = tasks[key]
    if (!task.enabled) return `- ${label} : recopie-le EXACTEMENT, sans y toucher.`
    const consigne = task.prompt.trim()
    return `- ${label} : ${VERB[task.mode]}.${consigne ? ` ${consigne}` : ''}`
  }
  return [
    'Pour chaque produit ci-dessous, champ par champ :',
    one('nom', 'name'),
    one('description', 'description'),
    'Améliorer veut dire : des phrases complètes, l’usage et le bénéfice mis en avant, le jargon d’export supprimé. Cela ne veut JAMAIS dire ajouter une caractéristique que le texte d’origine ne porte pas.',
  ]
}

/** La tâche demandée au modèle, selon les cases cochées. Aucune n'est cochée = on ne
 *  lance pas (l'écran désactive le bouton), donc ce cas ne se rend jamais. */
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
