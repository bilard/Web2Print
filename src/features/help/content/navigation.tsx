import { ShieldCheck } from 'lucide-react'
import type { HelpSection } from './types'

export const navigationSection: HelpSection = {
  id: 'navigation',
  title: 'Navigation & visites guidées',
  category: 'Démarrage',
  intro: 'Passer d\'un module à l\'autre depuis n\'importe où, et (re)lancer les visites guidées.',
  blocks: [
    {
      type: 'text',
      md: `Au-delà de la barre latérale du tableau de bord, deux aides à la navigation sont disponibles **partout dans l'app**, y compris dans l'éditeur.`,
    },
    {
      type: 'text',
      md: `### Menu des modules (☰)

Un bouton **☰ flottant en bas à gauche** ouvre un tiroir listant tous les modules : Nouveau document, Importer, Bibliothèque, DAM, PIM, Taxonomies, Templates scraping, Scraping Hub, Workflows, Telegram, Animation, Chat IA et Utilisateurs & rôles.

- Cliquer une entrée ramène au **tableau de bord** sur la section choisie.
- Le tiroir n'affiche que les modules **autorisés par ton rôle** (voir _Utilisateurs & rôles_).
- Le bouton est masqué sur le tableau de bord (où la barre latérale joue déjà ce rôle).
- En bas du tiroir, l'entrée **« Configurer l'application » (✨)** rouvre l'assistant de configuration.`,
    },
    {
      type: 'text',
      md: `### Palette de commandes (⌘K)

**⌘K** (Mac) ou **Ctrl+K** (PC) ouvre la palette de commandes depuis n'importe quelle page : tape quelques lettres pour **sauter vers un module** (« pim », « workflows », « bibliothèque »…) ou lancer une action rapide (ouvrir les Réglages, basculer le thème clair/sombre). La recherche ignore les accents et comprend des synonymes (« zapier » → Workflows). Navigue avec **↑ ↓**, valide avec **↵**.`,
    },
    {
      type: 'shortcut',
      keys: ['⌘', 'K'],
      label: 'Ouvrir la palette de commandes',
    },
    {
      type: 'text',
      md: `### Notifications (🔔)

La **cloche en bas à gauche** (au-dessus du menu ☰) garde l'historique des évènements importants : fins de runs de workflow, exports réussis ou échoués. Un badge indique les non-lus ; le panneau permet de tout marquer lu ou de vider l'historique.`,
    },
    {
      type: 'text',
      md: `### Visites guidées (🧭)

Un bouton **🧭 « Visite guidée » en bas à droite** (à gauche du bouton d'aide) lance une visite interactive de l'écran courant :

- **Tableau de bord** : parcourt chaque espace de travail un par un.
- **Éditeur** : détaille la barre d'outils, le plan de travail et tous les panneaux.

La visite s'ouvre **automatiquement une seule fois** par écran (au premier passage), puis reste relançable via le bouton 🧭. Navigue avec **Suivant / Précédent**, ou appuie sur **Échap** pour quitter à tout moment.`,
    },
    {
      type: 'text',
      md: `### Ce manuel s'adapte à ton rôle

Le sommaire et la recherche de l'aide ne montrent que les sections des modules auxquels tu as accès (le **propriétaire** voit tout). Les sections transverses — _Prise en main_, _Assistant de configuration_, cette page, _L'éditeur_ et _Export_ — restent toujours visibles.

Ouvre l'aide à tout moment via le bouton **« ? »** en bas à droite ou le raccourci **⇧ + ?**.`,
    },
    {
      type: 'shortcut',
      keys: ['⇧', '?'],
      label: 'Ouvrir / fermer le manuel',
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.access' },
      label: 'Gérer les rôles (Utilisateurs & rôles)',
      icon: ShieldCheck,
    },
  ],
}
