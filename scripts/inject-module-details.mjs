// One-shot idempotent : (ré)injecte le panneau « Comprendre ce module » dépliable
// après la liste de puces de chaque scène de public/promo/index.html.
// Retire d'abord tout panneau existant pour le même id, puis réinjecte la version
// courante — relançable sans dupliquer.
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../public/promo/index.html', import.meta.url)

// id de scène → { problem, steps[], options[], result }
// Contenu précis, fidèle aux capacités réelles de l'app.
const M = {
  nouveau: {
    problem: "Démarrer une création print ou écran impose de connaître les bonnes dimensions, la résolution et le profil colorimétrique — une barrière technique avant d'avoir posé le premier élément.",
    steps: [
      "Choisissez un <b>format prêt à l'emploi</b> (A4/A3 impression, écran 4K/1080p, réseaux 1:1, 4:5, 9:16) ou saisissez vos dimensions <b>au mm ou au pixel près</b>.",
      "Réglez le fond : <b>uni, dégradé ou image de départ</b>.",
      "La toile s'ouvre <b>directement dans l'éditeur</b>, calibrée 300 DPI / CMJN pour le print.",
    ],
    options: ["Formats print A4 · A3", "Écran 4K · 1080p", "Réseaux 1:1 · 4:5 · 9:16", "Dimensions sur mesure mm/px", "Fond uni · dégradé · image", "300 DPI · CMJN"],
    result: "Une toile aux bonnes normes en quelques secondes, sans gabarit à chercher ni réglage manuel.",
  },
  import: {
    problem: "Vos fichiers existants (InDesign, PowerPoint, PDF) sont prisonniers de leur logiciel. Les rouvrir ailleurs les aplatit en image ou casse la mise en page.",
    steps: [
      "Déposez un <b>IDML, PPTX, SVG, PDF, image ou Excel</b>.",
      "Le parseur reconstruit <b>calques, styles, polices et mise en page à l'identique</b> — pas une capture figée.",
      "Pour les images et PDF, la <b>décomposition IA (Google Vision)</b> sépare textes, formes et visuels en calques éditables.",
    ],
    options: ["IDML — InDesign", "PPTX — PowerPoint", "SVG — Illustrator", "PDF → SVG", "Image PNG/JPG/WebP", "Excel / CSV", "Décomposition IA en calques"],
    result: "Vos documents redeviennent éditables bloc par bloc, sans avoir à les recréer.",
  },
  editer: {
    problem: "Les éditeurs grand public ignorent les contraintes de l'imprimerie ; les outils pro exigent un logiciel lourd installé sur un poste précis.",
    steps: [
      "Manipulez <b>calques, textes, formes, couleurs et alignements</b> dans le navigateur, avec annuler/rétablir.",
      "Activez <b>repères de coupe, fond perdu et zone de sécurité</b>, en 300 DPI / CMJN.",
      "Appelez l'<b>IA générative et le publipostage</b> directement dans la zone de travail.",
    ],
    options: ["Calques & objets", "Texte riche (polices, gras, italique)", "Formes & dessin", "Palette & remplissages", "Repères de coupe · fond perdu", "Zone de sécurité · 300 DPI · CMJN", "Annuler / rétablir"],
    result: "La simplicité d'un Canva avec les exigences d'un imprimeur — et rien à installer.",
  },
  bibliotheque: {
    problem: "Les fichiers finis s'éparpillent sur des disques et des Drive. Impossible de retrouver rapidement, ou de réutiliser, une création passée.",
    steps: [
      "Tous vos projets sont réunis au même endroit, en <b>vignettes ou en liste</b>.",
      "Filtrez-les <b>par taxonomie</b> pour parcourir des catalogues entiers.",
      "<b>Dupliquez, sélectionnez en masse ou supprimez en lot</b>, ou rouvrez dans l'éditeur d'un clic.",
    ],
    options: ["Vue vignettes / liste", "Filtre par taxonomie", "Sélection multiple", "Suppression groupée", "Duplication", "Ouverture directe éditeur"],
    result: "Une production rangée, accessible et réutilisable — fini les fichiers perdus.",
  },
  dam: {
    problem: "Logos, packshots et visuels validés circulent par mail en versions multiples. On ne sait jamais laquelle est la bonne, ni où elle se trouve.",
    steps: [
      "Centralisez tous vos médias dans un <b>DAM unique</b>, synchronisé avec <b>Google Drive</b>.",
      "<b>Recherchez, filtrez et prévisualisez</b> vos assets.",
      "Insérez-les directement dans l'<b>éditeur ou un workflow</b>.",
    ],
    options: ["Upload & organisation", "Recherche & filtres", "Prévisualisation", "Sync Google Drive", "Insertion éditeur / workflow", "Réutilisé comme référence IA"],
    result: "Une source unique de vérité pour vos visuels, partagée et toujours à jour.",
  },
  imgen: {
    problem: "Produire un visuel produit propre — packshot, mise en ambiance — réclame un studio photo ou un graphiste, et ce pour chaque déclinaison.",
    steps: [
      "Décrivez l'image voulue <b>en langage naturel</b>, avec un produit du DAM en référence.",
      "<b>Nano Banana Pro</b> génère plusieurs variantes selon le style choisi.",
      "Sélectionnez le <b>format</b> et envoyez le résultat dans l'éditeur.",
    ],
    options: ["Prompt + référence DAM", "Nano Banana Pro", "Styles packshot · lifestyle · studio · néon", "Formats 1:1 · 16:9 · 9:16 · A4", "Variantes multiples", "Historique des générations"],
    result: "Des visuels sur mesure en quelques secondes, sans shooting ni détourage.",
  },
  pim: {
    problem: "Les données produit vivent dans des Excel épars, vite périmés et jamais vraiment prêts pour la mise en page.",
    steps: [
      "Créez <b>plusieurs bases</b> et importez vos catalogues <b>Excel / CSV</b>.",
      "Ajoutez des <b>colonnes sur mesure</b> et reliez chaque fiche à votre <b>taxonomie</b>.",
      "Laissez l'<b>enrichissement par scraping d'URL</b> remplir specs, descriptions et prix.",
    ],
    options: ["Bases multiples", "Import Excel / CSV", "Colonnes sur mesure", "Liaison taxonomie", "Enrichissement par scraping d'URL", "Prêt pour le publipostage"],
    result: "Un référentiel produit structuré, à jour et directement exploitable en publipostage.",
  },
  taxonomies: {
    problem: "Sans arborescence commune, projets et produits ne se retrouvent pas : chaque équipe range à sa façon.",
    steps: [
      "Construisez des <b>taxonomies à N niveaux</b> (familles, gammes, rayons).",
      "Reliez-y <b>projets et fiches produits</b>.",
      "Filtrez <b>bibliothèque et PIM</b> par nœud, et attachez des <b>briefs</b> par catégorie.",
    ],
    options: ["Arbres à N niveaux", "Liaison projets + produits", "Recherche dans l'arbre", "Filtrage bibliothèque / PIM", "Briefs par nœud"],
    result: "Un classement partagé qui rend tout votre catalogue navigable.",
  },
  templates: {
    problem: "Chaque site fournisseur a sa propre structure ; en extraire proprement les données demande d'habitude un développement sur mesure, site par site.",
    steps: [
      "Définissez un <b>template de scraping</b> : sélecteurs, champs <b>clé/valeur</b>, onglets et sections.",
      "<b>Mappez</b> chaque zone de la page vers vos colonnes PIM ou vos assets DAM.",
      "<b>Réutilisez</b> le template sur toutes les URL du même fournisseur.",
    ],
    options: ["Sélecteurs CSS", "Champs clé / valeur (specs)", "Onglets & sections", "Mapping → colonnes PIM", "Mapping → assets DAM", "Réutilisable par fournisseur"],
    result: "Une collecte fiable et répétable, sans coder un parseur par marque.",
  },
  scraper: {
    problem: "Recopier à la main specs, prix et photos depuis les sites fournisseurs est long, fastidieux et truffé d'erreurs.",
    steps: [
      "Collez une ou <b>plusieurs URL produit</b>.",
      "Le moteur (<b>Jina + IA + extracteur structurel</b>) lit la page, avec <b>escalade anti-bot</b> si besoin.",
      "Les <b>textes partent au PIM</b>, les <b>images au DAM</b> — routage automatique, taxonomie déduite du fil d'Ariane.",
    ],
    options: ["URL multiples", "Jina + IA + extracteur structurel", "Anti-bot Bright Data / Web Unlocker", "Routage PIM / DAM", "Taxonomie via fil d'Ariane", "Specs en clé/valeur"],
    result: "Des fiches produit complètes en minutes, données et visuels rangés au bon endroit.",
  },
  publipostage: {
    problem: "Décliner une affiche pour 200 références, c'est 200 copier-coller manuels — source d'oublis, de fautes et de versions incohérentes.",
    steps: [
      "Insérez des <b>champs {{ variables }}</b> dans la maquette (prix, libellé, image).",
      "<b>Connectez une base</b> du PIM.",
      "<b>Générez automatiquement</b> une déclinaison par ligne, avec aperçu.",
    ],
    options: ["Champs {{ variables }}", "Texte · prix · image", "Connexion base PIM", "Génération en masse (1 page/ligne)", "Aperçu avant export"],
    result: "Des centaines de visuels personnalisés à partir d'un seul gabarit, sans erreur.",
  },
  workflows: {
    problem: "La chaîne scraper → enrichir → composer → exporter → diffuser enchaîne plusieurs outils à la main, à refaire intégralement à chaque campagne.",
    steps: [
      "Reliez les <b>modules de l'app en nodes</b> (façon Zapier/Make), sans code.",
      "Ou décrivez le besoin en langage naturel : le <b>Prompt-to-Flow</b> génère le graphe complet.",
      "Lancez : le workflow <b>exécute chaque étape</b> de bout en bout.",
    ],
    options: ["Nodes Scraper · Enrichir · Composer", "Export · Drive · Gmail · Telegram", "Génération par prompt (IA)", "Édition visuelle du graphe", "Exécution de bout en bout"],
    result: "Vos chaînes de production tournent toutes seules, du brief au livrable.",
  },
  telegram: {
    problem: "Lancer une production suppose d'ouvrir l'app sur un poste — impossible à déclencher depuis un téléphone, en déplacement.",
    steps: [
      "Envoyez une <b>commande ou un message</b> au bot Telegram.",
      "Une <b>IA génère puis exécute</b> le workflow correspondant.",
      "Le <b>fichier produit vous revient</b> dans la conversation.",
    ],
    options: ["Bot Telegram", "Commandes & messages", "Workflow généré + exécuté", "Fichier renvoyé dans le chat", "Accès restreint par chat ID"],
    result: "Vous pilotez votre chaîne graphique depuis votre poche, par simple message.",
  },
  animation: {
    problem: "Transformer un visuel fixe en vidéo pour les réseaux exige un logiciel de motion design et un vrai temps de production.",
    steps: [
      "<b>Décrivez l'animation</b> voulue.",
      "Le moteur <b>HyperFrames</b> compose une vidéo HTML déterministe (titres, transitions, sync audio).",
      "<b>Exportez en MP4 / WebM</b> prêt à publier.",
    ],
    options: ["Composition par prompt", "Scènes & transitions", "Sync audio / musique", "Voix off (TTS)", "Export MP4 / WebM"],
    result: "Des vidéos animées générées depuis vos contenus, sans After Effects.",
  },
  chat: {
    problem: "Rédiger accroches, descriptions et variantes au fil de l'eau ralentit la création et casse le flux de travail.",
    steps: [
      "Ouvrez le <b>chat IA</b>, en mode <b>texte ou image</b> (Nano Banana).",
      "Demandez <b>accroches, reformulations ou visuels</b>.",
      "Réutilisez votre <b>bibliothèque de prompts</b> enregistrés.",
    ],
    options: ["Mode texte / image", "Multi-LLM : Claude · Gemini · GPT · Qwen · Kimi", "Génération d'images (Nano Banana)", "Bibliothèque de prompts", "Cascade de modèles configurable"],
    result: "Un copilote créatif intégré, pour produire et itérer sans quitter l'app.",
  },
  export: {
    problem: "Chaque canal réclame son format : PDF imprimeur, image réseaux, PowerPoint, web — autant d'exports manuels à régler un par un.",
    steps: [
      "Choisissez vos <b>cibles de sortie</b>.",
      "L'export applique automatiquement <b>marques de coupe, fond perdu et profils</b> selon le canal.",
      "Récupérez <b>tous les fichiers</b> depuis une seule source, avec des presets réutilisables.",
    ],
    options: ["PDF print (offset / numérique)", "Image PNG haute résolution (DPI)", "PowerPoint (PPTX)", "Vidéo WebM", "Paramètres print (coupe, fond perdu, repères)", "Presets réutilisables"],
    result: "Une création, tous les supports — aux normes propres à chaque destination.",
  },
  roles: {
    problem: "Donner accès à toute l'équipe sans contrôle expose données produit et réglages sensibles à des modifications non voulues.",
    steps: [
      "Définissez des <b>rôles et des permissions par module</b>.",
      "Invitez les utilisateurs ; les nouveaux arrivent <b>en attente</b>.",
      "<b>Attribuez, restreignez ou bloquez</b> l'accès, finement, jusqu'à la sous-action.",
    ],
    options: ["Rôles personnalisés", "Permissions par module", "Onboarding en attente", "Grants / revokes individuels", "Blocage d'un compte", "Règles serveur (Firestore)"],
    result: "Chacun voit exactement ce qu'il doit voir, vos données restent protégées.",
  },
  settings: {
    problem: "Brancher ses propres clés IA, ses budgets et ses préférences au cas par cas est vite opaque — et risqué si une clé fuite.",
    steps: [
      "Renseignez vos <b>clés LLM</b> et configurez la <b>cascade de modèles</b> par tâche.",
      "Fixez <b>budgets et préférences</b>, synchronisés par utilisateur.",
      "Suivez la <b>consommation LLM en direct</b>.",
    ],
    options: ["Clés LLM par fournisseur", "Cascade de modèles", "Budgets par tâche", "Préférences synchronisées par user", "Conso LLM en direct"],
    result: "Une plateforme à votre main, maîtrisée et sous budget.",
  },
}

let html = readFileSync(FILE, 'utf8')

function panel(id, d) {
  const steps = d.steps.map((s) => `<li>${s}</li>`).join('')
  const opts = d.options.map((o) => `<span>${o}</span>`).join('')
  return (
    `\n          <button class="scene-more" aria-expanded="false" aria-controls="d-${id}">` +
    `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>Comprendre ce module</button>` +
    `\n          <div class="scene-detail" id="d-${id}"><div class="scene-detail-inner">` +
    `<div class="sd-block"><span class="sd-k">Le problème</span><p>${d.problem}</p></div>` +
    `<div class="sd-block"><span class="sd-k">Comment ça marche</span><ol class="sd-steps">${steps}</ol></div>` +
    `<div class="sd-block"><span class="sd-k">Options</span><div class="sd-opts">${opts}</div></div>` +
    `<div class="sd-block"><span class="sd-k">Le résultat</span><p>${d.result}</p></div>` +
    `</div></div>`
  )
}

let count = 0
for (const [id, d] of Object.entries(M)) {
  // 1) retire un éventuel panneau existant pour cet id (bloc bouton → fermeture scene-detail)
  const removeRe = new RegExp('\\n {10}<button class="scene-more"[^>]*aria-controls="d-' + id + '">[\\s\\S]*?</div></div></div>')
  html = html.replace(removeRe, '')
  // 2) réinjecte après le 1er </ul> (liste de puces) de la scène
  const sceneStart = html.indexOf(`<div class="scene" id="${id}">`)
  if (sceneStart === -1) { console.warn('scene introuvable:', id); continue }
  const ulEnd = html.indexOf('</ul>', sceneStart)
  if (ulEnd === -1) { console.warn('</ul> introuvable pour', id); continue }
  const insertAt = ulEnd + '</ul>'.length
  html = html.slice(0, insertAt) + panel(id, d) + html.slice(insertAt)
  count++
}

writeFileSync(FILE, html, 'utf8')
console.log(`Panneaux (ré)injectés : ${count}/${Object.keys(M).length}`)
