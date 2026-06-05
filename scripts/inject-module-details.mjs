// One-shot : injecte un panneau « Comprendre ce module » dépliable après la
// liste de puces de chaque scène de public/promo/index.html.
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../public/promo/index.html', import.meta.url)

// id de scène → { problem, steps[3], result }
const M = {
  nouveau: {
    problem: "Démarrer une création print ou écran impose de connaître les bonnes dimensions, la résolution et le profil colorimétrique — une barrière technique avant même d'avoir posé le premier élément.",
    steps: [
      "Choisissez un <b>format prêt à l'emploi</b> (A4/A3 impression, 4K, formats réseaux) ou saisissez vos dimensions au millimètre ou au pixel près.",
      "Définissez le fond : <b>uni, dégradé ou image de départ</b>.",
      "La toile s'ouvre <b>directement dans l'éditeur</b>, déjà calibrée 300 DPI / CMJN si c'est du print.",
    ],
    result: "Une toile aux bonnes normes en quelques secondes, sans gabarit à chercher ni réglage manuel.",
  },
  import: {
    problem: "Vos fichiers existants (InDesign, PowerPoint, PDF) sont prisonniers de leur logiciel. Les rouvrir ailleurs les aplatit en image ou casse la mise en page.",
    steps: [
      "Déposez un <b>IDML, PPTX, SVG, PDF ou Excel</b>.",
      "Le parseur reconstruit <b>calques, styles et typographie à l'identique</b> — pas une capture figée.",
      "Pour les images et PDF, une <b>IA décompose la maquette en calques</b> (textes, formes et visuels séparés).",
    ],
    result: "Vos documents redeviennent éditables bloc par bloc, sans avoir à les recréer.",
  },
  editer: {
    problem: "Les éditeurs grand public ignorent les contraintes de l'imprimerie ; les outils pro exigent un logiciel lourd installé sur un poste précis.",
    steps: [
      "Manipulez <b>calques, textes, formes, couleurs et alignements</b> dans le navigateur.",
      "Activez <b>repères de coupe, fond perdu et zone de sécurité</b>, en 300 DPI / CMJN.",
      "Appelez l'<b>IA générative et le publipostage</b> directement dans la zone de travail.",
    ],
    result: "La simplicité d'un Canva avec les exigences d'un imprimeur — et rien à installer.",
  },
  bibliotheque: {
    problem: "Les fichiers finis s'éparpillent sur des disques et des Drive. Impossible de retrouver rapidement, ou de réutiliser, une création passée.",
    steps: [
      "Tous vos projets sont réunis au même endroit, en <b>vignettes ou en liste</b>.",
      "Filtrez-les <b>par taxonomie</b> pour parcourir des catalogues entiers.",
      "<b>Dupliquez, sélectionnez en masse</b> ou rouvrez dans l'éditeur d'un seul clic.",
    ],
    result: "Une production rangée, accessible et réutilisable — fini les fichiers perdus.",
  },
  dam: {
    problem: "Logos, packshots et visuels validés circulent par mail en versions multiples. On ne sait jamais laquelle est la bonne, ni où elle se trouve.",
    steps: [
      "Centralisez tous vos médias dans un <b>DAM unique</b>, relié à Google Drive.",
      "<b>Recherchez, filtrez et prévisualisez</b> vos assets.",
      "Insérez-les directement dans l'<b>éditeur ou un workflow</b>.",
    ],
    result: "Une source unique de vérité pour vos visuels, partagée et toujours à jour.",
  },
  imgen: {
    problem: "Produire un visuel produit propre — packshot, mise en ambiance — réclame un studio photo ou un graphiste, et ce pour chaque déclinaison.",
    steps: [
      "Décrivez l'image voulue <b>en langage naturel</b>, avec un produit du DAM en référence.",
      "<b>Nano Banana Pro</b> génère plusieurs variantes (packshot, lifestyle, studio).",
      "Choisissez le <b>format</b> (1:1, 16:9, 9:16, A4) et envoyez le résultat dans l'éditeur.",
    ],
    result: "Des visuels sur mesure en quelques secondes, sans shooting ni détourage.",
  },
  pim: {
    problem: "Les données produit vivent dans des Excel épars, vite périmés et jamais vraiment prêts pour la mise en page.",
    steps: [
      "Créez <b>plusieurs bases</b> et importez vos catalogues Excel.",
      "Ajoutez des <b>colonnes sur mesure</b> et reliez chaque fiche à votre taxonomie.",
      "Laissez l'<b>enrichissement par scraping d'URL</b> remplir specs, descriptions et prix.",
    ],
    result: "Un référentiel produit structuré, à jour et directement exploitable en publipostage.",
  },
  taxonomies: {
    problem: "Sans arborescence commune, projets et produits ne se retrouvent pas : chaque équipe range à sa façon.",
    steps: [
      "Construisez des <b>taxonomies à N niveaux</b> (familles, gammes, rayons).",
      "Reliez-y <b>projets et fiches produits</b>.",
      "Filtrez <b>bibliothèque et PIM</b> par nœud, d'un clic.",
    ],
    result: "Un classement partagé qui rend tout votre catalogue navigable.",
  },
  templates: {
    problem: "Chaque site fournisseur a sa propre structure ; en extraire proprement les données demande d'habitude un développement sur mesure, site par site.",
    steps: [
      "Définissez un <b>template de scraping</b> (sélecteurs, champs clé/valeur, onglets).",
      "<b>Mappez</b> chaque zone de la page vers vos colonnes PIM ou vos assets DAM.",
      "<b>Réutilisez</b> le template sur toutes les URL du même fournisseur.",
    ],
    result: "Une collecte fiable et répétable, sans coder un parseur par marque.",
  },
  scraper: {
    problem: "Recopier à la main specs, prix et photos depuis les sites fournisseurs est long, fastidieux et truffé d'erreurs.",
    steps: [
      "Collez une ou <b>plusieurs URL produit</b>.",
      "Le moteur (<b>Jina + IA + extracteur structurel</b>, avec escalade anti-bot) lit la page.",
      "Les <b>textes partent au PIM</b>, les <b>images au DAM</b> — routage automatique.",
    ],
    result: "Des fiches produit complètes en minutes, données et visuels rangés au bon endroit.",
  },
  publipostage: {
    problem: "Décliner une affiche pour 200 références, c'est 200 copier-coller manuels — source d'oublis, de fautes et de versions incohérentes.",
    steps: [
      "Insérez des <b>champs {{ variables }}</b> dans la maquette (prix, libellé, image).",
      "<b>Connectez une base</b> du PIM.",
      "<b>Générez automatiquement</b> une déclinaison par ligne.",
    ],
    result: "Des centaines de visuels personnalisés à partir d'un seul gabarit, sans erreur.",
  },
  workflows: {
    problem: "La chaîne scraper → enrichir → composer → exporter → diffuser enchaîne plusieurs outils à la main, à refaire intégralement à chaque campagne.",
    steps: [
      "Reliez les <b>modules de l'app en nodes</b> (façon Zapier/Make), sans code.",
      "Décrivez le besoin en langage naturel : une <b>IA génère le graphe complet</b>.",
      "Lancez : le workflow <b>exécute chaque étape</b> de bout en bout.",
    ],
    result: "Vos chaînes de production tournent toutes seules, du brief au livrable.",
  },
  telegram: {
    problem: "Lancer une production suppose d'ouvrir l'app sur un poste — impossible à déclencher depuis un téléphone, en déplacement.",
    steps: [
      "Envoyez une <b>commande ou un message</b> au bot Telegram.",
      "Une <b>IA génère puis exécute</b> le workflow correspondant.",
      "Le <b>fichier produit vous revient</b> dans la conversation.",
    ],
    result: "Vous pilotez votre chaîne graphique depuis votre poche, par simple message.",
  },
  animation: {
    problem: "Transformer un visuel fixe en vidéo pour les réseaux exige un logiciel de motion design et un vrai temps de production.",
    steps: [
      "<b>Décrivez l'animation</b> voulue.",
      "Le moteur <b>HyperFrames</b> compose une vidéo HTML déterministe (titres, transitions, sync audio).",
      "<b>Exportez en MP4</b> prêt à publier.",
    ],
    result: "Des vidéos animées générées depuis vos contenus, sans After Effects.",
  },
  chat: {
    problem: "Rédiger accroches, descriptions et variantes au fil de l'eau ralentit la création et casse le flux de travail.",
    steps: [
      "Ouvrez le <b>chat IA</b>, en mode texte ou image (Nano Banana).",
      "Demandez <b>accroches, reformulations ou visuels</b>.",
      "Réutilisez votre <b>bibliothèque de prompts</b> enregistrés.",
    ],
    result: "Un copilote créatif intégré, pour produire et itérer sans quitter l'app.",
  },
  export: {
    problem: "Chaque canal réclame son format : PDF imprimeur, image réseaux, PowerPoint, web — autant d'exports manuels à régler un par un.",
    steps: [
      "Choisissez vos <b>cibles de sortie</b>.",
      "L'export applique automatiquement <b>marques de coupe, fond perdu et profils</b> selon le canal.",
      "Récupérez <b>tous les fichiers</b> depuis une seule source.",
    ],
    result: "Une création, tous les supports — aux normes propres à chaque destination.",
  },
  roles: {
    problem: "Donner accès à toute l'équipe sans contrôle expose données produit et réglages sensibles à des modifications non voulues.",
    steps: [
      "Définissez des <b>rôles et des permissions par module</b>.",
      "Invitez les utilisateurs ; les nouveaux arrivent <b>en attente</b>.",
      "<b>Attribuez, restreignez ou bloquez</b> l'accès finement.",
    ],
    result: "Chacun voit exactement ce qu'il doit voir, vos données restent protégées.",
  },
  settings: {
    problem: "Brancher ses propres clés IA, ses budgets et ses préférences au cas par cas est vite opaque — et risqué si une clé fuite.",
    steps: [
      "Renseignez vos <b>clés LLM</b> et configurez la <b>cascade de modèles</b>.",
      "Fixez <b>budgets et préférences</b>, synchronisés par utilisateur.",
      "Suivez la <b>consommation en direct</b>.",
    ],
    result: "Une plateforme à votre main, maîtrisée et sous budget.",
  },
}

let html = readFileSync(FILE, 'utf8')

function panel(id, d) {
  const steps = d.steps.map((s) => `<li>${s}</li>`).join('')
  return (
    `\n          <button class="scene-more" aria-expanded="false" aria-controls="d-${id}">` +
    `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>Comprendre ce module</button>` +
    `\n          <div class="scene-detail" id="d-${id}"><div class="scene-detail-inner">` +
    `<div class="sd-block"><span class="sd-k">Le problème</span><p>${d.problem}</p></div>` +
    `<div class="sd-block"><span class="sd-k">Comment ça marche</span><ol class="sd-steps">${steps}</ol></div>` +
    `<div class="sd-block"><span class="sd-k">Le résultat</span><p>${d.result}</p></div>` +
    `</div></div>`
  )
}

let injected = 0
for (const [id, d] of Object.entries(M)) {
  if (html.includes(`id="d-${id}"`)) continue // déjà injecté
  // Repère le début de la scène, puis le 1er </ul> qui suit (sa liste de puces).
  const sceneStart = html.indexOf(`<div class="scene" id="${id}">`)
  if (sceneStart === -1) { console.warn('scene introuvable:', id); continue }
  const ulEnd = html.indexOf('</ul>', sceneStart)
  if (ulEnd === -1) { console.warn('</ul> introuvable pour', id); continue }
  const insertAt = ulEnd + '</ul>'.length
  html = html.slice(0, insertAt) + panel(id, d) + html.slice(insertAt)
  injected++
}

writeFileSync(FILE, html, 'utf8')
console.log(`Panneaux injectés : ${injected}/${Object.keys(M).length}`)
