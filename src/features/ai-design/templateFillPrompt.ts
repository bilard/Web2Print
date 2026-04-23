/**
 * Prompt pour l'appel LLM qui remplit un template.
 *
 * Un seul appel court — le LLM ne conçoit plus le layout, il remplit des cases
 * pré-définies avec du copy contraint en longueur.
 */

import type { Template } from './templates/types'
import { listPictoKeys } from './templates/pictoLibrary'

export interface BuildTemplateFillPromptArgs {
  userPrompt: string
  productName?: string
  templates: Template[]
  scrapedAssets: Array<{ type: string; title?: string }>
  widthMm: number
  heightMm: number
}

export function buildTemplateFillPrompt(args: BuildTemplateFillPromptArgs): string {
  const templatesList = args.templates
    .map((t) => `- **${t.id}** (${t.aspectRatio}) : ${t.description}`)
    .join('\n')

  const assetsList = args.scrapedAssets.length > 0
    ? args.scrapedAssets
        .map((a, i) => `- index=${i} — type=${a.type} — "${a.title ?? '(sans titre)'}"`)
        .join('\n')
    : '(aucun asset scrapé disponible)'

  const pictoKeys = listPictoKeys().join(', ')

  const aspect = args.heightMm >= args.widthMm ? 'portrait' : 'landscape'

  return `Tu es un directeur artistique retail print. Ta tâche : choisir un template et le remplir avec du copy cohérent.

## Brief utilisateur
<user_brief>
${args.userPrompt}
</user_brief>

${args.productName ? `## Produit cible\n${args.productName}\n` : ''}

## Format canvas
${args.widthMm.toFixed(0)} × ${args.heightMm.toFixed(0)} mm — aspect ${aspect}.

## Templates disponibles
${templatesList}

**Règle** : choisis le template dont l'aspect ratio correspond au canvas. Pour un canvas portrait, \`retail-product-portrait\`. Pour un canvas landscape, \`retail-product-landscape\`.

## Assets scrapés (numérotés)
${assetsList}

### Règles d'assignation
- \`logo\` → type \`logo\` (souvent index 0).
- \`badge\` → type \`picto\` (badge technique type LXT, 18V…).
- \`heroProduct\` → type \`image\` (photo produit détourée).

Si aucun asset du type attendu n'est présent, omets le champ \`assetMappings.X\` — le template affichera le slot vide.

## Palette
4 couleurs hex #RRGGBB :
- **primary** : couleur brand dominante (ex: teal Makita \`#0A6E7C\`, rouge Milwaukee \`#E30613\`).
- **secondary** : accent contrasté (souvent le rouge promo).
- **neutral** : fond clair (blanc cassé \`#F4F6F8\` ou gris très pâle).
- **text** : couleur texte principale (navy foncé ou noir charbon).

Choisis cohérent avec la marque du produit.

## Copy

- **title** : 3-6 mots, en MAJUSCULES pour l'impact. Max 60 caractères, y compris espaces.
  - Exemples : "TAILLE-HAIE À BATTERIE", "PERFUSEUR 18V LXT", "PUISSANCE ET PRÉCISION".
- **subtitle** : 1 ligne, nom produit + modèle. Max 80 caractères. Ex: "DUH752Z — Lame 75 cm".
- **features** : 4-7 items. Pour chacun :
  - \`title\` : 2-4 mots, capitalisation normale, **sans deux-points final**. Max 40 caractères. Ex: "Puissance Équivalente", "Conception Ergonomique".
  - \`desc\` : 1 phrase concrète avec une valeur chiffrée si possible. Max 120 caractères. Ex: "Moteur BL sans balais, performance équivalente thermique.".
  - \`pictoHint\` (optionnel mais recommandé) : mot-clé du picto correspondant parmi : ${pictoKeys}. L'assembleur matche ce mot à sa bibliothèque de pictos SVG.
- **priceNew** : nouveau prix avec devise. Ex: "199,50€".
- **priceOld** : ancien prix barré (omis s'il n'y a pas de promo). Ex: "250,77€".
- **cta** : bouton d'action. Ex: "ACHETER MAINTENANT", "VOIR LE PRODUIT". Max 30 caractères.
- **mentions** : mentions légales. Ex: "*Produit vendu sans batterie ni chargeur*". Max 240 caractères.

## Contraintes strictes

- **NE JAMAIS** dépasser les longueurs max — le schema refuse tout texte trop long.
- **Features** : max 8, mais vise 4-7. Pas de paragraphes, des phrases courtes.
- Respecte la capitalisation (titre MAJ, features en capitalisation de mots).

## Sortie

Produis ta réponse via l'outil \`emit_response\` conforme au schéma JSON fourni. Aucune narration hors schema.`
}
