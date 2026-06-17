// IBS-Studio · Documentation technique — rendu data-driven, navigation, recherche.
import { CATEGORIES, MODULES } from './content.js'

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// Vidéos de démonstration (rendues via HyperFrames). Survit à la régénération de content.js.
const DEMOS = {
  scraping: { src: 'media/scraping.mp4', caption: "Démonstration : une URL produit → lecture de la page, extraction des champs vers le PIM et des images vers le DAM." },
}

const byCat = (label) => MODULES.filter((m) => m.cat === label)

function keysHTML(keys) { return `<span class="kbd-keys">${(keys || []).map((k) => `<kbd>${k}</kbd>`).join('')}</span>` }

function moduleHTML(m) {
  const demo = DEMOS[m.id]
  const demoHTML = demo
    ? `<figure class="mod-demo"><video src="${demo.src}" autoplay loop muted playsinline preload="metadata"></video><figcaption>${demo.caption}</figcaption></figure>`
    : ''
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
