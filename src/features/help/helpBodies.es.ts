// Traduction ESPAGNOL (ESPAGNE, ES-ES) des CORPS markdown de l'aide.
//
// Généré par `node scripts/help-bodies-translate.mjs es`, sur le périmètre de
// `helpBodies.en.ts` (mêmes blocs, l'anglais servant d'appui au modèle).
//
// Clefé par le markdown FRANÇAIS EXACT, comme `strings.es.json` : aucun
// changement dans les 36 fichiers de `content/`, et un bloc non traduit
// s'affiche en français au lieu de disparaître.
//
// ⚠️ Un bloc retouché côté FR sort de ce mapping. C'est voulu : mieux vaut du
// français à jour qu'une traduction périmée.
export const HELP_BODIES_ES: Record<string, string> = {
  [`IBS-Studio est un éditeur visuel en ligne pour créer, importer et exporter des documents imprimables (print ou présentation).

**Étapes pour démarrer :**

1. **Se connecter** via Google depuis l'écran de connexion.
2. **Choisir une action** dans la barre latérale du tableau de bord.
3. **Créer un projet vierge** ou **importer** un document existant (IDML, PPTX, Excel).`]:
`IBS-Studio es un editor visual en línea para crear, importar y exportar documentos imprimibles (impresión o presentación).

**Pasos para empezar:**

1. **Iniciar sesión** a través de Google desde la pantalla de inicio de sesión.
2. **Elegir una acción** en la barra lateral del panel de control.
3. **Crear un proyecto en blanco** o **importar** un documento existente (IDML, PPTX, Excel).`,

  [`_Aperçu du tableau de bord : barre latérale (Projets, PIM, Taxonomies, DAM, Importer) et bibliothèque de projets._`]:
`_Vista general del panel de control: barra lateral (Proyectos, PIM, Taxonomías, DAM, Importar) y biblioteca de proyectos._`,

  [`### Sections du dashboard

Chaque entrée de la barre latérale est un raccourci vers une grande zone de l'app. Cliquer un lien ci-dessous met l'élément en évidence sur l'écran (ouvre d'abord le tableau de bord si nécessaire). _La liste reflète les modules réellement disponibles pour ton compte._`]:
`### Secciones del panel de control

Cada entrada de la barra lateral es un acceso directo a un área principal de la aplicación. Al hacer clic en un enlace a continuación, se resalta el elemento en la pantalla (abre primero el panel de control si es necesario). _La lista refleja los módulos realmente disponibles para su cuenta._`,

  [`### Créer un projet vierge

Ouvre le panneau « Nouveau document » et choisis un format (A4, A3, formats écran/réseaux sociaux, ou dimensions personnalisées). Le projet s'ouvre directement dans l'éditeur — le format et le **fond de page** (couleur, dégradé ou image) restent modifiables à tout moment dans le panneau **Page**.`]:
`### Crear un proyecto en blanco

Abra el panel "Nuevo documento" y elija un formato (A4, A3, formatos de pantalla/redes sociales o dimensiones personalizadas). El proyecto se abre directamente en el editor; el formato y el **fondo de página** (color, degradado o imagen) se pueden modificar en cualquier momento en el panel **Página**.`,

  [`### Retrouver un projet existant

La **Bibliothèque** liste tous tes projets :

- **Ouvrir** : clic simple sur la carte. **Dupliquer / supprimer** : boutons de la carte (ou clic droit).
- **Vignettes ou Liste** : deux boutons en haut à droite basculent l'affichage.
- **Filtrer par taxonomie** : le volet **Taxonomies** à gauche restreint la liste aux projets classés sous le nœud choisi.
- **Sélection multiple** : coche plusieurs projets → barre d'actions (**Tout sélectionner**, **Effacer**, **Supprimer (N)**) pour faire le ménage en une opération.`]:
`### Encontrar un proyecto existente

La **Biblioteca** enumera todos sus proyectos:

- **Abrir**: un solo clic en la tarjeta. **Duplicar / eliminar**: botones de la tarjeta (o clic derecho).
- **Miniaturas o Lista**: dos botones en la parte superior derecha cambian la vista.
- **Filtrar por taxonomía**: el panel **Taxonomías** a la izquierda restringe la lista a los proyectos clasificados bajo el nodo elegido.
- **Selección múltiple**: marque varios proyectos → barra de acciones (**Seleccionar todo**, **Borrar**, **Eliminar (N)**) para hacer limpieza en una sola operación.`,

  [`### Raccourcis utiles à connaître`]:
`### Atajos útiles que debe conocer`,

  [`La section suivante, _L'éditeur_, détaille l'interface et les outils disponibles une fois un projet ouvert.`]:
`La siguiente sección, _El editor_, detalla la interfaz y las herramientas disponibles una vez abierto un proyecto.`,

  [`Au-delà de la barre latérale du tableau de bord, deux aides à la navigation sont disponibles **partout dans l'app**, y compris dans l'éditeur.`]:
`Más allá de la barra lateral del panel de control, hay dos ayudas de navegación disponibles **en toda la aplicación**, incluido en el editor.`,

  [`### Menu des modules (☰)

Un bouton **☰ flottant en bas à gauche** ouvre un tiroir listant tous les modules : Nouveau document, Importer, Bibliothèque, DAM, PIM, Taxonomies, Templates scraping, Scraping Hub, Workflows, Veille tarifaire, Telegram, Animation, Chat IA et Utilisateurs & rôles.

- Cliquer une entrée ramène au **tableau de bord** sur la section choisie.
- Le tiroir n'affiche que les modules **autorisés par ton rôle** (voir _Utilisateurs & rôles_).
- Le bouton est masqué sur le tableau de bord (où la barre latérale joue déjà ce rôle).
- En bas du tiroir, l'entrée **« Configurer l'application » (✨)** rouvre l'assistant de configuration.`]:
`### Menú de módulos (☰)

Un botón **☰ flotante en la parte inferior izquierda** abre un panel que enumera todos los módulos: Nuevo documento, Importar, Biblioteca, DAM, PIM, Taxonomías, Plantillas de scraping, Scraping Hub, Flujos de trabajo, Monitorización de precios, Telegram, Animación, Chat IA y Usuarios y roles.

- Al hacer clic en una entrada, se vuelve al **panel de control** en la sección elegida.
- El panel solo muestra los módulos **autorizados por su rol** (ver _Usuarios y roles_).
- El botón se oculta en el panel de control (donde la barra lateral ya cumple esta función).
- En la parte inferior del panel, la entrada **«Configurar la aplicación» (✨)** vuelve a abrir el asistente de configuración.`,

  [`### Palette de commandes (⌘K)

**⌘K** (Mac) ou **Ctrl+K** (PC) ouvre la palette de commandes depuis n'importe quelle page : tape quelques lettres pour ouvrir un de tes **projets récents**, **sauter vers un module** (« pim », « workflows », « bibliothèque »…) ou lancer une action rapide (ouvrir les Réglages, basculer le thème clair/sombre). La recherche ignore les accents et comprend des synonymes (« zapier » → Workflows). Navigue avec **↑ ↓**, valide avec **↵**.`]:
`### Paleta de comandos (⌘K)

**⌘K** (Mac) o **Ctrl+K** (PC) abre la paleta de comandos desde cualquier página: escriba algunas letras para abrir uno de sus **proyectos recientes**, **saltar a un módulo** («pim», «flujos de trabajo», «biblioteca»…) o ejecutar una acción rápida (abrir los Ajustes, alternar el tema claro/oscuro). La búsqueda ignora los acentos y comprende sinónimos («zapier» → Flujos de trabajo). Navegue con **↑ ↓**, confirme con **↵**.`,

  [`### Notifications (🔔)

La **cloche en bas à gauche** (au-dessus du menu ☰) garde l'historique des évènements importants : fins de runs de workflow, exports réussis ou échoués. Un badge indique les non-lus ; le panneau permet de tout marquer lu ou de vider l'historique.`]:
`### Notificaciones (🔔)

La **campana en la parte inferior izquierda** (encima del menú ☰) guarda el historial de los eventos importantes: finalización de ejecuciones de flujos de trabajo, exportaciones exitosas o fallidas. Un indicador muestra los no leídos; el panel permite marcar todo como leído o vaciar el historial.`,

  [`### Visites guidées (🧭)

Un bouton **🧭 « Visite guidée » en bas à droite** (à gauche du bouton d'aide) lance une visite interactive de l'écran courant :

- **Tableau de bord** : parcourt chaque espace de travail un par un.
- **Éditeur** : détaille la barre d'outils, le plan de travail et tous les panneaux.

La visite s'ouvre **automatiquement une seule fois** par écran (au premier passage), puis reste relançable via le bouton 🧭. Navigue avec **Suivant / Précédent**, ou appuie sur **Échap** pour quitter à tout moment.`]:
`### Visitas guiadas (🧭)

Un botón **🧭 «Visita guiada» en la parte inferior derecha** (a la izquierda del botón de ayuda) inicia una visita interactiva de la pantalla actual:

- **Panel de control**: recorre cada espacio de trabajo uno por uno.
- **Editor**: detalla la barra de herramientas, la mesa de trabajo y todos los paneles.

La visita se abre **automáticamente una sola vez** por pantalla (en el primer acceso), y puede volver a iniciarse mediante el botón 🧭. Navegue con **Siguiente / Anterior**, o pulse **Esc** para salir en cualquier momento.`,

  [`### Ce manuel s'adapte à ton rôle

Le sommaire et la recherche de l'aide ne montrent que les sections des modules auxquels tu as accès (le **propriétaire** voit tout). Les sections transverses — _Prise en main_, _Assistant de configuration_, cette page, _L'éditeur_ et _Export_ — restent toujours visibles.

Ouvre l'aide à tout moment via le bouton **« ? »** en bas à droite ou le raccourci **⇧ + ?**.`]:
`### Este manual se adapta a su rol

El índice y la búsqueda de la ayuda solo muestran las secciones de los módulos a los que tiene acceso (el **propietario** ve todo). Las secciones transversales — _Primeros pasos_, _Asistente de configuración_, esta página, _El editor_ y _Exportación_ — permanecen siempre visibles.

Abra la ayuda en cualquier momento mediante el botón **«?»** en la parte inferior derecha o el atajo **⇧ + ?**.`,

  [`L'éditeur se compose d'un **header** (titre, sauvegarde, export), d'une **barre d'outils** à gauche, du **canvas** au centre, des **panneaux** à droite (Propriétés, Calques, Palette, Images, Assets, Données, Page, Impression, Versions, Animation 3D) et d'une **barre inférieure** (zoom, taille page, grille, snap).`]:
`El editor se compone de un **encabezado** (título, guardado, exportación), una **barra de herramientas** a la izquierda, el **lienzo** en el centro, los **paneles** a la derecha (Propiedades, Capas, Paleta, Imágenes, Activos, Datos, Página, Impresión, Versiones, Animación 3D) y una **barra inferior** (zoom, tamaño de página, cuadrícula, ajuste).`,

  [`### Palette de commandes (⌘K)

\`⌘K\` (ou \`Ctrl+K\`) ouvre la **palette de commandes** — disponible partout dans l'application, y compris l'éditeur. Tape pour filtrer (la recherche ignore les accents et exige que tous les mots correspondent), navigue aux flèches **↑ ↓** et valide avec **↵**. Les résultats sont regroupés en **Projets récents** (rouvre un document récent), **Modules** (saute vers une autre section : Bibliothèque, PIM, Workflows, Images/DAM…) et **Actions** (ouvrir les Réglages, basculer le thème clair/sombre). C'est le moyen le plus rapide de changer de projet ou de module sans lâcher le clavier.`]:
`### Paleta de comandos (⌘K)

\`⌘K\` (o \`Ctrl+K\`) abre la **paleta de comandos** — disponible en toda la aplicación, incluido el editor. Escriba para filtrar (la búsqueda ignora los acentos y exige que todas las palabras coincidan), navegue con las flechas **↑ ↓** y valide con **↵**. Los resultados se agrupan en **Proyectos recientes** (vuelve a abrir un documento reciente), **Módulos** (salta a otra sección: Biblioteca, PIM, Workflows, Imágenes/DAM…) y **Acciones** (abrir los Ajustes, alternar el tema claro/oscuro). Es la forma más rápida de cambiar de proyecto o de módulo sin soltar el teclado.`,

  [`Le header affiche le titre du projet et son état de sauvegarde, les boutons **Annuler / Rétablir**, **Sauvegarder** (commit manuel — la sauvegarde est sinon automatique) et **Exporter**.`]:
`El encabezado muestra el título del proyecto y su estado de guardado, los botones **Deshacer / Rehacer**, **Guardar** (commit manual — de lo contrario, el guardado es automático) y **Exportar**.`,

  [`Les outils de création (Texte, Rectangle, Ellipse, Ligne) ajoutent immédiatement une forme sur le canvas puis reviennent à l'outil Sélection. L'outil **Image** ouvre un petit menu — **Stock images**, **Mes images**, **Uploader** ou **Générer (IA)** — puis le sélecteur d'images correspondant.`]:
`Las herramientas de creación (Texto, Rectángulo, Elipse, Línea) añaden inmediatamente una forma en el lienzo y luego vuelven a la herramienta Selección. La herramienta **Imagen** abre un pequeño menú — **Imágenes de stock**, **Mis imágenes**, **Subir** o **Generar (IA)** — y luego el selector de imágenes correspondiente.`,

  [`### Casse du texte (sans réécrire)

La section **Transformation** des propriétés d'un texte applique une **casse** au rendu sans toucher au contenu saisi : **majuscules**, **minuscules** ou **Capitales** (première lettre de chaque mot). Pratique pour un titre tout en capitales ou un sous-titre en bas de casse : tu modifies l'apparence, le texte source (et tes liaisons \`{{champ}}\`) restent intacts.`]:
`### Mayúsculas y minúsculas (sin reescribir)

La sección **Transformación** de las propiedades de un texto aplica un **formato de mayúsculas/minúsculas** a la visualización sin alterar el contenido introducido: **mayúsculas**, **minúsculas** o **Capitales** (primera letra de cada palabra). Resulta práctico para un título todo en mayúsculas o un subtítulo en minúsculas: se modifica la apariencia, mientras que el texto de origen (y las vinculaciones \`{{champ}}\`) permanecen intactos.`,

  [`Le panneau **Calques** liste tous les objets du canvas. Tu peux masquer (œil), supprimer (poubelle) ou réordonner un calque par drag-and-drop. Les textes se déplient pour éditer chaque segment séparément — chaque segment offre un bouton **« Lier à un champ de données »** (et **« Délier »**) pour brancher cette portion de texte sur une colonne de la source, sans toucher au reste du bloc.`]:
`El panel **Capas** enumera todos los objetos del lienzo. Es posible ocultar (ojo), eliminar (papelera) o reordenar una capa mediante arrastrar y soltar. Los textos se despliegan para editar cada segmento por separado — cada segmento ofrece un botón **«Vincular a un campo de datos»** (y **«Desvincular»**) para conectar esa porción de texto a una columna del origen, sin alterar el resto del bloque.`,

  [`### Vignettes des pages

Sur un document à plusieurs pages, la **barre inférieure** affiche une rangée de **vignettes** (une par page, avec son numéro). **Clic** sur une vignette pour y naviguer (la page courante est sauvegardée avant le saut), **survol → croix rouge** pour la supprimer, et le bouton **« + »** en bout de rangée ajoute une page. La vignette active est encadrée en bleu.`]:
`### Miniaturas de las páginas

En un documento de varias páginas, la **barra inferior** muestra una fila de **miniaturas** (una por página, con su número). Haga **clic** en una miniatura para navegar hasta ella (la página actual se guarda antes del salto), **pase el cursor → cruz roja** para eliminarla, y el botón **«+»** al final de la fila añade una página. La miniatura activa está enmarcada en azul.`,

  [`### Organiser les panneaux de droite

La colonne de droite est **modulaire** : le panneau **Propriétés** reste épinglé en haut, et chaque autre panneau (Calques, Images, Palette, Assets, Page, Impression, Données, Animation 3D, Versions) se **replie/déplie** d'un clic sur son en-tête. Tu peux aussi **réordonner les panneaux** en glissant leur en-tête : remonte ceux que tu utilises le plus pour les avoir sous la main.`]:
`### Organizar los paneles de la derecha

La columna de la derecha es **modular**: el panel **Propiedades** permanece fijado en la parte superior, y todos los demás paneles (Capas, Imágenes, Paleta, Assets, Página, Impresión, Datos, Animación 3D, Versiones) se **pliegan/despliegan** con un clic en su encabezado. También es posible **reordenar los paneles** arrastrando su encabezado: mueva hacia arriba los que más utilice para tenerlos siempre a mano.`,

  [`Le **clic droit** sur un objet ouvre un menu rapide : dupliquer, ordre d'empilement, grouper/dégrouper, **miroir H/V**, verrouiller, supprimer — et sur un document multi-pages, **« Répéter sur toutes les pages »** / **« Retirer des autres pages »** (éléments maîtres, voir plus bas).`]:
`El **clic derecho** sobre un objeto abre un menú rápido: duplicar, orden de apilamiento, agrupar/desagrupar, **espejo H/V**, bloquear, eliminar — y en un documento multipágina, **«Repetir en todas las páginas»** / **«Quitar de las otras páginas»** (elementos maestros, véase más abajo).`,

  [`Sélectionner un objet fait apparaître une **barre flottante sous la sélection** avec les actions fréquentes : dupliquer, avancer/reculer d'un plan, grouper/dégrouper, verrouiller, supprimer — sans aller-retour vers le panneau de droite.

Pendant une manipulation, un **badge temps réel** remplace la barre : position **X, Y** pendant un déplacement, **L × H** pendant un redimensionnement, **angle** pendant une rotation.`]:
`Seleccionar un objeto hace aparecer una **barra flotante bajo la selección** con las acciones frecuentes: duplicar, avanzar/retroceder un nivel, agrupar/desagrupar, bloquear, eliminar — sin tener que ir y volver al panel derecho.

Durante una manipulación, un **indicador en tiempo real** reemplaza la barra: posición **X, Y** durante un desplazamiento, **An × Al** durante un redimensionamiento, **ángulo** durante una rotación.`,

  [`Le panneau **Versions** garde des **snapshots** du document (miniature + horodatage, 20 max). Créez une version avant un gros changement ; **Restaurer** ré-écrit le contenu puis recharge l'éditeur. Pensez à créer une version de l'état actuel avant de restaurer une ancienne.`]:
`El panel **Versiones** guarda **instantáneas** del documento (miniatura + marca de tiempo, 20 máx.). Cree una versión antes de un cambio importante; **Restaurar** reescribe el contenido y luego recarga el editor. Recuerde crear una versión del estado actual antes de restaurar una antigua.`,

  [`La sauvegarde est **automatique** mais le bouton Sauvegarder permet un commit manuel. Le bouton Exporter (voir _Header_ plus haut) ouvre la fenêtre de choix de format (PDF, IDML, PPTX, SVG, PNG, HTML) — détaillée dans la section _Export multi-format_.`]:
`El guardado es **automático** pero el botón Guardar permite una confirmación manual. El botón Exportar (ver _Encabezado_ más arriba) abre la ventana de selección de formato (PDF, IDML, PPTX, SVG, PNG, HTML) — detallada en la sección _Exportación multiformato_.`,

  [`### Header`]:
`### Encabezado`,

  [`### Barre d'outils`]:
`### Barra de herramientas`,

  [`### Propriétés des objets`]:
`### Propiedades de los objetos`,

  [`### Calques`]:
`### Capas`,

  [`### Naviguer dans le canvas`]:
`### Navegar por el lienzo`,

  [`### Les autres panneaux de droite`]:
`### Los otros paneles derechos`,

  [`### Menu contextuel (clic droit)`]:
`### Menú contextual (clic derecho)`,

  [`### Barre contextuelle & repères de manipulation`]:
`### Barra contextual y guías de manipulación`,

  [`### Preflight d'impression`]:
`### Comprobación previa de impresión`,

  [`### Re-skin par les données PIM`]:
`### Re-skin mediante datos PIM`,

  [`### Éléments maîtres & kit de marque`]:
`### Elementos maestros y kit de marca`,

  [`### Versions du document`]:
`### Versiones del documento`,

  [`### Sauvegarder & exporter`]:
`### Guardar y exportar`,

  [`### Raccourcis de l'éditeur`]:
`### Atajos del editor`,

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
`El panel **Propiedades** (a la derecha) se adapta a la selección:

- **Posición / tamaño / rotación**: valores X, Y, An, Al y ángulo editables con exactitud.
- **Relleno**: color sólido, **degradado** o **imagen** (seleccionada desde el DAM: Stock, Mis imágenes, Favoritos, Colecciones, Recientes o generación por IA).
- **Contorno, opacidad, sombra paralela** y **esquinas redondeadas** (rectángulos).
- **Modos de fusión**: 16 modos (Multiplicar, Trama, Superponer, Luz suave/fuerte, Diferencia, Tono, Saturación, Color, Luminosidad…).
- **Espejo** horizontal / vertical y **bloqueo** (candado — el objeto ya no se puede seleccionar ni mover).
- **Recorte de imagen**: para una imagen (o una forma rellenada con una imagen), recorta la zona visible y hace zoom en el marco sin deformar.
- **Texto**: fuente (se cargan las fuentes del proyecto), tamaño, negrita/cursiva/subrayado, alineación, **interlineado**, **espaciado de caracteres**, color — y **estilos por carácter** en edición (seleccione una porción del texto antes de aplicar). El botón **Ajustar al contenido** ajusta la anchura del bloque al texto.
- **Alineación multiobjeto**: seis botones (izquierda, centro H, derecha, arriba, centro V, abajo — con respecto a la página) + **distribución** horizontal/vertical para espaciar uniformemente 3 objetos o más.

Durante los desplazamientos, aparecen **guías inteligentes** (smart guides): imantación a los bordes/centros de la página y a los demás objetos.

> El panel Propiedades también contiene una sección **Reglas condicionales**: hace que el objeto reaccione a los datos de cada fila durante la combinación de correspondencia (ocultar, recolorear, redimensionar según una condición). Consulte la sección **Reglas condicionales**.`,

  [`La barre inférieure pilote la navigation :

- **Zoom** : boutons − / + (pas relatif au zoom courant) ou molette. Plage **1 % → 400 %** — utile pour voir l'ensemble d'un grand format (jusqu'à plusieurs milliers de pixels) ou détailler au pixel près. Clic sur la valeur (ex: \`100%\`) pour revenir à 100 %.
- **Pan** : maintenir **espace** + glisser à la souris.
- **Taille de la page** affichée à côté du zoom — clic ouvre les paramètres de page.
- **Grille** : repère visuel pour aligner.
- **Snap** : aimantation aux objets et à la grille pendant le déplacement.`]:
`La barra inferior controla la navegación:

- **Zoom**: botones − / + (el paso es relativo al zoom actual) o rueda del ratón. Rango **1 % → 400 %** — útil para ver todo un formato grande (hasta varios miles de píxeles) o detallar al píxel. Haga clic en el valor (ej: \`100%\`) para volver al 100 %.
- **Desplazamiento**: mantenga pulsado **espacio** + arrastre con el ratón.
- **Tamaño de la página** mostrado junto al zoom — al hacer clic se abren los ajustes de página.
- **Cuadrícula**: referencia visual para alinear.
- **Ajuste**: imantación a los objetos y a la cuadrícula durante el desplazamiento.`,

  [`Dans le panneau **Impression**, la section **Preflight** (bouton _Analyser_) contrôle le document avant export :

- images sous **150 DPI effectifs** (erreur) ou 225 DPI (avertissement) ;
- objets débordant de la page **au-delà du fond perdu**, ou entièrement hors page ;
- textes **< 5 pt** ou à moins de **3 mm du bord de coupe**.

Cliquer un problème **sélectionne l'objet** concerné sur le canvas.`]:
`En el panel **Impresión**, la sección **Preflight** (botón _Analizar_) comprueba el documento antes de la exportación:

- imágenes por debajo de **150 DPI efectivos** (error) o 225 DPI (advertencia);
- objetos que sobresalen de la página **más allá del sangrado**, o totalmente fuera de la página;
- textos **< 5 pt** o a menos de **3 mm del borde de corte**.

Al hacer clic en un problema **se selecciona el objeto** correspondiente en el lienzo.`,

  [`Le panneau **Données** accepte la source **« Produits PIM (re-skin) »** : chaque produit du projet devient une ligne. Décompose un flyer (Image/PDF → SVG), pose des \`{{champ}}\` sur les textes (ou des liaisons image), puis **navigue de produit en produit** : le visuel se re-skinne instantanément avec les données du produit courant.

Sur un flyer décomposé, la section **« Fond IA (Nano Banana) »** du même panneau **régénère le fond verrouillé** à partir d'un prompt (le fond actuel sert de référence) — vos textes et images liés restent éditables au-dessus. Nécessite une clé Gemini.

Le bouton **« Lier automatiquement »** détecte le **prix** (motif monétaire le plus gros), le **titre** (plus grande taille restante) et la **description** (texte long) puis pose les \`{{champs}}\` correspondants en un clic.

Bon à savoir, côté publipostage : les liaisons acceptent des **formules** (syntaxe \`[colonne]\` combinable, ex. \`[prix] € TTC\`), les **flèches ◀ ▶** parcourent les lignes de la source (le canvas se met à jour), le bouton **rafraîchir** recharge la source si elle a changé, et un badge **IDML** signale qu'une source IDML est branchée (export multi-produits).`]:
`El panel **Datos** acepta el origen **"Productos PIM (re-skin)"**: cada producto del proyecto se convierte en una fila. Descomponga un folleto (Imagen/PDF → SVG), coloque \`{{champ}}\` en los textos (o enlaces de imagen) y, a continuación, **navegue de producto en producto**: el diseño se rediseña instantáneamente con los datos del producto actual.

En un folleto descompuesto, la sección **"Fondo IA (Nano Banana)"** del mismo panel **regenera el fondo bloqueado** a partir de un prompt (el fondo actual sirve de referencia) — sus textos e imágenes enlazados siguen siendo editables por encima. Requiere una clave Gemini.

El botón **"Vincular automáticamente"** detecta el **precio** (el patrón de moneda más grande), el **título** (el tamaño restante más grande) y la **descripción** (texto largo) y luego coloca los \`{{champs}}\` correspondientes con un solo clic.

Es bueno saberlo, en cuanto a la combinación de correspondencia: los enlaces aceptan **fórmulas** (sintaxis \`[colonne]\` combinable, ej. \`[prix] € IVA incl.\`), las **flechas ◀ ▶** recorren las filas del origen (el lienzo se actualiza), el botón **actualizar** recarga el origen si ha cambiado, y una insignia **IDML** indica que hay un origen IDML conectado (exportación multiproducto).`,

  [`- **Répéter sur toutes les pages** (clic droit sur un objet) : l'élément (logo, pagination, mentions…) est copié sur chaque page du document ; ré-appliquer **resynchronise** position et style partout. « Retirer des autres pages » supprime les copies. Les pages jamais ouvertes doivent être visitées une fois d'abord.
- **Kit de marque (global)** : en tête du panneau **Palette**, vos couleurs de marque sont partagées entre **tous vos projets** — « Vers le projet » les importe dans la palette courante, « Depuis le projet » capture la palette dans le kit.
- **Styles d'objets (global)** : dans le panneau **Palette**, capturez le style d'un objet (couleurs, contour, opacité, typo) et ré-appliquez-le en un clic sur n'importe quelle sélection, dans tous vos projets.`]:
`- **Repetir en todas las páginas** (clic derecho en un objeto): el elemento (logotipo, paginación, avisos legales…) se copia en cada página del documento; volver a aplicarlo **resincroniza** la posición y el estilo en todas partes. "Eliminar de las otras páginas" borra las copias. Las páginas que nunca se han abierto deben visitarse una vez primero.
- **Kit de marca (global)**: en la parte superior del panel **Paleta**, los colores de su marca se comparten entre **todos sus proyectos** — "Hacia el proyecto" los importa a la paleta actual, "Desde el proyecto" captura la paleta en el kit.
- **Estilos de objeto (global)**: en el panel **Paleta**, capture el estilo de un objeto (colores, trazo, opacidad, tipografía) y vuelva a aplicarlo con un clic a cualquier selección, en todos sus proyectos.`,

  [`IBS-Studio extrait des données produits à partir d'URLs fournisseurs et les pousse directement dans une BDD. Trois modes selon le contexte.`]:
`IBS-Studio extrae datos de productos a partir de URLs de proveedores y los envía directamente a una base de datos. Tres modos según el contexto.`,

  [`### Quel mode utiliser ?

| Tu as… | Utilise |
|---|---|
| Une page catégorie (liste de produits) | **Map + Extract** |
| Une seule URL produit à fouiller | **Scrape simple** |
| Un site entier à indexer | **Crawl** |
| Un fournisseur récurrent (Nicoll, Milwaukee…) | **Template scraping** ⭐ |

Pour un fournisseur que tu vas scraper plus de 2 fois, **crée un template**. C'est la voie royale : 0 hallucination IA, 0 token consommé, réutilisable sur des centaines d'URLs.`]:
`### ¿Qué modo utilizar?

| Tiene… | Utilice |
|---|---|
| Una página de categoría (lista de productos) | **Map + Extract** |
| Una sola URL de producto para explorar | **Scrape simple** |
| Un sitio completo para indexar | **Crawl** |
| Un proveedor recurrente (Nicoll, Milwaukee…) | **Template scraping** ⭐ |

Para un proveedor que vaya a extraer (scrape) más de 2 veces, **cree una plantilla**. Es el camino ideal: 0 alucinaciones de IA, 0 tokens consumidos, reutilizable en cientos de URLs.`,

  [`_Éditeur de template : à gauche l'aperçu de page, à droite les champs cibles. Double-clic sur un élément suffit à générer le sélecteur CSS._`]:
`_Editor de plantillas: a la izquierda la vista previa de la página, a la derecha los campos de destino. Un doble clic en un elemento es suficiente para generar el selector CSS._`,

  [`### Créer un template de scraping

1. Ouvre la page **Templates scraping** depuis le menu latéral
2. Clique **Nouveau** → entre un nom (ex: \`Nicoll\`), le domaine (\`nicoll.fr\`) et un pattern d'URL (\`.*\` pour tout matcher)
3. Onglet **Pointer & cliquer** → charge une URL produit dans l'iframe
4. Double-clique sur titre, prix, description… → un sélecteur CSS s'auto-génère
5. Onglet **Avancé (JSON)** → bouton **Tester** pour vérifier l'extraction (score ≥ 20 = OK)
6. **Enregistrer**

Le template vit dans Firestore et matchera automatiquement les futures URLs du domaine quand tu importeras une BDD.`]:
`### Crear una plantilla de scraping

1. Abra la página **Plantillas de scraping** desde el menú lateral
2. Haga clic en **Nuevo** → introduzca un nombre (ej.: \`Nicoll\`), el dominio (\`nicoll.fr\`) y un patrón de URL (\`.*\` para coincidir con todo)
3. Pestaña **Apuntar y hacer clic** → cargue una URL de producto en el iframe
4. Haga doble clic en el título, precio, descripción… → se autogenerará un selector CSS
5. Pestaña **Avanzado (JSON)** → botón **Probar** para comprobar la extracción (puntuación ≥ 20 = OK)
6. **Guardar**

La plantilla reside en Firestore y coincidirá automáticamente con las futuras URL del dominio cuando importe una base de datos.`,

  [`### Onglet Recherche : « trouve-moi ça, là »

Pas d'URL sous la main ? Décris ce que tu cherches **et où** en langage naturel — _« tondeuses Honda chez LeroyMerlin et Castorama »_. Un LLM interprète ta phrase (sujet produit + enseignes ciblées + prix max éventuel) et lance une requête \`site:\` par enseigne, puis fusionne les résultats.

- Règle le **nombre de résultats** (1 à 30).
- Les fiches produit affichées sont **sondées en prix réel** (JSON-LD) ; si tu as donné un prix max, l'app **pré-coche** automatiquement celles qui rentrent dans le budget, au plus N par enseigne.
- Coche ce que tu veux, puis **Scraper N pages (Produit complet)** — chaque page passe par le même moteur que les autres onglets.
- Un tableau récapitule les champs que tu as demandés dans ton prompt (prix, EAN, marque…) au fur et à mesure.`]:
`### Pestaña Búsqueda: «encuéntrame esto, allí»

¿No tiene una URL a mano? Describa lo que busca **y dónde** en lenguaje natural — _«cortacéspedes Honda en LeroyMerlin y Castorama»_. Un LLM interpreta su frase (tema del producto + tiendas objetivo + posible precio máximo) y lanza una consulta \`site:\` por tienda, para luego fusionar los resultados.

- Ajuste el **número de resultados** (1 a 30).
- Las fichas de producto mostradas son **sondadas en precio real** (JSON-LD); si ha indicado un precio máximo, la aplicación **premarca** automáticamente las que entran en el presupuesto, con un máximo de N por tienda.
- Marque lo que desee y, a continuación, **Scrapear N páginas (Producto completo)** — cada página pasa por el mismo motor que las demás pestañas.
- Una tabla resume los campos que ha solicitado en su prompt (precio, EAN, marca…) a medida que avanza.`,

  [`### Plusieurs sites/URLs d'un coup (Liste · Fichier · Google Sheet)

Les onglets **Crawl** et **Map + Extract** ne se limitent pas à une seule URL. Le sélecteur de source propose 4 modes :

- **1 URL** : le cas simple.
- **Liste** : colle plusieurs URLs racines, une par ligne.
- **Fichier** : importe un **CSV / Excel / TSV** — la colonne URL est auto-détectée.
- **Google Sheet** : importe depuis un Sheet via OAuth Drive (connecte Drive dans Réglages → Connecteurs).

En multi-URL, les racines sont traitées **en séquence** et les résultats sont **agrégés et dédoublonnés** par URL absolue. Idéal pour mapper 10 catégories ou crawler 5 sous-sites en une passe.`]:
`### Varios sitios/URL a la vez (Lista · Archivo · Google Sheet)

Las pestañas **Crawl** y **Map + Extract** no se limitan a una sola URL. El selector de origen ofrece 4 modos:

- **1 URL**: el caso sencillo.
- **Lista**: pegue varias URL raíz, una por línea.
- **Archivo**: importe un **CSV / Excel / TSV** — la columna URL se detecta automáticamente.
- **Google Sheet**: importe desde un Sheet a través de OAuth Drive (conecte Drive en Ajustes → Conectores).

En modo multi-URL, las raíces se procesan **en secuencia** y los resultados se **agregan y deduplican** por URL absoluta. Ideal para mapear 10 categorías o rastrear 5 subsitios en una sola pasada.`,

  [`### Affiner un Crawl : limite, inclure/exclure (regex)

Avant d'extraire les liens, tu peux cadrer la découverte :

- **Limite de pages** (1 à 500, défaut 30) — par URL racine en mode multi.
- **Inclure (regex)** : ne garder que les chemins qui matchent, ex. \`/produits/.*\`.
- **Exclure (regex)** : écarter le bruit, ex. \`/tag/.*, /auteur/.*\`.

Le crawl extrait les liens (Jina) puis l'IA identifie les **noms de produits depuis les cartes visibles** ; tu coches les vrais produits, chacun part en **Produit complet**. Si la grille est en lazy-load et que rien ne sort, resserre le filtre **Inclure** ou bascule en mode **Plusieurs URLs**.`]:
`### Refinar un Crawl: límite, incluir/excluir (regex)

Antes de extraer los enlaces, puede delimitar el descubrimiento:

- **Límite de páginas** (1 a 500, por defecto 30) — por URL raíz en modo multi.
- **Incluir (regex)**: conservar solo las rutas que coincidan, ej. \`/produits/.*\`.
- **Excluir (regex)**: descartar el ruido, ej. \`/tag/.*, /auteur/.*\`.

El rastreo extrae los enlaces (Jina) y luego la IA identifica los **nombres de productos desde las tarjetas visibles**; usted marca los productos reales y cada uno se envía como **Producto completo**. Si la cuadrícula tiene carga diferida (lazy-load) y no aparece nada, ajuste el filtro **Incluir** o cambie al modo **Varias URL**.`,

  [`### Suivre le coût et arrêter un run

- **Chip de coût (en haut du modal)** : il additionne en direct le **dernier traitement** et le **cumul de la session**, ventilé par source — **LLM**, **Jina**, **Firecrawl**, **Bright Data**. Le LLM est facturé au tarif réel par modèle ; Jina/Firecrawl/Bright Data sont estimés aux tarifs publics. Survole le chip pour le détail.
- **Annuler** : pendant un batch d'enrichissement, le bouton **Annuler** stoppe les requêtes Jina/scrape qui acceptent un signal et n'enchaîne pas sur les URLs suivantes. La fiche déjà en cours peut terminer son traitement, mais son résultat est ignoré.`]:
`### Seguir el coste y detener una ejecución

- **Etiqueta de coste (en la parte superior del modal)**: suma en directo el **último procesamiento** y el **acumulado de la sesión**, desglosado por fuente — **LLM**, **Jina**, **Firecrawl**, **Bright Data**. El LLM se factura a la tarifa real por modelo; Jina/Firecrawl/Bright Data se estiman según las tarifas públicas. Pase el cursor sobre la etiqueta para ver el detalle.
- **Cancelar**: durante un lote de enriquecimiento, el botón **Cancelar** detiene las solicitudes de Jina/scrape que aceptan una señal y no continúa con las siguientes URL. La ficha que ya está en curso puede terminar su procesamiento, pero su resultado se ignora.`,

  [`### Que récupère « Produit complet » exactement ?

Tous les onglets (Scrape / Crawl / Map+Extract / Recherche) finissent par le **même moteur PIM** (\`enrichProductCore\`), pour un résultat homogène quel que soit le chemin :

- **Specs** au format KEY/VALUE (caractéristiques techniques structurées).
- **EAN / référence** repêchés du contenu et des données structurées (JSON-LD).
- **Fil d'Ariane → taxonomie** (breadcrumb concaténé), utile pour catégoriser.
- **Avantages** (les pictos/bénéfices produit transformés en lignes de texte).
- **Images filtrées** : le même classifieur que l'onglet Photos du PIM écarte les visuels parasites (logos, pictos, bannières) et garde les vraies photos produit.
- **Documents PDF** (notices, fiches techniques) détectés sur la page.

Si une page revient quasi vide, l'app conserve quand même le **résultat partiel exploitable** (marque/SKU/description/image issus du JSON-LD) plutôt que de tout jeter.`]:
`### ¿Qué recupera exactamente «Producto completo»?

Todas las pestañas (Scrape / Crawl / Map+Extract / Búsqueda) terminan en el **mismo motor PIM** (\`enrichProductCore\`), para obtener un resultado homogéneo independientemente de la ruta:

- **Especificaciones** en formato KEY/VALUE (características técnicas estructuradas).
- **EAN / referencia** rescatados del contenido y de los datos estructurados (JSON-LD).
- **Hilo de Ariadna → taxonomía** (breadcrumb concatenado), útil para categorizar.
- **Ventajas** (los pictogramas/beneficios del producto transformados en líneas de texto).
- **Imágenes filtradas**: el mismo clasificador que la pestaña Fotos del PIM descarta los elementos visuales parásitos (logotipos, pictogramas, banners) y conserva las verdaderas fotos del producto.
- **Documentos PDF** (manuales, fichas técnicas) detectados en la página.

Si una página vuelve casi vacía, la aplicación conserva de todos modos el **resultado parcial utilizable** (marca/SKU/descripción/imagen procedentes del JSON-LD) en lugar de descartarlo todo.`,

  [`### Textes fidèles à la source (verbatim)

L'IA **recopie** les textes de la page, elle ne les rédige jamais. La description et les avantages sont extraits **mot pour mot** depuis la source — sans reformuler, sans résumer, sans traduire. Vous obtenez le texte du fabricant ou du distributeur, pas une paraphrase générée.

La description conserve aussi la **structure d'origine** : retours à la ligne entre paragraphes et listes à puces sont préservés tels qu'ils apparaissent sur la page. Le fil d'Ariane est lui aussi recopié verbatim, ce qui fiabilise la taxonomie.`]:
`### Textos fieles a la fuente (verbatim)

La IA **copia** los textos de la página, nunca los redacta. La descripción y las ventajas se extraen **palabra por palabra** de la fuente — sin reformular, sin resumir, sin traducir. Obtiene el texto del fabricante o del distribuidor, no una paráfrasis generada.

La descripción también conserva la **estructura original**: los saltos de línea entre párrafos y las listas con viñetas se conservan tal como aparecen en la página. El hilo de Ariadna también se copia verbatim, lo que hace que la taxonomía sea más fiable.`,

  [`### Même qualité sur fabricants et retailers (passe HTML brut)

En complément de l'extraction IA, une **passe déterministe sur le HTML brut** de la page complète la fiche — spécifications, avantages, documents PDF — avec la même qualité sur un site fabricant (Milwaukee, Dyson…) que sur un retailer (Castorama, Jardiland, Screwfix…).

Cette passe est **additive** : elle n'écrase rien, elle comble les manques. Elle lit directement le code source, donc elle récupère aussi ce que le rendu navigateur cache :

- les **listes repliées derrière « Voir plus »** (avantages et specs complets, pas seulement les 3 premières lignes visibles) ;
- les tableaux de caractéristiques présents dans la page mais masqués derrière des onglets ou accordéons.

Zéro hallucination possible sur ces champs : ce sont des parsers déterministes, pas un LLM.`]:
`### Misma calidad en fabricantes y minoristas (pasada HTML sin procesar)

Como complemento a la extracción por IA, una **pasada determinista sobre el HTML sin procesar** de la página completa la ficha — especificaciones, ventajas, documentos PDF — con la misma calidad en un sitio de fabricante (Milwaukee, Dyson…) que en un minorista (Castorama, Jardiland, Screwfix…).

Esta pasada es **aditiva**: no sobrescribe nada, rellena los huecos. Lee directamente el código fuente, por lo que también recupera lo que oculta la renderización del navegador:

- las **listas plegadas tras «Ver más»** (ventajas y especificaciones completas, no solo las 3 primeras líneas visibles);
- las tablas de características presentes en la página pero ocultas tras pestañas o acordeones.

Cero alucinaciones posibles en estos campos: son analizadores deterministas, no un LLM.`,

  [`### Galeries d'images en pleine résolution

La passe images reconstruit les galeries que le rendu classique ne voit pas :

- **Adobe Scene7 / Dynamic Media** (convention \`/is/image/\` utilisée par des milliers de retailers) : à partir d'une seule vue détectée, l'app déduit le nom de base de l'asset et reconstruit **toutes les vues du carrousel** mentionnées dans la page — là où l'extraction classique ne voyait aucune photo.
- **Galeries JSON embarquées** (Magento \`mage/gallery\` et similaires) : chaque vue expose une variante miniature/moyenne/pleine — l'app prend systématiquement la **pleine résolution**.
- La **déduplication respecte les galeries** : les différentes vues d'un même produit (face, profil, détail…) ne sont plus fusionnées en une seule image.
- Les **drapeaux, icônes de réseaux sociaux, logos de paiement et pixels de consentement** sont définitivement écartés des photos produit.`]:
`### Galerías de imágenes en máxima resolución

El pase de imágenes reconstruye las galerías que el renderizado clásico no ve:

- **Adobe Scene7 / Dynamic Media** (convención \`/is/image/\` utilizada por miles de minoristas): a partir de una sola vista detectada, la aplicación deduce el nombre base del activo y reconstruye **todas las vistas del carrusel** mencionadas en la página, allí donde la extracción clásica no veía ninguna foto.
- **Galerías JSON integradas** (Magento \`mage/gallery\` y similares): cada vista expone una variante miniatura/media/completa; la aplicación toma sistemáticamente la **máxima resolución**.
- La **deduplicación respeta las galerías**: las diferentes vistas de un mismo producto (frente, perfil, detalle…) ya no se fusionan en una sola imagen.
- Las **banderas, iconos de redes sociales, logotipos de pago y píxeles de consentimiento** quedan definitivamente descartados de las fotos del producto.`,

  [`### Fiches sans pollution de navigation

Le bruit d'interface des sites e-commerce ne contamine plus les fiches :

- **Méga-menus imbriqués, menu compte, mini-panier** : leurs entrées ne deviennent plus de fausses caractéristiques.
- **Footer complet** (store locator « Trouver un magasin », moyens de paiement, adresses, mentions légales, plan du site, newsletter) : exclu des specs.
- **Avis clients** (notes « 4,5/5 », commentaires) : neutralisés, ils ne remontent ni en specs ni en description.
- **Overlays de recherche, CGV, bannières cookies, sentinelles techniques internes** : filtrés.
- Les **« Points forts »** ne reprennent plus l'UI du compte client, le widget de stock (« En rupture… ») ni le titre du produit — uniquement les vrais bénéfices rédigés par la source.

Ces filtres sont validés sur des fixtures réelles (Screwfix, Castorama, Jardiland…) et fonctionnent sans aucun code spécifique par enseigne.`]:
`### Fichas sin contaminación de navegación

El ruido de interfaz de los sitios de comercio electrónico ya no contamina las fichas:

- **Megamenús anidados, menú de cuenta, minicesta**: sus entradas ya no se convierten en falsas características.
- **Pie de página completo** (localizador de tiendas "Encontrar una tienda", métodos de pago, direcciones, avisos legales, mapa del sitio, boletín de noticias): excluido de las especificaciones.
- **Opiniones de clientes** (puntuaciones "4,5/5", comentarios): neutralizados, no se incluyen ni en las especificaciones ni en la descripción.
- **Superposiciones de búsqueda, CGC, banners de cookies, centinelas técnicos internos**: filtrados.
- Los **"Puntos fuertes"** ya no recogen la interfaz de usuario de la cuenta del cliente, el widget de existencias ("Agotado…") ni el título del producto, únicamente los verdaderos beneficios redactados por la fuente.

Estos filtros están validados en entornos reales (Screwfix, Castorama, Jardiland…) y funcionan sin ningún código específico por marca.`,

  [`### Découverte plus fiable sur les gros sites

Sur les pages catégories très lourdes (SPA de plus d'1 Mo), la découverte de produits est fiabilisée : le **délai serveur est étendu à 3 minutes** (au lieu d'1), et une **seconde tentative directe** est jouée avant de basculer sur la descente par rayons. Résultat : moins de découvertes qui retombent sur des liens parasites (cookies, actualités) faute de temps.`]:
`### Descubrimiento más fiable en sitios grandes

En las páginas de categorías muy pesadas (SPA de más de 1 MB), el descubrimiento de productos es más fiable: el **tiempo de espera del servidor se amplía a 3 minutos** (en lugar de 1), y se realiza un **segundo intento directo** antes de pasar a la navegación por secciones. Resultado: menos descubrimientos que terminan en enlaces parásitos (cookies, noticias) por falta de tiempo.`,

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
`### Extraer desde la base de datos (Map + Extract)

Cuando aún no se dispone de una plantilla, o para explorar un nuevo sitio:

1. **PIM** → abra una base de datos (o cree una vacía)
2. Botón **Extraer de la web** → pestaña **Map + Extract**
3. Pegue una URL de categoría → **Mapear el sitio** → lista de enlaces internos
4. Marque las URL a extraer (3-5 para prueba, más en producción)
5. Defina su esquema de campos (title, brand, price…) + un prompt de IA opcional
6. **Extraer** → la IA rellena las columnas
7. **Importar N filas** → inyección en la base de datos

Para un uso recurrente, transforme este mapeo ad hoc en una plantilla.`,

  [`### Limites à connaître

- **Sites e-commerce hostiles** (Mr-Bricolage, Darty, Boulanger…) : DataDome/Akamai peut bloquer. L'app **escalade automatiquement** : Jina d'abord, puis **Bright Data Web Unlocker**, puis **Scraping Browser** (tier 2) si les tokens sont configurés (Réglages → Connecteurs → Scraping). Symptôme d'un blocage total : champ \`Contenu\` vaut \`Nope\` ou est vide.
- **Sites B2B derrière login** : colle tes **cookies de session** dans Réglages → Cookies — ils sont injectés automatiquement dans les requêtes du domaine.
- **Pages SPA** : le rendu JS dépend du \`X-Wait-For-Selector\` côté Jina (déjà tuné pour les patterns retail FR).
- **Mode AUTO vs TEMPLATE** : AUTO = recherche web + LLM (peut halluciner) ; TEMPLATE = extraction déterministe par CSS selectors. Privilégie TEMPLATE dès qu'un template matche le domaine.`]:
`### Límites a conocer

- **Sitios de comercio electrónico hostiles** (Mr-Bricolage, Darty, Boulanger…): DataDome/Akamai puede bloquear. La aplicación **escala automáticamente**: Jina primero, luego **Bright Data Web Unlocker**, y después **Scraping Browser** (nivel 2) si los tokens están configurados (Ajustes → Conectores → Scraping). Síntoma de un bloqueo total: el campo \`Contenu\` indica \`Nope\` o está vacío.
- **Sitios B2B tras inicio de sesión**: pegue sus **cookies de sesión** en Ajustes → Cookies — se inyectan automáticamente en las peticiones del dominio.
- **Páginas SPA**: el renderizado JS depende del \`X-Wait-For-Selector\` del lado de Jina (ya ajustado para los patrones de retail de Francia).
- **Modo AUTO vs TEMPLATE**: AUTO = búsqueda web + LLM (puede alucinar); TEMPLATE = extracción determinista mediante selectores CSS. Priorice TEMPLATE en cuanto una plantilla coincida con el dominio.`,

  [`### Tip pro : URL-only enrichissement

Tu peux importer un Excel avec **uniquement une colonne URL** (sans titre/marque/réf). Le pipeline détecte la colonne URL, retrouve le template par domaine, et lance l'enrichissement TEMPLATE en un clic. Workflow type : 1000 URLs → 1000 fiches enrichies.`]:
`### Consejo profesional: enriquecimiento solo con URL

Puede importar un Excel con **únicamente una columna de URL** (sin título/marca/referencia). El pipeline detecta la columna de URL, encuentra la plantilla por dominio y lanza el enriquecimiento TEMPLATE con un clic. Flujo de trabajo típico: 1000 URLs → 1000 fichas enriquecidas.`,

  [`Le **PIM** (*Product Information Management*) est ta **source de vérité produits** : c'est lui qui alimente le *data-merge* avec un template graphique pour produire des fiches en série. Tes bases sont stockées sur Firebase et accessibles depuis n'importe quel poste connecté à ton compte.`]:
`El **PIM** (*Product Information Management*) es su **fuente de verdad de productos**: es el que alimenta la fusión de datos (data-merge) con una plantilla gráfica para producir fichas en serie. Sus bases de datos se almacenan en Firebase y son accesibles desde cualquier equipo conectado a su cuenta.`,

  [`_Vue d'une base : chaque ligne est un produit ; l'icône violette signale une fiche enrichie par IA._`]:
`_Vista de una base de datos: cada fila es un producto; el icono morado indica una ficha enriquecida por IA._`,

  [`### Bases de données

Tu peux gérer **plusieurs bases** en parallèle. Trois façons d'en créer une :

- **Importer un fichier** — depuis Excel ou CSV/TSV (voir *Importer Excel*).
- **Scraper le web** — partir d'URLs produits et laisser l'IA remplir les fiches.
- **Créer vide** — démarrer une base à la main.`]:
`### Bases de datos

Puede gestionar **varias bases de datos** en paralelo. Tres formas de crear una:

- **Importar un archivo** — desde Excel o CSV/TSV (ver *Importar Excel*).
- **Extraer de la web (Scraping)** — partir de URLs de productos y dejar que la IA rellene las fichas.
- **Crear vacía** — iniciar una base de datos manualmente.`,

  [`### Enrichir une fiche par IA

Clique sur une ligne → panneau **Enrichi par IA** à droite.

**Mode AUTO** (violet) : si la ligne a un \`title\`, \`brand\` ou \`reference\`, une **recherche web (Jina) + LLM** trouve l'URL et extrait les infos (modèle principal : Gemini, secours : Claude). Risque d'hallucination — à privilégier quand tu n'as pas d'URL.

**Mode TEMPLATE** (vert) : si l'URL est connue ET qu'un template de scraping correspond au domaine, l'extraction est **déterministe** (sélecteurs CSS), le LLM ne sert qu'à la rédaction. Précision maximale.

**Astuce** : si ta ligne a **uniquement une URL** (colonne \`url\`, \`URL\`, \`product_url\`…), le pipeline détecte la colonne, associe le template et lance le Mode TEMPLATE — idéal pour traiter 1000 URLs en lot.`]:
`### Enriquecer una ficha por IA

Haga clic en una fila → panel **Enriquecido por IA** a la derecha.

**Modo AUTO** (morado): si la fila tiene un \`title\`, \`brand\` o \`reference\`, una **búsqueda web (Jina) + LLM** encuentra la URL y extrae la información (modelo principal: Gemini, respaldo: Claude). Riesgo de alucinación — a priorizar cuando no se dispone de URL.

**Modo TEMPLATE** (verde): si la URL es conocida Y una plantilla de scraping coincide con el dominio, la extracción es **determinista** (selectores CSS), el LLM solo sirve para la redacción. Precisión máxima.

**Consejo**: si su fila tiene **únicamente una URL** (columna \`url\`, \`URL\`, \`product_url\`…), el pipeline detecta la columna, asocia la plantilla y lanza el Modo TEMPLATE — ideal para procesar 1000 URLs por lotes.`,

  [`### Champs structurés

Au-delà du texte simple, une fiche stocke des champs riches, tous exploitables dans le data-merge :

- **Formules Excel** : évaluées à la volée.
- **Spécifications** : \`[{ group, name, value }]\` (dimensions, matériaux…).
- **Variants** : références produit (ref, label, propriétés).
- **Documents** : liens PDF, fiches techniques, vidéos.
- **Images** : URLs ou fichiers Firebase Storage.`]:
`### Campos estructurados

Más allá del texto simple, una ficha almacena campos enriquecidos, todos explotables en la fusión de datos (data-merge):

- **Fórmulas de Excel**: evaluadas sobre la marcha.
- **Especificaciones**: \`[{ group, name, value }]\` (dimensiones, materiales…).
- **Variantes**: referencias de producto (ref, etiqueta, propiedades).
- **Documentos**: enlaces PDF, fichas técnicas, vídeos.
- **Imágenes**: URLs o archivos de Firebase Storage.`,

  [`### Champs calculés (colonnes formules)

Une colonne peut être une **formule** plutôt qu'une valeur saisie — comme dans Excel. Tu écris une expression qui référence d'autres colonnes, et la valeur se **recalcule à la volée** quand les données changent.

- Exemple : une colonne **\`Prix TTC\`** = \`Prix HT * 1.2\`, ou une **remise** = \`(Prix barré - Prix) / Prix barré\`.
- Les formules supportent les opérateurs arithmétiques, les références de colonnes et les fonctions courantes ; elles sont **réévaluées automatiquement** à chaque modification d'une cellule source ou d'une ligne enrichie par IA.
- Le résultat est un champ **comme un autre** : exploitable dans le *data-merge* (placeholder \`{{ prix_ttc }}\`), filtrable et exportable.
- Types de colonnes reconnus à l'import et à l'édition : **texte, nombre, formule, dictionnaire (liste de valeurs), date** — détectés automatiquement depuis un Excel (voir *Importer Excel*).`]:
`### Campos calculados (columnas de fórmulas)

Una columna puede ser una **fórmula** en lugar de un valor introducido manualmente, igual que en Excel. Se escribe una expresión que hace referencia a otras columnas, y el valor se **recalcula sobre la marcha** cuando los datos cambian.

- Ejemplo: una columna **\`Prix TTC\`** = \`Prix HT * 1.2\`, o un **descuento** = \`(Prix barré - Prix) / Prix barré\`.
- Las fórmulas admiten los operadores aritméticos, las referencias de columnas y las funciones habituales; se **reevalúan automáticamente** con cada modificación de una celda de origen o de una fila enriquecida por IA.
- El resultado es un campo **como cualquier otro**: utilizable en la *fusión de datos* (marcador de posición \`{{ prix_ttc }}\`), filtrable y exportable.
- Tipos de columnas reconocidos en la importación y en la edición: **texto, número, fórmula, diccionario (lista de valores), fecha**, detectados automáticamente desde un archivo Excel (véase *Importar Excel*).`,

  [`### Éditer la table comme un tableur

La table produits se manipule directement, sans quitter la page :

- **Éditer une cellule** : un clic sélectionne, un second clic (ou Entrée) passe en édition ; \`Entrée\` valide, \`Échap\` annule. La saisie est adaptée au **type de colonne** (texte, nombre, date, case à cocher…).
- **Rechercher** : la barre de recherche filtre les lignes dont **n'importe quelle valeur** contient le terme.
- **Trier** : clique l'en-tête (ou le menu de colonne) pour basculer **A→Z / Z→A**, puis annuler le tri. Les colonnes numériques proposent aussi un **tri par couleur** (zones bleu → jaune → vert selon la valeur).
- **Ajouter / supprimer une ligne** : bouton « + » en bas de table ; suppression depuis la ligne.
- **Réorganiser les colonnes** : glisse un en-tête, ou via le **menu de colonne** (← / →, première / dernière position), redimensionne par la poignée, **renomme** ou **masque** une colonne.`]:
`### Editar la tabla como una hoja de cálculo

La tabla de productos se manipula directamente, sin salir de la página:

- **Editar una celda**: un clic selecciona, un segundo clic (o Intro) pasa al modo de edición; \`Entrée\` confirma, \`Échap\` cancela. La introducción de datos se adapta al **tipo de columna** (texto, número, fecha, casilla de verificación…).
- **Buscar**: la barra de búsqueda filtra las filas en las que **cualquier valor** contiene el término.
- **Ordenar**: haga clic en el encabezado (o en el menú de columna) para alternar **A→Z / Z→A**, y luego cancelar la ordenación. Las columnas numéricas también ofrecen una **ordenación por color** (zonas azul → amarillo → verde según el valor).
- **Añadir / eliminar una fila**: botón «+» en la parte inferior de la tabla; eliminación desde la propia fila.
- **Reorganizar las columnas**: arrastre un encabezado, o mediante el **menú de columna** (← / →, primera / última posición), redimensione con el tirador, **renombre** u **oculte** una columna.`,

  [`### Types de colonnes (façon Airtable)

Le bouton **« + »** d'en-tête ouvre un sélecteur de **type de champ**, regroupés par catégorie (Texte, Nombre, Choix, Date, Lien, Autre) avec recherche. Au-delà de texte/nombre/formule, tu disposes notamment de :

- **Texte long / Texte riche**, **Téléphone**, **E-mail**, **URL**.
- **Sélection unique / multiple**, **Case à cocher**, **Évaluation** (étoiles), **Pourcentage**, **Devise**.
- **Date**, **Durée**, **Numéro automatique**, **Code-barres**, **Image / pièce jointe**, **Lien vers une autre entrée**.

Le type pilote l'affichage et l'édition de la cellule ; il est aussi **détecté automatiquement** à l'import Excel.`]:
`### Tipos de columnas (estilo Airtable)

El botón **«+»** del encabezado abre un selector de **tipo de campo**, agrupados por categoría (Texto, Número, Elección, Fecha, Enlace, Otro) con búsqueda. Más allá de texto/número/fórmula, se dispone de:

- **Texto largo / Texto enriquecido**, **Teléfono**, **E-mail**, **URL**.
- **Selección única / múltiple**, **Casilla de verificación**, **Evaluación** (estrellas), **Porcentaje**, **Divisa**.
- **Fecha**, **Duración**, **Número automático**, **Código de barras**, **Imagen / archivo adjunto**, **Enlace a otra entrada**.

El tipo controla la visualización y la edición de la celda; también se **detecta automáticamente** al importar desde Excel.`,

  [`### Statistiques de colonne

Sous l'en-tête d'une colonne numérique, des **badges Min / Moyenne / Max** résument les valeurs visibles. Cliquer **Min** trie en croissant, **Max** en décroissant — un coup d'œil suffit pour repérer prix aberrants ou champs vides.`]:
`### Estadísticas de columna

Bajo el encabezado de una columna numérica, las **insignias Mín / Media / Máx** resumen los valores visibles. Al hacer clic en **Mín** se ordena de forma ascendente, en **Máx** de forma descendente; un vistazo es suficiente para detectar precios anómalos o campos vacíos.`,

  [`### Fraîcheur par champ

Chaque valeur enrichie porte la **date de son dernier changement** (\`updatedAt\` au niveau du champ). En table, une cellule devient **ambre au-delà de 30 jours** et **rouge au-delà de 90 jours** : tu vois d'un coup d'œil quelles données sont périmées et méritent un ré-enrichissement. Re-merger une valeur identique ne rafraîchit PAS l'âge (sinon il ne voudrait rien dire).`]:
`### Frescura por campo

Cada valor enriquecido lleva la **fecha de su último cambio** (\`updatedAt\` a nivel del campo). En la tabla, una celda se vuelve **ámbar pasados los 30 días** y **roja pasados los 90 días**: se puede ver de un vistazo qué datos están obsoletos y merecen un reenriquecimiento. Volver a fusionar un valor idéntico NO actualiza la antigüedad (de lo contrario, no significaría nada).`,

  [`### Plusieurs sources dans une base

La **colonne latérale gauche** liste les **sources** d'une base (chaque import / scrape / saisie manuelle = une source). Clique une source pour **afficher/masquer ses produits** dans la table ; coche-en plusieurs pour les **fusionner à l'écran**. Chaque source se **renomme** ou se **supprime** d'un clic. Quand des fiches de sources différentes décrivent le même produit (même SKU/EAN), elles sont **fusionnées** en un produit master, et l'aperçu de fusion te montre **champ par champ** ce qui sera appliqué.`]:
`### Varias fuentes en una base

La **columna lateral izquierda** enumera las **fuentes** de una base (cada importación / extracción / entrada manual = una fuente). Haga clic en una fuente para **mostrar/ocultar sus productos** en la tabla; marque varias para **fusionarlas en la pantalla**. Cada fuente se **renombra** o se **elimina** con un clic. Cuando fichas de diferentes fuentes describen el mismo producto (mismo SKU/EAN), se **fusionan** en un producto maestro, y la vista previa de fusión muestra **campo por campo** lo que se aplicará.`,

  [`### Galerie d'images d'une fiche

Dans le panneau de fiche, les images se **réorganisent par glisser-déposer** (la première sert de visuel principal) et se **suppriment** à l'unité. Tu peux **basculer une image entre « Photos » et « Pictos & logos »** d'un clic — utile pour ne garder que les bons visuels avant un data-merge.`]:
`### Galería de imágenes de una ficha

En el panel de la ficha, las imágenes se **reorganizan arrastrando y soltando** (la primera sirve como imagen principal) y se **eliminan** individualmente. Es posible **cambiar una imagen entre «Fotos» y «Pictogramas y logotipos»** con un clic — útil para conservar solo las imágenes correctas antes de una combinación de datos.`,

  [`### Classer & exporter

- Relie une base à une **taxonomie** pour naviguer le catalogue par catégories.
- Une fois les fiches prêtes, le **data-merge** génère un document par produit à partir d'un template (PDF, PNG…).`]:
`### Clasificar y exportar

- Vincule una base a una **taxonomía** para navegar por el catálogo por categorías.
- Una vez que las fichas están listas, la **combinación de datos** genera un documento por producto a partir de una plantilla (PDF, PNG…).`,

  [`### Vue galerie

Le basculeur **tableau / galerie** (en haut à droite de la table) affiche les produits en **cartes** : visuel (colonne image détectée automatiquement), titre, prix ou marque, et pastille de complétude. Cliquer une carte ouvre la fiche. Le mode choisi est mémorisé.`]:
`### Vista galería

El interruptor **tabla / galería** (en la parte superior derecha de la tabla) muestra los productos en **tarjetas**: imagen (columna de imagen detectada automáticamente), título, precio o marca, y un indicador de completitud. Al hacer clic en una tarjeta se abre la ficha. El modo elegido se memoriza.`,

  [`### Complétude des fiches

Chaque ligne de la table porte une **pastille de complétude** : verte (≥ 90 % des colonnes remplies), ambre (≥ 60 %) ou rouge. Survole-la pour voir les **champs manquants**. La barre d'état sous la table affiche la **complétude moyenne** des lignes visibles — pratique pour prioriser l'enrichissement.`]:
`### Completitud de las fichas

Cada fila de la tabla lleva un **indicador de completitud**: verde (≥ 90 % de las columnas completadas), ámbar (≥ 60 %) o rojo. Pase el cursor sobre él para ver los **campos faltantes**. La barra de estado debajo de la tabla muestra la **completitud media** de las filas visibles — práctico para priorizar el enriquecimiento.`,

  [`### Voir aussi

L'**export en série** (data-merge) est détaillé dans la section *Export multi-format*. Le **re-skin d'un visuel** par les produits PIM est décrit dans la section *L'éditeur*.`]:
`### Véase también

La **exportación en serie** (combinación de datos) se detalla en la sección *Exportación multiformato*. El **rediseño de una imagen** mediante los productos PIM se describe en la sección *El editor*.`,

  [`Les taxonomies sont des arbres de catégories que tu attaches à tes produits ou tes projets. Elles servent à filtrer, grouper et naviguer dans de gros volumes de données.

Exemple : \`Outillage > Électroportatif > Perceuses > Visseuses-perceuses\`.`]:
`Las taxonomías son árboles de categorías que se adjuntan a los productos o proyectos. Sirven para filtrar, agrupar y navegar por grandes volúmenes de datos.

Ejemplo: \`Outillage > Électroportatif > Perceuses > Visseuses-perceuses\`.`,

  [`_Le navigateur de taxonomie : la branche active s'auto-déplie, le nœud sélectionné est mis en évidence, et chaque niveau a sa propre couleur._`]:
`_El navegador de taxonomía: la rama activa se despliega automáticamente, el nodo seleccionado se resalta y cada nivel tiene su propio color._`,

  [`### Créer une taxonomie

1. Va dans **Taxonomies** depuis le menu
2. Clique **Nouvelle taxonomie**
3. Donne-lui un nom (ex: \`Catégories produits\`)
4. Ajoute des niveaux : clique sur un nœud pour créer un enfant, glisse pour réorganiser
5. Renomme par double-clic, supprime par clic-droit

Les taxonomies sont stockées dans Firestore et synchronisées à travers tes appareils.`]:
`### Crear una taxonomía

1. Ir a **Taxonomías** desde el menú
2. Hacer clic en **Nueva taxonomía**
3. Asignarle un nombre (ej.: \`Catégories produits\`)
4. Añadir niveles: hacer clic en un nodo para crear un hijo, arrastrar para reorganizar
5. Renombrar con doble clic, eliminar con clic derecho

Las taxonomías se almacenan en Firestore y se sincronizan en todos sus dispositivos.`,

  [`### Navigation intelligente

Dès qu'une BDD source est active, le navigateur de gauche **auto-déplie** la branche correspondante et **colorise tous les ancêtres** du nœud sélectionné jusqu'à la racine. Désélectionner referme la branche. Pratique pour se repérer dans des arbres profonds (4-5 niveaux et plus).

Quand plusieurs sources matchent, l'arbre se déplie sur l'union des branches actives.`]:
`### Navegación inteligente

En cuanto una base de datos de origen está activa, el navegador izquierdo **despliega automáticamente** la rama correspondiente y **colorea todos los ancestros** del nodo seleccionado hasta la raíz. Al deseleccionar, la rama se vuelve a cerrar. Práctico para orientarse en árboles profundos (4-5 niveles o más).

Cuando coinciden varias fuentes, el árbol se despliega en la unión de las ramas activas.`,

  [`### Associer des produits à une catégorie

Dans le PIM, **chaque produit (ligne) est rattaché à un nœud** de la taxonomie. Deux voies :

- **Manuel** — sélectionne une ligne → clique **« Non classé — cliquer pour classer »** au-dessus du panneau → choisis le nœud cible. Tu peux reclasser à tout moment.
- **Automatique au scraping** — si la fiche scrapée porte un fil d'Ariane, le produit est **rangé tout seul** dans la bonne branche (voir *Auto-construction depuis le scraping* ci-dessous).

Une fois associés, les produits se **filtrent par catégorie** depuis le navigateur de gauche, et un export PDF/PPTX peut être **scopé à une branche** pour générer des sous-catalogues. Le nœud d'un produit est une donnée comme une autre : exploitable dans le *data-merge* et la complétude.`]:
`### Asociar productos a una categoría

En el PIM, **cada producto (fila) está vinculado a un nodo** de la taxonomía. Dos vías:

- **Manual** — seleccione una fila → haga clic en **«No clasificado — hacer clic para clasificar»** encima del panel → elija el nodo de destino. Puede volver a clasificar en cualquier momento.
- **Automático al hacer scraping** — si la ficha extraída contiene unas migas de pan, el producto se **clasifica por sí solo** en la rama correcta (véase *Autoconstrucción desde el scraping* a continuación).

Una vez asociados, los productos se **filtran por categoría** desde el navegador izquierdo, y un export PDF/PPTX puede **limitarse a una rama** para generar subcatálogos. El nodo de un producto es un dato como cualquier otro: utilizable en el *data-merge* y en la completitud.`,

  [`### Éditer l'arbre (nœuds)

Survole une ligne de l'arbre pour faire apparaître ses actions :

- **+** — ajoute un **nœud enfant** sous le nœud survolé
- **✏ (crayon)** — **renomme** le nœud sur place
- **🔗 (chaîne)** — **lie des projets** au nœud (visible sur les nœuds *feuilles* uniquement)
- **🗑 (corbeille)** — **supprime** le nœud (et ses descendants)

Tu peux aussi **glisser-déposer** un nœud pour le réorganiser ou le re-rattacher à un autre parent. Les actions d'édition (+, ✏, 🗑) sont réservées aux utilisateurs ayant la permission \`taxonomies.edit\` ; la liaison de projets reste accessible aux autres.`]:
`### Editar el árbol (nodos)

Pase el cursor sobre una fila del árbol para mostrar sus acciones:

- **+** — añade un **nodo hijo** bajo el nodo sobre el que se encuentra el cursor
- **✏ (lápiz)** — **renombra** el nodo en el lugar
- **🔗 (cadena)** — **vincula proyectos** al nodo (visible únicamente en los nodos *hoja*)
- **🗑 (papelera)** — **elimina** el nodo (y sus descendientes)

También puede **arrastrar y soltar** un nodo para reorganizarlo o volver a vincularlo a otro padre. Las acciones de edición (+, ✏, 🗑) están reservadas a los usuarios con el permiso \`taxonomies.edit\`; la vinculación de proyectos sigue siendo accesible para los demás.`,

  [`### Rechercher un nœud dans l'arbre

Une barre **« Rechercher un nœud… »** filtre l'arbre dès **2 caractères**. Chaque résultat affiche son **libellé + son chemin complet** (fil d'Ariane). Cliquer un résultat **déplie automatiquement** toute la branche jusqu'à ce nœud, le met en évidence et **fait défiler l'arbre** jusqu'à lui — indispensable dans les nomenclatures de plusieurs centaines d'entrées.`]:
`### Buscar un nodo en el árbol

Una barra de **«Buscar un nodo…»** filtra el árbol a partir de **2 caracteres**. Cada resultado muestra su **etiqueta + su ruta completa** (migas de pan). Al hacer clic en un resultado, se **despliega automáticamente** toda la rama hasta ese nodo, lo resalta y **desplaza el árbol** hasta él — indispensable en nomenclaturas de varios cientos de entradas.`,

  [`### Compteurs de produits par nœud

Chaque nœud affiche **combien de produits y sont rattachés**, sur deux niveaux :

- le compte **direct** (produits posés exactement sur ce nœud) ;
- le compte **cumulé**, qui agrège le nœud **et tous ses descendants** — un nœud parent totalise donc tout ce qui est rangé sous lui.

Le total général de la taxonomie est aussi calculé. Ces compteurs se rafraîchissent en direct quand tu classes ou reclasses des produits.`]:
`### Contadores de productos por nodo

Cada nodo muestra **cuántos productos están vinculados a él**, en dos niveles:

- el recuento **directo** (productos ubicados exactamente en ese nodo);
- el recuento **acumulado**, que agrega el nodo **y todos sus descendientes** — un nodo principal totaliza, por tanto, todo lo que está clasificado bajo él.

El total general de la taxonomía también se calcula. Estos contadores se actualizan en directo al clasificar o reclasificar productos.`,

  [`### Classer les produits en lot (IA)

Au lieu de ranger les lignes une par une, tu peux lancer une **classification IA en lot** : l'assistant lit le contenu de chaque ligne de la feuille active et propose le nœud le plus probable de la taxonomie cible. Deux réglages :

- **Seuil de confiance** — n'applique la classification que si l'IA est suffisamment sûre (sinon la ligne est *ignorée*).
- **Écraser les liens existants** — par défaut, les produits déjà classés sont sautés ; active l'option pour les reclasser.

Le traitement est **séquentiel avec progression pas-à-pas** (classés / ignorés / erreurs) et **annulable** à tout moment. Les lignes sans aucun signal exploitable (ni nom, ni marque…) sont écartées.`]:
`### Clasificar los productos por lotes (IA)

En lugar de organizar las filas una por una, es posible iniciar una **clasificación por IA en lote**: el asistente lee el contenido de cada fila de la hoja activa y propone el nodo más probable de la taxonomía de destino. Dos ajustes:

- **Umbral de confianza** — solo aplica la clasificación si la IA está lo suficientemente segura (de lo contrario, la fila es *ignorada*).
- **Sobrescribir los enlaces existentes** — por defecto, los productos ya clasificados se omiten; active la opción para reclasificarlos.

El procesamiento es **secuencial con progreso paso a paso** (clasificados / ignorados / errores) y **cancelable** en cualquier momento. Las filas sin ninguna señal utilizable (sin nombre, sin marca…) se descartan.`,

  [`### Importer une taxonomie depuis un fichier

Plutôt que de saisir l'arbre à la main, importe une nomenclature existante au format **.md / .txt** (indentation = hiérarchie), **.csv** ou **.xlsx**. IBS-Studio parse le fichier, te montre un **aperçu de l'arbre reconstruit** et le nombre de nœuds détectés, te laisse **nommer** la taxonomie, puis la crée d'un clic. Idéal pour reprendre une arborescence fournisseur déjà exportée d'un ERP ou d'un tableur.`]:
`### Importar una taxonomía desde un archivo

En lugar de introducir el árbol a mano, importe una nomenclatura existente en formato **.md / .txt** (indentación = jerarquía), **.csv** o **.xlsx**. IBS-Studio analiza el archivo, muestra una **vista previa del árbol reconstruido** y el número de nodos detectados, permite **nombrar** la taxonomía y, a continuación, la crea con un clic. Ideal para retomar una estructura de proveedor ya exportada desde un ERP o una hoja de cálculo.`,

  [`### Construire une taxonomie depuis les colonnes du PIM

Si ta feuille contient déjà des colonnes de catégorisation (ex. \`Famille\`, \`Sous-famille\`, \`Type\`), affecte à chacune un **niveau** (1, 2, 3…). \`buildTaxonomyFromLevels()\` parcourt alors les valeurs distinctes colonne par colonne et **reconstruit l'arbre** : niveau 1 = catégories racines, niveaux suivants = sous-nœuds rattachés par association de ligne, chaque niveau recevant sa **couleur dédiée**. C'est la voie « tableur » complémentaire de l'auto-construction par fil d'Ariane.`]:
`### Construir una taxonomía desde las columnas del PIM

Si su hoja ya contiene columnas de categorización (ej. \`Famille\`, \`Sous-famille\`, \`Type\`), asigne a cada una un **nivel** (1, 2, 3…). \`buildTaxonomyFromLevels()\` recorre entonces los valores distintos columna por columna y **reconstruye el árbol**: nivel 1 = categorías raíz, niveles siguientes = subnodos vinculados por asociación de fila, recibiendo cada nivel su **color dedicado**. Esta es la vía «hoja de cálculo» complementaria a la autoconstrucción por hilo de Ariadna.`,

  [`### Plusieurs taxonomies & gestion globale

Tu peux maintenir **plusieurs taxonomies en parallèle** (ex. une par axe d'analyse) et basculer de l'une à l'autre depuis la liste. Le menu d'une taxonomie permet de la **renommer**, la **dupliquer** (repartir d'une base existante), ouvrir ses **paramètres** (dont l'**URL de la source** de référence) et la **supprimer** entièrement. La taxonomie sélectionnée pilote ce qu'affichent le navigateur de gauche et les pickers.`]:
`### Varias taxonomías y gestión global

Es posible mantener **varias taxonomías en paralelo** (ej. una por eje de análisis) y cambiar de una a otra desde la lista. El menú de una taxonomía permite **renombrarla**, **duplicarla** (partir de una base existente), abrir sus **ajustes** (incluyendo la **URL de la fuente** de referencia) y **eliminarla** por completo. La taxonomía seleccionada controla lo que muestran el navegador izquierdo y los selectores.`,

  [`### Lier des projets (designs) à un nœud

Au-delà des produits, un nœud **feuille** peut référencer des **projets** (designs de l'éditeur). La fenêtre **« Lier des projets »** liste tes projets avec vignette et date, propose une **recherche** et des filtres **Tous / Liés / Non liés**, et permet de **tout lier / tout délier** d'un coup. Ensuite, dans la **Bibliothèque**, sélectionner un nœud filtre les projets de ce nœud **et de ses descendants** — une façon de ranger tes créations par catégorie, indépendamment du PIM.`]:
`### Vincular proyectos (diseños) a un nodo

Más allá de los productos, un nodo **hoja** puede referenciar **proyectos** (diseños del editor). La ventana **«Vincular proyectos»** enumera los proyectos con miniatura y fecha, ofrece una **búsqueda** y filtros **Todos / Vinculados / No vinculados**, y permite **vincular todo / desvincular todo** de una vez. Posteriormente, en la **Biblioteca**, al seleccionar un nodo se filtran los proyectos de dicho nodo **y de sus descendientes** — una forma de organizar las creaciones por categoría, independientemente del PIM.`,

  [`### Auto-construction depuis le scraping

Quand tu scrapes un site avec un breadcrumb (fil d'Ariane), IBS-Studio peut auto-construire une taxonomie à partir des chemins de catégorie rencontrés. Utile pour démarrer un PIM en miroir d'un site fournisseur.

Cette auto-construction est faite via \`buildTaxonomyFromLevels()\` quand l'extraction template renvoie un champ \`Fil d'ariane\`.`]:
`### Autoconstrucción desde el scraping

Al extraer datos (scraping) de un sitio con un breadcrumb (hilo de Ariadna), IBS-Studio puede autoconstruir una taxonomía a partir de las rutas de categoría encontradas. Útil para iniciar un PIM como reflejo del sitio de un proveedor.

Esta autoconstrucción se realiza mediante \`buildTaxonomyFromLevels()\` cuando la extracción de la plantilla devuelve un campo \`Fil d'ariane\`.`,

  [`### Onglet Briefs

La page Taxonomies héberge aussi l'onglet **Briefs** : décris un besoin en langage naturel, l'IA pose des questions, compose un panier de produits du catalogue et structure un deck. Détail dans la section **Briefs & génération IA**.`]:
`### Pestaña Briefs

La página Taxonomías aloja también la pestaña **Briefs**: describa un requerimiento en lenguaje natural, la IA formula preguntas, compone una cesta de productos del catálogo y estructura una presentación. Detalles en la sección **Briefs y generación por IA**.`,

  [`### Cas d'usage

- **Catalogue multi-marques** : taxonomie principale par typologie produit (Outillage / Jardin / Électroménager)
- **Multi-langues** : une taxonomie par langue, ou bien une taxonomie unique avec des labels multilingues sur les nœuds
- **Reporting** : filtrer un export PDF/PPTX par catégorie pour générer des sous-catalogues thématiques`]:
`### Casos de uso

- **Catálogo multimarca**: taxonomía principal por tipología de producto (Herramientas / Jardín / Electrodomésticos)
- **Multilingüe**: una taxonomía por idioma, o bien una taxonomía única con etiquetas multilingües en los nodos
- **Informes**: filtrar una exportación PDF/PPTX por categoría para generar subcatálogos temáticos`,

  [`Le DAM (Digital Asset Management) centralise tous tes visuels — photos de banque, images générées par IA, assets de projet — accessibles directement depuis l'éditeur. Il s'ouvre via l'onglet **DAM** du menu latéral.`]:
`El DAM (Digital Asset Management) centraliza todos los recursos visuales — fotos de banco de imágenes, imágenes generadas por IA, recursos de proyecto — accesibles directamente desde el editor. Se abre a través de la pestaña **DAM** del menú lateral.`,

  [`### Les onglets

Clique un onglet pour l'**ouvrir directement** dans le DAM.`]:
`### Las pestañas

Haga clic en una pestaña para **abrirla directamente** en el DAM.`,

  [`### Rechercher des images

- **Par texte** : barre de recherche avec **autocomplétion** et historique des recherches récentes.
- **Par image** (recherche inversée) : bouton **caméra** → choisis une image locale → le DAM trouve des visuels **similaires** dans la banque.
- **Filtres combinables** (volet de gauche) : **Source** (Toutes / Pexels / Unsplash), **Orientation** (Paysage / Portrait / Carré), **Couleur dominante** (palette de 10 teintes).`]:
`### Buscar imágenes

- **Por texto**: barra de búsqueda con **autocompletado** e historial de búsquedas recientes.
- **Por imagen** (búsqueda inversa): botón **cámara** → seleccione una imagen local → el DAM encuentra recursos visuales **similares** en el banco de imágenes.
- **Filtros combinables** (panel izquierdo): **Fuente** (Todas / Pexels / Unsplash), **Orientación** (Paisaje / Retrato / Cuadrado), **Color dominante** (paleta de 10 tonos).`,

  [`### Créer une image par IA

Onglet **Création d'image** — moteur **Image IA** (Gemini 3.1 image, texte → image). Déplie chaque paramètre :`]:
`### Crear una imagen por IA

Pestaña **Creación de imagen** — motor **Imagen IA** (Gemini 3.1 image, texto → imagen). Despliegue cada parámetro:`,

  [`### Visualiser & éditer une image

Un clic ouvre la **visionneuse** (lightbox). Outils d'édition non destructive :`]:
`### Visualizar y editar una imagen

Un clic abre el **visor** (lightbox). Herramientas de edición no destructiva:`,

  [`### Panneau d'informations & crédit photo

À droite de la visionneuse, l'onglet **Infos** récapitule la fiche technique du visuel : **dimensions** (px), **résolution** (mégapixels) et **ratio**, **poids du fichier**, **orientation**, **couleur dominante** (pastille + code hex) et espace **sRGB**, plus les **tags**.

Pour les photos de banque, le panneau affiche aussi la **source** (lien Pexels / Unsplash), le **photographe** (lien vers son profil) et l'**ID source** — l'attribution requise par ces banques est ainsi toujours accessible. Pour une image de projet, il montre à la place le **nom du fichier**.`]:
`### Panel de información y crédito fotográfico

A la derecha del visor, la pestaña **Info** resume la ficha técnica del elemento visual: **dimensiones** (px), **resolución** (megapíxeles) y **proporción**, **tamaño del archivo**, **orientación**, **color dominante** (muestra + código hex) y espacio **sRGB**, además de las **etiquetas**.

Para las fotos de banco de imágenes, el panel también muestra la **fuente** (enlace de Pexels / Unsplash), el **fotógrafo** (enlace a su perfil) y el **ID de origen** — de este modo, la atribución requerida por estos bancos siempre está accesible. Para una imagen de proyecto, muestra en su lugar el **nombre del archivo**.`,

  [`### Onglet Prompts (images IA)

Quand une image a été **générée par IA**, un onglet **Prompts** s'ajoute dans la visionneuse. Il restitue le **prompt d'origine** (ton texte brut), le **prompt amélioré** réellement envoyé à Image IA, et les **précisions Q&R** du mode « Avec questions ». Chaque prompt a un bouton **Copier** pour réutiliser le brief tel quel sur une nouvelle génération.`]:
`### Pestaña Prompts (imágenes de IA)

Cuando una imagen ha sido **generada por IA**, se añade una pestaña **Prompts** en el visor. Esta devuelve el **prompt original** (su texto sin formato), el **prompt mejorado** que realmente se envió a Imagen IA y las **aclaraciones de preguntas y respuestas** del modo «Con preguntas». Cada prompt tiene un botón **Copiar** para reutilizar el briefing tal cual en una nueva generación.`,

  [`### Variantes

Sauvegarde une retouche (crop + colorimétrie + miroir + rotation) comme **variante nommée** d'une image, sans toucher l'originale :

- **Enregistrer variante** → donne-lui un nom.
- **Charger / Mettre à jour / Renommer / Supprimer** depuis le panneau **Versions**.
- L'original reste accessible (★ Original). Pratique pour décliner un même visuel (cadrage carré pour réseaux, 16:9 pour bannière…).`]:
`### Variantes

Guarde un retoque (recorte + colorimetría + espejo + rotación) como una **variante con nombre** de una imagen, sin alterar la original:

- **Guardar variante** → asígnele un nombre.
- **Cargar / Actualizar / Renombrar / Eliminar** desde el panel **Versiones**.
- La original permanece accesible (★ Original). Práctico para adaptar un mismo elemento visual (encuadre cuadrado para redes, 16:9 para banner…).`,

  [`### Analyse IA d'une image

Dans la visionneuse, onglet **Analyse IA** → bouton **« Analyser avec IA »**. L'IA renvoie : **sujet**, description, **marques** identifiées, **texte détecté (OCR)**, ambiance / style / composition / éclairage, objets, **tags de recherche** et **palette de couleurs**. Utile pour retrouver/classer un visuel.`]:
`### Análisis de IA de una imagen

En el visor, pestaña **Análisis de IA** → botón **«Analizar con IA»**. La IA devuelve: **sujeto**, descripción, **marcas** identificadas, **texto detectado (OCR)**, ambiente / estilo / composición / iluminación, objetos, **etiquetas de búsqueda** y **paleta de colores**. Útil para encontrar/clasificar un elemento visual.`,

  [`### Tagging automatique & recherche par tags

Chaque image **sauvegardée dans Mes images** (génération IA, images du Chat) est **taguée automatiquement** en arrière-plan : tags, couleur dominante et sujet sont posés sur la fiche quelques secondes après la sauvegarde.

Dans **Mes images**, le champ **« Filtrer par tags ou description »** permet une recherche en langage naturel (ex : _bouteille verte_) — il matche les tags IA, la description et le sujet, sans tenir compte des accents.`]:
`### Etiquetado automático y búsqueda por etiquetas

Cada imagen **guardada en Mis imágenes** (generación de IA, imágenes del Chat) se **etiqueta automáticamente** en segundo plano: las etiquetas, el color dominante y el sujeto se añaden a la ficha unos segundos después de guardarla.

En **Mis imágenes**, el campo **«Filtrar por etiquetas o descripción»** permite una búsqueda en lenguaje natural (ej.: _botella verde_) — coincide con las etiquetas de IA, la descripción y el sujeto, ignorando los acentos.`,

  [`### Organiser

- **Favoris** (♥) : accès rapide.
- **Collections** : crée des dossiers, ajoute/retire des images, vue **vignettes ou liste**.
- **Projets** : retrouve les **images** et les **polices** d'un projet (deux sous-onglets avec compteurs), vue vignettes ou liste, bouton **Rafraîchir** pour recharger les assets.
- **Supprimer** une image sauvegardée la retire **en cascade** (variantes, collections, favoris).`]:
`### Organizar

- **Favoritos** (♥): acceso rápido.
- **Colecciones**: cree carpetas, añada/elimine imágenes, vista de **miniaturas o lista**.
- **Proyectos**: encuentre las **imágenes** y las **fuentes** de un proyecto (dos subpestañas con contadores), vista de miniaturas o lista, botón **Actualizar** para recargar los recursos.
- **Eliminar** una imagen guardada la retira **en cascada** (variantes, colecciones, favoritos).`,

  [`### Utiliser une image dans l'éditeur

- **Clic** : insère l'image au centre du canvas (mise à l'échelle automatique).
- **Glisser-déposer** : depuis la grille vers le canvas (équivaut à l'insertion).
- **Remplacer** : en mode sélection d'objet, **double-clic** remplace le bloc actif — l'image épouse son cadre, et l'**original + les remplacements précédents restent mémorisés** sur l'objet (rien n'est perdu).
- **Remplissage** : depuis le panneau Propriétés de l'éditeur, une image du DAM peut aussi servir de **fond** à une forme (remplissage image).`]:
`### Utilizar una imagen en el editor

- **Clic**: inserta la imagen en el centro del lienzo (escalado automático).
- **Arrastrar y soltar**: desde la cuadrícula hacia el lienzo (equivale a la inserción).
- **Reemplazar**: en modo de selección de objeto, el **doble clic** reemplaza el bloque activo — la imagen se ajusta a su marco, y el **original + los reemplazos anteriores quedan memorizados** en el objeto (no se pierde nada).
- **Relleno**: desde el panel Propiedades del editor, una imagen del DAM también puede servir como **fondo** para una forma (relleno de imagen).`,

  [`### Sources externes

- **Pexels & Unsplash** : banque intégrée (recherche + filtres).
- **Google Drive** : connecte ton compte (onglet Google Drive) pour piocher dans tes fichiers.

_Note : le DAM n'a pas d'upload « bibliothèque » classique — tes images entrent via la banque, la génération IA, les assets de projet ou Drive. Les fichiers locaux servent de **référence** pour la génération ou de cible pour la **recherche par image**._`]:
`### Fuentes externas

- **Pexels & Unsplash**: banco integrado (búsqueda + filtros).
- **Google Drive**: conecte su cuenta (pestaña Google Drive) para seleccionar sus archivos.

_Nota: el DAM no dispone de una carga de «biblioteca» clásica — las imágenes se introducen a través del banco, la generación por IA, los recursos del proyecto o Drive. Los archivos locales sirven de **referencia** para la generación o de destino para la **búsqueda por imagen**._`,

  [`### Démo express (nouveau module)

Un wizard qui **ensemence tout le studio depuis le site d'un prospect** : société + URL → découverte automatique des rayons, scraping des produits, projet PIM, images au DAM, catalogue démo, carte promo et workflow. Volumétrie réglable, **consignes créatives** pour piloter le plan du catalogue, **console journal en direct** (étapes, appels IA avec coût, bilan par fiche), re-runs idempotents.

_Détails : section **Démo express**._`]:
`### Demo exprés (nuevo módulo)

Un asistente que **nutre todo el estudio desde el sitio web de un cliente potencial**: empresa + URL → descubrimiento automático de las secciones, scraping de los productos, proyecto PIM, imágenes en el DAM, catálogo de demostración, tarjeta promocional y flujo de trabajo. Volumetría ajustable, **instrucciones creativas** para dirigir el plan del catálogo, **consola de registro en directo** (pasos, llamadas de IA con coste, balance por ficha), ejecuciones repetidas idempotentes.

_Detalles: sección **Demo exprés**._`,

  [`### Catalogue studio : fiches produit sur mesure

- **Densité des fiches** : modes **Exhaustif** (toute la donnée source, 2 fiches/page) et **Condensé** (4 fiches/page), plafonds « Puces max » / « Spécifications max » réglables.
- **Tableau « Caractéristiques »** : specs en paires nom/valeur sur 2 colonnes, bloc de disposition à part, taille et police dédiées.
- **Bandeau taxonomie (Univers › Famille)** : taille, couleur et police par niveau, réglable depuis « Prompt & style ».
- **« Taille identique sur toutes les fiches »**, **« Texte sur 2 colonnes »** pour la description, **couleurs du thème éditables**, **ruban vedette** par produit.

_Détails : section **Catalogue studio**._`]:
`### Catálogo estudio: fichas de producto a medida

- **Densidad de las fichas**: modos **Exhaustivo** (todos los datos de origen, 2 fichas/página) y **Condensado** (4 fichas/página), límites de «Viñetas máx.» / «Especificaciones máx.» ajustables.
- **Tabla «Características»**: especificaciones en pares nombre/valor en 2 columnas, bloque de diseño independiente, tamaño y fuente dedicados.
- **Franja de taxonomía (Universo › Familia)**: tamaño, color y fuente por nivel, ajustable desde «Prompt & estilo».
- **«Tamaño idéntico en todas las fichas»**, **«Texto en 2 columnas»** para la descripción, **colores del tema editables**, **cinta destacada** por producto.

_Detalles: sección **Catálogo estudio**._`,

  [`### Scraping : textes fidèles et galeries pleine résolution

- **Extraction verbatim** : les textes de la fiche (description, points forts) sont **recopiés de la source**, jamais rédigés par l'IA — structure (paragraphes, listes) préservée.
- **Galeries d'images en pleine résolution** (Adobe Scene7, galeries Magento embarquées), sans doublons ni logos/drapeaux parasites.
- **Fiches sans pollution** : menus, avis clients, footer et pages éditoriales sont écartés.

_Détails : section **Web Scraping**._`]:
`### Scraping: textos fieles y galerías a máxima resolución

- **Extracción literal**: los textos de la ficha (descripción, puntos fuertes) se **copian de la fuente**, nunca son redactados por la IA — se conserva la estructura (párrafos, listas).
- **Galerías de imágenes a máxima resolución** (Adobe Scene7, galerías Magento integradas), sin duplicados ni logotipos/banderas parásitos.
- **Fichas sin contaminación**: se descartan los menús, las opiniones de los clientes, el pie de página y las páginas editoriales.

_Detalles: sección **Web Scraping**._`,

  [`### Fréquentation & trafic (administration)

Tableau de bord d'audience **maison** (aucun tiers) dans **Utilisateurs & rôles → Analytics** : visites par période (« Aujourd'hui », 90 j, dates libres), pays et villes, journal de consultation groupé par utilisateur, **« Trafic en direct »**, **alertes Telegram** de visite, et la **PWA mobile « Pulse »**.

_Détails : section **Fréquentation & trafic**._`]:
`### Visitas y tráfico (administración)

Panel de audiencia **interno** (sin terceros) en **Usuarios y roles → Analytics**: visitas por período ("Hoy", 90 días, fechas libres), países y ciudades, registro de navegación agrupado por usuario, **"Tráfico en directo"**, **alertas de Telegram** de visita y la **PWA móvil "Pulse"**.

_Detalles: sección **Visitas y tráfico**._`,

  [`### Navigation & confort

- **Palette de commandes ⌘K / Ctrl+K** : projets récents, modules, actions rapides — depuis n'importe quelle page.
- **Centre de notifications (🔔 en bas à gauche)** : historique des runs de workflows et des exports, badge de non-lus.
- **États vides actionnables** : les écrans vides proposent désormais le prochain pas (ex : DAM vide → « Créer une image par IA »).

_Détails : section **Navigation & visites guidées**._`]:
`### Navegación y comodidad

- **Paleta de comandos ⌘K / Ctrl+K**: proyectos recientes, módulos, acciones rápidas — desde cualquier página.
- **Centro de notificaciones (🔔 abajo a la izquierda)**: historial de ejecuciones de workflows y exportaciones, indicador de no leídos.
- **Estados vacíos procesables**: las pantallas vacías ahora sugieren el siguiente paso (ej.: DAM vacío → "Crear una imagen por IA").

_Detalles: sección **Navegación y visitas guiadas**._`,

  [`### Éditeur

- **Barre contextuelle flottante** sous la sélection (dupliquer, plans, grouper, verrouiller, supprimer) + **badge temps réel** pendant les manipulations (X/Y, L×H, angle).
- **Preflight d'impression** (panneau Impression → Analyser) : images basse résolution, objets hors page, textes trop petits ou trop près du bord.
- **Éléments maîtres** : clic droit → « Répéter sur toutes les pages » (logo, pagination, mentions).
- **Kit de marque** et **styles d'objets** globaux (panneau Palette) : couleurs et styles partagés entre tous vos projets.
- **Versions** : snapshots du document avec restauration en un clic (panneau Versions).

_Détails : section **L'éditeur**._`]:
`### Editor

- **Barra contextual flotante** bajo la selección (duplicar, orden de apilamiento, agrupar, bloquear, eliminar) + **indicador en tiempo real** durante las manipulaciones (X/Y, An×Al, ángulo).
- **Preflight de impresión** (panel Impresión → Analizar): imágenes de baja resolución, objetos fuera de página, textos demasiado pequeños o demasiado cerca del borde.
- **Elementos maestros**: clic derecho → "Repetir en todas las páginas" (logotipo, paginación, avisos legales).
- **Kit de marca** y **estilos de objeto** globales (panel Paleta): colores y estilos compartidos entre todos sus proyectos.
- **Versiones**: instantáneas del documento con restauración en un clic (panel Versiones).

_Detalles: sección **El editor**._`,

  [`### Re-skin de promo (éditeur × PIM × IA)

- Source **« Produits PIM (re-skin) »** dans le panneau Données : chaque produit devient une ligne — naviguer entre les produits re-skinne le visuel instantanément.
- **« Lier automatiquement »** : prix, titre et description détectés et liés en un clic.
- **« Fond IA (Nano Banana) »** : régénère le fond d'un flyer décomposé à partir d'un prompt, sans toucher aux textes éditables.
- **« Réduire pour tenir dans la zone »** (champ texte sélectionné) : la taille du texte s'adapte à chaque produit pour ne jamais déborder. Tu définis la **zone cible** (largeur en px, et nombre de lignes max pour les descriptions) — indépendante du produit affiché.`]:
`### Re-skin de promoción (editor × PIM × IA)

- Origen **"Productos PIM (re-skin)"** en el panel Datos: cada producto se convierte en una fila — navegar entre los productos aplica el re-skin al diseño instantáneamente.
- **"Vincular automáticamente"**: precio, título y descripción detectados y vinculados en un clic.
- **"Fondo IA (Nano Banana)"**: regenera el fondo de un flyer descompuesto a partir de un prompt, sin alterar los textos editables.
- **"Reducir para ajustar al área"** (campo de texto seleccionado): el tamaño del texto se adapta a cada producto para no desbordar nunca. Se define el **área de destino** (anchura en px y número máximo de líneas para las descripciones) — independiente del producto mostrado.`,

  [`### PIM & données

- **Pastille de complétude** sur chaque ligne (champs manquants au survol) + moyenne en barre d'état.
- **Vue galerie** : produits en cartes (visuel, titre, prix, complétude).

_Détails : section **PIM**._`]:
`### PIM y datos

- **Indicador de completitud** en cada fila (campos faltantes al pasar el ratón) + media en la barra de estado.
- **Vista galería**: productos en tarjetas (imagen, título, precio, completitud).

_Detalles: sección **PIM**._`,

  [`### Workflows & automatisation

- **Galerie de modèles** 1-clic (Scraper → PIM, veille, recherche web…).
- Node **« Approbation Telegram »** : le run se met en pause jusqu'au clic ✅/❌.
- Node **« Veille prix »** : alerte seulement quand un prix bouge (fonctionne en cron serveur).
- Node **« Cron »** : planification **côté serveur** (minute → mois, heure précise, Europe/Paris) — vos workflows tournent navigateur fermé.
- **Webhook entrant** : déclenchez un workflow depuis l'extérieur (Zapier, ERP, curl).
- **Mode « Pas à pas »** : exécution node par node avec inspection des sorties.

_Détails : section **Workflows**._`]:
`### Workflows y automatización

- **Galería de plantillas** en 1 clic (Scraper → PIM, monitorización, búsqueda web…).
- Nodo **«Aprobación Telegram»**: la ejecución se pausa hasta hacer clic en ✅/❌.
- Nodo **«Monitorización de precios»**: alerta solo cuando un precio cambia (funciona en cron del servidor).
- Nodo **«Cron»**: planificación **del lado del servidor** (minuto → mes, hora exacta, Europe/Paris) — sus workflows se ejecutan con el navegador cerrado.
- **Webhook entrante**: active un workflow desde el exterior (Zapier, ERP, curl).
- **Modo «Paso a paso»**: ejecución nodo por nodo con inspección de las salidas.

_Detalles: sección **Workflows**._`,

  [`### Veille tarifaire & comparaison de prix

- Nouveau module **Veille tarifaire** : tableau de bord des prix concurrents (écarts par produit, positionnement, alertes), alimenté par le node **« Veille tarifaire »** d'un workflow.
- Modèles 1-clic **« Comparer mes prix aux concurrents → Excel »** et **« Comparaison de prix quotidienne → Google Sheets »** (cron serveur).
- **Découverte auto de la page liste** par famille produit : colle un domaine (ou rien), le node trouve la bonne page catégorie de chaque enseigne et compare les EAN.

_Détails : section **Veille tarifaire**._`]:
`### Monitorización de precios y comparación de precios

- Nuevo módulo **Monitorización de precios**: panel de control de los precios de la competencia (diferencias por producto, posicionamiento, alertas), alimentado por el nodo **«Monitorización de precios»** de un workflow.
- Plantillas en 1 clic **«Comparar mis precios con la competencia → Excel»** y **«Comparación de precios diaria → Google Sheets»** (cron del servidor).
- **Descubrimiento automático de la página de listado** por familia de productos: pegue un dominio (o nada), el nodo encuentra la página de categoría correcta de cada marca y compara los EAN.

_Detalles: sección **Monitorización de precios**._`,

  [`### Telegram sans navigateur (répondeur serveur)

- **Le bot répond app fermée** : questions avec recherche web automatique (sources citées), \`/flow\` généré **et exécuté côté serveur**, \`/run\` d'un workflow sauvegardé.
- **Google côté serveur** : connectez **« Google — accès serveur »** une fois (Paramètres → Connecteurs) → \`/flow\` peut créer des **Google Sheets** dans votre Drive et envoyer des **Gmail**, navigateur fermé.
- Seuls les workflows à **rendu graphique** (PDF, visuels) attendent l'ouverture de l'app — un message vous prévient.

_Détails : section **Telegram**._`]:
`### Telegram sin navegador (contestador del servidor)

- **El bot responde con la app cerrada**: preguntas con búsqueda web automática (fuentes citadas), \`/flow\` generado **y ejecutado del lado del servidor**, \`/run\` de un workflow guardado.
- **Google del lado del servidor**: conecte **«Google — acceso al servidor»** una vez (Ajustes → Conectores) → \`/flow\` puede crear **Google Sheets** en su Drive y enviar **Gmail**, con el navegador cerrado.
- Solo los workflows con **renderizado gráfico** (PDF, elementos visuales) esperan a que se abra la app — un mensaje le avisará.

_Detalles: sección **Telegram**._`,

  [`### DAM, Telegram & export

- **Tagging IA automatique** des images sauvegardées + **filtre en langage naturel** dans « Mes images ».
- **Digest Telegram quotidien** (opt-in, 08:00) : résumé des dernières 24 h.
- **Pack social** à l'export : carré, story, paysage et bannière en un zip.
- **Pages déclinées** à l'export : crée une page **éditable** par format (carré, story, paysage, bannière), design mis à l'échelle et centré, ajustable à la main — sans génération d'image.`]:
`### DAM, Telegram y exportación

- **Etiquetado IA automático** de las imágenes guardadas + **filtro en lenguaje natural** en «Mis imágenes».
- **Resumen diario de Telegram** (opt-in, 08:00): resumen de las últimas 24 h.
- **Pack social** en la exportación: cuadrado, story, paisaje y banner en un zip.
- **Páginas adaptadas** en la exportación: crea una página **editable** por formato (cuadrado, story, paisaje, banner), diseño escalado y centrado, ajustable a mano — sin generación de imagen.`,

  [`IDML (InDesign Markup Language) est le format d'échange officiel d'InDesign CC+. IBS-Studio parse ce format pour reconstruire la maquette dans son éditeur Fabric.js.`]:
`IDML (InDesign Markup Language) es el formato de intercambio oficial de InDesign CC+. IBS-Studio analiza este formato para reconstruir la maqueta en su editor Fabric.js.`,

  [`### Comment exporter un IDML depuis InDesign

1. Ouvre ton document dans InDesign CC ou plus récent
2. **Fichier → Exporter…**
3. Choisis le format **InDesign Markup (IDML)**
4. Enregistre

Le fichier IDML est en réalité un ZIP contenant XML + ressources (fonts, images).`]:
`### Cómo exportar un IDML desde InDesign

1. Abra su documento en InDesign CC o más reciente
2. **Archivo → Exportar…**
3. Elija el formato **InDesign Markup (IDML)**
4. Guarde

El archivo IDML es en realidad un ZIP que contiene XML + recursos (fuentes, imágenes).`,

  [`### Importe le « package », pas seulement le .idml

L'import attend un **assemblage InDesign** (Fichier → **Empaqueter…**), pas un \`.idml\` isolé :

- un **fichier \`.idml\`** *et* un **\`.pdf\` de référence** sont **obligatoires** — sans le PDF, l'import s'arrête avec « Composants manquants »
- les **polices** du dossier *Document Fonts* sont chargées **automatiquement** (via FontFace, avec lecture des métadonnées OpenType et du fichier \`AdobeFnt.lst\` pour des noms de familles et graisses exacts) — pas besoin de les installer sur la machine
- les **images** sont récupérées depuis le dossier *Links*

Le plus simple : glisse le **dossier d'empaquetage complet** (qui contient \`.idml\`, \`.pdf\`, *Document Fonts* et *Links*).`]:
`### Importe el «paquete», no solo el .idml

La importación espera un **paquete de InDesign** (Archivo → **Empaquetar…**), no un \`.idml\` aislado:

- un **archivo \`.idml\`** *y* un **\`.pdf\` de referencia** son **obligatorios** — sin el PDF, la importación se detiene con «Componentes que faltan»
- las **fuentes** de la carpeta *Document Fonts* se cargan **automáticamente** (a través de FontFace, con lectura de los metadatos OpenType y del archivo \`AdobeFnt.lst\` para obtener nombres de familias y grosores exactos) — no es necesario instalarlas en el equipo
- las **imágenes** se recuperan desde la carpeta *Links*

Lo más sencillo: arrastre la **carpeta de empaquetado completa** (que contiene \`.idml\`, \`.pdf\`, *Document Fonts* y *Links*).`,

  [`### Importer dans IBS-Studio

1. Tableau de bord → **Importer**
2. Sélectionne le \`.idml\`
3. Patiente : le parser extrait formes, textes, images, fonts, ombres et transparence — **toutes les pages** du document (chaque planche devient une page IBS-Studio)
4. Le projet s'ouvre dans l'éditeur

Sont aussi reconnus : les **gabarits (masters)** — leurs objets apparaissent en fond de chaque page —, les **cadres de texte non rectangulaires** (ovale, tracé personnalisé), la **cascade de styles** InDesign (styles de paragraphe/caractère + surcharges locales, styles imbriqués et GREP) et les liens graphiques **EPS / PDF / WMF / pages importées** en plus des images bitmap.

L'éditeur reconstitue la maquette à l'identique sur un canvas Fabric.js. Tu peux ensuite ajouter des placeholders (\`{{title}}\`, \`{{price}}\`…) pour le data-merge.`]:
`### Importar en IBS-Studio

1. Panel de control → **Importar**
2. Seleccione el \`.idml\`
3. Espere: el analizador extrae formas, textos, imágenes, fuentes, sombras y transparencia — de **todas las páginas** del documento (cada pliego se convierte en una página de IBS-Studio)
4. El proyecto se abre en el editor

También se reconocen: las **páginas maestras (masters)** — sus objetos aparecen en el fondo de cada página —, los **marcos de texto no rectangulares** (óvalo, trazado personalizado), la **cascada de estilos** de InDesign (estilos de párrafo/carácter + modificaciones locales, estilos anidados y GREP) y los enlaces gráficos **EPS / PDF / WMF / páginas importadas** además de las imágenes de mapa de bits.

El editor reconstruye la maqueta de forma idéntica sobre un lienzo de Fabric.js. A continuación, puede añadir marcadores de posición (\`{{title}}\`, \`{{price}}\`…) para la combinación de datos.`,

  [`> **Gabarit issu d'EasyCatalog ?** Ses champs sont reconnus **automatiquement** (texte → \`{{placeholders}}\`, cadres image liés) et le réexport IDML les conserve. Voir la rubrique dédiée **EasyCatalog (InDesign)**.`]:
`> **¿Plantilla proveniente de EasyCatalog?** Sus campos se reconocen **automáticamente** (texto → \`{{placeholders}}\`, marcos de imagen vinculados) y la reexportación a IDML los conserva. Consulte la sección dedicada **EasyCatalog (InDesign)**.`,

  [`### Décomposition en calques éditables

Rien n'est aplati en image : chaque objet redevient un calque manipulable dans l'éditeur.

- **Cadres de texte → bloc texte éditable** avec le **style par caractère** reconstruit : corps, couleur, **exposant/indice** (décalage de ligne de base), **approche** (tracking), **barré**, casse (tout en capitales), graisse et italique. La **cascade de styles** est résolue (style de paragraphe → de caractère → surcharges locales), y compris les **styles imbriqués** et les **styles GREP**, ainsi que les marges internes et la justification verticale du cadre.
- **Formes → objets vectoriels éditables** : rectangles (avec arrondis), ovales, lignes, et **polygones / tracés personnalisés** restitués en **courbes de Bézier**. Couleur de fond, contour (alignement intérieur/extérieur) et **ombre portée** sont conservés.
- **Images** : le **recadrage, l'échelle et le décalage** de chaque image dans son cadre sont reproduits à l'identique pour coller au placement InDesign.`]:
`### Descomposición en capas editables

Nada se acopla como imagen: cada objeto vuelve a ser una capa manipulable en el editor.

- **Marcos de texto → bloque de texto editable** con el **estilo por carácter** reconstruido: cuerpo, color, **superíndice/subíndice** (desplazamiento de línea base), **tracking**, **tachado**, mayúsculas/minúsculas (todo en mayúsculas), grosor y cursiva. La **cascada de estilos** se resuelve (estilo de párrafo → de carácter → modificaciones locales), incluyendo los **estilos anidados** y los **estilos GREP**, así como los márgenes internos y la justificación vertical del marco.
- **Formas → objetos vectoriales editables**: rectángulos (con esquinas redondeadas), óvalos, líneas y **polígonos / trazados personalizados** restituidos en **curvas de Bézier**. El color de fondo, el trazo (alineación interior/exterior) y la **sombra paralela** se conservan.
- **Imágenes**: el **recorte, la escala y el desplazamiento** de cada imagen en su marco se reproducen de forma idéntica para coincidir con la ubicación de InDesign.`,

  [`### Couleurs CMJN converties fidèlement

Les nuances CMJN sont ramenées en RVB pour l'écran. Quand InDesign a déjà stocké la valeur sRGB de la couleur (issue de sa propre conversion ICC), elle est **utilisée telle quelle**. Sinon, la conversion s'appuie sur un **modèle colorimétrique FOGRA39** (primaires Neugebauer) plutôt qu'une formule naïve — les bleus, verts et noirs profonds restent crédibles. Les nuances *Sans*/*Papier* deviennent transparent / blanc.`]:
`### Colores CMYK convertidos fielmente

Las muestras CMYK se convierten a RGB para la pantalla. Cuando InDesign ya ha almacenado el valor sRGB del color (procedente de su propia conversión ICC), este se **utiliza tal cual**. De lo contrario, la conversión se basa en un **modelo de color FOGRA39** (primarios de Neugebauer) en lugar de una fórmula básica — los azules, verdes y negros profundos siguen siendo creíbles. Las muestras *Ninguno*/*Papel* pasan a ser transparente / blanco.`,

  [`### Ce qui est préservé vs approximé à l'export

L'export IDML n'est **pas une régénération** : il **repatche le ZIP IDML d'origine**. Sont réinjectées tes modifications de **texte, image, couleur de fond, position et taille** ; tout le reste du document (styles, calques, réglages non touchés) est conservé intact. Si tu as remplacé une image, le téléchargement est un **ZIP** contenant l'\`.idml\` + un dossier \`Links/\` pour qu'InDesign retrouve les fichiers.

Côté affichage, les formats que le navigateur ne sait pas décoder (**TIF, PSD, EPS, AI**) apparaissent comme un **cadre gris nommé** (placeholder) dans l'éditeur — mais le fichier d'origine reste lié et réexporté tel quel.`]:
`### Qué se conserva frente a qué se aproxima en la exportación

La exportación IDML **no es una regeneración**: **reconstruye el ZIP IDML original**. Se reinyectan las modificaciones de **texto, imagen, color de fondo, posición y tamaño**; todo el resto del documento (estilos, capas, ajustes no modificados) se conserva intacto. Si se ha reemplazado una imagen, la descarga es un **ZIP** que contiene el \`.idml\` + una carpeta \`Links/\` para que InDesign encuentre los archivos.

En cuanto a la visualización, los formatos que el navegador no puede decodificar (**TIF, PSD, EPS, AI**) aparecen como un **marco gris con nombre** (marcador de posición) en el editor — pero el archivo original permanece vinculado y se vuelve a exportar tal cual.`,

  [`### Limites connues

- **Fonts custom** : si non installées sur la machine → fallback Arial. Pour une fidélité parfaite, charge tes fonts dans \`public/fonts/\`
- **Dégradés** : non importés — les objets dégradés reviennent en couleur unie (à recréer dans l'éditeur si besoin)
- **Effets avancés** (modes de fusion exotiques) : peuvent être approximés

Pour les cas complexes, garde InDesign comme outil de finition : exporte un IDML depuis IBS-Studio après merge, puis ouvre dans InDesign pour ajustement.`]:
`### Límites conocidos

- **Fuentes personalizadas**: si no están instaladas en el equipo → alternativa Arial. Para una fidelidad perfecta, cargue las fuentes en \`public/fonts/\`
- **Degradados**: no se importan — los objetos con degradado vuelven a un color sólido (se deben recrear en el editor si es necesario)
- **Efectos avanzados** (modos de fusión exóticos): pueden ser aproximados

Para los casos complejos, mantenga InDesign como herramienta de acabado: exporte un IDML desde IBS-Studio después de la fusión, y luego ábralo en InDesign para su ajuste.`,

  [`### Aller-retour InDesign ↔ IBS-Studio

Le cycle classique :

1. **Graphiste** crée la maquette dans InDesign
2. Exporte un IDML
3. **Imprimeur** importe dans IBS-Studio, ajoute placeholders, branche le data-merge
4. **Batch export IDML** (un par produit) ou PDF direct
5. Si finition graphique nécessaire : reimport InDesign sur les fichiers IDML générés

Pas de lock-in : tu retrouves toujours tes données en IDML standard.`]:
`### Ida y vuelta InDesign ↔ IBS-Studio

El ciclo clásico:

1. El **diseñador** crea la maqueta en InDesign
2. Exporta un IDML
3. El **impresor** lo importa en IBS-Studio, añade marcadores de posición, conecta la fusión de datos
4. **Exportación por lotes IDML** (uno por producto) o PDF directo
5. Si es necesario un acabado gráfico: reimportación en InDesign de los archivos IDML generados

Sin dependencia tecnológica: siempre recuperará sus datos en IDML estándar.`,

  [`Plutôt que de remplir manuellement chaque champ d'une fiche produit, tu peux décrire un brief en langage naturel et laisser l'IA structurer le contenu.

Exemples de briefs :
- _« Génère une description marketing de 80 mots pour ce caniveau Nicoll, ton sérieux, focus durabilité »_
- _« Résume les 12 caractéristiques techniques en 3 bullet points avantages-clients »_
- _« Traduis cette fiche en anglais britannique, ton commercial »_`]:
`En lugar de rellenar manualmente cada campo de una ficha de producto, puede describir un resumen en lenguaje natural y dejar que la IA estructure el contenido.

Ejemplos de resúmenes:
- _«Genere una descripción de marketing de 80 palabras para este canalón Nicoll, tono serio, enfoque en la durabilidad»_
- _«Resuma las 12 características técnicas en 3 viñetas de ventajas para el cliente»_
- _«Traduzca esta ficha al inglés británico, tono comercial»_`,

  [`### Modèles IA utilisés

IBS-Studio s'appuie par défaut sur :

- **Claude Opus** (Anthropic) — questions dynamiques, composition du panier et structure du deck
- **Gemini** (Google) — prompts d'images, mots-clés catalogue, génération d'images (Claude en secours)
- **Enrichissement produit** (PIM/scraping) — Gemini en principal, Claude en secours

Le modèle exact de chaque fournisseur se choisit dans _Réglages → IA_ ; le bouton **« Mettre à jour tous les LLM »** réaligne la sélection sur les dernières versions. Les clés API sont configurées dans les paramètres de l'app. Aucun envoi automatique : chaque appel est explicite (clic utilisateur).`]:
`### Modelos de IA utilizados

Por defecto, IBS-Studio se basa en:

- **Claude Opus** (Anthropic) — preguntas dinámicas, composición de la cesta y estructura de la presentación
- **Gemini** (Google) — prompts de imágenes, palabras clave del catálogo, generación de imágenes (Claude como respaldo)
- **Enriquecimiento de producto** (PIM/scraping) — Gemini como principal, Claude como respaldo

El modelo exacto de cada proveedor se elige en _Ajustes → IA_; el botón **"Actualizar todos los LLM"** realinea la selección con las últimas versiones. Las claves API se configuran en los parámetros de la aplicación. No hay envíos automáticos: cada llamada es explícita (clic del usuario).`,

  [`### Où utiliser les briefs ?

**Dans les Taxonomies** : l'onglet **Briefs** de la page Taxonomies est le panneau dédié — décris ton besoin, l'IA pose des **questions dynamiques**, compose un **panier de produits** depuis le catalogue et structure un **deck** (avec prompts d'images).

**Dans le PIM** : à la création d'une ligne ou pour réécrire un champ. Le panneau d'enrichissement IA propose une zone prompt par champ.

**Dans le scraping** : quand tu définis un schéma Map+Extract, tu peux ajouter un prompt global qui guide l'extraction. Ex: _« Les prix sont TTC. La marque est sous le titre. Ignore les accessoires liés. »_

**Dans les templates de scraping** : champ **Prompt fournisseur** propagé à tous les templates d'un même domaine. Idéal pour des contraintes communes (TVA, devise, format de référence…).`]:
`### ¿Dónde utilizar los briefs?

**En las Taxonomías**: la pestaña **Briefs** de la página Taxonomías es el panel dedicado — describa su necesidad, la IA plantea **preguntas dinámicas**, compone una **cesta de productos** desde el catálogo y estructura una **presentación** (con prompts de imágenes).

**En el PIM**: al crear una fila o para reescribir un campo. El panel de enriquecimiento de IA ofrece un área de prompt por campo.

**En el scraping**: al definir un esquema Map+Extract, se puede añadir un prompt global que guíe la extracción. Ej: _"Los precios incluyen IVA. La marca está debajo del título. Ignore los accesorios vinculados."_

**En las plantillas de scraping**: campo **Prompt de proveedor** propagado a todas las plantillas de un mismo dominio. Ideal para restricciones comunes (IVA, divisa, formato de referencia…).`,

  [`### L'assistant brief en 5 étapes

Dans les Taxonomies, ouvrir un brief lance un **assistant guidé** qui transforme un besoin client en proposition commerciale livrable :

1. **Formulaire client** — coordonnées et identité de marque (nom, logo, couleurs primaire/secondaire, brand kit).
2. **Questions dynamiques** — l'IA lit le formulaire + la nomenclature et **génère des questions sur mesure** ; elle pré-sélectionne aussi les familles de produits pertinentes (les identifiants inventés sont automatiquement écartés).
3. **Panier produits** — l'IA compose un panier depuis le catalogue à partir des réponses.
4. **Deck** — l'IA esquisse la structure de la présentation et génère les visuels.
5. **Export** — téléchargement du PPTX et clôture du brief.

Chaque brief mémorise son **étape courante** et son **statut** (_brouillon → formulaire → panier → deck → terminé_) : on peut fermer et reprendre exactement où on s'était arrêté, sans rien relancer. Tout est persisté dans Firestore (collection \`briefs\`).`]:
`### El asistente de brief en 5 pasos

En las Taxonomías, abrir un brief inicia un **asistente guiado** que transforma una necesidad del cliente en una propuesta comercial entregable:

1. **Formulario de cliente** — datos de contacto e identidad de marca (nombre, logotipo, colores primario/secundario, kit de marca).
2. **Preguntas dinámicas** — la IA lee el formulario + la nomenclatura y **genera preguntas a medida**; también preselecciona las familias de productos pertinentes (los identificadores inventados se descartan automáticamente).
3. **Cesta de productos** — la IA compone una cesta desde el catálogo a partir de las respuestas.
4. **Presentación** — la IA esboza la estructura de la presentación y genera los elementos visuales.
5. **Exportación** — descarga del PPTX y cierre del brief.

Cada brief memoriza su **paso actual** y su **estado** (_borrador → formulario → cesta → presentación → terminado_): se puede cerrar y retomar exactamente donde se dejó, sin reiniciar nada. Todo se persiste en Firestore (colección \`briefs\`).`,

  [`### Comment l'IA compose le panier

À la première arrivée sur l'étape Panier, la génération **démarre automatiquement** (panier vide + aucun journal antérieur). Le pipeline est traçable en direct via un **journal de génération** :

- Si la nomenclature porte une **URL source**, l'IA extrait des mots-clés du brief puis **scrape le site** pour bâtir le catalogue candidat. Sans URL source — ou si le scraping échoue / ne renvoie rien — bascule automatique sur un catalogue de démonstration.
- L'IA sélectionne des produits et **justifie** chaque choix.
- **Garde-fous anti-hallucination** : les SKU absents du catalogue sont rejetés, avec une 2e tentative si l'écart est trop grand ; les produits hors des familles jugées pertinentes sont écartés (sauf catalogue scrapé non structuré). Un avertissement indique combien de SKU ont été ignorés.

Le **journal est conservé** sur le brief : revenir sur l'étape l'affiche tel quel sans relancer la génération. Pour reprendre la main, le bouton **Régénérer** relance le pipeline.`]:
`### Cómo la IA compone la cesta

Al llegar por primera vez a la etapa Cesta, la generación **se inicia automáticamente** (cesta vacía + ningún registro anterior). El pipeline se puede seguir en directo a través de un **registro de generación**:

- Si la nomenclatura incluye una **URL de origen**, la IA extrae palabras clave del brief y luego **hace scraping del sitio** para construir el catálogo candidato. Sin URL de origen —o si el scraping falla / no devuelve nada— se pasa automáticamente a un catálogo de demostración.
- La IA selecciona productos y **justifica** cada elección.
- **Mecanismos de seguridad antihalucinación**: los SKU ausentes del catálogo son rechazados, con un segundo intento si la diferencia es demasiado grande; los productos fuera de las familias consideradas pertinentes son descartados (excepto en catálogos scrapeados no estructurados). Una advertencia indica cuántos SKU han sido ignorados.

El **registro se conserva** en el brief: al volver a la etapa, se muestra tal cual sin reiniciar la generación. Para retomar el control, el botón **Regenerar** reinicia el pipeline.`,

  [`### Éditer et exporter le panier

Le panier généré reste **entièrement modifiable, ligne par ligne** : quantités, ajout/retrait de produits, et surtout un **prix appliqué** qui peut surcharger le prix catalogue d'origine (les deux sont conservés). Une **remise globale** en pourcentage ou en montant fixe se règle dans le récapitulatif ; le sous-total et le total estimé se recalculent en direct.

Le bouton **CSV** exporte le panier (SKU, nom, quantité, prix unitaire, prix appliqué, total ligne) — pratique pour un devis ou un ré-import. La validation de l'étape enregistre le panier, la remise et le total estimé sur le brief.`]:
`### Editar y exportar la cesta

La cesta generada sigue siendo **totalmente modificable, línea por línea**: cantidades, añadir/quitar productos, y sobre todo un **precio aplicado** que puede sobrescribir el precio de catálogo original (ambos se conservan). Un **descuento global** en porcentaje o en importe fijo se ajusta en el resumen; el subtotal y el total estimado se recalculan en directo.

El botón **CSV** exporta la cesta (SKU, nombre, cantidad, precio unitario, precio aplicado, total de línea) — práctico para un presupuesto o una reimportación. La validación de la etapa guarda la cesta, el descuento y el total estimado en el brief.`,

  [`### Deck et export PPTX

L'IA esquisse un **deck** composé de slides typées : couverture, contexte, **grille de produits** (layout 2×2 / 3×2 / 1×3), focus produit, **budget** (total + détail) et appel à l'action. Les SKU cités qui ne sont plus au panier sont automatiquement retirés.

Pour les **visuels**, le bouton « Générer toutes les images » produit en lot : une image **héros**, une **scène de mise en situation** (staging) et une image par produit du panier (via Image IA / Gemini, stockées dans Firebase Storage). Les images orphelines sont purgées quand le panier change.

L'export construit un **PPTX réellement habillé à la marque du client** (logo, couleurs primaire/secondaire, bandeau, images en letterbox). Le fichier est téléchargé **et** archivé dans Storage ; le brief passe au statut _terminé_ avec un lien vers le PPTX.`]:
`### Deck y exportación PPTX

La IA esboza un **deck** compuesto por diapositivas tipificadas: portada, contexto, **cuadrícula de productos** (diseño 2×2 / 3×2 / 1×3), enfoque de producto, **presupuesto** (total + desglose) y llamada a la acción. Los SKU citados que ya no están en la cesta se retiran automáticamente.

Para los **elementos visuales**, el botón "Generar todas las imágenes" produce en lote: una imagen **héroe**, una **escena de ambientación** (staging) y una imagen por producto de la cesta (a través de Image IA / Gemini, almacenadas en Firebase Storage). Las imágenes huérfanas se purgan cuando la cesta cambia.

La exportación construye un **PPTX realmente adaptado a la marca del cliente** (logotipo, colores primario/secundario, banner, imágenes en formato letterbox). El archivo se descarga **y** se archiva en Storage; el brief pasa al estado _terminado_ con un enlace al PPTX.`,

  [`### Génération d'images

Le DAM intègre la génération d'images via Gemini (modèle image dit « Image IA »). Tu décris une image en français ou en anglais, l'IA produit un visuel utilisable directement dans tes templates.

Cas d'usage : visuels d'ambiance, mockups, illustrations éditoriales. Pour des photos produits réelles, scraping et upload restent prioritaires.`]:
`### Generación de imágenes

El DAM integra la generación de imágenes a través de Gemini (modelo de imagen denominado "Image IA"). Se describe una imagen en francés o en inglés, y la IA produce un elemento visual utilizable directamente en las plantillas.

Casos de uso: imágenes de ambiente, mockups, ilustraciones editoriales. Para fotos de productos reales, el scraping y la subida siguen siendo prioritarios.`,

  [`### Limites des briefs

- L'IA peut **halluciner** des références ou caractéristiques. Toujours vérifier le résultat avant publication, surtout sur les chiffres et les normes.
- Les briefs sont stateless : aucune mémoire conversationnelle. Si tu veux raffiner, refais le brief avec plus de contexte.
- Le coût en tokens est facturé à l'usage. Privilégie les **templates de scraping** (déterministes, gratuits) pour les flux récurrents et garde les briefs pour le travail créatif.`]:
`### Límites de los briefs

- La IA puede **alucinar** referencias o características. Compruebe siempre el resultado antes de la publicación, especialmente en las cifras y las normativas.
- Los briefs son stateless: no hay memoria conversacional. Si desea refinar, vuelva a hacer el brief con más contexto.
- El coste en tokens se factura por uso. Priorice las **plantillas de scraping** (deterministas, gratuitas) para los flujos recurrentes y reserve los briefs para el trabajo creativo.`,

  [`Un **template de scraping** décrit comment extraire les champs d'un site fournisseur : un **domaine**, un **pattern d'URL** et des **sélecteurs CSS** par champ. Une fois enregistré, il matche automatiquement toutes les futures URLs du domaine — extraction **déterministe**, sans hallucination ni tokens IA.`]:
`Una **plantilla de scraping** describe cómo extraer los campos de un sitio proveedor: un **dominio**, un **patrón de URL** y **selectores CSS** por campo. Una vez guardada, coincide automáticamente con todas las futuras URL del dominio — extracción **determinista**, sin alucinaciones ni tokens de IA.`,

  [`### L'éditeur de template

- **Nouveau** crée un template : nom, domaine (\`nicoll.fr\`), pattern d'URL (\`.*\` pour tout matcher).
- Onglet **Pointer & cliquer** : charge une URL produit dans l'aperçu, puis **double-clique** sur le titre, le prix, la description… le sélecteur CSS se génère tout seul.
- Onglet **Avancé (JSON)** : édite le template en JSON brut pour les cas pointus.
- **Tester sur une URL** : lance l'extraction réelle et affiche un **score** (≥ 20 = OK) champ par champ avant d'enregistrer.
- **Exporter / Importer** : sauvegarde et partage les templates en JSON.`]:
`### El editor de plantillas

- **Nuevo** crea una plantilla: nombre, dominio (\`nicoll.fr\`), patrón de URL (\`.*\` para coincidir con todo).
- Pestaña **Apuntar y hacer clic**: carga una URL de producto en la vista previa, luego **haga doble clic** en el título, el precio, la descripción… el selector CSS se genera por sí solo.
- Pestaña **Avanzado (JSON)**: edita la plantilla en JSON sin procesar para los casos complejos.
- **Probar en una URL**: inicia la extracción real y muestra una **puntuación** (≥ 20 = OK) campo por campo antes de guardar.
- **Exportar / Importar**: guarda y comparte las plantillas en JSON.`,

  [`### Trois niveaux de prompts IA

En complément des sélecteurs, trois prompts optionnels guident le post-traitement LLM :

- **Prompt global** (du template) : instructions de reformatage pour tous les produits de ce template — ex. _« retirer le heading H1 de la description »_, _« les specs sont dans les accordéons »_.
- **Prompt fournisseur** : **partagé par tous les templates du même domaine** (modifié à un endroit, propagé partout) — ex. _« les prix sont TTC, ne pas convertir »_.
- **Prompt par champ** : post-traitement ciblé d'un seul champ (traduction, normalisation d'unité…).`]:
`### Tres niveles de prompts de IA

Como complemento a los selectores, tres prompts opcionales guían el posprocesamiento LLM:

- **Prompt global** (de la plantilla): instrucciones de reformateo para todos los productos de esta plantilla — ej. _«eliminar el encabezado H1 de la descripción»_, _«las especificaciones están en los acordeones»_.
- **Prompt de proveedor**: **compartido por todas las plantillas del mismo dominio** (se modifica en un lugar, se propaga a todas partes) — ej. _«los precios incluyen IVA, no convertir»_.
- **Prompt por campo**: posprocesamiento específico de un solo campo (traducción, normalización de unidades…).`,

  [`### Cinq types de sélecteurs

Au-delà du CSS classique, chaque champ accepte plusieurs **stratégies** testées dans l'ordre — on garde la **première valeur non vide**, ce qui rend le template robuste quand le fournisseur change son CSS :

- **CSS** : sélecteur standard, lit le texte (ou un attribut).
- **XPath** : pour les structures que le CSS n'atteint pas.
- **Attribut** (\`selector@@attr\`) : lit \`src\`, \`href\`, \`data-*\`… (ex. \`img@@src\`).
- **Texte (regex)** : applique une expression régulière sur tout le texte de la page (utile pour un EAN ou une référence noyés).
- **Texte hiérarchisé** : rend le contenu d'un onglet/section en **Markdown** (titres \`#/##/###\`, listes, tables \`clé | valeur\`) au lieu d'un bloc plat — pour livrer au LLM une vue structurée fidèle (règle universelle de scraping nº 3).`]:
`### Cinco tipos de selectores

Más allá del CSS clásico, cada campo acepta varias **estrategias** probadas en orden — se conserva el **primer valor no vacío**, lo que hace que la plantilla sea robusta cuando el proveedor cambia su CSS:

- **CSS**: selector estándar, lee el texto (o un atributo).
- **XPath**: para las estructuras que el CSS no alcanza.
- **Atributo** (\`selector@@attr\`): lee \`src\`, \`href\`, \`data-*\`… (ej. \`img@@src\`).
- **Texto (regex)**: aplica una expresión regular sobre todo el texto de la página (útil para un EAN o una referencia ocultos).
- **Texto jerarquizado**: renderiza el contenido de una pestaña/sección en **Markdown** (títulos \`#/##/###\`, listas, tablas \`clé | valeur\`) en lugar de un bloque plano — para entregar al LLM una vista estructurada fiel (regla universal de scraping nº 3).`,

  [`### Transformations & specs KEY/VALUE

- **Transformations par champ** : \`trim\`, \`normalize-whitespace\`, \`uppercase\`/\`lowercase\`, \`parse-number\`, \`parse-price\` (isole le nombre d'un prix), \`absolutize-url\` (chemin relatif → URL absolue, posé automatiquement quand on capture un \`src\`/\`href\`), \`decode-html\`.
- **Groupes de specs (KEY/VALUE)** : un sélecteur de **conteneur** + **titre de groupe** + **ligne** + **clé** + **valeur** extrait les caractéristiques techniques en paires propres (ex. _Dimensions → Poids : 2,3 kg_), organisées par section.
- **Documents PDF** : pointer le conteneur des liens suffit — tous les \`<a href>\` PDF sont collectés au format \`titre##url\`, **noms de fichiers conservés**.
- **Listes intelligentes** : pour un champ « liste » (images, avantages, variantes), si le sélecteur ne matche qu'un seul conteneur, l'engine **éclate automatiquement** ses enfants (\`li\`, \`p\`, \`div\`…) ou découpe le texte par puces — pas besoin de cibler chaque item. Les **variantes** lues dans un \`<table>\` sont pivotées en réf./libellé/propriétés.`]:
`### Transformaciones & specs KEY/VALUE

- **Transformaciones por campo**: \`trim\`, \`normalize-whitespace\`, \`uppercase\`/\`lowercase\`, \`parse-number\`, \`parse-price\` (aísla el número de un precio), \`absolutize-url\` (ruta relativa → URL absoluta, aplicada automáticamente al capturar un \`src\`/\`href\`), \`decode-html\`.
- **Grupos de specs (KEY/VALUE)**: un selector de **contenedor** + **título de grupo** + **fila** + **clave** + **valor** extrae las características técnicas en pares limpios (ej. _Dimensiones → Peso: 2,3 kg_), organizadas por sección.
- **Documentos PDF**: apuntar al contenedor de los enlaces es suficiente — todos los \`<a href>\` PDF se recopilan en formato \`título##url\`, con los **nombres de archivo conservados**.
- **Listas inteligentes**: para un campo «lista» (imágenes, ventajas, variantes), si el selector coincide con un solo contenedor, el motor **desglosa automáticamente** sus hijos (\`li\`, \`p\`, \`div\`…) o divide el texto por viñetas — no es necesario apuntar a cada elemento. Las **variantes** leídas en un \`<table>\` se pivotan en ref./etiqueta/propiedades.`,

  [`### Pré-actions & capture via extension Chrome

- **Pré-actions** (onglet Avancé) : avant la capture du DOM, on peut enchaîner \`click\` (déplier un accordéon/onglet), \`scroll\`, \`wait\`, \`waitForSelector\` et \`acceptCookies\` (auto-détection du bandeau) — indispensable pour les fiches dont les specs sont derrière un dépliant.
- **Aperçu sans CORS** : « Charger » récupère le HTML via la **Cloud Function \`fetchPageHtml\`** (serveur, sans CORS), avec repli sur des proxies publics. Les sites SPA à challenge anti-bot passent par l'**extension Chrome** : bouton _« Ouvrir dans Chrome & tagger »_ ouvre l'URL dans un vrai onglet et capture les sélecteurs au double-clic, polices et JS réels chargés.
- Dans l'iframe d'aperçu : **double-clic** = capturer un élément, **simple-clic** = naviguer (ouvrir un accordéon, changer d'onglet) avant de capturer.`]:
`### Acciones previas & captura mediante extensión de Chrome

- **Acciones previas** (pestaña Avanzado): antes de capturar el DOM, se pueden encadenar \`click\` (desplegar un acordeón/pestaña), \`scroll\`, \`wait\`, \`waitForSelector\` y \`acceptCookies\` (detección automática del banner) — indispensable para las fichas cuyas specs están detrás de un desplegable.
- **Vista previa sin CORS**: «Cargar» recupera el HTML a través de la **Cloud Function \`fetchPageHtml\`** (servidor, sin CORS), con respaldo en proxies públicos. Los sitios SPA con desafío anti-bot pasan por la **extensión de Chrome**: el botón _«Abrir en Chrome & etiquetar»_ abre la URL en una pestaña real y captura los selectores al hacer doble clic, con las fuentes y el JS reales cargados.
- En el iframe de vista previa: **doble clic** = capturar un elemento, **clic simple** = navegar (abrir un acordeón, cambiar de pestaña) antes de capturar.`,

  [`### Ordre des champs & alias de marque (niveau fournisseur)

- **Ordre des champs** : réorganiser les champs par glisser-déposer fixe leur ordre d'affichage dans l'enrichissement — **partagé entre tous les templates du même domaine**.
- **Alias de marque** : si l'auto-association marque ⇔ domaine échoue, déclarer un alias (ex. domaine \`somatherm-outillage.fr\` + alias \`Somatherm\`) force les produits dont la colonne _Marque_ vaut « Somatherm » à matcher ce template.
- **Score d'extraction** : le test note titre (+10), description ≥ 40 car. (+8), images (+5, +3 au-delà de 3), documents (+3) et jusqu'à +20 pour les specs. **≥ 20 = OK** (vert), 10–19 = partiel, < 10 = faible — c'est ce seuil qui décide si l'enrichissement fait confiance au template ou bascule sur le LLM.`]:
`### Orden de los campos & alias de marca (nivel proveedor)

- **Orden de los campos**: reorganizar los campos arrastrando y soltando fija su orden de visualización en el enriquecimiento — **compartido entre todos los plantillas del mismo dominio**.
- **Alias de marca**: si la asociación automática marca ⇔ dominio falla, declarar un alias (ej. dominio \`somatherm-outillage.fr\` + alias \`Somatherm\`) fuerza a los productos cuya columna _Marca_ es «Somatherm» a coincidir con esta plantilla.
- **Puntuación de extracción**: la prueba puntúa título (+10), descripción ≥ 40 car. (+8), imágenes (+5, +3 más allá de 3), documentos (+3) y hasta +20 para las specs. **≥ 20 = OK** (verde), 10–19 = parcial, < 10 = débil — este umbral es el que decide si el enriquecimiento confía en la plantilla o recurre al LLM.`,

  [`### Statistiques d'usage

Chaque template trace son nombre d'**applications** et de **succès** — un template au taux de succès en chute signale un site qui a changé de structure (sélecteurs à re-pointer).`]:
`### Estadísticas de uso

Cada plantilla rastrea su número de **aplicaciones** y de **éxitos** — una plantilla con una tasa de éxito en caída señala un sitio que ha cambiado de estructura (los selectores deben volver a apuntarse).`,

  [`### Voir aussi

La vue d'ensemble par fournisseur (templates groupés par domaine) est dans le **Scraping Hub**. Le mode d'emploi général du scraping (quel mode choisir, Map + Extract, limites anti-bot) est dans la section **Scraping produits**.`]:
`### Véase también

La vista general por proveedor (plantillas agrupadas por dominio) se encuentra en el **Scraping Hub**. Las instrucciones generales de scraping (qué modo elegir, Map + Extract, límites anti-bot) están en la sección **Scraping de productos**.`,

  [`Le module **Animation** produit des **animations HTML/CSS/JS autonomes** — un ZIP prêt à ouvrir dans un navigateur, à héberger ou à intégrer dans un e-mail. Pas de codec vidéo, pas de montage : tout est décrit par l'IA puis rendu en mouvement.`]:
`El módulo **Animación** produce **animaciones HTML/CSS/JS autónomas** — un ZIP listo para abrir en un navegador, alojar o integrar en un correo electrónico. Sin códecs de vídeo, sin edición: la IA lo describe todo y luego se renderiza en movimiento.`,

  [`### Deux façons de créer`]:
`### Dos formas de crear`,

  [`### Format et durée

- **Ratio** : Auto, portrait (9:16), carré (1:1), paysage (16:9) ou **dimensions personnalisées** (largeur × hauteur, 240 à 4096 px, ratio affiché en direct).
- **Durée** : 5, 10 (défaut), 15, 30 s ou **valeur libre de 3 à 60 s** — en mode brief, l'IA ajuste le nombre et la longueur des scènes pour tenir la durée cible.
- **Instructions libres** : champ texte optionnel (ex. _« rythme énergique, transitions punchy, palette néon »_), interprété par l'IA en **palette, rythme et intensité** ; le détail du style appliqué (pace, intensity, easing, couleurs, mood) s'affiche sous le résultat.
- **Effacer** réinitialise le formulaire ; **Stop** (bouton rouge pendant la génération) annule le rendu en cours.`]:
`### Formato y duración

- **Ratio**: Auto, vertical (9:16), cuadrado (1:1), horizontal (16:9) o **dimensiones personalizadas** (anchura × altura, 240 a 4096 px, ratio mostrado en directo).
- **Duración**: 5, 10 (por defecto), 15, 30 s o **valor libre de 3 a 60 s** — en modo brief, la IA ajusta el número y la longitud de las escenas para alcanzar la duración objetivo.
- **Instrucciones libres**: campo de texto opcional (ej. _«ritmo enérgico, transiciones punchy, paleta neón»_), interpretado por la IA como **paleta, ritmo e intensidad**; el detalle del estilo aplicado (pace, intensity, easing, colores, mood) se muestra debajo del resultado.
- **Borrar** restablece el formulario; **Stop** (botón rojo durante la generación) cancela el renderizado en curso.`,

  [`### Enrichir et finaliser

- **Enrichir avec des images IA** : l'IA génère un visuel par scène (affiché en fond, effet Ken Burns).
- **Aperçu live** : le lecteur joue la composition avec le style appliqué (rythme, intensité, easing, palette).
- **Télécharger (.zip)** : récupère l'animation HTML autonome.
- **Sauvegarder dans le DAM** : l'animation rejoint la bibliothèque (onglet *Animations HTML*), réouvrable et re-téléchargeable.`]:
`### Enriquecer y finalizar

- **Enriquecer con imágenes de IA**: la IA genera un elemento visual por escena (mostrado de fondo, efecto Ken Burns).
- **Vista previa en vivo**: el reproductor reproduce la composición con el estilo aplicado (ritmo, intensidad, easing, paleta).
- **Descargar (.zip)**: obtiene la animación HTML autónoma.
- **Guardar en el DAM**: la animación se añade a la biblioteca (pestaña *Animaciones HTML*), donde se puede volver a abrir y descargar.`,

  [`### Le ZIP est une animation autonome et jouable

Le \`index.html\` est **self-contained** (CSS, JS, données et auto-play tout inline) : double-clique-le, il s'ouvre même en \`file://\`, sans serveur. Le ZIP contient aussi un \`README.md\` (mode d'emploi) et un \`vars.json\` (les variables — composition, marque, caption, style — à titre informatif).

À l'ouverture, l'animation **boucle automatiquement** et une **barre de contrôle flottante** apparaît en bas :

- **Fit** (touche \`0\`) adapte à la fenêtre · **100 %** (touche \`1\`) affiche en taille réelle pixel-perfect.
- **+ / −** (ou \`Ctrl/Cmd + molette\`) zooment ; **Espace + glisser** (ou clic du milieu) fait un panoramique.
- **P** met en pause / reprend ; **double-clic** redémarre l'animation.

> GSAP est chargé depuis un CDN public : une **connexion internet** est nécessaire à la première lecture.`]:
`### El ZIP es una animación autónoma y reproducible

El \`index.html\` es **self-contained** (CSS, JS, datos y auto-play todo inline): haga doble clic en él, se abre incluso en \`file://\`, sin servidor. El ZIP también contiene un \`README.md\` (instrucciones) y un \`vars.json\` (las variables — composición, marca, caption, estilo — a título informativo).

Al abrirse, la animación **se repite en bucle automáticamente** y aparece una **barra de control flotante** en la parte inferior:

- **Fit** (tecla \`0\`) se adapta a la ventana · **100 %** (tecla \`1\`) se muestra en tamaño real pixel-perfect.
- **+ / −** (o \`Ctrl/Cmd + rueda del ratón\`) hacen zoom; **Espacio + arrastrar** (o clic central) hace una panorámica.
- **P** pausa / reanuda; **doble clic** reinicia la animación.

> GSAP se carga desde un CDN público: es necesaria una **conexión a internet** para la primera reproducción.`,

  [`### Gérer ses animations dans le DAM

Dans l'onglet *Animations HTML* du DAM, chaque carte affiche le **ratio**, le **poids** et la **date** :

- **Ouvrir** joue l'animation dans un nouvel onglet (le ZIP est extrait à la volée, l'\`index.html\` est servi tel quel).
- **Télécharger ZIP** récupère le fichier (nommé d'après le titre, sinon marque/caption).
- **Renommer** en cliquant le titre (crayon), **Supprimer** via la corbeille.`]:
`### Gestionar sus animaciones en el DAM

En la pestaña *Animaciones HTML* del DAM, cada tarjeta muestra el **ratio**, el **peso** y la **fecha**:

- **Abrir** reproduce la animación en una nueva pestaña (el ZIP se extrae sobre la marcha, el \`index.html\` se sirve tal cual).
- **Descargar ZIP** obtiene el archivo (nombrado según el título, de lo contrario marca/caption).
- **Renombrar** haciendo clic en el título (lápiz), **Eliminar** mediante la papelera.`,

  [`### Bibliothèque de prompts

Chaque génération mémorise son brief : tu peux le **rejouer**, le **charger** pour l'ajuster, le **renommer** ou le **supprimer** — pour produire des variantes sans tout ressaisir.`]:
`### Biblioteca de prompts

Cada generación memoriza su brief: puede **volver a ejecutarlo**, **cargarlo** para ajustarlo, **renombrarlo** o **eliminarlo** — para producir variantes sin tener que volver a introducir todo.`,

  [`### Voir aussi

La génération s'appuie sur les modèles IA configurés dans les **Paramètres → IA**. Les visuels de scène utilisent le moteur de génération d'image (Image IA), le même que dans le DAM et le Chat IA.`]:
`### Véase también

La generación se basa en los modelos de IA configurados en los **Ajustes → IA**. Los elementos visuales de la escena utilizan el motor de generación de imágenes (Imagen IA), el mismo que en el DAM y el Chat IA.`,

  [`La **Démo express** ensemence un environnement de démonstration complet à partir du site web d'un prospect. Un seul formulaire — la société et l'URL de son site — déclenche un pipeline en huit étapes : **Charte graphique du site** → **Découverte des produits** → **Enrichissement des fiches** → **Images → DAM (Google Drive)** → **Feuille PIM** → **Catalogue studio** → **Fiche promo** → **Workflow personnalisé**. À l'arrivée, le panneau **« Découvrez vos données »** relie chaque artefact créé à son module. Comptez quelques minutes (~30 s à 1 min par fiche).`]:
`La **Demo exprés** inicializa un entorno de demostración completo a partir del sitio web de un cliente potencial. Un único formulario — la empresa y la URL de su sitio — desencadena un pipeline de ocho pasos: **Identidad visual del sitio** → **Descubrimiento de productos** → **Enriquecimiento de fichas** → **Imágenes → DAM (Google Drive)** → **Hoja PIM** → **Estudio de catálogos** → **Ficha promocional** → **Flujo de trabajo personalizado**. Al finalizar, el panel **«Descubra sus datos»** enlaza cada artefacto creado con su módulo. Calcule unos minutos (~30 s a 1 min por ficha).`,

  [`### Lancer une démo pas à pas

1. Renseignez la **Société du prospect** (ex. *Jardiland*) et le **Site du prospect** : l'adresse d'accueil suffit, la démo descend toute seule dans les rayons du site et échantillonne les produits répartis sur ses univers.
2. Choisissez le **Nombre de produits à scraper** : boutons **6 / 12 / 24 / 48 produits**, ou la valeur exacte de votre choix (champ « ou exactement », de 1 à 48). Plus de produits = démo plus riche mais plus longue.
3. Ajoutez si besoin des **Consignes créatives** (optionnel) — voir ci-dessous.
4. Cliquez **Lancer la démo**. La checklist des huit étapes s'anime en direct (spinner, coche verte, avertissement ambre, erreur, étape sautée) avec le détail de l'étape en cours (« 3/12 — Perceuse GBH 5-40 »).

Un bouton **Arrêter** est disponible pendant le run : l'arrêt se fait proprement **à la fin de l'item en cours** (« Arrêt en cours (fin de l'item)… »), et tout ce qui a déjà été produit est conservé. Depuis le menu des modules, l'entrée « Scraper N produits » ouvre directement le formulaire avec la volumétrie préremplie.`]:
`### Iniciar una demo paso a paso

1. Rellene la **Empresa del cliente potencial** (ej. *Jardiland*) y el **Sitio del cliente potencial**: la dirección de inicio es suficiente, la demo desciende por sí sola a las secciones del sitio y toma muestras de los productos repartidos por sus universos.
2. Elija el **Número de productos a extraer**: botones **6 / 12 / 24 / 48 productos**, o el valor exacto de su elección (campo «o exactamente», de 1 a 48). Más productos = demo más completa pero más larga.
3. Añada si es necesario **Instrucciones creativas** (opcional) — véase más abajo.
4. Haga clic en **Iniciar la demo**. La lista de verificación de los ocho pasos se anima en directo (indicador de carga, marca de verificación verde, advertencia ámbar, error, paso omitido) con el detalle del paso en curso («3/12 — Taladro GBH 5-40»).

Un botón **Detener** está disponible durante la ejecución: la detención se realiza de forma limpia **al final del elemento en curso** («Deteniendo (fin del elemento)…»), y se conserva todo lo que ya se ha producido. Desde el menú de los módulos, la entrada «Extraer N productos» abre directamente el formulario con el volumen prerrellenado.`,

  [`### Découverte automatique des rayons (et étage anti-bot)

Vous donnez l'**URL de base** du site, pas une page de listing. Si l'accueil est un « hub » sans cartes produit, la démo **descend automatiquement dans les rubriques du menu** et prélève quelques produits par rayon, pour couvrir la taxonomie du prospect. Le rendu instable des boutiques SPA est couvert par une **seconde tentative de découverte** automatique. Face à une protection anti-bot (DataDome, Akamai…), le pipeline **escalade vers Bright Data** : la page d'accueil puis les rayons sont relus via le connecteur, et la charte graphique est même récupérée depuis l'\`og:image\` du site si l'analyse directe a échoué. Les URLs à l'évidence non-produit (cookies, actualités, concours…) sont écartées **avant** l'enrichissement, pour ne pas perdre ~1 minute par page parasite.`]:
`### Descubrimiento automático de secciones (y nivel antibot)

Debe proporcionar la **URL base** del sitio, no una página de listado. Si la página de inicio es un «hub» sin tarjetas de producto, la demo **desciende automáticamente por las secciones del menú** y extrae algunos productos por categoría, para cubrir la taxonomía del cliente potencial. La inestabilidad de renderizado de las tiendas SPA se cubre con un **segundo intento de descubrimiento** automático. Ante una protección antibot (DataDome, Akamai…), el pipeline **escala a Bright Data**: la página de inicio y luego las secciones se vuelven a leer a través del conector, y la identidad visual se recupera incluso desde la etiqueta \`og:image\` del sitio si el análisis directo ha fallado. Las URL que evidentemente no son de productos (cookies, noticias, concursos…) se descartan **antes** del enriquecimiento, para no perder ~1 minuto por página irrelevante.`,

  [`### Enrichissement des fiches : le vrai moteur PIM

Chaque page produit repérée passe dans le **moteur d'enrichissement du PIM** (le même que le module Scraping) : nom, description, référence, spécifications, prix, EAN, images… Les pages **éditoriales** (landing métier, guide) ne sont pas jetées : la démo y **redescend** jusqu'à deux niveaux (métier → gamme → produit) pour récupérer de vraies fiches. Chaque fiche aboutie s'affiche dans le journal avec son **bilan** : référence, nombre de specs, nombre d'images, prix et EAN réellement obtenus — une fiche creuse se repère immédiatement.`]:
`### Enriquecimiento de las fichas: el verdadero motor PIM

Cada página de producto detectada pasa por el **motor de enriquecimiento del PIM** (el mismo que el módulo Scraping): nombre, descripción, referencia, especificaciones, precio, EAN, imágenes… Las páginas **editoriales** (landing profesional, guía) no se descartan: la demo **desciende** por ellas hasta dos niveles (profesional → gama → producto) para recuperar fichas reales. Cada ficha completada se muestra en el registro con su **balance**: referencia, número de especificaciones, número de imágenes, precio y EAN realmente obtenidos — una ficha vacía se detecta inmediatamente.`,

  [`### Consignes créatives : pilotez le plan du catalogue

Le champ **Consignes créatives** (optionnel) pilote le **plan créatif du catalogue** généré par l'IA : mise en page, densité, ambiance, couverture (ex. *« catalogue premium épuré, fiches en liste pleine largeur, couverture ambiance jardin d'été »*). La **charte du site reste prioritaire pour les couleurs** : palette et consignes extraites du site du prospect sont injectées à part dans le plan. Le brief est persisté dans le catalogue, donc itérable ensuite dans le Catalogue studio. Les fiches du catalogue démo sont en **pleine page** (1 produit/page), seule surface qui garantit 100 % des avantages et du tableau de specs sur les produits riches. Une **couverture IA** est générée en bonus ; en cas d'échec, la couverture typographique est conservée.`]:
`### Instrucciones creativas: controle el plan del catálogo

El campo **Instrucciones creativas** (opcional) controla el **plan creativo del catálogo** generado por la IA: diseño, densidad, ambiente, cubierta (ej. *«catálogo premium depurado, fichas en lista de ancho completo, cubierta con ambiente de jardín de verano»*). El **manual de identidad del sitio sigue siendo prioritario para los colores**: la paleta y las instrucciones extraídas del sitio del cliente potencial se inyectan por separado en el plan. El briefing se guarda en el catálogo, por lo que se puede iterar posteriormente en el Catalogue studio. Las fichas del catálogo de demostración son a **página completa** (1 producto/página), la única superficie que garantiza el 100 % de las ventajas y de la tabla de especificaciones en los productos ricos. Se genera una **cubierta IA** como bonificación; en caso de fallo, se conserva la cubierta tipográfica.`,

  [`### Journal live : une console fixée en bas de l'écran

Pendant le run, un **Journal** façon terminal est fixé en bas de l'écran (repliable d'un clic, barre de défilement visible). Chaque ligne est horodatée et typée par couleur : **étape** (actions du pipeline, bilans de fiches en vert), **IA** (chaque appel terminé avec fournisseur, modèle, tâche, durée et coût en dollars), **connecteur** (Jina, Bright Data, Drive DAM…) et **erreur**. Le défilement automatique suit la dernière ligne, mais ne vous interrompt jamais quand vous remontez lire l'historique. Le journal conserve les 600 dernières lignes.`]:
`### Registro en vivo: una consola fijada en la parte inferior de la pantalla

Durante la ejecución, un **Registro** tipo terminal se fija en la parte inferior de la pantalla (plegable con un clic, barra de desplazamiento visible). Cada línea tiene marca de tiempo y se clasifica por color: **paso** (acciones del pipeline, balances de fichas en verde), **IA** (cada llamada finalizada con proveedor, modelo, tarea, duración y coste en dólares), **conector** (Jina, Bright Data, Drive DAM…) y **error**. El desplazamiento automático sigue la última línea, pero nunca interrumpe cuando se desplaza hacia arriba para leer el historial. El registro conserva las últimas 600 líneas.`,

  [`### « Découvrez vos données » : tout est relié

À la fin du run, une carte par module ensemencé permet d'ouvrir directement le résultat :`]:
`### «Descubra sus datos»: todo está conectado

Al final de la ejecución, una tarjeta por módulo sembrado permite abrir directamente el resultado:`,

  [`### Bon à savoir

- **Échec franc plutôt que catalogue parasite** : sans la moindre fiche à identité produit (référence/EAN — ou prix + vraies specs), la démo n'ensemence **rien** et vous invite à essayer une URL de rayon ou de fiche produit. Un catalogue « politique de confidentialité » est pire que vide.
- **Re-runs idempotents** : relancer une démo pour la même société **remplace** les artefacts « Démo {Société} » existants (feuille PIM, catalogue, fiche promo, workflow) et **réutilise** les images déjà déposées dans le Drive — pas de doublons empilés, pas de quota re-consommé.
- **Chaque étape est tolérante** : un échec la marque en erreur ou avertissement et la suite continue avec ce qui a réussi (un catalogue sans images DAM reste un catalogue).
- **Quotas du rôle démo** : sur un compte démo, les plafonds s'appliquent — 50 produits PIM et 20 images DAM (le maximum du formulaire est d'ailleurs 48 produits).`]:
`### Conviene saber

- **Fallo directo en lugar de catálogo basura**: sin una sola ficha con identidad de producto (referencia/EAN — o precio + especificaciones reales), la demo no genera **nada** y le invita a probar una URL de sección o de ficha de producto. Un catálogo de «política de privacidad» es peor que uno vacío.
- **Ejecuciones repetidas idempotentes**: volver a lanzar una demo para la misma empresa **reemplaza** los artefactos «Demo {Empresa}» existentes (hoja PIM, catálogo, ficha promocional, workflow) y **reutiliza** las imágenes ya depositadas en el Drive — sin duplicados acumulados, sin cuota consumida dos veces.
- **Cada paso es tolerante**: un fallo lo marca como error o advertencia y el resto continúa con lo que ha tenido éxito (un catálogo sin imágenes DAM sigue siendo un catálogo).
- **Cuotas del rol demo**: en una cuenta demo, se aplican los límites — 50 productos PIM y 20 imágenes DAM (el máximo del formulario es, de todos modos, 48 productos).`,

  [`Chaque objet (texte, image, forme, calque) peut porter ses propres **règles conditionnelles**. Une règle dit : **SI** un champ de ta source remplit une condition, **ALORS** applique une action visuelle à cet objet. Les règles sont évaluées **ligne par ligne** au publipostage, donc le même gabarit se décline tout seul : selon la valeur de chaque produit, l'élément se montre, se cache ou change d'aspect.

C'est l'équivalent natif des actions conditionnelles d'**EasyCatalog**, sans plug-in payant. Combinée au **balisage XML InDesign** (ou à EasyCatalog) pour brancher la base, c'est l'**alternative complète** à un flux print piloté par données.

> Les règles sont **réversibles** : elles ne modifient pas l'objet de façon permanente. Pour les lignes où la condition n'est pas remplie, l'apparence d'origine (visibilité, couleur, opacité, taille, ordre) est restaurée.`]:
`Cada objeto (texto, imagen, forma, capa) puede llevar sus propias **reglas condicionales**. Una regla dice: **SI** un campo de su fuente cumple una condición, **ENTONCES** aplique una acción visual a este objeto. Las reglas se evalúan **fila por fila** durante la combinación de correspondencia, por lo que la misma plantilla varía por sí sola: dependiendo del valor de cada producto, el elemento se muestra, se oculta o cambia de aspecto.

Es el equivalente nativo de las acciones condicionales de **EasyCatalog**, sin un plug-in de pago. Combinado con el **etiquetado XML InDesign** (o con EasyCatalog) para conectar la base de datos, es la **alternativa completa** a un flujo de impresión basado en datos.

> Las reglas son **reversibles**: no modifican el objeto de forma permanente. Para las filas donde no se cumple la condición, se restaura la apariencia original (visibilidad, color, opacidad, tamaño, orden).`,

  [`### Ouvrir le panneau

1. Sélectionne un objet sur le canvas.
2. Dans la colonne de droite, ouvre le panneau **Propriétés**, puis déplie la section **Règles conditionnelles** (icône branche). Un compteur indique le nombre de règles actives sur l'objet.
3. Clique **Ajouter une règle**.

> Tu peux configurer des règles **même sans connexion live** à la source : les champs disponibles proviennent alors du schéma de la dernière source utilisée. Reconnecte la source pour voir l'aperçu se rejouer en direct.`]:
`### Abrir el panel

1. Seleccione un objeto en el lienzo.
2. En la columna derecha, abra el panel **Propiedades**, luego despliegue la sección **Reglas condicionales** (icono de rama). Un contador indica el número de reglas activas en el objeto.
3. Haga clic en **Añadir una regla**.

> Puede configurar reglas **incluso sin conexión en vivo** a la fuente: los campos disponibles provienen entonces del esquema de la última fuente utilizada. Vuelva a conectar la fuente para ver la vista previa reproducirse en directo.`,

  [`### Composer une règle : SI champ → opérateur → valeur → ALORS action

Chaque règle se lit de gauche à droite :

- **Champ** : la colonne de données testée (ex. \`promo\`, \`stock\`, \`Prix_normal\`).
- **Opérateur** : la condition à vérifier (voir ci-dessous).
- **Valeur** : la valeur de comparaison (masquée pour les opérateurs de présence).
- **Action** : l'effet appliqué à l'objet quand la condition est vraie.`]:
`### Componer una regla: SI campo → operador → valor → ENTONCES acción

Cada regla se lee de izquierda a derecha:

- **Campo**: la columna de datos evaluada (ej. \`promo\`, \`stock\`, \`Prix_normal\`).
- **Operador**: la condición a verificar (ver a continuación).
- **Valor**: el valor de comparación (oculto para los operadores de presencia).
- **Acción**: el efecto aplicado al objeto cuando la condición es verdadera.`,

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
`### Los operadores (3 familias)

**Texto** (comparación insensible a mayúsculas/minúsculas y a los espacios al principio/final):
- **Contiene** / **No contiene**
- **Es** / **No es** (igualdad exacta de cadena)
- **Empieza por** / **Termina por**
- **No empieza por** / **No termina por**

**Presencia** (sin valor que introducir):
- **Está vacío** / **No está vacío** — perfecto para «mostrar el banner solo si la columna de promoción está rellenada».

**Numérico** (el valor se convierte en número, tolerando divisas y el formato FR: \`84,99 DT\`, \`1 234,56 €\`, \`100€,00\`):
- **Es mayor que** / **Al menos** (≥)
- **Es menor que** / **No más de** (≤)
- **Es igual a** / **No es igual a**

> Nota: **Es** (texto) y **Es igual a** (numérico) son deliberadamente distintos, como en EasyCatalog. Una comparación numérica en una celda que no se puede cifrar simplemente se considera como no rellenada.`,

  [`### Les actions (7)

- **Cacher** : l'objet n'est pas rendu (ni à l'écran, ni à l'export).
- **Montrer** : force l'affichage.
- **Mettre en avant** / **Mettre à l'arrière** : réordonne l'objet dans la pile (z-order).
- **Changer la couleur** : remplit l'objet avec la couleur choisie.
- **Changer l'opacité** : applique une transparence (0 à 1).
- **Changer la taille** : multiplie la taille par un facteur (ex. \`1,5\` = +50 %).

> Pense à renseigner le paramètre de l'action (couleur, opacité, facteur) : une action « nue » n'a aucun effet visible.`]:
`### Las acciones (7)

- **Ocultar**: el objeto no se renderiza (ni en pantalla, ni en la exportación).
- **Mostrar**: fuerza la visualización.
- **Traer al frente** / **Enviar al fondo**: reordena el objeto en la pila (z-order).
- **Cambiar el color**: rellena el objeto con el color elegido.
- **Cambiar la opacidad**: aplica una transparencia (0 a 1).
- **Cambiar el tamaño**: multiplica el tamaño por un factor (ej. \`1,5\` = +50 %).

> Recuerde rellenar el parámetro de la acción (color, opacidad, factor): una acción «desnuda» no tiene ningún efecto visible.`,

  [`### Aperçu et plusieurs règles

Quand une **source est connectée**, l'effet se rejoue **en direct** sur la ligne courante : ajoute ou modifie une règle et le canvas se met à jour aussitôt. Utilise les flèches **◀ ▶** du panneau Publipostage pour parcourir les lignes et vérifier le rendu produit par produit.

Tu peux empiler **plusieurs règles** sur un même objet :

- elles sont évaluées **dans l'ordre** ;
- pour une même propriété, **la dernière règle qui matche l'emporte** (ex. deux règles « Changer la couleur » → la seconde gagne) ;
- exception : **Changer la taille** est **cumulatif** (les facteurs se multiplient).`]:
`### Vista previa y múltiples reglas

Cuando una **fuente está conectada**, el efecto se reproduce **en directo** en la fila actual: añada o modifique una regla y el lienzo se actualizará de inmediato. Utilice las flechas **◀ ▶** del panel Combinación de correspondencia para recorrer las filas y comprobar la visualización producto por producto.

Se pueden apilar **varias reglas** en un mismo objeto:

- se evalúan **en orden**;
- para una misma propiedad, **la última regla que coincida prevalece** (ej. dos reglas «Cambiar el color» → la segunda gana);
- excepción: **Cambiar el tamaño** es **acumulativo** (los factores se multiplican).`,

  [`Le module **Workflows** chaîne les fonctions de IBS-Studio (import, scraping, IA, transformation, export, envoi) dans un **graphe visuel**. Chaque **node** est une brique ; tu les relies par leurs ports (entrées/sorties typés).`]:
`El módulo **Flujos de trabajo** encadena las funciones de IBS-Studio (importación, scraping, IA, transformación, exportación, envío) en un **grafo visual**. Cada **nodo** es un bloque; se conectan a través de sus puertos (entradas/salidas tipadas).`,

  [`### Deux façons de construire

- **Manuel** : glisse les nodes depuis la palette (à gauche), relie-les, configure chacun (panneau de droite), puis **Run**.
- **IA (Prompt-to-Flow)** : bouton **« Générer (IA) »** → décris ton besoin en langage naturel, un LLM construit le graphe complet (nodes + liaisons + config) à partir du catalogue. Disponible aussi via \`/flow\` sur Telegram.

La **palette est progressive** : commence par un node **Import** (source), puis enrichis / transforme / sauvegarde / exporte / communique.`]:
`### Dos formas de construir

- **Manual**: arrastre los nodos desde la paleta (a la izquierda), conéctelos, configure cada uno (panel derecho) y luego **Run**.
- **IA (Prompt-to-Flow)**: botón **«Generar (IA)»** → describa su necesidad en lenguaje natural, un LLM construye el grafo completo (nodos + enlaces + configuración) a partir del catálogo. También disponible a través de \`/flow\` en Telegram.

La **paleta es progresiva**: comience por un nodo **Import** (fuente), luego enriquezca / transforme / guarde / exporte / comunique.`,

  [`### Catalogue des nodes

Déplie une catégorie pour voir ses nodes.`]:
`### Catálogo de nodos

Despliegue una categoría para ver sus nodos.`,

  [`### Node « Web Scraping » unifié

Un **seul node** \`Web Scraping\` couvre toutes les façons de ramener des données du web, via un **sélecteur de Mode** :

- **Scrape** — une ou plusieurs URLs → champs produit (Jina + IA).
- **Liste** — pages catégorie → liste de produits.
- **Crawl** — découverte de fiches sur un site (côté client).
- **Recherche web** — requête → pages lues + tableau de résultats.
- **Question web (IA)** — question → réponse synthétisée + sources.

Le formulaire s'adapte au mode choisi ; tu n'as donc pas à hésiter entre quatre nodes différents.`]:
`### Nodo «Web Scraping» unificado

Un **único nodo** \`Web Scraping\` cubre todas las formas de extraer datos de la web, a través de un **selector de Modo**:

- **Scrape** — una o varias URLs → campos de producto (Jina + IA).
- **Lista** — páginas de categoría → lista de productos.
- **Crawl** — descubrimiento de fichas en un sitio (lado del cliente).
- **Búsqueda web** — consulta → páginas leídas + tabla de resultados.
- **Pregunta web (IA)** — pregunta → respuesta sintetizada + fuentes.

El formulario se adapta al modo elegido; por lo tanto, no hay que dudar entre cuatro nodos diferentes.`,

  [`### Node « Graphique »

Le node **« Graphique »** transforme un tableau en **image de graphe** (PNG, via chart.js). Choisis le **type** — **Barres, Lignes, Aire, Camembert, Anneau** — la **colonne d'axe X**, la ou les **colonnes de valeurs** et une **agrégation** facultative. Il sort à la fois le graphe, l'**asset image** (réutilisable par un Export design ou un envoi Telegram/Gmail) et le **fichier PNG**.

Pour un Google Sheets, pas besoin de ce node : le node **Export Google Sheets** propose une case **« Insérer un graphique »** qui ajoute un graphe **natif** dans la feuille (type, colonne X, colonnes de valeurs).`]:
`### Nodo «Gráfico»

El nodo **«Gráfico»** transforma una tabla en **imagen de gráfico** (PNG, vía chart.js). Elija el **tipo** — **Barras, Líneas, Área, Circular, Anillo** — la **columna del eje X**, la o las **columnas de valores** y una **agregación** opcional. Produce a la vez el gráfico, el **asset de imagen** (reutilizable por un Exportar diseño o un envío Telegram/Gmail) y el **archivo PNG**.

Para un Google Sheets, no es necesario este nodo: el nodo **Exportar Google Sheets** ofrece una casilla **«Insertar un gráfico»** que añade un gráfico **nativo** en la hoja (tipo, columna X, columnas de valores).`,

  [`### Écran « Résultat »

Le bouton **« Résultat »** dans l'en-tête de l'éditeur ouvre une page dédiée (\`/workflows/:id/result\`) qui **visualise le dernier run** sous la forme la plus pertinente : **Tableau de bord**, **Tableau**, **Graphique**, **Galerie** (images), **Document** ou **Données** (JSON). Le sélecteur en haut permet de basculer de vue, **« Régénérer avec l'IA »** recompose un tableau de bord avec insights, et tout l'écran s'**exporte en PNG ou PDF**.`]:
`### Pantalla «Resultado»

El botón **«Resultado»** en el encabezado del editor abre una página dedicada (\`/workflows/:id/result\`) que **visualiza la última ejecución** en el formato más pertinente: **Panel de control**, **Tabla**, **Gráfico**, **Galería** (imágenes), **Documento** o **Datos** (JSON). El selector superior permite cambiar de vista, **«Regenerar con IA»** recompone un panel de control con insights, y toda la pantalla se **exporta en PNG o PDF**.`,

  [`### Mes modèles (modèles personnalisés)

Au-delà de la galerie prête à l'emploi, tu peux **enregistrer ton propre montage** : le bouton **« Modèle »** dans l'éditeur sauvegarde le graphe courant comme modèle réutilisable (création ou mise à jour). Tous tes modèles apparaissent dans la section **« Mes modèles »** de la page Workflows, où tu peux **les réutiliser** (un clic crée un workflow), **éditer leurs infos** ou **les supprimer**. Stockés par compte (\`users/{uid}/workflowTemplates\`).`]:
`### Mis plantillas (plantillas personalizadas)

Más allá de la galería lista para usar, es posible **guardar su propio montaje**: el botón **«Plantilla»** en el editor guarda el gráfico actual como plantilla reutilizable (creación o actualización). Todas sus plantillas aparecen en la sección **«Mis plantillas»** de la página Workflows, donde puede **reutilizarlas** (un clic crea un workflow), **editar su información** o **eliminarlas**. Almacenadas por cuenta (\`users/{uid}/workflowTemplates\`).`,

  [`### Arrêter un run serveur (STOP)

Un workflow lancé par le **cron** ou un **webhook** tourne sans navigateur. Le panneau d'état du Cron affiche alors un bouton rouge **STOP** : il pose un **drapeau d'abandon** que l'exécuteur serveur **interroge en continu** et le run s'arrête sous quelques secondes — sans avoir à attendre la fin du node en cours.`]:
`### Detener una ejecución de servidor (STOP)

Un workflow iniciado por el **cron** o un **webhook** se ejecuta sin navegador. El panel de estado del Cron muestra entonces un botón rojo **STOP**: establece una **bandera de cancelación** que el ejecutor del servidor **consulta continuamente** y la ejecución se detiene en unos segundos — sin tener que esperar el final del nodo en curso.`,

  [`### Exemples de pipelines

- **Veille** : Recherche web → Export Excel → Envoyer via Gmail.
- **Réponse sourcée** : Question web (IA) → Envoyer via Telegram.
- **Fiches produit** : Scrape URL → Enrichissement → Save PIM → Export PPTX.
- **Batch** : Upload (Excel d'URLs) → Enrichissement → Save DAM.`]:
`### Ejemplos de pipelines

- **Monitorización**: Búsqueda web → Exportar Excel → Enviar vía Gmail.
- **Respuesta documentada**: Pregunta web (IA) → Enviar vía Telegram.
- **Fichas de producto**: Scrape URL → Enriquecimiento → Guardar PIM → Exportar PPTX.
- **Lote**: Upload (Excel de URLs) → Enriquecimiento → Guardar DAM.`,

  [`_Les nodes IA (Scrape, Enrichissement, Décomposer, Génération de workflow, Question web) routent automatiquement vers un modèle adapté et à jour — aucun réglage de modèle à faire._`]:
`_Los nodos de IA (Scrape, Enriquecimiento, Descomponer, Generación de workflow, Pregunta web) se enrutan automáticamente hacia un modelo adaptado y actualizado — no hay que realizar ningún ajuste de modelo._`,

  [`### Piloter depuis Telegram

Les workflows se déclenchent aussi à distance : \`/flow <demande>\` génère et exécute un workflow, \`/run <nom>\` rejoue un workflow sauvegardé — et le fichier produit revient sur Telegram.`]:
`### Controlar desde Telegram

Los workflows también se activan a distancia: \`/flow <demande>\` genera y ejecuta un workflow, \`/run <nom>\` vuelve a ejecutar un workflow guardado — y el archivo producido regresa a Telegram.`,

  [`### Modèles prêts à l'emploi

La page Workflows propose une galerie **« Démarrer depuis un modèle »** : Scraper un site → PIM, Veille quotidienne → Telegram (cron), Scrape → approbation ✅ → PIM, Recherche web → Excel, **Veille tarifaire (matrice concurrents)** — tes produits comparés chez plusieurs concurrents (appariement SKU/EAN puis nom), tableau de bord « Veille tarifaire » rempli et alerte Telegram seulement si un concurrent est moins cher ou a bougé. Un clic crée le workflow complet — il ne reste qu'à coller tes URLs et choisir le projet cible.`]:
`### Plantillas listas para usar

La página Workflows ofrece una galería **«Iniciar desde una plantilla»**: Scrapear un sitio → PIM, Monitorización diaria → Telegram (cron), Scrape → aprobación ✅ → PIM, Búsqueda web → Excel, **Monitorización de precios (matriz de competidores)** — sus productos comparados en varios competidores (emparejamiento SKU/EAN y luego nombre), panel de control «Monitorización de precios» rellenado y alerta de Telegram solo si un competidor es más barato o ha cambiado. Un clic crea el workflow completo — solo queda pegar sus URLs y elegir el proyecto de destino.`,

  [`### Approbation humaine (Telegram)

Le node **« Approbation Telegram »** met le run en pause et envoie la question sur Telegram avec des boutons **✅ Approuver / ❌ Refuser**. Le workflow reprend sur le port \`approved\` ou \`rejected\` selon le clic — idéal pour valider un PDF ou un import avant publication.

- Délai maximal configurable ; à expiration : échec du run ou refus automatique.
- Le chat doit être dans l'**allowlist du webhook** (Réglages → Telegram), sinon les clics sont ignorés.`]:
`### Aprobación humana (Telegram)

El nodo **«Aprobación Telegram»** pausa el run y envía la pregunta por Telegram con botones **✅ Aprobar / ❌ Rechazar**. El workflow se reanuda en el puerto \`approved\` o \`rejected\` según el clic — ideal para validar un PDF o una importación antes de la publicación.

- Plazo máximo configurable; al expirar: fallo del run o rechazo automático.
- El chat debe estar en la **allowlist del webhook** (Ajustes → Telegram), de lo contrario se ignoran los clics.`,

  [`### Veille prix

Le node **« Veille prix »** mémorise les prix du run précédent (par identifiant de suivi) et n'émet le port \`changes\` **que si un prix a varié** au-delà du seuil — les lignes émises portent \`ancien_prix\`, \`nouveau_prix\` et \`variation_pct\`, prêtes pour un message Telegram (« 1 message par ligne »). Un second port \`all\` émet **toutes** les lignes à chaque run (pour archiver un relevé complet, par exemple). Le premier relevé est silencieux, et **aucun message n'est envoyé** quand rien n'a bougé. Fonctionne aussi en **cron serveur** (sans navigateur ouvert). Modèle prêt à l'emploi : **Veille prix → alerte Telegram** (cron quotidien).`]:
`### Monitorización de precios

El nodo **«Monitorización de precios»** memoriza los precios del run anterior (por identificador de seguimiento) y solo emite el puerto \`changes\` **si un precio ha variado** más allá del umbral — las líneas emitidas llevan \`ancien_prix\`, \`nouveau_prix\` y \`variation_pct\`, listas para un mensaje de Telegram («1 mensaje por línea»). Un segundo puerto \`all\` emite **todas** las líneas en cada run (para archivar un registro completo, por ejemplo). El primer registro es silencioso, y **no se envía ningún mensaje** cuando nada ha cambiado. Funciona también en **cron servidor** (sin navegador abierto). Plantilla lista para usar: **Monitorización de precios → alerta Telegram** (cron diario).`,

  [`### Planifier (cron serveur)

Le node **« Cron »** exécute le workflow **côté serveur, navigateur fermé** : cadence à la **minute, heure, jour, semaine ou mois**, heure précise **HH:MM**, jour de semaine ciblé ou **« Tous les jours »** — fuseau **Europe/Paris**, granularité minimale 1 minute. Active **« Planification »** dans le node puis **sauvegarde** le workflow pour armer le cron ; l'éditeur affiche l'état et le compte à rebours du prochain run, et chaque exécution apparaît dans l'historique.

- **Compatibles serveur** : Scrape URL, Recherche web, Enrichissement IA, Saisie texte, toutes les **transformations** (Définir colonnes, Filtrer, Trier, Renommer, Opération texte), la **logique** (If/Else, Pipe, Loop each/collect), Save PIM, Veille prix, Envoyer via Telegram — et, après connexion **« Google — accès serveur »** (Paramètres → Connecteurs), **Export Google Sheets** et **Envoyer via Gmail**.
- **Nécessitent le navigateur** : rendus graphiques (PDF, Excel, PPTX, génération d'image, décomposition SVG, Export design), imports de fichiers locaux (Upload, IDML/SVG/PPTX/image), Import/Export Google Drive côté client, Save DAM et Approbation Telegram — un run serveur qui en contient s'arrête avec un message explicite.`]:
`### Planificar (cron de servidor)

El nodo **«Cron»** ejecuta el flujo de trabajo **del lado del servidor, con el navegador cerrado**: cadencia por **minuto, hora, día, semana o mes**, hora exacta **HH:MM**, día de la semana específico o **«Todos los días»** — zona horaria **Europe/Paris**, granularidad mínima de 1 minuto. Active **«Planificación»** en el nodo y luego **guarde** el flujo de trabajo para armar el cron; el editor muestra el estado y la cuenta atrás para la próxima ejecución, y cada ejecución aparece en el historial.

- **Compatibles con el servidor**: Scrape URL, Búsqueda web, Enriquecimiento IA, Entrada de texto, todas las **transformaciones** (Definir columnas, Filtrar, Ordenar, Renombrar, Operación de texto), la **lógica** (If/Else, Pipe, Loop each/collect), Guardar en PIM, Vigilancia de precios, Enviar por Telegram — y, tras la conexión **«Google — acceso al servidor»** (Ajustes → Conectores), **Exportación a Google Sheets** y **Enviar por Gmail**.
- **Requieren el navegador**: renderizados gráficos (PDF, Excel, PPTX, generación de imágenes, descomposición SVG, Exportación de diseño), importaciones de archivos locales (Upload, IDML/SVG/PPTX/imagen), Importación/Exportación de Google Drive del lado del cliente, Guardar en DAM y Aprobación de Telegram — una ejecución de servidor que contenga alguno de estos se detiene con un mensaje explícito.`,

  [`### Webhook entrant (déclenchement externe)

Le bouton **Webhook** dans l'en-tête de l'éditeur génère une **URL secrète** pour déclencher ce workflow depuis l'extérieur (Zapier, Make, un ERP, un simple \`curl\`) :

\`\`\`
curl -X POST -H "X-Webhook-Secret: <secret>" "<URL>?id=<workflowId>"
\`\`\`

L'exécution se fait **côté serveur** (mêmes nodes que le cron) et apparaît dans l'historique des runs. Le secret se régénère à tout moment ; désactiver le webhook coupe immédiatement l'accès.`]:
`### Webhook entrante (activación externa)

El botón **Webhook** en el encabezado del editor genera una **URL secreta** para activar este flujo de trabajo desde el exterior (Zapier, Make, un ERP, un simple \`curl\`):

\`\`\`
curl -X POST -H "X-Webhook-Secret: <secret>" "<URL>?id=<workflowId>"
\`\`\`

La ejecución se realiza **del lado del servidor** (los mismos nodos que el cron) y aparece en el historial de ejecuciones. El secreto se puede regenerar en cualquier momento; desactivar el webhook corta inmediatamente el acceso.`,

  [`### Débugger pas à pas

Le bouton **« Pas à pas »** (à côté de Run) exécute le workflow node par node : le run se met en pause avant chaque étape — le bouton ambre **« Étape : <node> »** dans l'en-tête exécute la suivante. Entre deux étapes, inspecte les sorties dans le panneau de prévisualisation. **Stop** interrompt proprement, même en pause.`]:
`### Depurar paso a paso

El botón **«Paso a paso»** (junto a Ejecutar) ejecuta el flujo de trabajo nodo por nodo: la ejecución se pausa antes de cada paso — el botón ámbar **«Paso: <node>»** en el encabezado ejecuta el siguiente. Entre dos pasos, inspeccione las salidas en el panel de previsualización. **Detener** interrumpe limpiamente, incluso en pausa.`,

  [`Le module **Catalogue studio** assemble automatiquement un catalogue multi-pages à partir de vos données produits : vous choisissez une source (PIM ou Excel), une structure, un style, et l'IA compose les pages. Vous gardez la main sur le **chemin de fer** (l'ordre et le contenu des pages) avant d'exporter en PDF.`]:
`El módulo **Catalogue studio** ensambla automáticamente un catálogo multipágina a partir de sus datos de productos: usted elige una fuente (PIM o Excel), una estructura, un estilo, y la IA compone las páginas. Usted mantiene el control sobre el **planillo** (el orden y el contenido de las páginas) antes de exportar a PDF.`,

  [`### Créer un catalogue
1. Ouvrez **Catalogue studio** depuis le menu latéral (groupe *Publication*).
2. Cliquez **Nouveau catalogue** (ou reprenez-en un dans *Mes catalogues*).
3. L'assistant en **6 étapes** s'ouvre. Vous pouvez naviguer librement entre les étapes une fois la source choisie ; le travail est **sauvegardé automatiquement**.`]:
`### Crear un catálogo
1. Abra **Catalogue studio** desde el menú lateral (grupo *Publicación*).
2. Haga clic en **Nuevo catálogo** (o retome uno en *Mis catálogos*).
3. Se abre el asistente de **6 pasos**. Puede navegar libremente entre los pasos una vez elegida la fuente; el trabajo se **guarda automáticamente**.`,

  [`### Les 6 étapes de l'assistant

**1 · Source** — Choisissez d'où viennent les produits : un **projet PIM** ou un **dataset Excel** importé. Chaque ligne devient un produit du catalogue.

**2 · Structure** — Organisez le catalogue en sections (rubriques, familles). Reliez une **taxonomie** pour regrouper les produits par catégorie et donner son plan au catalogue.

**3 · Prompt & style** — Décrivez le rendu voulu en langage naturel et posez la **charte graphique** (voir plus bas). L'IA en déduit la mise en page, les couleurs et les typographies.

**4 · Chemin de fer** — Le *flatplan* : chaque page est une vignette. **Glissez-déposez** pour réordonner, déplacer un produit d'une page à l'autre, ajouter ou retirer des pages. C'est ici que vous validez le déroulé.

**5 · Aperçu** — Le rendu page par page, fidèle à l'export.

**6 · Export** — Génération du fichier final (voir *Exporter*).`]:
`### Las 6 etapas del asistente

**1 · Origen** — Elija de dónde provienen los productos: un **proyecto PIM** o un **dataset Excel** importado. Cada fila se convierte en un producto del catálogo.

**2 · Estructura** — Organice el catálogo en secciones (rúbricas, familias). Vincule una **taxonomía** para agrupar los productos por categoría y dar su estructura al catálogo.

**3 · Prompt & estilo** — Describa el resultado deseado en lenguaje natural y establezca la **identidad corporativa** (ver más abajo). La IA deduce la maquetación, los colores y las tipografías.

**4 · Planillo** — El *flatplan*: cada página es una miniatura. **Arrastre y suelte** para reordenar, mover un producto de una página a otra, añadir o eliminar páginas. Aquí es donde se valida el orden de las páginas.

**5 · Vista previa** — El resultado página por página, fiel a la exportación.

**6 · Exportación** — Generación del archivo final (ver *Exportar*).`,

  [`### Charte graphique & source d'inspiration
À l'étape **Prompt & style**, la carte **Charte & éléments joints** pilote le moteur créatif :
- **Éléments joints** : ajoutez un logo, une charte PDF ou des visuels de référence.
- **Source d'inspiration** : collez une **URL** (Dribbble, Behance, ou une image directe). Le studio l'analyse et en extrait la **palette de couleurs** et les **typographies détectées**, qui pilotent ensuite le plan généré par l'IA — pour un catalogue qui « ressemble à » votre référence.`]:
`### Identidad corporativa y fuente de inspiración
En la etapa **Prompt & estilo**, la tarjeta **Identidad y elementos adjuntos** controla el motor creativo:
- **Elementos adjuntos**: añada un logotipo, un manual de identidad en PDF o imágenes de referencia.
- **Fuente de inspiración**: pegue una **URL** (Dribbble, Behance o una imagen directa). El estudio la analiza y extrae la **paleta de colores** y las **tipografías detectadas**, que luego guían el diseño generado por la IA, para obtener un catálogo que «se parezca a» su referencia.`,

  [`### Densité des fiches : Exhaustif ou Condensé
Dans le panneau **« Style des fiches »** (étape **Prompt & style**), section **« Éléments affichés »**, deux boutons sous **« Détails »** pilotent d'un clic la quantité de données ET la densité de grille :

- **« Exhaustif »** — toute la donnée source (puces intégrales + toutes les spécifications) et toutes les sections passent en **2 produits/page** (grandes cartes). C'est le régime **par défaut** d'un nouveau catalogue.
- **« Condensé »** — **5 puces · 6 specs** par fiche et grille **4 produits/page**.

Les quotas restent ajustables finement via **« Puces max (vide = toutes) »** et **« Spécifications max (vide = toutes) »**, et la densité section par section dans le panneau *Sections*. La ligne **« Data source : N puce(s) · N spec(s) max par fiche »** affiche les comptes **réels** des produits sélectionnés — vous savez toujours ce que contient votre source, sans plafond caché.`]:
`### Densidad de las fichas: Exhaustivo o Condensado
En el panel **«Estilo de las fichas»** (etapa **Prompt & estilo**), sección **«Elementos mostrados»**, dos botones bajo **«Detalles»** controlan con un clic la cantidad de datos Y la densidad de la cuadrícula:

- **«Exhaustivo»** — todos los datos de origen (viñetas completas + todas las especificaciones) y todas las secciones pasan a **2 productos/página** (tarjetas grandes). Es el régimen **por defecto** de un catálogo nuevo.
- **«Condensado»** — **5 viñetas · 6 especificaciones** por ficha y cuadrícula de **4 productos/página**.

Las cuotas siguen siendo ajustables de forma precisa mediante **«Viñetas máx. (vacío = todas)»** y **«Especificaciones máx. (vacío = todas)»**, y la densidad sección por sección en el panel *Secciones*. La línea **«Data source: N viñeta(s) · N especificación(es) máx. por ficha»** muestra los recuentos **reales** de los productos seleccionados; siempre sabrá lo que contiene su origen, sin límites ocultos.`,

  [`### Tableau « Caractéristiques » et bloc Description
Les **spécifications techniques** détectées dans la source sont rendues en **tableau de paires nom/valeur sur 2 colonnes** : nom en gras à gauche, valeur en couleur d'accent à droite, chaque paire sur un fond teinté, titre en pastille. Les valeurs ne sont **jamais tronquées** (aucune ellipse) : une valeur longue passe à la ligne aux espaces, sans couper un mot.

Le tableau est un **bloc de disposition à part entière** — **« Caractéristiques »** — déplaçable indépendamment de « Détails », en pleine largeur au bas de la fiche par défaut. Il dispose de sa propre ligne **« Caractéristiques »** dans **« Texte : taille & police »** : son échelle se multiplie par-dessus celle de **« Détails »** (1× = suit Détails exactement) et sa police peut différer (**« Police du thème »** = hérite).

Le bloc **Description** affiche le texte **intégral** de la source : il n'est jamais sacrifié au partage de hauteur avec les autres blocs (coupe en tout dernier recours seulement). Sélectionnez-le dans l'aperçu pour activer **« Texte sur 2 colonnes »** : le texte est réparti en deux moitiés équilibrées côte à côte, à l'identique dans l'export.`]:
`### Tabla «Características» y bloque Descripción
Las **especificaciones técnicas** detectadas en la fuente se renderizan como una **tabla de pares nombre/valor en 2 columnas**: nombre en negrita a la izquierda, valor en color de acento a la derecha, cada par sobre un fondo tintado, título en forma de píldora. Los valores **nunca se truncan** (sin elipsis): un valor largo pasa a la siguiente línea en los espacios, sin cortar ninguna palabra.

La tabla es un **bloque de diseño por derecho propio** — **«Características»** — que se puede mover independientemente de «Detalles», a todo el ancho en la parte inferior de la ficha por defecto. Dispone de su propia línea **«Características»** en **«Texto: tamaño y fuente»**: su escala se multiplica sobre la de **«Detalles»** (1× = sigue a Detalles exactamente) y su fuente puede diferir (**«Fuente del tema»** = hereda).

El bloque **Descripción** muestra el texto **íntegro** de la fuente: nunca se sacrifica al compartir altura con los otros bloques (solo se corta como último recurso absoluto). Selecciónelo en la vista previa para activar **«Texto en 2 columnas»**: el texto se distribuye en dos mitades equilibradas lado a lado, de forma idéntica en la exportación.`,

  [`### « Taille identique sur toutes les fiches »
En tête de **« Texte : taille & police »**, la case **« Taille identique sur toutes les fiches »** neutralise la hiérarchie automatique (fiches vedette magnifiées, ajustement de taille par page) : tous les produits du catalogue partagent la même taille de texte, de façon **déterministe** — deux rendus successifs donnent le même résultat.

La liste des réglages typo est désormais **groupée par thème** pour rester lisible : **Badges & rubans**, **Identité produit**, **Description & détails**, **Prix**. Chaque groupe conserve l'ordre visuel de la fiche et se met à jour en direct quand vous déplacez les blocs.`]:
`### «Tamaño idéntico en todas las fichas»
En la parte superior de **«Texto: tamaño y fuente»**, la casilla **«Tamaño idéntico en todas las fichas»** neutraliza la jerarquía automática (fichas destacadas ampliadas, ajuste de tamaño por página): todos los productos del catálogo comparten el mismo tamaño de texto, de forma **determinista** — dos renderizados sucesivos dan el mismo resultado.

La lista de ajustes tipográficos ahora está **agrupada por tema** para mantener su legibilidad: **Insignias y cintas**, **Identidad del producto**, **Descripción y detalles**, **Precio**. Cada grupo conserva el orden visual de la ficha y se actualiza en directo cuando se mueven los bloques.`,

  [`### Bandeau taxonomie (Univers › Famille)
Le bandeau de tête des pages produits affiche l'**Univers** et la **Famille** courants. Sa section de réglages, **« Bandeau taxonomie (Univers › Famille) »**, est disponible à la fois dans le panneau **« Fond de page »** de l'Aperçu et dans **« Style des fiches »** de **Prompt & style** — le bandeau y est visible dans l'aperçu, plus besoin de changer d'onglet. Il apparaît aussi sur les pages vedette (1 produit/page).`]:
`### Franja de taxonomía (Universo › Familia)
La franja superior de las páginas de productos muestra el **Universo** y la **Familia** actuales. Su sección de ajustes, **«Franja de taxonomía (Universo › Familia)»**, está disponible tanto en el panel **«Fondo de página»** de la Vista previa como en **«Estilo de las fichas»** de **Prompt y estilo** — la franja es visible allí en la vista previa, por lo que ya no es necesario cambiar de pestaña. También aparece en las páginas destacadas (1 producto/página).`,

  [`### Couleurs du thème dès « Prompt & style »
La section **« Couleurs du thème »** du panneau **« Style des fiches »** expose les couleurs **globales** (accent, fond, bandeau…) — les mêmes pastilles que le panneau « Fond de page » de l'Aperçu, **synchronisées** : plus besoin d'aller à l'étape Aperçu pour ajuster le thème.

Un **choix explicite de couleur gagne toujours** sur la variante de forme : si vous fixez la couleur d'une pastille sous-famille ou d'un prix, elle est respectée même quand la forme choisie (chip « plain », souligné, prix en texte nu) proposait sa propre teinte. Par ailleurs, un **garde-fou de lisibilité** contrôle les couleurs de texte proposées par l'IA contre le fond effectif des fiches : une encre illisible est automatiquement corrigée ou écartée.`]:
`### Colores del tema desde «Prompt & style»
La sección **«Colores del tema»** del panel **«Estilo de las fichas»** expone los colores **globales** (acento, fondo, franja…) — las mismas muestras que el panel «Fondo de página» de la Vista previa, **sincronizadas**: ya no es necesario ir al paso Vista previa para ajustar el tema.

Una **elección explícita de color siempre prevalece** sobre la variante de forma: si fija el color de una etiqueta de subfamilia o de un precio, se respeta incluso cuando la forma elegida (chip «plain», subrayado, precio en texto sin formato) proponía su propio tono. Por otra parte, una **salvaguarda de legibilidad** controla los colores de texto propuestos por la IA frente al fondo efectivo de las fichas: una tinta ilegible se corrige o descarta automáticamente.`,

  [`### Ruban vedette
Mettez un produit en avant d'un clic : **double-cliquez sa fiche dans l'Aperçu** pour ouvrir l'édition du produit, puis activez **« Ruban vedette (mise en avant dans ce catalogue) »**. Le produit devient une **grande carte 2×2** ornée du ruban — 1 vedette au maximum par page, jamais la page entière. Le réglage a une **portée publication** : il est enregistré dans CE catalogue, sans toucher la source PIM/Excel.

Le ruban se personnalise dans **« Style des fiches »** : champ **« Texte du ruban »** (défaut *Vedette*), ligne **« Ruban vedette »** dans la typo et les couleurs, et case **« Ruban vedette »** dans **« Éléments affichés »** pour le masquer globalement.`]:
`### Cinta destacada
Destaque un producto con un clic: **haga doble clic en su ficha en la Vista previa** para abrir la edición del producto y, a continuación, active **«Cinta destacada (destacado en este catálogo)»**. El producto se convierte en una **tarjeta grande 2×2** adornada con la cinta — 1 destacado como máximo por página, nunca la página entera. El ajuste tiene un **alcance de publicación**: se guarda en ESTE catálogo, sin alterar la fuente PIM/Excel.

La cinta se personaliza en **«Estilo de las fichas»**: campo **«Texto de la cinta»** (por defecto *Destacado*), línea **«Cinta destacada»** en la tipografía y los colores, y casilla **«Cinta destacada»** en **«Elementos mostrados»** para ocultarla globalmente.`,

  [`### Champs devinés & lien vers la fiche source
À la connexion de la source, les champs de fiche (nom, image, prix, prix barré, marque, référence, unité, description) ET les champs libres de la zone **« Détails »** (TVA, avantages, spécifications…) sont **devinés automatiquement** depuis les colonnes. La carte **« Correspondance des champs »** (étape **Structure**) permet de corriger : votre choix est conservé et prime sur le re-devinage (bouton **« Auto »** pour y revenir). Dans **« Champs supplémentaires »**, choisir une colonne **pré-remplit « Nom du champ »** s'il est encore vide — vous gardez la main pour le personnaliser.

Si une colonne d'URL produit est présente, chaque fiche porte un **lien de contrôle vers la fiche produit source** : une pastille apparaît **au survol** en haut à droite (**« Ouvrir la fiche source »**) et ouvre la page d'origine dans un nouvel onglet. Visible uniquement au survol, elle n'est **jamais capturée à l'export**.`]:
`### Campos deducidos y enlace a la ficha de origen
Al conectar la fuente, los campos de la ficha (nombre, imagen, precio, precio tachado, marca, referencia, unidad, descripción) Y los campos libres de la zona **«Detalles»** (IVA, ventajas, especificaciones…) se **deducen automáticamente** a partir de las columnas. La tarjeta **«Asignación de campos»** (paso **Estructura**) permite corregirlos: su elección se conserva y prevalece sobre la nueva deducción (botón **«Auto»** para volver a ella). En **«Campos adicionales»**, elegir una columna **rellena previamente el «Nombre del campo»** si aún está vacío — usted mantiene el control para personalizarlo.

Si hay una columna de URL de producto presente, cada ficha incluye un **enlace de control hacia la ficha de producto de origen**: aparece una etiqueta **al pasar el cursor** en la parte superior derecha (**«Abrir la ficha de origen»**) y abre la página original en una nueva pestaña. Visible únicamente al pasar el cursor, **nunca se captura en la exportación**.`,

  [`### Exporter
À l'étape **Export**, deux sorties :
- **PDF écran** — léger, pour l'aperçu et le partage web.
- **PDF print pro** — haute définition, prêt pour l'impression.

Le data-merge par produit et les autres formats de sortie sont détaillés dans la section **Export multi-format**.`]:
`### Exportar
En el paso **Exportación**, hay dos salidas:
- **PDF pantalla** — ligero, para la vista previa y compartir en la web.
- **PDF print pro** — alta resolución, listo para la impresión.

La combinación de datos por producto y los demás formatos de salida se detallan en la sección **Exportación multiformato**.`,

  [`### Bon à savoir
- La source est **relue au chargement** du catalogue : si le PIM évolue, rouvrez le catalogue pour repartir des données à jour.
- Pour des fiches promo unitaires (affiches, étiquettes) plutôt qu'un catalogue complet, voyez **Création studio**.
- La composition des pages et la palette sont générées par IA à partir de la charte : soignez le prompt et les éléments joints pour un meilleur résultat.`]:
`### Información útil
- La fuente se **vuelve a leer al cargar** el catálogo: si el PIM cambia, vuelva a abrir el catálogo para partir de los datos actualizados.
- Para fichas promocionales individuales (carteles, etiquetas) en lugar de un catálogo completo, consulte **Creación estudio**.
- La composición de las páginas y la paleta son generadas por IA a partir del manual de identidad: cuide el prompt y los elementos adjuntos para obtener un mejor resultado.`,

  [`L'éditeur exporte vers sept formats. Chaque format vise un usage précis.`]:
`El editor exporta a siete formatos. Cada formato está destinado a un uso específico.`,

  [`_Dialogue Exporter : choix du format puis options imprimeur (marques de coupe, bleed)._`]:
`_Diálogo Exportar: elección del formato y luego opciones de impresión (marcas de corte, sangrado)._`,

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
`### Formatos disponibles

| Formato | Uso |
|---|---|
| **PDF** | Catálogo, prueba de imprenta, archivo de impresión — admite marcas de impresión y sangrado |
| **IDML** | Vuelta a InDesign para el acabado gráfico (ZIP con carpeta \`Links/\` si la maqueta contiene imágenes) |
| **PPTX** | Presentación comercial, demostración al cliente |
| **SVG** | Web, integración en sitio, redes sociales estáticas |
| **PNG** | Viñetas, miniaturas, redes sociales — resolución **72** (Web), **150** (Estándar) o **300 dpi** (Impresión) |
| **HTML** | Carpeta web completa (ZIP: \`index.html\`, \`style.css\`, \`assets/\`) — textos seleccionables, formas en CSS |
| **Pack social** | ZIP con adaptaciones listas para publicar: post cuadrado 1080×1080, story 1080×1920, paisaje 1920×1080, banner 1500×500 (diseño centrado, fondo = color de página) |

Todas las exportaciones son fieles a la maqueta actual en el editor. La combinación de datos activa influye en el contenido pero no en el formato.`,

  [`### Export PDF avec options imprimeur

1. Règle d'abord le **fond perdu** et les repères dans le panneau **Impression** de l'éditeur (c'est lui qui fait foi — la modale d'export n'a pas de champ bleed)
2. Bouton **Exporter** → choisis **PDF**
3. Coche **« Export print (traits de coupe + bleed) »** : le canvas est étendu au fond perdu défini dans Impression et des traits de coupe en L sont ajoutés aux 4 coins
4. Lance l'export

Les traits de coupe sont en taille **physique** (par défaut 3,5 mm de longueur, 1 mm d'offset — réglables de 2 à 10 mm dans le panneau Impression), identiques quelle que soit la taille du document. Le panneau Impression propose aussi les **hirondelles de repérage** et la **zone de sécurité** ; lance un **Preflight** avant l'export final (voir la section _L'éditeur_).`]:
`### Exportación PDF con opciones de impresión

1. Configure primero el **sangrado** y las marcas en el panel **Impresión** del editor (este es el que prevalece — el modal de exportación no tiene campo de sangrado)
2. Botón **Exportar** → elija **PDF**
3. Marque **«Exportación print (marcas de corte + sangrado)»**: el lienzo se amplía al sangrado definido en Impresión y se añaden marcas de corte en L en las 4 esquinas
4. Inicie la exportación

Las marcas de corte tienen un tamaño **físico** (por defecto 3,5 mm de longitud, 1 mm de desplazamiento — ajustables de 2 a 10 mm en el panel Impresión), idénticas independientemente del tamaño del documento. El panel Impresión también ofrece las **marcas de registro** y la **zona de seguridad**; ejecute un **Preflight** antes de la exportación final (consulte la sección _El editor_).`,

  [`### Export batch (plusieurs fichiers)

Quand le data-merge est actif, l'export génère **une variante par ligne** de la BDD :

1. Ouvre le panneau Data Merge → vérifie le mapping placeholders ↔ colonnes
2. Choisis la **plage de lignes** à exporter et le mode : **PDF multi-pages** (un seul PDF, une page par ligne) ou **ZIP de fichiers individuels** (PDF/PNG/PPTX)
3. Le **nom des fichiers** se personnalise avec les colonnes : pattern \`export_{{colonne}}\` (par défaut \`export_{{_id}}\`, ex. \`export_{{reference}}\`)
4. Le streaming progressif affiche l'avancement, abandon possible à tout moment

Concrètement : 200 lignes × PDF = 200 PDFs en quelques minutes. Les performances dépendent du modèle de la machine et du nombre d'images embarquées.`]:
`### Exportación por lotes (varios archivos)

Cuando la combinación de datos está activa, la exportación genera **una variante por fila** de la base de datos:

1. Abra el panel Combinación de datos → compruebe la asignación de marcadores de posición ↔ columnas
2. Elija el **rango de filas** a exportar y el modo: **PDF multipágina** (un solo PDF, una página por fila) o **ZIP de archivos individuales** (PDF/PNG/PPTX)
3. El **nombre de los archivos** se personaliza con las columnas: patrón \`export_{{colonne}}\` (por defecto \`export_{{_id}}\`, ej. \`export_{{reference}}\`)
4. El flujo progresivo muestra el avance, con posibilidad de cancelación en cualquier momento

En la práctica: 200 filas × PDF = 200 PDFs en unos minutos. El rendimiento depende del modelo de la máquina y del número de imágenes incrustadas.`,

  [`### Export IDML (retour InDesign)

Quand tu veux que ta graphiste finisse à la main dans InDesign :

1. Configure ta maquette + data-merge dans IBS-Studio
2. Export **IDML** → IBS-Studio reconstruit un fichier IDML standard avec les valeurs déjà mergées. Si la maquette contient des images, tu obtiens un **ZIP** : \`xxx_modified.idml\` + dossier \`Links/\` (à garder côte à côte pour qu'InDesign résolve les liens)
3. Ouvre dans InDesign → ajustements graphiques fins
4. Exporte le PDF final depuis InDesign

En mode batch (data-merge actif), l'export **IDML multi-pages** produit un seul \`.idml\` avec **une planche par ligne de données** — et si la maquette vient d'un gabarit **EasyCatalog**, les marqueurs de champs sont conservés (round-trip complet, voir la section _EasyCatalog_).

Ce flow combine **automatisation** (IBS-Studio fait le merge en série) et **contrôle créatif** (InDesign fait la finition).`]:
`### Exportación IDML (retorno a InDesign)

Cuando desee que el diseñador gráfico finalice el trabajo manualmente en InDesign:

1. Configure su maqueta + combinación de datos en IBS-Studio
2. Exportación **IDML** → IBS-Studio reconstruye un archivo IDML estándar con los valores ya combinados. Si la maqueta contiene imágenes, obtendrá un **ZIP**: \`xxx_modified.idml\` + carpeta \`Links/\` (deben mantenerse juntos para que InDesign resuelva los enlaces)
3. Abra en InDesign → ajustes gráficos precisos
4. Exporte el PDF final desde InDesign

En modo por lotes (combinación de datos activa), la exportación **IDML multipágina** produce un único \`.idml\` con **un pliego por fila de datos** — y si la maqueta proviene de una plantilla de **EasyCatalog**, los marcadores de campo se conservan (ciclo completo, consulte la sección _EasyCatalog_).

Este flujo combina **automatización** (IBS-Studio realiza la combinación en serie) y **control creativo** (InDesign realiza el acabado).`,

  [`### Pages déclinées vs Pack social — quelle différence ?

Les deux partent des mêmes quatre ratios (post carré 1080×1080, story/reel 1080×1920, paysage 1920×1080, bannière 1500×500), mais ne produisent **pas** la même chose :

| | **Pack social** | **Pages déclinées** |
|---|---|---|
| Sortie | ZIP de **PNG** prêts à poster | **Pages éditables** ajoutées au document (rien n'est téléchargé) |
| Méthode | Le design est rendu **figé** puis posé en « contain » centré, fond = couleur de page | Re-layout **piloté par IA** (directeur artistique) : chaque élément est replacé selon le ratio cible |
| Quand l'utiliser | Tu veux juste les visuels, sans retouche | Tu veux **retoucher** chaque format avant export |

« Pages déclinées » envoie à l'IA un aperçu de la page **plus** la liste de ses éléments (boîtes en %), et reçoit un placement par format : le fond pleine page **couvre** (cover), le reste (titre, prix, photo, logo) est **placé en respectant son ratio** (contain). Si l'IA est indisponible (ou le rendu CORS échoue), un **repli géométrique** garanti s'applique (mise à l'échelle « contain » + centrage) — un toast t'avertit du mode utilisé.`]:
`### Páginas derivadas vs Pack social — ¿cuál es la diferencia?

Ambos parten de las mismas cuatro proporciones (publicación cuadrada 1080×1080, story/reel 1080×1920, paisaje 1920×1080, banner 1500×500), pero **no** producen lo mismo:

| | **Pack social** | **Páginas derivadas** |
|---|---|---|
| Salida | ZIP de **PNG** listos para publicar | **Páginas editables** añadidas al documento (no se descarga nada) |
| Método | El diseño se renderiza **acoplado** y luego se coloca en «contain» centrado, fondo = color de página | Recomposición **controlada por IA** (director artístico): cada elemento se reubica según la proporción de destino |
| Cuándo utilizarlo | Solo desea los elementos visuales, sin retoques | Desea **retocar** cada formato antes de la exportación |

«Páginas derivadas» envía a la IA una vista previa de la página **más** la lista de sus elementos (cajas en %), y recibe una ubicación por formato: el fondo a página completa **cubre** (cover), el resto (título, precio, foto, logo) se **coloca respetando su proporción** (contain). Si la IA no está disponible (o el renderizado CORS falla), se aplica una **alternativa geométrica** garantizada (escalado «contain» + centrado) — un aviso tipo toast le informa del modo utilizado.`,

  [`### Ce que contient vraiment chaque fichier

- **PDF** : une image **haute résolution** du canvas (rendu ×2, qualité maximale) **plus** une couche de **texte invisible sélectionnable/cherchable** posée sur chaque bloc de texte. Le PDF reste donc « plat » visuellement mais le texte est copiable.
- **PPTX** : une **slide unique** aux dimensions exactes du canvas (converties px→pouces), image en fond + textes éditables dans PowerPoint. Pas de multi-masters — pour des cas complexes, préfère PDF.
- **HTML** : le visuel vient d'un **PNG** ; par-dessus, chaque texte devient un \`<div>\` positionné, **transparent mais sélectionnable** (\`user-select:text\`, \`aria-label\`) — bon pour l'accessibilité et le SEO.
- **SVG** : vectoriel **réimportable** dans Illustrator, Figma ou l'éditeur. Les images liées sont **embarquées en data-URL** (sinon Illustrator affiche « fichier lié introuvable »), et les \`clipPath\` / dégradés sont **normalisés** pour les lecteurs SVG stricts.`]:
`### Lo que contiene realmente cada archivo

- **PDF**: una imagen de **alta resolución** del canvas (renderizado ×2, calidad máxima) **más** una capa de **texto invisible seleccionable/buscable** superpuesta en cada bloque de texto. Por lo tanto, el PDF se mantiene visualmente «plano», pero el texto se puede copiar.
- **PPTX**: una **diapositiva única** con las dimensiones exactas del canvas (convertidas de px→pulgadas), imagen de fondo + textos editables en PowerPoint. Sin múltiples patrones — para casos complejos, es preferible el PDF.
- **HTML**: el aspecto visual proviene de un **PNG**; por encima, cada texto se convierte en un \`<div>\` posicionado, **transparente pero seleccionable** (\`user-select:text\`, \`aria-label\`) — bueno para la accesibilidad y el SEO.
- **SVG**: arte vectorial **reimportable** en Illustrator, Figma o el editor. Las imágenes vinculadas se **incrustan como data-URL** (de lo contrario, Illustrator muestra «archivo vinculado no encontrado»), y los \`clipPath\` / degradados se **normalizan** para los lectores SVG estrictos.`,

  [`### SVG : compatibilité Illustrator / Figma

L'export SVG ne se contente pas du \`toSVG()\` brut de Fabric, il le **réécrit** pour les éditeurs vectoriels exigeants :

- les **images** (DAM, Unsplash, IDML lié) sont converties en \`data:\` URL le temps de l'export — Illustrator n'essaie plus de résoudre un lien disque ;
- les blocs \`<clipPath>\` sont regroupés dans un \`<defs>\` unique (sinon couleurs/dégradés « disparaissent ») ;
- les \`<stop>\` de dégradé sont **triés par offset** et l'alpha \`rgba()\` est séparé en \`stop-opacity\` (sinon rect noir dans Illustrator).

Limite : une image chargée **sans CORS** ne peut pas être embarquée (canvas « tainté ») — son URL d'origine est laissée telle quelle. Charge tes images depuis une source CORS-friendly avant l'export SVG final.`]:
`### SVG: compatibilidad con Illustrator / Figma

La exportación SVG no se conforma con el \`toSVG()\` en bruto de Fabric, sino que lo **reescribe** para los editores vectoriales exigentes:

- las **imágenes** (DAM, Unsplash, IDML vinculado) se convierten en URL \`data:\` durante la exportación — Illustrator ya no intenta resolver un enlace en el disco;
- los bloques \`<clipPath>\` se agrupan en un único \`<defs>\` (de lo contrario, los colores/degradados «desaparecen»);
- los \`<stop>\` de degradado se **ordenan por offset** y el alfa \`rgba()\` se separa en \`stop-opacity\` (de lo contrario, aparece un rectángulo negro en Illustrator).

Límite: una imagen cargada **sin CORS** no se puede incrustar (canvas «contaminado») — su URL original se deja tal cual. Cargue sus imágenes desde una fuente compatible con CORS antes de la exportación SVG final.`,

  [`### Bonnes pratiques

- **Toujours faire un export test** sur 1 ligne avant de lancer un batch de 200 — tu détectes les problèmes de fonts ou d'images manquantes plus vite
- **Vérifier les fonts** : si un fallback Arial s'est appliqué, ton imprimeur le verra. Charge tes fonts dans \`public/fonts/\` au préalable
- **PDF imprimeur** : demande à ton imprimeur la valeur de bleed exacte (souvent 3 ou 5 mm) avant l'export final
- **PPTX** : évite-le pour les cas complexes (multi-masters), préfère PDF + conversion PPTX externe si besoin`]:
`### Buenas prácticas

- **Realizar siempre una exportación de prueba** en 1 fila antes de lanzar un lote de 200 — detectará los problemas de fuentes o imágenes faltantes mucho antes
- **Comprobar las fuentes**: si se ha aplicado una fuente alternativa Arial, su impresor lo verá. Cargue sus fuentes en \`public/fonts/\` de antemano
- **PDF para imprenta**: pida a su impresor el valor exacto de sangrado (a menudo 3 o 5 mm) antes de la exportación final
- **PPTX**: evítelo para casos complejos (múltiples patrones), prefiera PDF + conversión PPTX externa si es necesario`,

  [`Connecte un bot Telegram à IBS-Studio pour **discuter avec l'IA**, **générer des workflows** en langage naturel et **recevoir les fichiers produits** — directement dans la messagerie.`]:
`Conecte un bot de Telegram a IBS-Studio para **hablar con la IA**, **generar workflows** en lenguaje natural y **recibir los archivos producidos** — directamente en la aplicación de mensajería.`,

  [`### Mise en route

1. **Paramètres → Connecteurs** : colle le *bot token* (obtenu via BotFather) et ton *chat ID*.
2. Ouvre l'onglet **Telegram** dans le menu latéral : c'est lui qui fait tourner le « worker » qui traite les messages.
3. C'est tout : le **répondeur serveur** traite tes messages même app fermée (voir « Réponses sans navigateur » plus bas). L'onglet Telegram sert à suivre la conversation — et prend le relais pour les workflows à rendu graphique (PDF, visuels) ou à fichier manuel.
4. Une **clé LLM** (Gemini, Claude ou DeepSeek) doit être configurée dans les Paramètres.`]:
`### Puesta en marcha

1. **Ajustes → Conectores**: pegue el *bot token* (obtenido a través de BotFather) y su *chat ID*.
2. Abra la pestaña **Telegram** en el menú lateral: es la que ejecuta el «worker» que procesa los mensajes.
3. Eso es todo: el **contestador del servidor** procesa sus mensajes incluso con la aplicación cerrada (véase «Respuestas sin navegador» más abajo). La pestaña Telegram sirve para seguir la conversación — y toma el relevo para los workflows con renderizado gráfico (PDF, creatividades) o con archivo manual.
4. Se debe configurar una **clave LLM** (Gemini, Claude o DeepSeek) en los Ajustes.`,

  [`### Commandes disponibles`]:
`### Comandos disponibles`,

  [`### Bon à savoir

- **Conversation bidirectionnelle** : messages entrants ET sortants sont journalisés dans l'onglet Telegram.
- **Fichiers** : un workflow qui produit un export (Excel, PDF, PPTX…) renvoie le fichier en pièce jointe ; sinon un résumé.
- **Workflows nécessitant un fichier manuel** (node Upload/Import) ne sont pas exécutables en auto : reformule avec une URL à scraper ou des données dans le message.
- **Suppression** : supprimer un message dans l'app le retire aussi de Telegram (< 48 h). L'inverse (effacer depuis le téléphone) n'est pas détectable par un bot — utilise \`/clear\`.
- **Nettoyage auto** : la boîte se purge localement après 7 jours.`]:
`### Información útil

- **Conversación bidireccional**: los mensajes entrantes Y salientes se registran en la pestaña Telegram.
- **Archivos**: un workflow que produce una exportación (Excel, PDF, PPTX…) devuelve el archivo como archivo adjunto; de lo contrario, un resumen.
- **Workflows que requieren un archivo manual** (nodo Upload/Import) no se pueden ejecutar automáticamente: reformule con una URL para extraer datos o con los datos en el mensaje.
- **Eliminación**: eliminar un mensaje en la aplicación también lo retira de Telegram (< 48 h). Lo inverso (borrar desde el teléfono) no es detectable por un bot — utilice \`/clear\`.
- **Limpieza automática**: la bandeja se purga localmente después de 7 días.`,

  [`### Réponses sans navigateur (répondeur serveur)

Plus besoin d'avoir l'app ouverte : un **répondeur serveur** traite vos messages dès leur arrivée —

- **Questions** : réponse LLM immédiate, **avec recherche web automatique** (Jina) quand la question l'exige (prix, actualité, contenu d'une URL) — sources citées.
- **/flow <demande>** : le workflow est **généré par IA et exécuté côté serveur** (scrape, enrichissement, veille prix, PIM, notification), puis sauvegardé dans l'app.
- **/run <nom>** : exécution serveur d'un workflow sauvegardé, résumé en retour.
- **Outils Google sans navigateur** : après avoir connecté **Google (accès serveur)** dans Réglages → Connecteurs (une seule fois), \`/flow\` peut **créer des Google Sheets dans votre Drive** et **envoyer des Gmail** depuis le serveur. Ne collez JAMAIS d'identifiants dans le chat — l'autorisation se donne uniquement dans l'app.
- Seuls les workflows avec **rendu graphique** (PDF, visuels) ou **fichier manuel** attendent l'ouverture de l'app (un message vous prévient ; le worker navigateur prend le relais).

Si l'app est ouverte en même temps, un seul des deux répond (jamais de doublon).`]:
`### Respuestas sin navegador (contestador del servidor)

Ya no es necesario tener la aplicación abierta: un **contestador del servidor** procesa sus mensajes en cuanto llegan —

- **Preguntas**: respuesta LLM inmediata, **con búsqueda web automática** (Jina) cuando la pregunta lo requiere (precios, actualidad, contenido de una URL) — fuentes citadas.
- **/flow <solicitud>**: el workflow es **generado por IA y ejecutado en el lado del servidor** (extracción de datos, enriquecimiento, seguimiento de precios, PIM, notificación), y luego se guarda en la aplicación.
- **/run <nombre>**: ejecución en el servidor de un workflow guardado, con un resumen como respuesta.
- **Herramientas de Google sin navegador**: después de conectar **Google (acceso al servidor)** en Ajustes → Conectores (una sola vez), \`/flow\` puede **crear Google Sheets en su Drive** y **enviar Gmail** desde el servidor. NUNCA pegue credenciales en el chat — la autorización se concede únicamente en la aplicación.
- Solo los workflows con **renderizado gráfico** (PDF, creatividades) o **archivo manual** esperan a que se abra la aplicación (un mensaje le avisa; el worker del navegador toma el relevo).

Si la aplicación está abierta al mismo tiempo, solo uno de los dos responde (nunca hay duplicados).`,

  [`### Approbation humaine dans un workflow

Le node **« Approbation Telegram »** (catégorie *Communication* dans l'éditeur de workflow) met le run **en pause** et demande une validation à un humain, directement dans la messagerie :

- Le bot envoie ta **question** avec deux boutons inline **✅ Approuver / ❌ Refuser**. Le workflow reprend ensuite sur le port **« approved »** ou **« rejected »** selon le clic.
- Si le port **attachment** est connecté (ex : un PDF généré), le **fichier est joint** au message et la question sert de **légende**.
- **Délai max** réglable (minutes) ; à l'expiration, au choix : **échouer** (stoppe le run) ou **refuser** (part par le port « rejected »).
- Le **premier clic gagne** (transaction serveur) ; les clics tardifs sont ignorés et les boutons retirés après décision.

⚠️ Le chat ciblé doit figurer dans l'**allowlist du webhook** (Réglages → Telegram), sinon les clics sont ignorés. Bot token et Chat ID se laissent vides pour réutiliser ceux des Connecteurs.`]:
`### Aprobación humana en un workflow

El nodo **«Aprobación Telegram»** (categoría *Comunicación* en el editor de workflows) pone la ejecución **en pausa** y solicita la validación de un humano, directamente en la aplicación de mensajería:

- El bot envía su **pregunta** con dos botones integrados **✅ Aprobar / ❌ Rechazar**. El workflow se reanuda a continuación en el puerto **«approved»** o **«rejected»** según el clic.
- Si el puerto **attachment** está conectado (ej.: un PDF generado), el **archivo se adjunta** al mensaje y la pregunta sirve de **leyenda**.
- **Plazo máximo** ajustable (minutos); al expirar, se puede elegir: **fallar** (detiene la ejecución) o **rechazar** (sale por el puerto «rejected»).
- El **primer clic gana** (transacción de servidor); los clics tardíos se ignoran y los botones se retiran tras la decisión.

⚠️ El chat de destino debe figurar en la **allowlist del webhook** (Ajustes → Telegram), de lo contrario los clics se ignoran. Bot token y Chat ID se dejan vacíos para reutilizar los de los Conectores.`,

  [`### Sécurité : secret + allowlist

Le webhook entrant n'accepte un message que si **deux conditions** sont réunies :

- Le **secret token** envoyé par Telegram correspond au \`webhookSecret\` enregistré côté serveur (toute requête sans le bon en-tête \`X-Telegram-Bot-Api-Secret-Token\` est rejetée en *401*).
- Le **chat ID** émetteur figure dans l'**allowlist** (\`allowedChatIds\`). Les messages — et les clics d'approbation — venant d'un chat non listé sont **silencieusement ignorés**.

Deux réglages distincts cohabitent donc : la **config webhook** (secret + allowlist, partagée) et ta **config personnelle** (bot token + chat ID, par utilisateur, dans Connecteurs). C'est cette dernière que lisent le répondeur serveur et le digest.`]:
`### Seguridad: secret + allowlist

El webhook entrante solo acepta un mensaje si se cumplen **dos condiciones**:

- El **secret token** enviado por Telegram coincide con el \`webhookSecret\` registrado en el servidor (cualquier petición sin la cabecera \`X-Telegram-Bot-Api-Secret-Token\` correcta se rechaza con un *401*).
- El **chat ID** emisor figura en la **allowlist** (\`allowedChatIds\`). Los mensajes —y los clics de aprobación— procedentes de un chat no listado son **ignorados silenciosamente**.

Por tanto, coexisten dos ajustes distintos: la **configuración del webhook** (secret + allowlist, compartida) y su **configuración personal** (bot token + chat ID, por usuario, en Conectores). Esta última es la que leen el contestador del servidor y el resumen.`,

  [`### Pourquoi jamais de double réponse

À l'arrivée d'un message, le répondeur serveur tente un **claim transactionnel** : il fait passer la fiche de \`pending\` à \`processing\` (et s'attribue \`workerId: 'server'\`) en une seule transaction. Si l'app était déjà en train de la traiter, le claim échoue et le serveur s'efface — **un seul des deux répond**. À l'inverse, quand le message nécessite l'app (rendu graphique ou fichier manuel), le serveur **rend la main** : il repasse la fiche en \`pending\` avec un drapeau \`serverDeferred\`, et le worker du navigateur la reprend à la prochaine ouverture.`]:
`### Por qué nunca hay una doble respuesta

Al llegar un mensaje, el contestador del servidor intenta un **claim transaccional**: pasa la ficha de \`pending\` a \`processing\` (y se asigna \`workerId: 'server'\`) en una sola transacción. Si la aplicación ya la estaba procesando, el claim falla y el servidor se retira — **solo uno de los dos responde**. Por el contrario, cuando el mensaje requiere la aplicación (renderizado gráfico o archivo manual), el servidor **cede el control**: vuelve a pasar la ficha a \`pending\` con un indicador \`serverDeferred\`, y el worker del navegador la retoma en la próxima apertura.`,

  [`### Digest quotidien

Dans **Réglages → Connecteurs → Telegram**, activez le **digest quotidien** : chaque matin à **08:00** (heure de Paris), le bot envoie un résumé des dernières 24 h — workflows réussis/en échec (avec les noms) et messages en attente de traitement. **Rien n'est envoyé s'il ne s'est rien passé.**`]:
`### Resumen diario

En **Ajustes → Conectores → Telegram**, active el **resumen diario**: cada mañana a las **08:00** (hora de París), el bot envía un resumen de las últimas 24 horas — workflows completados con éxito/fallidos (con sus nombres) y mensajes en espera de procesamiento. **No se envía nada si no ha ocurrido nada.**`,

  [`### Voir aussi

\`/flow\` et \`/run\` s'appuient sur le module **Workflows** : la génération par IA et l'exécution sont les mêmes que dans l'éditeur de workflow.`]:
`### Véase también

\`/flow\` y \`/run\` se basan en el módulo **Workflows**: la generación por IA y la ejecución son las mismas que en el editor de workflows.`,

  [`IBS-Studio embarque sa **propre mesure d'audience** : un petit script (beacon) enregistre chaque page vue du **site public** (accueil, promo, docs) et de l'**application**, l'envoie à une Cloud Function, et tout est stocké dans **votre** Firestore. Pas de Google Analytics, pas de cookie tiers, pas de données qui sortent de chez vous.

Le tableau de bord vit dans l'onglet **Analytics** du module **Utilisateurs & rôles** (réservé aux administrateurs et au propriétaire). Une version mobile installable, la PWA **« Pulse »**, affiche les mêmes données sur votre téléphone.`]:
`IBS-Studio incorpora su **propia medición de audiencia**: un pequeño script (beacon) registra cada página vista del **sitio público** (inicio, promo, docs) y de la **aplicación**, lo envía a una Cloud Function, y todo se almacena en **su** Firestore. Sin Google Analytics, sin cookies de terceros, sin datos que salgan de sus instalaciones.

El panel de control se encuentra en la pestaña **Analytics** del módulo **Usuarios y roles** (reservado para administradores y el propietario). Una versión móvil instalable, la PWA **« Pulse »**, muestra los mismos datos en su teléfono.`,

  [`### Périodes, filtres et indicateurs — le bandeau épinglé

En haut du tableau de bord, un bandeau regroupe la période, les filtres et les indicateurs clés. Il reste **épinglé en haut pendant le défilement** : vous gardez le contexte sous les yeux en parcourant le graphe, le journal ou la carte.

- **Période** : **Aujourd'hui** (depuis minuit, heure locale), **7 j**, **30 j**, **90 j** (par défaut), **12 mois**, ou **Perso** (dates « Du / Au » libres).
- **Filtres** : **Zone** (Site web / Application), **Appareil** (Ordinateur, Mobile, Tablette), **Pays**, **Page**, **Source** et **Utilisateur** (comptes connectés, résolus en nom/e-mail).
- **Indicateurs** : **Pages vues**, **Visiteurs uniques**, **Sessions** et **Durée moy. session**, chacun avec sa **variation en %** par rapport à la période précédente de même durée (vert = hausse, rouge = baisse). Pour « Aujourd'hui », la comparaison est équitable : hier, sur la même tranche horaire déjà écoulée.

Tous les panneaux du tableau de bord (graphe, journal, carte, pays…) réagissent instantanément à la période et aux filtres choisis.`]:
`### Períodos, filtros e indicadores — la barra fijada

En la parte superior del panel de control, una barra agrupa el período, los filtros y los indicadores clave. Permanece **fijada en la parte superior durante el desplazamiento**: mantiene el contexto a la vista mientras recorre el gráfico, el registro o el mapa.

- **Período**: **Hoy** (desde la medianoche, hora local), **7 d**, **30 d**, **90 d** (por defecto), **12 meses**, o **Personalizado** (fechas «Desde / Hasta» libres).
- **Filtros**: **Zona** (Sitio web / Aplicación), **Dispositivo** (Ordenador, Móvil, Tableta), **País**, **Página**, **Origen** y **Usuario** (cuentas conectadas, resueltas en nombre/correo electrónico).
- **Indicadores**: **Páginas vistas**, **Visitantes únicos**, **Sesiones** y **Duración media de la sesión**, cada uno con su **variación en %** respecto al período anterior de la misma duración (verde = aumento, rojo = descenso). Para «Hoy», la comparación es equitativa: ayer, en la misma franja horaria ya transcurrida.

Todos los paneles del panel de control (gráfico, registro, mapa, países…) reaccionan instantáneamente al período y a los filtros elegidos.`,

  [`### Le graphe de trafic

La courbe du haut trace l'activité sur la période :

- **Pages vues** (aplat indigo) et **Visiteurs** (cyan), point par point.
- **Connexions (cumul)** (pointillés orange, axe de droite) : la courbe grimpe jusqu'au **total de connexions de la période**, affiché directement dans la légende.

Le regroupement se fait par **jour local** (pas UTC) : un événement compte le même jour dans le graphe et dans le journal. Sur la période **Aujourd'hui**, la granularité passe automatiquement **à l'heure** — vous voyez l'activité heure par heure depuis minuit.`]:
`### El gráfico de tráfico

La curva superior traza la actividad durante el período:

- **Páginas vistas** (área índigo) y **Visitantes** (cian), punto por punto.
- **Conexiones (acumulado)** (líneas discontinuas naranjas, eje derecho): la curva asciende hasta el **total de conexiones del período**, mostrado directamente en la leyenda.

La agrupación se realiza por **día local** (no UTC): un evento cuenta el mismo día en el gráfico y en el registro. En el período **Hoy**, la granularidad pasa automáticamente **a la hora** — puede ver la actividad hora por hora desde la medianoche.`,

  [`### Le journal de consultation

Le panneau **« Journal de consultation »** répond à la question *qui · quand · quelle page*, avec les colonnes **Utilisateur · Page · Appareil · Lieu · Date & heure** (l'appareil précise le système et le navigateur ; le lieu affiche « Ville, Pays » en clair).

- **Groupé par utilisateur** (mode par défaut) : un bloc repliable par personne (cliquez l'en-tête pour le replier), avec le nombre de consultations, la date de la dernière, et une **pagination propre à chaque groupe** (8 lignes par page).
- Les **visiteurs anonymes** forment un bloc « Anonyme » **sous-groupé par pays**, triés par nombre de consultations — avec un lien « +N autres » pour déplier chaque pays.
- Le bouton **« Liste »** bascule en chronologie simple paginée ; **« Grouper »** revient au mode groupé.
- Chaque colonne a son **filtre déroulant** (utilisateur, page, appareil, pays, jour), cumulable avec les filtres du bandeau.`]:
`### El registro de consultas

El panel **«Registro de consultas»** responde a la pregunta *quién · cuándo · qué página*, con las columnas **Usuario · Página · Dispositivo · Lugar · Fecha y hora** (el dispositivo especifica el sistema y el navegador; el lugar muestra «Ciudad, País» en texto claro).

- **Agrupado por usuario** (modo por defecto): un bloque desplegable por persona (haga clic en el encabezado para plegarlo), con el número de consultas, la fecha de la última y una **paginación propia para cada grupo** (8 líneas por página).
- Los **visitantes anónimos** forman un bloque «Anónimo» **subagrupado por país**, ordenados por número de consultas — con un enlace «+N más» para desplegar cada país.
- El botón **«Lista»** cambia a una cronología simple paginada; **«Agrupar»** vuelve al modo agrupado.
- Cada columna tiene su **filtro desplegable** (usuario, página, dispositivo, país, día), acumulable con los filtros de la barra.`,

  [`### Pays, villes et carte du monde

- La **carte du monde** situe les connexions ville par ville.
- Le panneau **« Pays »** liste les villes **groupées par pays**, pays **triés par visites décroissantes**, avec pour chacun le total, une barre de proportion, la **date de dernière visite** et le détail des villes (repliable au chevron).
- Cliquez un pays dans le panneau : il est **mis en évidence sur la carte** (et inversement) ; recliquez pour désélectionner.

La géolocalisation se fait par adresse IP via la base **DB-IP** (licence CC BY 4.0, attribution affichée sous le tableau de bord) — là encore sans appel à un service tiers au moment de la visite.`]:
`### Países, ciudades y mapa del mundo

- El **mapa del mundo** sitúa las conexiones ciudad por ciudad.
- El panel **«Países»** enumera las ciudades **agrupadas por país**, países **ordenados por visitas decrecientes**, con el total para cada uno, una barra de proporción, la **fecha de la última visita** y el detalle de las ciudades (plegable en el chevrón).
- Haga clic en un país en el panel: se **resalta en el mapa** (y viceversa); vuelva a hacer clic para anular la selección.

La geolocalización se realiza por dirección IP a través de la base **DB-IP** (licencia CC BY 4.0, atribución mostrada bajo el panel de control) — de nuevo sin llamar a un servicio de terceros en el momento de la visita.`,

  [`### « Trafic en direct » et alertes Telegram

Le panneau **« Trafic en direct »** affiche le flux **temps réel** des visites, au même format que Telegram : 🟢 une ligne par page vue d'un **utilisateur connecté** (nom résolu), 🔵 l'arrivée d'un **visiteur anonyme** — avec la zone, la page, le drapeau et le lieu, la date et l'heure. Vos propres visites n'y figurent jamais.

Le bouton **« Alertes Telegram »** (cloche, en haut à droite) active ou coupe le **log live sur Telegram** : le propriétaire reçoit une notification à chaque nouvelle session anonyme et une ligne par page consultée par un utilisateur connecté. L'interrupteur agit **côté serveur avec effet immédiat** (sans redéploiement), et vos propres visites ne sont jamais notifiées — vous ne vous suivez pas vous-même.`]:
`### «Tráfico en directo» y alertas de Telegram

El panel **«Tráfico en directo»** muestra el flujo en **tiempo real** de las visitas, en el mismo formato que Telegram: 🟢 una línea por página vista de un **usuario conectado** (nombre resuelto), 🔵 la llegada de un **visitante anónimo** — con la zona, la página, la bandera y el lugar, la fecha y la hora. Sus propias visitas nunca aparecen allí.

El botón **«Alertas de Telegram»** (campana, arriba a la derecha) activa o desactiva el **registro en vivo en Telegram**: el propietario recibe una notificación por cada nueva sesión anónima y una línea por página consultada por un usuario conectado. El interruptor actúa **del lado del servidor con efecto inmediato** (sin reimplementación), y sus propias visitas nunca se notifican — usted no se sigue a sí mismo.`,

  [`### Export CSV, « Supprimer le résultat » et « Vider »

- **CSV** : télécharge les consultations de la période et des filtres affichés, pour analyse dans un tableur.
- **« Supprimer le résultat »** : supprime **définitivement** les consultations correspondant à la période **et aux filtres affichés** (zone, appareil, pays, page, source, utilisateur) — le reste de l'historique n'est pas touché. Une confirmation indique le nombre exact de lignes concernées. Idéal pour nettoyer des visites de test.
- **« Vider »** : supprime **tout** l'historique de consultation, toutes périodes confondues (avec confirmation). Irréversible.`]:
`### Exportación CSV, «Eliminar el resultado» y «Vaciar»

- **CSV**: descarga las consultas del período y de los filtros mostrados, para su análisis en una hoja de cálculo.
- **«Eliminar el resultado»**: elimina **definitivamente** las consultas correspondientes al período **y a los filtros mostrados** (zona, dispositivo, país, página, origen, usuario) — el resto del historial no se ve afectado. Una confirmación indica el número exacto de filas afectadas. Ideal para limpiar visitas de prueba.
- **«Vaciar»**: elimina **todo** el historial de consultas, de todos los períodos (con confirmación). Irreversible.`,

  [`### « Pulse » — la PWA mobile

**Pulse** est la version mobile du tableau de bord, à l'adresse **/pulse** : connexion Google puis contrôle du rôle administrateur, et vous retrouvez **les mêmes données** — indicateurs, tendance, filtres et périodes, journal groupé par utilisateur, pays en clair et trafic en direct — dans une interface **responsive** pensée pour le téléphone (le mode paysage et la tablette réorganisent les sections).

Installez-la sur l'écran d'accueil comme une application : elle se **met à jour automatiquement** au réveil dès qu'une nouvelle version du site est déployée, sans réinstallation.`]:
`### «Pulse» — la PWA móvil

**Pulse** es la versión móvil del panel de control, en la dirección **/pulse**: inicio de sesión con Google y control del rol de administrador, donde encontrará **los mismos datos** — indicadores, tendencia, filtros y períodos, registro agrupado por usuario, países en texto claro y tráfico en directo — en una interfaz **responsive** diseñada para el teléfono (el modo horizontal y la tableta reorganizan las secciones).

Instálela en la pantalla de inicio como una aplicación: se **actualiza automáticamente** al reactivarse en cuanto se despliega una nueva versión del sitio, sin necesidad de reinstalación.`,

  [`### Bon à savoir

- Le tableau de bord est **réservé aux administrateurs et au propriétaire** (onglet Analytics du module Utilisateurs & rôles, et PWA Pulse).
- Le **propriétaire est exclu du tracking** : ses visites ne polluent ni les statistiques, ni le trafic en direct, ni les alertes Telegram.
- Les données sont **hébergées chez vous** (votre Firestore) et collectées par votre propre Cloud Function : **rien n'est transmis à un service d'analytics tiers**.
- La géolocalisation par IP s'appuie sur la base **DB-IP** (CC BY 4.0), consultée côté serveur.`]:
`### Conviene saber

- El panel de control está **reservado a los administradores y al propietario** (pestaña Analytics del módulo Usuarios y roles, y PWA Pulse).
- El **propietario está excluido del seguimiento**: sus visitas no contaminan las estadísticas, ni el tráfico en directo, ni las alertas de Telegram.
- Los datos están **alojados en su entorno** (su Firestore) y son recopilados por su propia Cloud Function: **no se transmite nada a un servicio de analítica de terceros**.
- La geolocalización por IP se basa en la base de datos **DB-IP** (CC BY 4.0), consultada en el lado del servidor.`,

  [`Les **Paramètres** regroupent toute la configuration de ton compte, en **six onglets** : Profil, IA, Connecteurs, Cookies, Statistiques et Firebase. On les ouvre via l'**engrenage** en bas de la barre latérale, près de ton nom (pas dans le menu principal).`]:
`Los **Ajustes** agrupan toda la configuración de su cuenta, en **seis pestañas**: Perfil, IA, Conectores, Cookies, Estadísticas y Firebase. Se abren mediante el **engranaje** en la parte inferior de la barra lateral, junto a su nombre (no en el menú principal).`,

  [`### Onglet Profil — identité et apparence

- Ton **profil** (nom, e-mail du compte Google).
- La section **Apparence** bascule le thème : **Clair**, **Sombre** (défaut) ou **Système**. Le choix est mémorisé sur ton compte et te suit d'un poste à l'autre. Le thème se bascule aussi depuis la palette **⌘K**.`]:
`### Pestaña Perfil — identidad y apariencia

- Su **perfil** (nombre, correo electrónico de la cuenta de Google).
- La sección **Apariencia** cambia el tema: **Claro**, **Oscuro** (por defecto) o **Sistema**. La elección se memoriza en su cuenta y se mantiene de un equipo a otro. El tema también se puede cambiar desde la paleta **⌘K**.`,

  [`### Onglet IA — clés et modèles

- Renseigne les **clés API** de chaque fournisseur (Gemini, Claude, OpenAI, DeepSeek, Qwen, Kimi, GLM, OpenRouter) et **teste-les** d'un clic.
- Choisis le **modèle** de chaque fournisseur.
- Définis la **cascade de raisonnement** : l'ordre dans lequel les fournisseurs sont essayés (le premier qui répond gagne, les suivants servent de secours).
- Le bouton **« Mettre à jour tous les LLM »** réaligne toute la sélection sur les dernières versions du catalogue.

> 🔒 **Tes clés API sont isolées par compte** : elles sont synchronisées sur ton profil (Firestore) et purgées localement à la déconnexion — pas de fuite entre comptes sur une même machine.`]:
`### Pestaña IA — claves y modelos

- Introduzca las **claves API** de cada proveedor (Gemini, Claude, OpenAI, DeepSeek, Qwen, Kimi, GLM, OpenRouter) y **pruébelas** con un clic.
- Elija el **modelo** de cada proveedor.
- Defina la **cascada de razonamiento**: el orden en el que se prueban los proveedores (el primero en responder gana, los siguientes sirven de respaldo).
- El botón **«Actualizar todos los LLM»** realinea toda la selección con las últimas versiones del catálogo.

> 🔒 **Sus claves API están aisladas por cuenta**: se sincronizan en su perfil (Firestore) y se purgan localmente al cerrar sesión — sin fugas entre cuentas en una misma máquina.`,

  [`### Budgets IA et proxy serveur

Les appels LLM passent par un **proxy serveur** : la requête part **sans ta clé API**, le serveur ajoute la clé (lue sur ton profil) et **applique ton budget mensuel**.

- **Budget mensuel bloquant** : une fois le plafond du fournisseur atteint, l'appel est **refusé** côté serveur — il n'y a *pas* de repli en direct. C'est la garde-fou contre les dérives de coût.
- Un **seuil d'alerte mensuel** se règle par fournisseur dans le **panneau « Conso LLM en direct »** (colonne de droite sur la page Paramètres). Ce seuil est local et sert d'alerte (pastilles de couleur selon le pourcentage atteint) — il ne recharge jamais ton compte fournisseur.
- Le même panneau suit aussi un **budget Bright Data** (scraping).
- Les requêtes multimodales trop lourdes (> ~9 Mo) basculent automatiquement en appel direct depuis le navigateur.`]:
`### Presupuestos IA y proxy de servidor

Las llamadas LLM pasan por un **proxy de servidor**: la solicitud se envía **sin su clave API**, el servidor añade la clave (leída de su perfil) y **aplica su presupuesto mensual**.

- **Presupuesto mensual bloqueante**: una vez alcanzado el límite del proveedor, la llamada es **rechazada** en el lado del servidor — *no* hay respaldo directo. Es la medida de seguridad contra los excesos de costes.
- Un **umbral de alerta mensual** se configura por proveedor en el **panel «Consumo LLM en directo»** (columna derecha en la página Ajustes). Este umbral es local y sirve de alerta (puntos de color según el porcentaje alcanzado) — nunca recarga su cuenta de proveedor.
- El mismo panel también realiza un seguimiento de un **presupuesto Bright Data** (scraping).
- Las solicitudes multimodales demasiado pesadas (> ~9 MB) cambian automáticamente a una llamada directa desde el navegador.`,

  [`### Onglet Connecteurs`]:
`### Pestaña Conectores`,

  [`### Onglet Cookies

Gère les **cookies de session** pour scraper des sites **B2B derrière login**. Colle les cookies copiés depuis ton navigateur ; ils sont injectés dans les requêtes de scraping. Leur validité est limitée dans le temps (à re-coller régulièrement).`]:
`### Pestaña Cookies

Gestiona las **cookies de sesión** para extraer datos de sitios **B2B tras inicio de sesión**. Pegue las cookies copiadas desde su navegador; se inyectan en las solicitudes de scraping. Su validez está limitada en el tiempo (deberá volver a pegarlas regularmente).`,

  [`### Onglet Données — schéma Firestore (réservé au propriétaire)

Un **diagramme entité-relation (ERD)** de la base : chaque **collection** Firestore est une table affichant tous ses **champs**, ses clés **PK/FK** et ses **relations** (avec cardinalités). Le diagramme est interactif — zoom, recadrage, et **glisser les tables** : leur position est **mémorisée sur ton compte**.

**Double-clic** sur une table interrogeable ouvre un panneau de **données live** (lecture en temps réel via \`onSnapshot\`). Pratique pour inspecter l'état réel de la base sans ouvrir la console Firebase.`]:
`### Pestaña Datos — esquema Firestore (reservado al propietario)

Un **diagrama entidad-relación (ERD)** de la base de datos: cada **colección** Firestore es una tabla que muestra todos sus **campos**, sus claves **PK/FK** y sus **relaciones** (con cardinalidades). El diagrama es interactivo — zoom, reencuadre y **arrastrar las tablas**: su posición queda **memorizada en su cuenta**.

Hacer **doble clic** en una tabla consultable abre un panel de **datos en vivo** (lectura en tiempo real mediante \`onSnapshot\`). Práctico para inspeccionar el estado real de la base de datos sin abrir la consola Firebase.`,

  [`### Onglets Statistiques & Firebase

- **Statistiques** : nombre de projets, exports du mois, **stockage Firestore** (barre de progression), **coût IA estimé en EUR par fournisseur** avec les tokens entrants/sortants consommés, et le suivi des requêtes **Bright Data** (quota scraping). Bouton **Rafraîchir** pour recalculer. En bas, le **journal des runs de pipelines** (enrichissement PIM, décomposition Image/PDF → SVG) liste chaque exécution avec son statut, sa durée et le détail des étapes ou de l'erreur — l'« étage logs prod » sans ouvrir la console Firestore.
- **Firebase** : configuration du backend partagé (clés du projet Firebase) — **réservé au propriétaire**.`]:
`### Pestañas Estadísticas y Firebase

- **Estadísticas**: número de proyectos, exportaciones del mes, **almacenamiento Firestore** (barra de progreso), **coste de IA estimado en EUR por proveedor** con los tokens de entrada/salida consumidos, y el seguimiento de las peticiones **Bright Data** (cuota de scraping). Botón **Actualizar** para recalcular. En la parte inferior, el **registro de ejecuciones de pipelines** (enriquecimiento PIM, descomposición Imagen/PDF → SVG) enumera cada ejecución con su estado, su duración y el detalle de los pasos o del error — el «nivel de registros de producción» sin abrir la consola Firestore.
- **Firebase**: configuración del backend compartido (claves del proyecto Firebase) — **reservado al propietario**.`,

  [`### Qui voit quoi

L'onglet **Firebase** est réservé au **propriétaire**. Les onglets **Connecteurs** et **Cookies** dépendent des permissions accordées dans *Utilisateurs & rôles*. **Profil**, **IA** et **Statistiques** restent accessibles à tous.`]:
`### Quién ve qué

La pestaña **Firebase** está reservada al **propietario**. Las pestañas **Conectores** y **Cookies** dependen de los permisos concedidos en *Usuarios y roles*. **Perfil**, **IA** y **Estadísticas** siguen siendo accesibles para todos.`,

  [`Cet écran permet au **propriétaire** de contrôler **qui accède à quoi**. Les droits sont organisés par **rôles** (jeux de permissions réutilisables) et peuvent être ajustés **utilisateur par utilisateur**.

> ⚠️ Le module **« Utilisateurs & rôles »** n'est visible que par le **propriétaire** (compte admin).`]:
`Esta pantalla permite al **propietario** controlar **quién accede a qué**. Los derechos se organizan por **roles** (conjuntos de permisos reutilizables) y pueden ajustarse **usuario por usuario**.

> ⚠️ El módulo **«Usuarios y roles»** solo es visible para el **propietario** (cuenta de administrador).`,

  [`### Onboarding d'un nouvel utilisateur

1. La personne se connecte via Google : son compte est d'abord **« en attente »** (aucun accès).
2. Dans l'onglet **Utilisateurs**, tu lui **attribues un rôle**.
3. À sa prochaine ouverture, l'app n'affiche que les modules autorisés par son rôle.`]:
`### Incorporación de un nuevo usuario

1. La persona inicia sesión a través de Google: su cuenta está inicialmente **«en espera»** (sin acceso).
2. En la pestaña **Usuarios**, debe **asignarle un rol**.
3. En su próxima apertura, la aplicación solo mostrará los módulos autorizados por su rol.`,

  [`### Onglet « Utilisateurs »`]:
`### Pestaña «Usuarios»`,

  [`### Onglet « Rôles »

Crée et édite les rôles de l'équipe via une **matrice de permissions** par module. Trois vues : **Cartes** (par module), **Arbre** (hiérarchie) et **Carte mentale** (graphe).

Les permissions sont **hiérarchiques** : la visibilité d'un module (*« voir »*) commande ses actions. Décocher *« voir »* désactive toutes les actions du module ; cocher une action réactive automatiquement *« voir »*.`]:
`### Pestaña «Roles»

Cree y edite los roles del equipo mediante una **matriz de permisos** por módulo. Tres vistas: **Tarjetas** (por módulo), **Árbol** (jerarquía) y **Mapa mental** (grafo).

Los permisos son **jerárquicos**: la visibilidad de un módulo (*«ver»*) rige sus acciones. Desmarcar *«ver»* desactiva todas las acciones del módulo; marcar una acción reactiva automáticamente *«ver»*.`,

  [`### Onglets « Journal » et « Analytics »

Deux onglets d'observation complètent la gestion des droits :
- **Journal** — l'historique de qui a fait quoi (détails : section **Journal d'audit & Mon activité**).
- **Analytics** — la fréquentation du site et de l'app : visites, pays, journal de consultation, trafic en direct (détails : section **Fréquentation & trafic**).`]:
`### Pestañas «Registro» y «Analytics»

Dos pestañas de observación completan la gestión de derechos:
- **Registro** — el historial de quién ha hecho qué (detalles: sección **Registro de auditoría y Mi actividad**).
- **Analytics** — el tráfico del sitio y de la aplicación: visitas, países, registro de consultas, tráfico en directo (detalles: sección **Visitas y tráfico**).`,

  [`### Les rôles sont entièrement personnalisés

Aucun rôle n'est livré par défaut : tu **crées toi-même** les rôles dont l'équipe a besoin (un nom + une sélection de permissions), tu les **renommes** et les **supprimes** librement.

> ⚠️ Si tu **supprimes un rôle** encore attribué à quelqu'un, cette personne **repasse automatiquement « en attente »** (plus aucun accès) jusqu'à ce que tu lui en donnes un nouveau. Pense à réaffecter avant de supprimer.`]:
`### Los roles son totalmente personalizados

Ningún rol se incluye por defecto: usted **crea** los roles que el equipo necesita (un nombre + una selección de permisos), y los **renombra** y **elimina** libremente.

> ⚠️ Si **elimina un rol** que todavía está asignado a alguien, esa persona **vuelve automáticamente a estar «en espera»** (sin ningún acceso) hasta que se le asigne uno nuevo. Recuerde reasignar antes de eliminar.`,

  [`### Modules couverts par les permissions

Bibliothèque, Import (par format), DAM, PIM, Taxonomies, Scraping (templates & hub), Workflows, Animation, Chat IA, Telegram et Paramètres — chacun avec ses actions (créer, éditer, supprimer, exporter, exécuter…).

Exemple de droit d'action fin : **« Envoyer des messages Telegram »** (\`telegram.send\`) gouverne l'envoi — sans lui, un utilisateur peut voir Telegram mais **ni envoyer un message, ni exécuter le node « Envoyer via Telegram »** d'un workflow.`]:
`### Módulos cubiertos por los permisos

Biblioteca, Importación (por formato), DAM, PIM, Taxonomías, Scraping (plantillas y hub), Flujos de trabajo, Animación, Chat IA, Telegram y Ajustes — cada uno con sus acciones (crear, editar, eliminar, exportar, ejecutar…).

Ejemplo de derecho de acción detallado: **«Enviar mensajes de Telegram»** (\`telegram.send\`) rige el envío — sin él, un usuario puede ver Telegram pero **ni enviar un mensaje, ni ejecutar el nodo «Enviar vía Telegram»** de un flujo de trabajo.`,

  [`### Règles de sécurité

- Les permissions effectives = **rôle** + permissions **accordées** − permissions **retirées**.
- Le **propriétaire** a un accès total **non modifiable**.
- Un utilisateur **ne peut pas modifier ses propres droits** (protection côté serveur Firestore) : aucune escalade de privilèges possible.`]:
`### Reglas de seguridad

- Los permisos efectivos = **rol** + permisos **concedidos** − permisos **retirados**.
- El **propietario** tiene un acceso total **no modificable**.
- Un usuario **no puede modificar sus propios derechos** (protección del lado del servidor Firestore): ninguna escalada de privilegios es posible.`,

  [`**EasyCatalog** (65bit Software) est le plug-in InDesign de référence pour les catalogues et listes de prix pilotés par les données. IBS-Studio sert de **front web** à ce workflow : on importe un gabarit produit sous EasyCatalog, on l'édite et on le fusionne avec ses données, puis on réexporte un IDML qu'EasyCatalog **reconnaît nativement**.

Bonne nouvelle : EasyCatalog inscrit ses champs directement dans l'IDML (marqueurs invisibles). IBS-Studio les relit donc **automatiquement** — pas de re-balisage manuel à l'import.`]:
`**EasyCatalog** (65bit Software) es el plug-in de InDesign de referencia para los catálogos y listas de precios basados en datos. IBS-Studio sirve de **front web** para este flujo de trabajo: se importa una plantilla de producto bajo EasyCatalog, se edita y se fusiona con sus datos, y luego se vuelve a exportar un IDML que EasyCatalog **reconoce de forma nativa**.

Buena noticia: EasyCatalog inscribe sus campos directamente en el IDML (marcadores invisibles). Por lo tanto, IBS-Studio los vuelve a leer **automáticamente** — sin necesidad de volver a etiquetar manualmente en la importación.`,

  [`### Sous le capot : comment les champs survivent à l'IDML

EasyCatalog ne stocke pas ses champs sous forme de texte : il pose des **marqueurs invisibles** sur le balisage InDesign que IBS-Studio sait relire.

- **Champ texte** : deux marqueurs encadrent la valeur sur le run de caractères — \`$ID/4 <nom>\` **ouvre** le champ, \`$ID/5 <nom>\` le **ferme** (attribut \`ECTagData\`). Le contenu du marqueur lui-même n'est qu'un caractère invisible (U+FEFF). IBS-Studio détecte cette paire et remplace tout ce qui est entre les deux par un seul \`{{nom}}\`, même si la valeur s'étalait sur plusieurs runs.
- **Champ image** : le cadre est un rectangle portant \`ECPageItemData="2 2 <nom>"\`. IBS-Studio le convertit en cadre image transparent **lié au champ** — le publipostage y chargera le visuel de la ligne.
- Les **noms de champs** sont URL-encodés dans l'IDML ; ils sont décodés à la lecture, ce qui explique pourquoi des libellés avec accents ou espaces (ex. \`{{Prix Malin}}\`) ressortent proprement.`]:
`### Bajo el capó: cómo los campos sobreviven al IDML

EasyCatalog no almacena sus campos en forma de texto: coloca **marcadores invisibles** en el marcado de InDesign que IBS-Studio sabe volver a leer.

- **Campo de texto**: dos marcadores enmarcan el valor en la secuencia de caracteres — \`$ID/4 <nom>\` **abre** el campo, \`$ID/5 <nom>\` lo **cierra** (atributo \`ECTagData\`). El contenido del marcador en sí no es más que un carácter invisible (U+FEFF). IBS-Studio detecta este par y reemplaza todo lo que hay entre los dos por un solo \`{{nom}}\`, incluso si el valor se extendía por varias secuencias.
- **Campo de imagen**: el marco es un rectángulo que lleva \`ECPageItemData="2 2 <nom>"\`. IBS-Studio lo convierte en un marco de imagen transparente **vinculado al campo** — la combinación de correspondencia cargará allí el elemento visual de la fila.
- Los **nombres de campos** están codificados como URL en el IDML; se decodifican al leerlos, lo que explica por qué las etiquetas con acentos o espacios (ej. \`{{Prix Malin}}\`) aparecen limpiamente.`,

  [`### 1. Importer un gabarit EasyCatalog

1. Depuis InDesign (avec ton document EasyCatalog ouvert) : **Fichier → Exporter… → InDesign Markup (IDML)**
2. Dans IBS-Studio : Tableau de bord → **Importer** → sélectionne le \`.idml\`
3. Le gabarit s'ouvre dans l'éditeur. Les **champs EasyCatalog deviennent des placeholders éditables** :
   - **Champs texte** → \`{{Nom du champ}}\` (ex. \`{{Price}}\`, \`{{Description}}\`, \`{{Prix Malin}}\`)
   - **Champs image** → cadres image liés, prêts à recevoir un visuel par ligne`]:
`### 1. Importar una plantilla de EasyCatalog

1. Desde InDesign (con su documento de EasyCatalog abierto): **Archivo → Exportar… → InDesign Markup (IDML)**
2. En IBS-Studio: Panel de control → **Importar** → seleccione el \`.idml\`
3. La plantilla se abre en el editor. Los **campos de EasyCatalog se convierten en marcadores de posición editables**:
   - **Campos de texto** → \`{{Nom du champ}}\` (ej. \`{{Price}}\`, \`{{Description}}\`, \`{{Prix Malin}}\`)
   - **Campos de imagen** → marcos de imagen vinculados, listos para recibir un elemento visual por fila`,

  [`### 2. Brancher tes données et fusionner

Dans l'éditeur, panneau **Publipostage** : connecte une source (Excel, Google Sheets, PIM…). IBS-Studio remplace les \`{{champs}}\` par les valeurs de la ligne courante, et charge les images dans les cadres liés.

> Pour que la correspondance se fasse, les **noms de colonnes** de ta source doivent matcher les noms de champs du gabarit (ex. colonne « Price » ↔ \`{{Price}}\`). La casse et les accents sont tolérés.

Tu peux alors **exporter par lot** : un PDF / PNG / PPTX par ligne, directement depuis le panneau Publipostage — sans repasser par InDesign.`]:
`### 2. Conectar sus datos y fusionar

En el editor, panel **Combinación de correspondencia**: conecte una fuente (Excel, Google Sheets, PIM…). IBS-Studio reemplaza los \`{{champs}}\` por los valores de la fila actual y carga las imágenes en los marcos vinculados.

> Para que la correspondencia funcione, los **nombres de columnas** de su fuente deben coincidir con los nombres de campos de la plantilla (ej. columna « Price » ↔ \`{{Price}}\`). Se toleran mayúsculas/minúsculas y acentos.

Entonces puede **exportar por lotes**: un PDF / PNG / PPTX por fila, directamente desde el panel Combinación de correspondencia — sin volver a pasar por InDesign.`,

  [`### 3. Exporter une source de données POUR EasyCatalog

Depuis l'**espace Données**, bouton **EasyCatalog** : génère un zip prêt à brancher comme *flat-file data source* dans EasyCatalog.

Le zip contient :
- \`data.csv\` (tab ou virgule) ou \`data.xlsx\` — en-têtes = noms de champs stables
- un **champ-clé** garanti (pour la re-synchronisation EasyCatalog)
- \`fields.json\` — type de chaque champ (alphanumérique / numérique / image)
- \`images.csv\` — table URL → nom de fichier (si colonnes image)
- \`README.txt\` — mode d'emploi`]:
`### 3. Exportar una fuente de datos PARA EasyCatalog

Desde el **espacio Datos**, botón **EasyCatalog**: genera un zip listo para conectar como *flat-file data source* en EasyCatalog.

El zip contiene:
- \`data.csv\` (tabulador o coma) o \`data.xlsx\` — encabezados = nombres de campos estables
- un **campo clave** garantizado (para la resincronización de EasyCatalog)
- \`fields.json\` — tipo de cada campo (alfanumérico / numérico / imagen)
- \`images.csv\` — tabla URL → nombre de archivo (si hay columnas de imagen)
- \`README.txt\` — instrucciones de uso`,

  [`### 4. Réexporter un IDML (aller-retour complet)

Depuis l'éditeur, **Exporter → IDML (multi-pages)** : IBS-Studio produit un IDML qui **conserve les marqueurs EasyCatalog** et résout les valeurs par ligne.

À la réouverture dans InDesign + EasyCatalog, le document **retrouve ses champs** : tu peux re-synchroniser, re-paginer ou finaliser côté print. Pas de lock-in.

> **Comment l'aller-retour reste « propre » (preserve-and-patch)** : à l'export, IBS-Studio ne touche **jamais** aux marqueurs \`$ID/4\`/\`$ID/5\` — ils sont laissés tels quels. Seule la **valeur** entre les marqueurs est remplacée par \`{{champ}}\` puis résolue ligne par ligne. C'est pour ça qu'EasyCatalog reconnaît encore ses champs nativement après le passage par le web. Côté EasyCatalog, relie le document à ta data source via **Adopt Fields**.`]:
`### 4. Reexportar un IDML (ida y vuelta completa)

Desde el editor, **Exportar → IDML (multipage)**: IBS-Studio produce un IDML que **conserva los marcadores EasyCatalog** y resuelve los valores por fila.

Al volver a abrir en InDesign + EasyCatalog, el documento **recupera sus campos**: puede resincronizar, repaginar o finalizar en el lado de impresión. Sin bloqueo (lock-in).

> **Cómo la ida y vuelta se mantiene « limpia » (preserve-and-patch)**: al exportar, IBS-Studio **nunca** toca los marcadores \`$ID/4\`/\`$ID/5\` — se dejan tal cual. Solo el **valor** entre los marcadores se reemplaza por \`{{champ}}\` y luego se resuelve fila por fila. Es por eso que EasyCatalog sigue reconociendo sus campos de forma nativa después de pasar por la web. En el lado de EasyCatalog, vincule el documento a su fuente de datos mediante **Adopt Fields**.`,

  [`Carte **« Image → SVG éditable »** (sous-titre *Raster verrouillé + overlays*). Transforme un **raster** (\`.png\`, \`.jpg\`, \`.webp\`, \`.gif\`) en projet éditable.`]:
`Tarjeta **« Imagen → SVG editable »** (subtítulo *Raster bloqueado + superposiciones*). Transforma un archivo **raster** (\`.png\`, \`.jpg\`, \`.webp\`, \`.gif\`) en un proyecto editable.`,

  [`### Comment ça marche

1. L'image est **verrouillée en fond** (fidélité visuelle préservée). Le calque source devient non sélectionnable : les clics passent aux textes posés par-dessus.
2. Tu cliques **« Décomposer »** dans la barre de l'éditeur : **Google Vision** (mode *DOCUMENT_TEXT*) lit tous les textes de l'image.
3. Chaque texte est recréé en **calque éditable** (police, graisse, couleur estimées d'après l'image) par-dessus le fond.
4. Tu modifies les textes, prix, titres… sans toucher au visuel d'origine. Le bouton **« Annuler décomposition »** retire tous les calques et restaure l'image.

La taille du canvas épouse les **pixels natifs** de la source. Idéal pour reprendre une **affiche / un visuel existant** dont tu n'as pas le fichier source.`]:
`### Cómo funciona

1. La imagen se **bloquea en el fondo** (fidelidad visual preservada). La capa de origen se vuelve no seleccionable: los clics pasan a los textos colocados encima.
2. Hace clic en **« Descomponer »** en la barra del editor: **Google Vision** (modo *DOCUMENT_TEXT*) lee todos los textos de la imagen.
3. Cada texto se recrea como **capa editable** (fuente, grosor, color estimados a partir de la imagen) sobre el fondo.
4. Modifica los textos, precios, títulos… sin tocar el diseño original. El botón **« Deshacer descomposición »** elimina todas las capas y restaura la imagen.

El tamaño del lienzo se ajusta a los **píxeles nativos** del origen. Ideal para retomar un **cartel / diseño existente** del cual no tiene el archivo original.`,

  [`### Ce qui devient éditable

La décomposition ne se limite pas à du texte brut : elle reconstruit la **mise en forme** de chaque bloc.

- **Textes éditoriaux** (titres, sous-titres, descriptions, mentions) → un calque texte par bloc, avec **couleur** échantillonnée et **graisse** déduite (Regular / Bold / Black selon la densité de pixels).
- **Prix composés** type \`9€59\` → reconstruits en pile : gros entier + **« € » et décimales** réduits, alignés comme sur la créa, et liés (ils se déplacent ensemble).
- **Exposants** \`%\` et **ordinaux** (\`2ÈME\`, \`1er\`…) → recréés en caractères réduits et surélevés dans le même calque.
- **Multi-lignes** : Vision fusionne parfois plusieurs lignes ; elles sont re-séparées avec l'**alignement** (gauche / centré / droite) reconstitué.
- **Champs de fusion** \`{{Champ}}\` repérés dans l'image → normalisés et regroupés en bloc pour le publipostage.`]:
`### Lo que se vuelve editable

La descomposición no se limita al texto sin formato: reconstruye el **formato** de cada bloque.

- **Textos editoriales** (títulos, subtítulos, descripciones, menciones) → una capa de texto por bloque, con el **color** muestreado y el **grosor** deducido (Regular / Bold / Black según la densidad de píxeles).
- **Precios compuestos** tipo \`9€59\` → reconstruidos en pila: número entero grande + **« € » y decimales** reducidos, alineados como en la creatividad, y vinculados (se mueven juntos).
- **Superíndices** \`%\` y **ordinales** (\`2ÈME\`, \`1er\`…) → recreados en caracteres reducidos y elevados en la misma capa.
- **Multilíneas**: Vision a veces fusiona varias líneas; se vuelven a separar con la **alineación** (izquierda / centrada / derecha) reconstituida.
- **Campos de fusión** \`{{Champ}}\` detectados en la imagen → normalizados y agrupados en un bloque para la combinación de correspondencia.`,

  [`### Clé Google Vision requise

La détection des textes appelle l'API **Google Cloud Vision** : il faut renseigner ta clé **une seule fois** dans **Paramètres → Connecteurs** (champ *Google Vision*), synchronisée ensuite via ton compte.

- Sans clé, le bouton « Décomposer » renvoie une erreur explicite.
- Coût indicatif : **~0,0015 $ par image analysée** (la relecture fine des prix par IA ajoute ~0,001 $ par prix).
- L'API *Cloud Vision* doit être activée sur ton projet Google Cloud.`]:
`### Clave de Google Vision requerida

La detección de textos llama a la API **Google Cloud Vision**: es necesario introducir su clave **una sola vez** en **Ajustes → Conectores** (campo *Google Vision*), que luego se sincroniza a través de su cuenta.

- Sin clave, el botón «Descomponer» devuelve un error explícito.
- Coste indicativo: **~0,0015 $ por imagen analizada** (la revisión detallada de los precios por IA añade ~0,001 $ por precio).
- La API *Cloud Vision* debe estar activada en su proyecto de Google Cloud.`,

  [`### Filtres intelligents

Pour ne garder que le contenu **éditorial** et éviter le bruit, plusieurs filtres s'appliquent automatiquement.

- **Zone produit centrale ignorée** : les textes au centre de l'image (typiquement imprimés sur un packaging photographié) sont écartés ; le contenu promo est sur les bords et en bas.
- **Texte sur fond coloré (packaging)** : les libellés lus sur un fond vert saturé d'emballage sont filtrés.
- **Texte vertical** (mentions sur tranche, code-barres) ignoré.
- **Logos / pictos / certifications** : un classement sémantique par IA distingue le texte éditorial du texte de logo, qui n'est pas recréé.
- **Filets de séparation** détectés dans l'image et conservés en fines barres (Vision ne les voit pas, ils disparaîtraient sinon).`]:
`### Filtros inteligentes

Para conservar únicamente el contenido **editorial** y evitar el ruido, se aplican varios filtros automáticamente.

- **Zona central del producto ignorada**: los textos en el centro de la imagen (típicamente impresos en un envase fotografiado) se descartan; el contenido promocional se encuentra en los bordes y en la parte inferior.
- **Texto sobre fondo coloreado (envase)**: las etiquetas leídas sobre un fondo verde saturado de envase se filtran.
- **Texto vertical** (menciones en el borde, códigos de barras) ignorado.
- **Logotipos / pictogramas / certificaciones**: una clasificación semántica por IA distingue el texto editorial del texto de logotipo, que no se recrea.
- **Líneas de separación** detectadas en la imagen y conservadas como barras finas (Vision no las ve, de lo contrario desaparecerían).`,

  [`### Quand l'utiliser & limites

**À utiliser quand** tu as un visuel raster fini (affiche, flyer, publicité retail) sans le fichier source et que tu veux **réécrire les textes ou décliner** sans tout refaire.

Limites connues :
- La détection cible le **texte** : photos, logos et illustrations restent dans le fond verrouillé (non décomposés en calques).
- Le découpage des **prix complexes** et la séparation des lignes reposent sur des heuristiques + une relecture IA — vérifie le rendu après décomposition.
- Les **polices** ne sont pas reconnues à l'identique : le rendu utilise Arial / Arial Black selon la graisse estimée.
- Le fichier doit être un **raster** (\`.png\`, \`.jpg\`, \`.webp\`, \`.gif\`) ; un SVG passe par l'import SVG direct.`]:
`### Cuándo utilizarlo y límites

**Debe utilizarse cuando** se dispone de un diseño rasterizado final (cartel, folleto, publicidad retail) sin el archivo original y se desea **reescribir los textos o crear variaciones** sin tener que rehacer todo.

Límites conocidos:
- La detección se centra en el **texto**: las fotos, logotipos e ilustraciones permanecen en el fondo bloqueado (no se descomponen en capas).
- La división de los **precios complejos** y la separación de las líneas se basan en heurísticas + una revisión por IA — compruebe el resultado tras la descomposición.
- Las **fuentes** no se reconocen de forma idéntica: la representación utiliza Arial / Arial Black según el grosor estimado.
- El archivo debe ser un **raster** (\`.png\`, \`.jpg\`, \`.webp\`, \`.gif\`); un SVG pasa por la importación SVG directa.`,

  [`À la **première connexion**, un assistant s'ouvre automatiquement pour configurer l'essentiel. Il ne réapparaît qu'**une seule fois** : dès qu'au moins une clé IA est renseignée (ou que tu marques la configuration comme terminée), il ne se relance plus tout seul. Tu peux toujours le rouvrir manuellement (voir plus bas).

> 💡 Tu peux fermer l'assistant à tout moment (bouton **Plus tard** en haut à droite) et tout reconfigurer ensuite dans les **Réglages**.`]:
`En el **primer inicio de sesión**, se abre automáticamente un asistente para configurar lo esencial. Solo aparece **una vez**: en cuanto se introduce al menos una clave de IA (o se marca la configuración como terminada), deja de iniciarse por sí solo. Siempre es posible volver a abrirlo manualmente (véase más abajo).

> 💡 Es posible cerrar el asistente en cualquier momento (botón **Más tarde** en la parte superior derecha) y configurar todo posteriormente en los **Ajustes**.`,

  [`### Les étapes`]:
`### Los pasos`,

  [`### Reprendre la configuration plus tard

L'assistant reste accessible à tout moment, par deux entrées :

- **Bandeau « Assistant de configuration »** en haut des **Réglages** — sous-titre _« Reprendre la mise en place guidée (clés, modèles, connecteurs) »_.
- **Entrée « Configurer l'application »** (icône ✨) en bas du **menu des modules** (le bouton ☰ flottant en bas à gauche).

Les deux rouvrent l'assistant à la première étape.`]:
`### Retomar la configuración más tarde

El asistente permanece accesible en cualquier momento a través de dos entradas:

- **Banner «Asistente de configuración»** en la parte superior de los **Ajustes** — subtítulo _«Retomar la configuración guiada (claves, modelos, conectores)»_.
- **Entrada «Configurar la aplicación»** (icono ✨) en la parte inferior del **menú de módulos** (el botón ☰ flotante en la parte inferior izquierda).

Ambas opciones vuelven a abrir el asistente en el primer paso.`,

  [`### Bouton « Mettre à jour tous les LLM »

Présent dans l'assistant **et** dans l'onglet **IA** des Réglages, il sélectionne le **dernier modèle phare** de chaque fournisseur (Claude, Gemini, OpenAI, DeepSeek, Qwen, Kimi, GLM, OpenRouter). Pratique pour rester à jour sans choisir chaque modèle à la main après une évolution du catalogue.`]:
`### Botón «Actualizar todos los LLM»

Presente en el asistente **y** en la pestaña **IA** de los Ajustes, selecciona el **último modelo insignia** de cada proveedor (Claude, Gemini, OpenAI, DeepSeek, Qwen, Kimi, GLM, OpenRouter). Resulta práctico para mantenerse al día sin tener que elegir cada modelo manualmente tras una actualización del catálogo.`,

  [`> ℹ️ L'assistant n'est soumis à **aucune restriction de rôle** : tout utilisateur peut configurer ses propres clés et préférences IA. Seul l'onglet **Firebase** des Réglages reste réservé au propriétaire.`]:
`> ℹ️ El asistente no está sujeto a **ninguna restricción de rol**: cualquier usuario puede configurar sus propias claves y preferencias de IA. Solo la pestaña **Firebase** de los Ajustes queda reservada al propietario.`,

  [`Tu n'as pas EasyCatalog ? InDesign sait **baliser nativement** un document avec des **balises XML** (panneau *Balises*). IBS-Studio relit ces balises à l'import de l'IDML et les convertit **automatiquement** en champs de publipostage \`{{nom}}\` — la même logique qu'**EasyCatalog** (voir la section dédiée), mais **sans plug-in payant**.

Le principe : tu poses une balise dont **le nom = le nom exact d'une colonne** de ta base. Au publipostage, IBS-Studio remplit chaque balise avec la valeur de la ligne courante.

> Avantage technique : une balise XML native encadre **tout le bloc**, même si InDesign découpe le texte en plusieurs morceaux (run-splitting). La détection est donc plus robuste qu'un simple repérage de \`{{texte}}\` tapé à la main.`]:
`¿No dispone de EasyCatalog? InDesign permite **etiquetar de forma nativa** un documento con **etiquetas XML** (panel *Etiquetas*). IBS-Studio vuelve a leer estas etiquetas al importar el IDML y las convierte **automáticamente** en campos de combinación de correspondencia \`{{nom}}\` — la misma lógica que **EasyCatalog** (véase la sección dedicada), pero **sin plug-in de pago**.

El principio: se coloca una etiqueta cuyo **nombre = el nombre exacto de una columna** de su base de datos. En la combinación de correspondencia, IBS-Studio rellena cada etiqueta con el valor de la fila actual.

> Ventaja técnica: una etiqueta XML nativa enmarca **todo el bloque**, incluso si InDesign divide el texto en varios fragmentos (run-splitting). Por lo tanto, la detección es más robusta que una simple identificación de \`{{texte}}\` escrito a mano.`,

  [`### 1. Baliser le document dans InDesign

1. Ouvre le panneau des balises : **Fenêtre → Utilitaires → Balises** (*Window → Utilities → Tags*).
2. Crée une balise par champ, avec le **nom exact de ta colonne** (ex. \`Libelle_Article\`, \`Prix_normal\`, \`Marques\`).
3. **Champ texte** : sélectionne **le texte** du bloc (pas seulement le cadre), puis clique la balise → des **crochets \`[ ]\`** apparaissent autour du texte. C'est ce qui garantit que la valeur sera remplacée à la fusion.
4. **Champ image** : sélectionne le **cadre image** puis applique la balise → le cadre devient une zone liée qui recevra le visuel de la ligne.
5. Répète pour chaque champ à connecter.

> Astuce : active **Affichage → Structure** et *Afficher les balises* pour visualiser ce qui est balisé. Si tu ne vois pas les crochets, c'est que tu as balisé le **cadre** et non le **texte** — re-balise en sélectionnant le texte.`]:
`### 1. Etiquetar el documento en InDesign

1. Abra el panel de etiquetas: **Ventana → Utilidades → Etiquetas** (*Window → Utilities → Tags*).
2. Cree una etiqueta por campo, con el **nombre exacto de su columna** (ej. \`Libelle_Article\`, \`Prix_normal\`, \`Marques\`).
3. **Campo de texto**: seleccione **el texto** del bloque (no solo el marco), luego haga clic en la etiqueta → aparecerán **corchetes \`[ ]\`** alrededor del texto. Esto es lo que garantiza que el valor será reemplazado en la combinación.
4. **Campo de imagen**: seleccione el **marco de imagen** y luego aplique la etiqueta → el marco se convierte en un área vinculada que recibirá la imagen de la fila.
5. Repita para cada campo que desee conectar.

> Consejo: active **Ver → Estructura** y *Mostrar etiquetas* para visualizar lo que está etiquetado. Si no ve los corchetes, es porque ha etiquetado el **marco** y no el **texto** — vuelva a etiquetar seleccionando el texto.`,

  [`### 2. (Option) Le plug-in IBS-Studio : baliser connecté à ta base

Pour baliser **en étant connecté à ta base en direct**, IBS-Studio fournit un **plug-in InDesign (UXP)**. Une fois chargé, il :

- se **connecte à un dataSet** via un *token* personnel ;
- affiche la **liste des champs** de la base (avec leur type) ;
- pose une balise sur le bloc sélectionné en **un clic** (et empêche de poser deux fois le même champ) ;
- permet de **prévisualiser** les valeurs d'une ligne dans un tableau.

Le **token** se génère dans **Réglages → « Token du plugin InDesign »** : copie-le et colle-le dans le plug-in pour ouvrir la connexion.

> Le plug-in est un **assistant optionnel** (en cours de mise au point). Le balisage XML natif de l'étape 1 fonctionne déjà sans lui : c'est la voie la plus fiable aujourd'hui.`]:
`### 2. (Opcional) El plug-in IBS-Studio: etiquetar conectado a su base de datos

Para etiquetar **estando conectado a su base de datos en directo**, IBS-Studio proporciona un **plug-in para InDesign (UXP)**. Una vez cargado:

- se **conecta a un dataSet** mediante un *token* personal;
- muestra la **lista de campos** de la base de datos (con su tipo);
- coloca una etiqueta en el bloque seleccionado con **un clic** (y evita colocar dos veces el mismo campo);
- permite **previsualizar** los valores de una fila en una tabla.

El **token** se genera en **Ajustes → "Token del plugin InDesign"**: cópielo y péguelo en el plug-in para abrir la conexión.

> El plug-in es un **asistente opcional** (en fase de desarrollo). El etiquetado XML nativo del paso 1 ya funciona sin él: es la vía más fiable en la actualidad.`,

  [`### 3. Exporter l'IDML

Dans InDesign : **Fichier → Exporter… → InDesign Markup (IDML)**. Les balises XML sont conservées dans le fichier.`]:
`### 3. Exportar el IDML

En InDesign: **Archivo → Exportar… → InDesign Markup (IDML)**. Las etiquetas XML se conservan en el archivo.`,

  [`### 4. Importer dans IBS-Studio → champs auto-connectés

Tableau de bord → **Importer** → sélectionne le \`.idml\`. À l'ouverture :

- chaque **balise texte** devient un placeholder \`{{nom}}\` éditable ;
- chaque **balise image** devient un cadre image lié.

Dans l'éditeur, panneau **Publipostage** : connecte ta source (Excel, Google Sheets, PIM…). Les noms de colonnes matchent les noms de balises (**casse et accents tolérés**), et IBS-Studio remplit tout, ligne par ligne. Tu peux ensuite **exporter par lot** (un PDF/PNG/PPTX par ligne).`]:
`### 4. Importar en IBS-Studio → campos autoconectados

Panel de control → **Importar** → seleccione el \`.idml\`. Al abrir:

- cada **etiqueta de texto** se convierte en un placeholder \`{{nom}}\` editable;
- cada **etiqueta de imagen** se convierte en un marco de imagen vinculado.

En el editor, panel **Combinación de correspondencia**: conecte su fuente (Excel, Google Sheets, PIM…). Los nombres de las columnas coinciden con los nombres de las etiquetas (**se toleran mayúsculas/minúsculas y acentos**), e IBS-Studio rellena todo, fila por fila. A continuación, puede **exportar por lotes** (un PDF/PNG/PPTX por fila).`,

  [`Le **Scraping Hub** centralise la gouvernance du scraping en trois onglets.`]:
`El **Scraping Hub** centraliza la gobernanza del scraping en tres pestañas.`,

  [`### Règles : éditeur markdown avec aperçu live

L'onglet **Règles** est un éditeur **côte à côte** : tu écris du markdown à gauche, le rendu s'affiche en direct à droite (titres, listes, tableaux GFM). Le champ est **pré-rempli d'un canevas** quand il est vide — quatre sections types *Conventions de nommage*, *Prix*, *Descriptions* et *Pièges connus* — pour donner le bon point de départ. Le bouton **Enregistrer** reste grisé tant que rien n'a changé et l'app mémorise l'auteur de la dernière modification (ton e-mail). La lecture est ouverte à tous ; **seule la permission \`scrapingHub.edit\`** fait apparaître le bouton d'enregistrement.`]:
`### Reglas: editor markdown con vista previa en vivo

La pestaña **Reglas** es un editor **en paralelo**: se escribe markdown a la izquierda y la representación se muestra en directo a la derecha (títulos, listas, tablas GFM). El campo está **rellenado previamente con un esquema** cuando está vacío —cuatro secciones estándar *Convenciones de nomenclatura*, *Precios*, *Descripciones* y *Trampas conocidas*— para ofrecer el punto de partida adecuado. El botón **Guardar** permanece atenuado mientras no haya cambios y la aplicación memoriza al autor de la última modificación (su correo electrónico). La lectura está abierta a todos; **solo el permiso \`scrapingHub.edit\`** hace que aparezca el botón de guardado.`,

  [`### Fournisseurs : prompt par domaine, champs et taux de réussite

Sous chaque domaine fournisseur, tu retrouves le **prompt fournisseur** s'il en existe un (encadré bleu, badge « prompt fournisseur défini ») : ces consignes propres au site s'appliquent à tous ses templates. Chaque template affiche son **nombre de champs** et, dès qu'il a tourné, son **taux de réussite** (\`succès / applications ok\`) — pratique pour repérer un template qui décroche. Les fournisseurs sont triés par ordre alphabétique ; les templates sans domaine sont regroupés sous « (sans domaine) ». Un clic ouvre le template dans son éditeur.`]:
`### Proveedores: prompt por dominio, campos y tasa de éxito

Bajo cada dominio de proveedor, se encuentra el **prompt de proveedor** si existe uno (recuadro azul, insignia "prompt de proveedor definido"): estas instrucciones específicas del sitio se aplican a todas sus plantillas. Cada plantilla muestra su **número de campos** y, una vez ejecutada, su **tasa de éxito** (\`succès / applications ok\`) —práctico para detectar una plantilla que está fallando. Los proveedores se ordenan alfabéticamente; las plantillas sin dominio se agrupan bajo "(sin dominio)". Un clic abre la plantilla en su editor.`,

  [`### Debug : un journal LOCAL à ce navigateur

Le journal de debug est stocké **en local sur ce poste** (localStorage), pas dans Firestore : il n'est donc **pas partagé** avec l'équipe et ne reflète que tes propres enrichissements récents. Chaque entrée est typée **Jina** (URL appelée, en-têtes, réponse markdown — tronquée à 50 Ko) ou **LLM** (fournisseur, modèle, tâche, température, messages par rôle, éventuel outil appelé). Déplie une entrée pour voir le détail, avec son horodatage. Au-delà du rafraîchissement automatique toutes les 2 s, un bouton **Rafraîchir** force une relecture immédiate.`]:
`### Debug: un registro LOCAL en este navegador

El registro de debug se almacena **localmente en este equipo** (localStorage), no en Firestore: por lo tanto, **no se comparte** con el equipo y solo refleja sus propios enriquecimientos recientes. Cada entrada está clasificada como **Jina** (URL llamada, encabezados, respuesta markdown —truncada a 50 KB) o **LLM** (proveedor, modelo, tarea, temperatura, mensajes por rol, posible herramienta llamada). Despliegue una entrada para ver el detalle, con su marca de tiempo. Más allá de la actualización automática cada 2 s, un botón **Actualizar** fuerza una relectura inmediata.`,

  [`### Voir aussi

La création des templates se fait dans **Templates scraping** ; le mode d'emploi général (Scrape, Map + Extract, Crawl, limites anti-bot) est dans **Scraping produits**.`]:
`### Véase también

La creación de plantillas se realiza en **Plantillas de scraping**; las instrucciones generales (Scrape, Map + Extract, Crawl, límites anti-bot) se encuentran en **Scraping de productos**.`,

  [`Le **Chat IA** est un assistant texte intégré à l'app. Pose une question, demande un brouillon, un bout de code ou une explication : la réponse arrive en **markdown** (titres, listes, blocs de code). Il répond en **français** par défaut, ou dans la langue de ta question.`]:
`El **Chat IA** es un asistente de texto integrado en la aplicación. Haga una pregunta, solicite un borrador, un fragmento de código o una explicación: la respuesta llega en **markdown** (títulos, listas, bloques de código). Responde en **francés** por defecto, o en el idioma de su pregunta.`,

  [`### Ce qu'il sait faire`]:
`### Qué puede hacer`,

  [`### Choix du modèle

Le Chat utilise une **cascade de modèles** : si le modèle principal échoue, le suivant prend le relais automatiquement. Chaque réponse affiche **par quel modèle** elle a été produite — et si des fournisseurs ont échoué avant, un badge ambre **« Échec du provider »** se déplie pour voir le détail des tentatives. L'ordre de la cascade et le modèle de chaque fournisseur se règlent dans les **Paramètres → IA**.`]:
`### Elección del modelo

El Chat utiliza una **cascada de modelos**: si el modelo principal falla, el siguiente toma el relevo automáticamente. Cada respuesta muestra **qué modelo** la ha producido —y si algún proveedor ha fallado antes, una insignia ámbar **"Fallo del proveedor"** se despliega para ver el detalle de los intentos. El orden de la cascada y el modelo de cada proveedor se configuran en los **Ajustes → IA**.`,

  [`### Changer de modèle à la volée

Le **badge du modèle**, à côté du bouton d'envoi, est **cliquable** : il déplie la liste de tous les modèles de la cascade (regroupés par fournisseur, avec leur tarif indicatif *entrée / sortie*). Choisir un modèle le sélectionne **et le place en tête de cascade** pour les messages suivants — pas besoin de passer par les Réglages. Le fournisseur en tête porte l'étiquette **« primaire »**, et un lien **« Cascade & clés API → Réglages »** mène au réglage complet.`]:
`### Cambiar de modelo sobre la marcha

El **distintivo del modelo**, junto al botón de envío, es **clicable**: despliega la lista de todos los modelos de la cascada (agrupados por proveedor, con su tarifa indicativa *entrada / salida*). Elegir un modelo lo selecciona **y lo coloca a la cabeza de la cascada** para los mensajes siguientes — sin necesidad de pasar por los Ajustes. El proveedor a la cabeza lleva la etiqueta **« primaria »**, y un enlace **« Cascada & claves API → Ajustes »** lleva a la configuración completa.`,

  [`### À ne pas confondre

- Le Chat IA est **conversationnel** : il **n'accède pas au web** et **n'agit pas sur l'app** (il ne crée pas de projets, ne scrape pas, ne lance pas de workflows).
- Pour un assistant **avec accès web** et capable d'**exécuter des workflows**, c'est le **bot Telegram** qu'il faut utiliser.
- Une **clé LLM** doit être configurée dans les Paramètres pour que le Chat réponde.`]:
`### A no confundir

- El Chat IA es **conversacional**: **no accede a la web** y **no actúa sobre la app** (no crea proyectos, no extrae datos, no lanza flujos de trabajo).
- Para un asistente **con acceso web** y capaz de **ejecutar flujos de trabajo**, es el **bot Telegram** el que hay que utilizar.
- Una **clave LLM** debe estar configurada en los Ajustes para que el Chat responda.`,

  [`Toute votre base, **d'un seul regard**. L'**Explorateur** dessine un **diagramme relationnel (ERD)** de vos collections Firestore — **clés primaires (PK)**, **clés étrangères (FK)** et **cardinalités** (1:1, 1:N) — et trace les liens qui relient projets, produits, taxonomies et bases Excel. **Double-cliquez une table** pour afficher ses enregistrements **en direct** (mise à jour temps réel), avec sélecteur de base et recherche instantanée. Les positions des tables sont **mémorisées** : composez la carte qui vous parle.

> 🔒 Réservé au **propriétaire**. On l'ouvre dans **Paramètres → Données** (l'engrenage en bas de la barre latérale).`]:
`Toda su base, **de un solo vistazo**. El **Explorador** dibuja un **diagrama relacional (ERD)** de sus colecciones Firestore — **claves primarias (PK)**, **claves foráneas (FK)** y **cardinalidades** (1:1, 1:N) — y traza los enlaces que unen proyectos, productos, taxonomías y bases Excel. **Haga doble clic en una tabla** para mostrar sus registros **en directo** (actualización en tiempo real), con selector de base y búsqueda instantánea. Las posiciones de las tablas son **memorizadas**: componga el mapa que le hable.

> 🔒 Reservado al **propietario**. Se abre en **Ajustes → Datos** (el engranaje en la parte inferior de la barra lateral).`,

  [`### Le problème

Une base qui grandit devient **opaque** : on ne sait plus quelles collections existent, comment elles se relient, ni ce qu'elles contiennent réellement — sans ouvrir la console Firebase.`]:
`### El problema

Una base que crece se vuelve **opaca**: ya no se sabe qué colecciones existen, cómo se relacionan, ni qué contienen realmente — sin abrir la consola Firebase.`,

  [`### Modèle de données (ERD)

Chaque collection est une **table** avec ses **champs**, sa **clé primaire (PK)** et ses **clés étrangères (FK)** ; les relations métier sont tracées avec leur **cardinalité** (1:1, 1:N). Le diagramme est rendu avec **ReactFlow** : on visualise d'un coup la structure complète de la plateforme.`]:
`### Modelo de datos (ERD)

Cada colección es una **tabla** con sus **campos**, su **clave primaria (PK)** y sus **claves foráneas (FK)**; las relaciones de negocio se trazan con su **cardinalidad** (1:1, 1:N). El diagrama se renderiza con **ReactFlow**: se visualiza de una vez la estructura completa de la plataforma.`,

  [`### Données live

Un **double-clic** sur une table ouvre le **contenu réel** de la collection, mis à jour en **temps réel** (*onSnapshot*). Pour les **bases Excel**, un **sélecteur** liste chaque base et n'affiche que ses colonnes utiles. **Filtre instantané** et **pagination** (50 lignes par page) pour parcourir de gros volumes sans peine.`]:
`### Datos en vivo

Un **doble clic** en una tabla abre el **contenido real** de la colección, actualizado en **tiempo real** (*onSnapshot*). Para las **bases Excel**, un **selector** lista cada base y solo muestra sus columnas útiles. **Filtro instantáneo** y **paginación** (50 filas por página) para recorrer grandes volúmenes sin esfuerzo.`,

  [`### Disposition persistée

**Déplacez les tables** par glisser : leur **position est enregistrée** sur votre profil (Firestore) et **restaurée** à la prochaine ouverture. Composez la cartographie qui correspond à votre lecture de la donnée.`]:
`### Disposición persistente

**Mueva las tablas** arrastrándolas: su **posición se guarda** en su perfil (Firestore) y se **restaura** en la próxima apertura. Componga la cartografía que corresponda a su lectura de los datos.`,

  [`IBS-Studio accepte les fichiers PowerPoint au format \`.pptx\` et les transforme en projets éditables. Utile pour récupérer une présentation existante et la transformer en template.`]:
`IBS-Studio acepta los archivos PowerPoint en formato \`.pptx\` y los transforma en proyectos editables. Útil para recuperar una presentación existente y transformarla en plantilla.`,

  [`### Importer un PPTX

1. Tableau de bord → **Importer**
2. Sélectionne le \`.pptx\`
3. Le parser extrait textes, images et formes — y compris le **thème** (les couleurs de thème sont résolues) et les **transparences** de remplissage
4. La slide devient une page éditable dans IBS-Studio

⚠️ **Seule la première slide est importée.** Pour une présentation multi-slides, découpe le fichier en plusieurs \`.pptx\` (un par slide à récupérer) ou passe par le chemin IDML.

Une fois importé, tu peux modifier le contenu, ajouter des placeholders pour le data-merge, et exporter dans n'importe quel format.`]:
`### Importar un PPTX

1. Panel de control → **Importar**
2. Seleccione el \`.pptx\`
3. El analizador extrae textos, imágenes y formas — incluyendo el **tema** (los colores del tema se resuelven) y las **transparencias** de relleno
4. La diapositiva se convierte en una página editable en IBS-Studio

⚠️ **Solo se importa la primera diapositiva.** Para una presentación de varias diapositivas, divida el archivo en varios \`.pptx\` (uno por diapositiva a recuperar) o utilice la vía IDML.

Una vez importado, puede modificar el contenido, añadir marcadores de posición para la combinación de datos y exportar en cualquier formato.`,

  [`### Cas d'usage type

**Présentation commerciale dynamique** : ton équipe vente part d'un PPTX modèle. Tu l'importes une fois, tu mappes les placeholders sur ta BDD produits, et chaque commercial génère sa version personnalisée (logo client, prix négocié, références prioritaires).

**Reverse engineering** : un client te fournit un PPTX que tu dois reproduire. Importe-le, capture la mise en page, exporte en IDML pour finition graphique.`]:
`### Casos de uso típicos

**Presentación comercial dinámica**: su equipo de ventas parte de un PPTX de plantilla. Lo importa una vez, asigna los marcadores de posición a su base de datos de productos, y cada comercial genera su versión personalizada (logotipo del cliente, precio negociado, referencias prioritarias).

**Ingeniería inversa**: un cliente le proporciona un PPTX que debe reproducir. Impórtelo, capture el diseño, exporte en IDML para el acabado gráfico.`,

  [`### Limites

- **Multi-slides** : seule la **slide 1** est lue — les suivantes sont ignorées
- **Animations PowerPoint** : non supportées (IBS-Studio exporte du print/statique)
- **SmartArt** : ignorés à l'import (non convertis en formes)
- **Round-trip PPTX → Fabric → PPTX** : fonctionnel sur des slides simples, à valider sur cas complexes (plusieurs masters, mises en page custom)

Pour un export 100% fidèle vers PowerPoint, garde l'export PPTX pour des cas simples ; pour l'impression haut de gamme, privilégie le path PDF ou IDML.`]:
`### Límites

- **Varias diapositivas**: solo se lee la **diapositiva 1** — las siguientes se ignoran
- **Animaciones de PowerPoint**: no compatibles (IBS-Studio exporta para impresión/estático)
- **SmartArt**: ignorados en la importación (no se convierten en formas)
- **Ida y vuelta PPTX → Fabric → PPTX**: funcional en diapositivas sencillas, a validar en casos complejos (varios patrones, diseños personalizados)

Para una exportación 100% fiel a PowerPoint, reserve la exportación PPTX para casos sencillos; para la impresión de alta gama, priorice la vía PDF o IDML.`,

  [`Cet import crée (ou complète) une **base de données produits** dans le PIM à partir d'un fichier. C'est le point d'entrée le plus rapide pour démarrer un catalogue.`]:
`Esta importación crea (o completa) una **base de datos de productos** en el PIM a partir de un archivo. Es el punto de entrada más rápido para iniciar un catálogo.`,

  [`### Formats supportés

| Format | Usage |
|---|---|
| **.xlsx / .xls** | Catalogue Excel classique, multi-feuilles supporté |
| **.csv / .tsv** | Export ERP (séparateur virgule ou tabulation), détection auto des types de colonnes |
| **Google Sheets** | Via OAuth Google — disponible dans le panneau **Publipostage** de l'éditeur et via les nodes Workflow (pas dans cette modale d'import) |

L'import détecte automatiquement les types de colonnes : texte, nombre, booléen, date, **formule** (stockée puis évaluée au moment de la fusion) et **dictionnaire** (colonne à valeurs répétitives → liste de choix).`]:
`### Formatos compatibles

| Formato | Uso |
|---|---|
| **.xlsx / .xls** | Catálogo Excel clásico, compatible con varias hojas |
| **.csv / .tsv** | Exportación ERP (separador de coma o tabulación), detección automática de los tipos de columnas |
| **Google Sheets** | A través de OAuth de Google — disponible en el panel **Combinación de correspondencia** del editor y a través de los nodos de Flujos de trabajo (no en este cuadro de diálogo de importación) |

La importación detecta automáticamente los tipos de columnas: texto, número, booleano, fecha, **fórmula** (almacenada y luego evaluada en el momento de la combinación) y **diccionario** (columna de valores repetitivos → lista de opciones).`,

  [`### Importer un fichier

1. Ouvre **PIM** depuis le menu.
2. Clique **Importer un fichier** (ou *Créer vide* pour partir d'une base vierge).
3. Sélectionne ton fichier.
4. Vérifie les colonnes détectées.
5. Valide → la base est créée et synchronisée sur Firebase.`]:
`### Importar un archivo

1. Abra **PIM** desde el menú.
2. Haga clic en **Importar un archivo** (o *Crear vacío* para partir de una base de datos en blanco).
3. Seleccione su archivo.
4. Compruebe las columnas detectadas.
5. Valide → la base de datos se crea y se sincroniza en Firebase.`,

  [`### Et ensuite ?

Une fois la base importée, tout se passe dans le **PIM** : enrichir les fiches par IA, gérer les champs structurés (spécifications, variants, documents, images) et exporter en série. Voir la section **PIM**.`]:
`### ¿Y después?

Una vez importada la base de datos, todo ocurre en el **PIM**: enriquecer las fichas mediante IA, gestionar los campos estructurados (especificaciones, variantes, documentos, imágenes) y exportar en serie. Consulte la sección **PIM**.`,

  [`Le module **Veille tarifaire** est un **tableau de bord en lecture seule** : il affiche les résultats de tes suivis de prix (un produit par ligne, le prix relevé chez chaque concurrent, ton positionnement et les écarts). La **collecte se configure dans un workflow** — le module ne fait que présenter les résultats du dernier relevé.`]:
`El módulo **Monitorización de precios** es un **panel de control de solo lectura**: muestra los resultados de sus seguimientos de precios (un producto por línea, el precio registrado en cada competidor, su posicionamiento y las diferencias). La **recopilación se configura en un workflow** — el módulo solo presenta los resultados del último registro.`,

  [`### Comment ça se met en place

Tout part d'un **workflow** contenant le node **« Veille tarifaire »** :

1. Une **feuille de produits** en entrée (ton catalogue : SKU/EAN, Nom, Marque, et ton prix).
2. Les **sites concurrents** à surveiller (un domaine par ligne, ex : \`amazon.fr\`).
3. Le node retrouve chaque produit chez chaque concurrent (SKU/EAN, sinon Nom + Marque), scrape le prix, puis émet des **alertes** de **positionnement** (tu es plus cher/moins cher) et de **variation** (un prix a bougé au-delà du seuil).

Lance le workflow (à la main, en **cron serveur**, ou depuis Telegram) : le module Veille tarifaire affiche alors le dernier relevé.`]:
`### Cómo se configura

Todo parte de un **workflow** que contiene el nodo **«Monitorización de precios»**:

1. Una **hoja de productos** como entrada (su catálogo: SKU/EAN, Nombre, Marca y su precio).
2. Los **sitios de la competencia** a vigilar (un dominio por línea, ej.: \`amazon.fr\`).
3. El nodo encuentra cada producto en cada competidor (SKU/EAN, en su defecto Nombre + Marca), extrae el precio y luego emite **alertas** de **posicionamiento** (usted es más caro/más barato) y de **variación** (un precio ha cambiado más allá del umbral).

Ejecute el workflow (manualmente, mediante **cron servidor** o desde Telegram): el módulo Monitorización de precios mostrará entonces el último registro.`,

  [`### Comment chaque produit est retrouvé chez un concurrent

Tu ne fournis **que le domaine** d'un concurrent — pas l'URL de chaque fiche. Pour chaque produit, le node lance une **recherche web cantonnée à ce domaine** (\`site:domaine\`) : d'abord par **SKU** (ou EAN à défaut), puis par **Marque + Nom**. Comme le premier résultat d'un domaine est souvent une page catégorie ou un accessoire, le node **préfère le candidat dont l'URL ou le titre contient le SKU/EAN** ; sinon il retient le premier résultat du domaine.

Une fois la bonne fiche trouvée et validée, son **URL est épinglée** : les runs suivants la réutilisent directement (plus de recherche), ce qui fige le suivi sur la bonne page.`]:
`### Cómo se encuentra cada producto en un competidor

Solo se proporciona **el dominio** de un competidor — no la URL de cada ficha. Para cada producto, el nodo ejecuta una **búsqueda web limitada a ese dominio** (\`site:domaine\`): primero por **SKU** (o EAN en su defecto), luego por **Marca + Nombre**. Como el primer resultado de un dominio suele ser una página de categoría o un accesorio, el nodo **prefiere el candidato cuya URL o título contiene el SKU/EAN**; de lo contrario, conserva el primer resultado del dominio.

Una vez encontrada y validada la ficha correcta, su **URL queda fijada**: las siguientes ejecuciones la reutilizan directamente (sin más búsquedas), lo que fija el seguimiento en la página correcta.`,

  [`### Voir aussi

Le détail des nodes (« Veille tarifaire », « Veille prix », « Comparer les prix ») et de la planification **cron serveur** est dans la section **Workflows** ; l'envoi d'alertes est couvert par **Telegram**.`]:
`### Véase también

El detalle de los nodos («Monitorización de precios», «Vigilancia de precios», «Comparar precios») y de la planificación **cron servidor** se encuentra en la sección **Workflows**; el envío de alertas se trata en **Telegram**.`,

  [`IBS-Studio journalise les actions importantes : qui les a faites, quand, sur quoi, et — pour les changements de valeur — **avant → après**. Deux écrans selon ton rôle :

- **Mon activité** (tout le monde) : tes propres actions, dans **Réglages → Mon activité**.
- **Journal** (administrateur) : *toutes* les actions de *tous* les utilisateurs, dans **Utilisateurs & rôles → Journal**.`]:
`IBS-Studio registra las acciones importantes: quién las realizó, cuándo, sobre qué y — para los cambios de valor — **antes → después**. Dos pantallas según su rol:

- **Mi actividad** (todos): sus propias acciones, en **Ajustes → Mi actividad**.
- **Registro** (administrador): *todas* las acciones de *todos* los usuarios, en **Usuarios y roles → Registro**.`,

  [`### Les filtres : QUI / QUOI / QUAND

- **Type** : le module concerné (Accès, Données, Export, Workflows, IA, Réglages…).
- **Quoi** : l'action précise (la liste se restreint au type choisi).
- **Qui** *(Journal admin uniquement)* : l'utilisateur.
- **Quand** : une plage de dates (Du / au).

Chaque ligne montre **Quand · Action · Module · Cible**. Quand une valeur change, une ligne s'affiche dessous : **Avant** (en orange) **→ Après** (en vert) — ex. \`Avant : 79,95 € → Après : 84,95 €\`.`]:
`### Los filtros: QUIÉN / QUÉ / CUÁNDO

- **Tipo**: el módulo en cuestión (Accesos, Datos, Exportación, Workflows, IA, Ajustes…).
- **Qué**: la acción precisa (la lista se restringe al tipo elegido).
- **Quién** *(solo Registro de administrador)*: el usuario.
- **Cuándo**: un rango de fechas (Desde / hasta).

Cada línea muestra **Cuándo · Acción · Módulo · Objetivo**. Cuando un valor cambia, aparece una línea debajo: **Antes** (en naranja) **→ Después** (en verde) — ej. \`Avant : 79,95 € → Après : 84,95 €\`.`,

  [`### Ce qui est journalisé

- **Accès / rôles** : connexion, attribution/retrait de rôle, blocage/déblocage, permission accordée/révoquée, rôle modifié, suppression d'utilisateur.
- **Données** : import, enregistrement (avec la taille lignes/colonnes), renommage, déplacement, suppression d'une base, et **édition manuelle d'une cellule** (valeur avant → après).
- **Projets** : création, modification, renommage, duplication, suppression ; **versions** (création, restauration, snapshot auto).
- **Exports** : PDF, PNG, PPTX, SVG, HTML, IDML, pack social, pages déclinées, export par lot.
- **Automatisation / IA** : exécution de workflow, complétion de colonne, génération de workflow.
- **Réglages** : thème, modèle IA par défaut, budget IA mensuel.

> Les remplissages **en masse** (IA, taxonomie, enrichissement) et la **sauvegarde automatique** ne sont pas journalisés ligne par ligne, pour ne pas noyer le journal.`]:
`### Qué se registra

- **Accesos / roles**: inicio de sesión, asignación/retirada de rol, bloqueo/desbloqueo, permiso concedido/revocado, rol modificado, eliminación de usuario.
- **Datos**: importación, guardado (con el tamaño de filas/columnas), cambio de nombre, movimiento, eliminación de una base, y **edición manual de una celda** (valor antes → después).
- **Proyectos**: creación, modificación, cambio de nombre, duplicación, eliminación; **versiones** (creación, restauración, instantánea automática).
- **Exportaciones**: PDF, PNG, PPTX, SVG, HTML, IDML, pack social, páginas derivadas, exportación por lotes.
- **Automatización / IA**: ejecución de flujo de trabajo, completado de columna, generación de flujo de trabajo.
- **Ajustes**: tema, modelo de IA por defecto, presupuesto mensual de IA.

> Los rellenos **en masa** (IA, taxonomía, enriquecimiento) y el **guardado automático** no se registran fila por fila, para no saturar el registro.`,

  [`### Vider son historique

Dans **Mon activité**, le bouton **« Vider l'historique »** (avec confirmation) supprime **tes propres** entrées. Chaque utilisateur ne peut effacer que les siennes ; l'administrateur peut tout supprimer.

> Le journal est volontairement **immuable** (une entrée n'est jamais modifiée). La purge est la seule suppression possible, et elle est tracée par l'absence d'entrées — utile pour nettoyer des données de test.`]:
`### Vaciar el historial

En **Mi actividad**, el botón **«Vaciar el historial»** (con confirmación) elimina **sus propias** entradas. Cada usuario solo puede borrar las suyas; el administrador puede eliminar todo.

> El registro es deliberadamente **inmutable** (una entrada nunca se modifica). La purga es la única eliminación posible, y se rastrea por la ausencia de entradas — útil para limpiar datos de prueba.`,

  [`Carte **« PDF → SVG éditable »** (sous-titre *Page 1 rasterisée + overlays*). Convertit un **\`.pdf\`** en projet éditable.`]:
`Tarjeta **«PDF → SVG editable»** (subtítulo *Página 1 rasterizada + superposiciones*). Convierte un **\`.pdf\`** en un proyecto editable.`,

  [`### Comment ça marche

1. Si le PDF contient un **calque texte natif** exploitable, la conversion vectorielle est tentée d'abord : les textes arrivent **exacts** (pas d'OCR).
2. Sinon, la **page 1** est **rasterisée** et verrouillée en fond, puis la **même décomposition** que _Image → SVG éditable_ s'applique : les **textes détectés** deviennent des calques éditables (overlays).
3. Les images **CMYK** embarquées sont automatiquement ré-encodées en RGB (pas de couleurs inversées).

⚠️ **Seule la page 1 est traitée** — les pages suivantes sont ignorées. Pour repartir d'un **PDF existant** (BAT, ancien document) sans disposer du fichier source InDesign. Pour un import multi-pages fidèle avec fonts, préfère _Import InDesign (IDML)_.`]:
`### Cómo funciona

1. Si el PDF contiene una **capa de texto nativa** utilizable, primero se intenta la conversión vectorial: los textos llegan **exactos** (sin OCR).
2. De lo contrario, la **página 1** se **rasteriza** y se bloquea en el fondo, luego se aplica la **misma descomposición** que en _Imagen → SVG editable_: los **textos detectados** se convierten en capas editables (superposiciones).
3. Las imágenes **CMYK** incrustadas se recodifican automáticamente a RGB (sin colores invertidos).

⚠️ **Solo se procesa la página 1** — las páginas siguientes se ignoran. Útil para empezar desde un **PDF existente** (prueba de imprenta, documento antiguo) sin disponer del archivo fuente de InDesign. Para una importación multipágina fiel con fuentes, prefiera _Importación InDesign (IDML)_.`,

  [`### Texte natif vs OCR — trois niveaux

L'import suit une **cascade** : il garde toujours le niveau le plus fidèle disponible.

1. **Conversion vectorielle (MuPDF)** — tentée d'abord. Si le PDF contient du **vrai texte**, le document devient un SVG complet : paths exacts, images, et chaque mot reste du **texte réel** avec sa position, sa taille, sa couleur et sa graisse d'origine. **Zéro OCR.**
2. **Repli rasterisé + calque texte natif** — si le vectoriel échoue, la page 1 est rasterisée et verrouillée en fond, MAIS le **calque texte natif** du PDF est tout de même lu (positions et tailles exactes) : chaque mot redevient un \`<text>\` éditable posé par-dessus le fond, effacé du raster quand son fond est uni. **Toujours pas d'OCR.**
3. **OCR (« Décomposer »)** — uniquement quand le PDF est **aplati** (texte vectorisé/scanné, aucun mot détecté) : on retombe alors sur la décomposition Vision de _Image → SVG éditable_.

Autrement dit, « rasterisé » ne veut **pas** dire « OCR » : tant que le PDF garde un calque texte, vos textes restent exacts.`]:
`### Texto nativo vs OCR — tres niveles

La importación sigue una **cascada**: siempre conserva el nivel más fiel disponible.

1. **Conversión vectorial (MuPDF)** — se intenta primero. Si el PDF contiene **texto real**, el documento se convierte en un SVG completo: trazados exactos, imágenes, y cada palabra sigue siendo **texto real** con su posición, tamaño, color y grosor originales. **Cero OCR.**
2. **Alternativa rasterizada + capa de texto nativo** — si la conversión vectorial falla, la página 1 se rasteriza y se bloquea como fondo, PERO la **capa de texto nativo** del PDF se sigue leyendo (posiciones y tamaños exactos): cada palabra vuelve a ser un \`<text>\` editable superpuesto al fondo, borrado del ráster cuando su fondo es liso. **Sigue sin haber OCR.**
3. **OCR ("Descomponer")** — únicamente cuando el PDF está **acoplado** (texto contorneado o escaneado, sin palabras detectadas): en este caso se recurre a la descomposición Vision de _Imagen → SVG editable_.

En otras palabras, "rasterizado" **no** significa "OCR": mientras el PDF conserve una capa de texto, sus textos seguirán siendo exactos.`,

  [`Carte **« Importer une image »** de l'écran Importer. Formats acceptés : \`.png\`, \`.jpg\`, \`.webp\`, \`.gif\`, \`.svg\`.

L'image est posée sur le **canvas** d'un nouveau projet — elle **reste une image** (pas de décomposition). Tu peux ensuite la déplacer, la redimensionner et ajouter d'autres éléments par-dessus.`]:
`Tarjeta **"Importar una imagen"** de la pantalla Importar. Formatos aceptados: \`.png\`, \`.jpg\`, \`.webp\`, \`.gif\`, \`.svg\`.

La imagen se coloca en el **lienzo** de un nuevo proyecto — **sigue siendo una imagen** (no se descompone). A continuación, puede moverla, redimensionarla y añadir otros elementos por encima.`,

  [`Pour **éditer le texte** d'une image existante (et pas seulement la poser), utilise plutôt _Image → SVG éditable_.`]:
`Para **editar el texto** de una imagen existente (y no solo colocarla), utilice en su lugar _Imagen → SVG editable_.`,

  [`Carte **« Importer SVG »** (sous-titre *Vectoriel éditable*). Charge un fichier \`.svg\` en **calques vectoriels éditables** : formes, textes et chemins deviennent des objets manipulables dans l'éditeur.`]:
`Tarjeta **"Importar SVG"** (subtítulo *Vectorial editable*). Carga un archivo \`.svg\` como **capas vectoriales editables**: las formas, los textos y los trazados se convierten en objetos manipulables en el editor.`,

  [`### Quand l'utiliser

- Un **logo** vectoriel à retoucher ou recolorer.
- Un visuel **déjà vectorisé** (export Illustrator/Figma) à intégrer dans une maquette.

⚠️ À ne pas confondre avec **Image → SVG éditable**, qui part d'un **raster** (PNG/JPG) : là, l'image reste un fond verrouillé et seuls les textes détectés deviennent éditables.`]:
`### Cuándo utilizarlo

- Un **logotipo** vectorial para retocar o recolorear.
- Un elemento visual **ya vectorizado** (exportación de Illustrator/Figma) para integrarlo en una maqueta.

⚠️ No debe confundirse con **Imagen → SVG editable**, que parte de un **ráster** (PNG/JPG): en este caso, la imagen se mantiene como un fondo bloqueado y solo los textos detectados pasan a ser editables.`,

  [`Le module **Création studio** permet de créer et de gérer des promotions pour le point de vente : affiches, étiquettes, flyers et autres supports prêts à l'impression ou à la diffusion digitale.`]:
`El módulo **Creación studio** permite crear y gestionar promociones para el punto de venta: carteles, etiquetas, folletos y otros soportes listos para la impresión o la difusión digital.`,

  [`Ouvrir « Nouveau document »`]:
`Abrir "Nuevo documento"`,

  [`Ouvrir Démo express`]:
`Abrir Demo exprés`,

  [`Ouvrir Catalogue studio`]:
`Abrir Catálogo studio`,

  [`Ouvrir le PIM`]:
`Abrir el PIM`,

  [`Ouvrir Workflows`]:
`Abrir Workflows`,

  [`Ouvrir la Veille tarifaire`]:
`Abrir la Monitorización de precios`,

  [`Ouvrir le DAM`]:
`Abrir el DAM`,

  [`Ouvrir Telegram`]:
`Abrir Telegram`,

  [`Ouvrir les Réglages`]:
`Abrir los Ajustes`,

  [`Configurer clés & modèles (Réglages → IA)`]:
`Configurar claves y modelos (Ajustes → IA)`,

  [`Gérer les rôles (Utilisateurs & rôles)`]:
`Gestionar los roles (Usuarios y roles)`,

  [`Sauvegarder`]:
`Guardar`,

  [`Sélection`]:
`Selección`,

  [`Texte`]:
`Texto`,

  [`Rectangle`]:
`Rectángulo`,

  [`Ellipse`]:
`Elipse`,

  [`Ligne`]:
`Línea`,

  [`Image / DAM`]:
`Imagen / DAM`,

  [`Panneau Calques`]:
`Panel Capas`,

  [`Zoom arrière`]:
`Alejar`,

  [`Zoom 100 %`]:
`Zoom 100 %`,

  [`Zoom avant`]:
`Acercar`,

  [`Paramètres de la page`]:
`Ajustes de la página`,

  [`Grille`]:
`Cuadrícula`,

  [`Snap`]:
`Ajustar`,

  [`Panneau de droite de l'éditeur (Propriétés / Calques)`]:
`Panel derecho del editor (Propiedades / Capas)`,

  [`Espace Données (créer / gérer la source)`]:
`Espacio Datos (crear / gestionar la fuente)`,

  [`Espace Données (créer/gérer la base)`]:
`Espacio Datos (crear/gestionar la base)`,

  [`Espace Données`]:
`Espacio Datos`,

  [`Exporter par lot (une variante par ligne)`]:
`Exportar por lotes (una variante por fila)`,

  [`Exporter (par lot) depuis l'éditeur`]:
`Exportar (por lotes) desde el editor`,

  [`Bouton Exporter (depuis l'éditeur)`]:
`Botón Exportar (desde el editor)`,

  [`Ouvrir Animation`]:
`Abrir Animación`,

  [`Voir les animations dans le DAM`]:
`Ver las animaciones en el DAM`,

  [`Génération d'image (DAM)`]:
`Generación de imagen (DAM)`,

  [`Génération d'image dédiée (DAM)`]:
`Generación de imagen dedicada (DAM)`,

  [`Importer un IDML`]:
`Importar un IDML`,

  [`Réglages → Token du plugin InDesign`]:
`Ajustes → Token del plugin InDesign`,

  [`Ouvrir Importer`]:
`Abrir Importar`,

  [`Voir Image → SVG éditable`]:
`Ver Imagen → SVG editable`,

  [`Gérer les templates scraping`]:
`Gestionar las plantillas de scraping`,

  [`Ouvrir Templates scraping`]:
`Abrir Plantillas de scraping`,

  [`Ouvrir les Taxonomies`]:
`Abrir las Taxonomías`,

  [`Ouvrir Taxonomies`]:
`Abrir Taxonomías`,

  [`Export (ouvre un projet d'abord)`]:
`Exportación (abra un proyecto primero)`,

  [`Ouvrir Scraping Hub`]:
`Abrir Scraping Hub`,

  [`Construire le workflow (Workflows)`]:
`Construir el flujo de trabajo (Flujos de trabajo)`,

  [`Configurer les alertes (Telegram)`]:
`Configurar las alertas (Telegram)`,

  [`Ouvrir Création studio`]:
`Abrir Estudio de creación`,

  [`Ouvrir le Chat IA`]:
`Abrir el Chat IA`,

  [`Ouvrir Utilisateurs & rôles`]:
`Abrir Usuarios y roles`,

  [`Réglages → Mon activité`]:
`Ajustes → Mi actividad`,

  [`Utilisateurs & rôles → Journal (admin)`]:
`Usuarios y roles → Registro (admin)`,

  [`Gérer les permissions (Utilisateurs & rôles)`]:
`Gestionar los permisos (Usuarios y roles)`,

  [`Ouvrir Paramètres → Données`]:
`Abrir Parámetros → Datos`,

  [`Renseigne **au moins une clé API** parmi Gemini, Claude (Anthropic), OpenAI, DeepSeek, Qwen, Kimi, GLM (Z.ai) ou OpenRouter, puis teste-la. Tant qu'aucune clé valide n'est saisie, le bouton **Suivant** reste désactivé (*« Renseignez au moins une clé LLM »*). C'est la seule étape réellement bloquante.`]:
`Introduzca **al menos una clave API** entre Gemini, Claude (Anthropic), OpenAI, DeepSeek, Qwen, Kimi, GLM (Z.ai) u OpenRouter, y luego pruébela. Mientras no se introduzca una clave válida, el botón **Siguiente** permanecerá desactivado (*«Introduzca al menos una clave LLM»*). Esta es la única etapa realmente bloqueante.`,

  [`Choisis le modèle de chaque fournisseur et l'ordre de la **cascade de raisonnement** (le premier qui répond gagne, les suivants servent de secours). Le bouton **« Mettre à jour tous les LLM (dernières versions) »** réaligne d'un clic toute la sélection sur les modèles phares du catalogue.`]:
`Elija el modelo de cada proveedor y el orden de la **cascada de razonamiento** (el primero que responde gana, los siguientes sirven de respaldo). El botón **«Actualizar todos los LLM (últimas versiones)»** realinea con un clic toda la selección con los modelos destacados del catálogo.`,

  [`Branche **Google Drive**, **Bright Data** (scraping) et **Telegram** si tu en as besoin. Cette étape peut être passée et complétée plus tard dans *Réglages → Connecteurs*.`]:
`Conecte **Google Drive**, **Bright Data** (scraping) y **Telegram** si los necesita. Esta etapa puede omitirse y completarse más adelante en *Ajustes → Conectores*.`,

  [`Récapitulatif de ton profil, puis le choix de **lancer la visite guidée du tableau de bord** ou de terminer directement.`]:
`Resumen de su perfil, seguido de la opción de **iniciar la visita guiada del panel de control** o finalizar directamente.`,

  [`Insertion d'images sans quitter l'éditeur : onglets **Galerie**, **Upload**, **IA** (génération depuis un prompt, 5 ratios, image-to-image si un objet est sélectionné), **Stock**, **Mes images**, **Favoris**, **Collections**, **Récents** — les mêmes sources que le DAM.`]:
`Inserción de imágenes sin salir del editor: pestañas **Galería**, **Subida**, **IA** (generación desde un prompt, 5 proporciones, imagen a imagen si se selecciona un objeto), **Stock**, **Mis imágenes**, **Favoritos**, **Colecciones**, **Recientes** — las mismas fuentes que el DAM.`,

  [`Les **images et polices du projet** (onglets avec compteurs). Glisse une image sur le canvas, ou utilise les polices importées (IDML) dans tes textes.`]:
`Las **imágenes y fuentes del proyecto** (pestañas con contadores). Arrastre una imagen al lienzo, o utilice las fuentes importadas (IDML) en sus textos.`,

  [`Format de page : **presets** (A4/A3/A5, Full HD, 4K, 16:9, post & story Instagram, couverture Facebook) ou dimensions personnalisées en mm. **Fond de page** : couleur unie, dégradé ou image (upload ou glisser-déposer). C'est aussi ici que se gèrent les pages multiples.`]:
`Formato de página: **ajustes preestablecidos** (A4/A3/A5, Full HD, 4K, 16:9, post y story de Instagram, portada de Facebook) o dimensiones personalizadas en mm. **Fondo de página**: color sólido, degradado o imagen (subida o arrastrar y soltar). Aquí también se gestionan las páginas múltiples.`,

  [`Tout le pré-presse : **DPI**, **fond perdu** (bleed), **traits de coupe** (longueur 2–10 mm, décalage 0–3 mm, épaisseur, couleur), **hirondelles de repérage** (registration marks), **zone de sécurité** (marge, pointillés paramétrables) et la section **Preflight** (voir plus bas). Tu peux enregistrer tous ces réglages comme une **famille de paramètres** (preset d'impression) réutilisable d'un projet à l'autre : un sélecteur en haut du panneau permet de **créer**, **mettre à jour** ou **supprimer** un preset et de l'appliquer en un clic.`]:
`Todo el preimpresión: **DPI**, **sangrado** (bleed), **marcas de corte** (longitud 2–10 mm, desplazamiento 0–3 mm, grosor, color), **marcas de registro** (registration marks), **zona de seguridad** (margen, líneas de puntos configurables) y la sección **Preflight** (ver más abajo). Puede guardar todos estos ajustes como una **familia de parámetros** (ajuste preestablecido de impresión) reutilizable de un proyecto a otro: un selector en la parte superior del panel permite **crear**, **actualizar** o **eliminar** un ajuste preestablecido y aplicarlo con un clic.`,

  [`Applique des **animations 3D** à un objet (flip 3D, relief, particules…) via des presets, avec lecture/arrêt et **enregistrement vidéo** (export MP4/WebM) du rendu animé.`]:
`Aplique **animaciones 3D** a un objeto (giro 3D, relieve, partículas…) mediante ajustes preestablecidos, con reproducción/detención y **grabación de vídeo** (exportación MP4/WebM) del resultado animado.`,

  [`Une **liaison** \`{{champ}}\` (ou « Lier à un champ ») **remplace le contenu** d'un élément par la valeur de la colonne (texte, image). Une **règle conditionnelle** ne remplace rien : elle **change l'apparence ou la visibilité** de l'élément selon une condition. Les deux se combinent : un bloc prix peut afficher \`{{prix}}\` **et** passer en rouge si \`stock\` est inférieur à 5.`]:
`Un **enlace** \`{{champ}}\` (o «Vincular a un campo») **reemplaza el contenido** de un elemento por el valor de la columna (texto, imagen). Una **regla condicional** no reemplaza nada: **cambia la apariencia o la visibilidad** del elemento según una condición. Ambos se combinan: un bloque de precio puede mostrar \`{{prix}}\` **y** cambiar a rojo si \`stock\` es inferior a 5.`,

  [`Si une propriété est **à la fois** pilotée par une liaison de données (ex. couleur câblée sur une colonne) **et** par une règle qui la modifie (Changer la couleur / Changer l'opacité), les deux peuvent se contredire. IBS-Studio l'**avertit** au lieu de masquer le conflit. Solution : pilote la propriété **soit** par la liaison, **soit** par la règle, pas les deux.`]:
`Si una propiedad está controlada **al mismo tiempo** por un enlace de datos (ej. color vinculado a una columna) **y** por una regla que la modifica (Cambiar el color / Cambiar la opacidad), ambas pueden contradecirse. IBS-Studio **advierte** de ello en lugar de ocultar el conflicto. Solución: controle la propiedad **ya sea** mediante el enlace **o** mediante la regla, no ambos.`,

  [`Connecte une **source de données** (Excel, Google Sheets, PIM…) depuis le panneau **Publipostage**. Sans aucune source — jamais branchée — il n'y a pas de colonnes à tester. Si une source a déjà été utilisée, ses champs restent proposés même hors connexion live (les règles s'évalueront alors à la fusion / à l'export).`]:
`Conecte una **fuente de datos** (Excel, Google Sheets, PIM…) desde el panel **Combinación de correspondencia**. Sin ninguna fuente —nunca conectada— no hay columnas para probar. Si ya se ha utilizado una fuente, sus campos seguirán estando disponibles incluso sin conexión en vivo (las reglas se evaluarán entonces en la fusión / en la exportación).`,

  [`L'aperçu live nécessite une **source connectée** (panneau Publipostage). Hors connexion, la règle est bien **enregistrée** sur l'objet, mais son effet ne sera visible qu'au moment du publipostage / de l'export par lot. Reconnecte la source pour retrouver l'aperçu immédiat.`]:
`La vista previa en vivo requiere una **fuente conectada** (panel Combinación de correspondencia). Sin conexión, la regla queda **guardada** en el objeto, pero su efecto solo será visible en el momento de la combinación de correspondencia / de la exportación por lotes. Vuelva a conectar la fuente para recuperar la vista previa inmediata.`,

  [`Le panneau reprend la logique des **actions conditionnelles d'EasyCatalog** (Contient, Est, Est égal à, Cacher…). Les actions propres au flux InDesign (« Conserver avec suivant », reflow) n'ont pas de sens sur un canvas en positionnement absolu et sont volontairement absentes. À la place, IBS-Studio ajoute les transformations **couleur**, **opacité** et **taille**.`]:
`El panel retoma la lógica de las **acciones condicionales de EasyCatalog** (Contiene, Es, Es igual a, Ocultar…). Las acciones propias del flujo de InDesign («Mantener con el siguiente», reflow) no tienen sentido en un lienzo con posicionamiento absoluto y se han omitido deliberadamente. En su lugar, IBS-Studio añade las transformaciones de **color**, **opacidad** y **tamaño**.`,

  [`Décris ton **sujet**, et optionnellement l'**audience**, l'**objectif**, le **ton**, la **marque** et un **caption**. L'IA compose une **séquence de 2 à 5 scènes** (accroche → visuel → appel à l'action) avec titres, chiffres clés, icônes et transitions, puis choisit un thème visuel et une palette cohérents.`]:
`Describa su **tema**, y opcionalmente la **audiencia**, el **objetivo**, el **tono**, la **marca** y un **caption**. La IA compone una **secuencia de 2 a 5 escenas** (gancho → elemento visual → llamada a la acción) con títulos, cifras clave, iconos y transiciones, y luego elige un tema visual y una paleta coherentes.`,

  [`Depuis l'éditeur, on capture le **SVG du projet courant** et l'IA l'**anime** (apparitions, rythme, easing) selon une consigne de style. Idéal pour transformer une création print en teaser animé.`]:
`Desde el editor, se captura el **SVG del proyecto actual** y la IA lo **anima** (apariciones, ritmo, easing) según una instrucción de estilo. Ideal para transformar una creación print en un teaser animado.`,

  [`Glisse des **images, PDF ou SVG** pour enrichir le brief : l'IA les lit (texte + visuel) et s'en sert comme contexte.`]:
`Arrastre **imágenes, PDF o SVG** para enriquecer el brief: la IA los lee (texto + elemento visual) y los utiliza como contexto.`,

  [`Vérifie que l'IDML provient bien d'un document **piloté par EasyCatalog** (les champs y sont insérés via le panneau EasyCatalog, repérables aux crochets verts). Un texte tapé à la main n'est pas un champ. La reconnaissance a été validée sur InDesign 2026 ; des versions très anciennes peuvent stocker les champs différemment.`]:
`Compruebe que el IDML proviene realmente de un documento **controlado por EasyCatalog** (los campos se insertan a través del panel EasyCatalog, identificables por los corchetes verdes). Un texto escrito a mano no es un campo. El reconocimiento ha sido validado en InDesign 2026; las versiones muy antiguas pueden almacenar los campos de manera diferente.`,

  [`Une **URL** d'image (ex. lien Firebase/DAM) se charge directement. Un simple **nom de fichier** est résolu via ton stockage si le fichier y existe. Le binding image se branche tout seul sur le cadre EasyCatalog importé.

À l'export EasyCatalog, les colonnes image sont aussi inscrites dans le zip sous forme de **noms de fichiers** dans la donnée, et un manifeste \`images.csv\` (colonnes \`ecFieldName, row_key, url, filename\`) te donne la table URL → fichier pour rapatrier les visuels dans le dossier image du data source.`]:
`Una **URL** de imagen (p. ej., enlace Firebase/DAM) se carga directamente. Un simple **nombre de archivo** se resuelve a través de su almacenamiento si el archivo existe allí. La vinculación de imagen se conecta por sí sola al marco de EasyCatalog importado.

En la exportación de EasyCatalog, las columnas de imagen también se inscriben en el zip en forma de **nombres de archivos** en los datos, y un manifiesto \`images.csv\` (columnas \`ecFieldName, row_key, url, filename\`) le proporciona la tabla URL → archivo para recuperar los elementos visuales en la carpeta de imágenes del origen de datos.`,

  [`IBS-Studio prend ta **colonne primaire** comme clé EasyCatalog **si** toutes ses valeurs sont uniques et non vides. Sinon, il **synthétise** une clé \`_ec_key\` (\`row_1\`, \`row_2\`, …) pour garantir une re-synchronisation fiable. Le \`README.txt\` du zip rappelle quel champ sert de clé et s'il a été généré.

Les **noms de champs** exportés sont assainis pour rester stables : lettres et chiffres (accents inclus) conservés, le reste collapsé en \`_\`, et dédoublonnage insensible à la casse (suffixe \`_2\`, \`_3\`…). C'est la même règle qui permet aux noms de matcher au publipostage.`]:
`IBS-Studio toma su **columna principal** como clave de EasyCatalog **si** todos sus valores son únicos y no están vacíos. De lo contrario, **sintetiza** una clave \`_ec_key\` (\`row_1\`, \`row_2\`, …) para garantizar una resincronización fiable. El \`README.txt\` del zip recuerda qué campo sirve como clave y si ha sido generado.

Los **nombres de campos** exportados se sanean para mantenerse estables: se conservan letras y números (acentos incluidos), el resto se colapsa en \`_\`, y la deduplicación no distingue entre mayúsculas y minúsculas (sufijo \`_2\`, \`_3\`…). Es la misma regla que permite que los nombres coincidan en la combinación de datos.`,

  [`- Les champs sous **forme qualifiée** (référence data source complète, marqueurs \`$ID/2\`/\`$ID/3\`) ne sont pas encore convertis en placeholders et restent en texte ; seule la forme simple \`$ID/4\`/\`$ID/5\` est reconnue.
- Un champ **vide** dans le gabarit d'origine génère quand même son placeholder à l'import (la paire de marqueurs suffit).
- À l'export IDML, les **images** ne sont pas ré-incorporées dans le fichier : EasyCatalog les re-tire depuis sa propre source à la réouverture (le cadre et son champ sont conservés).`]:
`- Los campos en **forma cualificada** (referencia completa del origen de datos, marcadores \`$ID/2\`/\`$ID/3\`) aún no se convierten en marcadores de posición y permanecen como texto; solo se reconoce la forma simple \`$ID/4\`/\`$ID/5\`.
- Un campo **vacío** en la plantilla original genera igualmente su marcador de posición en la importación (el par de marcadores es suficiente).
- En la exportación IDML, las **imágenes** no se vuelven a incorporar en el archivo: EasyCatalog las recupera desde su propia fuente al volver a abrir (el marco y su campo se conservan).`,

  [`Les deux aboutissent au même résultat (champs \`{{…}}\` connectés). **EasyCatalog** s'impose si ton flux print l'utilise déjà (re-synchro côté InDesign). **Le balisage XML natif** est gratuit, intégré à InDesign, et suffit pour brancher une base et fusionner depuis le web. Tu peux mélanger : IBS-Studio lit les deux à l'import.`]:
`Ambos conducen al mismo resultado (campos \`{{…}}\` conectados). **EasyCatalog** se impone si su flujo de impresión ya lo utiliza (resincronización en el lado de InDesign). **El etiquetado XML nativo** es gratuito, está integrado en InDesign y es suficiente para conectar una base de datos y fusionar desde la web. Puede mezclar ambos: IBS-Studio lee los dos en la importación.`,

  [`Les crochets \`[ ]\` n'apparaissent que sur du **texte** balisé. Si tu as appliqué la balise au **cadre** (rectangle) au lieu du texte, tu obtiens un cadre coloré dans la Structure mais pas de crochets — et la valeur ne sera pas remplacée. Sélectionne le **texte** du bloc puis ré-applique la balise.`]:
`Los corchetes \`[ ]\` solo aparecen en el **texto** etiquetado. Si ha aplicado la etiqueta al **marco** (rectángulo) en lugar de al texto, obtendrá un marco coloreado en la Estructura pero no corchetes, y el valor no será reemplazado. Seleccione el **texto** del bloque y vuelva a aplicar la etiqueta.`,

  [`Le nom de la balise doit correspondre au **nom de la colonne** de ta base. La **casse**, les **accents** et les espaces/underscores sont tolérés à la correspondance (ex. \`Prix normal\` ↔ colonne \`Prix_normal\`). En cas de doute, copie le nom exact depuis l'**Espace Données**.`]:
`El nombre de la etiqueta debe coincidir con el **nombre de la columna** de su base de datos. Las **mayúsculas y minúsculas**, los **acentos** y los espacios/guiones bajos se toleran en la correspondencia (p. ej., \`Prix normal\` ↔ columna \`Prix_normal\`). En caso de duda, copie el nombre exacto desde el **Espacio de Datos**.`,

  [`Le plug-in est distribué en **mode développeur (UXP)** : il se charge manuellement à chaque session via l'UXP Developer Tool. Vérifie que le **token** collé est bien celui généré dans **Réglages → Token du plugin InDesign** (chaque utilisateur a le sien). Rappel : le balisage XML natif (étape 1) ne nécessite **aucun** plug-in et reste la voie recommandée.`]:
`El plugin se distribuye en **modo desarrollador (UXP)**: se carga manualmente en cada sesión a través de UXP Developer Tool. Compruebe que el **token** pegado sea el generado en **Ajustes → Token del plugin InDesign** (cada usuario tiene el suyo). Recordatorio: el etiquetado XML nativo (paso 1) no requiere **ningún** plugin y sigue siendo la vía recomendada.`,

  [`Une fois ta base branchée, tu peux faire **réagir** un élément à la valeur de chaque ligne (masquer un bandeau « PROMO » hors promotion, passer un prix en rouge sous un seuil de stock, agrandir un picto « nouveauté »…). C'est le rôle des **Règles conditionnelles** : sélectionne l'objet dans l'éditeur, ouvre le panneau **Propriétés → Règles conditionnelles** et compose tes conditions. Balisage XML (ou EasyCatalog) pour brancher la donnée **+** règles conditionnelles pour la mise en forme = l'alternative complète à un flux print piloté par données. Voir la section **Règles conditionnelles**.`]:
`Una vez conectada la base de datos, es posible hacer **reaccionar** un elemento al valor de cada fila (ocultar un banner "PROMO" fuera de promoción, cambiar un precio a rojo por debajo de un umbral de stock, ampliar un pictograma de "novedad"…). Esta es la función de las **Reglas condicionales**: seleccione el objeto en el editor, abra el panel **Propiedades → Reglas condicionales** y componga sus condiciones. Etiquetado XML (o EasyCatalog) para conectar los datos **+** reglas condicionales para el formato = la alternativa completa a un flujo de impresión basado en datos. Consulte la sección **Reglas condicionales**.`,

  [`Quand le PDF passe par la **conversion vectorielle**, l'import ne se contente pas de séparer texte et fond — il reconstruit des objets vraiment manipulables :

- **Blocs de texte regroupés** : un **prix composé** (« 22 DT ,99 »), une **bulle** (« 30 % d'économie »), une **pastille** (« +55g GRATUIT ») sont rassemblés en **un seul groupe** déplaçable d'un tenant, au lieu de mots éparpillés.
- **Ombres portées InDesign** → converties en **ombre native** éditable depuis le panneau Ombre (au lieu d'un voile gris).
- **Images CMYK** (photos InDesign/Adobe) → ré-encodées en **RGB** pour éviter le rendu noir/inversé des navigateurs.
- **Marques d'impression** (traits de coupe, repères) et **doublons d'impression** (passe blanche + passe encrée superposées) sont déballés/dédoublonnés pour ne pas bloquer la sélection ni polluer les calques.`]:
`Cuando el PDF pasa por la **conversión vectorial**, la importación no se limita a separar el texto del fondo, sino que reconstruye objetos verdaderamente manipulables:

- **Bloques de texto agrupados**: un **precio compuesto** ("22 DT ,99"), un **bocadillo** ("30 % de ahorro"), un **distintivo** ("+55g GRATIS") se reúnen en **un solo grupo** que se puede desplazar de una vez, en lugar de palabras dispersas.
- **Sombras paralelas de InDesign** → convertidas en **sombra nativa** editable desde el panel Sombra (en lugar de un velo gris).
- **Imágenes CMYK** (fotos InDesign/Adobe) → recodificadas en **RGB** para evitar la renderización negra/invertida de los navegadores.
- **Marcas de impresión** (marcas de corte, marcas de registro) y **duplicados de impresión** (pasada blanca + pasada entintada superpuestas) se desempaquetan/desduplican para no bloquear la selección ni saturar las capas.`,

  [`Pour que le rendu ne retombe pas sur une police par défaut :

- Les **polices embarquées** dans le PDF (sous-ensembles TrueType) sont **extraites et chargées** sous leur vraie famille (« WRZTFA+ArialNarrow-Bold » → *Arial Narrow*, gras).
- Les familles non extractibles (ex. **Bebas Neue**) sont récupérées depuis **Google Fonts**, en graisses **400 et 700** (pour éviter un faux-gras synthétique).
- La **chasse** de chaque texte est ensuite **calée sur sa largeur d'origine** : le texte condensé du design (« 30 % » comprimé) ne déborde plus sur son voisin, même si la police de rendu n'a pas les métriques exactes.`]:
`Para que la renderización no recurra a una fuente por defecto:

- Las **fuentes incrustadas** en el PDF (subconjuntos TrueType) son **extraídas y cargadas** bajo su verdadera familia ("WRZTFA+ArialNarrow-Bold" → *Arial Narrow*, negrita).
- Las familias no extraíbles (ej. **Bebas Neue**) se recuperan desde **Google Fonts**, en grosores **400 y 700** (para evitar una falsa negrita sintética).
- El **tracking** de cada texto se **ajusta a su anchura original**: el texto condensado del diseño ("30 %" comprimido) ya no se desborda sobre su vecino, incluso si la fuente de renderización no tiene las métricas exactas.`,

  [`Si le PDF d'origine contient déjà des **champs de fusion** \`{{…}}\` (publipostage), l'import les reconnaît et leur attache leur **cadre de composition** : largeur du bloc + **alignement détecté** sur la géométrie réelle (bords droits communs → aligné à droite, centres → centré).

Ces champs deviennent des **Textbox à cadre fixe** : à la fusion, les valeurs longues **reviennent à la ligne** dans le cadre au lieu de déborder, et l'alignement du design est conservé. Le moteur de publipostage descend aussi **dans les blocs groupés** pour retrouver ces champs.`]:
`Si el PDF original ya contiene **campos de fusión** \`{{…}}\` (combinación de correspondencia), la importación los reconoce y les asigna su **marco de composición**: anchura del bloque + **alineación detectada** sobre la geometría real (bordes derechos comunes → alineado a la derecha, centros → centrado).

Estos campos se convierten en **Cajas de texto de marco fijo**: en la fusión, los valores largos **pasan a la línea siguiente** dentro del marco en lugar de desbordarse, y se conserva la alineación del diseño. El motor de combinación de correspondencia también desciende **en los bloques agrupados** para encontrar estos campos.`,

  [`- **Page 1 uniquement** : les pages suivantes sont ignorées. Pour un multi-pages fidèle, préférez _Import InDesign (IDML)_.
- Idéal pour **repartir d'un PDF existant** (BAT, ancien document) quand le fichier source InDesign n'est plus disponible.
- Un PDF **scanné ou totalement aplati** n'a pas de calque texte : on passe alors par l'**OCR** (« Décomposer »), de fidélité moindre.
- Le SVG généré est **marqué** pour que l'éditeur **n'enclenche pas l'OCR** quand un calque texte natif est déjà présent.`]:
`- **Solo página 1**: se ignoran las páginas siguientes. Para una importación multipágina fiel, prefiera _Importar InDesign (IDML)_.
- Ideal para **partir de un PDF existente** (prueba de imprenta, documento antiguo) cuando el archivo fuente de InDesign ya no está disponible.
- Un PDF **escaneado o totalmente acoplado** no tiene capa de texto: en ese caso se recurre al **OCR** («Separar»), que ofrece menor fidelidad.
- El SVG generado está **marcado** para que el editor **no active el OCR** cuando ya existe una capa de texto nativa.`,

  [`Recherche dans **Pexels & Unsplash** (millions de photos libres de droits) avec filtres source / orientation / couleur.`]:
`Búsqueda en **Pexels & Unsplash** (millones de fotos libres de derechos) con filtros de origen / orientación / color.`,

  [`Tes images **sauvegardées** — depuis la banque ou issues de la génération IA.`]:
`Sus imágenes **guardadas** — desde el banco de imágenes o procedentes de la generación por IA.`,

  [`Les images que tu as marquées d'un **♥** pour un accès rapide.`]:
`Las imágenes que ha marcado con un **♥** para un acceso rápido.`,

  [`Des **dossiers d'organisation** que tu crées et remplis toi-même.`]:
`**Carpetas de organización** que puede crear y rellenar usted mismo.`,

  [`Les **derniers ajouts**, triés par date.`]:
`Las **últimas adiciones**, ordenadas por fecha.`,

  [`Les **images et les polices** du projet courant, prêtes à glisser sur le canvas.`]:
`Las **imágenes y fuentes** del proyecto actual, listas para arrastrar al lienzo.`,

  [`Génération d'images par IA (**Gemini / Image IA**) — voir le détail des paramètres plus bas.`]:
`Generación de imágenes por IA (**Gemini / Image IA**) — consulte el detalle de los parámetros más abajo.`,

  [`Tes **compositions vidéo** (HyperFrames).`]:
`Sus **composiciones de vídeo** (HyperFrames).`,

  [`Accès à tes **fichiers Google Drive** une fois ton compte connecté.`]:
`Acceso a sus **archivos de Google Drive** una vez conectada su cuenta.`,

  [`Décris l'image à générer. Tu peux **coller une image** dans le champ : elle rejoint les *fichiers de référence*. Deux assistants :

- **« Améliorer »** — réécrit ton prompt en **une passe** (sujet, style, composition, éclairage, qualité), en tenant compte des références.
- **« Avec questions »** — l'IA pose **3 à 6 questions ciblées** (environnement, éclairage, mise en page, ambiance…) ; tes réponses affinent le prompt. Utile quand le brief est flou.`]:
`Describa la imagen que desea generar. Puede **pegar una imagen** en el campo: esta se unirá a los *archivos de referencia*. Dos asistentes:

- **«Mejorar»** — reescribe su prompt en **una pasada** (sujeto, estilo, composición, iluminación, calidad), teniendo en cuenta las referencias.
- **«Con preguntas»** — la IA plantea **de 3 a 6 preguntas específicas** (entorno, iluminación, diseño, ambiente…); sus respuestas perfeccionan el prompt. Útil cuando el briefing es impreciso.`,

  [`Bouton **« Ajouter des fichiers »** (ou colle une image). **Tous formats** : images, logos, **PDF**, **SVG** (rastérisé en PNG, **plafonné à 2048 px**). Les références sont **transmises telles quelles** à Image IA qui les **voit** : il préserve leur structure et n'applique que les changements demandés (branding, texte, décor). Vignette + **✕** pour retirer.`]:
`Botón **«Añadir archivos»** (o pegue una imagen). **Todos los formatos**: imágenes, logotipos, **PDF**, **SVG** (rasterizado a PNG, **limitado a 2048 px**). Las referencias se **transmiten tal cual** a Image IA, que las **ve**: preserva su estructura y solo aplica los cambios solicitados (branding, texto, decorado). Miniatura + **✕** para eliminar.`,

  [`- **Images & texte** _(défaut)_ : image **+ texte** — le modèle peut commenter brièvement.
- **Images seul.** : **image uniquement** — force la sortie visuelle et empêche le modèle de répondre en mode conversationnel (utile s'il « parle » au lieu de générer).`]:
`- **Imágenes y texto** _(por defecto)_: imagen **+ texto** — el modelo puede comentar brevemente.
- **Solo imágenes**: **únicamente imagen** — fuerza la salida visual e impide que el modelo responda en modo conversacional (útil si «habla» en lugar de generar).`,

  [`Curseur, pas de 0,1. Règle la créativité :

- **0 — Précis** : déterministe, fidèle au prompt/références.
- **2 — Créatif** : plus de liberté et de variation.

Reproduire une référence → baisse vers 0 ; explorer → monte vers 2.`]:
`Control deslizante, en pasos de 0,1. Ajusta la creatividad:

- **0 — Preciso**: determinista, fiel al prompt/referencias.
- **2 — Creativo**: más libertad y variación.

Reproducir una referencia → baje hacia 0; explorar → suba hacia 2.`,

  [`\`Auto\` · \`1:1\` · \`16:9\` · \`9:16\` · \`4:3\` · \`3:4\`.

- **Auto** _(défaut)_ : le modèle choisit le cadrage adapté au prompt/références (aucune contrainte envoyée).
- Les autres **imposent** le rapport : \`1:1\` carré (réseaux), \`16:9\` / \`4:3\` paysage, \`9:16\` / \`3:4\` portrait.`]:
`\`Auto\` · \`1:1\` · \`16:9\` · \`9:16\` · \`4:3\` · \`3:4\`.

- **Auto** _(por defecto)_: el modelo elige el encuadre adaptado al prompt/referencias (no se envía ninguna restricción).
- Los demás **imponen** la proporción: \`1:1\` cuadrado (redes), \`16:9\` / \`4:3\` paisaje, \`9:16\` / \`3:4\` retrato.`,

  [`\`1K\` _(défaut)_ · \`2K\` · \`4K\`. Définition du visuel. ⚠️ **2K et 4K sont 2 à 3× plus lents** — réserve-les au rendu final, reste en 1K pour itérer.`]:
`\`1K\` _(por defecto)_ · \`2K\` · \`4K\`. Resolución del elemento visual. ⚠️ **2K y 4K son de 2 a 3 veces más lentos** — resérvelos para el renderizado final, manténgase en 1K para iterar.`,

  [`\`1\` _(défaut)_ · \`2\` · \`4\`. Génère **N variations** en parallèle du même prompt — pour comparer plusieurs propositions d'un coup.`]:
`\`1\` _(por defecto)_ · \`2\` · \`4\`. Genera **N variaciones** en paralelo del mismo prompt — para comparar varias propuestas a la vez.`,

  [`Bouton **« Générer »**. Pour chaque image :

- **Télécharger** — PNG en local.
- **Sauvegarder** — vers **« Mes images »** (prompt d'origine, prompt amélioré et Q/R conservés en métadonnées).
- **Insérer dans l'éditeur** — place l'image dans le projet ouvert.

**Réinitialiser / Effacer** vide les résultats. Idéal pour visuels d'ambiance, mockups, illustrations ; pour de **vraies photos produit**, privilégie la banque ou le scraping.`]:
`Botón **«Generar»**. Para cada imagen:

- **Descargar** — PNG en local.
- **Guardar** — en **«Mis imágenes»** (el prompt original, el prompt mejorado y las P/R se conservan en los metadatos).
- **Insertar en el editor** — coloca la imagen en el proyecto abierto.

**Restablecer / Borrar** vacía los resultados. Ideal para imágenes de ambiente, mockups e ilustraciones; para **fotos de producto reales**, priorice el banco de imágenes o el scraping.`,

  [`**Zoom** avant/arrière + ajustement, **Rotation** par 90°, **Miroir** horizontal et vertical.`]:
`**Zoom** acercar/alejar + ajustar, **Rotación** de 90°, **Espejo** horizontal y vertical.`,

  [`Masque interactif à **8 poignées**, grille des **tiers**, **contraintes de ratio** (libre, 1:1, 4:3, 3:4, 16:9, 9:16, 3:2, 2:3).`]:
`Máscara interactiva con **8 tiradores**, cuadrícula de los **tercios**, **restricciones de proporción** (libre, 1:1, 4:3, 3:4, 16:9, 9:16, 3:2, 2:3).`,

  [`Sliders **Luminosité**, **Contraste**, **Saturation**, **Teinte** (rendu via filtre CSS, non destructif).`]:
`Controles deslizantes de **Brillo**, **Contraste**, **Saturación**, **Tono** (renderizado mediante filtro CSS, no destructivo).`,

  [`Formats **PNG / JPEG / WebP**, avec réglage de **qualité** (JPEG/WebP) et d'**échelle** (% de la résolution native).`]:
`Formatos **PNG / JPEG / WebP**, con ajuste de **calidad** (JPEG/WebP) y de **escala** (% de la resolución nativa).`,

  [`Annule **toutes** les retouches et revient à l'image d'origine.`]:
`Cancela **todos** los retoques y vuelve a la imagen original.`,

  [`Une base Firestore **dédiée** « Démo {Société} » avec les produits enrichis et leur taxonomie — jamais d'écrasement de vos données existantes. Si le studio est vierge (cas nominal du compte démo), la base est chargée à l'écran.`]:
`Una base Firestore **dedicada** «Demo {Empresa}» con los productos enriquecidos y su taxonomía — sus datos existentes nunca se sobrescriben. Si el estudio está vacío (caso nominal de la cuenta demo), la base se carga en la pantalla.`,

  [`Une image par produit déposée dans le Drive, dossier **« Démo {Société} »**. Si le Drive n'est pas connecté ou le quota atteint, les cellules gardent les URLs externes des images (qui restent affichées).`]:
`Una imagen por producto depositada en Drive, carpeta **«Demo {Empresa}»**. Si Drive no está conectado o se ha alcanzado la cuota, las celdas conservan las URL externas de las imágenes (que se siguen mostrando).`,

  [`Un catalogue **lié à la source** PIM, monté avec la charte du site (palette extraite), un plan IA piloté par vos consignes créatives et une couverture générée.`]:
`Un catálogo **vinculado a la fuente** PIM, montado con la identidad corporativa del sitio (paleta extraída), un plan de IA guiado por sus instrucciones creativas y una portada generada.`,

  [`Une carte promo **data-driven** aux couleurs du prospect (accent et bandeau issus de la charte), sur l'instantané complet des produits.`]:
`Una tarjeta promocional **data-driven** con los colores del cliente potencial (acento y banner extraídos de la identidad corporativa), sobre la instantánea completa de los productos.`,

  [`Un workflow prêt à rejouer : **Scraper des URLs** (jusqu'à 3 vraies URLs produits du site) → **Export Excel**. Idéal pour montrer l'automatisation en live.`]:
`Un flujo de trabajo listo para reproducir: **Scrapear URL** (hasta 3 URL de productos reales del sitio) → **Exportación Excel**. Ideal para mostrar la automatización en directo.`,

  [`Les **règles rédactionnelles** de l'équipe (markdown) : conventions de nommage, formats de prix, langue des descriptions… Stockées dans Firestore et **partagées par toute l'équipe**, elles servent de référence commune aux enrichissements. L'édition requiert la permission *Éditer les règles de scraping*.`]:
`Las **reglas de redacción** del equipo (markdown): convenciones de nomenclatura, formatos de precios, idioma de las descripciones… Almacenadas en Firestore y **compartidas por todo el equipo**, sirven de referencia común para los enriquecimientos. Su edición requiere el permiso *Editar las reglas de scraping*.`,

  [`Vue d'ensemble de **tous les templates groupés par domaine fournisseur** : déplie un fournisseur pour voir ses templates et leur état, et ouvre directement l'éditeur de template d'un clic.`]:
`Visión general de **todas las plantillas agrupadas por dominio de proveedor**: despliegue un proveedor para ver sus plantillas y su estado, y abra directamente el editor de plantillas con un clic.`,

  [`Le **journal des dernières requêtes** de scraping (30 max, rafraîchi toutes les 2 s) : pour chaque appel, le contenu renvoyé par Jina et la réponse du LLM. Indispensable pour comprendre pourquoi un champ revient vide — bouton **Vider** pour repartir à zéro.`]:
`El **registro de las últimas peticiones** de scraping (30 máx., actualizado cada 2 s): para cada llamada, el contenido devuelto por Jina y la respuesta del LLM. Indispensable para comprender por qué un campo vuelve vacío — el botón **Vaciar** permite empezar de cero.`,

  [`Avant de relever un prix, le node vérifie que la page décrit **exactement** ton produit. Si l'**EAN relevé sur la page est identique** à celui du produit, l'appariement est **autoritaire** (confiance 100 %, sans appel au modèle IA). Sinon, un **modèle IA** note la correspondance de 0 à 1 : au-dessus de **0,7** la fiche est épinglée **automatiquement** (statut « auto ») et le prix est relevé ; en dessous, la fiche passe **« à confirmer »** et **aucun prix n'est relevé** tant que tu n'as pas tranché.`]:
`Antes de registrar un precio, el nodo comprueba que la página describe **exactamente** su producto. Si el **EAN registrado en la página es idéntico** al del producto, el emparejamiento es **autoritativo** (confianza del 100 %, sin recurrir al modelo de IA). De lo contrario, un **modelo de IA** puntúa la correspondencia de 0 a 1: por encima de **0,7** la ficha se fija **automáticamente** (estado «auto») y se registra el precio; por debajo, la ficha pasa a **«por confirmar»** y **no se registra ningún precio** hasta que se haya tomado una decisión.`,

  [`Le tableau de bord est en lecture seule pour les **prix**, mais propose **une action** : une file **« À confirmer »** liste les appariements incertains (avec le % de confiance et un lien vers la page). **Confirmer** épingle la fiche → elle sera relevée aux prochains runs ; **Rejeter** l'écarte **définitivement** → ce couple produit × site est **ignoré** lors de tous les runs suivants (utile quand le concurrent ne vend pas ce produit, ou que la page trouvée est la mauvaise).`]:
`El panel de control es de solo lectura para los **precios**, pero ofrece **una acción**: una cola de **«Por confirmar»** enumera los emparejamientos inciertos (con el % de confianza y un enlace a la página). **Confirmar** fija la ficha → se registrará en las siguientes ejecuciones; **Rechazar** la descarta **definitivamente** → este par producto × sitio es **ignorado** en todas las ejecuciones posteriores (útil cuando el competidor no vende este producto, o la página encontrada es la incorrecta).`,

  [`Dans **« Sites concurrents »**, chaque ligne accepte une liste de champs après une barre verticale : \`amazon.fr | price, availability\`. Sans champs précisés, seul le **prix** (\`price\`) est relevé. Le scraping réutilise le **moteur du PIM** (données structurées JSON-LD en priorité).`]:
`En **«Sitios de la competencia»**, cada línea acepta una lista de campos después de una barra vertical: \`amazon.fr | price, availability\`. Si no se especifican campos, solo se registra el **precio** (\`price\`). El scraping reutiliza el **motor del PIM** (datos estructurados JSON-LD como prioridad).`,

  [`Dans le comparatif, **survole un prix** : une infobulle **« Relevé : … »** affiche le **nom** et l'**EAN réellement lus sur la page concurrente**. Si l'identité relevée ne correspond pas à ton produit, c'est que la fiche trouvée est la mauvaise — **Rejette** la correspondance pour la corriger. Un prix concurrent **inférieur** au tien s'affiche en **rouge**.`]:
`En la comparativa, **pase el cursor sobre un precio**: un cuadro de información **«Registrado: …»** muestra el **nombre** y el **EAN realmente leídos en la página de la competencia**. Si la identidad registrada no corresponde a su producto, significa que la ficha encontrada es la incorrecta — **Rechace** la correspondencia para corregirla. Un precio de la competencia **inferior** al suyo se muestra en **rojo**.`,

  [`Le champ **« Identifiant du suivi »** du node mémorise, entre deux runs, les **URLs concurrentes épinglées** et l'**historique des prix** (30 derniers relevés par couple produit × site). Garde le même identifiant pour suivre un catalogue dans le temps ; change-le pour démarrer un suivi distinct.`]:
`El campo **«Identificador de seguimiento»** del nodo memoriza, entre dos ejecuciones, las **URL de la competencia fijadas** y el **historial de precios** (últimos 30 registros por par producto × sitio). Mantenga el mismo identificador para seguir un catálogo a lo largo del tiempo; cámbielo para iniciar un seguimiento distinto.`,

  [`Deux familles d'alertes : le **positionnement** (comparaison de ton prix — colonne « Mon prix » — à celui des concurrents) et la **variation** (un prix concurrent a changé depuis le dernier run, au-delà du **seuil %** configuré). Le port \`changes\` du node ne s'active **que** s'il y a des alertes — idéal pour n'envoyer un message Telegram qu'en cas de mouvement.`]:
`Dos familias de alertas: el **posicionamiento** (comparación de su precio — columna «Mi precio» — con el de la competencia) y la **variación** (un precio de la competencia ha cambiado desde la última ejecución, más allá del **umbral %** configurado). El puerto \`changes\` del nodo **solo** se activa si hay alertas — ideal para enviar un mensaje de Telegram únicamente en caso de movimiento.`,

  [`Pour un comparatif ponctuel **prix A | prix B | écart** entre plusieurs enseignes (sans alertes), utilise plutôt les nodes **« Produits d'une page liste »** + **« Comparer les prix »** dans un workflow. Modèles prêts à l'emploi : **« Comparer mes prix aux concurrents → Excel »** et **« Comparaison de prix quotidienne → Google Sheets »** (cron).`]:
`Para una comparativa puntual **precio A | precio B | diferencia** entre varias marcas (sin alertas), utilice en su lugar los nodos **«Productos de una página de lista»** + **«Comparar los precios»** en un flujo de trabajo. Plantillas listas para usar: **«Comparar mis precios con la competencia → Excel»** y **«Comparativa de precios diaria → Google Sheets»** (cron).`,

  [`Branche le port \`changes\` du node sur **« Envoyer via Telegram »** (« 1 message par ligne ») pour être prévenu à chaque mouvement de prix — y compris quand le workflow tourne en **cron serveur**, navigateur fermé.`]:
`Conecte el puerto \`changes\` del nodo a **«Enviar vía Telegram»** («1 mensaje por línea») para recibir un aviso con cada movimiento de precio — incluso cuando el flujo de trabajo se ejecuta en **cron de servidor**, con el navegador cerrado.`,

  [`Le fond a **deux régimes explicites**, pilotés par l'interrupteur **« Couleurs par chapitre (fond = couleur de l'univers) »** :
- **Activé** : fond = couleur du **chapitre** — une pastille par univers, nommée d'après l'**univers réel** de votre taxonomie (ex. **« Fond Outillage »**), modifiable ici ou dans le panneau Sections / chemin de fer. La couleur « Bandeau » du thème est alors ignorée sur les pages produits.
- **Désactivé** : fond = couleur **« Bandeau »** du thème, via la pastille **« Fond bandeau »**.`]:
`El fondo tiene **dos regímenes explícitos**, controlados por el interruptor **«Colores por capítulo (fondo = color del universo)»**:
- **Activado**: fondo = color del **capítulo** — una muestra por universo, nombrada según el **universo real** de su taxonomía (ej. **«Fondo Herramientas»**), modificable aquí o en el panel Secciones / planillo. El color «Banda» del tema se ignora entonces en las páginas de productos.
- **Desactivado**: fondo = color **«Banda»** del tema, a través de la muestra **«Fondo banda»**.`,

  [`Au-delà du curseur **« Taille »** global, chaque niveau se règle séparément : **« Taille Univers »** et **« Taille Famille »** (échelles multiplicatives, 1× = suit la taille globale), **« Police Univers »** / **« Police Famille »** (**« Police du thème »** = hérite) et couleurs de texte **« Txt Univers »** / **« Txt Famille »**.`]:
`Más allá del control deslizante **«Tamaño»** global, cada nivel se ajusta por separado: **«Tamaño Universo»** y **«Tamaño Familia»** (escalas multiplicativas, 1× = sigue el tamaño global), **«Fuente Universo»** / **«Fuente Familia»** (**«Fuente del tema»** = hereda) y colores de texto **«Txt Universo»** / **«Txt Familia»**.`,

  [`Le filet sous le bandeau se pilote comme un objet à part : case **« Filet du bandeau de section »** dans **« Éléments affichés »** pour l'afficher/masquer, et pastille **« Filet section »** dans les couleurs (par défaut : couleur d'accent du thème).`]:
`El filete bajo la banda se controla como un objeto independiente: casilla **«Filete de la banda de sección»** en **«Elementos mostrados»** para mostrarlo/ocultarlo, y muestra **«Filete sección»** en los colores (por defecto: color de acento del tema).`,

  [`| Node | Rôle |
|---|---|
| Upload | Fichier/dossier local (auto-parse CSV/Excel : colonnes en \`{{…}}\` + lignes) |
| Saisie texte | Texte saisi à la main (prompt, valeur à interpoler) |
| Parser Excel/CSV | CSV/XLSX → tableau |
| Import IDML / SVG / PPTX / image | Charge un fichier InDesign / SVG / PowerPoint / image |
| Image → SVG · PDF → SVG | Convertit un raster / PDF en SVG éditable (décomposition Vision) |
| Import Google Sheets · Import Google Drive | Source depuis Google Sheets / Drive |
| **Scrape URL** | Scrape 1+ URLs (Jina + IA, pipeline produit complet) |
| **Recherche web** ⭐ | Cherche sur le web + lit les pages → tableau + texte de synthèse |
| **Question web (IA)** ⭐ | Question → recherche web + réponse synthétisée par le LLM (+ sources) |
| Cron (planifié) | Déclencheur serveur récurrent — voir « Planifier » plus bas |`]:
`| Node | Función |
|---|---|
| Upload | Archivo/carpeta local (auto-parse CSV/Excel: columnas en \`{{…}}\` + filas) |
| Entrada de texto | Texto introducido manualmente (prompt, valor a interpolar) |
| Parser Excel/CSV | CSV/XLSX → tabla |
| Importar IDML / SVG / PPTX / imagen | Carga un archivo InDesign / SVG / PowerPoint / imagen |
| Imagen → SVG · PDF → SVG | Convierte un raster / PDF en SVG editable (descomposición Vision) |
| Importar Google Sheets · Importar Google Drive | Origen desde Google Sheets / Drive |
| **Scrape URL** | Extrae 1+ URLs (Jina + IA, pipeline de producto completo) |
| **Búsqueda web** ⭐ | Busca en la web + lee las páginas → tabla + texto de síntesis |
| **Pregunta web (IA)** ⭐ | Pregunta → búsqueda web + respuesta sintetizada por el LLM (+ fuentes) |
| Cron (planificado) | Desencadenador de servidor recurrente — ver «Planificar» más abajo |`,

  [`| Node | Rôle |
|---|---|
| Enrichissement | Scrape les URLs d'une colonne et complète les champs via IA |
| Génération image (Image IA) | Génère des images depuis un prompt |
| Décomposer (SVG éditable) | Analyse un SVG (Vision IA) en calques éditables |`]:
`| Node | Función |
|---|---|
| Enriquecimiento | Extrae las URLs de una columna y completa los campos mediante IA |
| Generación de imagen (Imagen IA) | Genera imágenes a partir de un prompt |
| Descomponer (SVG editable) | Analiza un SVG (Vision IA) en capas editables |`,

  [`| Node | Rôle |
|---|---|
| Définir / réécrire colonnes | Templates \`{{col}}\` appliqués par ligne |
| Filtrer lignes | Garde les lignes satisfaisant une expression sur \`row\` |
| Trier lignes | Tri par colonne (croissant/décroissant, texte/nombre) |
| Renommer colonnes | Mapping \`ancien = nouveau\` |
| Opération texte | minuscules / MAJUSCULES / trim / remplacement / extraction regex sur une colonne |`]:
`| Node | Función |
|---|---|
| Definir / reescribir columnas | Plantillas \`{{col}}\` aplicadas por fila |
| Filtrar filas | Mantiene las filas que cumplen una expresión en \`row\` |
| Ordenar filas | Orden por columna (ascendente/descendente, texto/número) |
| Renombrar columnas | Mapeo \`antiguo = nuevo\` |
| Operación de texto | minúsculas / MAYÚSCULAS / trim / reemplazo / extracción regex en una columna |`,

  [`| Node | Rôle |
|---|---|
| Save PIM | Persiste les lignes comme produits (Firestore) |
| Import Taxonomie | Construit une taxonomie hiérarchique |
| Save DAM | Upload les assets vers Google Drive |`]:
`| Node | Función |
|---|---|
| Guardar PIM | Persiste las filas como productos (Firestore) |
| Importar Taxonomía | Construye una taxonomía jerárquica |
| Guardar DAM | Sube los assets a Google Drive |`,

  [`| Node | Rôle |
|---|---|
| Export Excel / PPTX / HTML→PDF | Génère le fichier depuis un tableau |
| Export (design) | Rend un fichier de design (SVG décomposé ou édité) en **PNG / PDF / PPTX / HTML / SVG**, résolution 72/150/300 dpi |
| Export Google Sheets / Google Drive | Crée un Sheet / dépose le fichier dans Drive |`]:
`| Nodo | Función |
|---|---|
| Export Excel / PPTX / HTML→PDF | Genera el archivo desde una tabla |
| Export (design) | Renderiza un archivo de diseño (SVG descompuesto o editado) en **PNG / PDF / PPTX / HTML / SVG**, resolución 72/150/300 dpi |
| Export Google Sheets / Google Drive | Crea un Sheet / deposita el archivo en Drive |`,

  [`| Node | Rôle |
|---|---|
| If / Else | Branche selon une condition |
| Pipe | Chaîne des expressions de transformation |
| Loop (each) | Itère sur un tableau — le sous-graphe s'exécute par élément (\`{{item}}\`) |
| Loop (collect) | Clôt la boucle et agrège les résultats en tableau |`]:
`| Nodo | Función |
|---|---|
| If / Else | Ramifica según una condición |
| Pipe | Encadena expresiones de transformación |
| Loop (each) | Itera sobre un array — el subgrafo se ejecuta por elemento (\`{{item}}\`) |
| Loop (collect) | Cierra el bucle y agrega los resultados en un array |`,

  [`| Node | Rôle |
|---|---|
| Envoyer via Gmail | Envoie un email (+ pièces jointes) |
| Envoyer via Telegram | Envoie un message / document |
| Approbation Telegram | Pause + question ✅/❌ sur Telegram — voir « Approbation humaine » |
| Veille prix | Compare aux prix du run précédent — voir « Veille prix » |`]:
`| Nodo | Función |
|---|---|
| Enviar vía Gmail | Envía un correo electrónico (+ archivos adjuntos) |
| Enviar vía Telegram | Envía un mensaje / documento |
| Aprobación Telegram | Pausa + pregunta ✅/❌ en Telegram — véase «Aprobación humana» |
| Vigilancia de precios | Compara con los precios de la ejecución anterior — véase «Vigilancia de precios» |`,

  [`Le bot répond via le LLM. Si l'info demandée est récente (score, actu, prix) ou si tu colles une **URL**, il **cherche sur le web et lit les pages** avant de répondre. La réponse cite ses **sources** et le modèle utilisé.`]:
`El bot responde a través del LLM. Si la información solicitada es reciente (puntuación, actualidad, precio) o si se pega una **URL**, **busca en la web y lee las páginas** antes de responder. La respuesta cita sus **fuentes** y el modelo utilizado.`,

  [`**Génère un workflow par IA** depuis ta demande, l'**exécute**, et te **renvoie le fichier** produit.

Ex : \`/flow scrape https://exemple.com/categorie et exporte un Excel\`.`]:
`**Genera un workflow por IA** a partir de la solicitud, lo **ejecuta** y **devuelve el archivo** producido.

Ej.: \`/flow scrape https://exemple.com/categorie et exporte un Excel\`.`,

  [`**Exécute un workflow déjà sauvegardé** (par son nom) ; le texte éventuel sert d'entrée. **\`/run\` seul liste** les workflows disponibles.`]:
`**Ejecuta un workflow ya guardado** (por su nombre); el texto eventual sirve de entrada. **\`/run\` por sí solo enumera** los workflows disponibles.`,

  [`**Vide la boîte de réception** — côté app ET côté Telegram (messages de moins de 48 h). Alias : \`/purge\`, \`/vider\`.`]:
`**Vacía la bandeja de entrada** — del lado de la aplicación Y del lado de Telegram (mensajes de menos de 48 h). Alias: \`/purge\`, \`/vider\`.`,

  [`Commande de service Telegram — **ignorée**, elle n'encombre pas la boîte.`]:
`Comando de servicio de Telegram — **ignorado**, no satura la bandeja de entrada.`,

  [`Le chat garde le **fil de la conversation** pendant la session (les **30 derniers messages** sont transmis au modèle — au-delà, le début du fil sort du contexte). ⚠️ L'historique n'est **pas conservé** : rafraîchir la page démarre une nouvelle conversation. Le bouton *Nouvelle conversation* remet à zéro.`]:
`El chat mantiene el **hilo de la conversación** durante la sesión (los **últimos 30 mensajes** se transmiten al modelo — más allá, el inicio del hilo queda fuera de contexto). ⚠️ El historial **no se conserva**: actualizar la página inicia una nueva conversación. El botón *Nueva conversación* restablece todo a cero.`,

  [`Joins des **images** (PNG, JPEG, WebP, GIF) pour les faire analyser — analyse possible avec les modèles **multimodaux** (Claude, Gemini, OpenAI) ; les autres fournisseurs ignorent les images. Ou des **fichiers texte** (TXT, MD, CSV, JSON, code…) dont le contenu est lu (tronqué au-delà de ~50 000 caractères). Tu peux aussi **capturer l'écran** : le navigateur te laisse choisir la fenêtre ou l'onglet à capturer.`]:
`Adjunte **imágenes** (PNG, JPEG, WebP, GIF) para que sean analizadas — el análisis es posible con los modelos **multimodales** (Claude, Gemini, OpenAI); los demás proveedores ignoran las imágenes. O **archivos de texto** (TXT, MD, CSV, JSON, código…) cuyo contenido es leído (truncado más allá de ~50 000 caracteres). También es posible **capturar la pantalla**: el navegador permite elegir la ventana o pestaña a capturar.`,

  [`Choisis la catégorie **Image** : le champ de saisie passe en mode génération (moteur Image IA). Joins des images de référence pour les éditer. Sous chaque image générée : **Télécharger** ou **Sauvegarder dans le DAM** (elle rejoint « Mes images »).`]:
`Seleccione la categoría **Imagen**: el campo de entrada pasa al modo de generación (motor Imagen IA). Adjunte imágenes de referencia para editarlas. Debajo de cada imagen generada: **Descargar** o **Guardar en el DAM** (se añade a «Mis imágenes»).`,

  [`Dicte ta demande au **micro** : la parole est transcrite en texte dans la zone de saisie.`]:
`Dicte la solicitud al **micrófono**: la voz se transcribe a texto en el área de entrada.`,

  [`Des **catégories** (Écrire, Apprendre, Code, Vie quotidienne, Idées, Image, Mes prompts) proposent des prompts prêts à l'emploi. Crée, modifie et mets en **favori** (★) tes propres prompts — les favoris et les plus utilisés remontent en tête de liste. Clique un prompt pour le **pré-remplir** dans la zone de saisie (libre à toi de l'ajuster avant d'envoyer).`]:
`Las **categorías** (Escribir, Aprender, Code, Vida cotidiana, Ideas, Imagen, Mis prompts) ofrecen prompts listos para usar. Cree, modifique y marque como **favorito** (★) sus propios prompts — los favoritos y los más utilizados aparecen en la parte superior de la lista. Haga clic en un prompt para **rellenarlo previamente** en el área de entrada (puede ajustarlo antes de enviarlo).`,

  [`Le menu **⋯** de chaque prompt permet de le **renommer / éditer**, le **dupliquer** (crée une copie « *titre* (copie) » à adapter) ou le **supprimer**. Chaque usage est **comptabilisé** : les prompts les plus sollicités et les favoris sont mis en avant. Tes prompts sont **enregistrés sur ton compte** (synchronisés via Firestore) : on les retrouve d'une session à l'autre, contrairement à l'historique de conversation.`]:
`El menú **⋯** de cada prompt permite **renombrarlo / editarlo**, **duplicarlo** (crea una copia « *título* (copia) » para adaptar) o **eliminarlo**. Cada uso se **contabiliza**: los prompts más solicitados y los favoritos se destacan. Sus prompts se **guardan en su cuenta** (sincronizados a través de Firestore): se recuperan de una sesión a otra, a diferencia del historial de conversación.`,

  [`Au-delà du rôle, tu peux **accorder** ou **retirer** des permissions individuelles à un utilisateur précis (ex. lui ouvrir l'export sans changer son rôle). *Réinitialiser les surcharges* efface ces ajustements.`]:
`Más allá del rol, puede **conceder** o **retirar** permisos individuales a un usuario específico (ej. abrirle la exportación sin cambiar su rol). *Restablecer las sobrecargas* borra estos ajustes.`,

  [`**Bloquer** suspend totalement un compte sans le supprimer : plus aucun accès, même avec un rôle. **Réactiver** lui rend ses droits.`]:
`**Bloquear** suspende totalmente una cuenta sin eliminarla: sin ningún acceso, incluso con un rol. **Reactivar** le devuelve sus derechos.`,

  [`Le détail (avant → après, ou la taille) n'apparaît que sur les actions **postérieures** à l'ajout de la fonctionnalité. Les entrées sont **immuables** : elles ne se complètent pas rétroactivement. Refais l'action pour voir le détail sur la nouvelle entrée.`]:
`El detalle (antes → después, o el tamaño) solo aparece en las acciones **posteriores** a la adición de la funcionalidad. Las entradas son **inmutables**: no se completan retroactivamente. Vuelva a realizar la acción para ver el detalle en la nueva entrada.`,

  [`Chaque sauvegarde de base crée une entrée. Si la **taille** (lignes/colonnes) n'a pas changé, la ligne montre seulement la taille ; si tu as ajouté/supprimé des lignes, elle montre l'avant → après. Pour suivre une **valeur** précise, regarde plutôt l'action « Cellule modifiée ».`]:
`Cada guardado de base crea una entrada. Si el **tamaño** (filas/columnas) no ha cambiado, la fila muestra solo el tamaño; si ha añadido/eliminado filas, muestra el antes → después. Para seguir un **valor** específico, mire en su lugar la acción « Celda modificada ».`,

  [`Seul l'**administrateur** (ou le propriétaire) voit le Journal de tous les utilisateurs, avec le filtre **Qui**. Un utilisateur standard ne voit que **ses** actions, dans Réglages → Mon activité.`]:
`Solo el **administrador** (o el propietario) ve el Registro de todos los usuarios, con el filtro **Quién**. Un usuario estándar solo ve **sus** acciones, en Ajustes → Mi actividad.`,

  [`Le compte **propriétaire est exclu du tracking côté serveur** : ses pages vues ne sont ni enregistrées ni notifiées, y compris sur les pages publiques (le dernier compte connecté sur le navigateur est reconnu même sans être authentifié sur la landing). Les statistiques reflètent donc uniquement le trafic réel de vos visiteurs et utilisateurs.`]:
`La cuenta **propietario está excluida del seguimiento del lado del servidor**: sus páginas vistas no se registran ni se notifican, incluso en las páginas públicas (la última cuenta conectada en el navegador se reconoce incluso sin estar autenticada en la landing). Por lo tanto, las estadísticas reflejan únicamente el tráfico real de sus visitantes y usuarios.`,

  [`**Site web** = les pages publiques (accueil, landing promo, documentation) ; **Application** = l'usage de l'app par les utilisateurs connectés (chaque module ouvert dans le dashboard compte comme une page, même sans changement d'URL). Pratique pour séparer l'audience marketing de l'activité produit.`]:
`**Sitio web** = las páginas públicas (inicio, landing promocional, documentación); **Aplicación** = el uso de la app por los usuarios conectados (cada módulo abierto en el dashboard cuenta como una página, incluso sin cambio de URL). Práctico para separar la audiencia de marketing de la actividad del producto.`,

  [`Le message apparaît quand aucune consultation n'existe dans la fenêtre choisie : élargissez la période (90 j, 12 mois) ou vérifiez les dates « Du / Au » en mode **Perso**. Si des données existent mais que la combinaison de filtres ne retient rien, le message devient « Aucune donnée pour ces filtres » — remettez les filtres sur « Tous ».`]:
`El mensaje aparece cuando no existe ninguna consulta en la ventana elegida: amplíe el período (90 d, 12 meses) o compruebe las fechas « Desde / Hasta » en modo **Personalizado**. Si existen datos pero la combinación de filtros no retiene nada, el mensaje se convierte en « Sin datos para estos filtros » — vuelva a poner los filtros en « Todos ».`,

  [`Colle le **bot token** (via BotFather) et ton **chat ID** pour piloter l'app depuis Telegram. C'est ici que le bot du module Telegram puise sa configuration.`]:
`Pegue el **bot token** (a través de BotFather) y su **chat ID** para controlar la app desde Telegram. Es aquí donde el bot del módulo Telegram obtiene su configuración.`,

  [`Connecte ton **Google Drive** (OAuth) pour que les workflows et le node *save-dam* y déposent des fichiers.`]:
`Conecte su **Google Drive** (OAuth) para que los flujos de trabajo y el nodo *save-dam* depositen archivos allí.`,

  [`Autorise **une seule fois** (bouton « Connecter ») le **serveur** à agir pour toi quand l'app est fermée : les workflows planifiés (cron), le webhook et \`/flow\` sur Telegram peuvent alors **créer des Google Sheets dans ton Drive** et **envoyer des Gmail**. Distinct de la connexion Google Drive ci-dessus (utilisée par le navigateur). Aucun mot de passe stocké — un jeton révocable à tout moment depuis ton compte Google. Ne colle **jamais** d'identifiants dans le chat Telegram : l'autorisation se donne uniquement ici.`]:
`Autorice **una sola vez** (botón «Conectar») al **servidor** para actuar en su nombre cuando la aplicación esté cerrada: los flujos de trabajo programados (cron), el webhook y \`/flow\` en Telegram podrán entonces **crear Google Sheets en su Drive** y **enviar Gmail**. Distinto de la conexión de Google Drive anterior (utilizada por el navegador). No se almacena ninguna contraseña — un token revocable en cualquier momento desde su cuenta de Google. **Nunca** pegue credenciales en el chat de Telegram: la autorización se da únicamente aquí.`,

  [`Tokens des services de scraping et de traitement d'image. **Bright Data** propose le *Web Unlocker* et, en escalade, le *Scraping Browser* (tier 2) pour les sites les plus protégés.`]:
`Tokens de los servicios de scraping y procesamiento de imágenes. **Bright Data** ofrece el *Web Unlocker* y, como escalada, el *Scraping Browser* (tier 2) para los sitios más protegidos.`,

  [`Le diagramme se construit à partir de \`TABLES\` et \`RELATIONS\` dans \`features/data-graph/firestoreSchema.ts\`. Ajouter une collection ou un lien = compléter ces deux listes ; le rendu et les cardinalités suivent automatiquement.`]:
`El diagrama se construye a partir de \`TABLES\` y \`RELATIONS\` en \`features/data-graph/firestoreSchema.ts\`. Añadir una colección o un enlace = completar estas dos listas; el renderizado y las cardinalidades se aplican automáticamente.`,

  [`L'explorateur expose la structure et les données brutes de **tout** l'espace de travail (tous comptes confondus). L'onglet **Données** des Paramètres — comme **Firebase** — est donc réservé au **propriétaire**.`]:
`El explorador expone la estructura y los datos brutos de **todo** el espacio de trabajo (todas las cuentas combinadas). La pestaña **Datos** de los Ajustes — como **Firebase** — está por tanto reservada al **propietario**.`,
}
