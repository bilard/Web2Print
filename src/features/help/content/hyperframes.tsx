import { Film, Sparkles, Download } from 'lucide-react'
import type { HelpSection } from './types'

export const hyperframesSection: HelpSection = {
  id: 'hyperframes',
  title: 'Animation',
  category: 'Édition',
  intro: 'Générer des animations HTML autonomes (vidéo) à partir d\'un brief ou d\'un design du canvas.',
  blocks: [
    {
      type: 'text',
      md: `Le module **Animation** produit des **animations HTML/CSS/JS autonomes** — un ZIP prêt à ouvrir dans un navigateur, à héberger ou à intégrer dans un e-mail. Pas de codec vidéo, pas de montage : tout est décrit par l'IA puis rendu en mouvement.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.hyperframes' },
      label: 'Ouvrir Animation',
      icon: Film,
    },
    { type: 'text', md: `### Deux façons de créer` },
    {
      type: 'accordion',
      items: [
        {
          title: 'À partir d\'un brief (vidéo multi-scènes)',
          md: 'Décris ton **sujet**, et optionnellement l\'**audience**, l\'**objectif**, le **ton**, la **marque** et un **caption**. L\'IA compose une **séquence de 2 à 5 scènes** (accroche → visuel → appel à l\'action) avec titres, chiffres clés, icônes et transitions, puis choisit un thème visuel et une palette cohérents.',
        },
        {
          title: 'À partir d\'un design du canvas (design-reveal)',
          md: 'Depuis l\'éditeur, on capture le **SVG du projet courant** et l\'IA l\'**anime** (apparitions, rythme, easing) selon une consigne de style. Idéal pour transformer une création print en teaser animé.',
        },
        {
          title: 'Fichiers de référence',
          md: 'Glisse des **images, PDF ou SVG** pour enrichir le brief : l\'IA les lit (texte + visuel) et s\'en sert comme contexte.',
        },
      ],
    },
    {
      type: 'text',
      md: `### Format et durée

- **Ratio** : Auto, portrait (9:16), carré (1:1), paysage (16:9) ou **dimensions personnalisées** (largeur × hauteur, 240 à 4096 px, ratio affiché en direct).
- **Durée** : 5, 10 (défaut), 15, 30 s ou **valeur libre de 3 à 60 s** — en mode brief, l'IA ajuste le nombre et la longueur des scènes pour tenir la durée cible.
- **Instructions libres** : champ texte optionnel (ex. _« rythme énergique, transitions punchy, palette néon »_), interprété par l'IA en **palette, rythme et intensité** ; le détail du style appliqué (pace, intensity, easing, couleurs, mood) s'affiche sous le résultat.
- **Effacer** réinitialise le formulaire ; **Stop** (bouton rouge pendant la génération) annule le rendu en cours.`,
    },
    {
      type: 'text',
      md: `### Enrichir et finaliser

- **Enrichir avec des images IA** : l'IA génère un visuel par scène (affiché en fond, effet Ken Burns).
- **Aperçu live** : le lecteur joue la composition avec le style appliqué (rythme, intensité, easing, palette).
- **Télécharger (.zip)** : récupère l'animation HTML autonome.
- **Sauvegarder dans le DAM** : l'animation rejoint la bibliothèque (onglet *Animations HTML*), réouvrable et re-téléchargeable.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.images', damTab: 'videos' },
      label: 'Voir les animations dans le DAM',
      icon: Sparkles,
    },
    {
      type: 'text',
      md: `### Bibliothèque de prompts

Chaque génération mémorise son brief : tu peux le **rejouer**, le **charger** pour l'ajuster, le **renommer** ou le **supprimer** — pour produire des variantes sans tout ressaisir.`,
    },
    {
      type: 'text',
      md: `### Voir aussi

La génération s'appuie sur les modèles IA configurés dans les **Paramètres → IA**. Les visuels de scène utilisent le moteur de génération d'image (Image IA), le même que dans le DAM et le Chat IA.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.images', damTab: 'generate' },
      label: 'Génération d\'image (DAM)',
      icon: Download,
    },
  ],
}
