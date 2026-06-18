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

function keysHTML(keys) { return `<span class="kbd-keys">${(keys || []).map((k) => `<kbd>${k}</kbd>`).join('')}</span>` }

function moduleHTML(m) {
  const demos = DEMOS[m.id] || []
  const demoHTML = demos
    .map((d) => `<figure class="mod-demo"><video src="${d.src}" autoplay loop muted playsinline preload="metadata"></video><figcaption>${d.caption}</figcaption></figure>`)
    .join('')
  const feats = (m.features || []).map((f) => `<div class="feat-item"><dt>${f.title}</dt><dd>${f.desc}</dd></div>`).join('')
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
