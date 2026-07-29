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

  [`L'éditeur se compose d'un **header** (titre, sauvegarde, export), d'une **barre d'outils** à gauche, du **canvas** au centre, des **panneaux** à droite (Propriétés, Calques, Palette, Images, Assets, Données, Page, Impression, Versions, Animation 3D) et d'une **barre inférieure** (zoom, taille page, grille, snap).`]:
    `The editor is made of a **header** (title, saving, export), a **toolbar** on the left, the **canvas** in the middle, the **panels** on the right (Properties, Layers, Palette, Images, Assets, Data, Page, Print, Versions, 3D animation) and a **bottom bar** (zoom, page size, grid, snap).`,

  [`### Palette de commandes (⌘K)

\`⌘K\` (ou \`Ctrl+K\`) ouvre la **palette de commandes** — disponible partout dans l'application, y compris l'éditeur. Tape pour filtrer (la recherche ignore les accents et exige que tous les mots correspondent), navigue aux flèches **↑ ↓** et valide avec **↵**. Les résultats sont regroupés en **Projets récents** (rouvre un document récent), **Modules** (saute vers une autre section : Bibliothèque, PIM, Workflows, Images/DAM…) et **Actions** (ouvrir les Réglages, basculer le thème clair/sombre). C'est le moyen le plus rapide de changer de projet ou de module sans lâcher le clavier.`]:
    `### Command palette (⌘K)

\`⌘K\` (or \`Ctrl+K\`) opens the **command palette** — available everywhere in the application, including the editor. Type to filter (the search ignores accents and requires every word to match), move with the **↑ ↓** arrows and confirm with **↵**. Results are grouped into **Recent projects** (reopen a recent document), **Modules** (jump to another section: Library, PIM, Workflows, Images/DAM…) and **Actions** (open Settings, switch the light/dark theme). It is the fastest way to change project or module without leaving the keyboard.`,

  [`Le header affiche le titre du projet et son état de sauvegarde, les boutons **Annuler / Rétablir**, **Sauvegarder** (commit manuel — la sauvegarde est sinon automatique) et **Exporter**.`]:
    `The header shows the project title and its save state, the **Undo / Redo** buttons, **Save** (a manual commit — saving is otherwise automatic) and **Export**.`,

  [`Les outils de création (Texte, Rectangle, Ellipse, Ligne) ajoutent immédiatement une forme sur le canvas puis reviennent à l'outil Sélection. L'outil **Image** ouvre un petit menu — **Stock images**, **Mes images**, **Uploader** ou **Générer (IA)** — puis le sélecteur d'images correspondant.`]:
    `The creation tools (Text, Rectangle, Ellipse, Line) drop a shape on the canvas straight away, then switch back to the Select tool. The **Image** tool opens a small menu — **Stock images**, **My images**, **Upload** or **Generate (AI)** — then the matching image picker.`,

  [`### Casse du texte (sans réécrire)

La section **Transformation** des propriétés d'un texte applique une **casse** au rendu sans toucher au contenu saisi : **majuscules**, **minuscules** ou **Capitales** (première lettre de chaque mot). Pratique pour un titre tout en capitales ou un sous-titre en bas de casse : tu modifies l'apparence, le texte source (et tes liaisons \`{{champ}}\`) restent intacts.`]:
    `### Text case (without rewriting)

The **Transform** section of a text's properties applies a **case** to the rendering without touching the content you typed: **uppercase**, **lowercase** or **Capitals** (first letter of each word). Handy for an all-caps title or a lower-case subtitle: you change the appearance, while the source text — and your \`{{field}}\` bindings — stay intact.`,

  [`Le panneau **Calques** liste tous les objets du canvas. Tu peux masquer (œil), supprimer (poubelle) ou réordonner un calque par drag-and-drop. Les textes se déplient pour éditer chaque segment séparément — chaque segment offre un bouton **« Lier à un champ de données »** (et **« Délier »**) pour brancher cette portion de texte sur une colonne de la source, sans toucher au reste du bloc.`]:
    `The **Layers** panel lists every object on the canvas. You can hide (eye), delete (bin) or reorder a layer by drag-and-drop. Text expands so each segment can be edited separately — every segment has a **"Link to a data field"** button (and **"Unlink"**) to wire that piece of text to a column of the source, without touching the rest of the block.`,

  [`### Vignettes des pages

Sur un document à plusieurs pages, la **barre inférieure** affiche une rangée de **vignettes** (une par page, avec son numéro). **Clic** sur une vignette pour y naviguer (la page courante est sauvegardée avant le saut), **survol → croix rouge** pour la supprimer, et le bouton **« + »** en bout de rangée ajoute une page. La vignette active est encadrée en bleu.`]:
    `### Page thumbnails

On a multi-page document, the **bottom bar** shows a row of **thumbnails** (one per page, with its number). **Click** a thumbnail to go there (the current page is saved before the jump), **hover → red cross** to delete it, and the **"+"** button at the end of the row adds a page. The active thumbnail is outlined in blue.`,

  [`### Organiser les panneaux de droite

La colonne de droite est **modulaire** : le panneau **Propriétés** reste épinglé en haut, et chaque autre panneau (Calques, Images, Palette, Assets, Page, Impression, Données, Animation 3D, Versions) se **replie/déplie** d'un clic sur son en-tête. Tu peux aussi **réordonner les panneaux** en glissant leur en-tête : remonte ceux que tu utilises le plus pour les avoir sous la main.`]:
    `### Organising the right-hand panels

The right-hand column is **modular**: the **Properties** panel stays pinned at the top, and every other panel (Layers, Images, Palette, Assets, Page, Print, Data, 3D animation, Versions) **collapses/expands** with a click on its header. You can also **reorder the panels** by dragging their header: move the ones you use most to the top so they are always at hand.`,

  [`Le **clic droit** sur un objet ouvre un menu rapide : dupliquer, ordre d'empilement, grouper/dégrouper, **miroir H/V**, verrouiller, supprimer — et sur un document multi-pages, **« Répéter sur toutes les pages »** / **« Retirer des autres pages »** (éléments maîtres, voir plus bas).`]:
    `**Right-clicking** an object opens a quick menu: duplicate, stacking order, group/ungroup, **mirror H/V**, lock, delete — and, on a multi-page document, **"Repeat on every page"** / **"Remove from the other pages"** (master elements, see below).`,

  [`Sélectionner un objet fait apparaître une **barre flottante sous la sélection** avec les actions fréquentes : dupliquer, avancer/reculer d'un plan, grouper/dégrouper, verrouiller, supprimer — sans aller-retour vers le panneau de droite.

Pendant une manipulation, un **badge temps réel** remplace la barre : position **X, Y** pendant un déplacement, **L × H** pendant un redimensionnement, **angle** pendant une rotation.`]:
    `Selecting an object brings up a **floating bar under the selection** with the frequent actions: duplicate, bring forward/send backward one step, group/ungroup, lock, delete — with no round trip to the right-hand panel.

While you manipulate the object, a **live badge** replaces the bar: **X, Y** position while moving, **W × H** while resizing, **angle** while rotating.`,

  [`Le panneau **Versions** garde des **snapshots** du document (miniature + horodatage, 20 max). Créez une version avant un gros changement ; **Restaurer** ré-écrit le contenu puis recharge l'éditeur. Pensez à créer une version de l'état actuel avant de restaurer une ancienne.`]:
    `The **Versions** panel keeps **snapshots** of the document (thumbnail + timestamp, 20 max). Create a version before a big change; **Restore** rewrites the content, then reloads the editor. Remember to create a version of the current state before restoring an older one.`,

  [`La sauvegarde est **automatique** mais le bouton Sauvegarder permet un commit manuel. Le bouton Exporter (voir _Header_ plus haut) ouvre la fenêtre de choix de format (PDF, IDML, PPTX, SVG, PNG, HTML) — détaillée dans la section _Export multi-format_.`]:
    `Saving is **automatic**, but the Save button lets you commit manually. The Export button (see _Header_ above) opens the format chooser (PDF, IDML, PPTX, SVG, PNG, HTML) — covered in the _Multi-format export_ section.`,

  [`### Header`]:
    `### Header`,

  [`### Barre d'outils`]:
    `### Toolbar`,

  [`### Propriétés des objets`]:
    `### Object properties`,

  [`### Calques`]:
    `### Layers`,

  [`### Naviguer dans le canvas`]:
    `### Moving around the canvas`,

  [`### Les autres panneaux de droite`]:
    `### The other right-hand panels`,

  [`### Menu contextuel (clic droit)`]:
    `### Context menu (right-click)`,

  [`### Barre contextuelle & repères de manipulation`]:
    `### Context bar & manipulation read-outs`,

  [`### Preflight d'impression`]:
    `### Print preflight`,

  [`### Re-skin par les données PIM`]:
    `### Re-skinning from PIM data`,

  [`### Éléments maîtres & kit de marque`]:
    `### Master elements & brand kit`,

  [`### Versions du document`]:
    `### Document versions`,

  [`### Sauvegarder & exporter`]:
    `### Save & export`,

  [`### Raccourcis de l'éditeur`]:
    `### Editor shortcuts`,

  [`Le panneau **Propriétés** (à droite) s'adapte à la sélection :

- **Position / taille / rotation** : valeurs X, Y, L, H et angle éditables au chiffre près.
- **Remplissage** : couleur unie, **dégradé** ou **image** (choisie depuis le DAM : Stock, Mes images, Favoris, Collections, Récents ou génération IA).
- **Contour, opacité, ombre portée** et **coins arrondis** (rectangles).
- **Modes de fusion** : 16 modes (Multiplier, Écran, Superposition, Lumière douce/crue, Différence, Teinte, Saturation, Couleur, Luminosité…).
- **Miroir** horizontal / vertical et **verrou** (cadenas — l'objet ne peut plus être sélectionné ni déplacé).
- **Cadrage image** : pour une image (ou une forme remplie d'image), recadre la zone visible et zoome dans le cadre sans déformer.
- **Texte** : police (les polices du projet sont chargées), taille, gras/italique/souligné, alignement, **interligne**, **espacement des caractères**, couleur — et des **styles par caractère** en édition (sélectionne une portion du texte avant d'appliquer). Le bouton **Ajuster au contenu** recale la largeur du bloc sur le texte.
- **Alignement multi-objets** : six boutons (gauche, centre H, droite, haut, centre V, bas — par rapport à la page) + **distribution** horizontale/verticale pour espacer uniformément 3 objets ou plus.

Pendant les déplacements, des **guides magnétiques** (smart guides) apparaissent : aimantation aux bords/centres de la page et aux autres objets.

> Le panneau Propriétés contient aussi une section **Règles conditionnelles** : faire réagir l'objet à la donnée de chaque ligne en publipostage (masquer, recolorer, redimensionner selon une condition). Voir la section **Règles conditionnelles**.`]:
    `The **Properties** panel (on the right) adapts to the selection:

- **Position / size / rotation**: X, Y, W, H and angle values, editable to the exact figure.
- **Fill**: solid colour, **gradient** or **image** (picked from the DAM: Stock, My images, Favourites, Collections, Recent, or AI generation).
- **Stroke, opacity, drop shadow** and **rounded corners** (rectangles).
- **Blend modes**: 16 modes (Multiply, Screen, Overlay, Soft/Hard light, Difference, Hue, Saturation, Colour, Luminosity…).
- **Mirror** horizontal / vertical and **lock** (padlock — the object can no longer be selected or moved).
- **Image cropping**: for an image (or a shape filled with an image), crop the visible area and zoom inside the frame without distortion.
- **Text**: font (the project fonts are loaded), size, bold/italic/underline, alignment, **line height**, **letter spacing**, colour — plus **per-character styles** while editing (select a stretch of text before applying). The **Fit to content** button snaps the block width to the text.
- **Multi-object alignment**: six buttons (left, centre H, right, top, centre V, bottom — relative to the page) + horizontal/vertical **distribution** to space 3 or more objects evenly.

While you move objects, **smart guides** appear: snapping to the page edges/centres and to the other objects.

> The Properties panel also holds a **Conditional rules** section: make the object react to each row's data during mail merge (hide, recolour, resize depending on a condition). See the **Conditional rules** section.`,

  [`La barre inférieure pilote la navigation :

- **Zoom** : boutons − / + (pas relatif au zoom courant) ou molette. Plage **1 % → 400 %** — utile pour voir l'ensemble d'un grand format (jusqu'à plusieurs milliers de pixels) ou détailler au pixel près. Clic sur la valeur (ex: \`100%\`) pour revenir à 100 %.
- **Pan** : maintenir **espace** + glisser à la souris.
- **Taille de la page** affichée à côté du zoom — clic ouvre les paramètres de page.
- **Grille** : repère visuel pour aligner.
- **Snap** : aimantation aux objets et à la grille pendant le déplacement.`]:
    `The bottom bar drives navigation:

- **Zoom**: − / + buttons (the step is relative to the current zoom) or the mouse wheel. Range **1 % → 400 %** — handy to take in a whole large format (up to several thousand pixels) or to work pixel by pixel. Click the value (e.g. \`100%\`) to go back to 100 %.
- **Pan**: hold **space** + drag with the mouse.
- **Page size** shown next to the zoom — clicking it opens the page settings.
- **Grid**: a visual reference to align against.
- **Snap**: snapping to objects and to the grid while moving.`,

  [`Dans le panneau **Impression**, la section **Preflight** (bouton _Analyser_) contrôle le document avant export :

- images sous **150 DPI effectifs** (erreur) ou 225 DPI (avertissement) ;
- objets débordant de la page **au-delà du fond perdu**, ou entièrement hors page ;
- textes **< 5 pt** ou à moins de **3 mm du bord de coupe**.

Cliquer un problème **sélectionne l'objet** concerné sur le canvas.`]:
    `In the **Print** panel, the **Preflight** section (_Analyse_ button) checks the document before export:

- images below **150 effective DPI** (error) or 225 DPI (warning);
- objects running off the page **beyond the bleed**, or entirely outside it;
- text **under 5 pt** or closer than **3 mm to the trim edge**.

Clicking an issue **selects the object** concerned on the canvas.`,

  [`Le panneau **Données** accepte la source **« Produits PIM (re-skin) »** : chaque produit du projet devient une ligne. Décompose un flyer (Image/PDF → SVG), pose des \`{{champ}}\` sur les textes (ou des liaisons image), puis **navigue de produit en produit** : le visuel se re-skinne instantanément avec les données du produit courant.

Sur un flyer décomposé, la section **« Fond IA (Nano Banana) »** du même panneau **régénère le fond verrouillé** à partir d'un prompt (le fond actuel sert de référence) — vos textes et images liés restent éditables au-dessus. Nécessite une clé Gemini.

Le bouton **« Lier automatiquement »** détecte le **prix** (motif monétaire le plus gros), le **titre** (plus grande taille restante) et la **description** (texte long) puis pose les \`{{champs}}\` correspondants en un clic.

Bon à savoir, côté publipostage : les liaisons acceptent des **formules** (syntaxe \`[colonne]\` combinable, ex. \`[prix] € TTC\`), les **flèches ◀ ▶** parcourent les lignes de la source (le canvas se met à jour), le bouton **rafraîchir** recharge la source si elle a changé, et un badge **IDML** signale qu'une source IDML est branchée (export multi-produits).`]:
    `The **Data** panel accepts the **"PIM products (re-skin)"** source: every product in the project becomes a row. Break a flyer apart (Image/PDF → SVG), drop \`{{field}}\` bindings on the text (or image bindings), then **step from product to product**: the artwork re-skins instantly with the current product's data.

On a broken-apart flyer, the **"AI background (Nano Banana)"** section of the same panel **regenerates the locked background** from a prompt (the current background is used as the reference) — your linked text and images stay editable on top. Requires a Gemini key.

The **"Link automatically"** button detects the **price** (the largest currency-shaped pattern), the **title** (the largest remaining size) and the **description** (long text), then drops the matching \`{{fields}}\` in one click.

Worth knowing on the mail-merge side: bindings accept **formulas** (the \`[column]\` syntax can be combined, e.g. \`[price] € inc. VAT\`), the **◀ ▶ arrows** walk through the source rows (the canvas updates as you go), the **refresh** button reloads the source if it has changed, and an **IDML** badge signals that an IDML source is plugged in (multi-product export).`,

  [`- **Répéter sur toutes les pages** (clic droit sur un objet) : l'élément (logo, pagination, mentions…) est copié sur chaque page du document ; ré-appliquer **resynchronise** position et style partout. « Retirer des autres pages » supprime les copies. Les pages jamais ouvertes doivent être visitées une fois d'abord.
- **Kit de marque (global)** : en tête du panneau **Palette**, vos couleurs de marque sont partagées entre **tous vos projets** — « Vers le projet » les importe dans la palette courante, « Depuis le projet » capture la palette dans le kit.
- **Styles d'objets (global)** : dans le panneau **Palette**, capturez le style d'un objet (couleurs, contour, opacité, typo) et ré-appliquez-le en un clic sur n'importe quelle sélection, dans tous vos projets.`]:
    `- **Repeat on every page** (right-click an object): the element (logo, page number, legal notice…) is copied onto every page of the document; re-applying it **resynchronises** position and style everywhere. "Remove from the other pages" deletes the copies. Pages that have never been opened must be visited once first.
- **Brand kit (global)**: at the top of the **Palette** panel, your brand colours are shared across **all your projects** — "To the project" imports them into the current palette, "From the project" captures the palette into the kit.
- **Object styles (global)**: in the **Palette** panel, capture an object's style (colours, stroke, opacity, typography) and re-apply it in one click to any selection, across all your projects.`,

  [`IBS-Studio extrait des données produits à partir d'URLs fournisseurs et les pousse directement dans une BDD. Trois modes selon le contexte.`]:
    `IBS-Studio extracts product data from supplier URLs and pushes it straight into a database. Three modes, depending on the context.`,

  [`### Quel mode utiliser ?

| Tu as… | Utilise |
|---|---|
| Une page catégorie (liste de produits) | **Map + Extract** |
| Une seule URL produit à fouiller | **Scrape simple** |
| Un site entier à indexer | **Crawl** |
| Un fournisseur récurrent (Nicoll, Milwaukee…) | **Template scraping** ⭐ |

Pour un fournisseur que tu vas scraper plus de 2 fois, **crée un template**. C'est la voie royale : 0 hallucination IA, 0 token consommé, réutilisable sur des centaines d'URLs.`]:
    `### Which mode should you use?

| You have… | Use |
|---|---|
| A category page (a list of products) | **Map + Extract** |
| A single product URL to dig into | **Simple scrape** |
| A whole site to index | **Crawl** |
| A recurring supplier (Nicoll, Milwaukee…) | **Scraping template** ⭐ |

For a supplier you are going to scrape more than twice, **create a template**. That is the royal road: no AI hallucination, no tokens burnt, reusable across hundreds of URLs.`,

  [`_Éditeur de template : à gauche l'aperçu de page, à droite les champs cibles. Double-clic sur un élément suffit à générer le sélecteur CSS._`]:
    `_Template editor: the page preview on the left, the target fields on the right. Double-clicking an element is enough to generate the CSS selector._`,

  [`### Créer un template de scraping

1. Ouvre la page **Templates scraping** depuis le menu latéral
2. Clique **Nouveau** → entre un nom (ex: \`Nicoll\`), le domaine (\`nicoll.fr\`) et un pattern d'URL (\`.*\` pour tout matcher)
3. Onglet **Pointer & cliquer** → charge une URL produit dans l'iframe
4. Double-clique sur titre, prix, description… → un sélecteur CSS s'auto-génère
5. Onglet **Avancé (JSON)** → bouton **Tester** pour vérifier l'extraction (score ≥ 20 = OK)
6. **Enregistrer**

Le template vit dans Firestore et matchera automatiquement les futures URLs du domaine quand tu importeras une BDD.`]:
    `### Create a scraping template

1. Open the **Scraping templates** page from the side menu
2. Click **New** → enter a name (e.g. \`Nicoll\`), the domain (\`nicoll.fr\`) and a URL pattern (\`.*\` to match everything)
3. **Point & click** tab → load a product URL in the iframe
4. Double-click the title, price, description… → a CSS selector is generated for you
5. **Advanced (JSON)** tab → **Test** button to check the extraction (score ≥ 20 = OK)
6. **Save**

The template lives in Firestore and will automatically match future URLs on that domain when you import a database.`,

  [`### Onglet Recherche : « trouve-moi ça, là »

Pas d'URL sous la main ? Décris ce que tu cherches **et où** en langage naturel — _« tondeuses Honda chez LeroyMerlin et Castorama »_. Un LLM interprète ta phrase (sujet produit + enseignes ciblées + prix max éventuel) et lance une requête \`site:\` par enseigne, puis fusionne les résultats.

- Règle le **nombre de résultats** (1 à 30).
- Les fiches produit affichées sont **sondées en prix réel** (JSON-LD) ; si tu as donné un prix max, l'app **pré-coche** automatiquement celles qui rentrent dans le budget, au plus N par enseigne.
- Coche ce que tu veux, puis **Scraper N pages (Produit complet)** — chaque page passe par le même moteur que les autres onglets.
- Un tableau récapitule les champs que tu as demandés dans ton prompt (prix, EAN, marque…) au fur et à mesure.`]:
    `### Search tab: "find me that, over there"

No URL to hand? Describe what you are after **and where**, in plain language — _"Honda lawnmowers at LeroyMerlin and Castorama"_. An LLM reads your sentence (product subject + targeted retailers + optional maximum price) and fires one \`site:\` query per retailer, then merges the results.

- Set the **number of results** (1 to 30).
- The product pages listed are **probed for their real price** (JSON-LD); if you gave a maximum price, the app automatically **pre-ticks** the ones within budget, at most N per retailer.
- Tick what you want, then **Scrape N pages (Full product)** — every page goes through the same engine as the other tabs.
- A table builds up as it goes, summarising the fields you asked for in your prompt (price, EAN, brand…).`,

  [`### Plusieurs sites/URLs d'un coup (Liste · Fichier · Google Sheet)

Les onglets **Crawl** et **Map + Extract** ne se limitent pas à une seule URL. Le sélecteur de source propose 4 modes :

- **1 URL** : le cas simple.
- **Liste** : colle plusieurs URLs racines, une par ligne.
- **Fichier** : importe un **CSV / Excel / TSV** — la colonne URL est auto-détectée.
- **Google Sheet** : importe depuis un Sheet via OAuth Drive (connecte Drive dans Réglages → Connecteurs).

En multi-URL, les racines sont traitées **en séquence** et les résultats sont **agrégés et dédoublonnés** par URL absolue. Idéal pour mapper 10 catégories ou crawler 5 sous-sites en une passe.`]:
    `### Several sites/URLs at once (List · File · Google Sheet)

The **Crawl** and **Map + Extract** tabs are not limited to a single URL. The source selector offers 4 modes:

- **1 URL**: the simple case.
- **List**: paste several root URLs, one per line.
- **File**: import a **CSV / Excel / TSV** — the URL column is detected automatically.
- **Google Sheet**: import from a Sheet via Drive OAuth (connect Drive in Settings → Connectors).

In multi-URL mode the roots are processed **in sequence** and the results are **aggregated and de-duplicated** by absolute URL. Ideal for mapping 10 categories or crawling 5 sub-sites in one pass.`,

  [`### Affiner un Crawl : limite, inclure/exclure (regex)

Avant d'extraire les liens, tu peux cadrer la découverte :

- **Limite de pages** (1 à 500, défaut 30) — par URL racine en mode multi.
- **Inclure (regex)** : ne garder que les chemins qui matchent, ex. \`/produits/.*\`.
- **Exclure (regex)** : écarter le bruit, ex. \`/tag/.*, /auteur/.*\`.

Le crawl extrait les liens (Jina) puis l'IA identifie les **noms de produits depuis les cartes visibles** ; tu coches les vrais produits, chacun part en **Produit complet**. Si la grille est en lazy-load et que rien ne sort, resserre le filtre **Inclure** ou bascule en mode **Plusieurs URLs**.`]:
    `### Narrowing a crawl: limit, include/exclude (regex)

Before the links are extracted, you can frame the discovery:

- **Page limit** (1 to 500, default 30) — per root URL in multi mode.
- **Include (regex)**: keep only the paths that match, e.g. \`/products/.*\`.
- **Exclude (regex)**: push the noise aside, e.g. \`/tag/.*, /author/.*\`.

The crawl extracts the links (Jina), then the AI identifies the **product names from the visible cards**; you tick the genuine products and each one goes off as a **Full product**. If the grid is lazy-loaded and nothing comes out, tighten the **Include** filter or switch to **Several URLs** mode.`,

  [`### Suivre le coût et arrêter un run

- **Chip de coût (en haut du modal)** : il additionne en direct le **dernier traitement** et le **cumul de la session**, ventilé par source — **LLM**, **Jina**, **Firecrawl**, **Bright Data**. Le LLM est facturé au tarif réel par modèle ; Jina/Firecrawl/Bright Data sont estimés aux tarifs publics. Survole le chip pour le détail.
- **Annuler** : pendant un batch d'enrichissement, le bouton **Annuler** stoppe les requêtes Jina/scrape qui acceptent un signal et n'enchaîne pas sur les URLs suivantes. La fiche déjà en cours peut terminer son traitement, mais son résultat est ignoré.`]:
    `### Tracking the cost and stopping a run

- **Cost chip (top of the modal)**: it adds up, live, the **last operation** and the **session total**, broken down by source — **LLM**, **Jina**, **Firecrawl**, **Bright Data**. The LLM is billed at the real per-model rate; Jina/Firecrawl/Bright Data are estimated from the public price lists. Hover the chip for the breakdown.
- **Cancel**: during an enrichment batch, the **Cancel** button stops the Jina/scrape requests that accept a signal and does not move on to the following URLs. The record already in flight may finish its processing, but its result is discarded.`,

  [`### Que récupère « Produit complet » exactement ?

Tous les onglets (Scrape / Crawl / Map+Extract / Recherche) finissent par le **même moteur PIM** (\`enrichProductCore\`), pour un résultat homogène quel que soit le chemin :

- **Specs** au format KEY/VALUE (caractéristiques techniques structurées).
- **EAN / référence** repêchés du contenu et des données structurées (JSON-LD).
- **Fil d'Ariane → taxonomie** (breadcrumb concaténé), utile pour catégoriser.
- **Avantages** (les pictos/bénéfices produit transformés en lignes de texte).
- **Images filtrées** : le même classifieur que l'onglet Photos du PIM écarte les visuels parasites (logos, pictos, bannières) et garde les vraies photos produit.
- **Documents PDF** (notices, fiches techniques) détectés sur la page.

Si une page revient quasi vide, l'app conserve quand même le **résultat partiel exploitable** (marque/SKU/description/image issus du JSON-LD) plutôt que de tout jeter.`]:
    `### What exactly does "Full product" bring back?

Every tab (Scrape / Crawl / Map+Extract / Search) ends up in the **same PIM engine** (\`enrichProductCore\`), so the result is consistent whichever route you take:

- **Specs** in KEY/VALUE form (structured technical characteristics).
- **EAN / reference** fished out of the content and the structured data (JSON-LD).
- **Breadcrumb → taxonomy** (the breadcrumb concatenated), useful for filing.
- **Benefits** (the product pictograms/selling points turned into lines of text).
- **Filtered images**: the same classifier as the PIM Photos tab discards the stray visuals (logos, pictograms, banners) and keeps the genuine product shots.
- **PDF documents** (manuals, data sheets) detected on the page.

If a page comes back nearly empty, the app still keeps the **usable partial result** (brand/SKU/description/image taken from the JSON-LD) rather than throwing everything away.`,

  [`### Textes fidèles à la source (verbatim)

L'IA **recopie** les textes de la page, elle ne les rédige jamais. La description et les avantages sont extraits **mot pour mot** depuis la source — sans reformuler, sans résumer, sans traduire. Vous obtenez le texte du fabricant ou du distributeur, pas une paraphrase générée.

La description conserve aussi la **structure d'origine** : retours à la ligne entre paragraphes et listes à puces sont préservés tels qu'ils apparaissent sur la page. Le fil d'Ariane est lui aussi recopié verbatim, ce qui fiabilise la taxonomie.`]:
    `### Text faithful to the source (verbatim)

The AI **copies** the text off the page, it never writes it. The description and the benefits are extracted **word for word** from the source — no rewording, no summarising, no translating. You get the manufacturer's or the distributor's own text, not a generated paraphrase.

The description also keeps its **original structure**: line breaks between paragraphs and bulleted lists are preserved exactly as they appear on the page. The breadcrumb is copied verbatim too, which makes the taxonomy more dependable.`,

  [`### Même qualité sur fabricants et retailers (passe HTML brut)

En complément de l'extraction IA, une **passe déterministe sur le HTML brut** de la page complète la fiche — spécifications, avantages, documents PDF — avec la même qualité sur un site fabricant (Milwaukee, Dyson…) que sur un retailer (Castorama, Jardiland, Screwfix…).

Cette passe est **additive** : elle n'écrase rien, elle comble les manques. Elle lit directement le code source, donc elle récupère aussi ce que le rendu navigateur cache :

- les **listes repliées derrière « Voir plus »** (avantages et specs complets, pas seulement les 3 premières lignes visibles) ;
- les tableaux de caractéristiques présents dans la page mais masqués derrière des onglets ou accordéons.

Zéro hallucination possible sur ces champs : ce sont des parsers déterministes, pas un LLM.`]:
    `### The same quality on manufacturers and retailers (raw-HTML pass)

Alongside the AI extraction, a **deterministic pass over the page's raw HTML** completes the record — specifications, benefits, PDF documents — with the same quality on a manufacturer's site (Milwaukee, Dyson…) as on a retailer's (Castorama, Jardiland, Screwfix…).

This pass is **additive**: it overwrites nothing, it fills the gaps. It reads the source code directly, so it also picks up what the browser rendering hides:

- the **lists folded behind "Show more"** (complete benefits and specs, not just the first 3 visible lines);
- the characteristic tables present in the page but hidden behind tabs or accordions.

No hallucination is possible on these fields: they come from deterministic parsers, not from an LLM.`,

  [`### Galeries d'images en pleine résolution

La passe images reconstruit les galeries que le rendu classique ne voit pas :

- **Adobe Scene7 / Dynamic Media** (convention \`/is/image/\` utilisée par des milliers de retailers) : à partir d'une seule vue détectée, l'app déduit le nom de base de l'asset et reconstruit **toutes les vues du carrousel** mentionnées dans la page — là où l'extraction classique ne voyait aucune photo.
- **Galeries JSON embarquées** (Magento \`mage/gallery\` et similaires) : chaque vue expose une variante miniature/moyenne/pleine — l'app prend systématiquement la **pleine résolution**.
- La **déduplication respecte les galeries** : les différentes vues d'un même produit (face, profil, détail…) ne sont plus fusionnées en une seule image.
- Les **drapeaux, icônes de réseaux sociaux, logos de paiement et pixels de consentement** sont définitivement écartés des photos produit.`]:
    `### Image galleries at full resolution

The image pass rebuilds the galleries that ordinary rendering never sees:

- **Adobe Scene7 / Dynamic Media** (the \`/is/image/\` convention used by thousands of retailers): from a single detected view, the app works out the asset's base name and rebuilds **every view of the carousel** mentioned in the page — where ordinary extraction saw no photo at all.
- **Embedded JSON galleries** (Magento \`mage/gallery\` and the like): each view exposes a thumbnail/medium/full variant — the app always takes the **full resolution**.
- **De-duplication respects galleries**: the different views of the same product (front, side, detail…) are no longer merged into a single image.
- **Flags, social-network icons, payment logos and consent pixels** are firmly kept out of the product photos.`,

  [`### Fiches sans pollution de navigation

Le bruit d'interface des sites e-commerce ne contamine plus les fiches :

- **Méga-menus imbriqués, menu compte, mini-panier** : leurs entrées ne deviennent plus de fausses caractéristiques.
- **Footer complet** (store locator « Trouver un magasin », moyens de paiement, adresses, mentions légales, plan du site, newsletter) : exclu des specs.
- **Avis clients** (notes « 4,5/5 », commentaires) : neutralisés, ils ne remontent ni en specs ni en description.
- **Overlays de recherche, CGV, bannières cookies, sentinelles techniques internes** : filtrés.
- Les **« Points forts »** ne reprennent plus l'UI du compte client, le widget de stock (« En rupture… ») ni le titre du produit — uniquement les vrais bénéfices rédigés par la source.

Ces filtres sont validés sur des fixtures réelles (Screwfix, Castorama, Jardiland…) et fonctionnent sans aucun code spécifique par enseigne.`]:
    `### Records free of navigation pollution

The interface noise of e-commerce sites no longer contaminates the records:

- **Nested mega-menus, account menu, mini-basket**: their entries no longer turn into bogus characteristics.
- **The whole footer** (store locator "Find a shop", payment methods, addresses, legal notices, site map, newsletter): excluded from the specs.
- **Customer reviews** ("4.5/5" ratings, comments): neutralised — they end up neither in the specs nor in the description.
- **Search overlays, terms and conditions, cookie banners, internal technical sentinels**: filtered out.
- The **"Key features"** no longer echo the customer-account UI, the stock widget ("Out of stock…") or the product title — only the genuine benefits written by the source.

These filters are validated against real fixtures (Screwfix, Castorama, Jardiland…) and work without a single line of retailer-specific code.`,

  [`### Découverte plus fiable sur les gros sites

Sur les pages catégories très lourdes (SPA de plus d'1 Mo), la découverte de produits est fiabilisée : le **délai serveur est étendu à 3 minutes** (au lieu d'1), et une **seconde tentative directe** est jouée avant de basculer sur la descente par rayons. Résultat : moins de découvertes qui retombent sur des liens parasites (cookies, actualités) faute de temps.`]:
    `### More dependable discovery on large sites

On very heavy category pages (SPAs over 1 MB), product discovery has been made more dependable: the **server timeout is extended to 3 minutes** (instead of 1), and a **second direct attempt** is played before falling back to the aisle-by-aisle descent. The result: fewer discoveries that end up on stray links (cookies, news) simply for want of time.`,

  [`### Scraper depuis la BDD (Map + Extract)

Quand tu n'as pas encore de template, ou pour explorer un nouveau site :

1. **PIM** → ouvre une BDD (ou crée-la vide)
2. Bouton **Scraper le web** → onglet **Map + Extract**
3. Colle une URL catégorie → **Mapper le site** → liste des liens internes
4. Coche les URLs à extraire (3-5 pour test, plus en prod)
5. Définis ton schéma de champs (title, brand, price…) + un prompt IA optionnel
6. **Extraire** → l'IA remplit les colonnes
7. **Importer N lignes** → injection dans la BDD

Pour un usage récurrent, transforme ce mapping ad-hoc en template.`]:
    `### Scraping from the database (Map + Extract)

When you do not have a template yet, or to explore a new site:

1. **PIM** → open a database (or create an empty one)
2. **Scrape the web** button → **Map + Extract** tab
3. Paste a category URL → **Map the site** → list of internal links
4. Tick the URLs to extract (3–5 for a test, more in production)
5. Define your field schema (title, brand, price…) + an optional AI prompt
6. **Extract** → the AI fills the columns
7. **Import N rows** → injection into the database

For recurring use, turn this ad-hoc mapping into a template.`,

  [`### Limites à connaître

- **Sites e-commerce hostiles** (Mr-Bricolage, Darty, Boulanger…) : DataDome/Akamai peut bloquer. L'app **escalade automatiquement** : Jina d'abord, puis **Bright Data Web Unlocker**, puis **Scraping Browser** (tier 2) si les tokens sont configurés (Réglages → Connecteurs → Scraping). Symptôme d'un blocage total : champ \`Contenu\` vaut \`Nope\` ou est vide.
- **Sites B2B derrière login** : colle tes **cookies de session** dans Réglages → Cookies — ils sont injectés automatiquement dans les requêtes du domaine.
- **Pages SPA** : le rendu JS dépend du \`X-Wait-For-Selector\` côté Jina (déjà tuné pour les patterns retail FR).
- **Mode AUTO vs TEMPLATE** : AUTO = recherche web + LLM (peut halluciner) ; TEMPLATE = extraction déterministe par CSS selectors. Privilégie TEMPLATE dès qu'un template matche le domaine.`]:
    `### Limits worth knowing

- **Hostile e-commerce sites** (Mr-Bricolage, Darty, Boulanger…): DataDome/Akamai may block you. The app **escalates automatically**: Jina first, then **Bright Data Web Unlocker**, then **Scraping Browser** (tier 2) if the tokens are configured (Settings → Connectors → Scraping). The symptom of a total block: the \`Content\` field reads \`Nope\` or is empty.
- **B2B sites behind a login**: paste your **session cookies** into Settings → Cookies — they are injected automatically into requests for that domain.
- **SPA pages**: the JS rendering depends on the \`X-Wait-For-Selector\` on the Jina side (already tuned for the French retail patterns).
- **AUTO vs TEMPLATE mode**: AUTO = web search + LLM (can hallucinate); TEMPLATE = deterministic extraction via CSS selectors. Prefer TEMPLATE as soon as a template matches the domain.`,

  [`### Tip pro : URL-only enrichissement

Tu peux importer un Excel avec **uniquement une colonne URL** (sans titre/marque/réf). Le pipeline détecte la colonne URL, retrouve le template par domaine, et lance l'enrichissement TEMPLATE en un clic. Workflow type : 1000 URLs → 1000 fiches enrichies.`]:
    `### Pro tip: URL-only enrichment

You can import an Excel file containing **nothing but a URL column** (no title/brand/reference). The pipeline spots the URL column, finds the template by domain, and starts the TEMPLATE enrichment in one click. Typical workflow: 1,000 URLs → 1,000 enriched records.`,

  [`Le **PIM** (*Product Information Management*) est ta **source de vérité produits** : c'est lui qui alimente le *data-merge* avec un template graphique pour produire des fiches en série. Tes bases sont stockées sur Firebase et accessibles depuis n'importe quel poste connecté à ton compte.`]:
    `The **PIM** (*Product Information Management*) is your **single source of truth for products**: it is what feeds the *data merge* alongside a graphic template to turn out records in bulk. Your databases live on Firebase and are reachable from any machine signed in to your account.`,

  [`_Vue d'une base : chaque ligne est un produit ; l'icône violette signale une fiche enrichie par IA._`]:
    `_A database at a glance: every row is a product; the purple icon marks a record enriched by AI._`,

  [`### Bases de données

Tu peux gérer **plusieurs bases** en parallèle. Trois façons d'en créer une :

- **Importer un fichier** — depuis Excel ou CSV/TSV (voir *Importer Excel*).
- **Scraper le web** — partir d'URLs produits et laisser l'IA remplir les fiches.
- **Créer vide** — démarrer une base à la main.`]:
    `### Databases

You can run **several databases** side by side. Three ways to create one:

- **Import a file** — from Excel or CSV/TSV (see *Import Excel*).
- **Scrape the web** — start from product URLs and let the AI fill the records in.
- **Create empty** — start a database by hand.`,

  [`### Enrichir une fiche par IA

Clique sur une ligne → panneau **Enrichi par IA** à droite.

**Mode AUTO** (violet) : si la ligne a un \`title\`, \`brand\` ou \`reference\`, une **recherche web (Jina) + LLM** trouve l'URL et extrait les infos (modèle principal : Gemini, secours : Claude). Risque d'hallucination — à privilégier quand tu n'as pas d'URL.

**Mode TEMPLATE** (vert) : si l'URL est connue ET qu'un template de scraping correspond au domaine, l'extraction est **déterministe** (sélecteurs CSS), le LLM ne sert qu'à la rédaction. Précision maximale.

**Astuce** : si ta ligne a **uniquement une URL** (colonne \`url\`, \`URL\`, \`product_url\`…), le pipeline détecte la colonne, associe le template et lance le Mode TEMPLATE — idéal pour traiter 1000 URLs en lot.`]:
    `### Enriching a record with AI

Click a row → **AI-enriched** panel on the right.

**AUTO mode** (purple): if the row has a \`title\`, \`brand\` or \`reference\`, a **web search (Jina) + LLM** finds the URL and pulls the information out (main model: Gemini, fallback: Claude). Hallucination is possible — best used when you have no URL.

**TEMPLATE mode** (green): if the URL is known AND a scraping template matches the domain, the extraction is **deterministic** (CSS selectors) and the LLM only handles the wording. Maximum accuracy.

**Tip**: if your row has **nothing but a URL** (column \`url\`, \`URL\`, \`product_url\`…), the pipeline spots the column, matches the template and starts TEMPLATE mode — ideal for processing 1,000 URLs in one batch.`,

  [`### Champs structurés

Au-delà du texte simple, une fiche stocke des champs riches, tous exploitables dans le data-merge :

- **Formules Excel** : évaluées à la volée.
- **Spécifications** : \`[{ group, name, value }]\` (dimensions, matériaux…).
- **Variants** : références produit (ref, label, propriétés).
- **Documents** : liens PDF, fiches techniques, vidéos.
- **Images** : URLs ou fichiers Firebase Storage.`]:
    `### Structured fields

Beyond plain text, a record stores rich fields, all usable in the data merge:

- **Excel formulas**: evaluated on the fly.
- **Specifications**: \`[{ group, name, value }]\` (dimensions, materials…).
- **Variants**: product references (ref, label, properties).
- **Documents**: PDF links, data sheets, videos.
- **Images**: URLs or Firebase Storage files.`,

  [`### Champs calculés (colonnes formules)

Une colonne peut être une **formule** plutôt qu'une valeur saisie — comme dans Excel. Tu écris une expression qui référence d'autres colonnes, et la valeur se **recalcule à la volée** quand les données changent.

- Exemple : une colonne **\`Prix TTC\`** = \`Prix HT * 1.2\`, ou une **remise** = \`(Prix barré - Prix) / Prix barré\`.
- Les formules supportent les opérateurs arithmétiques, les références de colonnes et les fonctions courantes ; elles sont **réévaluées automatiquement** à chaque modification d'une cellule source ou d'une ligne enrichie par IA.
- Le résultat est un champ **comme un autre** : exploitable dans le *data-merge* (placeholder \`{{ prix_ttc }}\`), filtrable et exportable.
- Types de colonnes reconnus à l'import et à l'édition : **texte, nombre, formule, dictionnaire (liste de valeurs), date** — détectés automatiquement depuis un Excel (voir *Importer Excel*).`]:
    `### Calculated fields (formula columns)

A column can be a **formula** rather than a typed-in value — exactly as in Excel. You write an expression referring to other columns, and the value **recalculates on the fly** when the data changes.

- For example: a **\`Price inc. VAT\`** column = \`Price ex. VAT * 1.2\`, or a **discount** = \`(Was price - Price) / Was price\`.
- Formulas support arithmetic operators, column references and the usual functions; they are **re-evaluated automatically** whenever a source cell changes or a row is enriched by AI.
- The result is a field **like any other**: usable in the *data merge* (\`{{ price_inc_vat }}\` placeholder), filterable and exportable.
- Column types recognised on import and while editing: **text, number, formula, dictionary (list of values), date** — detected automatically from an Excel file (see *Import Excel*).`,

  [`### Éditer la table comme un tableur

La table produits se manipule directement, sans quitter la page :

- **Éditer une cellule** : un clic sélectionne, un second clic (ou Entrée) passe en édition ; \`Entrée\` valide, \`Échap\` annule. La saisie est adaptée au **type de colonne** (texte, nombre, date, case à cocher…).
- **Rechercher** : la barre de recherche filtre les lignes dont **n'importe quelle valeur** contient le terme.
- **Trier** : clique l'en-tête (ou le menu de colonne) pour basculer **A→Z / Z→A**, puis annuler le tri. Les colonnes numériques proposent aussi un **tri par couleur** (zones bleu → jaune → vert selon la valeur).
- **Ajouter / supprimer une ligne** : bouton « + » en bas de table ; suppression depuis la ligne.
- **Réorganiser les colonnes** : glisse un en-tête, ou via le **menu de colonne** (← / →, première / dernière position), redimensionne par la poignée, **renomme** ou **masque** une colonne.`]:
    `### Editing the table like a spreadsheet

The product table can be handled directly, without leaving the page:

- **Edit a cell**: one click selects, a second click (or Enter) starts editing; \`Enter\` confirms, \`Esc\` cancels. The input matches the **column type** (text, number, date, tick box…).
- **Search**: the search bar filters the rows in which **any value** contains the term.
- **Sort**: click the header (or the column menu) to toggle **A→Z / Z→A**, then clear the sort. Numeric columns also offer a **colour sort** (blue → yellow → green bands according to the value).
- **Add / delete a row**: the "+" button at the bottom of the table; deletion from the row itself.
- **Reorder the columns**: drag a header, or use the **column menu** (← / →, first / last position), resize with the handle, **rename** or **hide** a column.`,

  [`### Types de colonnes (façon Airtable)

Le bouton **« + »** d'en-tête ouvre un sélecteur de **type de champ**, regroupés par catégorie (Texte, Nombre, Choix, Date, Lien, Autre) avec recherche. Au-delà de texte/nombre/formule, tu disposes notamment de :

- **Texte long / Texte riche**, **Téléphone**, **E-mail**, **URL**.
- **Sélection unique / multiple**, **Case à cocher**, **Évaluation** (étoiles), **Pourcentage**, **Devise**.
- **Date**, **Durée**, **Numéro automatique**, **Code-barres**, **Image / pièce jointe**, **Lien vers une autre entrée**.

Le type pilote l'affichage et l'édition de la cellule ; il est aussi **détecté automatiquement** à l'import Excel.`]:
    `### Column types (Airtable-style)

The **"+"** button in the header opens a **field type** picker, grouped by category (Text, Number, Choice, Date, Link, Other) with a search box. Beyond text/number/formula, you get among others:

- **Long text / Rich text**, **Phone**, **E-mail**, **URL**.
- **Single / multiple select**, **Tick box**, **Rating** (stars), **Percentage**, **Currency**.
- **Date**, **Duration**, **Auto number**, **Barcode**, **Image / attachment**, **Link to another entry**.

The type drives how the cell is displayed and edited; it is also **detected automatically** when importing from Excel.`,

  [`### Statistiques de colonne

Sous l'en-tête d'une colonne numérique, des **badges Min / Moyenne / Max** résument les valeurs visibles. Cliquer **Min** trie en croissant, **Max** en décroissant — un coup d'œil suffit pour repérer prix aberrants ou champs vides.`]:
    `### Column statistics

Under the header of a numeric column, **Min / Mean / Max badges** sum up the visible values. Clicking **Min** sorts ascending, **Max** descending — one glance is enough to spot rogue prices or empty fields.`,

  [`### Fraîcheur par champ

Chaque valeur enrichie porte la **date de son dernier changement** (\`updatedAt\` au niveau du champ). En table, une cellule devient **ambre au-delà de 30 jours** et **rouge au-delà de 90 jours** : tu vois d'un coup d'œil quelles données sont périmées et méritent un ré-enrichissement. Re-merger une valeur identique ne rafraîchit PAS l'âge (sinon il ne voudrait rien dire).`]:
    `### Freshness, field by field

Every enriched value carries the **date of its last change** (a field-level \`updatedAt\`). In the table, a cell turns **amber past 30 days** and **red past 90 days**: you can see at a glance which data has gone stale and deserves re-enriching. Merging an identical value back in does NOT reset the age (otherwise it would mean nothing).`,

  [`### Plusieurs sources dans une base

La **colonne latérale gauche** liste les **sources** d'une base (chaque import / scrape / saisie manuelle = une source). Clique une source pour **afficher/masquer ses produits** dans la table ; coche-en plusieurs pour les **fusionner à l'écran**. Chaque source se **renomme** ou se **supprime** d'un clic. Quand des fiches de sources différentes décrivent le même produit (même SKU/EAN), elles sont **fusionnées** en un produit master, et l'aperçu de fusion te montre **champ par champ** ce qui sera appliqué.`]:
    `### Several sources in one database

The **left-hand sidebar** lists a database's **sources** (each import / scrape / manual entry = one source). Click a source to **show/hide its products** in the table; tick several to **merge them on screen**. Each source can be **renamed** or **deleted** in one click. When records from different sources describe the same product (same SKU/EAN) they are **merged** into a master product, and the merge preview shows you **field by field** what is about to be applied.`,

  [`### Galerie d'images d'une fiche

Dans le panneau de fiche, les images se **réorganisent par glisser-déposer** (la première sert de visuel principal) et se **suppriment** à l'unité. Tu peux **basculer une image entre « Photos » et « Pictos & logos »** d'un clic — utile pour ne garder que les bons visuels avant un data-merge.`]:
    `### A record's image gallery

In the record panel, images can be **reordered by drag-and-drop** (the first one is used as the main visual) and **deleted** one by one. You can **move an image between "Photos" and "Pictograms & logos"** in one click — handy for keeping only the right visuals before a data merge.`,

  [`### Classer & exporter

- Relie une base à une **taxonomie** pour naviguer le catalogue par catégories.
- Une fois les fiches prêtes, le **data-merge** génère un document par produit à partir d'un template (PDF, PNG…).`]:
    `### Filing & exporting

- Link a database to a **taxonomy** to browse the catalogue by category.
- Once the records are ready, the **data merge** generates one document per product from a template (PDF, PNG…).`,

  [`### Vue galerie

Le basculeur **tableau / galerie** (en haut à droite de la table) affiche les produits en **cartes** : visuel (colonne image détectée automatiquement), titre, prix ou marque, et pastille de complétude. Cliquer une carte ouvre la fiche. Le mode choisi est mémorisé.`]:
    `### Gallery view

The **table / gallery** switch (top right of the table) shows the products as **cards**: visual (the image column is detected automatically), title, price or brand, and a completeness dot. Clicking a card opens the record. The chosen mode is remembered.`,

  [`### Complétude des fiches

Chaque ligne de la table porte une **pastille de complétude** : verte (≥ 90 % des colonnes remplies), ambre (≥ 60 %) ou rouge. Survole-la pour voir les **champs manquants**. La barre d'état sous la table affiche la **complétude moyenne** des lignes visibles — pratique pour prioriser l'enrichissement.`]:
    `### Record completeness

Every row in the table carries a **completeness dot**: green (≥ 90 % of the columns filled), amber (≥ 60 %) or red. Hover it to see the **missing fields**. The status bar under the table shows the **average completeness** of the visible rows — handy for deciding what to enrich first.`,

  [`### Voir aussi

L'**export en série** (data-merge) est détaillé dans la section *Export multi-format*. Le **re-skin d'un visuel** par les produits PIM est décrit dans la section *L'éditeur*.`]:
    `### See also

**Bulk export** (data merge) is covered in the *Multi-format export* section. **Re-skinning artwork** from PIM products is described in *The editor* section.`,

  [`Les taxonomies sont des arbres de catégories que tu attaches à tes produits ou tes projets. Elles servent à filtrer, grouper et naviguer dans de gros volumes de données.

Exemple : \`Outillage > Électroportatif > Perceuses > Visseuses-perceuses\`.`]:
    `Taxonomies are trees of categories that you attach to your products or your projects. They exist to filter, group and navigate large volumes of data.

For example: \`Tools > Power tools > Drills > Combi drills\`.`,

  [`_Le navigateur de taxonomie : la branche active s'auto-déplie, le nœud sélectionné est mis en évidence, et chaque niveau a sa propre couleur._`]:
    `_The taxonomy browser: the active branch unfolds by itself, the selected node is highlighted, and each level has its own colour._`,

  [`### Créer une taxonomie

1. Va dans **Taxonomies** depuis le menu
2. Clique **Nouvelle taxonomie**
3. Donne-lui un nom (ex: \`Catégories produits\`)
4. Ajoute des niveaux : clique sur un nœud pour créer un enfant, glisse pour réorganiser
5. Renomme par double-clic, supprime par clic-droit

Les taxonomies sont stockées dans Firestore et synchronisées à travers tes appareils.`]:
    `### Creating a taxonomy

1. Go to **Taxonomies** from the menu
2. Click **New taxonomy**
3. Give it a name (e.g. \`Product categories\`)
4. Add levels: click a node to create a child, drag to reorder
5. Rename with a double-click, delete with a right-click

Taxonomies are stored in Firestore and synchronised across your devices.`,

  [`### Navigation intelligente

Dès qu'une BDD source est active, le navigateur de gauche **auto-déplie** la branche correspondante et **colorise tous les ancêtres** du nœud sélectionné jusqu'à la racine. Désélectionner referme la branche. Pratique pour se repérer dans des arbres profonds (4-5 niveaux et plus).

Quand plusieurs sources matchent, l'arbre se déplie sur l'union des branches actives.`]:
    `### Smart navigation

As soon as a source database is active, the left-hand browser **unfolds** the matching branch and **colours every ancestor** of the selected node up to the root. Deselecting closes the branch again. Handy for finding your way around deep trees (4–5 levels and more).

When several sources match, the tree unfolds over the union of the active branches.`,

  [`### Associer des produits à une catégorie

Dans le PIM, **chaque produit (ligne) est rattaché à un nœud** de la taxonomie. Deux voies :

- **Manuel** — sélectionne une ligne → clique **« Non classé — cliquer pour classer »** au-dessus du panneau → choisis le nœud cible. Tu peux reclasser à tout moment.
- **Automatique au scraping** — si la fiche scrapée porte un fil d'Ariane, le produit est **rangé tout seul** dans la bonne branche (voir *Auto-construction depuis le scraping* ci-dessous).

Une fois associés, les produits se **filtrent par catégorie** depuis le navigateur de gauche, et un export PDF/PPTX peut être **scopé à une branche** pour générer des sous-catalogues. Le nœud d'un produit est une donnée comme une autre : exploitable dans le *data-merge* et la complétude.`]:
    `### Filing products under a category

In the PIM, **every product (row) is attached to a node** of the taxonomy. Two routes:

- **Manual** — select a row → click **"Unfiled — click to file"** above the panel → choose the target node. You can re-file at any time.
- **Automatic while scraping** — if the scraped record carries a breadcrumb, the product **files itself** in the right branch (see *Auto-building from scraping* below).

Once attached, products can be **filtered by category** from the left-hand browser, and a PDF/PPTX export can be **scoped to a branch** to produce sub-catalogues. A product's node is data like any other: usable in the *data merge* and in the completeness score.`,

  [`### Éditer l'arbre (nœuds)

Survole une ligne de l'arbre pour faire apparaître ses actions :

- **+** — ajoute un **nœud enfant** sous le nœud survolé
- **✏ (crayon)** — **renomme** le nœud sur place
- **🔗 (chaîne)** — **lie des projets** au nœud (visible sur les nœuds *feuilles* uniquement)
- **🗑 (corbeille)** — **supprime** le nœud (et ses descendants)

Tu peux aussi **glisser-déposer** un nœud pour le réorganiser ou le re-rattacher à un autre parent. Les actions d'édition (+, ✏, 🗑) sont réservées aux utilisateurs ayant la permission \`taxonomies.edit\` ; la liaison de projets reste accessible aux autres.`]:
    `### Editing the tree (nodes)

Hover a row of the tree to reveal its actions:

- **+** — add a **child node** under the hovered node
- **✏ (pencil)** — **rename** the node in place
- **🔗 (chain)** — **link projects** to the node (shown on *leaf* nodes only)
- **🗑 (bin)** — **delete** the node (and its descendants)

You can also **drag and drop** a node to reorder it or re-attach it to another parent. The editing actions (+, ✏, 🗑) are reserved for users with the \`taxonomies.edit\` permission; linking projects stays available to everyone else.`,

  [`### Rechercher un nœud dans l'arbre

Une barre **« Rechercher un nœud… »** filtre l'arbre dès **2 caractères**. Chaque résultat affiche son **libellé + son chemin complet** (fil d'Ariane). Cliquer un résultat **déplie automatiquement** toute la branche jusqu'à ce nœud, le met en évidence et **fait défiler l'arbre** jusqu'à lui — indispensable dans les nomenclatures de plusieurs centaines d'entrées.`]:
    `### Finding a node in the tree

A **"Search for a node…"** bar filters the tree from **2 characters** onwards. Each result shows its **label + its full path** (breadcrumb). Clicking a result **automatically unfolds** the whole branch down to that node, highlights it and **scrolls the tree** to it — indispensable in nomenclatures running to several hundred entries.`,

  [`### Compteurs de produits par nœud

Chaque nœud affiche **combien de produits y sont rattachés**, sur deux niveaux :

- le compte **direct** (produits posés exactement sur ce nœud) ;
- le compte **cumulé**, qui agrège le nœud **et tous ses descendants** — un nœud parent totalise donc tout ce qui est rangé sous lui.

Le total général de la taxonomie est aussi calculé. Ces compteurs se rafraîchissent en direct quand tu classes ou reclasses des produits.`]:
    `### Product counts per node

Each node shows **how many products are attached to it**, on two levels:

- the **direct** count (products placed exactly on that node);
- the **cumulative** count, which aggregates the node **and all its descendants** — a parent node therefore totals everything filed beneath it.

The taxonomy's grand total is calculated too. These counters refresh live as you file or re-file products.`,

  [`### Classer les produits en lot (IA)

Au lieu de ranger les lignes une par une, tu peux lancer une **classification IA en lot** : l'assistant lit le contenu de chaque ligne de la feuille active et propose le nœud le plus probable de la taxonomie cible. Deux réglages :

- **Seuil de confiance** — n'applique la classification que si l'IA est suffisamment sûre (sinon la ligne est *ignorée*).
- **Écraser les liens existants** — par défaut, les produits déjà classés sont sautés ; active l'option pour les reclasser.

Le traitement est **séquentiel avec progression pas-à-pas** (classés / ignorés / erreurs) et **annulable** à tout moment. Les lignes sans aucun signal exploitable (ni nom, ni marque…) sont écartées.`]:
    `### Filing products in bulk (AI)

Instead of filing rows one by one, you can start a **bulk AI classification**: the assistant reads the content of each row of the active sheet and proposes the most likely node of the target taxonomy. Two settings:

- **Confidence threshold** — only apply the classification if the AI is sure enough (otherwise the row is *skipped*).
- **Overwrite existing links** — by default, products already filed are skipped; turn the option on to re-file them.

Processing is **sequential with step-by-step progress** (filed / skipped / errors) and can be **cancelled** at any time. Rows with no usable signal at all (no name, no brand…) are set aside.`,

  [`### Importer une taxonomie depuis un fichier

Plutôt que de saisir l'arbre à la main, importe une nomenclature existante au format **.md / .txt** (indentation = hiérarchie), **.csv** ou **.xlsx**. IBS-Studio parse le fichier, te montre un **aperçu de l'arbre reconstruit** et le nombre de nœuds détectés, te laisse **nommer** la taxonomie, puis la crée d'un clic. Idéal pour reprendre une arborescence fournisseur déjà exportée d'un ERP ou d'un tableur.`]:
    `### Importing a taxonomy from a file

Rather than typing the tree in by hand, import an existing nomenclature as **.md / .txt** (indentation = hierarchy), **.csv** or **.xlsx**. IBS-Studio parses the file, shows you a **preview of the rebuilt tree** and the number of nodes detected, lets you **name** the taxonomy, then creates it in one click. Ideal for picking up a supplier hierarchy already exported from an ERP or a spreadsheet.`,

  [`### Construire une taxonomie depuis les colonnes du PIM

Si ta feuille contient déjà des colonnes de catégorisation (ex. \`Famille\`, \`Sous-famille\`, \`Type\`), affecte à chacune un **niveau** (1, 2, 3…). \`buildTaxonomyFromLevels()\` parcourt alors les valeurs distinctes colonne par colonne et **reconstruit l'arbre** : niveau 1 = catégories racines, niveaux suivants = sous-nœuds rattachés par association de ligne, chaque niveau recevant sa **couleur dédiée**. C'est la voie « tableur » complémentaire de l'auto-construction par fil d'Ariane.`]:
    `### Building a taxonomy from PIM columns

If your sheet already holds categorisation columns (e.g. \`Family\`, \`Sub-family\`, \`Type\`), give each one a **level** (1, 2, 3…). \`buildTaxonomyFromLevels()\` then walks the distinct values column by column and **rebuilds the tree**: level 1 = root categories, the following levels = sub-nodes attached by row association, each level getting its **own colour**. This is the "spreadsheet" route, complementing auto-building from breadcrumbs.`,

  [`### Plusieurs taxonomies & gestion globale

Tu peux maintenir **plusieurs taxonomies en parallèle** (ex. une par axe d'analyse) et basculer de l'une à l'autre depuis la liste. Le menu d'une taxonomie permet de la **renommer**, la **dupliquer** (repartir d'une base existante), ouvrir ses **paramètres** (dont l'**URL de la source** de référence) et la **supprimer** entièrement. La taxonomie sélectionnée pilote ce qu'affichent le navigateur de gauche et les pickers.`]:
    `### Several taxonomies & overall management

You can keep **several taxonomies running in parallel** (one per axis of analysis, say) and switch between them from the list. A taxonomy's menu lets you **rename** it, **duplicate** it (to start from an existing base), open its **settings** (including the reference **source URL**) and **delete** it outright. The selected taxonomy drives what the left-hand browser and the pickers display.`,

  [`### Lier des projets (designs) à un nœud

Au-delà des produits, un nœud **feuille** peut référencer des **projets** (designs de l'éditeur). La fenêtre **« Lier des projets »** liste tes projets avec vignette et date, propose une **recherche** et des filtres **Tous / Liés / Non liés**, et permet de **tout lier / tout délier** d'un coup. Ensuite, dans la **Bibliothèque**, sélectionner un nœud filtre les projets de ce nœud **et de ses descendants** — une façon de ranger tes créations par catégorie, indépendamment du PIM.`]:
    `### Linking projects (designs) to a node

Beyond products, a **leaf** node can reference **projects** (designs from the editor). The **"Link projects"** window lists your projects with a thumbnail and a date, offers a **search box** and **All / Linked / Unlinked** filters, and lets you **link all / unlink all** in one go. Afterwards, in the **Library**, selecting a node filters the projects of that node **and of its descendants** — a way to file your creations by category, independently of the PIM.`,

  [`### Auto-construction depuis le scraping

Quand tu scrapes un site avec un breadcrumb (fil d'Ariane), IBS-Studio peut auto-construire une taxonomie à partir des chemins de catégorie rencontrés. Utile pour démarrer un PIM en miroir d'un site fournisseur.

Cette auto-construction est faite via \`buildTaxonomyFromLevels()\` quand l'extraction template renvoie un champ \`Fil d'ariane\`.`]:
    `### Auto-building from scraping

When you scrape a site that has a breadcrumb, IBS-Studio can auto-build a taxonomy from the category paths it encounters. Useful for starting a PIM that mirrors a supplier's site.

This auto-building goes through \`buildTaxonomyFromLevels()\` whenever the template extraction returns a \`Fil d'ariane\` (breadcrumb) field.`,

  [`### Onglet Briefs

La page Taxonomies héberge aussi l'onglet **Briefs** : décris un besoin en langage naturel, l'IA pose des questions, compose un panier de produits du catalogue et structure un deck. Détail dans la section **Briefs & génération IA**.`]:
    `### Briefs tab

The Taxonomies page also hosts the **Briefs** tab: describe a need in plain language, the AI asks questions, assembles a basket of catalogue products and structures a deck. Covered in detail in the **Briefs & AI generation** section.`,

  [`### Cas d'usage

- **Catalogue multi-marques** : taxonomie principale par typologie produit (Outillage / Jardin / Électroménager)
- **Multi-langues** : une taxonomie par langue, ou bien une taxonomie unique avec des labels multilingues sur les nœuds
- **Reporting** : filtrer un export PDF/PPTX par catégorie pour générer des sous-catalogues thématiques`]:
    `### Use cases

- **Multi-brand catalogue**: a main taxonomy by product type (Tools / Garden / Home appliances)
- **Multilingual**: one taxonomy per language, or a single taxonomy with multilingual labels on the nodes
- **Reporting**: filter a PDF/PPTX export by category to produce themed sub-catalogues`,

  [`Le DAM (Digital Asset Management) centralise tous tes visuels — photos de banque, images générées par IA, assets de projet — accessibles directement depuis l'éditeur. Il s'ouvre via l'onglet **DAM** du menu latéral.`]:
    `The DAM (Digital Asset Management) brings all your visuals together — stock photos, AI-generated images, project assets — reachable straight from the editor. It opens from the **DAM** tab in the side menu.`,

  [`### Les onglets

Clique un onglet pour l'**ouvrir directement** dans le DAM.`]:
    `### The tabs

Click a tab to **open it directly** in the DAM.`,

  [`### Rechercher des images

- **Par texte** : barre de recherche avec **autocomplétion** et historique des recherches récentes.
- **Par image** (recherche inversée) : bouton **caméra** → choisis une image locale → le DAM trouve des visuels **similaires** dans la banque.
- **Filtres combinables** (volet de gauche) : **Source** (Toutes / Pexels / Unsplash), **Orientation** (Paysage / Portrait / Carré), **Couleur dominante** (palette de 10 teintes).`]:
    `### Searching for images

- **By text**: a search bar with **autocomplete** and a history of your recent searches.
- **By image** (reverse search): **camera** button → pick a local image → the DAM finds **similar** visuals in the stock library.
- **Filters that combine** (left-hand pane): **Source** (All / Pexels / Unsplash), **Orientation** (Landscape / Portrait / Square), **Dominant colour** (a palette of 10 hues).`,

  [`### Créer une image par IA

Onglet **Création d'image** — moteur **Image IA** (Gemini 3.1 image, texte → image). Déplie chaque paramètre :`]:
    `### Creating an image with AI

**Image creation** tab — **AI Image** engine (Gemini 3.1 image, text → image). Unfold each setting:`,

  [`### Visualiser & éditer une image

Un clic ouvre la **visionneuse** (lightbox). Outils d'édition non destructive :`]:
    `### Viewing & editing an image

A click opens the **viewer** (lightbox). Non-destructive editing tools:`,

  [`### Panneau d'informations & crédit photo

À droite de la visionneuse, l'onglet **Infos** récapitule la fiche technique du visuel : **dimensions** (px), **résolution** (mégapixels) et **ratio**, **poids du fichier**, **orientation**, **couleur dominante** (pastille + code hex) et espace **sRGB**, plus les **tags**.

Pour les photos de banque, le panneau affiche aussi la **source** (lien Pexels / Unsplash), le **photographe** (lien vers son profil) et l'**ID source** — l'attribution requise par ces banques est ainsi toujours accessible. Pour une image de projet, il montre à la place le **nom du fichier**.`]:
    `### Information panel & photo credit

To the right of the viewer, the **Info** tab sums up the visual's technical details: **dimensions** (px), **resolution** (megapixels) and **ratio**, **file size**, **orientation**, **dominant colour** (swatch + hex code) and **sRGB** space, plus the **tags**.

For stock photos, the panel also shows the **source** (Pexels / Unsplash link), the **photographer** (a link to their profile) and the **source ID** — so the attribution those libraries require is always at hand. For a project image, it shows the **file name** instead.`,

  [`### Onglet Prompts (images IA)

Quand une image a été **générée par IA**, un onglet **Prompts** s'ajoute dans la visionneuse. Il restitue le **prompt d'origine** (ton texte brut), le **prompt amélioré** réellement envoyé à Image IA, et les **précisions Q&R** du mode « Avec questions ». Chaque prompt a un bouton **Copier** pour réutiliser le brief tel quel sur une nouvelle génération.`]:
    `### Prompts tab (AI images)

When an image has been **generated by AI**, a **Prompts** tab appears in the viewer. It gives you back the **original prompt** (your raw text), the **improved prompt** actually sent to AI Image, and the **Q&A clarifications** from the "With questions" mode. Each prompt has a **Copy** button so you can reuse the brief as it stands on a new generation.`,

  [`### Variantes

Sauvegarde une retouche (crop + colorimétrie + miroir + rotation) comme **variante nommée** d'une image, sans toucher l'originale :

- **Enregistrer variante** → donne-lui un nom.
- **Charger / Mettre à jour / Renommer / Supprimer** depuis le panneau **Versions**.
- L'original reste accessible (★ Original). Pratique pour décliner un même visuel (cadrage carré pour réseaux, 16:9 pour bannière…).`]:
    `### Variants

Save an edit (crop + colour grading + mirror + rotation) as a **named variant** of an image, without touching the original:

- **Save variant** → give it a name.
- **Load / Update / Rename / Delete** from the **Versions** panel.
- The original stays available (★ Original). Handy for deriving several versions of the same visual (square crop for social, 16:9 for a banner…).`,

  [`### Analyse IA d'une image

Dans la visionneuse, onglet **Analyse IA** → bouton **« Analyser avec IA »**. L'IA renvoie : **sujet**, description, **marques** identifiées, **texte détecté (OCR)**, ambiance / style / composition / éclairage, objets, **tags de recherche** et **palette de couleurs**. Utile pour retrouver/classer un visuel.`]:
    `### AI analysis of an image

In the viewer, **AI analysis** tab → **"Analyse with AI"** button. The AI returns: **subject**, description, **brands** identified, **detected text (OCR)**, mood / style / composition / lighting, objects, **search tags** and a **colour palette**. Useful for finding and filing a visual.`,

  [`### Tagging automatique & recherche par tags

Chaque image **sauvegardée dans Mes images** (génération IA, images du Chat) est **taguée automatiquement** en arrière-plan : tags, couleur dominante et sujet sont posés sur la fiche quelques secondes après la sauvegarde.

Dans **Mes images**, le champ **« Filtrer par tags ou description »** permet une recherche en langage naturel (ex : _bouteille verte_) — il matche les tags IA, la description et le sujet, sans tenir compte des accents.`]:
    `### Automatic tagging & searching by tag

Every image **saved into My images** (AI generation, images from the Chat) is **tagged automatically** in the background: tags, dominant colour and subject are added to the record a few seconds after saving.

In **My images**, the **"Filter by tags or description"** field allows a plain-language search (e.g. _green bottle_) — it matches the AI tags, the description and the subject, ignoring accents.`,

  [`### Organiser

- **Favoris** (♥) : accès rapide.
- **Collections** : crée des dossiers, ajoute/retire des images, vue **vignettes ou liste**.
- **Projets** : retrouve les **images** et les **polices** d'un projet (deux sous-onglets avec compteurs), vue vignettes ou liste, bouton **Rafraîchir** pour recharger les assets.
- **Supprimer** une image sauvegardée la retire **en cascade** (variantes, collections, favoris).`]:
    `### Organising

- **Favourites** (♥): quick access.
- **Collections**: create folders, add/remove images, **thumbnail or list** view.
- **Projects**: find a project's **images** and **fonts** (two sub-tabs with counters), thumbnail or list view, **Refresh** button to reload the assets.
- **Deleting** a saved image removes it **in cascade** (variants, collections, favourites).`,

  [`### Utiliser une image dans l'éditeur

- **Clic** : insère l'image au centre du canvas (mise à l'échelle automatique).
- **Glisser-déposer** : depuis la grille vers le canvas (équivaut à l'insertion).
- **Remplacer** : en mode sélection d'objet, **double-clic** remplace le bloc actif — l'image épouse son cadre, et l'**original + les remplacements précédents restent mémorisés** sur l'objet (rien n'est perdu).
- **Remplissage** : depuis le panneau Propriétés de l'éditeur, une image du DAM peut aussi servir de **fond** à une forme (remplissage image).`]:
    `### Using an image in the editor

- **Click**: drops the image in the middle of the canvas (scaled automatically).
- **Drag and drop**: from the grid onto the canvas (the same as inserting).
- **Replace**: with an object selected, **double-click** replaces the active block — the image fits its frame, and the **original plus the previous replacements stay remembered** on the object (nothing is lost).
- **Fill**: from the editor's Properties panel, a DAM image can also serve as a shape's **background** (image fill).`,

  [`### Sources externes

- **Pexels & Unsplash** : banque intégrée (recherche + filtres).
- **Google Drive** : connecte ton compte (onglet Google Drive) pour piocher dans tes fichiers.

_Note : le DAM n'a pas d'upload « bibliothèque » classique — tes images entrent via la banque, la génération IA, les assets de projet ou Drive. Les fichiers locaux servent de **référence** pour la génération ou de cible pour la **recherche par image**._`]:
    `### External sources

- **Pexels & Unsplash**: built-in stock library (search + filters).
- **Google Drive**: connect your account (Google Drive tab) to pick from your own files.

_Note: the DAM has no conventional "library" upload — your images come in through the stock library, AI generation, project assets or Drive. Local files act as a **reference** for generation, or as the target of a **search by image**._`,

  [`### Démo express (nouveau module)

Un wizard qui **ensemence tout le studio depuis le site d'un prospect** : société + URL → découverte automatique des rayons, scraping des produits, projet PIM, images au DAM, catalogue démo, carte promo et workflow. Volumétrie réglable, **consignes créatives** pour piloter le plan du catalogue, **console journal en direct** (étapes, appels IA avec coût, bilan par fiche), re-runs idempotents.

_Détails : section **Démo express**._`]:
    `### Express demo (new module)

A wizard that **seeds the whole studio from a prospect's website**: company + URL → automatic discovery of the aisles, product scraping, PIM project, images into the DAM, demo catalogue, promo card and workflow. Adjustable volume, **creative instructions** to steer the catalogue plan, a **live log console** (steps, AI calls with their cost, per-record summary), idempotent re-runs.

_Details: the **Express demo** section._`,

  [`### Catalogue studio : fiches produit sur mesure

- **Densité des fiches** : modes **Exhaustif** (toute la donnée source, 2 fiches/page) et **Condensé** (4 fiches/page), plafonds « Puces max » / « Spécifications max » réglables.
- **Tableau « Caractéristiques »** : specs en paires nom/valeur sur 2 colonnes, bloc de disposition à part, taille et police dédiées.
- **Bandeau taxonomie (Univers › Famille)** : taille, couleur et police par niveau, réglable depuis « Prompt & style ».
- **« Taille identique sur toutes les fiches »**, **« Texte sur 2 colonnes »** pour la description, **couleurs du thème éditables**, **ruban vedette** par produit.

_Détails : section **Catalogue studio**._`]:
    `### Catalogue studio: product pages made to measure

- **Page density**: **Exhaustive** mode (all the source data, 2 products per page) and **Condensed** (4 products per page), with adjustable "Max bullets" / "Max specifications" ceilings.
- **"Characteristics" table**: specs as name/value pairs across 2 columns, its own layout block, dedicated size and font.
- **Taxonomy strip (Universe › Family)**: size, colour and font per level, adjustable from "Prompt & style".
- **"Same size on every page"**, **"Text in 2 columns"** for the description, **editable theme colours**, a **featured ribbon** per product.

_Details: the **Catalogue studio** section._`,

  [`### Scraping : textes fidèles et galeries pleine résolution

- **Extraction verbatim** : les textes de la fiche (description, points forts) sont **recopiés de la source**, jamais rédigés par l'IA — structure (paragraphes, listes) préservée.
- **Galeries d'images en pleine résolution** (Adobe Scene7, galeries Magento embarquées), sans doublons ni logos/drapeaux parasites.
- **Fiches sans pollution** : menus, avis clients, footer et pages éditoriales sont écartés.

_Détails : section **Web Scraping**._`]:
    `### Scraping: faithful text and full-resolution galleries

- **Verbatim extraction**: the record's text (description, key features) is **copied from the source**, never written by the AI — the structure (paragraphs, lists) is preserved.
- **Full-resolution image galleries** (Adobe Scene7, embedded Magento galleries), with no duplicates and no stray logos or flags.
- **Records free of pollution**: menus, customer reviews, footers and editorial pages are set aside.

_Details: the **Web scraping** section._`,

  [`### Fréquentation & trafic (administration)

Tableau de bord d'audience **maison** (aucun tiers) dans **Utilisateurs & rôles → Analytics** : visites par période (« Aujourd'hui », 90 j, dates libres), pays et villes, journal de consultation groupé par utilisateur, **« Trafic en direct »**, **alertes Telegram** de visite, et la **PWA mobile « Pulse »**.

_Détails : section **Fréquentation & trafic**._`]:
    `### Visits & traffic (administration)

An **in-house** audience dashboard (no third parties) under **Users & roles → Analytics**: visits by period ("Today", 90 days, free dates), countries and cities, a browsing log grouped by user, **"Live traffic"**, **Telegram alerts** on a visit, and the **"Pulse" mobile PWA**.

_Details: the **Visits & traffic** section._`,

  [`### Navigation & confort

- **Palette de commandes ⌘K / Ctrl+K** : projets récents, modules, actions rapides — depuis n'importe quelle page.
- **Centre de notifications (🔔 en bas à gauche)** : historique des runs de workflows et des exports, badge de non-lus.
- **États vides actionnables** : les écrans vides proposent désormais le prochain pas (ex : DAM vide → « Créer une image par IA »).

_Détails : section **Navigation & visites guidées**._`]:
    `### Navigation & comfort

- **Command palette ⌘K / Ctrl+K**: recent projects, modules, quick actions — from any page.
- **Notification centre (🔔 bottom left)**: history of workflow runs and exports, with an unread badge.
- **Actionable empty states**: empty screens now suggest the next step (e.g. empty DAM → "Create an image with AI").

_Details: the **Navigation & guided tours** section._`,

  [`### Éditeur

- **Barre contextuelle flottante** sous la sélection (dupliquer, plans, grouper, verrouiller, supprimer) + **badge temps réel** pendant les manipulations (X/Y, L×H, angle).
- **Preflight d'impression** (panneau Impression → Analyser) : images basse résolution, objets hors page, textes trop petits ou trop près du bord.
- **Éléments maîtres** : clic droit → « Répéter sur toutes les pages » (logo, pagination, mentions).
- **Kit de marque** et **styles d'objets** globaux (panneau Palette) : couleurs et styles partagés entre tous vos projets.
- **Versions** : snapshots du document avec restauration en un clic (panneau Versions).

_Détails : section **L'éditeur**._`]:
    `### Editor

- **Floating context bar** under the selection (duplicate, stacking order, group, lock, delete) + a **live badge** while you manipulate an object (X/Y, W×H, angle).
- **Print preflight** (Print panel → Analyse): low-resolution images, objects off the page, text too small or too close to the edge.
- **Master elements**: right-click → "Repeat on every page" (logo, page numbers, legal notices).
- **Brand kit** and global **object styles** (Palette panel): colours and styles shared across all your projects.
- **Versions**: document snapshots with one-click restore (Versions panel).

_Details: **The editor** section._`,

  [`### Re-skin de promo (éditeur × PIM × IA)

- Source **« Produits PIM (re-skin) »** dans le panneau Données : chaque produit devient une ligne — naviguer entre les produits re-skinne le visuel instantanément.
- **« Lier automatiquement »** : prix, titre et description détectés et liés en un clic.
- **« Fond IA (Nano Banana) »** : régénère le fond d'un flyer décomposé à partir d'un prompt, sans toucher aux textes éditables.
- **« Réduire pour tenir dans la zone »** (champ texte sélectionné) : la taille du texte s'adapte à chaque produit pour ne jamais déborder. Tu définis la **zone cible** (largeur en px, et nombre de lignes max pour les descriptions) — indépendante du produit affiché.`]:
    `### Promo re-skinning (editor × PIM × AI)

- The **"PIM products (re-skin)"** source in the Data panel: every product becomes a row — stepping between products re-skins the artwork instantly.
- **"Link automatically"**: price, title and description detected and bound in one click.
- **"AI background (Nano Banana)"**: regenerates the background of a broken-apart flyer from a prompt, without touching the editable text.
- **"Shrink to fit the area"** (with a text field selected): the text size adapts to each product so it never overflows. You define the **target area** (width in px, and a maximum number of lines for descriptions) — independently of the product on display.`,

  [`### PIM & données

- **Pastille de complétude** sur chaque ligne (champs manquants au survol) + moyenne en barre d'état.
- **Vue galerie** : produits en cartes (visuel, titre, prix, complétude).

_Détails : section **PIM**._`]:
    `### PIM & data

- A **completeness dot** on every row (missing fields on hover) + the average in the status bar.
- **Gallery view**: products as cards (visual, title, price, completeness).

_Details: the **PIM** section._`,

  [`### Workflows & automatisation

- **Galerie de modèles** 1-clic (Scraper → PIM, veille, recherche web…).
- Node **« Approbation Telegram »** : le run se met en pause jusqu'au clic ✅/❌.
- Node **« Veille prix »** : alerte seulement quand un prix bouge (fonctionne en cron serveur).
- Node **« Cron »** : planification **côté serveur** (minute → mois, heure précise, Europe/Paris) — vos workflows tournent navigateur fermé.
- **Webhook entrant** : déclenchez un workflow depuis l'extérieur (Zapier, ERP, curl).
- **Mode « Pas à pas »** : exécution node par node avec inspection des sorties.

_Détails : section **Workflows**._`]:
    `### Workflows & automation

- A **template gallery**, one click each (Scrape → PIM, price monitoring, web search…).
- **"Telegram approval"** node: the run pauses until you click ✅/❌.
- **"Price watch"** node: alerts only when a price moves (works under the server cron).
- **"Cron"** node: **server-side** scheduling (minute → month, exact time, Europe/Paris) — your workflows run with the browser closed.
- **Inbound webhook**: trigger a workflow from outside (Zapier, ERP, curl).
- **"Step by step" mode**: execution node by node, inspecting the outputs as you go.

_Details: the **Workflows** section._`,

  [`### Veille tarifaire & comparaison de prix

- Nouveau module **Veille tarifaire** : tableau de bord des prix concurrents (écarts par produit, positionnement, alertes), alimenté par le node **« Veille tarifaire »** d'un workflow.
- Modèles 1-clic **« Comparer mes prix aux concurrents → Excel »** et **« Comparaison de prix quotidienne → Google Sheets »** (cron serveur).
- **Découverte auto de la page liste** par famille produit : colle un domaine (ou rien), le node trouve la bonne page catégorie de chaque enseigne et compare les EAN.

_Détails : section **Veille tarifaire**._`]:
    `### Price monitoring & price comparison

- A new **Price monitoring** module: a dashboard of competitor prices (gap per product, positioning, alerts), fed by a workflow's **"Price monitoring"** node.
- One-click templates **"Compare my prices with the competition → Excel"** and **"Daily price comparison → Google Sheets"** (server cron).
- **Automatic discovery of the listing page** per product family: paste a domain (or nothing at all) and the node finds each retailer's right category page and compares the EANs.

_Details: the **Price monitoring** section._`,

  [`### Telegram sans navigateur (répondeur serveur)

- **Le bot répond app fermée** : questions avec recherche web automatique (sources citées), \`/flow\` généré **et exécuté côté serveur**, \`/run\` d'un workflow sauvegardé.
- **Google côté serveur** : connectez **« Google — accès serveur »** une fois (Paramètres → Connecteurs) → \`/flow\` peut créer des **Google Sheets** dans votre Drive et envoyer des **Gmail**, navigateur fermé.
- Seuls les workflows à **rendu graphique** (PDF, visuels) attendent l'ouverture de l'app — un message vous prévient.

_Détails : section **Telegram**._`]:
    `### Telegram without a browser (server-side responder)

- **The bot answers with the app closed**: questions with an automatic web search (sources cited), \`/flow\` generated **and executed server-side**, \`/run\` for a saved workflow.
- **Google server-side**: connect **"Google — server access"** once (Settings → Connectors) → \`/flow\` can create **Google Sheets** in your Drive and send **Gmail**, with the browser closed.
- Only workflows that produce **graphic output** (PDF, artwork) wait for the app to be opened — a message tells you so.

_Details: the **Telegram** section._`,

  [`### DAM, Telegram & export

- **Tagging IA automatique** des images sauvegardées + **filtre en langage naturel** dans « Mes images ».
- **Digest Telegram quotidien** (opt-in, 08:00) : résumé des dernières 24 h.
- **Pack social** à l'export : carré, story, paysage et bannière en un zip.
- **Pages déclinées** à l'export : crée une page **éditable** par format (carré, story, paysage, bannière), design mis à l'échelle et centré, ajustable à la main — sans génération d'image.`]:
    `### DAM, Telegram & export

- **Automatic AI tagging** of saved images + a **plain-language filter** in "My images".
- **Daily Telegram digest** (opt-in, 08:00): a summary of the last 24 hours.
- **Social pack** on export: square, story, landscape and banner in a single zip.
- **Derived pages** on export: creates one **editable** page per format (square, story, landscape, banner), with the design scaled and centred and adjustable by hand — with no image generation involved.`,

  [`IDML (InDesign Markup Language) est le format d'échange officiel d'InDesign CC+. IBS-Studio parse ce format pour reconstruire la maquette dans son éditeur Fabric.js.`]:
    `IDML (InDesign Markup Language) is the official interchange format of InDesign CC and later. IBS-Studio parses it to rebuild the layout in its Fabric.js editor.`,

  [`### Comment exporter un IDML depuis InDesign

1. Ouvre ton document dans InDesign CC ou plus récent
2. **Fichier → Exporter…**
3. Choisis le format **InDesign Markup (IDML)**
4. Enregistre

Le fichier IDML est en réalité un ZIP contenant XML + ressources (fonts, images).`]:
    `### How to export an IDML from InDesign

1. Open your document in InDesign CC or later
2. **File → Export…**
3. Choose the **InDesign Markup (IDML)** format
4. Save

An IDML file is really a ZIP holding XML + resources (fonts, images).`,

  [`### Importe le « package », pas seulement le .idml

L'import attend un **assemblage InDesign** (Fichier → **Empaqueter…**), pas un \`.idml\` isolé :

- un **fichier \`.idml\`** *et* un **\`.pdf\` de référence** sont **obligatoires** — sans le PDF, l'import s'arrête avec « Composants manquants »
- les **polices** du dossier *Document Fonts* sont chargées **automatiquement** (via FontFace, avec lecture des métadonnées OpenType et du fichier \`AdobeFnt.lst\` pour des noms de familles et graisses exacts) — pas besoin de les installer sur la machine
- les **images** sont récupérées depuis le dossier *Links*

Le plus simple : glisse le **dossier d'empaquetage complet** (qui contient \`.idml\`, \`.pdf\`, *Document Fonts* et *Links*).`]:
    `### Import the "package", not just the .idml

The importer expects an **InDesign package** (File → **Package…**), not an isolated \`.idml\`:

- an **\`.idml\` file** *and* a **reference \`.pdf\`** are **both required** — without the PDF, the import stops with "Missing components"
- the **fonts** in the *Document Fonts* folder are loaded **automatically** (through FontFace, reading the OpenType metadata and the \`AdobeFnt.lst\` file for exact family names and weights) — no need to install them on the machine
- the **images** are picked up from the *Links* folder

The simplest route: drag in the **whole package folder** (the one holding \`.idml\`, \`.pdf\`, *Document Fonts* and *Links*).`,

  [`### Importer dans IBS-Studio

1. Tableau de bord → **Importer**
2. Sélectionne le \`.idml\`
3. Patiente : le parser extrait formes, textes, images, fonts, ombres et transparence — **toutes les pages** du document (chaque planche devient une page IBS-Studio)
4. Le projet s'ouvre dans l'éditeur

Sont aussi reconnus : les **gabarits (masters)** — leurs objets apparaissent en fond de chaque page —, les **cadres de texte non rectangulaires** (ovale, tracé personnalisé), la **cascade de styles** InDesign (styles de paragraphe/caractère + surcharges locales, styles imbriqués et GREP) et les liens graphiques **EPS / PDF / WMF / pages importées** en plus des images bitmap.

L'éditeur reconstitue la maquette à l'identique sur un canvas Fabric.js. Tu peux ensuite ajouter des placeholders (\`{{title}}\`, \`{{price}}\`…) pour le data-merge.`]:
    `### Importing into IBS-Studio

1. Dashboard → **Import**
2. Select the \`.idml\`
3. Wait: the parser extracts shapes, text, images, fonts, shadows and transparency — from **every page** of the document (each spread becomes an IBS-Studio page)
4. The project opens in the editor

Also recognised: **master pages** — their objects appear behind every page —, **non-rectangular text frames** (oval, custom path), the InDesign **style cascade** (paragraph/character styles + local overrides, nested styles and GREP styles) and the **EPS / PDF / WMF / placed page** graphic links, alongside bitmap images.

The editor rebuilds the layout identically on a Fabric.js canvas. You can then add placeholders (\`{{title}}\`, \`{{price}}\`…) for the data merge.`,

  [`> **Gabarit issu d'EasyCatalog ?** Ses champs sont reconnus **automatiquement** (texte → \`{{placeholders}}\`, cadres image liés) et le réexport IDML les conserve. Voir la rubrique dédiée **EasyCatalog (InDesign)**.`]:
    `> **Template coming from EasyCatalog?** Its fields are recognised **automatically** (text → \`{{placeholders}}\`, linked image frames) and the IDML re-export keeps them. See the dedicated **EasyCatalog (InDesign)** entry.`,

  [`### Décomposition en calques éditables

Rien n'est aplati en image : chaque objet redevient un calque manipulable dans l'éditeur.

- **Cadres de texte → bloc texte éditable** avec le **style par caractère** reconstruit : corps, couleur, **exposant/indice** (décalage de ligne de base), **approche** (tracking), **barré**, casse (tout en capitales), graisse et italique. La **cascade de styles** est résolue (style de paragraphe → de caractère → surcharges locales), y compris les **styles imbriqués** et les **styles GREP**, ainsi que les marges internes et la justification verticale du cadre.
- **Formes → objets vectoriels éditables** : rectangles (avec arrondis), ovales, lignes, et **polygones / tracés personnalisés** restitués en **courbes de Bézier**. Couleur de fond, contour (alignement intérieur/extérieur) et **ombre portée** sont conservés.
- **Images** : le **recadrage, l'échelle et le décalage** de chaque image dans son cadre sont reproduits à l'identique pour coller au placement InDesign.`]:
    `### Broken down into editable layers

Nothing is flattened into an image: every object becomes a layer you can work with in the editor.

- **Text frames → editable text blocks** with the **per-character style** rebuilt: size, colour, **superscript/subscript** (baseline shift), **tracking**, **strikethrough**, case (all caps), weight and italics. The **style cascade** is resolved (paragraph style → character style → local overrides), including **nested styles** and **GREP styles**, along with the frame's inset spacing and vertical justification.
- **Shapes → editable vector objects**: rectangles (with rounded corners), ovals, lines, and **polygons / custom paths** rendered as **Bézier curves**. Fill colour, stroke (inside/outside alignment) and **drop shadow** are preserved.
- **Images**: each image's **crop, scale and offset** inside its frame are reproduced exactly, to match the InDesign placement.`,

  [`### Couleurs CMJN converties fidèlement

Les nuances CMJN sont ramenées en RVB pour l'écran. Quand InDesign a déjà stocké la valeur sRGB de la couleur (issue de sa propre conversion ICC), elle est **utilisée telle quelle**. Sinon, la conversion s'appuie sur un **modèle colorimétrique FOGRA39** (primaires Neugebauer) plutôt qu'une formule naïve — les bleus, verts et noirs profonds restent crédibles. Les nuances *Sans*/*Papier* deviennent transparent / blanc.`]:
    `### CMYK colours converted faithfully

CMYK swatches are brought back to RGB for the screen. When InDesign has already stored the colour's sRGB value (from its own ICC conversion), that value is **used as it stands**. Otherwise the conversion relies on a **FOGRA39 colour model** (Neugebauer primaries) rather than a naive formula — so blues, greens and rich blacks stay believable. The *None*/*Paper* swatches become transparent / white.`,

  [`### Ce qui est préservé vs approximé à l'export

L'export IDML n'est **pas une régénération** : il **repatche le ZIP IDML d'origine**. Sont réinjectées tes modifications de **texte, image, couleur de fond, position et taille** ; tout le reste du document (styles, calques, réglages non touchés) est conservé intact. Si tu as remplacé une image, le téléchargement est un **ZIP** contenant l'\`.idml\` + un dossier \`Links/\` pour qu'InDesign retrouve les fichiers.

Côté affichage, les formats que le navigateur ne sait pas décoder (**TIF, PSD, EPS, AI**) apparaissent comme un **cadre gris nommé** (placeholder) dans l'éditeur — mais le fichier d'origine reste lié et réexporté tel quel.`]:
    `### What is preserved vs approximated on export

The IDML export is **not a regeneration**: it **patches the original IDML ZIP back**. Your changes to **text, images, fill colour, position and size** are re-injected; everything else in the document (styles, layers, settings you did not touch) is left intact. If you replaced an image, the download is a **ZIP** holding the \`.idml\` + a \`Links/\` folder so InDesign can find the files.

On the display side, the formats a browser cannot decode (**TIF, PSD, EPS, AI**) appear as a **named grey frame** (placeholder) in the editor — but the original file stays linked and is re-exported as it stands.`,

  [`### Limites connues

- **Fonts custom** : si non installées sur la machine → fallback Arial. Pour une fidélité parfaite, charge tes fonts dans \`public/fonts/\`
- **Dégradés** : non importés — les objets dégradés reviennent en couleur unie (à recréer dans l'éditeur si besoin)
- **Effets avancés** (modes de fusion exotiques) : peuvent être approximés

Pour les cas complexes, garde InDesign comme outil de finition : exporte un IDML depuis IBS-Studio après merge, puis ouvre dans InDesign pour ajustement.`]:
    `### Known limits

- **Custom fonts**: if they are not installed on the machine → Arial fallback. For perfect fidelity, load your fonts into \`public/fonts/\`
- **Gradients**: not imported — gradient objects come back as a solid colour (recreate them in the editor if you need to)
- **Advanced effects** (exotic blend modes): may be approximated

For complex cases, keep InDesign as your finishing tool: export an IDML from IBS-Studio after the merge, then open it in InDesign to fine-tune.`,

  [`### Aller-retour InDesign ↔ IBS-Studio

Le cycle classique :

1. **Graphiste** crée la maquette dans InDesign
2. Exporte un IDML
3. **Imprimeur** importe dans IBS-Studio, ajoute placeholders, branche le data-merge
4. **Batch export IDML** (un par produit) ou PDF direct
5. Si finition graphique nécessaire : reimport InDesign sur les fichiers IDML générés

Pas de lock-in : tu retrouves toujours tes données en IDML standard.`]:
    `### Round trip InDesign ↔ IBS-Studio

The classic cycle:

1. The **designer** creates the layout in InDesign
2. Exports an IDML
3. The **printer** imports it into IBS-Studio, adds placeholders, wires up the data merge
4. **Batch IDML export** (one per product) or straight to PDF
5. If graphic finishing is needed: re-import the generated IDML files into InDesign

No lock-in: you always get your data back as standard IDML.`,

  [`Plutôt que de remplir manuellement chaque champ d'une fiche produit, tu peux décrire un brief en langage naturel et laisser l'IA structurer le contenu.

Exemples de briefs :
- _« Génère une description marketing de 80 mots pour ce caniveau Nicoll, ton sérieux, focus durabilité »_
- _« Résume les 12 caractéristiques techniques en 3 bullet points avantages-clients »_
- _« Traduis cette fiche en anglais britannique, ton commercial »_`]:
    `Rather than filling in every field of a product record by hand, you can describe a brief in plain language and let the AI structure the content.

Example briefs:
- _"Write an 80-word marketing description for this Nicoll channel drain, serious tone, focus on durability"_
- _"Boil the 12 technical characteristics down to 3 customer-benefit bullet points"_
- _"Translate this record into British English, sales tone"_`,

  [`### Modèles IA utilisés

IBS-Studio s'appuie par défaut sur :

- **Claude Opus** (Anthropic) — questions dynamiques, composition du panier et structure du deck
- **Gemini** (Google) — prompts d'images, mots-clés catalogue, génération d'images (Claude en secours)
- **Enrichissement produit** (PIM/scraping) — Gemini en principal, Claude en secours

Le modèle exact de chaque fournisseur se choisit dans _Réglages → IA_ ; le bouton **« Mettre à jour tous les LLM »** réaligne la sélection sur les dernières versions. Les clés API sont configurées dans les paramètres de l'app. Aucun envoi automatique : chaque appel est explicite (clic utilisateur).`]:
    `### AI models used

By default, IBS-Studio relies on:

- **Claude Opus** (Anthropic) — dynamic questions, basket composition and deck structure
- **Gemini** (Google) — image prompts, catalogue keywords, image generation (Claude as fallback)
- **Product enrichment** (PIM/scraping) — Gemini as the main model, Claude as fallback

The exact model for each provider is chosen in _Settings → AI_; the **"Update all LLMs"** button realigns the selection with the latest versions. API keys are configured in the app settings. Nothing is sent automatically: every call is explicit (a user click).`,

  [`### Où utiliser les briefs ?

**Dans les Taxonomies** : l'onglet **Briefs** de la page Taxonomies est le panneau dédié — décris ton besoin, l'IA pose des **questions dynamiques**, compose un **panier de produits** depuis le catalogue et structure un **deck** (avec prompts d'images).

**Dans le PIM** : à la création d'une ligne ou pour réécrire un champ. Le panneau d'enrichissement IA propose une zone prompt par champ.

**Dans le scraping** : quand tu définis un schéma Map+Extract, tu peux ajouter un prompt global qui guide l'extraction. Ex: _« Les prix sont TTC. La marque est sous le titre. Ignore les accessoires liés. »_

**Dans les templates de scraping** : champ **Prompt fournisseur** propagé à tous les templates d'un même domaine. Idéal pour des contraintes communes (TVA, devise, format de référence…).`]:
    `### Where can you use briefs?

**In Taxonomies**: the **Briefs** tab of the Taxonomies page is the dedicated panel — describe what you need, the AI asks **dynamic questions**, assembles a **product basket** from the catalogue and structures a **deck** (with image prompts).

**In the PIM**: when creating a row, or to rewrite a field. The AI enrichment panel offers a prompt box per field.

**In scraping**: when you define a Map+Extract schema, you can add an overall prompt to guide the extraction. E.g. _"Prices include VAT. The brand sits under the title. Ignore linked accessories."_

**In scraping templates**: a **Supplier prompt** field, propagated to every template on the same domain. Ideal for shared constraints (VAT, currency, reference format…).`,

  [`### L'assistant brief en 5 étapes

Dans les Taxonomies, ouvrir un brief lance un **assistant guidé** qui transforme un besoin client en proposition commerciale livrable :

1. **Formulaire client** — coordonnées et identité de marque (nom, logo, couleurs primaire/secondaire, brand kit).
2. **Questions dynamiques** — l'IA lit le formulaire + la nomenclature et **génère des questions sur mesure** ; elle pré-sélectionne aussi les familles de produits pertinentes (les identifiants inventés sont automatiquement écartés).
3. **Panier produits** — l'IA compose un panier depuis le catalogue à partir des réponses.
4. **Deck** — l'IA esquisse la structure de la présentation et génère les visuels.
5. **Export** — téléchargement du PPTX et clôture du brief.

Chaque brief mémorise son **étape courante** et son **statut** (_brouillon → formulaire → panier → deck → terminé_) : on peut fermer et reprendre exactement où on s'était arrêté, sans rien relancer. Tout est persisté dans Firestore (collection \`briefs\`).`]:
    `### The brief assistant in 5 steps

In Taxonomies, opening a brief starts a **guided assistant** that turns a client's need into a deliverable commercial proposal:

1. **Client form** — contact details and brand identity (name, logo, primary/secondary colours, brand kit).
2. **Dynamic questions** — the AI reads the form + the nomenclature and **generates made-to-measure questions**; it also pre-selects the relevant product families (invented identifiers are discarded automatically).
3. **Product basket** — from your answers, the AI assembles a basket out of the catalogue.
4. **Deck** — the AI sketches the presentation structure and generates the visuals.
5. **Export** — download the PPTX and close the brief.

Each brief remembers its **current step** and its **status** (_draft → form → basket → deck → finished_): you can close it and pick up exactly where you left off, without re-running anything. Everything is persisted in Firestore (the \`briefs\` collection).`,

  [`### Comment l'IA compose le panier

À la première arrivée sur l'étape Panier, la génération **démarre automatiquement** (panier vide + aucun journal antérieur). Le pipeline est traçable en direct via un **journal de génération** :

- Si la nomenclature porte une **URL source**, l'IA extrait des mots-clés du brief puis **scrape le site** pour bâtir le catalogue candidat. Sans URL source — ou si le scraping échoue / ne renvoie rien — bascule automatique sur un catalogue de démonstration.
- L'IA sélectionne des produits et **justifie** chaque choix.
- **Garde-fous anti-hallucination** : les SKU absents du catalogue sont rejetés, avec une 2e tentative si l'écart est trop grand ; les produits hors des familles jugées pertinentes sont écartés (sauf catalogue scrapé non structuré). Un avertissement indique combien de SKU ont été ignorés.

Le **journal est conservé** sur le brief : revenir sur l'étape l'affiche tel quel sans relancer la génération. Pour reprendre la main, le bouton **Régénérer** relance le pipeline.`]:
    `### How the AI assembles the basket

The first time you reach the Basket step, generation **starts on its own** (empty basket + no previous log). The pipeline can be followed live through a **generation log**:

- If the nomenclature carries a **source URL**, the AI extracts keywords from the brief, then **scrapes the site** to build the candidate catalogue. With no source URL — or if the scraping fails or returns nothing — it automatically falls back on a demonstration catalogue.
- The AI selects products and **justifies** each choice.
- **Anti-hallucination guards**: SKUs absent from the catalogue are rejected, with a second attempt if the gap is too wide; products outside the families judged relevant are set aside (except for an unstructured scraped catalogue). A warning tells you how many SKUs were ignored.

The **log is kept** on the brief: coming back to the step shows it as it stands, without re-running the generation. To take back control, the **Regenerate** button restarts the pipeline.`,

  [`### Éditer et exporter le panier

Le panier généré reste **entièrement modifiable, ligne par ligne** : quantités, ajout/retrait de produits, et surtout un **prix appliqué** qui peut surcharger le prix catalogue d'origine (les deux sont conservés). Une **remise globale** en pourcentage ou en montant fixe se règle dans le récapitulatif ; le sous-total et le total estimé se recalculent en direct.

Le bouton **CSV** exporte le panier (SKU, nom, quantité, prix unitaire, prix appliqué, total ligne) — pratique pour un devis ou un ré-import. La validation de l'étape enregistre le panier, la remise et le total estimé sur le brief.`]:
    `### Editing and exporting the basket

The generated basket stays **fully editable, row by row**: quantities, adding/removing products, and above all an **applied price** that can override the original catalogue price (both are kept). An **overall discount**, as a percentage or a fixed amount, is set in the summary; the subtotal and the estimated total recalculate live.

The **CSV** button exports the basket (SKU, name, quantity, unit price, applied price, line total) — handy for a quotation or a re-import. Confirming the step saves the basket, the discount and the estimated total onto the brief.`,

  [`### Deck et export PPTX

L'IA esquisse un **deck** composé de slides typées : couverture, contexte, **grille de produits** (layout 2×2 / 3×2 / 1×3), focus produit, **budget** (total + détail) et appel à l'action. Les SKU cités qui ne sont plus au panier sont automatiquement retirés.

Pour les **visuels**, le bouton « Générer toutes les images » produit en lot : une image **héros**, une **scène de mise en situation** (staging) et une image par produit du panier (via Image IA / Gemini, stockées dans Firebase Storage). Les images orphelines sont purgées quand le panier change.

L'export construit un **PPTX réellement habillé à la marque du client** (logo, couleurs primaire/secondaire, bandeau, images en letterbox). Le fichier est téléchargé **et** archivé dans Storage ; le brief passe au statut _terminé_ avec un lien vers le PPTX.`]:
    `### Deck and PPTX export

The AI sketches a **deck** made of typed slides: cover, context, **product grid** (2×2 / 3×2 / 1×3 layout), product focus, **budget** (total + breakdown) and call to action. Any SKUs quoted that are no longer in the basket are removed automatically.

For the **visuals**, the "Generate all the images" button produces them in one batch: a **hero** image, a **staging scene** and one image per product in the basket (through AI Image / Gemini, stored in Firebase Storage). Orphaned images are purged when the basket changes.

The export builds a **PPTX genuinely dressed in the client's brand** (logo, primary/secondary colours, banner, letterboxed images). The file is downloaded **and** archived in Storage; the brief moves to the _finished_ status with a link to the PPTX.`,

  [`### Génération d'images

Le DAM intègre la génération d'images via Gemini (modèle image dit « Image IA »). Tu décris une image en français ou en anglais, l'IA produit un visuel utilisable directement dans tes templates.

Cas d'usage : visuels d'ambiance, mockups, illustrations éditoriales. Pour des photos produits réelles, scraping et upload restent prioritaires.`]:
    `### Image generation

The DAM includes image generation through Gemini (the image model known as "AI Image"). You describe an image in French or in English, and the AI produces a visual you can use straight away in your templates.

Use cases: mood shots, mock-ups, editorial illustrations. For genuine product photos, scraping and uploading remain the first port of call.`,

  [`### Limites des briefs

- L'IA peut **halluciner** des références ou caractéristiques. Toujours vérifier le résultat avant publication, surtout sur les chiffres et les normes.
- Les briefs sont stateless : aucune mémoire conversationnelle. Si tu veux raffiner, refais le brief avec plus de contexte.
- Le coût en tokens est facturé à l'usage. Privilégie les **templates de scraping** (déterministes, gratuits) pour les flux récurrents et garde les briefs pour le travail créatif.`]:
    `### Limits of briefs

- The AI can **hallucinate** references or characteristics. Always check the result before publishing, especially figures and standards.
- Briefs are stateless: there is no conversational memory. If you want to refine, redo the brief with more context.
- Token cost is billed on usage. Favour **scraping templates** (deterministic, free) for recurring flows and keep briefs for creative work.`,

  [`Un **template de scraping** décrit comment extraire les champs d'un site fournisseur : un **domaine**, un **pattern d'URL** et des **sélecteurs CSS** par champ. Une fois enregistré, il matche automatiquement toutes les futures URLs du domaine — extraction **déterministe**, sans hallucination ni tokens IA.`]:
    `A **scraping template** describes how to extract the fields of a supplier's site: a **domain**, a **URL pattern** and **CSS selectors** per field. Once saved, it automatically matches every future URL on that domain — **deterministic** extraction, with no hallucination and no AI tokens.`,

  [`### L'éditeur de template

- **Nouveau** crée un template : nom, domaine (\`nicoll.fr\`), pattern d'URL (\`.*\` pour tout matcher).
- Onglet **Pointer & cliquer** : charge une URL produit dans l'aperçu, puis **double-clique** sur le titre, le prix, la description… le sélecteur CSS se génère tout seul.
- Onglet **Avancé (JSON)** : édite le template en JSON brut pour les cas pointus.
- **Tester sur une URL** : lance l'extraction réelle et affiche un **score** (≥ 20 = OK) champ par champ avant d'enregistrer.
- **Exporter / Importer** : sauvegarde et partage les templates en JSON.`]:
    `### The template editor

- **New** creates a template: name, domain (\`nicoll.fr\`), URL pattern (\`.*\` to match everything).
- **Point & click** tab: load a product URL in the preview, then **double-click** the title, the price, the description… the CSS selector writes itself.
- **Advanced (JSON)** tab: edit the template as raw JSON for the trickier cases.
- **Test on a URL**: runs the real extraction and shows a **score** (≥ 20 = OK) field by field before you save.
- **Export / Import**: save and share templates as JSON.`,

  [`### Trois niveaux de prompts IA

En complément des sélecteurs, trois prompts optionnels guident le post-traitement LLM :

- **Prompt global** (du template) : instructions de reformatage pour tous les produits de ce template — ex. _« retirer le heading H1 de la description »_, _« les specs sont dans les accordéons »_.
- **Prompt fournisseur** : **partagé par tous les templates du même domaine** (modifié à un endroit, propagé partout) — ex. _« les prix sont TTC, ne pas convertir »_.
- **Prompt par champ** : post-traitement ciblé d'un seul champ (traduction, normalisation d'unité…).`]:
    `### Three levels of AI prompt

Alongside the selectors, three optional prompts guide the LLM post-processing:

- **Global prompt** (of the template): reformatting instructions for every product of this template — e.g. _"drop the H1 heading from the description"_, _"the specs sit inside the accordions"_.
- **Supplier prompt**: **shared by every template on the same domain** (change it in one place, it propagates everywhere) — e.g. _"prices include VAT, do not convert"_.
- **Per-field prompt**: targeted post-processing of a single field (translation, unit normalisation…).`,

  [`### Cinq types de sélecteurs

Au-delà du CSS classique, chaque champ accepte plusieurs **stratégies** testées dans l'ordre — on garde la **première valeur non vide**, ce qui rend le template robuste quand le fournisseur change son CSS :

- **CSS** : sélecteur standard, lit le texte (ou un attribut).
- **XPath** : pour les structures que le CSS n'atteint pas.
- **Attribut** (\`selector@@attr\`) : lit \`src\`, \`href\`, \`data-*\`… (ex. \`img@@src\`).
- **Texte (regex)** : applique une expression régulière sur tout le texte de la page (utile pour un EAN ou une référence noyés).
- **Texte hiérarchisé** : rend le contenu d'un onglet/section en **Markdown** (titres \`#/##/###\`, listes, tables \`clé | valeur\`) au lieu d'un bloc plat — pour livrer au LLM une vue structurée fidèle (règle universelle de scraping nº 3).`]:
    `### Five kinds of selector

Beyond plain CSS, each field accepts several **strategies**, tried in order — the **first non-empty value** wins, which keeps the template robust when the supplier changes their CSS:

- **CSS**: the standard selector, reading the text (or an attribute).
- **XPath**: for the structures CSS cannot reach.
- **Attribute** (\`selector@@attr\`): reads \`src\`, \`href\`, \`data-*\`… (e.g. \`img@@src\`).
- **Text (regex)**: applies a regular expression to the page's entire text (useful for an EAN or a reference buried in prose).
- **Structured text**: renders the content of a tab/section as **Markdown** (\`#/##/###\` headings, lists, \`key | value\` tables) rather than a flat block — to hand the LLM a faithful structured view (universal scraping rule no. 3).`,

  [`### Transformations & specs KEY/VALUE

- **Transformations par champ** : \`trim\`, \`normalize-whitespace\`, \`uppercase\`/\`lowercase\`, \`parse-number\`, \`parse-price\` (isole le nombre d'un prix), \`absolutize-url\` (chemin relatif → URL absolue, posé automatiquement quand on capture un \`src\`/\`href\`), \`decode-html\`.
- **Groupes de specs (KEY/VALUE)** : un sélecteur de **conteneur** + **titre de groupe** + **ligne** + **clé** + **valeur** extrait les caractéristiques techniques en paires propres (ex. _Dimensions → Poids : 2,3 kg_), organisées par section.
- **Documents PDF** : pointer le conteneur des liens suffit — tous les \`<a href>\` PDF sont collectés au format \`titre##url\`, **noms de fichiers conservés**.
- **Listes intelligentes** : pour un champ « liste » (images, avantages, variantes), si le sélecteur ne matche qu'un seul conteneur, l'engine **éclate automatiquement** ses enfants (\`li\`, \`p\`, \`div\`…) ou découpe le texte par puces — pas besoin de cibler chaque item. Les **variantes** lues dans un \`<table>\` sont pivotées en réf./libellé/propriétés.`]:
    `### Transformations & KEY/VALUE specs

- **Per-field transformations**: \`trim\`, \`normalize-whitespace\`, \`uppercase\`/\`lowercase\`, \`parse-number\`, \`parse-price\` (isolates the number in a price), \`absolutize-url\` (relative path → absolute URL, applied automatically when you capture a \`src\`/\`href\`), \`decode-html\`.
- **Spec groups (KEY/VALUE)**: a **container** selector + **group title** + **row** + **key** + **value** extracts the technical characteristics as clean pairs (e.g. _Dimensions → Weight: 2.3 kg_), organised by section.
- **PDF documents**: pointing at the container of the links is enough — every PDF \`<a href>\` is collected in \`title##url\` form, with **file names preserved**.
- **Smart lists**: for a "list" field (images, benefits, variants), if the selector matches a single container, the engine **breaks its children apart automatically** (\`li\`, \`p\`, \`div\`…) or splits the text on the bullets — no need to target each item. **Variants** read from a \`<table>\` are pivoted into reference/label/properties.`,

  [`### Pré-actions & capture via extension Chrome

- **Pré-actions** (onglet Avancé) : avant la capture du DOM, on peut enchaîner \`click\` (déplier un accordéon/onglet), \`scroll\`, \`wait\`, \`waitForSelector\` et \`acceptCookies\` (auto-détection du bandeau) — indispensable pour les fiches dont les specs sont derrière un dépliant.
- **Aperçu sans CORS** : « Charger » récupère le HTML via la **Cloud Function \`fetchPageHtml\`** (serveur, sans CORS), avec repli sur des proxies publics. Les sites SPA à challenge anti-bot passent par l'**extension Chrome** : bouton _« Ouvrir dans Chrome & tagger »_ ouvre l'URL dans un vrai onglet et capture les sélecteurs au double-clic, polices et JS réels chargés.
- Dans l'iframe d'aperçu : **double-clic** = capturer un élément, **simple-clic** = naviguer (ouvrir un accordéon, changer d'onglet) avant de capturer.`]:
    `### Pre-actions & capture through the Chrome extension

- **Pre-actions** (Advanced tab): before the DOM is captured, you can chain \`click\` (unfold an accordion/tab), \`scroll\`, \`wait\`, \`waitForSelector\` and \`acceptCookies\` (the banner is auto-detected) — indispensable for records whose specs sit behind a fold-out.
- **CORS-free preview**: "Load" fetches the HTML through the **\`fetchPageHtml\` Cloud Function** (server-side, no CORS), falling back on public proxies. SPA sites with an anti-bot challenge go through the **Chrome extension**: the _"Open in Chrome & tag"_ button opens the URL in a real tab and captures the selectors on double-click, with the real fonts and JS loaded.
- Inside the preview iframe: **double-click** = capture an element, **single click** = navigate (open an accordion, switch tab) before capturing.`,

  [`### Ordre des champs & alias de marque (niveau fournisseur)

- **Ordre des champs** : réorganiser les champs par glisser-déposer fixe leur ordre d'affichage dans l'enrichissement — **partagé entre tous les templates du même domaine**.
- **Alias de marque** : si l'auto-association marque ⇔ domaine échoue, déclarer un alias (ex. domaine \`somatherm-outillage.fr\` + alias \`Somatherm\`) force les produits dont la colonne _Marque_ vaut « Somatherm » à matcher ce template.
- **Score d'extraction** : le test note titre (+10), description ≥ 40 car. (+8), images (+5, +3 au-delà de 3), documents (+3) et jusqu'à +20 pour les specs. **≥ 20 = OK** (vert), 10–19 = partiel, < 10 = faible — c'est ce seuil qui décide si l'enrichissement fait confiance au template ou bascule sur le LLM.`]:
    `### Field order & brand aliases (supplier level)

- **Field order**: reordering the fields by drag-and-drop fixes the order they appear in during enrichment — **shared across every template on the same domain**.
- **Brand alias**: if the automatic brand ⇔ domain match fails, declare an alias (e.g. domain \`somatherm-outillage.fr\` + alias \`Somatherm\`) to force products whose _Brand_ column reads "Somatherm" to match this template.
- **Extraction score**: the test scores title (+10), description ≥ 40 chars (+8), images (+5, +3 beyond three), documents (+3) and up to +20 for the specs. **≥ 20 = OK** (green), 10–19 = partial, < 10 = weak — that threshold is what decides whether enrichment trusts the template or falls back on the LLM.`,

  [`### Statistiques d'usage

Chaque template trace son nombre d'**applications** et de **succès** — un template au taux de succès en chute signale un site qui a changé de structure (sélecteurs à re-pointer).`]:
    `### Usage statistics

Every template records how many times it has been **applied** and how many **successes** it had — a template whose success rate is falling is telling you the site has changed its structure (the selectors need re-pointing).`,

  [`### Voir aussi

La vue d'ensemble par fournisseur (templates groupés par domaine) est dans le **Scraping Hub**. Le mode d'emploi général du scraping (quel mode choisir, Map + Extract, limites anti-bot) est dans la section **Scraping produits**.`]:
    `### See also

The per-supplier overview (templates grouped by domain) lives in the **Scraping Hub**. The general instructions for scraping (which mode to choose, Map + Extract, anti-bot limits) are in the **Product scraping** section.`,

  [`Le module **Animation** produit des **animations HTML/CSS/JS autonomes** — un ZIP prêt à ouvrir dans un navigateur, à héberger ou à intégrer dans un e-mail. Pas de codec vidéo, pas de montage : tout est décrit par l'IA puis rendu en mouvement.`]:
    `The **Animation** module produces **self-contained HTML/CSS/JS animations** — a ZIP ready to open in a browser, to host, or to drop into an e-mail. No video codec, no editing suite: the AI describes it all, then it is rendered in motion.`,

  [`### Deux façons de créer`]:
    `### Two ways to create`,

  [`### Format et durée

- **Ratio** : Auto, portrait (9:16), carré (1:1), paysage (16:9) ou **dimensions personnalisées** (largeur × hauteur, 240 à 4096 px, ratio affiché en direct).
- **Durée** : 5, 10 (défaut), 15, 30 s ou **valeur libre de 3 à 60 s** — en mode brief, l'IA ajuste le nombre et la longueur des scènes pour tenir la durée cible.
- **Instructions libres** : champ texte optionnel (ex. _« rythme énergique, transitions punchy, palette néon »_), interprété par l'IA en **palette, rythme et intensité** ; le détail du style appliqué (pace, intensity, easing, couleurs, mood) s'affiche sous le résultat.
- **Effacer** réinitialise le formulaire ; **Stop** (bouton rouge pendant la génération) annule le rendu en cours.`]:
    `### Format and duration

- **Ratio**: Auto, portrait (9:16), square (1:1), landscape (16:9) or **custom dimensions** (width × height, 240 to 4096 px, with the ratio shown live).
- **Duration**: 5, 10 (default), 15, 30 s or **any value from 3 to 60 s** — in brief mode, the AI adjusts the number and length of the scenes to hit the target duration.
- **Free-form instructions**: an optional text field (e.g. _"energetic pace, punchy transitions, neon palette"_), which the AI reads as **palette, pace and intensity**; the detail of the style applied (pace, intensity, easing, colours, mood) appears under the result.
- **Clear** resets the form; **Stop** (the red button while it generates) cancels the render in flight.`,

  [`### Enrichir et finaliser

- **Enrichir avec des images IA** : l'IA génère un visuel par scène (affiché en fond, effet Ken Burns).
- **Aperçu live** : le lecteur joue la composition avec le style appliqué (rythme, intensité, easing, palette).
- **Télécharger (.zip)** : récupère l'animation HTML autonome.
- **Sauvegarder dans le DAM** : l'animation rejoint la bibliothèque (onglet *Animations HTML*), réouvrable et re-téléchargeable.`]:
    `### Enriching and finishing

- **Enrich with AI images**: the AI generates one visual per scene (shown as the background, with a Ken Burns effect).
- **Live preview**: the player runs the composition with the style applied (pace, intensity, easing, palette).
- **Download (.zip)**: get the self-contained HTML animation.
- **Save to the DAM**: the animation joins the library (*HTML animations* tab), where it can be reopened and downloaded again.`,

  [`### Le ZIP est une animation autonome et jouable

Le \`index.html\` est **self-contained** (CSS, JS, données et auto-play tout inline) : double-clique-le, il s'ouvre même en \`file://\`, sans serveur. Le ZIP contient aussi un \`README.md\` (mode d'emploi) et un \`vars.json\` (les variables — composition, marque, caption, style — à titre informatif).

À l'ouverture, l'animation **boucle automatiquement** et une **barre de contrôle flottante** apparaît en bas :

- **Fit** (touche \`0\`) adapte à la fenêtre · **100 %** (touche \`1\`) affiche en taille réelle pixel-perfect.
- **+ / −** (ou \`Ctrl/Cmd + molette\`) zooment ; **Espace + glisser** (ou clic du milieu) fait un panoramique.
- **P** met en pause / reprend ; **double-clic** redémarre l'animation.

> GSAP est chargé depuis un CDN public : une **connexion internet** est nécessaire à la première lecture.`]:
    `### The ZIP is a self-contained, playable animation

The \`index.html\` is **self-contained** (CSS, JS, data and auto-play all inline): double-click it and it opens even over \`file://\`, with no server. The ZIP also holds a \`README.md\` (instructions) and a \`vars.json\` (the variables — composition, brand, caption, style — for reference).

On opening, the animation **loops automatically** and a **floating control bar** appears at the bottom:

- **Fit** (\`0\` key) fits it to the window · **100 %** (\`1\` key) shows it pixel-perfect at real size.
- **+ / −** (or \`Ctrl/Cmd + wheel\`) zoom; **Space + drag** (or middle-click) pans.
- **P** pauses / resumes; **double-click** restarts the animation.

> GSAP is loaded from a public CDN: an **internet connection** is needed the first time it plays.`,

  [`### Gérer ses animations dans le DAM

Dans l'onglet *Animations HTML* du DAM, chaque carte affiche le **ratio**, le **poids** et la **date** :

- **Ouvrir** joue l'animation dans un nouvel onglet (le ZIP est extrait à la volée, l'\`index.html\` est servi tel quel).
- **Télécharger ZIP** récupère le fichier (nommé d'après le titre, sinon marque/caption).
- **Renommer** en cliquant le titre (crayon), **Supprimer** via la corbeille.`]:
    `### Managing your animations in the DAM

In the DAM's *HTML animations* tab, each card shows the **ratio**, the **size** and the **date**:

- **Open** plays the animation in a new tab (the ZIP is extracted on the fly and the \`index.html\` served as it stands).
- **Download ZIP** gets the file (named after the title, otherwise the brand/caption).
- **Rename** by clicking the title (pencil), **Delete** via the bin.`,

  [`### Bibliothèque de prompts

Chaque génération mémorise son brief : tu peux le **rejouer**, le **charger** pour l'ajuster, le **renommer** ou le **supprimer** — pour produire des variantes sans tout ressaisir.`]:
    `### Prompt library

Every generation remembers its brief: you can **replay** it, **load** it to adjust it, **rename** it or **delete** it — so you can turn out variations without typing everything again.`,

  [`### Voir aussi

La génération s'appuie sur les modèles IA configurés dans les **Paramètres → IA**. Les visuels de scène utilisent le moteur de génération d'image (Image IA), le même que dans le DAM et le Chat IA.`]:
    `### See also

Generation relies on the AI models configured in **Settings → AI**. The scene visuals use the image generation engine (AI Image), the same one as in the DAM and the AI Chat.`,

  [`La **Démo express** ensemence un environnement de démonstration complet à partir du site web d'un prospect. Un seul formulaire — la société et l'URL de son site — déclenche un pipeline en huit étapes : **Charte graphique du site** → **Découverte des produits** → **Enrichissement des fiches** → **Images → DAM (Google Drive)** → **Feuille PIM** → **Catalogue studio** → **Fiche promo** → **Workflow personnalisé**. À l'arrivée, le panneau **« Découvrez vos données »** relie chaque artefact créé à son module. Comptez quelques minutes (~30 s à 1 min par fiche).`]:
    `The **Express demo** seeds a complete demonstration environment from a prospect's website. A single form — the company and its site URL — sets off an eight-step pipeline: **Site brand identity** → **Product discovery** → **Record enrichment** → **Images → DAM (Google Drive)** → **PIM sheet** → **Catalogue studio** → **Promo card** → **Custom workflow**. At the end, the **"Discover your data"** panel links each artefact created to its module. Allow a few minutes (roughly 30 s to 1 min per record).`,

  [`### Lancer une démo pas à pas

1. Renseignez la **Société du prospect** (ex. *Jardiland*) et le **Site du prospect** : l'adresse d'accueil suffit, la démo descend toute seule dans les rayons du site et échantillonne les produits répartis sur ses univers.
2. Choisissez le **Nombre de produits à scraper** : boutons **6 / 12 / 24 / 48 produits**, ou la valeur exacte de votre choix (champ « ou exactement », de 1 à 48). Plus de produits = démo plus riche mais plus longue.
3. Ajoutez si besoin des **Consignes créatives** (optionnel) — voir ci-dessous.
4. Cliquez **Lancer la démo**. La checklist des huit étapes s'anime en direct (spinner, coche verte, avertissement ambre, erreur, étape sautée) avec le détail de l'étape en cours (« 3/12 — Perceuse GBH 5-40 »).

Un bouton **Arrêter** est disponible pendant le run : l'arrêt se fait proprement **à la fin de l'item en cours** (« Arrêt en cours (fin de l'item)… »), et tout ce qui a déjà été produit est conservé. Depuis le menu des modules, l'entrée « Scraper N produits » ouvre directement le formulaire avec la volumétrie préremplie.`]:
    `### Running a demo, step by step

1. Fill in the **Prospect's company** (e.g. *Jardiland*) and the **Prospect's site**: the home page address is enough — the demo goes down into the site's aisles by itself and samples products spread across its universes.
2. Choose the **Number of products to scrape**: **6 / 12 / 24 / 48 products** buttons, or the exact figure of your choice ("or exactly" field, from 1 to 48). More products = a richer demo, but a longer one.
3. Add **Creative instructions** if you need to (optional) — see below.
4. Click **Start the demo**. The checklist of the eight steps animates live (spinner, green tick, amber warning, error, skipped step) with the detail of the current step ("3/12 — GBH 5-40 hammer drill").

A **Stop** button is available during the run: it stops cleanly **at the end of the current item** ("Stopping (finishing the item)…"), and everything already produced is kept. From the modules menu, the "Scrape N products" entry opens the form directly with the volume pre-filled.`,

  [`### Découverte automatique des rayons (et étage anti-bot)

Vous donnez l'**URL de base** du site, pas une page de listing. Si l'accueil est un « hub » sans cartes produit, la démo **descend automatiquement dans les rubriques du menu** et prélève quelques produits par rayon, pour couvrir la taxonomie du prospect. Le rendu instable des boutiques SPA est couvert par une **seconde tentative de découverte** automatique. Face à une protection anti-bot (DataDome, Akamai…), le pipeline **escalade vers Bright Data** : la page d'accueil puis les rayons sont relus via le connecteur, et la charte graphique est même récupérée depuis l'\`og:image\` du site si l'analyse directe a échoué. Les URLs à l'évidence non-produit (cookies, actualités, concours…) sont écartées **avant** l'enrichissement, pour ne pas perdre ~1 minute par page parasite.`]:
    `### Automatic aisle discovery (and the anti-bot tier)

You give the site's **base URL**, not a listing page. If the home page is a "hub" with no product cards, the demo **goes down into the menu sections automatically** and takes a few products from each aisle, to cover the prospect's taxonomy. The unstable rendering of SPA shops is covered by an automatic **second discovery attempt**. Faced with anti-bot protection (DataDome, Akamai…), the pipeline **escalates to Bright Data**: the home page and then the aisles are read again through the connector, and the brand identity is even recovered from the site's \`og:image\` if the direct analysis failed. URLs that are obviously not products (cookies, news, competitions…) are set aside **before** enrichment, so as not to lose about a minute per stray page.`,

  [`### Enrichissement des fiches : le vrai moteur PIM

Chaque page produit repérée passe dans le **moteur d'enrichissement du PIM** (le même que le module Scraping) : nom, description, référence, spécifications, prix, EAN, images… Les pages **éditoriales** (landing métier, guide) ne sont pas jetées : la démo y **redescend** jusqu'à deux niveaux (métier → gamme → produit) pour récupérer de vraies fiches. Chaque fiche aboutie s'affiche dans le journal avec son **bilan** : référence, nombre de specs, nombre d'images, prix et EAN réellement obtenus — une fiche creuse se repère immédiatement.`]:
    `### Enriching the records: the real PIM engine

Every product page found goes through the **PIM enrichment engine** (the same one as the Scraping module): name, description, reference, specifications, price, EAN, images… **Editorial** pages (trade landing pages, guides) are not thrown away: the demo **descends** through them up to two levels (trade → range → product) to bring back genuine records. Each completed record appears in the log with its **summary**: reference, number of specs, number of images, price and EAN actually obtained — a hollow record shows up immediately.`,

  [`### Consignes créatives : pilotez le plan du catalogue

Le champ **Consignes créatives** (optionnel) pilote le **plan créatif du catalogue** généré par l'IA : mise en page, densité, ambiance, couverture (ex. *« catalogue premium épuré, fiches en liste pleine largeur, couverture ambiance jardin d'été »*). La **charte du site reste prioritaire pour les couleurs** : palette et consignes extraites du site du prospect sont injectées à part dans le plan. Le brief est persisté dans le catalogue, donc itérable ensuite dans le Catalogue studio. Les fiches du catalogue démo sont en **pleine page** (1 produit/page), seule surface qui garantit 100 % des avantages et du tableau de specs sur les produits riches. Une **couverture IA** est générée en bonus ; en cas d'échec, la couverture typographique est conservée.`]:
    `### Creative instructions: steer the catalogue plan

The **Creative instructions** field (optional) steers the **creative plan of the catalogue** generated by the AI: layout, density, mood, cover (e.g. *"clean premium catalogue, full-width list entries, summer-garden cover"*). The **site's brand identity keeps priority over colours**: the palette and instructions extracted from the prospect's site are injected separately into the plan. The brief is persisted in the catalogue, so you can iterate on it afterwards in the Catalogue studio. The demo catalogue's entries are **full-page** (1 product per page), the only surface that guarantees 100 % of the benefits and the spec table on rich products. An **AI cover** is generated as a bonus; if it fails, the typographic cover is kept.`,

  [`### Journal live : une console fixée en bas de l'écran

Pendant le run, un **Journal** façon terminal est fixé en bas de l'écran (repliable d'un clic, barre de défilement visible). Chaque ligne est horodatée et typée par couleur : **étape** (actions du pipeline, bilans de fiches en vert), **IA** (chaque appel terminé avec fournisseur, modèle, tâche, durée et coût en dollars), **connecteur** (Jina, Bright Data, Drive DAM…) et **erreur**. Le défilement automatique suit la dernière ligne, mais ne vous interrompt jamais quand vous remontez lire l'historique. Le journal conserve les 600 dernières lignes.`]:
    `### Live log: a console pinned to the bottom of the screen

While the run is going, a terminal-style **Log** is pinned to the bottom of the screen (collapsible in one click, with a visible scrollbar). Every line is timestamped and colour-typed: **step** (pipeline actions, record summaries in green), **AI** (each completed call with provider, model, task, duration and cost in dollars), **connector** (Jina, Bright Data, Drive DAM…) and **error**. Auto-scroll follows the latest line, but never interrupts you when you scroll back to read the history. The log keeps the last 600 lines.`,

  [`### « Découvrez vos données » : tout est relié

À la fin du run, une carte par module ensemencé permet d'ouvrir directement le résultat :`]:
    `### "Discover your data": everything is joined up

At the end of the run, one card per seeded module lets you open the result directly:`,

  [`### Bon à savoir

- **Échec franc plutôt que catalogue parasite** : sans la moindre fiche à identité produit (référence/EAN — ou prix + vraies specs), la démo n'ensemence **rien** et vous invite à essayer une URL de rayon ou de fiche produit. Un catalogue « politique de confidentialité » est pire que vide.
- **Re-runs idempotents** : relancer une démo pour la même société **remplace** les artefacts « Démo {Société} » existants (feuille PIM, catalogue, fiche promo, workflow) et **réutilise** les images déjà déposées dans le Drive — pas de doublons empilés, pas de quota re-consommé.
- **Chaque étape est tolérante** : un échec la marque en erreur ou avertissement et la suite continue avec ce qui a réussi (un catalogue sans images DAM reste un catalogue).
- **Quotas du rôle démo** : sur un compte démo, les plafonds s'appliquent — 50 produits PIM et 20 images DAM (le maximum du formulaire est d'ailleurs 48 produits).`]:
    `### Worth knowing

- **An outright failure rather than a junk catalogue**: without a single record carrying a product identity (reference/EAN — or a price plus genuine specs), the demo seeds **nothing** and invites you to try an aisle or product-page URL. A "privacy policy" catalogue is worse than an empty one.
- **Idempotent re-runs**: running a demo again for the same company **replaces** the existing "Demo {Company}" artefacts (PIM sheet, catalogue, promo card, workflow) and **reuses** the images already put into the Drive — no stacked duplicates, no quota spent twice.
- **Every step is forgiving**: a failure marks it as an error or a warning and the rest carries on with whatever succeeded (a catalogue without DAM images is still a catalogue).
- **Demo-role quotas**: on a demo account the ceilings apply — 50 PIM products and 20 DAM images (the form's maximum is 48 products in any case).`,

  [`Chaque objet (texte, image, forme, calque) peut porter ses propres **règles conditionnelles**. Une règle dit : **SI** un champ de ta source remplit une condition, **ALORS** applique une action visuelle à cet objet. Les règles sont évaluées **ligne par ligne** au publipostage, donc le même gabarit se décline tout seul : selon la valeur de chaque produit, l'élément se montre, se cache ou change d'aspect.

C'est l'équivalent natif des actions conditionnelles d'**EasyCatalog**, sans plug-in payant. Combinée au **balisage XML InDesign** (ou à EasyCatalog) pour brancher la base, c'est l'**alternative complète** à un flux print piloté par données.

> Les règles sont **réversibles** : elles ne modifient pas l'objet de façon permanente. Pour les lignes où la condition n'est pas remplie, l'apparence d'origine (visibilité, couleur, opacité, taille, ordre) est restaurée.`]:
    `Every object (text, image, shape, layer) can carry its own **conditional rules**. A rule says: **IF** a field of your source meets a condition, **THEN** apply a visual action to this object. The rules are evaluated **row by row** during the mail merge, so the same template varies itself: depending on each product's value, the element shows, hides or changes appearance.

It is the native equivalent of **EasyCatalog**'s conditional actions, without a paid plug-in. Combined with **InDesign XML tagging** (or with EasyCatalog) to plug the database in, it is the **complete alternative** to a data-driven print workflow.

> The rules are **reversible**: they do not change the object permanently. For the rows where the condition is not met, the original appearance (visibility, colour, opacity, size, order) is restored.`,

  [`### Ouvrir le panneau

1. Sélectionne un objet sur le canvas.
2. Dans la colonne de droite, ouvre le panneau **Propriétés**, puis déplie la section **Règles conditionnelles** (icône branche). Un compteur indique le nombre de règles actives sur l'objet.
3. Clique **Ajouter une règle**.

> Tu peux configurer des règles **même sans connexion live** à la source : les champs disponibles proviennent alors du schéma de la dernière source utilisée. Reconnecte la source pour voir l'aperçu se rejouer en direct.`]:
    `### Opening the panel

1. Select an object on the canvas.
2. In the right-hand column, open the **Properties** panel, then unfold the **Conditional rules** section (branch icon). A counter shows how many rules are active on the object.
3. Click **Add a rule**.

> You can set rules up **even with no live connection** to the source: the available fields then come from the schema of the last source used. Reconnect the source to see the preview play out live.`,

  [`### Composer une règle : SI champ → opérateur → valeur → ALORS action

Chaque règle se lit de gauche à droite :

- **Champ** : la colonne de données testée (ex. \`promo\`, \`stock\`, \`Prix_normal\`).
- **Opérateur** : la condition à vérifier (voir ci-dessous).
- **Valeur** : la valeur de comparaison (masquée pour les opérateurs de présence).
- **Action** : l'effet appliqué à l'objet quand la condition est vraie.`]:
    `### Composing a rule: IF field → operator → value → THEN action

Every rule reads from left to right:

- **Field**: the data column being tested (e.g. \`promo\`, \`stock\`, \`Normal_price\`).
- **Operator**: the condition to check (see below).
- **Value**: the value to compare against (hidden for the presence operators).
- **Action**: the effect applied to the object when the condition is true.`,

  [`### Les opérateurs (3 familles)

**Texte** (comparaison insensible à la casse et aux espaces de début/fin) :
- **Contient** / **Ne contient pas**
- **Est** / **N'est pas** (égalité exacte de chaîne)
- **Commence par** / **Termine par**
- **Ne commence pas avec** / **Ne se termine pas avec**

**Présence** (pas de valeur à saisir) :
- **Est vide** / **N'est pas vide** — parfait pour « montrer le bandeau seulement si la colonne promo est remplie ».

**Numérique** (la valeur est convertie en nombre, tolérant aux devises et au format FR : \`84,99 DT\`, \`1 234,56 €\`, \`100€,00\`) :
- **Est supérieur à** / **Au moins** (≥)
- **Est inférieur à** / **Pas plus que** (≤)
- **Est égal à** / **N'est pas égal à**

> Note : **Est** (texte) et **Est égal à** (numérique) sont volontairement distincts, comme dans EasyCatalog. Une comparaison numérique sur une cellule non chiffrable est simplement considérée comme non remplie.`]:
    `### The operators (3 families)

**Text** (comparison ignores case and leading/trailing spaces):
- **Contains** / **Does not contain**
- **Is** / **Is not** (exact string equality)
- **Starts with** / **Ends with**
- **Does not start with** / **Does not end with**

**Presence** (no value to type):
- **Is empty** / **Is not empty** — perfect for "show the banner only if the promo column is filled in".

**Numeric** (the value is converted to a number, tolerating currencies and the French format: \`84,99 DT\`, \`1 234,56 €\`, \`100€,00\`):
- **Is greater than** / **At least** (≥)
- **Is less than** / **No more than** (≤)
- **Is equal to** / **Is not equal to**

> Note: **Is** (text) and **Is equal to** (numeric) are deliberately distinct, as in EasyCatalog. A numeric comparison against a cell that cannot be read as a number is simply treated as unmet.`,

  [`### Les actions (7)

- **Cacher** : l'objet n'est pas rendu (ni à l'écran, ni à l'export).
- **Montrer** : force l'affichage.
- **Mettre en avant** / **Mettre à l'arrière** : réordonne l'objet dans la pile (z-order).
- **Changer la couleur** : remplit l'objet avec la couleur choisie.
- **Changer l'opacité** : applique une transparence (0 à 1).
- **Changer la taille** : multiplie la taille par un facteur (ex. \`1,5\` = +50 %).

> Pense à renseigner le paramètre de l'action (couleur, opacité, facteur) : une action « nue » n'a aucun effet visible.`]:
    `### The actions (7)

- **Hide**: the object is not rendered (neither on screen nor on export).
- **Show**: forces it to be displayed.
- **Bring to front** / **Send to back**: reorders the object in the stack (z-order).
- **Change the colour**: fills the object with the chosen colour.
- **Change the opacity**: applies a transparency (0 to 1).
- **Change the size**: multiplies the size by a factor (e.g. \`1.5\` = +50 %).

> Remember to fill in the action's parameter (colour, opacity, factor): a "bare" action has no visible effect.`,

  [`### Aperçu et plusieurs règles

Quand une **source est connectée**, l'effet se rejoue **en direct** sur la ligne courante : ajoute ou modifie une règle et le canvas se met à jour aussitôt. Utilise les flèches **◀ ▶** du panneau Publipostage pour parcourir les lignes et vérifier le rendu produit par produit.

Tu peux empiler **plusieurs règles** sur un même objet :

- elles sont évaluées **dans l'ordre** ;
- pour une même propriété, **la dernière règle qui matche l'emporte** (ex. deux règles « Changer la couleur » → la seconde gagne) ;
- exception : **Changer la taille** est **cumulatif** (les facteurs se multiplient).`]:
    `### Preview and multiple rules

When a **source is connected**, the effect plays out **live** on the current row: add or change a rule and the canvas updates at once. Use the **◀ ▶** arrows of the Mail merge panel to walk through the rows and check the rendering product by product.

You can stack **several rules** on the same object:

- they are evaluated **in order**;
- for the same property, **the last matching rule wins** (e.g. two "Change the colour" rules → the second one wins);
- the exception: **Change the size** is **cumulative** (the factors multiply).`,
}
