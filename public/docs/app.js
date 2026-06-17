// IBS-Studio · Documentation — rendu data-driven, navigation, recherche, animations.
import { CATEGORIES, MODULES } from './content.js'

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/* ---------------- Animations « signature » ---------------- */
function animSVG(key) {
  const A = {
    pipeline: `<svg viewBox="0 0 200 120"><path class="sg-stroke sg-dash" d="M20 60H180"/>
      <circle class="sg-pulse sg-fill" cx="20" cy="60" r="9"/><circle class="sg-pulse sg-fill" cx="100" cy="60" r="9" style="animation-delay:.4s"/><circle class="sg-pulse sg-fill" cx="180" cy="60" r="9" style="animation-delay:.8s"/></svg>`,
    editor: `<svg viewBox="0 0 200 120" class="sg-morph"><rect x="58" y="32" width="56" height="56" rx="4" class="sg-fill-soft" stroke="var(--accent)" stroke-width="2.4"/>
      <rect x="92" y="50" width="46" height="46" rx="4" class="sg-stroke-2" style="animation-delay:1s"/></svg>`,
    pim: `<svg viewBox="0 0 200 120"><g>
      <rect class="sg-row sg-fill-soft" x="30" y="28" width="140" height="14" rx="3"/>
      <rect class="sg-row sg-fill-soft" x="30" y="50" width="140" height="14" rx="3"/>
      <rect class="sg-row sg-fill-soft" x="30" y="72" width="140" height="14" rx="3"/>
      <rect class="sg-row sg-fill-soft" x="30" y="94" width="140" height="14" rx="3"/></g>
      <rect x="30" y="28" width="34" height="80" fill="none" stroke="var(--accent)" stroke-width="2"/></svg>`,
    workflow: `<svg viewBox="0 0 200 120"><path class="sg-stroke sg-dash" d="M44 40H110a14 14 0 0 1 14 14v6a14 14 0 0 0 14 14h18"/>
      <rect x="20" y="28" width="34" height="24" rx="6" class="sg-fill-soft" stroke="var(--accent)" stroke-width="2"/>
      <rect x="108" y="48" width="34" height="24" rx="6" class="sg-fill-soft" stroke="var(--accent)" stroke-width="2"/>
      <circle class="sg-pulse sg-fill" cx="176" cy="74" r="9"/></svg>`,
    export: `<svg viewBox="0 0 200 120"><g transform="translate(100 88)">
      <rect class="sg-chip sg-fill-soft" x="-22" y="-52" width="44" height="30" rx="5" stroke="var(--accent)" stroke-width="2" style="--rot:-34deg"/>
      <rect class="sg-chip sg-fill-soft" x="-22" y="-52" width="44" height="30" rx="5" stroke="var(--accent)" stroke-width="2" style="--rot:-12deg;animation-delay:.2s"/>
      <rect class="sg-chip sg-fill-soft" x="-22" y="-52" width="44" height="30" rx="5" stroke="var(--accent)" stroke-width="2" style="--rot:12deg;animation-delay:.4s"/>
      <rect class="sg-chip sg-fill-soft" x="-22" y="-52" width="44" height="30" rx="5" stroke="var(--accent)" stroke-width="2" style="--rot:34deg;animation-delay:.6s"/></g></svg>`,
    img2svg: `<svg viewBox="0 0 200 120"><rect x="26" y="30" width="62" height="62" rx="6" class="sg-fill-soft"/>
      <path class="sg-stroke sg-dash" d="M112 36c30 0 30 24 0 24s-30 24 0 24 30 22 0 22"/>
      <circle class="sg-pulse sg-fill" cx="112" cy="36" r="5"/><circle class="sg-pulse sg-fill" cx="112" cy="60" r="5" style="animation-delay:.5s"/><circle class="sg-pulse sg-fill" cx="112" cy="84" r="5" style="animation-delay:1s"/></svg>`,
    telegram: `<svg viewBox="0 0 200 120"><circle cx="40" cy="90" r="14" class="sg-fill-soft" stroke="var(--accent)" stroke-width="2"/>
      <path class="sg-send sg-fill" d="M30 84l22 8-22 8 4-8z"/></svg>`,
    dam: `<svg viewBox="0 0 200 120"><g class="sg-float"><rect x="44" y="34" width="52" height="40" rx="5" class="sg-fill-soft" stroke="var(--accent)" stroke-width="2"/>
      <rect x="76" y="52" width="52" height="40" rx="5" class="sg-stroke-2" style="animation-delay:.6s"/>
      <circle cx="62" cy="50" r="6" class="sg-fill"/></g></svg>`,
    chat: `<svg viewBox="0 0 200 120"><rect x="40" y="34" width="90" height="34" rx="10" class="sg-fill-soft" stroke="var(--accent)" stroke-width="2"/>
      <rect x="74" y="74" width="86" height="30" rx="10" class="sg-stroke-2"/>
      <circle class="sg-spark sg-fill" cx="60" cy="51" r="3.5"/><circle class="sg-spark sg-fill" cx="74" cy="51" r="3.5" style="animation-delay:.3s"/><circle class="sg-spark sg-fill" cx="88" cy="51" r="3.5" style="animation-delay:.6s"/></svg>`,
    scrape: `<svg viewBox="0 0 200 120"><rect x="40" y="28" width="120" height="64" rx="6" fill="none" stroke="var(--border-strong)" stroke-width="2"/>
      <line class="sg-stroke sg-dash" x1="52" y1="46" x2="148" y2="46"/><line class="sg-stroke sg-dash" x1="52" y1="60" x2="120" y2="60" style="animation-delay:.3s"/><line class="sg-stroke sg-dash" x1="52" y1="74" x2="136" y2="74" style="animation-delay:.6s"/>
      <circle class="sg-pulse sg-fill" cx="160" cy="92" r="8"/></svg>`,
    taxonomy: `<svg viewBox="0 0 200 120"><path class="sg-stroke" d="M100 26V44M100 44H60V62M100 44H140V62"/>
      <circle class="sg-pulse sg-fill" cx="100" cy="26" r="7"/><circle class="sg-pulse sg-fill" cx="60" cy="70" r="6" style="animation-delay:.4s"/><circle class="sg-pulse sg-fill" cx="140" cy="70" r="6" style="animation-delay:.8s"/></svg>`,
    default: `<svg viewBox="0 0 200 120"><circle class="sg-pulse" cx="100" cy="60" r="30" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2.4"/>
      <circle class="sg-spark sg-fill" cx="100" cy="60" r="8"/></svg>`,
  }
  return `<div class="anim-stage" aria-hidden="true">${A[key] || A.default}</div>`
}

/* ---------------- Rendu des modules ---------------- */
const byCat = (label) => MODULES.filter((m) => m.cat === label)
let openId = null

function tileHTML(m) {
  return `<button class="tile reveal" data-id="${m.id}" id="m-${m.id}" aria-expanded="false">
    <span class="tile-ico" aria-hidden="true">${m.icon || '✦'}</span>
    <h3>${m.title}</h3>
    <p class="tile-intro">${m.intro}</p>
    <span class="tile-more">Découvrir
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
    </span>
  </button>`
}

function keysHTML(keys) { return (keys || []).map((k) => `<kbd>${k}</kbd>`).join('') }

function panelHTML(m) {
  const feats = (m.features || []).map((f, i) => `
    <div class="feat" data-fi="${i}">
      <button class="feat-btn" aria-expanded="false">
        <span class="feat-dot" aria-hidden="true"></span>${f.title}
        <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      <div class="feat-body"><p>${f.desc}</p></div>
    </div>`).join('')

  const shortcuts = (m.shortcuts && m.shortcuts.length)
    ? `<div class="shortcuts"><h4>Raccourcis</h4>${m.shortcuts.map((s) => `<div class="shortcut-row"><span class="shortcut-keys">${keysHTML(s.keys)}</span>${s.label}</div>`).join('')}</div>`
    : ''

  return `<div class="tile-panel reveal in" data-panel="${m.id}">
    <div class="panel-card">
      <div class="panel-grid">
        <div class="panel-main">
          <div class="panel-head">
            <div class="panel-title"><span class="tile-ico" aria-hidden="true">${m.icon || '✦'}</span>
              <div><span class="panel-cat">${m.cat}</span><h3>${m.title}</h3></div>
            </div>
            <button class="panel-close" aria-label="Fermer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <p class="panel-intro">${m.intro}</p>
          <div class="feats">${feats || '<p class="panel-intro">—</p>'}</div>
        </div>
        <div class="panel-aside">
          <div><h4 class="anim-h4">Aperçu animé</h4>${animSVG(m.anim)}</div>
          ${shortcuts}
        </div>
      </div>
    </div>
  </div>`
}

function render() {
  const wrap = $('#modules')
  const nav = $('#catNav')
  let html = ''
  let navHtml = ''
  for (const c of CATEGORIES) {
    const mods = byCat(c.label)
    if (!mods.length) continue
    navHtml += `<a href="#cat-${c.id}" data-cat="${c.id}">${c.label}</a>`
    html += `<section class="cat-section" id="cat-${c.id}">
      <div class="cat-head"><span class="cat-ico" aria-hidden="true">${c.icon}</span><h2>${c.label}</h2></div>
      <p class="cat-desc">${c.desc || ''}</p>
      <div class="tile-grid">${mods.map(tileHTML).join('')}</div>
    </section>`
  }
  wrap.innerHTML = html
  nav.innerHTML = navHtml
  initInteractions()
}

/* ---------------- Interactions ---------------- */
function closePanel() {
  const p = $('.tile-panel')
  if (p) p.remove()
  const t = openId && $(`#m-${openId}`)
  if (t) { t.classList.remove('open'); t.setAttribute('aria-expanded', 'false') }
  openId = null
}

function openModule(id, scroll = true) {
  if (openId === id) { closePanel(); return }
  closePanel()
  const tile = $(`#m-${id}`)
  const m = MODULES.find((x) => x.id === id)
  if (!tile || !m) return
  tile.classList.add('open')
  tile.setAttribute('aria-expanded', 'true')
  tile.insertAdjacentHTML('afterend', panelHTML(m))
  openId = id
  if (scroll) tile.scrollIntoView({ behavior: matchMotion(), block: 'center' })
}

function matchMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }

function initInteractions() {
  // Clic sur une tuile
  $$('.tile').forEach((t) => {
    t.addEventListener('click', () => openModule(t.dataset.id))
    t.addEventListener('pointermove', (e) => {
      const r = t.getBoundingClientRect()
      t.style.setProperty('--mx', `${e.clientX - r.left}px`)
      t.style.setProperty('--my', `${e.clientY - r.top}px`)
    })
  })
  // Délégation : fermeture + accordéon (le panneau est injecté dynamiquement)
  $('#modules').addEventListener('click', (e) => {
    const close = e.target.closest('.panel-close')
    if (close) { closePanel(); return }
    const fb = e.target.closest('.feat-btn')
    if (fb) {
      const feat = fb.closest('.feat')
      const body = $('.feat-body', feat)
      const isOpen = feat.classList.toggle('open')
      fb.setAttribute('aria-expanded', String(isOpen))
      body.style.maxHeight = isOpen ? `${body.scrollHeight}px` : '0'
    }
  })
  observeReveals()
  observeActiveCat()
}

/* ---------------- Scroll reveal + catégorie active ---------------- */
function observeReveals() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target) } })
  }, { rootMargin: '0px 0px -8% 0px' })
  $$('.reveal:not(.in)').forEach((el) => io.observe(el))
}

function observeActiveCat() {
  const links = $$('#catNav a')
  const map = new Map(links.map((a) => [a.dataset.cat, a]))
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        links.forEach((a) => a.classList.remove('active'))
        const a = map.get(en.target.id.replace('cat-', ''))
        if (a) a.classList.add('active')
      }
    })
  }, { rootMargin: '-40% 0px -55% 0px' })
  $$('.cat-section').forEach((s) => io.observe(s))
}

/* ---------------- Recherche (palette ⌘K) ---------------- */
const SEARCH_INDEX = MODULES.flatMap((m) => [
  { id: m.id, icon: m.icon, title: m.title, sub: m.cat, hay: norm(`${m.title} ${m.cat} ${m.intro}`) },
  ...(m.features || []).map((f) => ({ id: m.id, icon: '›', title: f.title, sub: m.title, hay: norm(`${f.title} ${f.desc} ${m.title}`) })),
])

let searchSel = 0
function runSearch(q) {
  const list = $('#searchResults')
  const nq = norm(q.trim())
  let res = nq ? SEARCH_INDEX.filter((r) => r.hay.includes(nq)).slice(0, 24)
              : MODULES.map((m) => ({ id: m.id, icon: m.icon, title: m.title, sub: m.cat }))
  searchSel = 0
  if (!res.length) { list.innerHTML = `<li class="search-empty">Aucun résultat pour « ${q} »</li>`; return }
  list.innerHTML = res.map((r, i) => `<li data-id="${r.id}" class="${i === 0 ? 'active' : ''}"><span class="sr-ico">${r.icon}</span><span>${r.title}</span><span class="sr-sub">${r.sub}</span></li>`).join('')
  $$('#searchResults li').forEach((li) => li.addEventListener('click', () => { if (li.dataset.id) chooseSearch(li.dataset.id) }))
}
function chooseSearch(id) { closeSearch(); openModule(id) }
function openSearch() { const o = $('#searchOverlay'); o.hidden = false; const i = $('#searchInput'); i.value = ''; runSearch(''); i.focus() }
function closeSearch() { $('#searchOverlay').hidden = true }

/* ---------------- Thème ---------------- */
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  const next = cur === 'light' ? 'dark' : 'light'
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

  // Nav mobile
  const menu = $('#menuToggle'), catNav = $('#catNav')
  menu.addEventListener('click', () => { const o = catNav.classList.toggle('open'); menu.setAttribute('aria-expanded', String(o)) })
  catNav.addEventListener('click', (e) => { if (e.target.tagName === 'A') catNav.classList.remove('open') })

  // Bouton haut de page
  const toTop = $('#toTop')
  toTop.hidden = false
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: matchMotion() }))
  window.addEventListener('scroll', () => toTop.classList.toggle('show', window.scrollY > 600), { passive: true })

  // Raccourcis clavier
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#searchOverlay').hidden ? openSearch() : closeSearch(); return }
    if (e.key === 'Escape') { closeSearch(); return }
    if ($('#searchOverlay').hidden) return
    const items = $$('#searchResults li[data-id]')
    if (!items.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      items[searchSel]?.classList.remove('active')
      searchSel = (searchSel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      items[searchSel].classList.add('active'); items[searchSel].scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') {
      e.preventDefault(); const id = items[searchSel]?.dataset.id; if (id) chooseSearch(id)
    }
  })

  // Lien profond #m-<id>
  const h = location.hash.match(/^#m-([\w-]+)$/)
  if (h && MODULES.some((m) => m.id === h[1])) setTimeout(() => openModule(h[1]), 200)
}

boot()
