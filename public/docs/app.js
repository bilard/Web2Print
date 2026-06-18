// IBS-Studio · Documentation technique — rendu data-driven, navigation, recherche.
import { CATEGORIES, MODULES } from './content.js'

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// Vidéos de démonstration (rendues via HyperFrames). Un module peut en avoir plusieurs.
// Survit à la régénération de content.js.
const DEMOS = {
  scraping: [{ src: 'media/scraping.mp4', caption: "Une URL produit → lecture de la page, extraction des champs vers le PIM et des images vers le DAM." }],
  editor: [
    { src: 'media/editor.mp4', caption: "Édition réelle d'une affiche — modification du prix puis de la couleur du badge ; calques et paramètres d'impression à droite." },
    { src: 'media/data-merge.mp4', caption: "Lier un projet à une base de données (publipostage) : les champs {{ nom }} {{ prix }} {{ image }} sont alimentés par chaque ligne → génération en série." },
  ],
  pim: [{ src: 'media/pim.mp4', caption: "Une base produits avec colonne calculée (Prix TTC = formule Excel), plusieurs bases et champs structurés." }],
  workflow: [{ src: 'media/workflow.mp4', caption: "Un graphe de nodes (Scraper → Enrichir → Composer → Exporter → Telegram) exécuté de bout en bout." }],
  export: [{ src: 'media/export.mp4', caption: "Une source → N canaux : Impression (PDF/X), Réseaux sociaux, PowerPoint, Web et Vidéo, chacun généré." }],
  telegram: [{ src: 'media/telegram.mp4', caption: "Piloter l'app depuis Telegram : « /flow … » génère et exécute un workflow, le fichier produit est renvoyé." }],
  'import-idml': [{ src: 'media/import-idml.mp4', caption: "Import d'une maquette InDesign (IDML) décomposée en calques éditables." }],
  chat: [{ src: 'media/chat.mp4', caption: "Assistant conversationnel avec cascade multi-modèles (le suivant prend le relais si le principal échoue)." }],
  taxonomies: [{ src: 'media/taxonomies.mp4', caption: "Arborescence de catalogue (catégories, compteurs) ; un produit scrappé est rangé automatiquement dans la bonne branche." }],
  settings: [{ src: 'media/settings.mp4', caption: "Clés LLM par fournisseur (connexion testée), cascade de modèles et budget mensuel." }],
  hyperframes: [{ src: 'media/hyperframes.mp4', caption: "Studio d'animation IA : format, durée, brief → génération de la vidéo ; bibliothèque de prompts rejouables." }],
  dam: [{ src: 'media/dam.mp4', caption: "Banque de médias : recherche (texte/tag/couleur), grille de visuels, génération d'images par IA (badges « IA »)." }],
  access: [{ src: 'media/access.mp4', caption: "Utilisateurs & rôles : attribution d'un rôle, surcharges de permissions par module." }],
  'scraping-templates': [{ src: 'media/scraping-templates.mp4', caption: "Création d'un template : on pointe un élément de la page → sélecteur CSS généré → assignation à un champ." }],
  'import-image-to-svg': [{ src: 'media/import-image-to-svg.mp4', caption: "Une image raster : le fond reste fidèle au pixel, l'IA (Google Vision) détecte les textes et les recrée en calques éditables par-dessus." }],
  'scraping-hub': [{ src: 'media/scraping-hub.mp4', caption: "Le centre de contrôle : règles rédactionnelles de l'équipe, templates groupés par fournisseur, et journal de debug Jina/LLM en direct." }],
  'price-watch': [{ src: 'media/price-watch.mp4', caption: "Veille concurrentielle : tableau des écarts (mon prix vs concurrents), positionnement par produit et alerte Telegram envoyée." }],
  'getting-started': [{ src: 'media/getting-started.mp4', caption: "Tableau de bord : la barre latérale des modules, puis le panneau « Nouveau document » dont la grille de formats (A4, A3, Story, Post…) se peuple et A4 se sélectionne." }],
  'nouveautes': [{ src: 'media/nouveautes.mp4', caption: "Le tableau des nouveautés de juin 2026 : palette ⌘K, notifications, re-skin promo PIM×IA, veille tarifaire, approbation et serveur Telegram, tagging IA du DAM." }],
  'onboarding': [{ src: 'media/onboarding.mp4', caption: "Assistant en 5 étapes : stepper (Bienvenue → Clés IA → Modèles → Connecteurs → Terminé), test d'une clé LLM (✓ connecté) qui active le bouton Suivant." }],
  'navigation': [{ src: 'media/navigation.mp4', caption: "La palette de commandes ⌘K : depuis n'importe quelle page, taper quelques lettres pour ouvrir un projet récent, sauter vers un module ou lancer une action." }],
  'easycatalog': [{ src: 'media/easycatalog.mp4', caption: "Aller-retour InDesign : les champs EasyCatalog (crochets verts) d'un gabarit IDML sont résolus depuis le PIM par publipostage, puis réexportés en IDML avec leurs marqueurs conservés." }],
  'import-pptx': [{ src: 'media/import-pptx.mp4', caption: "Une slide PowerPoint (titre, puces, image, forme, couleurs de thème) décomposée en calques Fabric éditables ; seule la slide 1 est lue." }],
  'import-excel': [{ src: 'media/import-excel.mp4', caption: "Un classeur Excel importé : les types de colonnes (texte, nombre, formule, dictionnaire, date) sont détectés automatiquement et la base PIM se construit, synchronisée sur Firebase." }],
  'import-image': [{ src: 'media/import-image.mp4', caption: "Déposer une image (PNG, JPG, WebP, GIF, SVG) sur le canvas d'un nouveau projet : la vignette glisse au centre de la page et devient un objet sélectionnable." }],
  'import-svg': [{ src: 'media/import-svg.mp4', caption: "Un logo SVG se charge en calques vectoriels (cercle, polygone, trait, texte) ; chaque forme reste éditable — une est recolorée d'indigo à teal directement." }],
  'import-pdf-to-svg': [{ src: 'media/import-pdf-to-svg.mp4', caption: "Un PDF avec calque texte natif : la page 1 reste en fond fidèle, les textes sont extraits exacts (sans OCR) et deviennent des calques éditables." }],
  'briefs': [{ src: 'media/briefs.mp4', caption: "Décris un besoin en français : l'IA pose des questions, compose un panier de produits depuis le catalogue et esquisse un deck (Claude Opus + Gemini)." }],
}

const byCat = (label) => MODULES.filter((m) => m.cat === label)

/* ---------------- Motifs animés (illustration des fonctions) ----------------
   Petits pictogrammes SVG line-art animés en CSS, attribués à une fonction par
   correspondance sur son TITRE (confiant : on n'illustre que les libellés clairs,
   les sous-sections de prose restent en texte net). Dé-dupliqués par module pour
   garantir la variété (jamais le même glyphe deux fois dans un module). */
const SVG = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`
const MOTIFS = {
  ai: SVG(`<path class="m-pulse" d="M12 4l1.7 4.6L18 10l-4.3 1.4L12 16l-1.7-4.6L6 10l4.3-1.4z"/><path class="m-twinkle" d="M18.5 4v3M17 5.5h3"/>`),
  scrape: SVG(`<rect x="5" y="3.5" width="14" height="17" rx="2"/><path class="m-scan" d="M8 9.5h8"/><circle class="m-dot" cx="9.5" cy="13.5" r="1" fill="currentColor" stroke="none"/><path d="M12.5 13.5H16"/>`),
  merge: SVG(`<rect x="3" y="5" width="5" height="14" rx="1"/><rect x="16" y="7" width="5" height="10" rx="1"/><path d="M8.3 12h7.4"/><circle class="m-travel" cx="8.6" cy="12" r="1.3" fill="currentColor" stroke="none"/><path class="m-draw" d="M17.5 10.5h2M17.5 13.5h2"/>`),
  grid: SVG(`<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/><rect class="m-cell" x="9.3" y="9.3" width="5.4" height="5.4" fill="currentColor" stroke="none"/>`),
  tree: SVG(`<circle cx="12" cy="5.5" r="2"/><circle cx="6" cy="18.5" r="2"/><circle cx="18" cy="18.5" r="2"/><path class="m-draw" d="M12 7.5v3.5H6v5M12 11h6v5.5"/>`),
  layers: SVG(`<path class="m-float" d="M12 3.5l8 4-8 4-8-4z"/><path d="M4 11.5l8 4 8-4M4 15.5l8 4 8-4"/>`),
  export: SVG(`<circle cx="6" cy="12" r="2.2"/><path class="m-fan f1" d="M8.2 11l7.5-3.6"/><path class="m-fan f2" d="M8.5 12H17"/><path class="m-fan f3" d="M8.2 13l7.5 3.6"/><circle cx="18" cy="6.5" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="18" cy="17.5" r="1.6"/>`),
  import: SVG(`<path d="M5 14.5v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/><path class="m-drop" d="M12 3.5v9M8 8.5l4 4 4-4"/>`),
  image: SVG(`<rect x="4" y="5" width="16" height="14" rx="2"/><circle class="m-rise" cx="9" cy="10" r="1.8"/><path d="M5 18l4.5-4.5 3 3 3-3 3.5 3.5"/>`),
  chat: SVG(`<rect x="4" y="5" width="15" height="9" rx="2.5"/><path d="M9 14l-2 3.2 4.5-3.2"/><circle class="m-pop d1" cx="8.5" cy="9.5" r="1" fill="currentColor" stroke="none"/><circle class="m-pop d2" cx="11.7" cy="9.5" r="1" fill="currentColor" stroke="none"/><circle class="m-pop d3" cx="14.9" cy="9.5" r="1" fill="currentColor" stroke="none"/>`),
  flow: SVG(`<rect x="2.5" y="9" width="5.5" height="6" rx="1.5"/><rect x="16" y="9" width="5.5" height="6" rx="1.5"/><path d="M8 12h8"/><circle class="m-travel" cx="8" cy="12" r="1.3" fill="currentColor" stroke="none"/>`),
  key: SVG(`<g class="m-jiggle"><circle cx="8" cy="14" r="3.6"/><path d="M10.6 11.4L19 3M16 6l2 2M14.2 7.8l1.6 1.6"/></g>`),
  search: SVG(`<g class="m-orbit"><circle cx="11" cy="11" r="6"/><path d="M19.5 19.5l-4.2-4.2"/></g>`),
  steps: SVG(`<path d="M9 6.5h11M9 12h11M9 17.5h9"/><path class="m-tick" d="M3 6.5l1.5 1.5 2.5-3M3 12l1.5 1.5 2.5-3M3 17.5l1.5 1.5 2.5-3"/>`),
  vector: SVG(`<path class="m-draw" d="M3.5 18C7 8 17 8 20.5 18"/><circle cx="3.5" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="20.5" cy="18" r="1.4" fill="currentColor" stroke="none"/><path d="M9.5 6l2.5 4-2.5 1.5-2.5-1.5z"/>`),
  price: SVG(`<path d="M12.6 3.5H19a1.5 1.5 0 0 1 1.5 1.5v6.4a2 2 0 0 1-.6 1.4l-6.6 6.6a2 2 0 0 1-2.8 0L5.1 14a2 2 0 0 1 0-2.8l6.6-6.6a2 2 0 0 1 .9-.6z"/><circle class="m-pulse" cx="16" cy="8" r="1.3"/>`),
  telegram: SVG(`<path class="m-fly" d="M21 4.5L3 11l5.5 2L11 19l3-4 4 3z"/>`),
  shield: SVG(`<path d="M12 3l7 3v5.5c0 4.3-3 7.2-7 8.5-4-1.3-7-4.2-7-8.5V6z"/><path class="m-draw" d="M9 11.8l2.2 2.2 4-4.4"/>`),
  diff: SVG(`<rect class="m-bar b1" x="4" y="11" width="3.4" height="9" rx="1"/><rect class="m-bar b2" x="10.3" y="6" width="3.4" height="14" rx="1"/><rect class="m-bar b3" x="16.6" y="13" width="3.4" height="7" rx="1"/>`),
  slides: SVG(`<rect x="3" y="5" width="18" height="11.5" rx="2"/><path d="M12 16.5v3M9 19.5h6"/><path class="m-draw" d="M6.5 9h7M6.5 12h9"/>`),
  doc: SVG(`<path d="M7 3.5h6.5L18 8v12.5H7z"/><path d="M13.3 3.5V8H18"/><path class="m-draw" d="M9.5 12h5M9.5 15h5M9.5 18h3"/>`),
  erd: SVG(`<rect x="3" y="4" width="7.5" height="7" rx="1"/><path d="M3 7h7.5"/><rect x="13.5" y="13" width="7.5" height="7" rx="1"/><path d="M13.5 16h7.5"/><path class="m-draw" d="M10.5 7.5h1.5a2 2 0 0 1 2 2v3"/>`),
  cursor: SVG(`<circle class="m-ripple" cx="7" cy="6" r="3"/><path d="M6 4l13 6.5-5.5 1.8L11.8 18z"/>`),
  bell: SVG(`<g class="m-ring"><path d="M7 16.5V11a5 5 0 0 1 10 0v5.5"/><path d="M5 16.5h14"/></g><path d="M10 19.5a2 2 0 0 0 4 0"/>`),
  video: SVG(`<rect x="3" y="5" width="18" height="13" rx="2"/><path class="m-pulse" d="M10.5 9l4.5 2.5-4.5 2.5z" fill="currentColor" stroke="none"/>`),
  transform: SVG(`<rect class="m-cross c1" x="3" y="6.5" width="7" height="7" rx="1"/><path class="m-cross c2" d="M6.5 6.5l3.5 3.5-3.5 3.5L3 10z"/><path d="M12 10h4.5M14.5 7.5l2.5 2.5-2.5 2.5"/><path d="M19.5 6.5l1.5 3.5-1.5 3.5"/>`),
  clock: SVG(`<circle cx="12" cy="12" r="8.2"/><path d="M12 7.5V12l3 1.8"/><circle class="m-pulse" cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>`),
}

/* RICH : scènes paysage DÉMONSTRATIVES (montrent une transformation, pas un loop
   décoratif). Affichées dans une grande tuile ; priment sur le petit glyphe MOTIFS
   pour les capacités « phares ». Animations préfixées s-* (jouées si .playing). */
const SVGR = (inner) => `<svg viewBox="0 0 160 44" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" preserveAspectRatio="xMidYMid meet">${inner}</svg>`
const RICH = {
  // Une page web → champs extraits qui filent dans une table, dont les lignes s'allument (web → PIM)
  scrape: SVGR(`<rect x="4" y="7" width="52" height="30" rx="3"/><path d="M4 13h52"/><circle cx="8" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="11.5" cy="10" r="1" fill="currentColor" stroke="none"/><path d="M16 10h32" opacity="0.4"/><rect class="s-scan" x="7" y="16.5" width="46" height="2.4" rx="1.2" fill="currentColor" stroke="none" opacity="0.3"/><path d="M9 21h28M9 25h34M9 29h22M9 33h30" opacity="0.4"/><rect x="103" y="6" width="53" height="32" rx="2.5"/><path d="M103 13h53" opacity="0.7"/><path d="M124 6v32" opacity="0.4"/><rect class="s-row r1" x="103.5" y="13.3" width="52" height="8" fill="currentColor" stroke="none" opacity="0"/><rect class="s-row r2" x="103.5" y="21.5" width="52" height="8" fill="currentColor" stroke="none" opacity="0"/><rect class="s-row r3" x="103.5" y="29.7" width="52" height="7.5" fill="currentColor" stroke="none" opacity="0"/><rect class="s-fly c1" x="60" y="13.5" width="11" height="4.5" rx="2.25" fill="currentColor" stroke="none"/><rect class="s-fly c2" x="60" y="20.5" width="11" height="4.5" rx="2.25" fill="currentColor" stroke="none"/><rect class="s-fly c3" x="60" y="27.5" width="11" height="4.5" rx="2.25" fill="currentColor" stroke="none"/>`),
  // 1 création → 4 formats de sortie qui se déploient en cascade (impression, PPTX, PNG, social)
  export: SVGR(`<rect class="s-pulse" x="8" y="11" width="34" height="22" rx="2.5"/><path d="M14 17h22M14 22h22M14 27h14" opacity="0.45"/><path class="s-line l1" d="M42 18L80 12.5"/><path class="s-line l2" d="M42 21L120 12.5"/><path class="s-line l3" d="M42 25L80 31.5"/><path class="s-line l4" d="M42 28L120 31.5"/><g class="s-out o1"><rect x="80" y="6" width="30" height="13" rx="2"/><path d="M84 12.5h10" opacity="0.55"/></g><g class="s-out o2"><rect x="120" y="6" width="33" height="13" rx="2"/><path d="M124 12.5h13" opacity="0.55"/></g><g class="s-out o3"><rect x="80" y="25" width="30" height="13" rx="2"/><path d="M84 31.5h10" opacity="0.55"/></g><g class="s-out o4"><rect x="120" y="25" width="33" height="13" rx="2"/><path d="M124 31.5h13" opacity="0.55"/></g>`),
  // Une fiche pauvre → la baguette IA balaie → le contenu se remplit ligne par ligne
  ai: SVGR(`<rect class="s-glow" x="6" y="7" width="148" height="30" rx="4"/><path class="s-fill q1" d="M14 14h44"/><path class="s-fill q2" d="M14 20h92"/><path class="s-fill q3" d="M14 26h64"/><path class="s-fill q4" d="M14 32h80"/><path class="s-wand" d="M122 11l2.2 5.2 5.2 2.2-5.2 2.2-2.2 5.2-2.2-5.2-5.2-2.2 5.2-2.2z" fill="currentColor" stroke="none"/><path class="s-spark2" d="M140 24l1.4 3.2 3.2 1.4-3.2 1.4-1.4 3.2-1.4-3.2-3.2-1.4 3.2-1.4z" fill="currentColor" stroke="none"/>`),
  // Un graphe de 5 nodes ; un jeton traverse, chaque node s'allume à son passage
  flow: SVGR(`<rect class="s-node n1" x="6" y="15" width="22" height="14" rx="2.5"/><rect class="s-node n2" x="40" y="15" width="22" height="14" rx="2.5"/><rect class="s-node n3" x="74" y="15" width="22" height="14" rx="2.5"/><rect class="s-node n4" x="108" y="15" width="22" height="14" rx="2.5"/><rect class="s-node n5" x="142" y="15" width="12" height="14" rx="2.5"/><path d="M28 22h12M62 22h12M96 22h12M130 22h12" opacity="0.5"/><circle class="s-token" cx="17" cy="22" r="2.6" fill="currentColor" stroke="none"/>`),
}

// Règles titre → motif (normalisé : minuscules, sans accents). Ordre = priorité
// (spécifique d'abord). Aucune correspondance → pas d'icône (texte net).
const MOTIF_RULES = [
  [/telegram|\bbot\b|botfather|\/flow/, 'telegram'],
  [/publipostage|fusion|data.?merge|\{\{|serie|champs lies|mailing/, 'merge'],
  [/scrap|jina|firecrawl|bright ?data|unlocker|\bcrawl|extraction|selecteur css/, 'scrape'],
  [/taxonomie|arborescence|categori|branche|catalogue|rangement|auto-construction/, 'taxonomy'],
  [/creer une image|creation d.?image|generation d.?image|image par ia|nano banana|visuel ia|generer/, 'imagegen'],
  [/workflow|\bnode|graphe|\bflux|automat|orchestrat|executor/, 'flow'],
  [/idml|indesign|easycatalog/, 'doc'],
  [/powerpoint|pptx|\bslide|presentation|deck/, 'slides'],
  [/\bsvg\b|vecteur|vectoriel|bezier|imagetracer|raster|image to svg|pdf to svg/, 'transform'],
  [/transform|conversion|raster|reconstit|->/, 'transform'],
  [/\bpdf/, 'doc'],
  [/prix|tarif|veille|concurrent|\becart|positionnement|marge/, 'price'],
  [/relation|\berd\b|schema|firestore|cardinalite|cle etrangere|cle primaire|modele de donnees/, 'erd'],
  [/export|sortie|canal|canaux|impression|\bprint|telecharg|decline/, 'export'],
  [/import|importer|deposer|glisser|televers|charger|drag/, 'import'],
  [/role|permission|\bacces\b|proprietaire|utilisateur|rbac|securit|approbation|cookie|bloquer|isolation/, 'shield'],
  [/\bcle|clef|token|\bapi\b|connecteur|oauth|secret|fournisseur/, 'key'],
  [/recherche|\bsearch|palette|cmd|raccourci|filtre|rechercher|retrouver|existant|\brecent/, 'search'],
  [/etape|onboarding|stepper|checklist|bienvenue|terminer|wizard|assistant de config/, 'steps'],
  [/image|photo|visuel|\bmedia|\bdam\b|banque|vignette|remove.?bg|miniature|logo/, 'image'],
  [/chat|conversation|\bassistant\b|message|bulle|dialogue/, 'chat'],
  [/calque|fabric|canvas|editeur|\bobjet|forme|texte editable|reflow|maquette|projet|vierge|\bcreer|gabarit/, 'layers'],
  [/table|grille|colonne|cellule|excel|classeur|champ|\bpim\b|\bbase|fiche|enregistrement|dashboard|tableau de bord/, 'grid'],
  [/comparaison|comparer|avant.?apres|difference|variation/, 'diff'],
  [/notification|nouveaute|alerte|\bcloche|rappel/, 'bell'],
  [/video|animation|hyperframes|montage|\bgif\b|motion|voix off/, 'video'],
  [/navigation|souris|\bclic|\bguide|driver|\btour\b|menu/, 'cursor'],
  [/\bia\b|\bllm\b|intelligence|gener|enrichi|claude|gemini|openai|nano banana|cascade|prompt|modele/, 'ai'],
  [/serveur|\bcron|planifi|temps reel|onsnapshot|\blive|synchro|backend|\bcloud/, 'clock'],
]
function motifFor(title) {
  const t = norm(title)
  for (const [re, key] of MOTIF_RULES) if (re.test(t)) return key
  return null
}
// Repli par catégorie : garantit qu'AUCUNE carte ne reste sans vignette animée.
// Pioché dans l'ordre, en évitant les motifs déjà posés dans le module (variété).
const CATEGORY_FALLBACK = {
  'Démarrage': ['cursor', 'search', 'layers', 'grid', 'steps', 'bell'],
  'Édition': ['layers', 'vector', 'image', 'video', 'export', 'grid'],
  'Import': ['import', 'layers', 'doc', 'vector', 'transform', 'grid'],
  'Données': ['grid', 'tree', 'image', 'search', 'erd', 'clock', 'diff'],
  'Export': ['export', 'doc', 'slides', 'image', 'clock', 'grid'],
  'Automatisation': ['flow', 'clock', 'telegram', 'export', 'ai', 'grid'],
  'Assistant IA': ['ai', 'chat', 'search', 'clock', 'image'],
  'Administration': ['shield', 'key', 'grid', 'search', 'clock', 'steps'],
}
const DEFAULT_POOL = ['grid', 'ai', 'export', 'search', 'layers', 'image', 'clock', 'tree']
// Bandeaux RENDUS via HyperFrames (MP4) — animations pro contextuelles par sujet,
// DISTINCTES (zéro répétition). Priment sur les scènes SVG synthétiques.
const RICH_VIDEO = {
  ai: 'media/feat-enrich.mp4',
  scrape: 'media/feat-scrape.mp4',
  export: 'media/feat-export.mp4',
  flow: 'media/feat-flow.mp4',
  merge: 'media/feat-merge.mp4',
  transform: 'media/feat-transform.mp4',
  taxonomy: 'media/feat-taxonomy.mp4',
  price: 'media/feat-price.mp4',
  import: 'media/feat-import.mp4',
  imagegen: 'media/feat-imagegen.mp4',
  telegram: 'media/feat-telegram.mp4',
}
const isRichKey = (k) => !!(RICH_VIDEO[k] || RICH[k])
// Bandeau imposé par module quand les titres de fonctions (prose) ne matchent aucune clé.
const MODULE_BANNER = {
  'import-image-to-svg': 'transform',
  'import-pdf-to-svg': 'transform',
  'import-svg': 'transform',
}

function keysHTML(keys) { return `<span class="kbd-keys">${(keys || []).map((k) => `<kbd>${k}</kbd>`).join('')}</span>` }

function moduleHTML(m) {
  const demos = DEMOS[m.id] || []
  const demoHTML = demos
    .map((d) => `<figure class="mod-demo"><video src="${d.src}" autoplay loop muted playsinline preload="metadata"></video><figcaption>${d.caption}</figcaption></figure>`)
    .join('')
  const used = new Set()
  const pool = CATEGORY_FALLBACK[m.cat] || DEFAULT_POOL
  let bannerUsed = false // 1 grand bandeau MAX par module ; le reste = petits pictos
  const forced = MODULE_BANNER[m.id] // bandeau imposé (titres en prose qui ne matchent rien)
  const feats = (m.features || []).map((f, i) => {
    let key = motifFor(f.title)
    let banner = false
    if (forced && i === 0 && !bannerUsed) {
      key = forced; banner = true; bannerUsed = true // 1re fonction du module → bandeau imposé
    } else if (key && !used.has(key) && isRichKey(key) && !bannerUsed) {
      banner = true; bannerUsed = true // correspondance confiante + slot libre → bandeau contextuel
    } else if (!key || used.has(key) || isRichKey(key)) {
      // pas de bandeau ici → petit motif thématique distinct (jamais une clé rich, jamais vide)
      key = pool.find((k) => !used.has(k) && !isRichKey(k)) || pool.find((k) => !used.has(k)) || pool[0]
    }
    used.add(key)
    const vid = banner && RICH_VIDEO[key]
    const ico = vid
      ? `<span class="feat-banner vid"><video src="${vid}" autoplay loop muted playsinline preload="metadata"></video></span>`
      : banner && RICH[key]
      ? `<span class="feat-banner">${RICH[key]}</span>`
      : `<span class="feat-ico">${MOTIFS[key] || MOTIFS.grid}</span>`
    return `<div class="feat-item${vid || (banner && RICH[key]) ? ' rich' : ''}">${ico}<div class="feat-body"><dt>${f.title}</dt><dd>${f.desc}</dd></div></div>`
  }).join('')
  const featHTML = feats ? `<div class="mod-sub">Fonctions</div><dl class="feat-list">${feats}</dl>` : ''
  const sc = (m.shortcuts || [])
  const scHTML = sc.length
    ? `<div class="mod-sub">Raccourcis clavier</div><table class="kbd-table"><tbody>${sc.map((s) => `<tr><td>${keysHTML(s.keys)}</td><td>${s.label}</td></tr>`).join('')}</tbody></table>`
    : ''
  return `<section class="module" id="m-${m.id}">
    <div class="mod-head">
      <span class="mod-ico" aria-hidden="true">${m.icon || '✦'}</span>
      <h2>${m.title}</h2>
      <span class="mod-cat">${m.cat}</span>
      <a class="mod-anchor" href="#m-${m.id}" aria-label="Lien vers ${m.title}">#</a>
    </div>
    <p class="mod-intro">${m.intro}</p>
    ${demoHTML}${featHTML}${scHTML}
  </section>`
}

function render() {
  const content = $('#content')
  const nav = $('#sideNav')
  let html = ''
  let navHtml = ''
  for (const c of CATEGORIES) {
    const mods = byCat(c.label)
    if (!mods.length) continue
    navHtml += `<div class="nav-cat"><div class="nav-cat-label"><span aria-hidden="true">${c.icon}</span>${c.label}</div>${mods.map((m) => `<a class="nav-link" href="#m-${m.id}" data-id="${m.id}">${m.title}</a>`).join('')}</div>`
    html += `<div class="cat-band">${c.label}</div>${mods.map(moduleHTML).join('')}`
  }
  $('#loading')?.remove()
  content.insertAdjacentHTML('beforeend', html)
  nav.innerHTML = navHtml
  bindNav()
  observeActive()
  observeMotifs()
}

// Les motifs n'animent que lorsqu'ils sont à l'écran (perf : ~150 SVG sur la page).
function observeMotifs() {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) en.target.classList.toggle('playing', en.isIntersecting)
  }, { rootMargin: '0px 0px -8% 0px' })
  $$('.feat-ico, .feat-banner').forEach((el) => io.observe(el))
}

/* ---------------- Navigation ---------------- */
function bindNav() {
  // Fermer le tiroir mobile au clic sur un lien
  $('#sideNav').addEventListener('click', (e) => { if (e.target.classList.contains('nav-link')) closeSidebar() })
}

function observeActive() {
  const links = new Map($$('#sideNav .nav-link').map((a) => [a.dataset.id, a]))
  let active = null
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) {
        const id = en.target.id.replace('m-', '')
        if (active) active.classList.remove('active')
        active = links.get(id)
        if (active) { active.classList.add('active'); active.scrollIntoView({ block: 'nearest' }) }
      }
    }
  }, { rootMargin: '-72px 0px -70% 0px' })
  $$('.module').forEach((s) => io.observe(s))
}

/* ---------------- Sidebar mobile ---------------- */
function openSidebar() { $('#sidebar').classList.add('open'); $('#scrim').hidden = false }
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#scrim').hidden = true }

/* ---------------- Recherche ---------------- */
const SEARCH_INDEX = MODULES.flatMap((m) => [
  { id: m.id, icon: m.icon, title: m.title, sub: m.cat, hay: norm(`${m.title} ${m.cat} ${m.intro}`) },
  ...(m.features || []).map((f) => ({ id: m.id, icon: '›', title: f.title, sub: m.title, hay: norm(`${f.title} ${f.desc} ${m.title}`) })),
])
let searchSel = 0
function runSearch(q) {
  const list = $('#searchResults')
  const nq = norm(q.trim())
  const res = nq ? SEARCH_INDEX.filter((r) => r.hay.includes(nq)).slice(0, 24)
                 : MODULES.map((m) => ({ id: m.id, icon: m.icon, title: m.title, sub: m.cat }))
  searchSel = 0
  if (!res.length) { list.innerHTML = `<li class="search-empty">Aucun résultat pour « ${q} »</li>`; return }
  list.innerHTML = res.map((r, i) => `<li data-id="${r.id}" class="${i === 0 ? 'active' : ''}"><span class="sr-ico">${r.icon}</span><span>${r.title}</span><span class="sr-sub">${r.sub}</span></li>`).join('')
  $$('#searchResults li').forEach((li) => li.addEventListener('click', () => { if (li.dataset.id) choose(li.dataset.id) }))
}
function choose(id) { closeSearch(); location.hash = `#m-${id}` }
function openSearch() { const o = $('#searchOverlay'); o.hidden = false; const i = $('#searchInput'); i.value = ''; runSearch(''); i.focus() }
function closeSearch() { $('#searchOverlay').hidden = true }

/* ---------------- Thème ---------------- */
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', next)
  try { localStorage.setItem('ibs-docs-theme', next) } catch (e) {}
}

/* ---------------- Bootstrap ---------------- */
function boot() {
  render()
  $('#themeToggle').addEventListener('click', toggleTheme)
  $('#searchTrigger').addEventListener('click', openSearch)
  $('#searchInput').addEventListener('input', (e) => runSearch(e.target.value))
  $('#searchOverlay').addEventListener('click', (e) => { if (e.target.id === 'searchOverlay') closeSearch() })
  $('#menuToggle').addEventListener('click', openSidebar)
  $('#menuClose').addEventListener('click', closeSidebar)
  $('#scrim').addEventListener('click', closeSidebar)

  const toTop = $('#toTop'); toTop.hidden = false
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }))
  window.addEventListener('scroll', () => toTop.classList.toggle('show', window.scrollY > 700), { passive: true })

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#searchOverlay').hidden ? openSearch() : closeSearch(); return }
    if (e.key === 'Escape') { closeSearch(); return }
    if ($('#searchOverlay').hidden) return
    const items = $$('#searchResults li[data-id]')
    if (!items.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); items[searchSel]?.classList.remove('active')
      searchSel = (searchSel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      items[searchSel].classList.add('active'); items[searchSel].scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') { e.preventDefault(); const id = items[searchSel]?.dataset.id; if (id) choose(id) }
  })
}

boot()
