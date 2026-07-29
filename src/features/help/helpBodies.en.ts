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
}
