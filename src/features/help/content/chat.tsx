import { MessageSquare, Image as ImageIcon, Send } from 'lucide-react'
import type { HelpSection } from './types'

export const chatSection: HelpSection = {
  id: 'chat',
  title: 'Chat IA',
  category: 'Assistant IA',
  intro: 'Un assistant conversationnel intégré : questions, rédaction, code, génération d\'images.',
  blocks: [
    {
      type: 'text',
      md: `Le **Chat IA** est un assistant texte intégré à l'app. Pose une question, demande un brouillon, un bout de code ou une explication : la réponse arrive en **markdown** (titres, listes, blocs de code). Il répond en **français** par défaut, ou dans la langue de ta question.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.chat' },
      label: 'Ouvrir le Chat IA',
      icon: MessageSquare,
    },
    {
      type: 'text',
      md: `### Ce qu'il sait faire`,
    },
    {
      type: 'accordion',
      items: [
        {
          title: 'Conversation multitour',
          md: 'Le chat garde le **fil de la conversation** pendant la session. ⚠️ L\'historique n\'est **pas conservé** : rafraîchir la page démarre une nouvelle conversation. Le bouton *Nouvelle conversation* remet à zéro.',
        },
        {
          title: 'Pièces jointes',
          md: 'Joins des **images** (PNG, JPEG, WebP, GIF) pour les faire analyser, ou des **fichiers texte** (TXT, MD, CSV, JSON, code…) dont le contenu est lu. Tu peux aussi capturer une **portion d\'écran** directement.',
        },
        {
          title: 'Génération d\'images',
          md: 'Bascule en mode **Image** pour décrire un visuel à générer (moteur Nano Banana). Joins des images de référence pour les éditer. Le résultat se **télécharge** ou se **sauvegarde dans le DAM**.',
        },
        {
          title: 'Saisie vocale',
          md: 'Dicte ta demande au **micro** : la parole est transcrite en texte dans la zone de saisie.',
        },
        {
          title: 'Bibliothèque de prompts',
          md: 'Des **catégories** (Écrire, Apprendre, Code, Idées, Image…) proposent des prompts prêts à l\'emploi. Crée, modifie et mets en favori tes propres prompts pour les réutiliser.',
        },
      ],
    },
    {
      type: 'text',
      md: `### Choix du modèle

Le Chat utilise une **cascade de modèles** : si le modèle principal échoue, le suivant prend le relais automatiquement. Chaque réponse affiche **par quel modèle** elle a été produite. L'ordre de la cascade et le modèle de chaque fournisseur se règlent dans les **Réglages → IA**.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.images', damTab: 'generate' },
      label: 'Génération d\'image dédiée (DAM)',
      icon: ImageIcon,
    },
    {
      type: 'text',
      md: `### À ne pas confondre

- Le Chat IA est **conversationnel** : il **n'accède pas au web** et **n'agit pas sur l'app** (il ne crée pas de projets, ne scrape pas, ne lance pas de workflows).
- Pour un assistant **avec accès web** et capable d'**exécuter des workflows**, c'est le **bot Telegram** qu'il faut utiliser.
- Une **clé LLM** doit être configurée dans les Réglages pour que le Chat réponde.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.telegram' },
      label: 'Ouvrir Telegram',
      icon: Send,
    },
  ],
}
