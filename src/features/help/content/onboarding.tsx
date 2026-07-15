import { Sparkles, Settings } from 'lucide-react'
import type { HelpSection } from './types'

export const onboardingSection: HelpSection = {
  id: 'onboarding',
  title: 'Assistant de configuration',
  category: 'Démarrage',
  intro: 'Mettre en place son espace pas à pas : clés IA, modèles, connecteurs et visite guidée.',
  blocks: [
    {
      type: 'text',
      md: `À la **première connexion**, un assistant s'ouvre automatiquement pour configurer l'essentiel. Il ne réapparaît qu'**une seule fois** : dès qu'au moins une clé IA est renseignée (ou que tu marques la configuration comme terminée), il ne se relance plus tout seul. Tu peux toujours le rouvrir manuellement (voir plus bas).

> 💡 Tu peux fermer l'assistant à tout moment (bouton **Plus tard** en haut à droite) et tout reconfigurer ensuite dans les **Réglages**.`,
    },
    {
      type: 'text',
      md: `### Les étapes`,
    },
    {
      type: 'accordion',
      items: [
        {
          title: '1 · Bienvenue',
          md: 'Présentation des étapes à venir (clés IA, modèles & cascade, connecteurs, visite guidée). Rien à saisir.',
        },
        {
          title: '2 · Clés IA — obligatoire',
          md: 'Renseigne **au moins une clé API** parmi Gemini, Claude (Anthropic), OpenAI, DeepSeek, Qwen, Kimi, GLM (Z.ai) ou OpenRouter, puis teste-la. Tant qu\'aucune clé valide n\'est saisie, le bouton **Suivant** reste désactivé (*« Renseignez au moins une clé LLM »*). C\'est la seule étape réellement bloquante.',
        },
        {
          title: '3 · Modèles & cascade',
          md: 'Choisis le modèle de chaque fournisseur et l\'ordre de la **cascade de raisonnement** (le premier qui répond gagne, les suivants servent de secours). Le bouton **« Mettre à jour tous les LLM (dernières versions) »** réaligne d\'un clic toute la sélection sur les modèles phares du catalogue.',
        },
        {
          title: '4 · Connecteurs — optionnel',
          md: 'Branche **Google Drive**, **Bright Data** (scraping) et **Telegram** si tu en as besoin. Cette étape peut être passée et complétée plus tard dans *Réglages → Connecteurs*.',
        },
        {
          title: '5 · Terminé',
          md: 'Récapitulatif de ton profil, puis le choix de **lancer la visite guidée du tableau de bord** ou de terminer directement.',
        },
      ],
    },
    {
      type: 'text',
      md: `### Reprendre la configuration plus tard

L'assistant reste accessible à tout moment, par deux entrées :

- **Bandeau « Assistant de configuration »** en haut des **Réglages** — sous-titre _« Reprendre la mise en place guidée (clés, modèles, connecteurs) »_.
- **Entrée « Configurer l'application »** (icône ✨) en bas du **menu des modules** (le bouton ☰ flottant en bas à gauche).

Les deux rouvrent l'assistant à la première étape.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.settings' },
      label: 'Ouvrir les Réglages',
      icon: Settings,
    },
    {
      type: 'text',
      md: `### Bouton « Mettre à jour tous les LLM »

Présent dans l'assistant **et** dans l'onglet **IA** des Réglages, il sélectionne le **dernier modèle phare** de chaque fournisseur (Claude, Gemini, OpenAI, DeepSeek, Qwen, Kimi, GLM, OpenRouter). Pratique pour rester à jour sans choisir chaque modèle à la main après une évolution du catalogue.`,
    },
    {
      type: 'text',
      md: `> ℹ️ L'assistant n'est soumis à **aucune restriction de rôle** : tout utilisateur peut configurer ses propres clés et préférences IA. Seul l'onglet **Firebase** des Réglages reste réservé au propriétaire.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.settings' },
      label: 'Configurer clés & modèles (Réglages → IA)',
      icon: Sparkles,
    },
  ],
}
