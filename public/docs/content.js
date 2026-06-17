// ⚠️ Fichier de DONNÉES de la documentation publique (/docs/).
// Source de vérité : l'aide intégrée à l'app (src/features/help/content/*.tsx).
// À mettre à jour quand un module / une fonction évolue dans l'app.

export const CATEGORIES = [
  {
    "id": "demarrage",
    "label": "Démarrage",
    "icon": "🚀",
    "desc": "Connexion, prise en main, navigation et nouveautés : tout pour bien démarrer."
  },
  {
    "id": "edition",
    "label": "Édition",
    "icon": "✏️",
    "desc": "L'éditeur type Canva : canvas, outils, calques, impression et animations."
  },
  {
    "id": "import",
    "label": "Import",
    "icon": "📥",
    "desc": "Repartez d'un fichier existant : IDML, EasyCatalog, PPTX, Excel, image, SVG, PDF."
  },
  {
    "id": "donnees",
    "label": "Données",
    "icon": "🗂️",
    "desc": "Le cœur data : PIM, médias (DAM), taxonomies, scraping et veille tarifaire."
  },
  {
    "id": "export",
    "label": "Export",
    "icon": "📤",
    "desc": "Sortez vos créations : PDF print, IDML, PPTX, SVG, PNG, web et pack social."
  },
  {
    "id": "automatisation",
    "label": "Automatisation",
    "icon": "⚡",
    "desc": "Workflows visuels et pilotage Telegram : enchaînez les modules sans effort."
  },
  {
    "id": "assistant-ia",
    "label": "Assistant IA",
    "icon": "🤖",
    "desc": "Un assistant conversationnel pour interroger, rédiger et générer."
  },
  {
    "id": "administration",
    "label": "Administration",
    "icon": "🛡️",
    "desc": "Comptes, rôles, permissions et réglages de l'espace de travail."
  }
]

export const MODULES = [
  {
    "id": "getting-started",
    "cat": "Démarrage",
    "icon": "🚀",
    "anim": "pipeline",
    "title": "Prise en main",
    "intro": "Connexion, tableau de bord et création du premier projet.",
    "features": [
      {
        "title": "Sections du dashboard",
        "desc": "Chaque entrée de la barre latérale est un raccourci vers une grande zone de l'application ; cliquer un lien met l'élément en évidence et la liste reflète les modules disponibles pour le compte."
      },
      {
        "title": "Créer un projet vierge",
        "desc": "Le panneau Nouveau document propose des formats (A4, A3, écran, réseaux sociaux ou dimensions personnalisées) et le projet s'ouvre dans l'éditeur, format et fond de page restant modifiables."
      },
      {
        "title": "Retrouver un projet existant",
        "desc": "La bibliothèque liste les projets avec ouverture, duplication, suppression, affichage vignettes ou liste, filtrage par taxonomie et sélection multiple pour des actions groupées."
      }
    ],
    "shortcuts": [
      {
        "keys": [
          "⌘",
          "S"
        ],
        "label": "Sauvegarder le projet"
      },
      {
        "keys": [
          "⌘",
          "Z"
        ],
        "label": "Annuler la dernière action"
      },
      {
        "keys": [
          "⌘",
          "Y"
        ],
        "label": "Rétablir"
      },
      {
        "keys": [
          "⇧",
          "?"
        ],
        "label": "Ouvrir / fermer le manuel"
      }
    ]
  },
  {
    "id": "nouveautes",
    "cat": "Démarrage",
    "icon": "✨",
    "anim": "default",
    "title": "Nouveautés",
    "intro": "Ce qui vient d'arriver dans l'application — juin 2026.",
    "features": [
      {
        "title": "Navigation & confort",
        "desc": "Nouvelle palette de commandes (⌘K), centre de notifications avec historique des runs et exports, et écrans vides désormais actionnables proposant le prochain pas."
      },
      {
        "title": "Éditeur",
        "desc": "Barre contextuelle flottante avec badge temps réel, preflight d'impression, éléments maîtres répétables, kit de marque et styles d'objets globaux, et versions restaurables."
      },
      {
        "title": "Re-skin de promo (éditeur × PIM × IA)",
        "desc": "Source Produits PIM transformant chaque produit en ligne, liaison automatique prix/titre/description, fond régénéré par IA Nano Banana et texte réduit pour tenir dans une zone cible."
      },
      {
        "title": "PIM & données",
        "desc": "Pastille de complétude sur chaque ligne avec champs manquants au survol et moyenne en barre d'état, plus une vue galerie présentant les produits en cartes."
      },
      {
        "title": "Workflows & automatisation",
        "desc": "Galerie de modèles un clic, nodes Approbation Telegram, Veille prix et Cron serveur, webhook entrant pour déclenchement externe et mode pas à pas avec inspection des sorties."
      },
      {
        "title": "Veille tarifaire & comparaison de prix",
        "desc": "Module de veille tarifaire avec tableau de bord des écarts et alertes, modèles un clic vers Excel ou Google Sheets, et découverte automatique de la page liste par famille produit."
      },
      {
        "title": "Telegram sans navigateur (répondeur serveur)",
        "desc": "Le bot répond application fermée pour les questions avec recherche web, la génération de workflows et leur exécution serveur, y compris la création de Google Sheets et l'envoi de Gmail."
      },
      {
        "title": "DAM, Telegram & export",
        "desc": "Tagging IA automatique et filtre en langage naturel, digest Telegram quotidien à 08:00, pack social à l'export et pages déclinées éditables par format."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "onboarding",
    "cat": "Démarrage",
    "icon": "🧰",
    "anim": "default",
    "title": "Assistant de configuration",
    "intro": "Mettre en place son espace pas à pas : clés IA, modèles, connecteurs et visite guidée.",
    "features": [
      {
        "title": "1 · Bienvenue",
        "desc": "Présente les étapes à venir (clés IA, modèles et cascade, connecteurs, visite guidée) sans rien demander à saisir."
      },
      {
        "title": "2 · Clés IA — obligatoire",
        "desc": "Renseigner au moins une clé API parmi les fournisseurs disponibles puis la tester ; c'est la seule étape réellement bloquante de l'assistant."
      },
      {
        "title": "3 · Modèles & cascade",
        "desc": "Choisir le modèle de chaque fournisseur et l'ordre de la cascade de raisonnement, avec un bouton réalignant toute la sélection sur les modèles phares du catalogue."
      },
      {
        "title": "4 · Connecteurs — optionnel",
        "desc": "Brancher Google Drive, Bright Data et Telegram si besoin ; cette étape peut être passée et complétée plus tard dans Réglages."
      },
      {
        "title": "5 · Terminé",
        "desc": "Affiche un récapitulatif du profil puis propose de lancer la visite guidée du tableau de bord ou de terminer directement."
      },
      {
        "title": "Reprendre la configuration plus tard",
        "desc": "L'assistant reste accessible via le bandeau en haut des Réglages ou l'entrée Configurer l'application en bas du menu des modules, les deux le rouvrant à la première étape."
      },
      {
        "title": "Bouton « Mettre à jour tous les LLM »",
        "desc": "Présent dans l'assistant et dans l'onglet IA des Réglages, il sélectionne le dernier modèle phare de chaque fournisseur pour rester à jour sans choisir chaque modèle manuellement."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "navigation",
    "cat": "Démarrage",
    "icon": "🧭",
    "anim": "taxonomy",
    "title": "Navigation & visites guidées",
    "intro": "Passer d'un module à l'autre depuis n'importe où, et (re)lancer les visites guidées.",
    "features": [
      {
        "title": "Menu des modules (☰)",
        "desc": "Un bouton flottant en bas à gauche ouvre un tiroir listant tous les modules autorisés par le rôle, chaque entrée ramenant au tableau de bord sur la section choisie."
      },
      {
        "title": "Palette de commandes (⌘K)",
        "desc": "Ouvre depuis n'importe quelle page une recherche de projets récents, de modules et d'actions rapides, ignorant les accents et comprenant des synonymes."
      },
      {
        "title": "Notifications (🔔)",
        "desc": "La cloche en bas à gauche garde l'historique des fins de runs et des exports réussis ou échoués, avec badge de non-lus et possibilité de tout marquer lu."
      },
      {
        "title": "Visites guidées (🧭)",
        "desc": "Un bouton en bas à droite lance une visite interactive de l'écran courant (tableau de bord ou éditeur), ouverte automatiquement une fois puis relançable à volonté."
      },
      {
        "title": "Ce manuel s'adapte à ton rôle",
        "desc": "Le sommaire et la recherche de l'aide ne montrent que les sections des modules accessibles, les sections transverses restant toujours visibles."
      }
    ],
    "shortcuts": [
      {
        "keys": [
          "⌘",
          "K"
        ],
        "label": "Ouvrir la palette de commandes"
      },
      {
        "keys": [
          "⇧",
          "?"
        ],
        "label": "Ouvrir / fermer le manuel"
      }
    ]
  },
  {
    "id": "editor",
    "cat": "Édition",
    "icon": "✏️",
    "anim": "editor",
    "title": "L'éditeur",
    "intro": "Canvas, outils, calques et sauvegarde du projet.",
    "features": [
      {
        "title": "Header",
        "desc": "Affiche le titre du projet et son état de sauvegarde, ainsi que les boutons Annuler/Rétablir, Sauvegarder en commit manuel et Exporter."
      },
      {
        "title": "Barre d'outils",
        "desc": "Les outils Texte, Rectangle, Ellipse et Ligne ajoutent une forme puis reviennent à la sélection, et l'outil Image ouvre un menu Stock, Mes images, Uploader ou Générer par IA."
      },
      {
        "title": "Propriétés des objets",
        "desc": "Panneau adaptatif gérant position, taille, rotation, remplissage uni/dégradé/image, contour, opacité, ombre, modes de fusion, miroir, verrou, cadrage, texte et alignement multi-objets."
      },
      {
        "title": "Calques",
        "desc": "Liste tous les objets du canvas avec masquage, suppression et réorganisation par glisser-déposer, les textes se dépliant pour éditer chaque segment séparément."
      },
      {
        "title": "Naviguer dans le canvas",
        "desc": "La barre inférieure pilote le zoom de 1 à 400 %, le pan à l'espace, la taille de page, la grille et l'aimantation aux objets et à la grille."
      },
      {
        "title": "Images",
        "desc": "Insère des images sans quitter l'éditeur via les onglets Galerie, Upload, IA, Stock, Mes images, Favoris, Collections et Récents, les mêmes sources que le DAM."
      },
      {
        "title": "Assets",
        "desc": "Regroupe les images et polices du projet avec compteurs, pour glisser une image sur le canvas ou utiliser les polices importées dans les textes."
      },
      {
        "title": "Page",
        "desc": "Définit le format par presets ou dimensions personnalisées en millimètres, le fond de page (couleur, dégradé ou image) et la gestion des pages multiples."
      },
      {
        "title": "Impression",
        "desc": "Gère tout le pré-presse : DPI, fond perdu, traits de coupe, hirondelles de repérage, zone de sécurité et la section Preflight."
      },
      {
        "title": "Animation 3D",
        "desc": "Applique des animations 3D à un objet via des presets (flip, relief, particules) avec lecture, arrêt et enregistrement vidéo du rendu animé."
      },
      {
        "title": "Palette · Données · Versions",
        "desc": "Regroupe le kit de marque et les styles d'objets, le re-skin PIM ou publipostage et les snapshots, détaillés dans leurs sections dédiées."
      },
      {
        "title": "Menu contextuel (clic droit)",
        "desc": "Ouvre un menu rapide pour dupliquer, ordonner, grouper, mettre en miroir, verrouiller, supprimer et, sur un document multi-pages, répéter ou retirer un élément des autres pages."
      },
      {
        "title": "Barre contextuelle & repères de manipulation",
        "desc": "Une barre flottante sous la sélection offre les actions fréquentes, et un badge temps réel affiche position, dimensions ou angle pendant la manipulation."
      },
      {
        "title": "Preflight d'impression",
        "desc": "Le bouton Analyser contrôle le document avant export en détectant les images basse résolution, les objets hors page et les textes trop petits ou trop près du bord."
      },
      {
        "title": "Re-skin par les données PIM",
        "desc": "Le panneau Données accepte une source Produits PIM, permet de poser des champs et de régénérer le fond par IA, avec liaison automatique du prix, titre et description."
      },
      {
        "title": "Éléments maîtres & kit de marque",
        "desc": "Répète un élément sur toutes les pages, partage les couleurs de marque entre tous les projets et capture des styles d'objets réutilisables d'un clic."
      },
      {
        "title": "Versions du document",
        "desc": "Garde jusqu'à vingt snapshots horodatés du document avec miniature, restaurables en un clic après réécriture du contenu et rechargement de l'éditeur."
      },
      {
        "title": "Sauvegarder & exporter",
        "desc": "La sauvegarde est automatique mais peut être déclenchée manuellement, et le bouton Exporter ouvre le choix de format (PDF, IDML, PPTX, SVG, PNG, HTML)."
      }
    ],
    "shortcuts": [
      {
        "keys": [
          "V"
        ],
        "label": "Outil Sélection"
      },
      {
        "keys": [
          "T"
        ],
        "label": "Outil Texte"
      },
      {
        "keys": [
          "R"
        ],
        "label": "Outil Rectangle"
      },
      {
        "keys": [
          "E"
        ],
        "label": "Outil Ellipse"
      },
      {
        "keys": [
          "L"
        ],
        "label": "Outil Ligne"
      },
      {
        "keys": [
          "I"
        ],
        "label": "Outil Image / DAM"
      },
      {
        "keys": [
          "Espace",
          "⇧ Glisser"
        ],
        "label": "Pan du canvas"
      },
      {
        "keys": [
          "⌘",
          "0"
        ],
        "label": "Zoom 100 %"
      },
      {
        "keys": [
          "⌘",
          "S"
        ],
        "label": "Sauvegarder (commit manuel)"
      },
      {
        "keys": [
          "⌘",
          "Z"
        ],
        "label": "Annuler"
      },
      {
        "keys": [
          "⌘",
          "Y"
        ],
        "label": "Rétablir"
      },
      {
        "keys": [
          "⌘",
          "A"
        ],
        "label": "Tout sélectionner"
      },
      {
        "keys": [
          "⌘",
          "D"
        ],
        "label": "Dupliquer la sélection"
      },
      {
        "keys": [
          "⌘",
          "G"
        ],
        "label": "Grouper"
      },
      {
        "keys": [
          "⌘",
          "⇧",
          "G"
        ],
        "label": "Dégrouper"
      },
      {
        "keys": [
          "⌘",
          "]"
        ],
        "label": "Avancer d'un plan"
      },
      {
        "keys": [
          "⌘",
          "["
        ],
        "label": "Reculer d'un plan"
      },
      {
        "keys": [
          "←↑→↓"
        ],
        "label": "Déplacer de 1 px (⇧ : 10 px)"
      },
      {
        "keys": [
          "Suppr"
        ],
        "label": "Supprimer la sélection"
      },
      {
        "keys": [
          "Échap"
        ],
        "label": "Désélectionner"
      }
    ]
  },
  {
    "id": "hyperframes",
    "cat": "Édition",
    "icon": "🎬",
    "anim": "editor",
    "title": "Animation",
    "intro": "Générer des animations HTML autonomes (vidéo) à partir d'un brief ou d'un design du canvas.",
    "features": [
      {
        "title": "À partir d'un brief (vidéo multi-scènes)",
        "desc": "Décrire un sujet et un contexte optionnel laisse l'IA composer une séquence de deux à cinq scènes avec titres, chiffres, icônes et transitions, puis choisir thème et palette."
      },
      {
        "title": "À partir d'un design du canvas (design-reveal)",
        "desc": "Depuis l'éditeur, le SVG du projet est capturé puis animé par l'IA selon une consigne de style, idéal pour transformer une création print en teaser animé."
      },
      {
        "title": "Fichiers de référence",
        "desc": "Glisser des images, PDF ou SVG enrichit le brief : l'IA les lit en texte et visuel et s'en sert comme contexte."
      },
      {
        "title": "Format et durée",
        "desc": "Choix du ratio (auto, portrait, carré, paysage ou personnalisé), de la durée de 3 à 60 secondes, d'instructions de style libres, avec boutons Effacer et Stop."
      },
      {
        "title": "Enrichir et finaliser",
        "desc": "Génère un visuel IA par scène, propose un aperçu live avec le style appliqué, et permet de télécharger le ZIP autonome ou de sauvegarder l'animation dans le DAM."
      },
      {
        "title": "Bibliothèque de prompts",
        "desc": "Chaque génération mémorise son brief, rejouable, chargeable pour ajustement, renommable ou supprimable, afin de produire des variantes sans tout ressaisir."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "import-idml",
    "cat": "Import",
    "icon": "📐",
    "anim": "default",
    "title": "Import IDML",
    "intro": "Récupérer une maquette InDesign et la transformer en template IBS-Studio.",
    "features": [
      {
        "title": "Comment exporter un IDML depuis InDesign",
        "desc": "Ouvrir le document dans InDesign CC ou plus récent puis Fichier, Exporter et choisir le format InDesign Markup, qui est en réalité un ZIP contenant XML et ressources."
      },
      {
        "title": "Importer dans IBS-Studio",
        "desc": "Le parser extrait formes, textes, images, fonts, ombres et transparence sur toutes les pages, et reconnaît gabarits, cadres non rectangulaires, cascade de styles et liens graphiques."
      },
      {
        "title": "Limites connues",
        "desc": "Les fonts non installées retombent sur Arial, les dégradés ne sont pas importés et reviennent en couleur unie, et certains effets avancés ne sont qu'approximés."
      },
      {
        "title": "Aller-retour InDesign ↔ IBS-Studio",
        "desc": "Le graphiste crée la maquette dans InDesign, l'imprimeur l'importe, ajoute des placeholders et branche le data-merge, puis exporte en IDML ou PDF sans lock-in."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "easycatalog",
    "cat": "Import",
    "icon": "🔗",
    "anim": "default",
    "title": "EasyCatalog (InDesign)",
    "intro": "Aller-retour avec le plug-in EasyCatalog : importer un gabarit, fusionner ses champs, puis réexporter un IDML reconnu nativement.",
    "features": [
      {
        "title": "1. Importer un gabarit EasyCatalog",
        "desc": "Exporter l'IDML depuis InDesign puis l'importer : les champs EasyCatalog deviennent automatiquement des placeholders texte éditables et des cadres image liés."
      },
      {
        "title": "2. Brancher tes données et fusionner",
        "desc": "Dans le panneau Publipostage, connecter une source remplace les champs par les valeurs de la ligne courante et permet l'export par lot, à condition que les noms de colonnes correspondent."
      },
      {
        "title": "3. Exporter une source de données POUR EasyCatalog",
        "desc": "Depuis l'espace Données, le bouton EasyCatalog génère un zip prêt à brancher comme source flat-file, contenant données, champ-clé, types de champs, table d'images et mode d'emploi."
      },
      {
        "title": "4. Réexporter un IDML (aller-retour complet)",
        "desc": "L'export IDML multi-pages conserve les marqueurs EasyCatalog et résout les valeurs par ligne, le document retrouvant ses champs à la réouverture dans InDesign sans lock-in."
      },
      {
        "title": "Les champs ne sont pas reconnus à l'import ?",
        "desc": "Vérifier que l'IDML provient bien d'un document piloté par EasyCatalog, repérable aux crochets verts, un texte tapé à la main n'étant pas un champ."
      },
      {
        "title": "Quelles données mettre dans les colonnes image ?",
        "desc": "Une URL d'image se charge directement et un simple nom de fichier est résolu via le stockage, le binding se branchant seul sur le cadre EasyCatalog importé."
      },
      {
        "title": "Limites connues",
        "desc": "Les champs sous forme qualifiée restent en texte, un champ vide d'origine peut ne pas générer de placeholder, et les images ne sont pas réincorporées à l'export."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "import-pptx",
    "cat": "Import",
    "icon": "📊",
    "anim": "default",
    "title": "Importer PPTX",
    "intro": "Importer un .pptx pour le réutiliser comme template ou point de départ.",
    "features": [
      {
        "title": "Importer un PPTX",
        "desc": "Le parser extrait textes, images, formes, thème et transparences et transforme la slide en page éditable, mais seule la première slide est importée."
      },
      {
        "title": "Cas d'usage type",
        "desc": "Servir de présentation commerciale dynamique mappée sur une base produits, ou faire du reverse engineering d'un PPTX client à reproduire puis exporter en IDML."
      },
      {
        "title": "Limites",
        "desc": "Seule la slide 1 est lue, les animations PowerPoint ne sont pas supportées, les SmartArt sont ignorés et le round-trip n'est fiable que sur des slides simples."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "import-excel",
    "cat": "Import",
    "icon": "🧮",
    "anim": "pim",
    "title": "Importer Excel",
    "intro": "Alimenter le PIM depuis un fichier Excel, CSV/TSV ou Google Sheets.",
    "features": [
      {
        "title": "Formats supportés",
        "desc": "Accepte les fichiers Excel multi-feuilles, les exports CSV ou TSV d'ERP et les Google Sheets via OAuth, avec détection automatique des types de colonnes."
      },
      {
        "title": "Importer un fichier",
        "desc": "Ouvrir le PIM, choisir Importer un fichier ou Créer vide, sélectionner le fichier, vérifier les colonnes détectées puis valider pour créer et synchroniser la base sur Firebase."
      },
      {
        "title": "Et ensuite ?",
        "desc": "Une fois la base importée, tout se passe dans le PIM : enrichir les fiches par IA, gérer les champs structurés et exporter en série."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "import-image",
    "cat": "Import",
    "icon": "🌄",
    "anim": "default",
    "title": "Importer une image",
    "intro": "Placer une image (PNG, JPG, WebP, GIF, SVG) sur le canvas d'un nouveau projet.",
    "features": [
      {
        "title": "Placer une image sur le canvas",
        "desc": "L'image posée reste une image, sans décomposition, sur le canvas d'un nouveau projet."
      },
      {
        "title": "Formats acceptés",
        "desc": "L'import accepte les fichiers PNG, JPG, WebP, GIF et SVG."
      },
      {
        "title": "Manipuler et superposer",
        "desc": "Une fois posée, l'image peut être déplacée, redimensionnée et complétée par d'autres éléments par-dessus."
      },
      {
        "title": "Texte éditable",
        "desc": "Pour rendre le texte d'une image existante éditable plutôt que de simplement la poser, il faut utiliser Image vers SVG éditable."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "import-svg",
    "cat": "Import",
    "icon": "✒️",
    "anim": "img2svg",
    "title": "Importer SVG",
    "intro": "Charger un .svg comme calques vectoriels éditables.",
    "features": [
      {
        "title": "Charger un SVG vectoriel",
        "desc": "Un fichier SVG est chargé en calques vectoriels éditables, ses formes, textes et chemins devenant des objets manipulables dans l'éditeur."
      },
      {
        "title": "Quand l'utiliser",
        "desc": "Pour retoucher ou recolorer un logo vectoriel, ou intégrer dans une maquette un visuel déjà vectorisé depuis Illustrator ou Figma."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "import-image-to-svg",
    "cat": "Import",
    "icon": "🪄",
    "anim": "img2svg",
    "title": "Image → SVG éditable",
    "intro": "Rendre une image raster éditable : fond verrouillé + textes décomposés par IA.",
    "features": [
      {
        "title": "Transformer un raster en projet éditable",
        "desc": "Convertit un fichier PNG, JPG, WebP ou GIF en projet éditable dont le canvas épouse les pixels natifs de la source."
      },
      {
        "title": "Comment ça marche",
        "desc": "L'image est verrouillée en fond pour préserver la fidélité, l'IA Google Vision détecte les textes et les recrée en calques éditables par-dessus, modifiables sans toucher au visuel."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "import-pdf-to-svg",
    "cat": "Import",
    "icon": "📄",
    "anim": "img2svg",
    "title": "PDF → SVG éditable",
    "intro": "Repartir d'un PDF : page 1 rasterisée en fond + textes éditables.",
    "features": [
      {
        "title": "Convertir un PDF en projet éditable",
        "desc": "Convertit un fichier PDF en projet éditable, mais seule la page 1 est traitée, les pages suivantes étant ignorées."
      },
      {
        "title": "Comment ça marche",
        "desc": "Si le PDF a un calque texte natif, la conversion vectorielle exacte est tentée d'abord ; sinon la page 1 est rasterisée puis décomposée comme une image, les CMYK étant ré-encodés en RGB."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "dam",
    "cat": "Données",
    "icon": "🖼️",
    "anim": "dam",
    "title": "DAM",
    "intro": "Banque d'images, génération IA, édition, variantes et organisation des visuels.",
    "features": [
      {
        "title": "Banque d'images",
        "desc": "Recherche dans Pexels et Unsplash, des millions de photos libres de droits, avec filtres par source, orientation et couleur."
      },
      {
        "title": "Mes images",
        "desc": "Regroupe les images sauvegardées, qu'elles viennent de la banque ou de la génération par IA."
      },
      {
        "title": "Favoris",
        "desc": "Rassemble les images marquées d'un cœur pour un accès rapide."
      },
      {
        "title": "Collections",
        "desc": "Des dossiers d'organisation que l'utilisateur crée et remplit lui-même."
      },
      {
        "title": "Récents",
        "desc": "Affiche les derniers ajouts, triés par date."
      },
      {
        "title": "Projets",
        "desc": "Regroupe les images et les polices du projet courant, prêtes à glisser sur le canvas."
      },
      {
        "title": "Création d'image",
        "desc": "Génère des images par IA via Gemini ou Image IA, avec un détail de paramètres présenté plus bas."
      },
      {
        "title": "Animations HTML",
        "desc": "Rassemble les compositions vidéo produites avec HyperFrames."
      },
      {
        "title": "Google Drive",
        "desc": "Donne accès aux fichiers Google Drive une fois le compte connecté."
      },
      {
        "title": "Rechercher des images",
        "desc": "Recherche par texte avec autocomplétion et historique, recherche inversée par image, et filtres combinables sur la source, l'orientation et la couleur dominante."
      },
      {
        "title": "Créer une image par IA",
        "desc": "L'onglet Création d'image utilise le moteur Image IA basé sur Gemini pour générer des visuels à partir d'un prompt et de paramètres dépliables."
      },
      {
        "title": "Prompt (Améliorer / Avec questions)",
        "desc": "Décrire l'image à générer, coller des références, et utiliser Améliorer pour réécrire le prompt en une passe ou Avec questions pour que l'IA pose trois à six questions ciblées."
      },
      {
        "title": "Fichiers de référence",
        "desc": "Ajouter tous formats d'images, logos, PDF ou SVG transmis tels quels à Image IA qui les voit, préserve leur structure et n'applique que les changements demandés."
      },
      {
        "title": "Format de sortie",
        "desc": "Choisir Images et texte par défaut où le modèle peut commenter, ou Images seul pour forcer la sortie visuelle et empêcher une réponse conversationnelle."
      },
      {
        "title": "Température (0 à 2, défaut 1,0)",
        "desc": "Régler la créativité de la génération, vers 0 pour un rendu déterministe et fidèle aux références, vers 2 pour plus de liberté et de variation."
      },
      {
        "title": "Ratio (format)",
        "desc": "Laisser Auto pour que le modèle choisisse le cadrage, ou imposer un rapport carré, paysage ou portrait parmi les valeurs proposées."
      },
      {
        "title": "Résolution (1K / 2K / 4K)",
        "desc": "Définir la résolution du visuel, le 1K étant rapide pour itérer et les 2K et 4K étant deux à trois fois plus lents, réservés au rendu final."
      },
      {
        "title": "Nombre d'images (1 / 2 / 4)",
        "desc": "Générer une, deux ou quatre variations en parallèle du même prompt pour comparer plusieurs propositions d'un coup."
      },
      {
        "title": "Générer & actions sur les résultats",
        "desc": "Pour chaque image générée, télécharger en PNG, sauvegarder dans Mes images avec ses métadonnées de prompt, ou insérer dans l'éditeur, avec réinitialisation possible."
      },
      {
        "title": "Visualiser & éditer une image",
        "desc": "Un clic ouvre la visionneuse lightbox proposant des outils d'édition non destructive : zoom, rotation, recadrage, colorimétrie et export."
      },
      {
        "title": "Recadrage (crop)",
        "desc": "Offre un masque interactif à huit poignées, une grille des tiers et des contraintes de ratio prédéfinies (libre, 1:1, 16:9, 9:16…)."
      },
      {
        "title": "Colorimétrie",
        "desc": "Ajuste luminosité, contraste, saturation et teinte via un filtre CSS non destructif."
      },
      {
        "title": "Variantes",
        "desc": "Sauvegarde une retouche comme variante nommée sans toucher l'originale, chargeable, modifiable, renommable ou supprimable depuis le panneau Versions."
      },
      {
        "title": "Analyse IA d'une image",
        "desc": "Dans la visionneuse, l'IA renvoie sujet, description, marques, texte OCR, ambiance, objets, tags de recherche et palette de couleurs pour retrouver et classer un visuel."
      },
      {
        "title": "Tagging automatique & recherche par tags",
        "desc": "Chaque image sauvegardée dans Mes images est taguée automatiquement en arrière-plan, et un champ permet une recherche en langage naturel sur tags, description et sujet."
      },
      {
        "title": "Utiliser une image dans l'éditeur",
        "desc": "Insérer une image par clic ou glisser-déposer, remplacer un bloc par double-clic en conservant l'original, ou l'utiliser comme remplissage d'une forme."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "pim",
    "cat": "Données",
    "icon": "📦",
    "anim": "pim",
    "title": "PIM",
    "intro": "Gérer tes bases de données produits : fiches, enrichissement IA, champs structurés et export.",
    "features": [
      {
        "title": "Bases de données",
        "desc": "Gérer plusieurs bases en parallèle, créées par import de fichier Excel ou CSV, par scraping web ou à la main en partant d'une base vierge."
      },
      {
        "title": "Enrichir une fiche par IA",
        "desc": "Le mode AUTO trouve l'URL et extrait les infos par recherche web et LLM avec un risque d'hallucination, tandis que le mode TEMPLATE offre une extraction déterministe par sélecteurs CSS."
      },
      {
        "title": "Champs structurés",
        "desc": "Une fiche stocke des champs riches exploitables dans le data-merge : formules Excel évaluées à la volée, spécifications, variants, documents et images."
      },
      {
        "title": "Classer & exporter",
        "desc": "Relier une base à une taxonomie pour naviguer par catégories, puis utiliser le data-merge pour générer un document par produit à partir d'un template."
      },
      {
        "title": "Vue galerie",
        "desc": "Un basculeur tableau/galerie affiche les produits en cartes avec visuel, titre, prix ou marque et pastille de complétude, le mode choisi étant mémorisé."
      },
      {
        "title": "Complétude des fiches",
        "desc": "Chaque ligne porte une pastille verte, ambre ou rouge selon le taux de remplissage, avec champs manquants au survol et complétude moyenne en barre d'état."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "taxonomies",
    "cat": "Données",
    "icon": "🌳",
    "anim": "taxonomy",
    "title": "Taxonomies",
    "intro": "Classifier produits et projets dans une hiérarchie navigable.",
    "features": [
      {
        "title": "Créer une taxonomie",
        "desc": "Créer une taxonomie, la nommer puis ajouter des niveaux en cliquant un nœud pour créer un enfant, glisser pour réorganiser, renommer par double-clic et supprimer par clic-droit."
      },
      {
        "title": "Navigation intelligente",
        "desc": "Dès qu'une base source est active, le navigateur auto-déplie la branche correspondante et colorise les ancêtres jusqu'à la racine, pratique pour les arbres profonds."
      },
      {
        "title": "Lier une taxonomie à une BDD",
        "desc": "Dans le PIM, chaque ligne peut être assignée à un nœud de la taxonomie, ce qui permet ensuite de filtrer les lignes par catégorie depuis le navigateur."
      },
      {
        "title": "Auto-construction depuis le scraping",
        "desc": "Lors du scraping d'un site avec breadcrumb, une taxonomie peut être auto-construite à partir des chemins de catégorie rencontrés, utile pour démarrer un PIM en miroir d'un fournisseur."
      },
      {
        "title": "Onglet Briefs",
        "desc": "La page Taxonomies héberge l'onglet Briefs où décrire un besoin en langage naturel laisse l'IA poser des questions, composer un panier de produits et structurer un deck."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "briefs",
    "cat": "Données",
    "icon": "📝",
    "anim": "chat",
    "title": "Briefs & génération IA",
    "intro": "Décrire en français ce qu'on veut, l'IA produit le contenu.",
    "features": [
      {
        "title": "Modèles IA utilisés",
        "desc": "S'appuie par défaut sur Claude Opus pour les questions et la structure, Gemini pour les prompts d'images et mots-clés, et Gemini avec Claude en secours pour l'enrichissement produit."
      },
      {
        "title": "Où utiliser les briefs ?",
        "desc": "Les briefs s'utilisent dans l'onglet Briefs des Taxonomies, dans le PIM pour réécrire un champ, dans le scraping via un prompt global et dans les templates via un prompt fournisseur."
      },
      {
        "title": "Génération d'images",
        "desc": "Le DAM intègre la génération d'images via Gemini : décrire une image produit un visuel utilisable dans les templates, idéal pour ambiances, mockups et illustrations."
      },
      {
        "title": "Limites des briefs",
        "desc": "L'IA peut halluciner et doit être vérifiée, les briefs sont sans mémoire entre deux appels, et le coût en tokens incite à privilégier les templates de scraping pour les flux récurrents."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "scraping",
    "cat": "Données",
    "icon": "🕸️",
    "anim": "scrape",
    "title": "Scraping produits",
    "intro": "Récupérer des fiches produits depuis le web — sans saisie manuelle.",
    "features": [
      {
        "title": "Quel mode utiliser ?",
        "desc": "Map + Extract pour une page catégorie, Scrape simple pour une URL produit, Crawl pour un site entier, et un Template scraping pour un fournisseur récurrent sans hallucination ni tokens."
      },
      {
        "title": "Créer un template de scraping",
        "desc": "Créer un template avec nom, domaine et pattern d'URL, charger une URL produit, double-cliquer sur les champs pour générer les sélecteurs CSS, tester puis enregistrer."
      },
      {
        "title": "Scraper depuis la BDD (Map + Extract)",
        "desc": "Ouvrir une base, mapper le site depuis une URL catégorie, cocher les URLs à extraire, définir un schéma de champs, extraire par IA puis importer les lignes."
      },
      {
        "title": "Limites à connaître",
        "desc": "Les sites e-commerce hostiles peuvent bloquer mais l'app escalade automatiquement, les sites B2B nécessitent des cookies de session, et le mode TEMPLATE est à privilégier dès qu'il matche."
      },
      {
        "title": "Astuce : enrichissement par URL seule",
        "desc": "Importer un Excel avec une seule colonne URL suffit : le pipeline détecte la colonne, retrouve le template par domaine et lance l'enrichissement déterministe en lot."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "scraping-templates",
    "cat": "Données",
    "icon": "🧩",
    "anim": "scrape",
    "title": "Templates scraping",
    "intro": "Créer et maintenir les templates d'extraction par fournisseur : sélecteurs CSS, prompts et tests.",
    "features": [
      {
        "title": "L'éditeur de template",
        "desc": "Créer un template avec domaine et pattern, pointer les champs pour auto-générer les sélecteurs CSS, éditer en JSON brut, tester avec un score et exporter ou importer en JSON."
      },
      {
        "title": "Trois niveaux de prompts IA",
        "desc": "Trois prompts optionnels guident le post-traitement LLM : le prompt global du template, le prompt fournisseur partagé par tout le domaine et le prompt par champ ciblé."
      },
      {
        "title": "Statistiques d'usage",
        "desc": "Chaque template trace son nombre d'applications et de succès, un taux de succès en chute signalant un site qui a changé de structure et des sélecteurs à re-pointer."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "scraping-hub",
    "cat": "Données",
    "icon": "🛰️",
    "anim": "scrape",
    "title": "Scraping Hub",
    "intro": "Le centre de contrôle du scraping : règles d'équipe, vue par fournisseur et debug des extractions.",
    "features": [
      {
        "title": "Règles",
        "desc": "Rassemble les règles rédactionnelles de l'équipe en markdown, partagées par tous comme référence commune aux enrichissements, leur édition requérant une permission dédiée."
      },
      {
        "title": "Fournisseurs & Templates",
        "desc": "Offre une vue d'ensemble de tous les templates groupés par domaine fournisseur, dépliables pour voir leur état et ouvrir directement l'éditeur d'un clic."
      },
      {
        "title": "Debug Jina/LLM",
        "desc": "Tient le journal des trente dernières requêtes de scraping avec le contenu Jina et la réponse LLM, indispensable pour comprendre pourquoi un champ revient vide."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "price-watch",
    "cat": "Données",
    "icon": "💰",
    "anim": "default",
    "title": "Veille tarifaire",
    "intro": "Suis les prix de tes concurrents : tableau de bord des écarts, positionnement et alertes.",
    "features": [
      {
        "title": "Comment ça se met en place",
        "desc": "Tout part d'un workflow avec le node Veille tarifaire : une feuille de produits et des sites concurrents en entrée, qui retrouve chaque produit, scrape le prix et émet des alertes."
      },
      {
        "title": "Identifiant du suivi",
        "desc": "Le champ Identifiant du suivi mémorise entre deux runs les URLs concurrentes épinglées et l'historique des prix, à garder identique pour suivre un catalogue dans le temps."
      },
      {
        "title": "Alertes positionnement & variation",
        "desc": "Deux familles d'alertes : le positionnement compare ton prix à celui des concurrents, et la variation détecte un prix concurrent ayant bougé au-delà du seuil configuré."
      },
      {
        "title": "Comparer des prix entre sites",
        "desc": "Pour un comparatif ponctuel prix A, prix B et écart sans alertes, utiliser plutôt les nodes Produits d'une page liste et Comparer les prix, avec des modèles prêts à l'emploi."
      },
      {
        "title": "Recevoir les alertes",
        "desc": "Brancher le port changes du node sur Envoyer via Telegram permet d'être prévenu à chaque mouvement de prix, y compris quand le workflow tourne en cron serveur."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "export",
    "cat": "Export",
    "icon": "📤",
    "anim": "export",
    "title": "Export multi-format",
    "intro": "Sortir un PDF imprimeur, un IDML, un PPTX, un SVG, un PNG, un dossier web HTML ou un pack réseaux sociaux — unitaire ou en série.",
    "features": [
      {
        "title": "Formats disponibles",
        "desc": "Exporte vers sept formats visant chacun un usage précis : PDF imprimeur, IDML, PPTX, SVG, PNG, dossier web HTML et pack social de déclinaisons prêtes à poster."
      },
      {
        "title": "Export PDF avec options imprimeur",
        "desc": "Régler le fond perdu et les repères dans le panneau Impression, choisir PDF et cocher l'export print pour étendre le canvas et ajouter des traits de coupe en taille physique."
      },
      {
        "title": "Export batch (plusieurs fichiers)",
        "desc": "Quand le data-merge est actif, l'export génère une variante par ligne en PDF multi-pages ou ZIP individuel, avec nom de fichier personnalisable et streaming d'avancement."
      },
      {
        "title": "Export IDML (retour InDesign)",
        "desc": "Reconstruit un IDML standard avec les valeurs mergées, livré en ZIP avec dossier Links si images, produisant en batch une planche par ligne et conservant les marqueurs EasyCatalog."
      },
      {
        "title": "Bonnes pratiques",
        "desc": "Toujours tester l'export sur une ligne avant un gros batch, vérifier les fonts pour éviter le fallback Arial, confirmer le bleed avec l'imprimeur et éviter le PPTX en cas complexe."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "workflow",
    "cat": "Automatisation",
    "icon": "⚡",
    "anim": "workflow",
    "title": "Workflows",
    "intro": "Enchaîner les fonctions de l'app en pipelines visuels — façon Zapier / Make.",
    "features": [
      {
        "title": "Deux façons de construire",
        "desc": "Construire manuellement en glissant et reliant les nodes, ou via Prompt-to-Flow où un LLM construit le graphe complet depuis une description, disponible aussi via /flow sur Telegram."
      },
      {
        "title": "Import (sources)",
        "desc": "Regroupe les sources : upload de fichier, saisie texte, parser CSV/XLSX, imports IDML/SVG/PPTX/image, conversions vers SVG, imports Google, scrape d'URL, recherche et question web, et cron."
      },
      {
        "title": "Enrichissement",
        "desc": "Regroupe l'enrichissement qui scrape les URLs et complète les champs par IA, la génération d'images depuis un prompt et la décomposition d'un SVG en calques éditables."
      },
      {
        "title": "Transformation",
        "desc": "Permet de définir ou réécrire des colonnes, filtrer et trier les lignes, renommer des colonnes et appliquer des opérations texte comme casse, trim, remplacement ou extraction regex."
      },
      {
        "title": "Sauvegarde",
        "desc": "Permet de persister les lignes comme produits dans le PIM, de construire une taxonomie hiérarchique et d'uploader les assets vers Google Drive."
      },
      {
        "title": "Export",
        "desc": "Génère des fichiers Excel, PPTX ou HTML vers PDF, rend un design en PNG/PDF/PPTX/HTML/SVG, et crée un Google Sheet ou dépose un fichier dans Drive."
      },
      {
        "title": "Logique",
        "desc": "Offre des branchements If/Else, le chaînage d'expressions Pipe, et des boucles Loop each qui itèrent sur un tableau et Loop collect qui agrègent les résultats."
      },
      {
        "title": "Communication & contrôle",
        "desc": "Permet d'envoyer un email Gmail ou un message Telegram, de demander une approbation Telegram qui met en pause, et de comparer aux prix du run précédent avec Veille prix."
      },
      {
        "title": "Piloter depuis Telegram",
        "desc": "Les workflows se déclenchent à distance : /flow génère et exécute un workflow, /run rejoue un workflow sauvegardé, et le fichier produit revient sur Telegram."
      },
      {
        "title": "Modèles prêts à l'emploi",
        "desc": "La galerie Démarrer depuis un modèle propose des workflows complets comme Scraper un site vers PIM ou Veille quotidienne vers Telegram, créés en un clic."
      },
      {
        "title": "Approbation humaine (Telegram)",
        "desc": "Le node Approbation Telegram met le run en pause et envoie une question avec boutons Approuver ou Refuser, le workflow reprenant selon le clic, avec délai maximal configurable."
      },
      {
        "title": "Veille prix",
        "desc": "Le node Veille prix mémorise les prix du run précédent et n'émet le port changes que si un prix a varié au-delà du seuil, fonctionnant aussi en cron serveur."
      },
      {
        "title": "Planifier (cron serveur)",
        "desc": "Le node Cron exécute le workflow côté serveur navigateur fermé, à la cadence minute jusqu'à mois en fuseau Europe/Paris, certains nodes seulement étant compatibles serveur."
      },
      {
        "title": "Webhook entrant (déclenchement externe)",
        "desc": "Le bouton Webhook génère une URL secrète déclenchant le workflow depuis l'extérieur via curl ou Zapier, l'exécution se faisant côté serveur avec un secret régénérable."
      },
      {
        "title": "Débugger pas à pas",
        "desc": "Le bouton Pas à pas exécute le workflow node par node en se mettant en pause avant chaque étape, permettant d'inspecter les sorties entre deux étapes."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "telegram",
    "cat": "Automatisation",
    "icon": "✈️",
    "anim": "telegram",
    "title": "Telegram",
    "intro": "Piloter IBS-Studio depuis Telegram : chat IA avec accès web, génération et exécution de workflows.",
    "features": [
      {
        "title": "Mise en route",
        "desc": "Coller le bot token et le chat ID dans Connecteurs, ouvrir l'onglet Telegram qui fait tourner le worker, le répondeur serveur traitant les messages même app fermée, avec une clé LLM configurée."
      },
      {
        "title": "Texte libre — Chat IA avec accès web",
        "desc": "Le bot répond via le LLM et, si l'info est récente ou si une URL est collée, cherche sur le web et lit les pages avant de répondre en citant ses sources."
      },
      {
        "title": "/flow — Générer puis exécuter un workflow",
        "desc": "Génère un workflow par IA depuis la demande, l'exécute et renvoie le fichier produit."
      },
      {
        "title": "/run — Exécuter un workflow sauvegardé",
        "desc": "Exécute un workflow déjà sauvegardé par son nom, le texte servant d'entrée, /run seul listant les workflows disponibles."
      },
      {
        "title": "/clear — Vider la boîte",
        "desc": "Vide la boîte de réception côté app et côté Telegram pour les messages de moins de 48 heures, avec les alias /purge et /vider."
      },
      {
        "title": "Bon à savoir",
        "desc": "Conversation bidirectionnelle journalisée, fichiers renvoyés en pièce jointe ou résumé, workflows à fichier manuel non exécutables en auto, et nettoyage local après sept jours."
      },
      {
        "title": "Réponses sans navigateur (répondeur serveur)",
        "desc": "Un répondeur serveur traite les messages dès l'arrivée : réponses LLM avec recherche web, /flow généré et exécuté côté serveur, /run, et outils Google une fois l'accès serveur connecté."
      },
      {
        "title": "Digest quotidien",
        "desc": "Activable dans les Connecteurs, le digest envoie chaque matin à 08:00 un résumé des dernières 24 heures, rien n'étant envoyé s'il ne s'est rien passé."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "chat",
    "cat": "Assistant IA",
    "icon": "💬",
    "anim": "chat",
    "title": "Chat IA",
    "intro": "Un assistant conversationnel intégré : questions, rédaction, code, génération d'images.",
    "features": [
      {
        "title": "Conversation multitour",
        "desc": "Le chat garde le fil de la session en transmettant les trente derniers messages, mais l'historique n'est pas conservé entre les rafraîchissements, le bouton Nouvelle conversation remettant à zéro."
      },
      {
        "title": "Pièces jointes",
        "desc": "Joindre des images analysables par les modèles multimodaux, des fichiers texte dont le contenu est lu, ou capturer l'écran en choisissant la fenêtre ou l'onglet."
      },
      {
        "title": "Génération d'images",
        "desc": "La catégorie Image fait passer la saisie en mode génération via Image IA, avec références éditables et boutons Télécharger ou Sauvegarder dans le DAM sous chaque image."
      },
      {
        "title": "Saisie vocale",
        "desc": "Dicter sa demande au micro, la parole étant transcrite en texte dans la zone de saisie."
      },
      {
        "title": "Bibliothèque de prompts",
        "desc": "Des catégories proposent des prompts prêts à l'emploi, créables, modifiables et marquables en favori, les favoris et les plus utilisés remontant en tête de liste."
      },
      {
        "title": "Choix du modèle",
        "desc": "Le Chat utilise une cascade de modèles où le suivant prend le relais si le principal échoue, chaque réponse affichant le modèle utilisé et le détail des tentatives échouées."
      },
      {
        "title": "À ne pas confondre",
        "desc": "Le Chat IA est conversationnel, n'accède pas au web et n'agit pas sur l'app, le bot Telegram étant à utiliser pour un assistant avec accès web et exécution de workflows."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "access",
    "cat": "Administration",
    "icon": "🛡️",
    "anim": "default",
    "title": "Utilisateurs & rôles",
    "intro": "Approuver les comptes, attribuer des rôles et régler finement les permissions. Réservé au propriétaire.",
    "features": [
      {
        "title": "Onboarding d'un nouvel utilisateur",
        "desc": "La personne se connecte via Google avec un compte d'abord en attente sans accès, le propriétaire lui attribue un rôle, et l'app n'affiche alors que les modules autorisés."
      },
      {
        "title": "Attribuer un rôle",
        "desc": "Choisir le rôle de chaque utilisateur dans une liste déroulante, le rôle définissant l'ensemble de base de ses permissions."
      },
      {
        "title": "Surcharges granulaires",
        "desc": "Accorder ou retirer des permissions individuelles au-delà du rôle, par exemple ouvrir l'export sans changer le rôle, Réinitialiser les surcharges effaçant ces ajustements."
      },
      {
        "title": "Bloquer / réactiver",
        "desc": "Bloquer suspend totalement un compte sans le supprimer en lui retirant tout accès même avec un rôle, et Réactiver lui rend ses droits."
      },
      {
        "title": "Onglet Rôles",
        "desc": "Créer et éditer les rôles via une matrice de permissions par module avec trois vues, les permissions étant hiérarchiques où la visibilité commande les actions."
      },
      {
        "title": "Règles de sécurité",
        "desc": "Les permissions effectives combinent rôle plus accordées moins retirées, le propriétaire a un accès total non modifiable, et un utilisateur ne peut pas modifier ses propres droits."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "settings",
    "cat": "Administration",
    "icon": "⚙️",
    "anim": "default",
    "title": "Paramètres",
    "intro": "Clés API et modèles IA, connecteurs (Drive, Telegram, scraping), cookies, statistiques d'usage.",
    "features": [
      {
        "title": "Profil — identité et apparence",
        "desc": "Affiche le profil nom et e-mail Google, et bascule le thème Clair, Sombre ou Système, le choix étant mémorisé sur le compte et basculable depuis la palette ⌘K."
      },
      {
        "title": "IA — clés et modèles",
        "desc": "Renseigner et tester les clés API de chaque fournisseur, choisir le modèle, définir la cascade de raisonnement, et réaligner toute la sélection sur les dernières versions du catalogue."
      },
      {
        "title": "Telegram",
        "desc": "Coller le bot token via BotFather et le chat ID pour piloter l'app depuis Telegram, le bot du module y puisant sa configuration."
      },
      {
        "title": "Google Drive",
        "desc": "Connecter son Google Drive par OAuth pour que les workflows et le node save-dam y déposent des fichiers."
      },
      {
        "title": "Google — accès serveur (Drive + Gmail)",
        "desc": "Autoriser une seule fois le serveur à agir pour soi app fermée, permettant aux workflows planifiés, au webhook et à /flow de créer des Google Sheets et envoyer des Gmail."
      },
      {
        "title": "Scraping (Bright Data, Jina, Firecrawl)",
        "desc": "Renseigner les tokens des services de scraping et de traitement d'image, Bright Data proposant le Web Unlocker et, en escalade, le Scraping Browser pour les sites les plus protégés."
      },
      {
        "title": "Cookies de session",
        "desc": "Gérer les cookies pour scraper des sites B2B derrière login, collés depuis le navigateur et injectés dans les requêtes, leur validité étant limitée dans le temps."
      },
      {
        "title": "Statistiques & Firebase",
        "desc": "Statistiques affiche projets, exports, stockage, coût IA estimé en euros et requêtes Bright Data, tandis que Firebase configure le backend partagé, réservé au propriétaire."
      }
    ],
    "shortcuts": []
  }
]
