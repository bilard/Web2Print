import { ShieldCheck } from 'lucide-react'
import type { HelpSection } from './types'

export const settingsSection: HelpSection = {
  id: 'settings',
  title: 'Paramètres',
  category: 'Administration',
  intro: 'Clés API et modèles IA, connecteurs (Drive, Telegram, scraping), cookies, statistiques d\'usage.',
  blocks: [
    {
      type: 'text',
      md: `Les **Paramètres** regroupent toute la configuration de ton compte, en **six onglets** : Profil, IA, Connecteurs, Cookies, Statistiques et Firebase. On les ouvre via l'**engrenage** en bas de la barre latérale, près de ton nom (pas dans le menu principal).`,
    },
    {
      type: 'text',
      md: `### Onglet Profil — identité et apparence

- Ton **profil** (nom, e-mail du compte Google).
- La section **Apparence** bascule le thème : **Clair**, **Sombre** (défaut) ou **Système**. Le choix est mémorisé sur ton compte et te suit d'un poste à l'autre. Le thème se bascule aussi depuis la palette **⌘K**.`,
    },
    {
      type: 'text',
      md: `### Onglet IA — clés et modèles

- Renseigne les **clés API** de chaque fournisseur (Gemini, Claude, OpenAI, DeepSeek, Qwen, Kimi, GLM, OpenRouter) et **teste-les** d'un clic.
- Choisis le **modèle** de chaque fournisseur.
- Définis la **cascade de raisonnement** : l'ordre dans lequel les fournisseurs sont essayés (le premier qui répond gagne, les suivants servent de secours).
- Le bouton **« Mettre à jour tous les LLM »** réaligne toute la sélection sur les dernières versions du catalogue.

> 🔒 **Tes clés API sont isolées par compte** : elles sont synchronisées sur ton profil (Firestore) et purgées localement à la déconnexion — pas de fuite entre comptes sur une même machine.`,
    },
    {
      type: 'text',
      md: `### Budgets IA et proxy serveur

Les appels LLM passent par un **proxy serveur** : la requête part **sans ta clé API**, le serveur ajoute la clé (lue sur ton profil) et **applique ton budget mensuel**.

- **Budget mensuel bloquant** : une fois le plafond du fournisseur atteint, l'appel est **refusé** côté serveur — il n'y a *pas* de repli en direct. C'est la garde-fou contre les dérives de coût.
- Un **seuil d'alerte mensuel** se règle par fournisseur dans le **panneau « Conso LLM en direct »** (colonne de droite sur la page Paramètres). Ce seuil est local et sert d'alerte (pastilles de couleur selon le pourcentage atteint) — il ne recharge jamais ton compte fournisseur.
- Le même panneau suit aussi un **budget Bright Data** (scraping).
- Les requêtes multimodales trop lourdes (> ~9 Mo) basculent automatiquement en appel direct depuis le navigateur.`,
    },
    {
      type: 'text',
      md: `### Onglet Connecteurs`,
    },
    {
      type: 'accordion',
      items: [
        {
          title: 'Telegram',
          md: 'Colle le **bot token** (via BotFather) et ton **chat ID** pour piloter l\'app depuis Telegram. C\'est ici que le bot du module Telegram puise sa configuration.',
        },
        {
          title: 'Google Drive',
          md: 'Connecte ton **Google Drive** (OAuth) pour que les workflows et le node *save-dam* y déposent des fichiers.',
        },
        {
          title: 'Google — accès serveur (Drive + Gmail)',
          md: 'Autorise **une seule fois** (bouton « Connecter ») le **serveur** à agir pour toi quand l\'app est fermée : les workflows planifiés (cron), le webhook et `/flow` sur Telegram peuvent alors **créer des Google Sheets dans ton Drive** et **envoyer des Gmail**. Distinct de la connexion Google Drive ci-dessus (utilisée par le navigateur). Aucun mot de passe stocké — un jeton révocable à tout moment depuis ton compte Google. Ne colle **jamais** d\'identifiants dans le chat Telegram : l\'autorisation se donne uniquement ici.',
        },
        {
          title: 'Scraping (Bright Data, Jina, Firecrawl, Remove.bg)',
          md: 'Tokens des services de scraping et de traitement d\'image. **Bright Data** propose le *Web Unlocker* et, en escalade, le *Scraping Browser* (tier 2) pour les sites les plus protégés.',
        },
      ],
    },
    {
      type: 'text',
      md: `### Onglet Cookies

Gère les **cookies de session** pour scraper des sites **B2B derrière login**. Colle les cookies copiés depuis ton navigateur ; ils sont injectés dans les requêtes de scraping. Leur validité est limitée dans le temps (à re-coller régulièrement).`,
    },
    {
      type: 'text',
      md: `### Onglet Données — schéma Firestore (réservé au propriétaire)

Un **diagramme entité-relation (ERD)** de la base : chaque **collection** Firestore est une table affichant tous ses **champs**, ses clés **PK/FK** et ses **relations** (avec cardinalités). Le diagramme est interactif — zoom, recadrage, et **glisser les tables** : leur position est **mémorisée sur ton compte**.

**Double-clic** sur une table interrogeable ouvre un panneau de **données live** (lecture en temps réel via \`onSnapshot\`). Pratique pour inspecter l'état réel de la base sans ouvrir la console Firebase.`,
    },
    {
      type: 'text',
      md: `### Onglets Statistiques & Firebase

- **Statistiques** : nombre de projets, exports du mois, **stockage Firestore** (barre de progression), **coût IA estimé en EUR par fournisseur** avec les tokens entrants/sortants consommés, et le suivi des requêtes **Bright Data** (quota scraping). Bouton **Rafraîchir** pour recalculer. En bas, le **journal des runs de pipelines** (enrichissement PIM, décomposition Image/PDF → SVG) liste chaque exécution avec son statut, sa durée et le détail des étapes ou de l'erreur — l'« étage logs prod » sans ouvrir la console Firestore.
- **Firebase** : configuration du backend partagé (clés du projet Firebase) — **réservé au propriétaire**.`,
    },
    {
      type: 'text',
      md: `### Qui voit quoi

L'onglet **Firebase** est réservé au **propriétaire**. Les onglets **Connecteurs** et **Cookies** dépendent des permissions accordées dans *Utilisateurs & rôles*. **Profil**, **IA** et **Statistiques** restent accessibles à tous.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.access' },
      label: 'Gérer les permissions (Utilisateurs & rôles)',
      icon: ShieldCheck,
    },
  ],
}
