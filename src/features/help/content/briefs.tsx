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

IBS-Studio s'appuie par défaut sur :

- **Claude Opus** (Anthropic) — questions dynamiques, composition du panier et structure du deck
- **Gemini** (Google) — prompts d'images, mots-clés catalogue, génération d'images (Claude en secours)
- **Enrichissement produit** (PIM/scraping) — Gemini en principal, Claude en secours

Le modèle exact de chaque fournisseur se choisit dans _Réglages → IA_ ; le bouton **« Mettre à jour tous les LLM »** réaligne la sélection sur les dernières versions. Les clés API sont configurées dans les paramètres de l'app. Aucun envoi automatique : chaque appel est explicite (clic utilisateur).`,
    },
    {
      type: 'text',
      md: `### Où utiliser les briefs ?

**Dans les Taxonomies** : l'onglet **Briefs** de la page Taxonomies est le panneau dédié — décris ton besoin, l'IA pose des **questions dynamiques**, compose un **panier de produits** depuis le catalogue et structure un **deck** (avec prompts d'images).

**Dans le PIM** : à la création d'une ligne ou pour réécrire un champ. Le panneau d'enrichissement IA propose une zone prompt par champ.

**Dans le scraping** : quand tu définis un schéma Map+Extract, tu peux ajouter un prompt global qui guide l'extraction. Ex: _« Les prix sont TTC. La marque est sous le titre. Ignore les accessoires liés. »_

**Dans les templates de scraping** : champ **Prompt fournisseur** propagé à tous les templates d'un même domaine. Idéal pour des contraintes communes (TVA, devise, format de référence…).`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.data' },
      label: 'Ouvrir le PIM',
      icon: Sparkles,
    },
    {
      type: 'text',
      md: `### L'assistant brief en 5 étapes

Dans les Taxonomies, ouvrir un brief lance un **assistant guidé** qui transforme un besoin client en proposition commerciale livrable :

1. **Formulaire client** — coordonnées et identité de marque (nom, logo, couleurs primaire/secondaire, brand kit).
2. **Questions dynamiques** — l'IA lit le formulaire + la nomenclature et **génère des questions sur mesure** ; elle pré-sélectionne aussi les familles de produits pertinentes (les identifiants inventés sont automatiquement écartés).
3. **Panier produits** — l'IA compose un panier depuis le catalogue à partir des réponses.
4. **Deck** — l'IA esquisse la structure de la présentation et génère les visuels.
5. **Export** — téléchargement du PPTX et clôture du brief.

Chaque brief mémorise son **étape courante** et son **statut** (_brouillon → formulaire → panier → deck → terminé_) : on peut fermer et reprendre exactement où on s'était arrêté, sans rien relancer. Tout est persisté dans Firestore (collection \`briefs\`).`,
    },
    {
      type: 'text',
      md: `### Comment l'IA compose le panier

À la première arrivée sur l'étape Panier, la génération **démarre automatiquement** (panier vide + aucun journal antérieur). Le pipeline est traçable en direct via un **journal de génération** :

- Si la nomenclature porte une **URL source**, l'IA extrait des mots-clés du brief puis **scrape le site** pour bâtir le catalogue candidat. Sans URL source — ou si le scraping échoue / ne renvoie rien — bascule automatique sur un catalogue de démonstration.
- L'IA sélectionne des produits et **justifie** chaque choix.
- **Garde-fous anti-hallucination** : les SKU absents du catalogue sont rejetés, avec une 2e tentative si l'écart est trop grand ; les produits hors des familles jugées pertinentes sont écartés (sauf catalogue scrapé non structuré). Un avertissement indique combien de SKU ont été ignorés.

Le **journal est conservé** sur le brief : revenir sur l'étape l'affiche tel quel sans relancer la génération. Pour reprendre la main, le bouton **Régénérer** relance le pipeline.`,
    },
    {
      type: 'text',
      md: `### Éditer et exporter le panier

Le panier généré reste **entièrement modifiable, ligne par ligne** : quantités, ajout/retrait de produits, et surtout un **prix appliqué** qui peut surcharger le prix catalogue d'origine (les deux sont conservés). Une **remise globale** en pourcentage ou en montant fixe se règle dans le récapitulatif ; le sous-total et le total estimé se recalculent en direct.

Le bouton **CSV** exporte le panier (SKU, nom, quantité, prix unitaire, prix appliqué, total ligne) — pratique pour un devis ou un ré-import. La validation de l'étape enregistre le panier, la remise et le total estimé sur le brief.`,
    },
    {
      type: 'text',
      md: `### Deck et export PPTX

L'IA esquisse un **deck** composé de slides typées : couverture, contexte, **grille de produits** (layout 2×2 / 3×2 / 1×3), focus produit, **budget** (total + détail) et appel à l'action. Les SKU cités qui ne sont plus au panier sont automatiquement retirés.

Pour les **visuels**, le bouton « Générer toutes les images » produit en lot : une image **héros**, une **scène de mise en situation** (staging) et une image par produit du panier (via Image IA / Gemini, stockées dans Firebase Storage). Les images orphelines sont purgées quand le panier change.

L'export construit un **PPTX réellement habillé à la marque du client** (logo, couleurs primaire/secondaire, bandeau, images en letterbox). Le fichier est téléchargé **et** archivé dans Storage ; le brief passe au statut _terminé_ avec un lien vers le PPTX.`,
    },
    {
      type: 'text',
      md: `### Génération d'images

Le DAM intègre la génération d'images via Gemini (modèle image dit « Image IA »). Tu décris une image en français ou en anglais, l'IA produit un visuel utilisable directement dans tes templates.

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
