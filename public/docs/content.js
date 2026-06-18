// ⚠️ Fichier AUTO-GÉNÉRÉ par scripts/build-docs-content.mjs (prebuild).
// Source de vérité : l'aide intégrée à l'app (src/features/help/content/*.tsx).
// NE PAS éditer à la main — relancer `npm run build` (ou le script) régénère ce fichier.

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
        "desc": "Chaque entrée de la barre latérale est un raccourci vers une grande zone de l'app. Cliquer un lien ci-dessous met l'élément en évidence sur l'écran (ouvre d'abord le tableau de bord si nécessaire)."
      },
      {
        "title": "Créer un projet vierge",
        "desc": "Ouvre le panneau « Nouveau document » et choisis un format (A4, A3, formats écran/réseaux sociaux, ou dimensions personnalisées)."
      },
      {
        "title": "Retrouver un projet existant",
        "desc": "La Bibliothèque liste tous tes projets : • Ouvrir : clic simple sur la carte. Dupliquer / supprimer : boutons de la carte (ou clic droit). • Vignettes ou Liste : deux boutons en haut à droite basculent l'affichage."
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
    "anim": "spark",
    "title": "Nouveautés",
    "intro": "Ce qui vient d'arriver dans l'application — juin 2026.",
    "features": [
      {
        "title": "Navigation & confort",
        "desc": "• Palette de commandes ⌘K / Ctrl+K : projets récents, modules, actions rapides — depuis n'importe quelle page. • Centre de notifications (🔔 en bas à gauche) : historique des runs de workflows et des exports, badge de non-lus."
      },
      {
        "title": "Éditeur",
        "desc": "• Barre contextuelle flottante sous la sélection (dupliquer, plans, grouper, verrouiller, supprimer) + badge temps réel pendant les manipulations (X/Y, L×H, angle)."
      },
      {
        "title": "Re-skin de promo (éditeur × PIM × IA)",
        "desc": "• Source « Produits PIM (re-skin) » dans le panneau Données : chaque produit devient une ligne — naviguer entre les produits re-skinne le visuel instantanément."
      },
      {
        "title": "PIM & données",
        "desc": "• Pastille de complétude sur chaque ligne (champs manquants au survol) + moyenne en barre d'état. • Vue galerie : produits en cartes (visuel, titre, prix, complétude). Détails : section PIM."
      },
      {
        "title": "Workflows & automatisation",
        "desc": "• Galerie de modèles 1-clic (Scraper → PIM, veille, recherche web…). • Node « Approbation Telegram » : le run se met en pause jusqu'au clic ✅/❌. • Node « Veille prix » : alerte seulement quand un prix bouge (fonctionne en cron serveur)."
      },
      {
        "title": "Veille tarifaire & comparaison de prix",
        "desc": "• Nouveau module Veille tarifaire : tableau de bord des prix concurrents (écarts par produit, positionnement, alertes), alimenté par le node « Veille tarifaire » d'un workflow."
      },
      {
        "title": "Telegram sans navigateur (répondeur serveur)",
        "desc": "• Le bot répond app fermée : questions avec recherche web automatique (sources citées), /flow généré et exécuté côté serveur, /run d'un workflow sauvegardé."
      },
      {
        "title": "DAM, Telegram & export",
        "desc": "• Tagging IA automatique des images sauvegardées + filtre en langage naturel dans « Mes images ». • Digest Telegram quotidien (opt-in, 08:00) : résumé des dernières 24 h."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "onboarding",
    "cat": "Démarrage",
    "icon": "🧰",
    "anim": "checklist",
    "title": "Assistant de configuration",
    "intro": "Mettre en place son espace pas à pas : clés IA, modèles, connecteurs et visite guidée.",
    "features": [
      {
        "title": "1 · Bienvenue",
        "desc": "Présentation des étapes à venir (clés IA, modèles & cascade, connecteurs, visite guidée). Rien à saisir."
      },
      {
        "title": "2 · Clés IA — obligatoire",
        "desc": "Renseigne au moins une clé API parmi Gemini, Claude (Anthropic), OpenAI, DeepSeek, Qwen, Kimi ou OpenRouter, puis teste-la. Tant qu'aucune clé valide n'est saisie, le bouton Suivant reste désactivé (« Renseignez au moins une clé LLM »)."
      },
      {
        "title": "3 · Modèles & cascade",
        "desc": "Choisis le modèle de chaque fournisseur et l'ordre de la cascade de raisonnement (le premier qui répond gagne, les suivants servent de secours)."
      },
      {
        "title": "4 · Connecteurs — optionnel",
        "desc": "Branche Google Drive, Bright Data (scraping) et Telegram si tu en as besoin. Cette étape peut être passée et complétée plus tard dans Réglages → Connecteurs."
      },
      {
        "title": "5 · Terminé",
        "desc": "Récapitulatif de ton profil, puis le choix de lancer la visite guidée du tableau de bord ou de terminer directement."
      },
      {
        "title": "Reprendre la configuration plus tard",
        "desc": "L'assistant reste accessible à tout moment, par deux entrées : • Bandeau « Assistant de configuration » en haut des Réglages — sous-titre « Reprendre la mise en place guidée (clés, modèles, connecteurs) »."
      },
      {
        "title": "Bouton « Mettre à jour tous les LLM »",
        "desc": "Présent dans l'assistant et dans l'onglet IA des Réglages, il sélectionne le dernier modèle phare de chaque fournisseur (Claude, Gemini, OpenAI, DeepSeek, Qwen, Kimi, OpenRouter)."
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
        "desc": "Un bouton ☰ flottant en bas à gauche ouvre un tiroir listant tous les modules : Nouveau document, Importer, Bibliothèque, DAM, PIM, Taxonomies, Templates scraping, Scraping Hub, Workflows, Veille tarifaire, Telegram, Animation, Chat IA et U…"
      },
      {
        "title": "Palette de commandes (⌘K)",
        "desc": "⌘K (Mac) ou Ctrl+K (PC) ouvre la palette de commandes depuis n'importe quelle page : tape quelques lettres pour ouvrir un de tes projets récents, sauter vers un module (« pim », « workflows », « bibliothèque »…) ou lancer une action rapide…"
      },
      {
        "title": "Notifications (🔔)",
        "desc": "La cloche en bas à gauche (au-dessus du menu ☰) garde l'historique des évènements importants : fins de runs de workflow, exports réussis ou échoués."
      },
      {
        "title": "Visites guidées (🧭)",
        "desc": "Un bouton 🧭 « Visite guidée » en bas à droite (à gauche du bouton d'aide) lance une visite interactive de l'écran courant : • Tableau de bord : parcourt chaque espace de travail un par un."
      },
      {
        "title": "Ce manuel s'adapte à ton rôle",
        "desc": "Le sommaire et la recherche de l'aide ne montrent que les sections des modules auxquels tu as accès (le propriétaire voit tout)."
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
        "title": "Images",
        "desc": "Insertion d'images sans quitter l'éditeur : onglets Galerie, Upload, IA (génération depuis un prompt, 5 ratios, image-to-image si un objet est sélectionné), Stock, Mes images, Favoris, Collections, Récents — les mêmes sources que le DAM."
      },
      {
        "title": "Assets",
        "desc": "Les images et polices du projet (onglets avec compteurs). Glisse une image sur le canvas, ou utilise les polices importées (IDML) dans tes textes."
      },
      {
        "title": "Page",
        "desc": "Format de page : presets (A4/A3/A5, Full HD, 4K, 16:9, post & story Instagram, couverture Facebook) ou dimensions personnalisées en mm. Fond de page : couleur unie, dégradé ou image (upload ou glisser-déposer)."
      },
      {
        "title": "Impression",
        "desc": "Tout le pré-presse : DPI, fond perdu (bleed), traits de coupe (longueur 2–10 mm, décalage 0–3 mm, épaisseur, couleur), hirondelles de repérage (registration marks), zone de sécurité (marge, pointillés paramétrables) et la section Preflight…"
      },
      {
        "title": "Animation 3D",
        "desc": "Applique des animations 3D à un objet (flip 3D, relief, particules…) via des presets, avec lecture/arrêt et enregistrement vidéo (export MP4/WebM) du rendu animé."
      },
      {
        "title": "Palette · Données · Versions",
        "desc": "Détaillés dans leurs sections dédiées plus bas (kit de marque & styles d'objets, re-skin PIM / publipostage, snapshots)."
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
          "⌘",
          "⇧",
          "]"
        ],
        "label": "Premier plan"
      },
      {
        "keys": [
          "⌘",
          "⇧",
          "["
        ],
        "label": "Arrière-plan"
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
      },
      {
        "keys": [
          "⌘",
          "↵"
        ],
        "label": "Ajouter une page"
      }
    ]
  },
  {
    "id": "hyperframes",
    "cat": "Édition",
    "icon": "🎬",
    "anim": "reveal",
    "title": "Animation",
    "intro": "Générer des animations HTML autonomes (vidéo) à partir d'un brief ou d'un design du canvas.",
    "features": [
      {
        "title": "À partir d'un brief (vidéo multi-scènes)",
        "desc": "Décris ton sujet, et optionnellement l'audience, l'objectif, le ton, la marque et un caption."
      },
      {
        "title": "À partir d'un design du canvas (design-reveal)",
        "desc": "Depuis l'éditeur, on capture le SVG du projet courant et l'IA l'anime (apparitions, rythme, easing) selon une consigne de style. Idéal pour transformer une création print en teaser animé."
      },
      {
        "title": "Fichiers de référence",
        "desc": "Glisse des images, PDF ou SVG pour enrichir le brief : l'IA les lit (texte + visuel) et s'en sert comme contexte."
      },
      {
        "title": "Format et durée",
        "desc": "• Ratio : Auto, portrait (9:16), carré (1:1), paysage (16:9) ou dimensions personnalisées (largeur × hauteur, 240 à 4096 px, ratio affiché en direct)."
      },
      {
        "title": "Enrichir et finaliser",
        "desc": "• Enrichir avec des images IA : l'IA génère un visuel par scène (affiché en fond, effet Ken Burns). • Aperçu live : le lecteur joue la composition avec le style appliqué (rythme, intensité, easing, palette)."
      },
      {
        "title": "Bibliothèque de prompts",
        "desc": "Chaque génération mémorise son brief : tu peux le rejouer, le charger pour l'ajuster, le renommer ou le supprimer — pour produire des variantes sans tout ressaisir."
      },
      {
        "title": "Voir aussi",
        "desc": "La génération s'appuie sur les modèles IA configurés dans les Paramètres → IA. Les visuels de scène utilisent le moteur de génération d'image (Image IA), le même que dans le DAM et le Chat IA."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "import-idml",
    "cat": "Import",
    "icon": "📐",
    "anim": "import",
    "title": "Import IDML",
    "intro": "Récupérer une maquette InDesign et la transformer en template IBS-Studio.",
    "features": [
      {
        "title": "Comment exporter un IDML depuis InDesign",
        "desc": "1. Ouvre ton document dans InDesign CC ou plus récent 2. Fichier → Exporter… 3. Choisis le format InDesign Markup (IDML) 4. Enregistre Le fichier IDML est en réalité un ZIP contenant XML + ressources (fonts, images)."
      },
      {
        "title": "Importer dans IBS-Studio",
        "desc": "1. Tableau de bord → Importer 2. Sélectionne le .idml 3. Patiente : le parser extrait formes, textes, images, fonts, ombres et transparence — toutes les pages du document (chaque planche devient une page IBS-Studio) 4."
      },
      {
        "title": "Limites connues",
        "desc": "• Fonts custom : si non installées sur la machine → fallback Arial. Pour une fidélité parfaite, charge tes fonts dans public/fonts/ • Dégradés : non importés — les objets dégradés reviennent en couleur unie (à recréer dans l'éditeur si beso…"
      },
      {
        "title": "Aller-retour InDesign ↔ IBS-Studio",
        "desc": "Le cycle classique : 1. Graphiste crée la maquette dans InDesign 2. Exporte un IDML 3. Imprimeur importe dans IBS-Studio, ajoute placeholders, branche le data-merge 4. Batch export IDML (un par produit) ou PDF direct 5."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "easycatalog",
    "cat": "Import",
    "icon": "🔗",
    "anim": "import",
    "title": "EasyCatalog (InDesign)",
    "intro": "Aller-retour avec le plug-in EasyCatalog : importer un gabarit, fusionner ses champs, puis réexporter un IDML reconnu nativement.",
    "features": [
      {
        "title": "1. Importer un gabarit EasyCatalog",
        "desc": "1. Depuis InDesign (avec ton document EasyCatalog ouvert) : Fichier → Exporter… → InDesign Markup (IDML) 2. Dans IBS-Studio : Tableau de bord → Importer → sélectionne le .idml 3. Le gabarit s'ouvre dans l'éditeur."
      },
      {
        "title": "2. Brancher tes données et fusionner",
        "desc": "Dans l'éditeur, panneau Publipostage : connecte une source (Excel, Google Sheets, PIM…). IBS-Studio remplace les {{champs}} par les valeurs de la ligne courante, et charge les images dans les cadres liés."
      },
      {
        "title": "3. Exporter une source de données POUR EasyCatalog",
        "desc": "Depuis l'espace Données, bouton EasyCatalog : génère un zip prêt à brancher comme flat-file data source dans EasyCatalog."
      },
      {
        "title": "4. Réexporter un IDML (aller-retour complet)",
        "desc": "Depuis l'éditeur, Exporter → IDML (multi-pages) : IBS-Studio produit un IDML qui conserve les marqueurs EasyCatalog et résout les valeurs par ligne."
      },
      {
        "title": "Les champs ne sont pas reconnus à l'import ?",
        "desc": "Vérifie que l'IDML provient bien d'un document piloté par EasyCatalog (les champs y sont insérés via le panneau EasyCatalog, repérables aux crochets verts). Un texte tapé à la main n'est pas un champ."
      },
      {
        "title": "Quelles données mettre dans les colonnes image ?",
        "desc": "Une URL d'image (ex. lien Firebase/DAM) se charge directement. Un simple nom de fichier est résolu via ton stockage si le fichier y existe. Le binding image se branche tout seul sur le cadre EasyCatalog importé."
      },
      {
        "title": "Limites connues",
        "desc": "• Les champs sous forme qualifiée (référence data source complète) ne sont pas encore convertis en placeholders et restent en texte. • Un champ sans valeur dans le gabarit d'origine peut ne pas générer de placeholder."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "import-pptx",
    "cat": "Import",
    "icon": "📊",
    "anim": "import",
    "title": "Importer PPTX",
    "intro": "Importer un .pptx pour le réutiliser comme template ou point de départ.",
    "features": [
      {
        "title": "Importer un PPTX",
        "desc": "1. Tableau de bord → Importer 2. Sélectionne le .pptx 3. Le parser extrait textes, images et formes — y compris le thème (les couleurs de thème sont résolues) et les transparences de remplissage 4."
      },
      {
        "title": "Cas d'usage type",
        "desc": "Présentation commerciale dynamique : ton équipe vente part d'un PPTX modèle. Tu l'importes une fois, tu mappes les placeholders sur ta BDD produits, et chaque commercial génère sa version personnalisée (logo client, prix négocié, références…"
      },
      {
        "title": "Limites",
        "desc": "• Multi-slides : seule la slide 1 est lue — les suivantes sont ignorées • Animations PowerPoint : non supportées (IBS-Studio exporte du print/statique) • SmartArt : ignorés à l'import (non convertis en formes) • Round-trip PPTX → Fabric → P…"
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
        "desc": "L'import détecte automatiquement les types de colonnes : texte, nombre, booléen, date, formule (stockée puis évaluée au moment de la fusion) et dictionnaire (colonne à valeurs répétitives → liste de choix)."
      },
      {
        "title": "Importer un fichier",
        "desc": "1. Ouvre PIM depuis le menu. 2. Clique Importer un fichier (ou Créer vide pour partir d'une base vierge). 3. Sélectionne ton fichier. 4. Vérifie les colonnes détectées. 5. Valide → la base est créée et synchronisée sur Firebase."
      },
      {
        "title": "Et ensuite ?",
        "desc": "Une fois la base importée, tout se passe dans le PIM : enrichir les fiches par IA, gérer les champs structurés (spécifications, variants, documents, images) et exporter en série. Voir la section PIM."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "import-image",
    "cat": "Import",
    "icon": "🌄",
    "anim": "import",
    "title": "Importer une image",
    "intro": "Placer une image (PNG, JPG, WebP, GIF, SVG) sur le canvas d'un nouveau projet.",
    "features": [],
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
        "title": "Quand l'utiliser",
        "desc": "• Un logo vectoriel à retoucher ou recolorer. • Un visuel déjà vectorisé (export Illustrator/Figma) à intégrer dans une maquette."
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
        "title": "Comment ça marche",
        "desc": "1. L'image est verrouillée en fond (fidélité visuelle préservée). 2. L'IA (Google Vision) détecte les textes et les recrée en calques éditables par-dessus (overlays). 3."
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
        "title": "Comment ça marche",
        "desc": "1. Si le PDF contient un calque texte natif exploitable, la conversion vectorielle est tentée d'abord : les textes arrivent exacts (pas d'OCR). 2."
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
        "title": "Les onglets",
        "desc": "Clique un onglet pour l'ouvrir directement dans le DAM."
      },
      {
        "title": "Banque d'images",
        "desc": "Recherche dans Pexels & Unsplash (millions de photos libres de droits) avec filtres source / orientation / couleur."
      },
      {
        "title": "Mes images",
        "desc": "Tes images sauvegardées — depuis la banque ou issues de la génération IA."
      },
      {
        "title": "Favoris",
        "desc": "Les images que tu as marquées d'un ♥ pour un accès rapide."
      },
      {
        "title": "Collections",
        "desc": "Des dossiers d'organisation que tu crées et remplis toi-même."
      },
      {
        "title": "Récents",
        "desc": "Les derniers ajouts, triés par date."
      },
      {
        "title": "Projets",
        "desc": "Les images et les polices du projet courant, prêtes à glisser sur le canvas."
      },
      {
        "title": "Création d'image",
        "desc": "Génération d'images par IA (Gemini / Image IA) — voir le détail des paramètres plus bas."
      },
      {
        "title": "Animations HTML",
        "desc": "Tes compositions vidéo (HyperFrames)."
      },
      {
        "title": "Google Drive",
        "desc": "Accès à tes fichiers Google Drive une fois ton compte connecté."
      },
      {
        "title": "Rechercher des images",
        "desc": "• Par texte : barre de recherche avec autocomplétion et historique des recherches récentes. • Par image (recherche inversée) : bouton caméra → choisis une image locale → le DAM trouve des visuels similaires dans la banque."
      },
      {
        "title": "Créer une image par IA",
        "desc": "Onglet Création d'image — moteur Image IA (Gemini 3.1 image, texte → image). Déplie chaque paramètre :"
      },
      {
        "title": "Prompt (+ Améliorer / Avec questions)",
        "desc": "Décris l'image à générer. Tu peux coller une image dans le champ : elle rejoint les fichiers de référence."
      },
      {
        "title": "Fichiers de référence",
        "desc": "Bouton « Ajouter des fichiers » (ou colle une image). Tous formats : images, logos, PDF, SVG (rastérisé en PNG, plafonné à 2048 px)."
      },
      {
        "title": "Format de sortie",
        "desc": "• Images & texte (défaut) : image + texte — le modèle peut commenter brièvement. • Images seul."
      },
      {
        "title": "Température (0 → 2, défaut 1,0)",
        "desc": "Curseur, pas de 0,1. Règle la créativité : • 0 — Précis : déterministe, fidèle au prompt/références. • 2 — Créatif : plus de liberté et de variation. Reproduire une référence → baisse vers 0 ; explorer → monte vers 2."
      },
      {
        "title": "Ratio (format)",
        "desc": "Auto · 1:1 · 16:9 · 9:16 · 4:3 · 3:4. • Auto (défaut) : le modèle choisit le cadrage adapté au prompt/références (aucune contrainte envoyée). • Les autres imposent le rapport : 1:1 carré (réseaux), 16:9 / 4:3 paysage, 9:16 / 3:4 portrait."
      },
      {
        "title": "Résolution (1K / 2K / 4K)",
        "desc": "1K (défaut) · 2K · 4K. Définition du visuel. ⚠️ 2K et 4K sont 2 à 3× plus lents — réserve-les au rendu final, reste en 1K pour itérer."
      },
      {
        "title": "Nombre d'images (1 / 2 / 4)",
        "desc": "1 (défaut) · 2 · 4. Génère N variations en parallèle du même prompt — pour comparer plusieurs propositions d'un coup."
      },
      {
        "title": "Générer & actions sur les résultats",
        "desc": "Bouton « Générer ». Pour chaque image : • Télécharger — PNG en local. • Sauvegarder — vers « Mes images » (prompt d'origine, prompt amélioré et Q/R conservés en métadonnées). • Insérer dans l'éditeur — place l'image dans le projet ouvert."
      },
      {
        "title": "Visualiser & éditer une image",
        "desc": "Un clic ouvre la visionneuse (lightbox). Outils d'édition non destructive :"
      },
      {
        "title": "Zoom · Rotation · Miroir",
        "desc": "Zoom avant/arrière + ajustement, Rotation par 90°, Miroir horizontal et vertical."
      },
      {
        "title": "Recadrage (crop)",
        "desc": "Masque interactif à 8 poignées, grille des tiers, contraintes de ratio (libre, 1:1, 4:3, 3:4, 16:9, 9:16, 3:2, 2:3)."
      },
      {
        "title": "Colorimétrie",
        "desc": "Sliders Luminosité, Contraste, Saturation, Teinte (rendu via filtre CSS, non destructif)."
      },
      {
        "title": "Export",
        "desc": "Formats PNG / JPEG / WebP, avec réglage de qualité (JPEG/WebP) et d'échelle (% de la résolution native)."
      },
      {
        "title": "Réinitialiser",
        "desc": "Annule toutes les retouches et revient à l'image d'origine."
      },
      {
        "title": "Variantes",
        "desc": "Sauvegarde une retouche (crop + colorimétrie + miroir + rotation) comme variante nommée d'une image, sans toucher l'originale : • Enregistrer variante → donne-lui un nom."
      },
      {
        "title": "Analyse IA d'une image",
        "desc": "Dans la visionneuse, onglet Analyse IA → bouton « Analyser avec IA ». L'IA renvoie : sujet, description, marques identifiées, texte détecté (OCR), ambiance / style / composition / éclairage, objets, tags de recherche et palette de couleurs.…"
      },
      {
        "title": "Tagging automatique & recherche par tags",
        "desc": "Chaque image sauvegardée dans Mes images (génération IA, images du Chat) est taguée automatiquement en arrière-plan : tags, couleur dominante et sujet sont posés sur la fiche quelques secondes après la sauvegarde."
      },
      {
        "title": "Organiser",
        "desc": "• Favoris (♥) : accès rapide. • Collections : crée des dossiers, ajoute/retire des images, vue vignettes ou liste."
      },
      {
        "title": "Utiliser une image dans l'éditeur",
        "desc": "• Clic : insère l'image au centre du canvas (mise à l'échelle automatique). • Glisser-déposer : depuis la grille vers le canvas (équivaut à l'insertion)."
      },
      {
        "title": "Sources externes",
        "desc": "• Pexels & Unsplash : banque intégrée (recherche + filtres). • Google Drive : connecte ton compte (onglet Google Drive) pour piocher dans tes fichiers."
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
        "desc": "Tu peux gérer plusieurs bases en parallèle. Trois façons d'en créer une : • Importer un fichier — depuis Excel ou CSV/TSV (voir Importer Excel). • Scraper le web — partir d'URLs produits et laisser l'IA remplir les fiches."
      },
      {
        "title": "Enrichir une fiche par IA",
        "desc": "Clique sur une ligne → panneau Enrichi par IA à droite. Mode AUTO (violet) : si la ligne a un title, brand ou reference, une recherche web (Jina) + LLM trouve l'URL et extrait les infos (modèle principal : Gemini, secours : Claude)."
      },
      {
        "title": "Champs structurés",
        "desc": "Au-delà du texte simple, une fiche stocke des champs riches, tous exploitables dans le data-merge : • Formules Excel : évaluées à la volée. • Spécifications : [{ group, name, value }] (dimensions, matériaux…)."
      },
      {
        "title": "Champs calculés (colonnes formules)",
        "desc": "Une colonne peut être une formule plutôt qu'une valeur saisie — comme dans Excel. Tu écris une expression qui référence d'autres colonnes, et la valeur se recalcule à la volée quand les données changent."
      },
      {
        "title": "Classer & exporter",
        "desc": "• Relie une base à une taxonomie pour naviguer le catalogue par catégories. • Une fois les fiches prêtes, le data-merge génère un document par produit à partir d'un template (PDF, PNG…)."
      },
      {
        "title": "Vue galerie",
        "desc": "Le basculeur tableau / galerie (en haut à droite de la table) affiche les produits en cartes : visuel (colonne image détectée automatiquement), titre, prix ou marque, et pastille de complétude. Cliquer une carte ouvre la fiche."
      },
      {
        "title": "Complétude des fiches",
        "desc": "Chaque ligne de la table porte une pastille de complétude : verte (≥ 90 % des colonnes remplies), ambre (≥ 60 %) ou rouge. Survole-la pour voir les champs manquants."
      },
      {
        "title": "Voir aussi",
        "desc": "L'export en série (data-merge) est détaillé dans la section Export multi-format. Le re-skin d'un visuel par les produits PIM est décrit dans la section L'éditeur."
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
        "desc": "1. Va dans Taxonomies depuis le menu 2. Clique Nouvelle taxonomie 3. Donne-lui un nom (ex: Catégories produits) 4. Ajoute des niveaux : clique sur un nœud pour créer un enfant, glisse pour réorganiser 5."
      },
      {
        "title": "Navigation intelligente",
        "desc": "Dès qu'une BDD source est active, le navigateur de gauche auto-déplie la branche correspondante et colorise tous les ancêtres du nœud sélectionné jusqu'à la racine. Désélectionner referme la branche."
      },
      {
        "title": "Associer des produits à une catégorie",
        "desc": "Dans le PIM, chaque produit (ligne) est rattaché à un nœud de la taxonomie. Deux voies : • Manuel — sélectionne une ligne → clique « Non classé — cliquer pour classer » au-dessus du panneau → choisis le nœud cible."
      },
      {
        "title": "Auto-construction depuis le scraping",
        "desc": "Quand tu scrapes un site avec un breadcrumb (fil d'Ariane), IBS-Studio peut auto-construire une taxonomie à partir des chemins de catégorie rencontrés. Utile pour démarrer un PIM en miroir d'un site fournisseur."
      },
      {
        "title": "Onglet Briefs",
        "desc": "La page Taxonomies héberge aussi l'onglet Briefs : décris un besoin en langage naturel, l'IA pose des questions, compose un panier de produits du catalogue et structure un deck. Détail dans la section Briefs & génération IA."
      },
      {
        "title": "Cas d'usage",
        "desc": "• Catalogue multi-marques : taxonomie principale par typologie produit (Outillage / Jardin / Électroménager) • Multi-langues : une taxonomie par langue, ou bien une taxonomie unique avec des labels multilingues sur les nœuds • Reporting : f…"
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
        "desc": "IBS-Studio s'appuie par défaut sur : • Claude Opus (Anthropic) — questions dynamiques, composition du panier et structure du deck • Gemini (Google) — prompts d'images, mots-clés catalogue, génération d'images (Claude en secours) • Enrichiss…"
      },
      {
        "title": "Où utiliser les briefs ?",
        "desc": "Dans les Taxonomies : l'onglet Briefs de la page Taxonomies est le panneau dédié — décris ton besoin, l'IA pose des questions dynamiques, compose un panier de produits depuis le catalogue et structure un deck (avec prompts d'images)."
      },
      {
        "title": "Génération d'images",
        "desc": "Le DAM intègre la génération d'images via Gemini (modèle image dit « Image IA »). Tu décris une image en français ou en anglais, l'IA produit un visuel utilisable directement dans tes templates."
      },
      {
        "title": "Limites des briefs",
        "desc": "• L'IA peut halluciner des références ou caractéristiques. Toujours vérifier le résultat avant publication, surtout sur les chiffres et les normes. • Les briefs sont stateless : aucune mémoire conversationnelle."
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
        "desc": "Pour un fournisseur que tu vas scraper plus de 2 fois, crée un template. C'est la voie royale : 0 hallucination IA, 0 token consommé, réutilisable sur des centaines d'URLs."
      },
      {
        "title": "Créer un template de scraping",
        "desc": "1. Ouvre la page Templates scraping depuis le menu latéral 2. Clique Nouveau → entre un nom (ex: Nicoll), le domaine (nicoll.fr) et un pattern d'URL (. pour tout matcher) 3."
      },
      {
        "title": "Scraper depuis la BDD (Map + Extract)",
        "desc": "Quand tu n'as pas encore de template, ou pour explorer un nouveau site : 1. PIM → ouvre une BDD (ou crée-la vide) 2. Bouton Scraper le web → onglet Map + Extract 3. Colle une URL catégorie → Mapper le site → liste des liens internes 4."
      },
      {
        "title": "Limites à connaître",
        "desc": "• Sites e-commerce hostiles (Mr-Bricolage, Darty, Boulanger…) : DataDome/Akamai peut bloquer."
      },
      {
        "title": "Tip pro : URL-only enrichissement",
        "desc": "Tu peux importer un Excel avec uniquement une colonne URL (sans titre/marque/réf). Le pipeline détecte la colonne URL, retrouve le template par domaine, et lance l'enrichissement TEMPLATE en un clic."
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
        "desc": "• Nouveau crée un template : nom, domaine (nicoll.fr), pattern d'URL (. pour tout matcher)."
      },
      {
        "title": "Trois niveaux de prompts IA",
        "desc": "En complément des sélecteurs, trois prompts optionnels guident le post-traitement LLM : • Prompt global (du template) : instructions de reformatage pour tous les produits de ce template — ex."
      },
      {
        "title": "Statistiques d'usage",
        "desc": "Chaque template trace son nombre d'applications et de succès — un template au taux de succès en chute signale un site qui a changé de structure (sélecteurs à re-pointer)."
      },
      {
        "title": "Voir aussi",
        "desc": "La vue d'ensemble par fournisseur (templates groupés par domaine) est dans le Scraping Hub. Le mode d'emploi général du scraping (quel mode choisir, Map + Extract, limites anti-bot) est dans la section Scraping produits."
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
        "desc": "Les règles rédactionnelles de l'équipe (markdown) : conventions de nommage, formats de prix, langue des descriptions… Stockées dans Firestore et partagées par toute l'équipe, elles servent de référence commune aux enrichissements."
      },
      {
        "title": "Fournisseurs & Templates",
        "desc": "Vue d'ensemble de tous les templates groupés par domaine fournisseur : déplie un fournisseur pour voir ses templates et leur état, et ouvre directement l'éditeur de template d'un clic."
      },
      {
        "title": "Debug Jina/LLM",
        "desc": "Le journal des dernières requêtes de scraping (30 max, rafraîchi toutes les 2 s) : pour chaque appel, le contenu renvoyé par Jina et la réponse du LLM."
      },
      {
        "title": "Voir aussi",
        "desc": "La création des templates se fait dans Templates scraping ; le mode d'emploi général (Scrape, Map + Extract, Crawl, limites anti-bot) est dans Scraping produits."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "price-watch",
    "cat": "Données",
    "icon": "💰",
    "anim": "pricewatch",
    "title": "Veille tarifaire",
    "intro": "Suis les prix de tes concurrents : tableau de bord des écarts, positionnement et alertes.",
    "features": [
      {
        "title": "Comment ça se met en place",
        "desc": "Tout part d'un workflow contenant le node « Veille tarifaire » : 1. Une feuille de produits en entrée (ton catalogue : SKU/EAN, Nom, Marque, et ton prix). 2. Les sites concurrents à surveiller (un domaine par ligne, ex : amazon.fr). 3."
      },
      {
        "title": "Identifiant du suivi",
        "desc": "Le champ « Identifiant du suivi » du node mémorise, entre deux runs, les URLs concurrentes épinglées et l'historique des prix. Garde le même identifiant pour suivre un catalogue dans le temps ; change-le pour démarrer un suivi distinct."
      },
      {
        "title": "Alertes positionnement & variation",
        "desc": "Deux familles d'alertes : le positionnement (comparaison de ton prix — colonne « Mon prix » — à celui des concurrents) et la variation (un prix concurrent a changé depuis le dernier run, au-delà du seuil % configuré)."
      },
      {
        "title": "Comparer des prix entre sites",
        "desc": "Pour un comparatif ponctuel prix A | prix B | écart entre plusieurs enseignes (sans alertes), utilise plutôt les nodes « Produits d'une page liste » + « Comparer les prix » dans un workflow."
      },
      {
        "title": "Recevoir les alertes",
        "desc": "Branche le port changes du node sur « Envoyer via Telegram » (« 1 message par ligne ») pour être prévenu à chaque mouvement de prix — y compris quand le workflow tourne en cron serveur, navigateur fermé."
      },
      {
        "title": "Voir aussi",
        "desc": "Le détail des nodes (« Veille tarifaire », « Veille prix », « Comparer les prix ») et de la planification cron serveur est dans la section Workflows ; l'envoi d'alertes est couvert par Telegram."
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
        "desc": "Tous les exports sont fidèles à la maquette en cours dans l'éditeur. Le data-merge actif influence le contenu mais pas le format."
      },
      {
        "title": "Export PDF avec options imprimeur",
        "desc": "1. Règle d'abord le fond perdu et les repères dans le panneau Impression de l'éditeur (c'est lui qui fait foi — la modale d'export n'a pas de champ bleed) 2. Bouton Exporter → choisis PDF 3."
      },
      {
        "title": "Export batch (plusieurs fichiers)",
        "desc": "Quand le data-merge est actif, l'export génère une variante par ligne de la BDD : 1. Ouvre le panneau Data Merge → vérifie le mapping placeholders ↔ colonnes 2."
      },
      {
        "title": "Export IDML (retour InDesign)",
        "desc": "Quand tu veux que ta graphiste finisse à la main dans InDesign : 1. Configure ta maquette + data-merge dans IBS-Studio 2. Export IDML → IBS-Studio reconstruit un fichier IDML standard avec les valeurs déjà mergées."
      },
      {
        "title": "Bonnes pratiques",
        "desc": "• Toujours faire un export test sur 1 ligne avant de lancer un batch de 200 — tu détectes les problèmes de fonts ou d'images manquantes plus vite • Vérifier les fonts : si un fallback Arial s'est appliqué, ton imprimeur le verra."
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
        "desc": "• Manuel : glisse les nodes depuis la palette (à gauche), relie-les, configure chacun (panneau de droite), puis Run."
      },
      {
        "title": "Catalogue des nodes",
        "desc": "Déplie une catégorie pour voir ses nodes."
      },
      {
        "title": "Import (sources)",
        "desc": ""
      },
      {
        "title": "Enrichissement",
        "desc": ""
      },
      {
        "title": "Transformation",
        "desc": ""
      },
      {
        "title": "Sauvegarde",
        "desc": ""
      },
      {
        "title": "Export",
        "desc": ""
      },
      {
        "title": "Logique",
        "desc": ""
      },
      {
        "title": "Communication & contrôle",
        "desc": ""
      },
      {
        "title": "Exemples de pipelines",
        "desc": "• Veille : Recherche web → Export Excel → Envoyer via Gmail. • Réponse sourcée : Question web (IA) → Envoyer via Telegram. • Fiches produit : Scrape URL → Enrichissement → Save PIM → Export PPTX."
      },
      {
        "title": "Piloter depuis Telegram",
        "desc": "Les workflows se déclenchent aussi à distance : /flow <demande> génère et exécute un workflow, /run <nom> rejoue un workflow sauvegardé — et le fichier produit revient sur Telegram."
      },
      {
        "title": "Modèles prêts à l'emploi",
        "desc": "La page Workflows propose une galerie « Démarrer depuis un modèle » : Scraper un site → PIM, Veille quotidienne → Telegram (cron), Scrape → approbation ✅ → PIM, Recherche web → Excel."
      },
      {
        "title": "Approbation humaine (Telegram)",
        "desc": "Le node « Approbation Telegram » met le run en pause et envoie la question sur Telegram avec des boutons ✅ Approuver / ❌ Refuser."
      },
      {
        "title": "Veille prix",
        "desc": "Le node « Veille prix » mémorise les prix du run précédent (par identifiant de suivi) et n'émet le port changes que si un prix a varié au-delà du seuil — les lignes émises portent ancienprix, nouveauprix et variationpct, prêtes pour un mess…"
      },
      {
        "title": "Planifier (cron serveur)",
        "desc": "Le node « Cron » exécute le workflow côté serveur, navigateur fermé : cadence à la minute, heure, jour, semaine ou mois, heure précise HH:MM, jour de semaine ciblé ou « Tous les jours » — fuseau Europe/Paris, granularité minimale 1 minute."
      },
      {
        "title": "Webhook entrant (déclenchement externe)",
        "desc": "Le bouton Webhook dans l'en-tête de l'éditeur génère une URL secrète pour déclencher ce workflow depuis l'extérieur (Zapier, Make, un ERP, un simple curl) : L'exécution se fait côté serveur (mêmes nodes que le cron) et apparaît dans l'histo…"
      },
      {
        "title": "Débugger pas à pas",
        "desc": "Le bouton « Pas à pas » (à côté de Run) exécute le workflow node par node : le run se met en pause avant chaque étape — le bouton ambre « Étape : <node> » dans l'en-tête exécute la suivante."
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
        "desc": "1. Paramètres → Connecteurs : colle le bot token (obtenu via BotFather) et ton chat ID. 2. Ouvre l'onglet Telegram dans le menu latéral : c'est lui qui fait tourner le « worker » qui traite les messages. 3."
      },
      {
        "title": "(texte libre) — Chat IA avec accès web",
        "desc": "Le bot répond via le LLM. Si l'info demandée est récente (score, actu, prix) ou si tu colles une URL, il cherche sur le web et lit les pages avant de répondre. La réponse cite ses sources et le modèle utilisé."
      },
      {
        "title": "/flow <demande> — Générer + exécuter un workflow",
        "desc": "Génère un workflow par IA depuis ta demande, l'exécute, et te renvoie le fichier produit. Ex : /flow scrape https://exemple.com/categorie et exporte un Excel."
      },
      {
        "title": "/run <nom> [texte] — Exécuter un workflow sauvegardé",
        "desc": "Exécute un workflow déjà sauvegardé (par son nom) ; le texte éventuel sert d'entrée. /run seul liste les workflows disponibles."
      },
      {
        "title": "/clear — Vider la boîte",
        "desc": "Vide la boîte de réception — côté app ET côté Telegram (messages de moins de 48 h). Alias : /purge, /vider."
      },
      {
        "title": "/start — (ignorée)",
        "desc": "Commande de service Telegram — ignorée, elle n'encombre pas la boîte."
      },
      {
        "title": "Bon à savoir",
        "desc": "• Conversation bidirectionnelle : messages entrants ET sortants sont journalisés dans l'onglet Telegram. • Fichiers : un workflow qui produit un export (Excel, PDF, PPTX…) renvoie le fichier en pièce jointe ; sinon un résumé."
      },
      {
        "title": "Réponses sans navigateur (répondeur serveur)",
        "desc": "Plus besoin d'avoir l'app ouverte : un répondeur serveur traite vos messages dès leur arrivée — • Questions : réponse LLM immédiate, avec recherche web automatique (Jina) quand la question l'exige (prix, actualité, contenu d'une URL) — sour…"
      },
      {
        "title": "Digest quotidien",
        "desc": "Dans Réglages → Connecteurs → Telegram, activez le digest quotidien : chaque matin à 08:00 (heure de Paris), le bot envoie un résumé des dernières 24 h — workflows réussis/en échec (avec les noms) et messages en attente de traitement."
      },
      {
        "title": "Voir aussi",
        "desc": "/flow et /run s'appuient sur le module Workflows : la génération par IA et l'exécution sont les mêmes que dans l'éditeur de workflow."
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
        "desc": "Le chat garde le fil de la conversation pendant la session (les 30 derniers messages sont transmis au modèle — au-delà, le début du fil sort du contexte)."
      },
      {
        "title": "Pièces jointes",
        "desc": "Joins des images (PNG, JPEG, WebP, GIF) pour les faire analyser — analyse possible avec les modèles multimodaux (Claude, Gemini, OpenAI) ; les autres fournisseurs ignorent les images."
      },
      {
        "title": "Génération d'images",
        "desc": "Choisis la catégorie Image : le champ de saisie passe en mode génération (moteur Image IA). Joins des images de référence pour les éditer. Sous chaque image générée : Télécharger ou Sauvegarder dans le DAM (elle rejoint « Mes images »)."
      },
      {
        "title": "Saisie vocale",
        "desc": "Dicte ta demande au micro : la parole est transcrite en texte dans la zone de saisie."
      },
      {
        "title": "Bibliothèque de prompts",
        "desc": "Des catégories (Écrire, Apprendre, Code, Vie quotidienne, Idées, Image, Mes prompts) proposent des prompts prêts à l'emploi."
      },
      {
        "title": "Choix du modèle",
        "desc": "Le Chat utilise une cascade de modèles : si le modèle principal échoue, le suivant prend le relais automatiquement."
      },
      {
        "title": "À ne pas confondre",
        "desc": "• Le Chat IA est conversationnel : il n'accède pas au web et n'agit pas sur l'app (il ne crée pas de projets, ne scrape pas, ne lance pas de workflows)."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "access",
    "cat": "Administration",
    "icon": "🛡️",
    "anim": "access",
    "title": "Utilisateurs & rôles",
    "intro": "Approuver les comptes, attribuer des rôles et régler finement les permissions. Réservé au propriétaire.",
    "features": [
      {
        "title": "Onboarding d'un nouvel utilisateur",
        "desc": "1. La personne se connecte via Google : son compte est d'abord « en attente » (aucun accès). 2. Dans l'onglet Utilisateurs, tu lui attribues un rôle. 3. À sa prochaine ouverture, l'app n'affiche que les modules autorisés par son rôle."
      },
      {
        "title": "Attribuer un rôle",
        "desc": "Choisis le rôle de chaque utilisateur dans une liste déroulante. Le rôle définit l'ensemble de base de ses permissions."
      },
      {
        "title": "Surcharges granulaires",
        "desc": "Au-delà du rôle, tu peux accorder ou retirer des permissions individuelles à un utilisateur précis (ex. lui ouvrir l'export sans changer son rôle). Réinitialiser les surcharges efface ces ajustements."
      },
      {
        "title": "Bloquer / réactiver",
        "desc": "Bloquer suspend totalement un compte sans le supprimer : plus aucun accès, même avec un rôle. Réactiver lui rend ses droits."
      },
      {
        "title": "Onglet « Rôles »",
        "desc": "Crée et édite les rôles de l'équipe via une matrice de permissions par module. Trois vues : Cartes (par module), Arbre (hiérarchie) et Carte mentale (graphe)."
      },
      {
        "title": "Modules couverts par les permissions",
        "desc": "Bibliothèque, Import (par format), DAM, PIM, Taxonomies, Scraping (templates & hub), Workflows, Animation, Chat IA, Telegram et Paramètres — chacun avec ses actions (créer, éditer, supprimer, exporter, exécuter…)."
      },
      {
        "title": "Règles de sécurité",
        "desc": "• Les permissions effectives = rôle + permissions accordées − permissions retirées. • Le propriétaire a un accès total non modifiable."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "settings",
    "cat": "Administration",
    "icon": "⚙️",
    "anim": "settings",
    "title": "Paramètres",
    "intro": "Clés API et modèles IA, connecteurs (Drive, Telegram, scraping), cookies, statistiques d'usage.",
    "features": [
      {
        "title": "Onglet Profil — identité et apparence",
        "desc": "• Ton profil (nom, e-mail du compte Google). • La section Apparence bascule le thème : Clair, Sombre (défaut) ou Système. Le choix est mémorisé sur ton compte et te suit d'un poste à l'autre. Le thème se bascule aussi depuis la palette ⌘K."
      },
      {
        "title": "Onglet IA — clés et modèles",
        "desc": "• Renseigne les clés API de chaque fournisseur (Gemini, Claude, OpenAI, DeepSeek, Qwen, Kimi, OpenRouter) et teste-les d'un clic. • Choisis le modèle de chaque fournisseur."
      },
      {
        "title": "Telegram",
        "desc": "Colle le bot token (via BotFather) et ton chat ID pour piloter l'app depuis Telegram. C'est ici que le bot du module Telegram puise sa configuration."
      },
      {
        "title": "Google Drive",
        "desc": "Connecte ton Google Drive (OAuth) pour que les workflows et le node save-dam y déposent des fichiers."
      },
      {
        "title": "Google — accès serveur (Drive + Gmail)",
        "desc": "Autorise une seule fois (bouton « Connecter ») le serveur à agir pour toi quand l'app est fermée : les workflows planifiés (cron), le webhook et /flow sur Telegram peuvent alors créer des Google Sheets dans ton Drive et envoyer des Gmail."
      },
      {
        "title": "Scraping (Bright Data, Jina, Firecrawl, Remove.bg)",
        "desc": "Tokens des services de scraping et de traitement d'image. Bright Data propose le Web Unlocker et, en escalade, le Scraping Browser (tier 2) pour les sites les plus protégés."
      },
      {
        "title": "Onglet Cookies",
        "desc": "Gère les cookies de session pour scraper des sites B2B derrière login. Colle les cookies copiés depuis ton navigateur ; ils sont injectés dans les requêtes de scraping. Leur validité est limitée dans le temps (à re-coller régulièrement)."
      },
      {
        "title": "Onglets Statistiques & Firebase",
        "desc": "• Statistiques : nombre de projets, exports du mois, stockage Firestore (barre de progression), coût IA estimé en EUR par fournisseur avec les tokens entrants/sortants consommés, et le suivi des requêtes Bright Data (quota scraping)."
      },
      {
        "title": "Qui voit quoi",
        "desc": "L'onglet Firebase est réservé au propriétaire. Les onglets Connecteurs et Cookies dépendent des permissions accordées dans Utilisateurs & rôles. Profil, IA et Statistiques restent accessibles à tous."
      }
    ],
    "shortcuts": []
  },
  {
    "id": "explorer",
    "cat": "Données",
    "icon": "🗺️",
    "anim": "taxonomy",
    "title": "Explorateur de données",
    "intro": "Cartographie Firestore : schéma relationnel (ERD) des collections, clés et cardinalités, et inspection des enregistrements en direct. Réservé au propriétaire.",
    "features": [
      {
        "title": "Le problème",
        "desc": "Une base qui grandit devient opaque : on ne sait plus quelles collections existent, comment elles se relient, ni ce qu'elles contiennent réellement — sans ouvrir la console Firebase."
      },
      {
        "title": "Modèle de données (ERD)",
        "desc": "Chaque collection est une table avec ses champs, sa clé primaire (PK) et ses clés étrangères (FK) ; les relations métier sont tracées avec leur cardinalité (1:1, 1:N)."
      },
      {
        "title": "Données live",
        "desc": "Un double-clic sur une table ouvre le contenu réel de la collection, mis à jour en temps réel (onSnapshot). Pour les bases Excel, un sélecteur liste chaque base et n'affiche que ses colonnes utiles."
      },
      {
        "title": "Disposition persistée",
        "desc": "Déplacez les tables par glisser : leur position est enregistrée sur votre profil (Firestore) et restaurée à la prochaine ouverture. Composez la cartographie qui correspond à votre lecture de la donnée."
      },
      {
        "title": "Étendre le schéma (collections / relations)",
        "desc": "Le diagramme se construit à partir de TABLES et RELATIONS dans features/data-graph/firestoreSchema.ts. Ajouter une collection ou un lien = compléter ces deux listes ; le rendu et les cardinalités suivent automatiquement."
      },
      {
        "title": "Pourquoi propriétaire uniquement",
        "desc": "L'explorateur expose la structure et les données brutes de tout l'espace de travail (tous comptes confondus). L'onglet Données des Paramètres — comme Firebase — est donc réservé au propriétaire."
      }
    ],
    "shortcuts": []
  }
]
