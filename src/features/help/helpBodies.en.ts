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

  [`Le module **Workflows** chaîne les fonctions de IBS-Studio (import, scraping, IA, transformation, export, envoi) dans un **graphe visuel**. Chaque **node** est une brique ; tu les relies par leurs ports (entrées/sorties typés).`]:
    `The **Workflows** module chains IBS-Studio's functions together (import, scraping, AI, transformation, export, sending) into a **visual graph**. Each **node** is a building block; you join them through their ports (typed inputs/outputs).`,

  [`### Deux façons de construire

- **Manuel** : glisse les nodes depuis la palette (à gauche), relie-les, configure chacun (panneau de droite), puis **Run**.
- **IA (Prompt-to-Flow)** : bouton **« Générer (IA) »** → décris ton besoin en langage naturel, un LLM construit le graphe complet (nodes + liaisons + config) à partir du catalogue. Disponible aussi via \`/flow\` sur Telegram.

La **palette est progressive** : commence par un node **Import** (source), puis enrichis / transforme / sauvegarde / exporte / communique.`]:
    `### Two ways to build

- **By hand**: drag the nodes out of the palette (on the left), join them up, configure each one (right-hand panel), then **Run**.
- **With AI (Prompt-to-Flow)**: **"Generate (AI)"** button → describe what you need in plain language and an LLM builds the whole graph (nodes + links + configuration) from the catalogue. Also available through \`/flow\` on Telegram.

The **palette is progressive**: start with an **Import** node (the source), then enrich / transform / save / export / communicate.`,

  [`### Catalogue des nodes

Déplie une catégorie pour voir ses nodes.`]:
    `### Node catalogue

Unfold a category to see its nodes.`,

  [`### Node « Web Scraping » unifié

Un **seul node** \`Web Scraping\` couvre toutes les façons de ramener des données du web, via un **sélecteur de Mode** :

- **Scrape** — une ou plusieurs URLs → champs produit (Jina + IA).
- **Liste** — pages catégorie → liste de produits.
- **Crawl** — découverte de fiches sur un site (côté client).
- **Recherche web** — requête → pages lues + tableau de résultats.
- **Question web (IA)** — question → réponse synthétisée + sources.

Le formulaire s'adapte au mode choisi ; tu n'as donc pas à hésiter entre quatre nodes différents.`]:
    `### The unified "Web scraping" node

A **single** \`Web scraping\` node covers every way of bringing data back from the web, through a **Mode** selector:

- **Scrape** — one or more URLs → product fields (Jina + AI).
- **List** — category pages → a list of products.
- **Crawl** — discovering records across a site (client-side).
- **Web search** — a query → pages read + a table of results.
- **Web question (AI)** — a question → a synthesised answer + sources.

The form adapts to the mode chosen, so you never have to hesitate between four different nodes.`,

  [`### Node « Graphique »

Le node **« Graphique »** transforme un tableau en **image de graphe** (PNG, via chart.js). Choisis le **type** — **Barres, Lignes, Aire, Camembert, Anneau** — la **colonne d'axe X**, la ou les **colonnes de valeurs** et une **agrégation** facultative. Il sort à la fois le graphe, l'**asset image** (réutilisable par un Export design ou un envoi Telegram/Gmail) et le **fichier PNG**.

Pour un Google Sheets, pas besoin de ce node : le node **Export Google Sheets** propose une case **« Insérer un graphique »** qui ajoute un graphe **natif** dans la feuille (type, colonne X, colonnes de valeurs).`]:
    `### The "Chart" node

The **"Chart"** node turns a table into a **chart image** (PNG, via chart.js). Choose the **type** — **Bar, Line, Area, Pie, Doughnut** — the **X-axis column**, the **value column(s)** and an optional **aggregation**. It outputs the chart, the **image asset** (reusable by a design export or a Telegram/Gmail send) and the **PNG file**.

For a Google Sheet, you do not need this node: the **Google Sheets export** node offers an **"Insert a chart"** tick box that adds a **native** chart to the sheet (type, X column, value columns).`,

  [`### Écran « Résultat »

Le bouton **« Résultat »** dans l'en-tête de l'éditeur ouvre une page dédiée (\`/workflows/:id/result\`) qui **visualise le dernier run** sous la forme la plus pertinente : **Tableau de bord**, **Tableau**, **Graphique**, **Galerie** (images), **Document** ou **Données** (JSON). Le sélecteur en haut permet de basculer de vue, **« Régénérer avec l'IA »** recompose un tableau de bord avec insights, et tout l'écran s'**exporte en PNG ou PDF**.`]:
    `### The "Result" screen

The **"Result"** button in the editor header opens a dedicated page (\`/workflows/:id/result\`) that **visualises the last run** in whichever shape suits it best: **Dashboard**, **Table**, **Chart**, **Gallery** (images), **Document** or **Data** (JSON). The selector at the top switches views, **"Regenerate with AI"** rebuilds a dashboard with insights, and the whole screen **exports as PNG or PDF**.`,

  [`### Mes modèles (modèles personnalisés)

Au-delà de la galerie prête à l'emploi, tu peux **enregistrer ton propre montage** : le bouton **« Modèle »** dans l'éditeur sauvegarde le graphe courant comme modèle réutilisable (création ou mise à jour). Tous tes modèles apparaissent dans la section **« Mes modèles »** de la page Workflows, où tu peux **les réutiliser** (un clic crée un workflow), **éditer leurs infos** ou **les supprimer**. Stockés par compte (\`users/{uid}/workflowTemplates\`).`]:
    `### My templates (custom templates)

Beyond the ready-made gallery, you can **save your own assembly**: the **"Template"** button in the editor saves the current graph as a reusable template (creating or updating one). All your templates appear in the **"My templates"** section of the Workflows page, where you can **reuse** them (one click creates a workflow), **edit their details** or **delete** them. Stored per account (\`users/{uid}/workflowTemplates\`).`,

  [`### Arrêter un run serveur (STOP)

Un workflow lancé par le **cron** ou un **webhook** tourne sans navigateur. Le panneau d'état du Cron affiche alors un bouton rouge **STOP** : il pose un **drapeau d'abandon** que l'exécuteur serveur **interroge en continu** et le run s'arrête sous quelques secondes — sans avoir à attendre la fin du node en cours.`]:
    `### Stopping a server run (STOP)

A workflow started by the **cron** or by a **webhook** runs with no browser. The Cron status panel then shows a red **STOP** button: it raises an **abort flag** that the server executor **polls continuously**, and the run stops within a few seconds — without waiting for the current node to finish.`,

  [`### Exemples de pipelines

- **Veille** : Recherche web → Export Excel → Envoyer via Gmail.
- **Réponse sourcée** : Question web (IA) → Envoyer via Telegram.
- **Fiches produit** : Scrape URL → Enrichissement → Save PIM → Export PPTX.
- **Batch** : Upload (Excel d'URLs) → Enrichissement → Save DAM.`]:
    `### Example pipelines

- **Monitoring**: Web search → Excel export → Send by Gmail.
- **Sourced answer**: Web question (AI) → Send by Telegram.
- **Product records**: Scrape URL → Enrichment → Save to PIM → PPTX export.
- **Batch**: Upload (an Excel of URLs) → Enrichment → Save to DAM.`,

  [`_Les nodes IA (Scrape, Enrichissement, Décomposer, Génération de workflow, Question web) routent automatiquement vers un modèle adapté et à jour — aucun réglage de modèle à faire._`]:
    `_The AI nodes (Scrape, Enrichment, Break apart, Workflow generation, Web question) route automatically to a suitable, up-to-date model — there is no model setting to make._`,

  [`### Piloter depuis Telegram

Les workflows se déclenchent aussi à distance : \`/flow <demande>\` génère et exécute un workflow, \`/run <nom>\` rejoue un workflow sauvegardé — et le fichier produit revient sur Telegram.`]:
    `### Driving them from Telegram

Workflows can also be triggered remotely: \`/flow <request>\` generates and runs a workflow, \`/run <name>\` replays a saved one — and the file it produces comes back over Telegram.`,

  [`### Modèles prêts à l'emploi

La page Workflows propose une galerie **« Démarrer depuis un modèle »** : Scraper un site → PIM, Veille quotidienne → Telegram (cron), Scrape → approbation ✅ → PIM, Recherche web → Excel, **Veille tarifaire (matrice concurrents)** — tes produits comparés chez plusieurs concurrents (appariement SKU/EAN puis nom), tableau de bord « Veille tarifaire » rempli et alerte Telegram seulement si un concurrent est moins cher ou a bougé. Un clic crée le workflow complet — il ne reste qu'à coller tes URLs et choisir le projet cible.`]:
    `### Ready-made templates

The Workflows page offers a **"Start from a template"** gallery: Scrape a site → PIM, Daily monitoring → Telegram (cron), Scrape → approval ✅ → PIM, Web search → Excel, **Price monitoring (competitor matrix)** — your products compared across several competitors (matched on SKU/EAN, then on name), the "Price monitoring" dashboard filled in and a Telegram alert only when a competitor is cheaper or has moved. One click creates the whole workflow — all that is left is to paste your URLs and choose the target project.`,

  [`### Approbation humaine (Telegram)

Le node **« Approbation Telegram »** met le run en pause et envoie la question sur Telegram avec des boutons **✅ Approuver / ❌ Refuser**. Le workflow reprend sur le port \`approved\` ou \`rejected\` selon le clic — idéal pour valider un PDF ou un import avant publication.

- Délai maximal configurable ; à expiration : échec du run ou refus automatique.
- Le chat doit être dans l'**allowlist du webhook** (Réglages → Telegram), sinon les clics sont ignorés.`]:
    `### Human approval (Telegram)

The **"Telegram approval"** node pauses the run and sends the question over Telegram with **✅ Approve / ❌ Reject** buttons. The workflow resumes on the \`approved\` or \`rejected\` port depending on the click — ideal for signing off a PDF or an import before publication.

- A configurable maximum delay; on expiry: the run fails, or it is rejected automatically.
- The chat must be on the **webhook allowlist** (Settings → Telegram), otherwise the clicks are ignored.`,

  [`### Veille prix

Le node **« Veille prix »** mémorise les prix du run précédent (par identifiant de suivi) et n'émet le port \`changes\` **que si un prix a varié** au-delà du seuil — les lignes émises portent \`ancien_prix\`, \`nouveau_prix\` et \`variation_pct\`, prêtes pour un message Telegram (« 1 message par ligne »). Un second port \`all\` émet **toutes** les lignes à chaque run (pour archiver un relevé complet, par exemple). Le premier relevé est silencieux, et **aucun message n'est envoyé** quand rien n'a bougé. Fonctionne aussi en **cron serveur** (sans navigateur ouvert). Modèle prêt à l'emploi : **Veille prix → alerte Telegram** (cron quotidien).`]:
    `### Price watch

The **"Price watch"** node remembers the previous run's prices (by tracking identifier) and only fires the \`changes\` port **when a price has moved** beyond the threshold — the rows it emits carry \`ancien_prix\`, \`nouveau_prix\` and \`variation_pct\`, ready for a Telegram message ("1 message per row"). A second port, \`all\`, emits **every** row on every run (to archive a complete reading, for instance). The first reading is silent, and **no message is sent** when nothing has moved. It also works under the **server cron** (with no browser open). Ready-made template: **Price watch → Telegram alert** (daily cron).`,

  [`### Planifier (cron serveur)

Le node **« Cron »** exécute le workflow **côté serveur, navigateur fermé** : cadence à la **minute, heure, jour, semaine ou mois**, heure précise **HH:MM**, jour de semaine ciblé ou **« Tous les jours »** — fuseau **Europe/Paris**, granularité minimale 1 minute. Active **« Planification »** dans le node puis **sauvegarde** le workflow pour armer le cron ; l'éditeur affiche l'état et le compte à rebours du prochain run, et chaque exécution apparaît dans l'historique.

- **Compatibles serveur** : Scrape URL, Recherche web, Enrichissement IA, Saisie texte, toutes les **transformations** (Définir colonnes, Filtrer, Trier, Renommer, Opération texte), la **logique** (If/Else, Pipe, Loop each/collect), Save PIM, Veille prix, Envoyer via Telegram — et, après connexion **« Google — accès serveur »** (Paramètres → Connecteurs), **Export Google Sheets** et **Envoyer via Gmail**.
- **Nécessitent le navigateur** : rendus graphiques (PDF, Excel, PPTX, génération d'image, décomposition SVG, Export design), imports de fichiers locaux (Upload, IDML/SVG/PPTX/image), Import/Export Google Drive côté client, Save DAM et Approbation Telegram — un run serveur qui en contient s'arrête avec un message explicite.`]:
    `### Scheduling (server cron)

The **"Cron"** node runs the workflow **server-side, with the browser closed**: a cadence by the **minute, hour, day, week or month**, an exact **HH:MM** time, a targeted weekday or **"Every day"** — the **Europe/Paris** time zone, with a minimum granularity of 1 minute. Switch **"Scheduling"** on in the node, then **save** the workflow to arm the cron; the editor shows the state and the countdown to the next run, and each execution appears in the history.

- **Server-compatible**: Scrape URL, Web search, AI enrichment, Text input, all the **transformations** (Set columns, Filter, Sort, Rename, Text operation), the **logic** (If/Else, Pipe, Loop each/collect), Save to PIM, Price watch, Send by Telegram — and, once **"Google — server access"** is connected (Settings → Connectors), **Google Sheets export** and **Send by Gmail**.
- **Need the browser**: graphic rendering (PDF, Excel, PPTX, image generation, SVG break-apart, design export), local file imports (Upload, IDML/SVG/PPTX/image), client-side Google Drive import/export, Save to DAM and Telegram approval — a server run containing any of these stops with an explicit message.`,

  [`### Webhook entrant (déclenchement externe)

Le bouton **Webhook** dans l'en-tête de l'éditeur génère une **URL secrète** pour déclencher ce workflow depuis l'extérieur (Zapier, Make, un ERP, un simple \`curl\`) :

\`\`\`
curl -X POST -H "X-Webhook-Secret: <secret>" "<URL>?id=<workflowId>"
\`\`\`

L'exécution se fait **côté serveur** (mêmes nodes que le cron) et apparaît dans l'historique des runs. Le secret se régénère à tout moment ; désactiver le webhook coupe immédiatement l'accès.`]:
    `### Inbound webhook (external trigger)

The **Webhook** button in the editor header generates a **secret URL** to trigger this workflow from outside (Zapier, Make, an ERP, a plain \`curl\`):

\`\`\`
curl -X POST -H "X-Webhook-Secret: <secret>" "<URL>?id=<workflowId>"
\`\`\`

Execution happens **server-side** (the same nodes as the cron) and appears in the run history. The secret can be regenerated at any time; switching the webhook off cuts access immediately.`,

  [`### Débugger pas à pas

Le bouton **« Pas à pas »** (à côté de Run) exécute le workflow node par node : le run se met en pause avant chaque étape — le bouton ambre **« Étape : <node> »** dans l'en-tête exécute la suivante. Entre deux étapes, inspecte les sorties dans le panneau de prévisualisation. **Stop** interrompt proprement, même en pause.`]:
    `### Debugging step by step

The **"Step by step"** button (next to Run) executes the workflow node by node: the run pauses before each step — the amber **"Step: <node>"** button in the header runs the next one. Between two steps, inspect the outputs in the preview panel. **Stop** interrupts cleanly, even while paused.`,

  [`Le module **Catalogue studio** assemble automatiquement un catalogue multi-pages à partir de vos données produits : vous choisissez une source (PIM ou Excel), une structure, un style, et l'IA compose les pages. Vous gardez la main sur le **chemin de fer** (l'ordre et le contenu des pages) avant d'exporter en PDF.`]:
    `The **Catalogue studio** module automatically assembles a multi-page catalogue from your product data: you choose a source (PIM or Excel), a structure and a style, and the AI composes the pages. You keep control of the **flatplan** (the order and content of the pages) before exporting to PDF.`,

  [`### Créer un catalogue
1. Ouvrez **Catalogue studio** depuis le menu latéral (groupe *Publication*).
2. Cliquez **Nouveau catalogue** (ou reprenez-en un dans *Mes catalogues*).
3. L'assistant en **6 étapes** s'ouvre. Vous pouvez naviguer librement entre les étapes une fois la source choisie ; le travail est **sauvegardé automatiquement**.`]:
    `### Creating a catalogue
1. Open **Catalogue studio** from the side menu (*Publishing* group).
2. Click **New catalogue** (or pick one up again from *My catalogues*).
3. The **6-step** assistant opens. You can move freely between the steps once the source is chosen; your work is **saved automatically**.`,

  [`### Les 6 étapes de l'assistant

**1 · Source** — Choisissez d'où viennent les produits : un **projet PIM** ou un **dataset Excel** importé. Chaque ligne devient un produit du catalogue.

**2 · Structure** — Organisez le catalogue en sections (rubriques, familles). Reliez une **taxonomie** pour regrouper les produits par catégorie et donner son plan au catalogue.

**3 · Prompt & style** — Décrivez le rendu voulu en langage naturel et posez la **charte graphique** (voir plus bas). L'IA en déduit la mise en page, les couleurs et les typographies.

**4 · Chemin de fer** — Le *flatplan* : chaque page est une vignette. **Glissez-déposez** pour réordonner, déplacer un produit d'une page à l'autre, ajouter ou retirer des pages. C'est ici que vous validez le déroulé.

**5 · Aperçu** — Le rendu page par page, fidèle à l'export.

**6 · Export** — Génération du fichier final (voir *Exporter*).`]:
    `### The 6 steps of the assistant

**1 · Source** — Choose where the products come from: a **PIM project** or an imported **Excel dataset**. Each row becomes a product in the catalogue.

**2 · Structure** — Organise the catalogue into sections (headings, families). Link a **taxonomy** to group the products by category and give the catalogue its plan.

**3 · Prompt & style** — Describe the look you want in plain language and set the **brand identity** (see below). The AI works out the layout, the colours and the typography from it.

**4 · Flatplan** — Each page is a thumbnail. **Drag and drop** to reorder, to move a product from one page to another, to add or remove pages. This is where you sign off the running order.

**5 · Preview** — The rendering page by page, faithful to the export.

**6 · Export** — Generating the final file (see *Exporting*).`,

  [`### Charte graphique & source d'inspiration
À l'étape **Prompt & style**, la carte **Charte & éléments joints** pilote le moteur créatif :
- **Éléments joints** : ajoutez un logo, une charte PDF ou des visuels de référence.
- **Source d'inspiration** : collez une **URL** (Dribbble, Behance, ou une image directe). Le studio l'analyse et en extrait la **palette de couleurs** et les **typographies détectées**, qui pilotent ensuite le plan généré par l'IA — pour un catalogue qui « ressemble à » votre référence.`]:
    `### Brand identity & source of inspiration
At the **Prompt & style** step, the **Identity & attachments** card drives the creative engine:
- **Attachments**: add a logo, a brand-guidelines PDF or reference visuals.
- **Source of inspiration**: paste a **URL** (Dribbble, Behance, or a direct image). The studio analyses it and extracts the **colour palette** and the **typefaces detected**, which then drive the plan the AI generates — for a catalogue that "looks like" your reference.`,

  [`### Densité des fiches : Exhaustif ou Condensé
Dans le panneau **« Style des fiches »** (étape **Prompt & style**), section **« Éléments affichés »**, deux boutons sous **« Détails »** pilotent d'un clic la quantité de données ET la densité de grille :

- **« Exhaustif »** — toute la donnée source (puces intégrales + toutes les spécifications) et toutes les sections passent en **2 produits/page** (grandes cartes). C'est le régime **par défaut** d'un nouveau catalogue.
- **« Condensé »** — **5 puces · 6 specs** par fiche et grille **4 produits/page**.

Les quotas restent ajustables finement via **« Puces max (vide = toutes) »** et **« Spécifications max (vide = toutes) »**, et la densité section par section dans le panneau *Sections*. La ligne **« Data source : N puce(s) · N spec(s) max par fiche »** affiche les comptes **réels** des produits sélectionnés — vous savez toujours ce que contient votre source, sans plafond caché.`]:
    `### Product-page density: Exhaustive or Condensed
In the **"Product page style"** panel (**Prompt & style** step), **"Displayed elements"** section, two buttons under **"Details"** control, in one click, both the amount of data AND the grid density:

- **"Exhaustive"** — all the source data (complete bullets + every specification) and every section switches to **2 products per page** (large cards). This is a new catalogue's **default** setting.
- **"Condensed"** — **5 bullets · 6 specs** per product and a **4 products per page** grid.

The quotas remain finely adjustable through **"Max bullets (empty = all)"** and **"Max specifications (empty = all)"**, and the density section by section in the *Sections* panel. The line **"Data source: N bullet(s) · N spec(s) max per product"** shows the **real** counts of the products selected — you always know what your source holds, with no hidden ceiling.`,

  [`### Tableau « Caractéristiques » et bloc Description
Les **spécifications techniques** détectées dans la source sont rendues en **tableau de paires nom/valeur sur 2 colonnes** : nom en gras à gauche, valeur en couleur d'accent à droite, chaque paire sur un fond teinté, titre en pastille. Les valeurs ne sont **jamais tronquées** (aucune ellipse) : une valeur longue passe à la ligne aux espaces, sans couper un mot.

Le tableau est un **bloc de disposition à part entière** — **« Caractéristiques »** — déplaçable indépendamment de « Détails », en pleine largeur au bas de la fiche par défaut. Il dispose de sa propre ligne **« Caractéristiques »** dans **« Texte : taille & police »** : son échelle se multiplie par-dessus celle de **« Détails »** (1× = suit Détails exactement) et sa police peut différer (**« Police du thème »** = hérite).

Le bloc **Description** affiche le texte **intégral** de la source : il n'est jamais sacrifié au partage de hauteur avec les autres blocs (coupe en tout dernier recours seulement). Sélectionnez-le dans l'aperçu pour activer **« Texte sur 2 colonnes »** : le texte est réparti en deux moitiés équilibrées côte à côte, à l'identique dans l'export.`]:
    `### The "Characteristics" table and the Description block
The **technical specifications** detected in the source are rendered as a **table of name/value pairs across 2 columns**: the name in bold on the left, the value in the accent colour on the right, each pair on a tinted background, the title in a pill. Values are **never truncated** (no ellipsis): a long value wraps at the spaces, without breaking a word.

The table is a **layout block in its own right** — **"Characteristics"** — movable independently of "Details", full width at the bottom of the product page by default. It has its own **"Characteristics"** line in **"Text: size & font"**: its scale multiplies on top of the one for **"Details"** (1× = follows Details exactly) and its font can differ (**"Theme font"** = inherit).

The **Description** block shows the **complete** text from the source: it is never sacrificed when sharing height with the other blocks (it is cut only as an absolute last resort). Select it in the preview to switch **"Text in 2 columns"** on: the text is spread across two balanced halves side by side, identically in the export.`,

  [`### « Taille identique sur toutes les fiches »
En tête de **« Texte : taille & police »**, la case **« Taille identique sur toutes les fiches »** neutralise la hiérarchie automatique (fiches vedette magnifiées, ajustement de taille par page) : tous les produits du catalogue partagent la même taille de texte, de façon **déterministe** — deux rendus successifs donnent le même résultat.

La liste des réglages typo est désormais **groupée par thème** pour rester lisible : **Badges & rubans**, **Identité produit**, **Description & détails**, **Prix**. Chaque groupe conserve l'ordre visuel de la fiche et se met à jour en direct quand vous déplacez les blocs.`]:
    `### "Same size on every product page"
At the top of **"Text: size & font"**, the **"Same size on every product page"** tick box switches off the automatic hierarchy (magnified featured pages, per-page size adjustment): every product in the catalogue shares the same text size, **deterministically** — two successive renderings give the same result.

The list of typography settings is now **grouped by theme** to stay readable: **Badges & ribbons**, **Product identity**, **Description & details**, **Price**. Each group keeps the product page's visual order and updates live as you move the blocks around.`,

  [`### Bandeau taxonomie (Univers › Famille)
Le bandeau de tête des pages produits affiche l'**Univers** et la **Famille** courants. Sa section de réglages, **« Bandeau taxonomie (Univers › Famille) »**, est disponible à la fois dans le panneau **« Fond de page »** de l'Aperçu et dans **« Style des fiches »** de **Prompt & style** — le bandeau y est visible dans l'aperçu, plus besoin de changer d'onglet. Il apparaît aussi sur les pages vedette (1 produit/page).`]:
    `### Taxonomy strip (Universe › Family)
The strip at the head of the product pages shows the current **Universe** and **Family**. Its settings section, **"Taxonomy strip (Universe › Family)"**, is available both in the **"Page background"** panel of the Preview and in **"Product page style"** under **Prompt & style** — the strip is visible in the preview there, so there is no need to switch tabs. It also appears on the featured pages (1 product per page).`,

  [`### Couleurs du thème dès « Prompt & style »
La section **« Couleurs du thème »** du panneau **« Style des fiches »** expose les couleurs **globales** (accent, fond, bandeau…) — les mêmes pastilles que le panneau « Fond de page » de l'Aperçu, **synchronisées** : plus besoin d'aller à l'étape Aperçu pour ajuster le thème.

Un **choix explicite de couleur gagne toujours** sur la variante de forme : si vous fixez la couleur d'une pastille sous-famille ou d'un prix, elle est respectée même quand la forme choisie (chip « plain », souligné, prix en texte nu) proposait sa propre teinte. Par ailleurs, un **garde-fou de lisibilité** contrôle les couleurs de texte proposées par l'IA contre le fond effectif des fiches : une encre illisible est automatiquement corrigée ou écartée.`]:
    `### Theme colours from "Prompt & style" onwards
The **"Theme colours"** section of the **"Product page style"** panel exposes the **global** colours (accent, background, strip…) — the same swatches as the Preview's "Page background" panel, kept **in sync**: no need to go to the Preview step to adjust the theme.

An **explicit colour choice always wins** over the shape variant: if you fix the colour of a sub-family pill or of a price, it is respected even when the chosen shape (a "plain" chip, an underline, a price as bare text) suggested a tint of its own. Alongside that, a **legibility guard** checks the text colours the AI proposes against the pages' effective background: unreadable ink is corrected or discarded automatically.`,

  [`### Ruban vedette
Mettez un produit en avant d'un clic : **double-cliquez sa fiche dans l'Aperçu** pour ouvrir l'édition du produit, puis activez **« Ruban vedette (mise en avant dans ce catalogue) »**. Le produit devient une **grande carte 2×2** ornée du ruban — 1 vedette au maximum par page, jamais la page entière. Le réglage a une **portée publication** : il est enregistré dans CE catalogue, sans toucher la source PIM/Excel.

Le ruban se personnalise dans **« Style des fiches »** : champ **« Texte du ruban »** (défaut *Vedette*), ligne **« Ruban vedette »** dans la typo et les couleurs, et case **« Ruban vedette »** dans **« Éléments affichés »** pour le masquer globalement.`]:
    `### Featured ribbon
Push a product forward in one click: **double-click its page in the Preview** to open the product for editing, then switch **"Featured ribbon (highlighted in this catalogue)"** on. The product becomes a **large 2×2 card** wearing the ribbon — at most one featured item per page, never the whole page. The setting has **publication scope**: it is saved in THIS catalogue, without touching the PIM/Excel source.

The ribbon is customised under **"Product page style"**: a **"Ribbon text"** field (default *Featured*), a **"Featured ribbon"** line in the typography and the colours, and a **"Featured ribbon"** tick box under **"Displayed elements"** to hide it globally.`,

  [`### Champs devinés & lien vers la fiche source
À la connexion de la source, les champs de fiche (nom, image, prix, prix barré, marque, référence, unité, description) ET les champs libres de la zone **« Détails »** (TVA, avantages, spécifications…) sont **devinés automatiquement** depuis les colonnes. La carte **« Correspondance des champs »** (étape **Structure**) permet de corriger : votre choix est conservé et prime sur le re-devinage (bouton **« Auto »** pour y revenir). Dans **« Champs supplémentaires »**, choisir une colonne **pré-remplit « Nom du champ »** s'il est encore vide — vous gardez la main pour le personnaliser.

Si une colonne d'URL produit est présente, chaque fiche porte un **lien de contrôle vers la fiche produit source** : une pastille apparaît **au survol** en haut à droite (**« Ouvrir la fiche source »**) et ouvre la page d'origine dans un nouvel onglet. Visible uniquement au survol, elle n'est **jamais capturée à l'export**.`]:
    `### Guessed fields & link to the source record
When the source is connected, the product-page fields (name, image, price, was-price, brand, reference, unit, description) AND the free fields of the **"Details"** area (VAT, benefits, specifications…) are **guessed automatically** from the columns. The **"Field mapping"** card (**Structure** step) lets you correct them: your choice is kept and takes priority over re-guessing (an **"Auto"** button takes you back). Under **"Additional fields"**, choosing a column **pre-fills "Field name"** if it is still empty — you keep control to customise it.

If a product-URL column is present, each page carries a **control link to the source product record**: a pill appears **on hover** at the top right (**"Open the source record"**) and opens the original page in a new tab. Visible only on hover, it is **never captured in the export**.`,

  [`### Exporter
À l'étape **Export**, deux sorties :
- **PDF écran** — léger, pour l'aperçu et le partage web.
- **PDF print pro** — haute définition, prêt pour l'impression.

Le data-merge par produit et les autres formats de sortie sont détaillés dans la section **Export multi-format**.`]:
    `### Exporting
At the **Export** step, two outputs:
- **Screen PDF** — light, for previewing and sharing on the web.
- **Pro print PDF** — high definition, ready for the press.

The per-product data merge and the other output formats are covered in the **Multi-format export** section.`,

  [`### Bon à savoir
- La source est **relue au chargement** du catalogue : si le PIM évolue, rouvrez le catalogue pour repartir des données à jour.
- Pour des fiches promo unitaires (affiches, étiquettes) plutôt qu'un catalogue complet, voyez **Création studio**.
- La composition des pages et la palette sont générées par IA à partir de la charte : soignez le prompt et les éléments joints pour un meilleur résultat.`]:
    `### Worth knowing
- The source is **read again when the catalogue loads**: if the PIM has moved on, reopen the catalogue to start from the up-to-date data.
- For one-off promo pieces (posters, labels) rather than a full catalogue, see **Creation studio**.
- The page composition and the palette are generated by AI from the brand identity: put care into the prompt and the attachments for a better result.`,

  [`L'éditeur exporte vers sept formats. Chaque format vise un usage précis.`]:
    `The editor exports to seven formats. Each one is aimed at a specific use.`,

  [`_Dialogue Exporter : choix du format puis options imprimeur (marques de coupe, bleed)._`]:
    `_The Export dialogue: choose the format, then the printer's options (crop marks, bleed)._`,

  [`### Formats disponibles

| Format | Usage |
|---|---|
| **PDF** | Catalogue, BAT, fichier imprimeur — supporte print marks et bleed |
| **IDML** | Retour à InDesign pour finition graphique (ZIP avec dossier \`Links/\` si la maquette contient des images) |
| **PPTX** | Présentation commerciale, démo client |
| **SVG** | Web, intégration site, réseaux sociaux statiques |
| **PNG** | Vignettes, miniatures, social media — résolution **72** (Web), **150** (Standard) ou **300 dpi** (Impression) |
| **HTML** | Dossier web complet (ZIP : \`index.html\`, \`style.css\`, \`assets/\`) — textes sélectionnables, formes en CSS |
| **Pack social** | ZIP de déclinaisons prêtes à poster : post carré 1080×1080, story 1080×1920, paysage 1920×1080, bannière 1500×500 (design centré, fond = couleur de page) |

Tous les exports sont fidèles à la maquette en cours dans l'éditeur. Le data-merge actif influence le contenu mais pas le format.`]:
    `### Available formats

| Format | Use |
|---|---|
| **PDF** | Catalogue, proof, printer's file — supports print marks and bleed |
| **IDML** | Back to InDesign for graphic finishing (a ZIP with a \`Links/\` folder if the layout holds images) |
| **PPTX** | Sales presentation, client demo |
| **SVG** | Web, embedding in a site, static social media |
| **PNG** | Thumbnails, previews, social media — resolution **72** (Web), **150** (Standard) or **300 dpi** (Print) |
| **HTML** | A complete web folder (ZIP: \`index.html\`, \`style.css\`, \`assets/\`) — selectable text, shapes in CSS |
| **Social pack** | A ZIP of ready-to-post sizes: square post 1080×1080, story 1080×1920, landscape 1920×1080, banner 1500×500 (design centred, background = page colour) |

Every export is faithful to the layout currently in the editor. An active data merge affects the content but not the format.`,

  [`### Export PDF avec options imprimeur

1. Règle d'abord le **fond perdu** et les repères dans le panneau **Impression** de l'éditeur (c'est lui qui fait foi — la modale d'export n'a pas de champ bleed)
2. Bouton **Exporter** → choisis **PDF**
3. Coche **« Export print (traits de coupe + bleed) »** : le canvas est étendu au fond perdu défini dans Impression et des traits de coupe en L sont ajoutés aux 4 coins
4. Lance l'export

Les traits de coupe sont en taille **physique** (par défaut 3,5 mm de longueur, 1 mm d'offset — réglables de 2 à 10 mm dans le panneau Impression), identiques quelle que soit la taille du document. Le panneau Impression propose aussi les **hirondelles de repérage** et la **zone de sécurité** ; lance un **Preflight** avant l'export final (voir la section _L'éditeur_).`]:
    `### PDF export with printer's options

1. First set the **bleed** and the marks in the editor's **Print** panel (that panel is the authority — the export dialogue has no bleed field)
2. **Export** button → choose **PDF**
3. Tick **"Print export (crop marks + bleed)"**: the canvas is extended to the bleed defined under Print and L-shaped crop marks are added at the 4 corners
4. Start the export

The crop marks are at a **physical** size (by default 3.5 mm long, 1 mm offset — adjustable from 2 to 10 mm in the Print panel), identical whatever the document's size. The Print panel also offers **registration marks** and the **safe area**; run a **Preflight** before the final export (see _The editor_ section).`,

  [`### Export batch (plusieurs fichiers)

Quand le data-merge est actif, l'export génère **une variante par ligne** de la BDD :

1. Ouvre le panneau Data Merge → vérifie le mapping placeholders ↔ colonnes
2. Choisis la **plage de lignes** à exporter et le mode : **PDF multi-pages** (un seul PDF, une page par ligne) ou **ZIP de fichiers individuels** (PDF/PNG/PPTX)
3. Le **nom des fichiers** se personnalise avec les colonnes : pattern \`export_{{colonne}}\` (par défaut \`export_{{_id}}\`, ex. \`export_{{reference}}\`)
4. Le streaming progressif affiche l'avancement, abandon possible à tout moment

Concrètement : 200 lignes × PDF = 200 PDFs en quelques minutes. Les performances dépendent du modèle de la machine et du nombre d'images embarquées.`]:
    `### Batch export (several files)

When the data merge is active, the export generates **one variation per row** of the database:

1. Open the Data merge panel → check the placeholder ↔ column mapping
2. Choose the **range of rows** to export and the mode: **multi-page PDF** (a single PDF, one page per row) or a **ZIP of individual files** (PDF/PNG/PPTX)
3. The **file names** are customisable from the columns: pattern \`export_{{column}}\` (by default \`export_{{_id}}\`, e.g. \`export_{{reference}}\`)
4. Progressive streaming shows how far it has got, and you can abandon at any time

In practice: 200 rows × PDF = 200 PDFs in a few minutes. Performance depends on the machine and on how many images are embedded.`,

  [`### Export IDML (retour InDesign)

Quand tu veux que ta graphiste finisse à la main dans InDesign :

1. Configure ta maquette + data-merge dans IBS-Studio
2. Export **IDML** → IBS-Studio reconstruit un fichier IDML standard avec les valeurs déjà mergées. Si la maquette contient des images, tu obtiens un **ZIP** : \`xxx_modified.idml\` + dossier \`Links/\` (à garder côte à côte pour qu'InDesign résolve les liens)
3. Ouvre dans InDesign → ajustements graphiques fins
4. Exporte le PDF final depuis InDesign

En mode batch (data-merge actif), l'export **IDML multi-pages** produit un seul \`.idml\` avec **une planche par ligne de données** — et si la maquette vient d'un gabarit **EasyCatalog**, les marqueurs de champs sont conservés (round-trip complet, voir la section _EasyCatalog_).

Ce flow combine **automatisation** (IBS-Studio fait le merge en série) et **contrôle créatif** (InDesign fait la finition).`]:
    `### IDML export (back to InDesign)

When you want a designer to finish the job by hand in InDesign:

1. Set your layout + data merge up in IBS-Studio
2. Export **IDML** → IBS-Studio rebuilds a standard IDML file with the values already merged. If the layout holds images, you get a **ZIP**: \`xxx_modified.idml\` + a \`Links/\` folder (keep them side by side so InDesign resolves the links)
3. Open it in InDesign → fine graphic adjustments
4. Export the final PDF from InDesign

In batch mode (with the data merge active), the **multi-page IDML** export produces a single \`.idml\` with **one spread per data row** — and if the layout comes from an **EasyCatalog** template, the field markers are preserved (a complete round trip, see the _EasyCatalog_ section).

This flow combines **automation** (IBS-Studio does the merge in bulk) and **creative control** (InDesign does the finishing).`,

  [`### Pages déclinées vs Pack social — quelle différence ?

Les deux partent des mêmes quatre ratios (post carré 1080×1080, story/reel 1080×1920, paysage 1920×1080, bannière 1500×500), mais ne produisent **pas** la même chose :

| | **Pack social** | **Pages déclinées** |
|---|---|---|
| Sortie | ZIP de **PNG** prêts à poster | **Pages éditables** ajoutées au document (rien n'est téléchargé) |
| Méthode | Le design est rendu **figé** puis posé en « contain » centré, fond = couleur de page | Re-layout **piloté par IA** (directeur artistique) : chaque élément est replacé selon le ratio cible |
| Quand l'utiliser | Tu veux juste les visuels, sans retouche | Tu veux **retoucher** chaque format avant export |

« Pages déclinées » envoie à l'IA un aperçu de la page **plus** la liste de ses éléments (boîtes en %), et reçoit un placement par format : le fond pleine page **couvre** (cover), le reste (titre, prix, photo, logo) est **placé en respectant son ratio** (contain). Si l'IA est indisponible (ou le rendu CORS échoue), un **repli géométrique** garanti s'applique (mise à l'échelle « contain » + centrage) — un toast t'avertit du mode utilisé.`]:
    `### Derived pages vs Social pack — what is the difference?

Both start from the same four ratios (square post 1080×1080, story/reel 1080×1920, landscape 1920×1080, banner 1500×500), but they do **not** produce the same thing:

| | **Social pack** | **Derived pages** |
|---|---|---|
| Output | A ZIP of ready-to-post **PNGs** | **Editable pages** added to the document (nothing is downloaded) |
| Method | The design is rendered **flat**, then placed "contained" and centred, background = page colour | **AI-driven** re-layout (an art director): every element is repositioned for the target ratio |
| When to use it | You just want the visuals, with no retouching | You want to **retouch** each format before exporting |

"Derived pages" sends the AI a preview of the page **plus** the list of its elements (boxes as percentages), and gets back a placement per format: the full-page background **covers**, everything else (title, price, photo, logo) is **placed respecting its ratio** (contain). If the AI is unavailable (or the CORS rendering fails), a guaranteed **geometric fallback** applies ("contain" scaling + centring) — a toast tells you which mode was used.`,

  [`### Ce que contient vraiment chaque fichier

- **PDF** : une image **haute résolution** du canvas (rendu ×2, qualité maximale) **plus** une couche de **texte invisible sélectionnable/cherchable** posée sur chaque bloc de texte. Le PDF reste donc « plat » visuellement mais le texte est copiable.
- **PPTX** : une **slide unique** aux dimensions exactes du canvas (converties px→pouces), image en fond + textes éditables dans PowerPoint. Pas de multi-masters — pour des cas complexes, préfère PDF.
- **HTML** : le visuel vient d'un **PNG** ; par-dessus, chaque texte devient un \`<div>\` positionné, **transparent mais sélectionnable** (\`user-select:text\`, \`aria-label\`) — bon pour l'accessibilité et le SEO.
- **SVG** : vectoriel **réimportable** dans Illustrator, Figma ou l'éditeur. Les images liées sont **embarquées en data-URL** (sinon Illustrator affiche « fichier lié introuvable »), et les \`clipPath\` / dégradés sont **normalisés** pour les lecteurs SVG stricts.`]:
    `### What each file really holds

- **PDF**: a **high-resolution** image of the canvas (rendered at ×2, maximum quality) **plus** a layer of **invisible, selectable and searchable text** laid over each text block. The PDF therefore stays visually "flat", but the text can be copied.
- **PPTX**: a **single slide** at the canvas's exact dimensions (converted px→inches), with an image as the background + text editable in PowerPoint. No multiple masters — for complex cases, prefer PDF.
- **HTML**: the visual comes from a **PNG**; on top of it, each text becomes a positioned \`<div>\`, **transparent but selectable** (\`user-select:text\`, \`aria-label\`) — good for accessibility and SEO.
- **SVG**: vector artwork you can **re-import** into Illustrator, Figma or the editor. Linked images are **embedded as data URLs** (otherwise Illustrator reports "linked file not found"), and the \`clipPath\` blocks and gradients are **normalised** for strict SVG readers.`,

  [`### SVG : compatibilité Illustrator / Figma

L'export SVG ne se contente pas du \`toSVG()\` brut de Fabric, il le **réécrit** pour les éditeurs vectoriels exigeants :

- les **images** (DAM, Unsplash, IDML lié) sont converties en \`data:\` URL le temps de l'export — Illustrator n'essaie plus de résoudre un lien disque ;
- les blocs \`<clipPath>\` sont regroupés dans un \`<defs>\` unique (sinon couleurs/dégradés « disparaissent ») ;
- les \`<stop>\` de dégradé sont **triés par offset** et l'alpha \`rgba()\` est séparé en \`stop-opacity\` (sinon rect noir dans Illustrator).

Limite : une image chargée **sans CORS** ne peut pas être embarquée (canvas « tainté ») — son URL d'origine est laissée telle quelle. Charge tes images depuis une source CORS-friendly avant l'export SVG final.`]:
    `### SVG: Illustrator / Figma compatibility

The SVG export does not settle for Fabric's raw \`toSVG()\`, it **rewrites** it for demanding vector editors:

- the **images** (DAM, Unsplash, linked IDML) are converted into \`data:\` URLs for the duration of the export — Illustrator no longer tries to resolve a link on disk;
- the \`<clipPath>\` blocks are gathered into a single \`<defs>\` (otherwise colours and gradients "vanish");
- the gradient \`<stop>\` elements are **sorted by offset** and the \`rgba()\` alpha is split out into \`stop-opacity\` (otherwise you get a black rectangle in Illustrator).

The limit: an image loaded **without CORS** cannot be embedded (a "tainted" canvas) — its original URL is left as it stands. Load your images from a CORS-friendly source before the final SVG export.`,

  [`### Bonnes pratiques

- **Toujours faire un export test** sur 1 ligne avant de lancer un batch de 200 — tu détectes les problèmes de fonts ou d'images manquantes plus vite
- **Vérifier les fonts** : si un fallback Arial s'est appliqué, ton imprimeur le verra. Charge tes fonts dans \`public/fonts/\` au préalable
- **PDF imprimeur** : demande à ton imprimeur la valeur de bleed exacte (souvent 3 ou 5 mm) avant l'export final
- **PPTX** : évite-le pour les cas complexes (multi-masters), préfère PDF + conversion PPTX externe si besoin`]:
    `### Good practice

- **Always run a test export** on one row before launching a batch of 200 — you spot font problems or missing images far sooner
- **Check the fonts**: if an Arial fallback has kicked in, your printer will see it. Load your fonts into \`public/fonts/\` beforehand
- **Printer's PDF**: ask your printer for the exact bleed value (often 3 or 5 mm) before the final export
- **PPTX**: avoid it for complex cases (multiple masters) — prefer PDF plus an external PPTX conversion if you need one`,

  [`Connecte un bot Telegram à IBS-Studio pour **discuter avec l'IA**, **générer des workflows** en langage naturel et **recevoir les fichiers produits** — directement dans la messagerie.`]:
    `Connect a Telegram bot to IBS-Studio to **talk to the AI**, **generate workflows** in plain language and **receive the files produced** — straight in the messenger.`,

  [`### Mise en route

1. **Paramètres → Connecteurs** : colle le *bot token* (obtenu via BotFather) et ton *chat ID*.
2. Ouvre l'onglet **Telegram** dans le menu latéral : c'est lui qui fait tourner le « worker » qui traite les messages.
3. C'est tout : le **répondeur serveur** traite tes messages même app fermée (voir « Réponses sans navigateur » plus bas). L'onglet Telegram sert à suivre la conversation — et prend le relais pour les workflows à rendu graphique (PDF, visuels) ou à fichier manuel.
4. Une **clé LLM** (Gemini, Claude ou DeepSeek) doit être configurée dans les Paramètres.`]:
    `### Getting started

1. **Settings → Connectors**: paste the *bot token* (obtained from BotFather) and your *chat ID*.
2. Open the **Telegram** tab in the side menu: it is what runs the "worker" that processes the messages.
3. That is all: the **server-side responder** handles your messages even with the app closed (see "Answers without a browser" below). The Telegram tab is there to follow the conversation — and it takes over for workflows with graphic output (PDF, artwork) or a manual file.
4. An **LLM key** (Gemini, Claude or DeepSeek) must be configured in Settings.`,

  [`### Commandes disponibles`]:
    `### Available commands`,

  [`### Bon à savoir

- **Conversation bidirectionnelle** : messages entrants ET sortants sont journalisés dans l'onglet Telegram.
- **Fichiers** : un workflow qui produit un export (Excel, PDF, PPTX…) renvoie le fichier en pièce jointe ; sinon un résumé.
- **Workflows nécessitant un fichier manuel** (node Upload/Import) ne sont pas exécutables en auto : reformule avec une URL à scraper ou des données dans le message.
- **Suppression** : supprimer un message dans l'app le retire aussi de Telegram (< 48 h). L'inverse (effacer depuis le téléphone) n'est pas détectable par un bot — utilise \`/clear\`.
- **Nettoyage auto** : la boîte se purge localement après 7 jours.`]:
    `### Worth knowing

- **Two-way conversation**: incoming AND outgoing messages are logged in the Telegram tab.
- **Files**: a workflow that produces an export (Excel, PDF, PPTX…) sends the file back as an attachment; otherwise a summary.
- **Workflows that need a manual file** (an Upload/Import node) cannot run automatically: rephrase with a URL to scrape, or with the data in the message.
- **Deletion**: deleting a message in the app also removes it from Telegram (within 48 h). The reverse (deleting from the phone) is not something a bot can detect — use \`/clear\`.
- **Automatic clean-up**: the inbox purges itself locally after 7 days.`,

  [`### Réponses sans navigateur (répondeur serveur)

Plus besoin d'avoir l'app ouverte : un **répondeur serveur** traite vos messages dès leur arrivée —

- **Questions** : réponse LLM immédiate, **avec recherche web automatique** (Jina) quand la question l'exige (prix, actualité, contenu d'une URL) — sources citées.
- **/flow <demande>** : le workflow est **généré par IA et exécuté côté serveur** (scrape, enrichissement, veille prix, PIM, notification), puis sauvegardé dans l'app.
- **/run <nom>** : exécution serveur d'un workflow sauvegardé, résumé en retour.
- **Outils Google sans navigateur** : après avoir connecté **Google (accès serveur)** dans Réglages → Connecteurs (une seule fois), \`/flow\` peut **créer des Google Sheets dans votre Drive** et **envoyer des Gmail** depuis le serveur. Ne collez JAMAIS d'identifiants dans le chat — l'autorisation se donne uniquement dans l'app.
- Seuls les workflows avec **rendu graphique** (PDF, visuels) ou **fichier manuel** attendent l'ouverture de l'app (un message vous prévient ; le worker navigateur prend le relais).

Si l'app est ouverte en même temps, un seul des deux répond (jamais de doublon).`]:
    `### Answers without a browser (server-side responder)

You no longer need the app open: a **server-side responder** handles your messages as soon as they arrive —

- **Questions**: an immediate LLM answer, **with an automatic web search** (Jina) when the question calls for one (prices, news, the content of a URL) — sources cited.
- **/flow <request>**: the workflow is **generated by AI and executed server-side** (scrape, enrichment, price watch, PIM, notification), then saved in the app.
- **/run <name>**: server-side execution of a saved workflow, with a summary in return.
- **Google tools without a browser**: once **Google (server access)** is connected under Settings → Connectors (a one-off), \`/flow\` can **create Google Sheets in your Drive** and **send Gmail** from the server. NEVER paste credentials into the chat — authorisation is given in the app and nowhere else.
- Only workflows with **graphic output** (PDF, artwork) or a **manual file** wait for the app to be opened (a message tells you so; the browser worker then takes over).

If the app happens to be open at the same time, only one of the two answers (never a duplicate).`,

  [`### Approbation humaine dans un workflow

Le node **« Approbation Telegram »** (catégorie *Communication* dans l'éditeur de workflow) met le run **en pause** et demande une validation à un humain, directement dans la messagerie :

- Le bot envoie ta **question** avec deux boutons inline **✅ Approuver / ❌ Refuser**. Le workflow reprend ensuite sur le port **« approved »** ou **« rejected »** selon le clic.
- Si le port **attachment** est connecté (ex : un PDF généré), le **fichier est joint** au message et la question sert de **légende**.
- **Délai max** réglable (minutes) ; à l'expiration, au choix : **échouer** (stoppe le run) ou **refuser** (part par le port « rejected »).
- Le **premier clic gagne** (transaction serveur) ; les clics tardifs sont ignorés et les boutons retirés après décision.

⚠️ Le chat ciblé doit figurer dans l'**allowlist du webhook** (Réglages → Telegram), sinon les clics sont ignorés. Bot token et Chat ID se laissent vides pour réutiliser ceux des Connecteurs.`]:
    `### Human approval inside a workflow

The **"Telegram approval"** node (*Communication* category in the workflow editor) **pauses** the run and asks a human for sign-off, right in the messenger:

- The bot sends your **question** with two inline buttons, **✅ Approve / ❌ Reject**. The workflow then resumes on the **"approved"** or **"rejected"** port depending on the click.
- If the **attachment** port is connected (a generated PDF, say), the **file is attached** to the message and the question serves as the **caption**.
- An adjustable **maximum delay** (in minutes); on expiry, your choice of: **fail** (stopping the run) or **reject** (leaving by the "rejected" port).
- The **first click wins** (a server transaction); late clicks are ignored and the buttons are removed once the decision is made.

⚠️ The target chat must appear on the **webhook allowlist** (Settings → Telegram), otherwise the clicks are ignored. Leave the bot token and chat ID empty to reuse the ones from Connectors.`,

  [`### Sécurité : secret + allowlist

Le webhook entrant n'accepte un message que si **deux conditions** sont réunies :

- Le **secret token** envoyé par Telegram correspond au \`webhookSecret\` enregistré côté serveur (toute requête sans le bon en-tête \`X-Telegram-Bot-Api-Secret-Token\` est rejetée en *401*).
- Le **chat ID** émetteur figure dans l'**allowlist** (\`allowedChatIds\`). Les messages — et les clics d'approbation — venant d'un chat non listé sont **silencieusement ignorés**.

Deux réglages distincts cohabitent donc : la **config webhook** (secret + allowlist, partagée) et ta **config personnelle** (bot token + chat ID, par utilisateur, dans Connecteurs). C'est cette dernière que lisent le répondeur serveur et le digest.`]:
    `### Security: secret + allowlist

The inbound webhook only accepts a message when **two conditions** are met:

- The **secret token** sent by Telegram matches the \`webhookSecret\` recorded server-side (any request without the right \`X-Telegram-Bot-Api-Secret-Token\` header is rejected with a *401*).
- The sending **chat ID** appears on the **allowlist** (\`allowedChatIds\`). Messages — and approval clicks — from a chat that is not listed are **silently ignored**.

Two distinct settings therefore live side by side: the **webhook configuration** (secret + allowlist, shared) and your **personal configuration** (bot token + chat ID, per user, under Connectors). It is the latter that the server-side responder and the digest read.`,

  [`### Pourquoi jamais de double réponse

À l'arrivée d'un message, le répondeur serveur tente un **claim transactionnel** : il fait passer la fiche de \`pending\` à \`processing\` (et s'attribue \`workerId: 'server'\`) en une seule transaction. Si l'app était déjà en train de la traiter, le claim échoue et le serveur s'efface — **un seul des deux répond**. À l'inverse, quand le message nécessite l'app (rendu graphique ou fichier manuel), le serveur **rend la main** : il repasse la fiche en \`pending\` avec un drapeau \`serverDeferred\`, et le worker du navigateur la reprend à la prochaine ouverture.`]:
    `### Why you never get a double answer

When a message arrives, the server-side responder attempts a **transactional claim**: it moves the record from \`pending\` to \`processing\` (and assigns itself \`workerId: 'server'\`) in a single transaction. If the app was already handling it, the claim fails and the server steps aside — **only one of the two answers**. Conversely, when the message needs the app (graphic output or a manual file), the server **hands back**: it returns the record to \`pending\` with a \`serverDeferred\` flag, and the browser worker picks it up next time you open the app.`,

  [`### Digest quotidien

Dans **Réglages → Connecteurs → Telegram**, activez le **digest quotidien** : chaque matin à **08:00** (heure de Paris), le bot envoie un résumé des dernières 24 h — workflows réussis/en échec (avec les noms) et messages en attente de traitement. **Rien n'est envoyé s'il ne s'est rien passé.**`]:
    `### Daily digest

Under **Settings → Connectors → Telegram**, switch the **daily digest** on: every morning at **08:00** (Paris time), the bot sends a summary of the last 24 hours — workflows that succeeded or failed (with their names) and messages waiting to be processed. **Nothing is sent if nothing happened.**`,

  [`### Voir aussi

\`/flow\` et \`/run\` s'appuient sur le module **Workflows** : la génération par IA et l'exécution sont les mêmes que dans l'éditeur de workflow.`]:
    `### See also

\`/flow\` and \`/run\` rely on the **Workflows** module: the AI generation and the execution are the same as in the workflow editor.`,

  [`IBS-Studio embarque sa **propre mesure d'audience** : un petit script (beacon) enregistre chaque page vue du **site public** (accueil, promo, docs) et de l'**application**, l'envoie à une Cloud Function, et tout est stocké dans **votre** Firestore. Pas de Google Analytics, pas de cookie tiers, pas de données qui sortent de chez vous.

Le tableau de bord vit dans l'onglet **Analytics** du module **Utilisateurs & rôles** (réservé aux administrateurs et au propriétaire). Une version mobile installable, la PWA **« Pulse »**, affiche les mêmes données sur votre téléphone.`]:
    `IBS-Studio carries **its own audience measurement**: a small script (a beacon) records every page view of the **public site** (home page, promo, docs) and of the **application**, sends it to a Cloud Function, and everything is stored in **your** Firestore. No Google Analytics, no third-party cookie, no data leaving your premises.

The dashboard lives in the **Analytics** tab of the **Users & roles** module (reserved for administrators and the owner). An installable mobile version, the **"Pulse"** PWA, shows the same data on your phone.`,

  [`### Périodes, filtres et indicateurs — le bandeau épinglé

En haut du tableau de bord, un bandeau regroupe la période, les filtres et les indicateurs clés. Il reste **épinglé en haut pendant le défilement** : vous gardez le contexte sous les yeux en parcourant le graphe, le journal ou la carte.

- **Période** : **Aujourd'hui** (depuis minuit, heure locale), **7 j**, **30 j**, **90 j** (par défaut), **12 mois**, ou **Perso** (dates « Du / Au » libres).
- **Filtres** : **Zone** (Site web / Application), **Appareil** (Ordinateur, Mobile, Tablette), **Pays**, **Page**, **Source** et **Utilisateur** (comptes connectés, résolus en nom/e-mail).
- **Indicateurs** : **Pages vues**, **Visiteurs uniques**, **Sessions** et **Durée moy. session**, chacun avec sa **variation en %** par rapport à la période précédente de même durée (vert = hausse, rouge = baisse). Pour « Aujourd'hui », la comparaison est équitable : hier, sur la même tranche horaire déjà écoulée.

Tous les panneaux du tableau de bord (graphe, journal, carte, pays…) réagissent instantanément à la période et aux filtres choisis.`]:
    `### Periods, filters and indicators — the pinned bar

At the top of the dashboard, a bar gathers the period, the filters and the key indicators. It stays **pinned at the top while you scroll**: the context remains in view as you go through the chart, the log or the map.

- **Period**: **Today** (since midnight, local time), **7 d**, **30 d**, **90 d** (the default), **12 months**, or **Custom** (free "From / To" dates).
- **Filters**: **Area** (Website / Application), **Device** (Desktop, Mobile, Tablet), **Country**, **Page**, **Source** and **User** (signed-in accounts, resolved to a name/e-mail).
- **Indicators**: **Page views**, **Unique visitors**, **Sessions** and **Avg. session length**, each with its **percentage change** against the preceding period of the same length (green = up, red = down). For "Today", the comparison is fair: yesterday, over the same slice of hours already elapsed.

Every panel of the dashboard (chart, log, map, countries…) reacts instantly to the period and filters you choose.`,

  [`### Le graphe de trafic

La courbe du haut trace l'activité sur la période :

- **Pages vues** (aplat indigo) et **Visiteurs** (cyan), point par point.
- **Connexions (cumul)** (pointillés orange, axe de droite) : la courbe grimpe jusqu'au **total de connexions de la période**, affiché directement dans la légende.

Le regroupement se fait par **jour local** (pas UTC) : un événement compte le même jour dans le graphe et dans le journal. Sur la période **Aujourd'hui**, la granularité passe automatiquement **à l'heure** — vous voyez l'activité heure par heure depuis minuit.`]:
    `### The traffic chart

The curve at the top plots the activity over the period:

- **Page views** (indigo area) and **Visitors** (cyan), point by point.
- **Sign-ins (cumulative)** (orange dashes, right-hand axis): the curve climbs to the **period's total number of sign-ins**, shown directly in the legend.

Grouping is done by **local day** (not UTC): an event counts on the same day in the chart and in the log. Over the **Today** period, the granularity automatically drops **to the hour** — you see the activity hour by hour since midnight.`,

  [`### Le journal de consultation

Le panneau **« Journal de consultation »** répond à la question *qui · quand · quelle page*, avec les colonnes **Utilisateur · Page · Appareil · Lieu · Date & heure** (l'appareil précise le système et le navigateur ; le lieu affiche « Ville, Pays » en clair).

- **Groupé par utilisateur** (mode par défaut) : un bloc repliable par personne (cliquez l'en-tête pour le replier), avec le nombre de consultations, la date de la dernière, et une **pagination propre à chaque groupe** (8 lignes par page).
- Les **visiteurs anonymes** forment un bloc « Anonyme » **sous-groupé par pays**, triés par nombre de consultations — avec un lien « +N autres » pour déplier chaque pays.
- Le bouton **« Liste »** bascule en chronologie simple paginée ; **« Grouper »** revient au mode groupé.
- Chaque colonne a son **filtre déroulant** (utilisateur, page, appareil, pays, jour), cumulable avec les filtres du bandeau.`]:
    `### The browsing log

The **"Browsing log"** panel answers the *who · when · which page* question, with the columns **User · Page · Device · Location · Date & time** (the device gives the operating system and the browser; the location shows "City, Country" in plain words).

- **Grouped by user** (the default mode): one collapsible block per person (click the header to fold it), with the number of views, the date of the latest one, and **pagination of its own for each group** (8 rows per page).
- **Anonymous visitors** form an "Anonymous" block **sub-grouped by country**, sorted by number of views — with a "+N more" link to unfold each country.
- The **"List"** button switches to a simple paginated chronology; **"Group"** returns to the grouped mode.
- Each column has its own **drop-down filter** (user, page, device, country, day), which stacks with the filters in the bar.`,

  [`### Pays, villes et carte du monde

- La **carte du monde** situe les connexions ville par ville.
- Le panneau **« Pays »** liste les villes **groupées par pays**, pays **triés par visites décroissantes**, avec pour chacun le total, une barre de proportion, la **date de dernière visite** et le détail des villes (repliable au chevron).
- Cliquez un pays dans le panneau : il est **mis en évidence sur la carte** (et inversement) ; recliquez pour désélectionner.

La géolocalisation se fait par adresse IP via la base **DB-IP** (licence CC BY 4.0, attribution affichée sous le tableau de bord) — là encore sans appel à un service tiers au moment de la visite.`]:
    `### Countries, cities and the world map

- The **world map** places the connections city by city.
- The **"Countries"** panel lists the cities **grouped by country**, countries **sorted by descending visits**, each with its total, a proportion bar, the **date of the last visit** and the detail of the cities (collapsible from the chevron).
- Click a country in the panel: it is **highlighted on the map** (and the other way round); click again to deselect.

Geolocation is done by IP address using the **DB-IP** database (CC BY 4.0 licence, attribution shown under the dashboard) — again with no call to a third-party service at the moment of the visit.`,

  [`### « Trafic en direct » et alertes Telegram

Le panneau **« Trafic en direct »** affiche le flux **temps réel** des visites, au même format que Telegram : 🟢 une ligne par page vue d'un **utilisateur connecté** (nom résolu), 🔵 l'arrivée d'un **visiteur anonyme** — avec la zone, la page, le drapeau et le lieu, la date et l'heure. Vos propres visites n'y figurent jamais.

Le bouton **« Alertes Telegram »** (cloche, en haut à droite) active ou coupe le **log live sur Telegram** : le propriétaire reçoit une notification à chaque nouvelle session anonyme et une ligne par page consultée par un utilisateur connecté. L'interrupteur agit **côté serveur avec effet immédiat** (sans redéploiement), et vos propres visites ne sont jamais notifiées — vous ne vous suivez pas vous-même.`]:
    `### "Live traffic" and Telegram alerts

The **"Live traffic"** panel shows the **real-time** stream of visits, in the same format as Telegram: 🟢 one line per page viewed by a **signed-in user** (with the name resolved), 🔵 the arrival of an **anonymous visitor** — with the area, the page, the flag and the location, the date and the time. Your own visits never appear there.

The **"Telegram alerts"** button (the bell, top right) switches the **live log on Telegram** on or off: the owner gets a notification for every new anonymous session and one line per page viewed by a signed-in user. The switch takes effect **server-side immediately** (with no redeployment), and your own visits are never notified — you do not follow yourself.`,

  [`### Export CSV, « Supprimer le résultat » et « Vider »

- **CSV** : télécharge les consultations de la période et des filtres affichés, pour analyse dans un tableur.
- **« Supprimer le résultat »** : supprime **définitivement** les consultations correspondant à la période **et aux filtres affichés** (zone, appareil, pays, page, source, utilisateur) — le reste de l'historique n'est pas touché. Une confirmation indique le nombre exact de lignes concernées. Idéal pour nettoyer des visites de test.
- **« Vider »** : supprime **tout** l'historique de consultation, toutes périodes confondues (avec confirmation). Irréversible.`]:
    `### CSV export, "Delete the result" and "Clear"

- **CSV**: downloads the views for the period and filters on display, for analysis in a spreadsheet.
- **"Delete the result"**: **permanently** deletes the views matching the period **and the filters on display** (area, device, country, page, source, user) — the rest of the history is untouched. A confirmation tells you the exact number of rows concerned. Ideal for cleaning up test visits.
- **"Clear"**: deletes the **whole** browsing history, across every period (with a confirmation). Irreversible.`,

  [`### « Pulse » — la PWA mobile

**Pulse** est la version mobile du tableau de bord, à l'adresse **/pulse** : connexion Google puis contrôle du rôle administrateur, et vous retrouvez **les mêmes données** — indicateurs, tendance, filtres et périodes, journal groupé par utilisateur, pays en clair et trafic en direct — dans une interface **responsive** pensée pour le téléphone (le mode paysage et la tablette réorganisent les sections).

Installez-la sur l'écran d'accueil comme une application : elle se **met à jour automatiquement** au réveil dès qu'une nouvelle version du site est déployée, sans réinstallation.`]:
    `### "Pulse" — the mobile PWA

**Pulse** is the mobile version of the dashboard, at **/pulse**: sign in with Google, the administrator role is checked, and you find **the same data** — indicators, trend, filters and periods, log grouped by user, countries in plain words and live traffic — in a **responsive** interface designed for the phone (landscape mode and tablets reorganise the sections).

Install it on your home screen like an application: it **updates itself automatically** on waking as soon as a new version of the site is deployed, with no reinstallation.`,

  [`### Bon à savoir

- Le tableau de bord est **réservé aux administrateurs et au propriétaire** (onglet Analytics du module Utilisateurs & rôles, et PWA Pulse).
- Le **propriétaire est exclu du tracking** : ses visites ne polluent ni les statistiques, ni le trafic en direct, ni les alertes Telegram.
- Les données sont **hébergées chez vous** (votre Firestore) et collectées par votre propre Cloud Function : **rien n'est transmis à un service d'analytics tiers**.
- La géolocalisation par IP s'appuie sur la base **DB-IP** (CC BY 4.0), consultée côté serveur.`]:
    `### Worth knowing

- The dashboard is **reserved for administrators and the owner** (the Analytics tab of the Users & roles module, and the Pulse PWA).
- The **owner is excluded from tracking**: their visits pollute neither the statistics, nor the live traffic, nor the Telegram alerts.
- The data is **hosted on your side** (your Firestore) and collected by your own Cloud Function: **nothing is passed to a third-party analytics service**.
- IP geolocation relies on the **DB-IP** database (CC BY 4.0), consulted server-side.`,

  [`Les **Paramètres** regroupent toute la configuration de ton compte, en **six onglets** : Profil, IA, Connecteurs, Cookies, Statistiques et Firebase. On les ouvre via l'**engrenage** en bas de la barre latérale, près de ton nom (pas dans le menu principal).`]:
    `**Settings** gathers your account's whole configuration into **six tabs**: Profile, AI, Connectors, Cookies, Statistics and Firebase. You open them from the **cog** at the bottom of the sidebar, next to your name (not from the main menu).`,

  [`### Onglet Profil — identité et apparence

- Ton **profil** (nom, e-mail du compte Google).
- La section **Apparence** bascule le thème : **Clair**, **Sombre** (défaut) ou **Système**. Le choix est mémorisé sur ton compte et te suit d'un poste à l'autre. Le thème se bascule aussi depuis la palette **⌘K**.`]:
    `### Profile tab — identity and appearance

- Your **profile** (name, Google account e-mail).
- The **Appearance** section switches the theme: **Light**, **Dark** (the default) or **System**. The choice is remembered on your account and follows you from machine to machine. The theme can also be switched from the **⌘K** palette.`,

  [`### Onglet IA — clés et modèles

- Renseigne les **clés API** de chaque fournisseur (Gemini, Claude, OpenAI, DeepSeek, Qwen, Kimi, GLM, OpenRouter) et **teste-les** d'un clic.
- Choisis le **modèle** de chaque fournisseur.
- Définis la **cascade de raisonnement** : l'ordre dans lequel les fournisseurs sont essayés (le premier qui répond gagne, les suivants servent de secours).
- Le bouton **« Mettre à jour tous les LLM »** réaligne toute la sélection sur les dernières versions du catalogue.

> 🔒 **Tes clés API sont isolées par compte** : elles sont synchronisées sur ton profil (Firestore) et purgées localement à la déconnexion — pas de fuite entre comptes sur une même machine.`]:
    `### AI tab — keys and models

- Enter the **API keys** for each provider (Gemini, Claude, OpenAI, DeepSeek, Qwen, Kimi, GLM, OpenRouter) and **test them** in one click.
- Choose each provider's **model**.
- Set the **reasoning cascade**: the order in which the providers are tried (the first to answer wins, the rest act as fallbacks).
- The **"Update all LLMs"** button realigns the whole selection with the catalogue's latest versions.

> 🔒 **Your API keys are isolated per account**: they are synchronised onto your profile (Firestore) and purged locally when you sign out — no leaking between accounts on the same machine.`,

  [`### Budgets IA et proxy serveur

Les appels LLM passent par un **proxy serveur** : la requête part **sans ta clé API**, le serveur ajoute la clé (lue sur ton profil) et **applique ton budget mensuel**.

- **Budget mensuel bloquant** : une fois le plafond du fournisseur atteint, l'appel est **refusé** côté serveur — il n'y a *pas* de repli en direct. C'est la garde-fou contre les dérives de coût.
- Un **seuil d'alerte mensuel** se règle par fournisseur dans le **panneau « Conso LLM en direct »** (colonne de droite sur la page Paramètres). Ce seuil est local et sert d'alerte (pastilles de couleur selon le pourcentage atteint) — il ne recharge jamais ton compte fournisseur.
- Le même panneau suit aussi un **budget Bright Data** (scraping).
- Les requêtes multimodales trop lourdes (> ~9 Mo) basculent automatiquement en appel direct depuis le navigateur.`]:
    `### AI budgets and the server proxy

LLM calls go through a **server proxy**: the request leaves **without your API key**, the server adds the key (read from your profile) and **applies your monthly budget**.

- **A blocking monthly budget**: once the provider's ceiling is reached, the call is **refused** server-side — there is *no* direct fallback. This is the guard against runaway costs.
- A **monthly alert threshold** can be set per provider in the **"Live LLM usage"** panel (the right-hand column of the Settings page). That threshold is local and acts as a warning (coloured dots according to the percentage reached) — it never tops your provider account up.
- The same panel also tracks a **Bright Data budget** (scraping).
- Multimodal requests that are too heavy (over about 9 MB) automatically switch to a direct call from the browser.`,

  [`### Onglet Connecteurs`]:
    `### Connectors tab`,

  [`### Onglet Cookies

Gère les **cookies de session** pour scraper des sites **B2B derrière login**. Colle les cookies copiés depuis ton navigateur ; ils sont injectés dans les requêtes de scraping. Leur validité est limitée dans le temps (à re-coller régulièrement).`]:
    `### Cookies tab

Manages the **session cookies** used to scrape **B2B sites behind a login**. Paste the cookies copied from your browser; they are injected into the scraping requests. Their validity is time-limited (you will need to paste them again regularly).`,

  [`### Onglet Données — schéma Firestore (réservé au propriétaire)

Un **diagramme entité-relation (ERD)** de la base : chaque **collection** Firestore est une table affichant tous ses **champs**, ses clés **PK/FK** et ses **relations** (avec cardinalités). Le diagramme est interactif — zoom, recadrage, et **glisser les tables** : leur position est **mémorisée sur ton compte**.

**Double-clic** sur une table interrogeable ouvre un panneau de **données live** (lecture en temps réel via \`onSnapshot\`). Pratique pour inspecter l'état réel de la base sans ouvrir la console Firebase.`]:
    `### Data tab — Firestore schema (owner only)

An **entity-relationship diagram (ERD)** of the database: each Firestore **collection** is a table showing all its **fields**, its **PK/FK** keys and its **relationships** (with cardinalities). The diagram is interactive — zoom, reframe, and **drag the tables**: their positions are **remembered on your account**.

**Double-clicking** a queryable table opens a **live data** panel (read in real time through \`onSnapshot\`). Handy for inspecting the database's real state without opening the Firebase console.`,

  [`### Onglets Statistiques & Firebase

- **Statistiques** : nombre de projets, exports du mois, **stockage Firestore** (barre de progression), **coût IA estimé en EUR par fournisseur** avec les tokens entrants/sortants consommés, et le suivi des requêtes **Bright Data** (quota scraping). Bouton **Rafraîchir** pour recalculer. En bas, le **journal des runs de pipelines** (enrichissement PIM, décomposition Image/PDF → SVG) liste chaque exécution avec son statut, sa durée et le détail des étapes ou de l'erreur — l'« étage logs prod » sans ouvrir la console Firestore.
- **Firebase** : configuration du backend partagé (clés du projet Firebase) — **réservé au propriétaire**.`]:
    `### Statistics & Firebase tabs

- **Statistics**: number of projects, exports this month, **Firestore storage** (a progress bar), **estimated AI cost in EUR per provider** with the input/output tokens consumed, and the tracking of **Bright Data** requests (the scraping quota). A **Refresh** button recalculates. At the bottom, the **pipeline run log** (PIM enrichment, Image/PDF → SVG break-apart) lists each execution with its status, its duration and the detail of the steps or of the error — the "production logs tier", without opening the Firestore console.
- **Firebase**: configuration of the shared back end (the Firebase project keys) — **owner only**.`,

  [`### Qui voit quoi

L'onglet **Firebase** est réservé au **propriétaire**. Les onglets **Connecteurs** et **Cookies** dépendent des permissions accordées dans *Utilisateurs & rôles*. **Profil**, **IA** et **Statistiques** restent accessibles à tous.`]:
    `### Who sees what

The **Firebase** tab is reserved for the **owner**. The **Connectors** and **Cookies** tabs depend on the permissions granted in *Users & roles*. **Profile**, **AI** and **Statistics** remain available to everyone.`,

  [`Cet écran permet au **propriétaire** de contrôler **qui accède à quoi**. Les droits sont organisés par **rôles** (jeux de permissions réutilisables) et peuvent être ajustés **utilisateur par utilisateur**.

> ⚠️ Le module **« Utilisateurs & rôles »** n'est visible que par le **propriétaire** (compte admin).`]:
    `This screen lets the **owner** control **who has access to what**. Rights are organised into **roles** (reusable sets of permissions) and can be adjusted **user by user**.

> ⚠️ The **"Users & roles"** module is visible only to the **owner** (the admin account).`,

  [`### Onboarding d'un nouvel utilisateur

1. La personne se connecte via Google : son compte est d'abord **« en attente »** (aucun accès).
2. Dans l'onglet **Utilisateurs**, tu lui **attribues un rôle**.
3. À sa prochaine ouverture, l'app n'affiche que les modules autorisés par son rôle.`]:
    `### Onboarding a new user

1. The person signs in with Google: their account starts out **"pending"** (no access at all).
2. In the **Users** tab, you **assign them a role**.
3. Next time they open the app, only the modules their role allows are shown.`,

  [`### Onglet « Utilisateurs »`]:
    `### "Users" tab`,

  [`### Onglet « Rôles »

Crée et édite les rôles de l'équipe via une **matrice de permissions** par module. Trois vues : **Cartes** (par module), **Arbre** (hiérarchie) et **Carte mentale** (graphe).

Les permissions sont **hiérarchiques** : la visibilité d'un module (*« voir »*) commande ses actions. Décocher *« voir »* désactive toutes les actions du module ; cocher une action réactive automatiquement *« voir »*.`]:
    `### "Roles" tab

Create and edit the team's roles through a **permission matrix** per module. Three views: **Cards** (by module), **Tree** (hierarchy) and **Mind map** (graph).

Permissions are **hierarchical**: a module's visibility (*"view"*) governs its actions. Unticking *"view"* disables every action of the module; ticking an action automatically re-enables *"view"*.`,

  [`### Onglets « Journal » et « Analytics »

Deux onglets d'observation complètent la gestion des droits :
- **Journal** — l'historique de qui a fait quoi (détails : section **Journal d'audit & Mon activité**).
- **Analytics** — la fréquentation du site et de l'app : visites, pays, journal de consultation, trafic en direct (détails : section **Fréquentation & trafic**).`]:
    `### "Log" and "Analytics" tabs

Two observation tabs round out the management of rights:
- **Log** — the history of who did what (details: the **Audit log & My activity** section).
- **Analytics** — the traffic on the site and the app: visits, countries, browsing log, live traffic (details: the **Visits & traffic** section).`,

  [`### Les rôles sont entièrement personnalisés

Aucun rôle n'est livré par défaut : tu **crées toi-même** les rôles dont l'équipe a besoin (un nom + une sélection de permissions), tu les **renommes** et les **supprimes** librement.

> ⚠️ Si tu **supprimes un rôle** encore attribué à quelqu'un, cette personne **repasse automatiquement « en attente »** (plus aucun accès) jusqu'à ce que tu lui en donnes un nouveau. Pense à réaffecter avant de supprimer.`]:
    `### Roles are entirely your own

No role ships by default: you **create** the roles your team needs yourself (a name + a selection of permissions), and you **rename** and **delete** them freely.

> ⚠️ If you **delete a role** that is still assigned to someone, that person **automatically returns to "pending"** (no access at all) until you give them a new one. Remember to reassign before deleting.`,

  [`### Modules couverts par les permissions

Bibliothèque, Import (par format), DAM, PIM, Taxonomies, Scraping (templates & hub), Workflows, Animation, Chat IA, Telegram et Paramètres — chacun avec ses actions (créer, éditer, supprimer, exporter, exécuter…).

Exemple de droit d'action fin : **« Envoyer des messages Telegram »** (\`telegram.send\`) gouverne l'envoi — sans lui, un utilisateur peut voir Telegram mais **ni envoyer un message, ni exécuter le node « Envoyer via Telegram »** d'un workflow.`]:
    `### Modules covered by the permissions

Library, Import (by format), DAM, PIM, Taxonomies, Scraping (templates & hub), Workflows, Animation, AI Chat, Telegram and Settings — each with its actions (create, edit, delete, export, run…).

An example of a fine-grained action right: **"Send Telegram messages"** (\`telegram.send\`) governs sending — without it, a user can see Telegram but **can neither send a message nor run a workflow's "Send by Telegram" node**.`,

  [`### Règles de sécurité

- Les permissions effectives = **rôle** + permissions **accordées** − permissions **retirées**.
- Le **propriétaire** a un accès total **non modifiable**.
- Un utilisateur **ne peut pas modifier ses propres droits** (protection côté serveur Firestore) : aucune escalade de privilèges possible.`]:
    `### Security rules

- Effective permissions = **role** + permissions **granted** − permissions **withdrawn**.
- The **owner** has total access, and it **cannot be changed**.
- A user **cannot change their own rights** (protected server-side by Firestore): no privilege escalation is possible.`,

  [`**EasyCatalog** (65bit Software) est le plug-in InDesign de référence pour les catalogues et listes de prix pilotés par les données. IBS-Studio sert de **front web** à ce workflow : on importe un gabarit produit sous EasyCatalog, on l'édite et on le fusionne avec ses données, puis on réexporte un IDML qu'EasyCatalog **reconnaît nativement**.

Bonne nouvelle : EasyCatalog inscrit ses champs directement dans l'IDML (marqueurs invisibles). IBS-Studio les relit donc **automatiquement** — pas de re-balisage manuel à l'import.`]:
    `**EasyCatalog** (65bit Software) is the reference InDesign plug-in for data-driven catalogues and price lists. IBS-Studio acts as a **web front end** to that workflow: you import a product template built under EasyCatalog, edit it and merge it with your data, then re-export an IDML that EasyCatalog **recognises natively**.

The good news: EasyCatalog writes its fields directly into the IDML (invisible markers). IBS-Studio therefore reads them back **automatically** — no manual re-tagging on import.`,

  [`### Sous le capot : comment les champs survivent à l'IDML

EasyCatalog ne stocke pas ses champs sous forme de texte : il pose des **marqueurs invisibles** sur le balisage InDesign que IBS-Studio sait relire.

- **Champ texte** : deux marqueurs encadrent la valeur sur le run de caractères — \`$ID/4 <nom>\` **ouvre** le champ, \`$ID/5 <nom>\` le **ferme** (attribut \`ECTagData\`). Le contenu du marqueur lui-même n'est qu'un caractère invisible (U+FEFF). IBS-Studio détecte cette paire et remplace tout ce qui est entre les deux par un seul \`{{nom}}\`, même si la valeur s'étalait sur plusieurs runs.
- **Champ image** : le cadre est un rectangle portant \`ECPageItemData="2 2 <nom>"\`. IBS-Studio le convertit en cadre image transparent **lié au champ** — le publipostage y chargera le visuel de la ligne.
- Les **noms de champs** sont URL-encodés dans l'IDML ; ils sont décodés à la lecture, ce qui explique pourquoi des libellés avec accents ou espaces (ex. \`{{Prix Malin}}\`) ressortent proprement.`]:
    `### Under the bonnet: how the fields survive the IDML

EasyCatalog does not store its fields as text: it places **invisible markers** on the InDesign markup, which IBS-Studio knows how to read back.

- **Text field**: two markers bracket the value on the character run — \`$ID/4 <name>\` **opens** the field, \`$ID/5 <name>\` **closes** it (the \`ECTagData\` attribute). The marker's own content is nothing but an invisible character (U+FEFF). IBS-Studio spots that pair and replaces everything between the two with a single \`{{name}}\`, even when the value spanned several runs.
- **Image field**: the frame is a rectangle carrying \`ECPageItemData="2 2 <name>"\`. IBS-Studio converts it into a transparent image frame **bound to the field** — the mail merge will load the row's visual into it.
- The **field names** are URL-encoded in the IDML; they are decoded on reading, which is why labels with accents or spaces (e.g. \`{{Prix Malin}}\`) come back cleanly.`,

  [`### 1. Importer un gabarit EasyCatalog

1. Depuis InDesign (avec ton document EasyCatalog ouvert) : **Fichier → Exporter… → InDesign Markup (IDML)**
2. Dans IBS-Studio : Tableau de bord → **Importer** → sélectionne le \`.idml\`
3. Le gabarit s'ouvre dans l'éditeur. Les **champs EasyCatalog deviennent des placeholders éditables** :
   - **Champs texte** → \`{{Nom du champ}}\` (ex. \`{{Price}}\`, \`{{Description}}\`, \`{{Prix Malin}}\`)
   - **Champs image** → cadres image liés, prêts à recevoir un visuel par ligne`]:
    `### 1. Import an EasyCatalog template

1. From InDesign (with your EasyCatalog document open): **File → Export… → InDesign Markup (IDML)**
2. In IBS-Studio: Dashboard → **Import** → select the \`.idml\`
3. The template opens in the editor. The **EasyCatalog fields become editable placeholders**:
   - **Text fields** → \`{{Field name}}\` (e.g. \`{{Price}}\`, \`{{Description}}\`, \`{{Prix Malin}}\`)
   - **Image fields** → linked image frames, ready to take one visual per row`,

  [`### 2. Brancher tes données et fusionner

Dans l'éditeur, panneau **Publipostage** : connecte une source (Excel, Google Sheets, PIM…). IBS-Studio remplace les \`{{champs}}\` par les valeurs de la ligne courante, et charge les images dans les cadres liés.

> Pour que la correspondance se fasse, les **noms de colonnes** de ta source doivent matcher les noms de champs du gabarit (ex. colonne « Price » ↔ \`{{Price}}\`). La casse et les accents sont tolérés.

Tu peux alors **exporter par lot** : un PDF / PNG / PPTX par ligne, directement depuis le panneau Publipostage — sans repasser par InDesign.`]:
    `### 2. Plug your data in and merge

In the editor, **Mail merge** panel: connect a source (Excel, Google Sheets, PIM…). IBS-Studio replaces the \`{{fields}}\` with the current row's values, and loads the images into the linked frames.

> For the matching to work, your source's **column names** must match the template's field names (e.g. a "Price" column ↔ \`{{Price}}\`). Case and accents are tolerated.

You can then **export in bulk**: one PDF / PNG / PPTX per row, straight from the Mail merge panel — without going back through InDesign.`,

  [`### 3. Exporter une source de données POUR EasyCatalog

Depuis l'**espace Données**, bouton **EasyCatalog** : génère un zip prêt à brancher comme *flat-file data source* dans EasyCatalog.

Le zip contient :
- \`data.csv\` (tab ou virgule) ou \`data.xlsx\` — en-têtes = noms de champs stables
- un **champ-clé** garanti (pour la re-synchronisation EasyCatalog)
- \`fields.json\` — type de chaque champ (alphanumérique / numérique / image)
- \`images.csv\` — table URL → nom de fichier (si colonnes image)
- \`README.txt\` — mode d'emploi`]:
    `### 3. Export a data source FOR EasyCatalog

From the **Data** area, the **EasyCatalog** button generates a zip ready to plug in as a *flat-file data source* in EasyCatalog.

The zip holds:
- \`data.csv\` (tab- or comma-separated) or \`data.xlsx\` — headers = stable field names
- a guaranteed **key field** (for EasyCatalog's re-synchronisation)
- \`fields.json\` — the type of each field (alphanumeric / numeric / image)
- \`images.csv\` — a URL → file name table (if there are image columns)
- \`README.txt\` — instructions`,

  [`### 4. Réexporter un IDML (aller-retour complet)

Depuis l'éditeur, **Exporter → IDML (multi-pages)** : IBS-Studio produit un IDML qui **conserve les marqueurs EasyCatalog** et résout les valeurs par ligne.

À la réouverture dans InDesign + EasyCatalog, le document **retrouve ses champs** : tu peux re-synchroniser, re-paginer ou finaliser côté print. Pas de lock-in.

> **Comment l'aller-retour reste « propre » (preserve-and-patch)** : à l'export, IBS-Studio ne touche **jamais** aux marqueurs \`$ID/4\`/\`$ID/5\` — ils sont laissés tels quels. Seule la **valeur** entre les marqueurs est remplacée par \`{{champ}}\` puis résolue ligne par ligne. C'est pour ça qu'EasyCatalog reconnaît encore ses champs nativement après le passage par le web. Côté EasyCatalog, relie le document à ta data source via **Adopt Fields**.`]:
    `### 4. Re-export an IDML (the complete round trip)

From the editor, **Export → IDML (multi-page)**: IBS-Studio produces an IDML that **keeps the EasyCatalog markers** and resolves the values row by row.

When you reopen it in InDesign + EasyCatalog, the document **finds its fields again**: you can re-synchronise, re-paginate or finish on the print side. No lock-in.

> **How the round trip stays "clean" (preserve-and-patch)**: on export, IBS-Studio **never** touches the \`$ID/4\`/\`$ID/5\` markers — they are left as they stand. Only the **value** between the markers is replaced by \`{{field}}\` and then resolved row by row. That is why EasyCatalog still recognises its fields natively after the trip through the web. On the EasyCatalog side, link the document to your data source through **Adopt Fields**.`,

  [`Carte **« Image → SVG éditable »** (sous-titre *Raster verrouillé + overlays*). Transforme un **raster** (\`.png\`, \`.jpg\`, \`.webp\`, \`.gif\`) en projet éditable.`]:
    `The **"Image → editable SVG"** card (subtitle *Locked raster + overlays*). Turns a **raster** file (\`.png\`, \`.jpg\`, \`.webp\`, \`.gif\`) into an editable project.`,

  [`### Comment ça marche

1. L'image est **verrouillée en fond** (fidélité visuelle préservée). Le calque source devient non sélectionnable : les clics passent aux textes posés par-dessus.
2. Tu cliques **« Décomposer »** dans la barre de l'éditeur : **Google Vision** (mode *DOCUMENT_TEXT*) lit tous les textes de l'image.
3. Chaque texte est recréé en **calque éditable** (police, graisse, couleur estimées d'après l'image) par-dessus le fond.
4. Tu modifies les textes, prix, titres… sans toucher au visuel d'origine. Le bouton **« Annuler décomposition »** retire tous les calques et restaure l'image.

La taille du canvas épouse les **pixels natifs** de la source. Idéal pour reprendre une **affiche / un visuel existant** dont tu n'as pas le fichier source.`]:
    `### How it works

1. The image is **locked as the background** (visual fidelity is preserved). The source layer becomes unselectable: clicks pass through to the text laid on top.
2. You click **"Break apart"** in the editor's bar: **Google Vision** (*DOCUMENT_TEXT* mode) reads all the text in the image.
3. Each piece of text is recreated as an **editable layer** (font, weight and colour estimated from the image) over the background.
4. You change the text, prices, titles… without touching the original artwork. The **"Undo break-apart"** button removes every layer and restores the image.

The canvas size follows the source's **native pixels**. Ideal for picking up an **existing poster or visual** whose source file you do not have.`,

  [`### Ce qui devient éditable

La décomposition ne se limite pas à du texte brut : elle reconstruit la **mise en forme** de chaque bloc.

- **Textes éditoriaux** (titres, sous-titres, descriptions, mentions) → un calque texte par bloc, avec **couleur** échantillonnée et **graisse** déduite (Regular / Bold / Black selon la densité de pixels).
- **Prix composés** type \`9€59\` → reconstruits en pile : gros entier + **« € » et décimales** réduits, alignés comme sur la créa, et liés (ils se déplacent ensemble).
- **Exposants** \`%\` et **ordinaux** (\`2ÈME\`, \`1er\`…) → recréés en caractères réduits et surélevés dans le même calque.
- **Multi-lignes** : Vision fusionne parfois plusieurs lignes ; elles sont re-séparées avec l'**alignement** (gauche / centré / droite) reconstitué.
- **Champs de fusion** \`{{Champ}}\` repérés dans l'image → normalisés et regroupés en bloc pour le publipostage.`]:
    `### What becomes editable

Breaking apart does not stop at plain text: it rebuilds each block's **formatting**.

- **Editorial text** (titles, subtitles, descriptions, small print) → one text layer per block, with the **colour** sampled and the **weight** inferred (Regular / Bold / Black, according to pixel density).
- **Composite prices** such as \`9€59\` → rebuilt as a stack: the large whole number + a reduced **"€" and decimals**, aligned as on the artwork, and bound together (they move as one).
- **Superscript** \`%\` and **ordinals** (\`2ÈME\`, \`1er\`…) → recreated as reduced, raised characters within the same layer.
- **Multiple lines**: Vision sometimes merges several lines; they are split again with the **alignment** (left / centred / right) restored.
- **Merge fields** \`{{Field}}\` spotted in the image → normalised and grouped into a block ready for the mail merge.`,

  [`### Clé Google Vision requise

La détection des textes appelle l'API **Google Cloud Vision** : il faut renseigner ta clé **une seule fois** dans **Paramètres → Connecteurs** (champ *Google Vision*), synchronisée ensuite via ton compte.

- Sans clé, le bouton « Décomposer » renvoie une erreur explicite.
- Coût indicatif : **~0,0015 $ par image analysée** (la relecture fine des prix par IA ajoute ~0,001 $ par prix).
- L'API *Cloud Vision* doit être activée sur ton projet Google Cloud.`]:
    `### A Google Vision key is required

Text detection calls the **Google Cloud Vision** API: you need to enter your key **once** under **Settings → Connectors** (the *Google Vision* field), after which it is synchronised through your account.

- Without a key, the "Break apart" button returns an explicit error.
- Indicative cost: **about $0.0015 per image analysed** (the AI's close reading of the prices adds roughly $0.001 per price).
- The *Cloud Vision* API must be enabled on your Google Cloud project.`,

  [`### Filtres intelligents

Pour ne garder que le contenu **éditorial** et éviter le bruit, plusieurs filtres s'appliquent automatiquement.

- **Zone produit centrale ignorée** : les textes au centre de l'image (typiquement imprimés sur un packaging photographié) sont écartés ; le contenu promo est sur les bords et en bas.
- **Texte sur fond coloré (packaging)** : les libellés lus sur un fond vert saturé d'emballage sont filtrés.
- **Texte vertical** (mentions sur tranche, code-barres) ignoré.
- **Logos / pictos / certifications** : un classement sémantique par IA distingue le texte éditorial du texte de logo, qui n'est pas recréé.
- **Filets de séparation** détectés dans l'image et conservés en fines barres (Vision ne les voit pas, ils disparaîtraient sinon).`]:
    `### Smart filters

To keep only the **editorial** content and avoid the noise, several filters apply automatically.

- **The central product area is ignored**: text in the middle of the image (typically printed on a photographed pack) is set aside; the promotional content sits along the edges and at the bottom.
- **Text on a coloured background (packaging)**: labels read against a saturated green packaging background are filtered out.
- **Vertical text** (notices along an edge, barcodes) is ignored.
- **Logos / pictograms / certifications**: a semantic classification by AI distinguishes editorial text from logo text, which is not recreated.
- **Separator rules** detected in the image are kept as thin bars (Vision does not see them, so they would otherwise disappear).`,

  [`### Quand l'utiliser & limites

**À utiliser quand** tu as un visuel raster fini (affiche, flyer, publicité retail) sans le fichier source et que tu veux **réécrire les textes ou décliner** sans tout refaire.

Limites connues :
- La détection cible le **texte** : photos, logos et illustrations restent dans le fond verrouillé (non décomposés en calques).
- Le découpage des **prix complexes** et la séparation des lignes reposent sur des heuristiques + une relecture IA — vérifie le rendu après décomposition.
- Les **polices** ne sont pas reconnues à l'identique : le rendu utilise Arial / Arial Black selon la graisse estimée.
- Le fichier doit être un **raster** (\`.png\`, \`.jpg\`, \`.webp\`, \`.gif\`) ; un SVG passe par l'import SVG direct.`]:
    `### When to use it & limits

**Use it when** you have a finished raster visual (a poster, a flyer, a retail advert) without the source file, and you want to **rewrite the text or derive variations** without starting over.

Known limits:
- Detection targets **text**: photos, logos and illustrations stay in the locked background (they are not broken out into layers).
- Splitting **complex prices** and separating lines rely on heuristics plus an AI review — check the result after breaking apart.
- **Fonts** are not recognised exactly: the rendering uses Arial / Arial Black according to the weight estimated.
- The file must be a **raster** (\`.png\`, \`.jpg\`, \`.webp\`, \`.gif\`); an SVG goes through the direct SVG import.`,

  [`À la **première connexion**, un assistant s'ouvre automatiquement pour configurer l'essentiel. Il ne réapparaît qu'**une seule fois** : dès qu'au moins une clé IA est renseignée (ou que tu marques la configuration comme terminée), il ne se relance plus tout seul. Tu peux toujours le rouvrir manuellement (voir plus bas).

> 💡 Tu peux fermer l'assistant à tout moment (bouton **Plus tard** en haut à droite) et tout reconfigurer ensuite dans les **Réglages**.`]:
    `On your **first sign-in**, an assistant opens automatically to set the essentials up. It appears **only once**: as soon as at least one AI key is filled in (or you mark the configuration as finished), it stops starting by itself. You can always reopen it by hand (see below).

> 💡 You can close the assistant at any time (the **Later** button, top right) and configure everything afterwards under **Settings**.`,

  [`### Les étapes`]:
    `### The steps`,

  [`### Reprendre la configuration plus tard

L'assistant reste accessible à tout moment, par deux entrées :

- **Bandeau « Assistant de configuration »** en haut des **Réglages** — sous-titre _« Reprendre la mise en place guidée (clés, modèles, connecteurs) »_.
- **Entrée « Configurer l'application »** (icône ✨) en bas du **menu des modules** (le bouton ☰ flottant en bas à gauche).

Les deux rouvrent l'assistant à la première étape.`]:
    `### Picking the configuration up later

The assistant stays available at any time, through two entry points:

- The **"Setup assistant"** banner at the top of **Settings** — subtitle _"Resume the guided setup (keys, models, connectors)"_.
- The **"Set up the application"** entry (✨ icon) at the bottom of the **modules menu** (the floating ☰ button at the bottom left).

Both reopen the assistant at the first step.`,

  [`### Bouton « Mettre à jour tous les LLM »

Présent dans l'assistant **et** dans l'onglet **IA** des Réglages, il sélectionne le **dernier modèle phare** de chaque fournisseur (Claude, Gemini, OpenAI, DeepSeek, Qwen, Kimi, GLM, OpenRouter). Pratique pour rester à jour sans choisir chaque modèle à la main après une évolution du catalogue.`]:
    `### The "Update all LLMs" button

Present in the assistant **and** in the **AI** tab of Settings, it selects each provider's **latest flagship model** (Claude, Gemini, OpenAI, DeepSeek, Qwen, Kimi, GLM, OpenRouter). Handy for staying current without picking each model by hand after the catalogue moves on.`,

  [`> ℹ️ L'assistant n'est soumis à **aucune restriction de rôle** : tout utilisateur peut configurer ses propres clés et préférences IA. Seul l'onglet **Firebase** des Réglages reste réservé au propriétaire.`]:
    `> ℹ️ The assistant is subject to **no role restriction**: any user can configure their own keys and AI preferences. Only the **Firebase** tab of Settings stays reserved for the owner.`,

  [`Tu n'as pas EasyCatalog ? InDesign sait **baliser nativement** un document avec des **balises XML** (panneau *Balises*). IBS-Studio relit ces balises à l'import de l'IDML et les convertit **automatiquement** en champs de publipostage \`{{nom}}\` — la même logique qu'**EasyCatalog** (voir la section dédiée), mais **sans plug-in payant**.

Le principe : tu poses une balise dont **le nom = le nom exact d'une colonne** de ta base. Au publipostage, IBS-Studio remplit chaque balise avec la valeur de la ligne courante.

> Avantage technique : une balise XML native encadre **tout le bloc**, même si InDesign découpe le texte en plusieurs morceaux (run-splitting). La détection est donc plus robuste qu'un simple repérage de \`{{texte}}\` tapé à la main.`]:
    `No EasyCatalog? InDesign can **tag a document natively** with **XML tags** (the *Tags* panel). IBS-Studio reads those tags back when importing the IDML and converts them **automatically** into \`{{name}}\` mail-merge fields — the same logic as **EasyCatalog** (see the dedicated section), but **without a paid plug-in**.

The principle: you place a tag whose **name = the exact name of a column** in your database. At merge time, IBS-Studio fills each tag with the current row's value.

> A technical advantage: a native XML tag brackets **the whole block**, even when InDesign splits the text into several pieces (run splitting). Detection is therefore more robust than simply spotting a \`{{text}}\` typed by hand.`,

  [`### 1. Baliser le document dans InDesign

1. Ouvre le panneau des balises : **Fenêtre → Utilitaires → Balises** (*Window → Utilities → Tags*).
2. Crée une balise par champ, avec le **nom exact de ta colonne** (ex. \`Libelle_Article\`, \`Prix_normal\`, \`Marques\`).
3. **Champ texte** : sélectionne **le texte** du bloc (pas seulement le cadre), puis clique la balise → des **crochets \`[ ]\`** apparaissent autour du texte. C'est ce qui garantit que la valeur sera remplacée à la fusion.
4. **Champ image** : sélectionne le **cadre image** puis applique la balise → le cadre devient une zone liée qui recevra le visuel de la ligne.
5. Répète pour chaque champ à connecter.

> Astuce : active **Affichage → Structure** et *Afficher les balises* pour visualiser ce qui est balisé. Si tu ne vois pas les crochets, c'est que tu as balisé le **cadre** et non le **texte** — re-balise en sélectionnant le texte.`]:
    `### 1. Tag the document in InDesign

1. Open the tags panel: **Window → Utilities → Tags**.
2. Create one tag per field, using the **exact name of your column** (e.g. \`Libelle_Article\`, \`Prix_normal\`, \`Marques\`).
3. **Text field**: select **the text** of the block (not just the frame), then click the tag → **square brackets \`[ ]\`** appear around the text. That is what guarantees the value will be replaced at merge time.
4. **Image field**: select the **image frame**, then apply the tag → the frame becomes a linked area that will receive the row's visual.
5. Repeat for every field you want to connect.

> Tip: turn **View → Structure** and *Show tags* on to see what has been tagged. If you cannot see the brackets, you have tagged the **frame** and not the **text** — tag again, selecting the text.`,

  [`### 2. (Option) Le plug-in IBS-Studio : baliser connecté à ta base

Pour baliser **en étant connecté à ta base en direct**, IBS-Studio fournit un **plug-in InDesign (UXP)**. Une fois chargé, il :

- se **connecte à un dataSet** via un *token* personnel ;
- affiche la **liste des champs** de la base (avec leur type) ;
- pose une balise sur le bloc sélectionné en **un clic** (et empêche de poser deux fois le même champ) ;
- permet de **prévisualiser** les valeurs d'une ligne dans un tableau.

Le **token** se génère dans **Réglages → « Token du plugin InDesign »** : copie-le et colle-le dans le plug-in pour ouvrir la connexion.

> Le plug-in est un **assistant optionnel** (en cours de mise au point). Le balisage XML natif de l'étape 1 fonctionne déjà sans lui : c'est la voie la plus fiable aujourd'hui.`]:
    `### 2. (Optional) The IBS-Studio plug-in: tagging while connected to your database

To tag **while connected live to your database**, IBS-Studio provides an **InDesign plug-in (UXP)**. Once loaded, it:

- **connects to a dataSet** through a personal *token*;
- shows the database's **list of fields** (with their type);
- places a tag on the selected block in **one click** (and stops you placing the same field twice);
- lets you **preview** a row's values in a table.

The **token** is generated under **Settings → "InDesign plug-in token"**: copy it and paste it into the plug-in to open the connection.

> The plug-in is an **optional helper** (still being finalised). The native XML tagging of step 1 already works without it: it is the most dependable route today.`,

  [`### 3. Exporter l'IDML

Dans InDesign : **Fichier → Exporter… → InDesign Markup (IDML)**. Les balises XML sont conservées dans le fichier.`]:
    `### 3. Export the IDML

In InDesign: **File → Export… → InDesign Markup (IDML)**. The XML tags are kept in the file.`,

  [`### 4. Importer dans IBS-Studio → champs auto-connectés

Tableau de bord → **Importer** → sélectionne le \`.idml\`. À l'ouverture :

- chaque **balise texte** devient un placeholder \`{{nom}}\` éditable ;
- chaque **balise image** devient un cadre image lié.

Dans l'éditeur, panneau **Publipostage** : connecte ta source (Excel, Google Sheets, PIM…). Les noms de colonnes matchent les noms de balises (**casse et accents tolérés**), et IBS-Studio remplit tout, ligne par ligne. Tu peux ensuite **exporter par lot** (un PDF/PNG/PPTX par ligne).`]:
    `### 4. Import into IBS-Studio → fields connected automatically

Dashboard → **Import** → select the \`.idml\`. On opening:

- every **text tag** becomes an editable \`{{name}}\` placeholder;
- every **image tag** becomes a linked image frame.

In the editor, **Mail merge** panel: connect your source (Excel, Google Sheets, PIM…). The column names match the tag names (**case and accents are tolerated**), and IBS-Studio fills everything in, row by row. You can then **export in bulk** (one PDF/PNG/PPTX per row).`,

  [`Le **Scraping Hub** centralise la gouvernance du scraping en trois onglets.`]:
    `The **Scraping Hub** brings the governance of scraping together into three tabs.`,

  [`### Règles : éditeur markdown avec aperçu live

L'onglet **Règles** est un éditeur **côte à côte** : tu écris du markdown à gauche, le rendu s'affiche en direct à droite (titres, listes, tableaux GFM). Le champ est **pré-rempli d'un canevas** quand il est vide — quatre sections types *Conventions de nommage*, *Prix*, *Descriptions* et *Pièges connus* — pour donner le bon point de départ. Le bouton **Enregistrer** reste grisé tant que rien n'a changé et l'app mémorise l'auteur de la dernière modification (ton e-mail). La lecture est ouverte à tous ; **seule la permission \`scrapingHub.edit\`** fait apparaître le bouton d'enregistrement.`]:
    `### Rules: a markdown editor with a live preview

The **Rules** tab is a **side-by-side** editor: you write markdown on the left, the rendering appears live on the right (headings, lists, GFM tables). The field is **pre-filled with an outline** when it is empty — four standard sections, *Naming conventions*, *Prices*, *Descriptions* and *Known traps* — to give you the right starting point. The **Save** button stays greyed out until something changes, and the app remembers who made the last edit (your e-mail). Reading is open to everyone; **only the \`scrapingHub.edit\` permission** makes the save button appear.`,

  [`### Fournisseurs : prompt par domaine, champs et taux de réussite

Sous chaque domaine fournisseur, tu retrouves le **prompt fournisseur** s'il en existe un (encadré bleu, badge « prompt fournisseur défini ») : ces consignes propres au site s'appliquent à tous ses templates. Chaque template affiche son **nombre de champs** et, dès qu'il a tourné, son **taux de réussite** (\`succès / applications ok\`) — pratique pour repérer un template qui décroche. Les fournisseurs sont triés par ordre alphabétique ; les templates sans domaine sont regroupés sous « (sans domaine) ». Un clic ouvre le template dans son éditeur.`]:
    `### Suppliers: prompt per domain, fields and success rate

Under each supplier domain you find the **supplier prompt** if there is one (blue box, "supplier prompt set" badge): those site-specific instructions apply to all of its templates. Each template shows its **number of fields** and, once it has run, its **success rate** (\`successes / successful applications\`) — handy for spotting a template that is slipping. Suppliers are sorted alphabetically; templates without a domain are gathered under "(no domain)". A click opens the template in its editor.`,

  [`### Debug : un journal LOCAL à ce navigateur

Le journal de debug est stocké **en local sur ce poste** (localStorage), pas dans Firestore : il n'est donc **pas partagé** avec l'équipe et ne reflète que tes propres enrichissements récents. Chaque entrée est typée **Jina** (URL appelée, en-têtes, réponse markdown — tronquée à 50 Ko) ou **LLM** (fournisseur, modèle, tâche, température, messages par rôle, éventuel outil appelé). Déplie une entrée pour voir le détail, avec son horodatage. Au-delà du rafraîchissement automatique toutes les 2 s, un bouton **Rafraîchir** force une relecture immédiate.`]:
    `### Debug: a log LOCAL to this browser

The debug log is stored **locally on this machine** (localStorage), not in Firestore: it is therefore **not shared** with the team and reflects only your own recent enrichments. Each entry is typed **Jina** (URL called, headers, markdown response — truncated at 50 KB) or **LLM** (provider, model, task, temperature, messages by role, any tool called). Unfold an entry to see the detail, with its timestamp. Beyond the automatic refresh every 2 s, a **Refresh** button forces an immediate re-read.`,

  [`### Voir aussi

La création des templates se fait dans **Templates scraping** ; le mode d'emploi général (Scrape, Map + Extract, Crawl, limites anti-bot) est dans **Scraping produits**.`]:
    `### See also

Templates are created under **Scraping templates**; the general instructions (Scrape, Map + Extract, Crawl, anti-bot limits) are in **Product scraping**.`,

  [`Le **Chat IA** est un assistant texte intégré à l'app. Pose une question, demande un brouillon, un bout de code ou une explication : la réponse arrive en **markdown** (titres, listes, blocs de code). Il répond en **français** par défaut, ou dans la langue de ta question.`]:
    `The **AI Chat** is a text assistant built into the app. Ask a question, ask for a draft, a snippet of code or an explanation: the answer comes back in **markdown** (headings, lists, code blocks). It replies in the language of your question.`,

  [`### Ce qu'il sait faire`]:
    `### What it can do`,

  [`### Choix du modèle

Le Chat utilise une **cascade de modèles** : si le modèle principal échoue, le suivant prend le relais automatiquement. Chaque réponse affiche **par quel modèle** elle a été produite — et si des fournisseurs ont échoué avant, un badge ambre **« Échec du provider »** se déplie pour voir le détail des tentatives. L'ordre de la cascade et le modèle de chaque fournisseur se règlent dans les **Paramètres → IA**.`]:
    `### Choosing the model

The Chat uses a **cascade of models**: if the main model fails, the next one automatically takes over. Each answer shows **which model** produced it — and if providers failed before it, an amber **"Provider failure"** badge unfolds to show the detail of the attempts. The order of the cascade and each provider's model are set under **Settings → AI**.`,

  [`### Changer de modèle à la volée

Le **badge du modèle**, à côté du bouton d'envoi, est **cliquable** : il déplie la liste de tous les modèles de la cascade (regroupés par fournisseur, avec leur tarif indicatif *entrée / sortie*). Choisir un modèle le sélectionne **et le place en tête de cascade** pour les messages suivants — pas besoin de passer par les Réglages. Le fournisseur en tête porte l'étiquette **« primaire »**, et un lien **« Cascade & clés API → Réglages »** mène au réglage complet.`]:
    `### Switching model on the fly

The **model badge**, next to the send button, is **clickable**: it unfolds the list of every model in the cascade (grouped by provider, with their indicative *input / output* rates). Choosing a model selects it **and puts it at the head of the cascade** for the following messages — no need to go through Settings. The provider at the head carries the **"primary"** label, and a **"Cascade & API keys → Settings"** link leads to the full configuration.`,

  [`### À ne pas confondre

- Le Chat IA est **conversationnel** : il **n'accède pas au web** et **n'agit pas sur l'app** (il ne crée pas de projets, ne scrape pas, ne lance pas de workflows).
- Pour un assistant **avec accès web** et capable d'**exécuter des workflows**, c'est le **bot Telegram** qu'il faut utiliser.
- Une **clé LLM** doit être configurée dans les Paramètres pour que le Chat réponde.`]:
    `### Not to be confused

- The AI Chat is **conversational**: it **has no web access** and **does not act on the app** (it creates no projects, scrapes nothing, launches no workflows).
- For an assistant **with web access** that can **run workflows**, use the **Telegram bot**.
- An **LLM key** must be configured in Settings for the Chat to answer.`,

  [`Toute votre base, **d'un seul regard**. L'**Explorateur** dessine un **diagramme relationnel (ERD)** de vos collections Firestore — **clés primaires (PK)**, **clés étrangères (FK)** et **cardinalités** (1:1, 1:N) — et trace les liens qui relient projets, produits, taxonomies et bases Excel. **Double-cliquez une table** pour afficher ses enregistrements **en direct** (mise à jour temps réel), avec sélecteur de base et recherche instantanée. Les positions des tables sont **mémorisées** : composez la carte qui vous parle.

> 🔒 Réservé au **propriétaire**. On l'ouvre dans **Paramètres → Données** (l'engrenage en bas de la barre latérale).`]:
    `Your whole database, **at a glance**. The **Explorer** draws an **entity-relationship diagram (ERD)** of your Firestore collections — **primary keys (PK)**, **foreign keys (FK)** and **cardinalities** (1:1, 1:N) — and traces the links joining projects, products, taxonomies and Excel databases. **Double-click a table** to show its records **live** (updated in real time), with a database selector and an instant search. The tables' positions are **remembered**: compose the map that speaks to you.

> 🔒 Reserved for the **owner**. You open it under **Settings → Data** (the cog at the bottom of the sidebar).`,

  [`### Le problème

Une base qui grandit devient **opaque** : on ne sait plus quelles collections existent, comment elles se relient, ni ce qu'elles contiennent réellement — sans ouvrir la console Firebase.`]:
    `### The problem

A database that grows becomes **opaque**: you no longer know which collections exist, how they join up, or what they actually hold — not without opening the Firebase console.`,

  [`### Modèle de données (ERD)

Chaque collection est une **table** avec ses **champs**, sa **clé primaire (PK)** et ses **clés étrangères (FK)** ; les relations métier sont tracées avec leur **cardinalité** (1:1, 1:N). Le diagramme est rendu avec **ReactFlow** : on visualise d'un coup la structure complète de la plateforme.`]:
    `### Data model (ERD)

Each collection is a **table** with its **fields**, its **primary key (PK)** and its **foreign keys (FK)**; the business relationships are traced with their **cardinality** (1:1, 1:N). The diagram is rendered with **ReactFlow**: you take in the platform's complete structure in one go.`,

  [`### Données live

Un **double-clic** sur une table ouvre le **contenu réel** de la collection, mis à jour en **temps réel** (*onSnapshot*). Pour les **bases Excel**, un **sélecteur** liste chaque base et n'affiche que ses colonnes utiles. **Filtre instantané** et **pagination** (50 lignes par page) pour parcourir de gros volumes sans peine.`]:
    `### Live data

A **double-click** on a table opens the collection's **real content**, updated in **real time** (*onSnapshot*). For the **Excel databases**, a **selector** lists each one and shows only its useful columns. An **instant filter** and **pagination** (50 rows per page) let you work through large volumes with ease.`,

  [`### Disposition persistée

**Déplacez les tables** par glisser : leur **position est enregistrée** sur votre profil (Firestore) et **restaurée** à la prochaine ouverture. Composez la cartographie qui correspond à votre lecture de la donnée.`]:
    `### Layout that persists

**Move the tables** by dragging: their **position is saved** onto your profile (Firestore) and **restored** next time you open it. Compose the map that matches the way you read your data.`,
}
