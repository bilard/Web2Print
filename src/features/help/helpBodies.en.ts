// Traduction anglaise des CORPS markdown de l'aide.
//
// Pourquoi un fichier séparé de `strings.en.json` : la doc publique transforme
// le markdown avant de le publier (`stripMd()` + condensation + découpe aux
// titres, cf. scripts/build-docs-content.mjs). Ses chaînes sont donc des
// versions DÉRIVÉES — aucune ne correspond au texte brut d'un bloc.
//
// Clefé par le markdown FRANÇAIS EXACT, comme `strings.en.json` : aucun
// changement dans les 36 fichiers de `content/`, et un bloc non traduit
// s'affiche en français au lieu de disparaître.
//
// ⚠️ Un bloc retouché côté FR sort de ce mapping. C'est voulu : mieux vaut du
// français à jour qu'un anglais périmé.
export const HELP_BODIES_EN: Record<string, string> = {
  // ── Prise en main ────────────────────────────────────────────────────
  [`IBS-Studio est un éditeur visuel en ligne pour créer, importer et exporter des documents imprimables (print ou présentation).

**Étapes pour démarrer :**

1. **Se connecter** via Google depuis l'écran de connexion.
2. **Choisir une action** dans la barre latérale du tableau de bord.
3. **Créer un projet vierge** ou **importer** un document existant (IDML, PPTX, Excel).`]:
    `IBS-Studio is an online visual editor to create, import and export printable documents (print or presentation).

**Steps to get going:**

1. **Sign in** with Google from the sign-in screen.
2. **Choose an action** in the dashboard sidebar.
3. **Create a blank project**, or **import** an existing document (IDML, PPTX, Excel).`,

  [`_Aperçu du tableau de bord : barre latérale (Projets, PIM, Taxonomies, DAM, Importer) et bibliothèque de projets._`]:
    `_The dashboard at a glance: sidebar (Projects, PIM, Taxonomies, DAM, Import) and the project library._`,

  [`### Sections du dashboard

Chaque entrée de la barre latérale est un raccourci vers une grande zone de l'app. Cliquer un lien ci-dessous met l'élément en évidence sur l'écran (ouvre d'abord le tableau de bord si nécessaire). _La liste reflète les modules réellement disponibles pour ton compte._`]:
    `### Dashboard sections

Each sidebar entry is a shortcut to a major area of the app. Clicking a link below highlights the item on screen (opening the dashboard first if needed). _The list reflects the modules actually available to your account._`,

  [`### Créer un projet vierge

Ouvre le panneau « Nouveau document » et choisis un format (A4, A3, formats écran/réseaux sociaux, ou dimensions personnalisées). Le projet s'ouvre directement dans l'éditeur — le format et le **fond de page** (couleur, dégradé ou image) restent modifiables à tout moment dans le panneau **Page**.`]:
    `### Create a blank project

Open the "New document" panel and pick a format (A4, A3, screen/social sizes, or custom dimensions). The project opens straight in the editor — the format and the **page background** (colour, gradient or image) stay editable at any time from the **Page** panel.`,

  [`### Retrouver un projet existant

La **Bibliothèque** liste tous tes projets :

- **Ouvrir** : clic simple sur la carte. **Dupliquer / supprimer** : boutons de la carte (ou clic droit).
- **Vignettes ou Liste** : deux boutons en haut à droite basculent l'affichage.
- **Filtrer par taxonomie** : le volet **Taxonomies** à gauche restreint la liste aux projets classés sous le nœud choisi.
- **Sélection multiple** : coche plusieurs projets → barre d'actions (**Tout sélectionner**, **Effacer**, **Supprimer (N)**) pour faire le ménage en une opération.`]:
    `### Find an existing project

The **Library** lists all your projects:

- **Open**: single-click the card. **Duplicate / delete**: buttons on the card (or right-click).
- **Thumbnails or List**: two buttons at the top right switch the view.
- **Filter by taxonomy**: the **Taxonomies** pane on the left narrows the list to the projects filed under the chosen node.
- **Multiple selection**: tick several projects → action bar (**Select all**, **Clear**, **Delete (N)**) to tidy up in one go.`,

  [`### Raccourcis utiles à connaître`]: `### Handy shortcuts to know`,

  [`La section suivante, _L'éditeur_, détaille l'interface et les outils disponibles une fois un projet ouvert.`]:
    `The next section, _The editor_, goes through the interface and the tools available once a project is open.`,

  // ── Navigation ───────────────────────────────────────────────────────
  [`Au-delà de la barre latérale du tableau de bord, deux aides à la navigation sont disponibles **partout dans l'app**, y compris dans l'éditeur.`]:
    `Beyond the dashboard sidebar, two navigation aids are available **everywhere in the app**, including inside the editor.`,

  [`### Menu des modules (☰)

Un bouton **☰ flottant en bas à gauche** ouvre un tiroir listant tous les modules : Nouveau document, Importer, Bibliothèque, DAM, PIM, Taxonomies, Templates scraping, Scraping Hub, Workflows, Veille tarifaire, Telegram, Animation, Chat IA et Utilisateurs & rôles.

- Cliquer une entrée ramène au **tableau de bord** sur la section choisie.
- Le tiroir n'affiche que les modules **autorisés par ton rôle** (voir _Utilisateurs & rôles_).
- Le bouton est masqué sur le tableau de bord (où la barre latérale joue déjà ce rôle).
- En bas du tiroir, l'entrée **« Configurer l'application » (✨)** rouvre l'assistant de configuration.`]:
    `### Modules menu (☰)

A **floating ☰ button at the bottom left** opens a drawer listing every module: New document, Import, Library, DAM, PIM, Taxonomies, Scraping templates, Scraping Hub, Workflows, Price monitoring, Telegram, Animation, AI Chat and Users & roles.

- Clicking an entry takes you back to the **dashboard**, on the chosen section.
- The drawer only shows the modules **your role allows** (see _Users & roles_).
- The button is hidden on the dashboard, where the sidebar already does the job.
- At the bottom of the drawer, **"Set up the application" (✨)** reopens the setup assistant.`,

  [`### Palette de commandes (⌘K)

**⌘K** (Mac) ou **Ctrl+K** (PC) ouvre la palette de commandes depuis n'importe quelle page : tape quelques lettres pour ouvrir un de tes **projets récents**, **sauter vers un module** (« pim », « workflows », « bibliothèque »…) ou lancer une action rapide (ouvrir les Réglages, basculer le thème clair/sombre). La recherche ignore les accents et comprend des synonymes (« zapier » → Workflows). Navigue avec **↑ ↓**, valide avec **↵**.`]:
    `### Command palette (⌘K)

**⌘K** (Mac) or **Ctrl+K** (PC) opens the command palette from any page: type a few letters to open one of your **recent projects**, **jump to a module** ("pim", "workflows", "library"…) or run a quick action (open Settings, switch the light/dark theme). The search ignores accents and understands synonyms ("zapier" → Workflows) in both languages. Move with **↑ ↓**, confirm with **↵**.`,

  [`### Notifications (🔔)

La **cloche en bas à gauche** (au-dessus du menu ☰) garde l'historique des évènements importants : fins de runs de workflow, exports réussis ou échoués. Un badge indique les non-lus ; le panneau permet de tout marquer lu ou de vider l'historique.`]:
    `### Notifications (🔔)

The **bell at the bottom left** (above the ☰ menu) keeps the history of the events that matter: workflow runs finishing, exports that succeeded or failed. A badge shows the unread count; the panel lets you mark everything as read or clear the history.`,

  [`### Visites guidées (🧭)

Un bouton **🧭 « Visite guidée » en bas à droite** (à gauche du bouton d'aide) lance une visite interactive de l'écran courant :

- **Tableau de bord** : parcourt chaque espace de travail un par un.
- **Éditeur** : détaille la barre d'outils, le plan de travail et tous les panneaux.

La visite s'ouvre **automatiquement une seule fois** par écran (au premier passage), puis reste relançable via le bouton 🧭. Navigue avec **Suivant / Précédent**, ou appuie sur **Échap** pour quitter à tout moment.`]:
    `### Guided tours (🧭)

A **🧭 "Guided tour" button at the bottom right** (to the left of the help button) starts an interactive tour of the current screen:

- **Dashboard**: walks through each workspace one by one.
- **Editor**: goes through the toolbar, the canvas and every panel.

The tour opens **automatically once** per screen, on your first visit, and can be replayed any time with the 🧭 button. Move with **Next / Previous**, or press **Esc** to leave at any point.`,

  [`### Ce manuel s'adapte à ton rôle

Le sommaire et la recherche de l'aide ne montrent que les sections des modules auxquels tu as accès (le **propriétaire** voit tout). Les sections transverses — _Prise en main_, _Assistant de configuration_, cette page, _L'éditeur_ et _Export_ — restent toujours visibles.

Ouvre l'aide à tout moment via le bouton **« ? »** en bas à droite ou le raccourci **⇧ + ?**.`]:
    `### This manual adapts to your role

The help contents and its search only show the sections for the modules you can access (the **owner** sees everything). The cross-cutting sections — _Getting started_, _Setup assistant_, this page, _The editor_ and _Export_ — stay visible for everyone.

Open the help at any time with the **"?"** button at the bottom right, or the **⇧ + ?** shortcut.`,
}
