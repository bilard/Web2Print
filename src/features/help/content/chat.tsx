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
          md: 'Le chat garde le **fil de la conversation** pendant la session (les **30 derniers messages** sont transmis au modèle — au-delà, le début du fil sort du contexte). ⚠️ L\'historique n\'est **pas conservé** : rafraîchir la page démarre une nouvelle conversation. Le bouton *Nouvelle conversation* remet à zéro.',
        },
        {
          title: 'Pièces jointes',
          md: 'Joins des **images** (PNG, JPEG, WebP, GIF) pour les faire analyser — analyse possible avec les modèles **multimodaux** (Claude, Gemini, OpenAI) ; les autres fournisseurs ignorent les images. Ou des **fichiers texte** (TXT, MD, CSV, JSON, code…) dont le contenu est lu (tronqué au-delà de ~50 000 caractères). Tu peux aussi **capturer l\'écran** : le navigateur te laisse choisir la fenêtre ou l\'onglet à capturer.',
        },
        {
          title: 'Génération d\'images',
          md: 'Choisis la catégorie **Image** : le champ de saisie passe en mode génération (moteur Image IA). Joins des images de référence pour les éditer. Sous chaque image générée : **Télécharger** ou **Sauvegarder dans le DAM** (elle rejoint « Mes images »).',
        },
        {
          title: 'Saisie vocale',
          md: 'Dicte ta demande au **micro** : la parole est transcrite en texte dans la zone de saisie.',
        },
        {
          title: 'Bibliothèque de prompts',
          md: 'Des **catégories** (Écrire, Apprendre, Code, Vie quotidienne, Idées, Image, Mes prompts) proposent des prompts prêts à l\'emploi. Crée, modifie et mets en **favori** (★) tes propres prompts — les favoris et les plus utilisés remontent en tête de liste.',
        },
      ],
    },
    {
      type: 'text',
      md: `### Choix du modèle

Le Chat utilise une **cascade de modèles** : si le modèle principal échoue, le suivant prend le relais automatiquement. Chaque réponse affiche **par quel modèle** elle a été produite — et si des fournisseurs ont échoué avant, un badge ambre **« Échec du provider »** se déplie pour voir le détail des tentatives. L'ordre de la cascade et le modèle de chaque fournisseur se règlent dans les **Paramètres → IA**.`,
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
- Une **clé LLM** doit être configurée dans les Paramètres pour que le Chat réponde.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.telegram' },
      label: 'Ouvrir Telegram',
      icon: Send,
    },
  ],
}
