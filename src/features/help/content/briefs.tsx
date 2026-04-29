import { Sparkles } from 'lucide-react'
import type { HelpSection } from './types'

export const briefsSection: HelpSection = {
  id: 'briefs',
  title: 'Briefs & génération IA',
  category: 'Données',
  intro: 'Décrire en français ce qu\'on veut, l\'IA produit le contenu.',
  blocks: [
    {
      type: 'text',
      md: `Plutôt que de remplir manuellement chaque champ d'une fiche produit, tu peux décrire un brief en langage naturel et laisser l'IA structurer le contenu.

Exemples de briefs :
- _« Génère une description marketing de 80 mots pour ce caniveau Nicoll, ton sérieux, focus durabilité »_
- _« Résume les 12 caractéristiques techniques en 3 bullet points avantages-clients »_
- _« Traduis cette fiche en anglais britannique, ton commercial »_`,
    },
    {
      type: 'text',
      md: `### Modèles IA utilisés

Web2Print utilise par défaut :

- **Claude Opus 4.7** (Anthropic) — synthèse rédactionnelle, traduction, restructuration
- **Gemini 3.1 Pro** (Google) — fallback + génération d'images

Les clés API sont configurées dans les paramètres de l'app. Aucun envoi automatique : chaque appel est explicite (clic utilisateur).`,
    },
    {
      type: 'text',
      md: `### Où utiliser les briefs ?

**Dans le PIM** : à la création d'une ligne ou pour réécrire un champ. Le panneau d'enrichissement IA propose une zone prompt par champ.

**Dans le scraping** : quand tu définis un schéma Map+Extract, tu peux ajouter un prompt global qui guide l'extraction. Ex: _« Les prix sont TTC. La marque est sous le titre. Ignore les accessoires liés. »_

**Dans les templates de scraping** : champ **Prompt fournisseur** propagé à tous les templates d'un même domaine. Idéal pour des contraintes communes (TVA, devise, format de référence…).`,
    },
    {
      type: 'menu-link',
      target: { path: '/data' },
      label: 'Ouvrir le PIM',
      icon: Sparkles,
    },
    {
      type: 'text',
      md: `### Génération d'images

Le DAM intègre la génération d'images via Gemini (modèle dit « Nano Banana »). Tu décris une image en français ou en anglais, l'IA produit un visuel utilisable directement dans tes templates.

Cas d'usage : visuels d'ambiance, mockups, illustrations éditoriales. Pour des photos produits réelles, scraping et upload restent prioritaires.`,
    },
    {
      type: 'text',
      md: `### Limites des briefs

- L'IA peut **halluciner** des références ou caractéristiques. Toujours vérifier le résultat avant publication, surtout sur les chiffres et les normes.
- Les briefs sont stateless : aucune mémoire conversationnelle. Si tu veux raffiner, refais le brief avec plus de contexte.
- Le coût en tokens est facturé à l'usage. Privilégie les **templates de scraping** (déterministes, gratuits) pour les flux récurrents et garde les briefs pour le travail créatif.`,
    },
  ],
}
