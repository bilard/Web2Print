// IBS-Studio · Documentation — rendu data-driven, navigation, recherche, animations.
import { CATEGORIES, MODULES } from './content.js'

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/* ---------------- Animations « signature » (scènes SVG riches) ---------------- */
const VB = 'viewBox="0 0 240 168"'

function animSVG(key) {
  const A = {
    // Flux de bout en bout : 4 nœuds qui s'allument au passage d'un jeton lumineux.
    pipeline: `<svg ${VB}>
      <path class="sg-stroke-d a-dash" d="M30 84 H210"/>
      ${[30, 90, 150, 210].map((x, i) => `<g class="a-pulse" style="--d:${i * 0.35}s"><circle class="sg-fill-soft" cx="${x}" cy="84" r="14" stroke="var(--accent)" stroke-width="2.4"/><circle class="sg-fill" cx="${x}" cy="84" r="4"/></g>`).join('')}
      <circle class="sg-fill" r="5" filter="url(#glowF)"><animate attributeName="r" values="4;7;4" dur="1.6s" repeatCount="indefinite"/><animateMotion dur="3.2s" repeatCount="indefinite" path="M30 84 H210"/></circle>
      <defs><filter id="glowF" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs></svg>`,

    // Éditeur : un rectangle puis un cercle se dessinent, puis des poignées de sélection apparaissent.
    editor: `<svg ${VB}>
      <rect class="sg-fill-card" x="22" y="20" width="196" height="128" rx="10"/>
      <rect class="a-draw sg-stroke" x="58" y="50" width="74" height="64" rx="7" pathLength="1"/>
      <circle class="a-draw sg-stroke-2" cx="158" cy="92" r="30" pathLength="1" style="--d:.7s"/>
      <g class="a-pop" style="--d:1.6s">
        <rect x="55" y="47" width="80" height="70" rx="3" fill="none" stroke="var(--accent)" stroke-width="1.4" stroke-dasharray="4 4"/>
        ${[[55, 47], [135, 47], [55, 117], [135, 117]].map(([x, y]) => `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" rx="2" class="sg-fill" stroke="var(--bg)" stroke-width="1.5"/>`).join('')}
      </g></svg>`,

    // PIM : les lignes du tableau se remplissent une à une, l'anneau de complétude monte.
    pim: `<svg ${VB}>
      <rect class="sg-fill-card" x="20" y="24" width="138" height="120" rx="9"/>
      <rect x="30" y="34" width="118" height="13" rx="3" class="sg-fill-2" opacity=".5"/>
      ${[60, 80, 100, 120].map((y, i) => `<rect class="a-fillx sg-fill-soft" x="30" y="${y}" width="118" height="11" rx="3" style="--d:${0.2 + i * 0.3}s"/>`).join('')}
      <g transform="translate(196 84)">
        <circle r="26" fill="none" stroke="var(--border-strong)" stroke-width="7"/>
        <circle class="a-ringfill" r="26" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round" pathLength="1"/>
        <circle r="13" class="sg-fill-soft a-pulse"/></g></svg>`,

    // Taxonomie : l'arbre se déploie, les branches se tracent, les enfants apparaissent.
    taxonomy: `<svg ${VB}>
      <path class="a-draw sg-stroke" d="M120 38 V70 M52 96 V70 H188 V96 M120 70 V96" pathLength="1"/>
      <circle class="a-pulse sg-fill" cx="120" cy="34" r="11"/>
      ${[52, 120, 188].map((x, i) => `<g class="a-pop" style="--d:${0.8 + i * 0.3}s"><circle cx="${x}" cy="104" r="13" class="sg-fill-soft" stroke="var(--accent)" stroke-width="2.2"/><circle cx="${x}" cy="104" r="3.5" class="sg-fill"/></g>`).join('')}</svg>`,

    // Workflow : 3 nœuds s'enchaînent, le lien se trace, un jeton circule, coche finale.
    workflow: `<svg ${VB}>
      <path class="a-draw sg-stroke" d="M70 56 H104 a16 16 0 0 1 16 16 v8 a16 16 0 0 0 16 16 h22" pathLength="1" style="--d:.5s"/>
      <g class="a-pop" style="--d:0s"><rect x="26" y="42" width="44" height="28" rx="8" class="sg-fill-soft" stroke="var(--accent)" stroke-width="2.2"/></g>
      <g class="a-pop" style="--d:.6s"><rect x="98" y="78" width="44" height="28" rx="8" class="sg-fill-soft" stroke="var(--accent)" stroke-width="2.2"/></g>
      <g class="a-pop" style="--d:1.2s"><circle cx="186" cy="96" r="17" class="sg-fill-soft" stroke="var(--accent-2)" stroke-width="2.4"/><path class="a-tick sg-stroke-2" d="M178 96 l6 6 10 -12" pathLength="1" style="--d:1.6s"/></g>
      <circle class="sg-fill" r="4.5"><animateMotion dur="3s" begin="1s" repeatCount="indefinite" path="M48 56 H104 a16 16 0 0 1 16 16 v8 a16 16 0 0 0 16 16 h22"/></circle></svg>`,

    // Export : un document se décline en pastilles de formats disposées en arc.
    export: `<svg ${VB}>
      ${[['PDF', 42, 104], ['IDML', 81, 70], ['PPTX', 120, 56], ['SVG', 159, 70], ['PNG', 198, 104]].map(([t, x, y], i) => `<path class="sg-stroke-d" d="M120 132 L${x} ${y + 11}" stroke-dasharray="3 5" opacity=".4"/><g class="a-pop" style="--d:${0.3 + i * 0.18}s"><rect x="${x - 23}" y="${y}" width="46" height="24" rx="6" class="sg-fill-soft" stroke="var(--accent)" stroke-width="1.8"/><text class="sg-txt" x="${x}" y="${y + 16}" font-size="11">${t}</text></g>`).join('')}
      <g class="a-pulse"><rect x="104" y="120" width="32" height="34" rx="5" class="sg-fill-card"/><rect x="110" y="128" width="20" height="3" rx="1.5" class="sg-fill" opacity=".6"/><rect x="110" y="135" width="20" height="3" rx="1.5" class="sg-fill" opacity=".6"/><rect x="110" y="142" width="13" height="3" rx="1.5" class="sg-fill" opacity=".6"/></g></svg>`,

    // Image → SVG : la grille raster se dissout pendant que les ancres vectorielles se tracent.
    img2svg: `<svg ${VB}>
      <g>${[0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((c) => `<rect class="a-twinkle" style="--d:${(r + c) * 0.18}s" x="${30 + c * 17}" y="${52 + r * 17}" width="14" height="14" rx="2" fill="var(--accent-2)" opacity=".5"/>`)).join('')}</g>
      <path class="a-draw sg-stroke" d="M140 56 C176 56 176 92 150 92 C176 92 176 128 140 128" pathLength="1" style="--d:.4s"/>
      ${[[140, 56], [150, 92], [140, 128]].map(([x, y], i) => `<rect class="a-pop" style="--d:${1 + i * 0.25}s" x="${x - 4}" y="${y - 4}" width="8" height="8" class="sg-fill" transform="rotate(45 ${x} ${y})"/>`).join('')}</svg>`,

    // Scrape : un balayage parcourt la page, les données extraites s'empilent à droite.
    scrape: `<svg ${VB}>
      <rect class="sg-fill-card" x="22" y="26" width="118" height="116" rx="8"/>
      <rect x="22" y="26" width="118" height="20" rx="8" class="sg-fill-2" opacity=".4"/>
      ${[58, 76, 94, 112].map((y, i) => `<rect x="34" y="${y}" width="${94 - i * 12}" height="8" rx="3" fill="var(--text-faint)" opacity=".55"/>`).join('')}
      <rect class="a-sweep" x="22" y="48" width="118" height="14" rx="3" fill="var(--accent)" opacity=".35"/>
      ${[60, 84, 108].map((y, i) => `<rect class="a-pop sg-fill-soft" style="--d:${0.6 + i * 0.5}s" x="166" y="${y}" width="46" height="16" rx="4" stroke="var(--accent)" stroke-width="1.6"/>`).join('')}</svg>`,

    // Telegram : bulle avec points de saisie, puis l'avion s'envole le long d'une courbe.
    telegram: `<svg ${VB}>
      <path class="sg-stroke-d" d="M34 96 Q120 40 176 22" stroke-dasharray="3 7" opacity=".6"/>
      <rect x="26" y="78" width="74" height="38" rx="14" class="sg-fill-soft" stroke="var(--accent)" stroke-width="2"/>
      ${[44, 60, 76].map((x, i) => `<circle class="a-bounce sg-fill" style="--d:${i * 0.18}s" cx="${x}" cy="97" r="4.5"/>`).join('')}
      <path class="a-fly sg-fill" d="M-11 -7 L11 0 L-11 7 L-5 0 Z"/>
      <circle cx="176" cy="22" r="16" class="sg-fill-soft a-pulse" style="--d:.4s"/></svg>`,

    // DAM : pile de visuels qui flottent, étincelle de génération IA + tag.
    dam: `<svg ${VB}>
      <rect class="a-float sg-fill-card" style="--d:.5s" x="44" y="58" width="70" height="56" rx="8" transform="rotate(-7 79 86)"/>
      <rect class="a-float sg-fill-card" style="--d:.2s" x="74" y="48" width="70" height="56" rx="8"/>
      <circle cx="92" cy="68" r="8" class="sg-fill-2"/>
      <path d="M82 92 L100 74 L118 92 Z" class="sg-fill" opacity=".7"/>
      <g class="a-twinkle" style="--d:0s"><path d="M150 56 l3 9 9 3 -9 3 -3 9 -3 -9 -9 -3 9 -3 z" class="sg-fill"/></g>
      <rect class="a-pop sg-fill-soft" style="--d:1s" x="150" y="96" width="48" height="16" rx="8" stroke="var(--accent)" stroke-width="1.5"/></svg>`,

    // Chat : message reçu, points de saisie, réponse qui glisse, étincelle IA.
    chat: `<svg ${VB}>
      <rect x="34" y="40" width="96" height="32" rx="12" class="sg-fill-card"/>
      ${[54, 70, 86].map((x, i) => `<circle class="a-bounce sg-fill" style="--d:${i * 0.18}s" cx="${x}" cy="56" r="4"/>`).join('')}
      <g class="a-pop" style="--d:1.1s"><rect x="100" y="92" width="106" height="34" rx="12" class="sg-fill-soft" stroke="var(--accent)" stroke-width="2"/>
      ${[118, 134, 150].map((x) => `<rect x="${x}" y="103" width="${x === 150 ? 30 : 12}" height="6" rx="3" class="sg-fill" opacity=".7"/>`).join('')}</g>
      <g class="a-twinkle" style="--d:.5s"><path d="M196 40 l2.5 7 7 2.5 -7 2.5 -2.5 7 -2.5 -7 -7 -2.5 7 -2.5 z" class="sg-fill-2"/></g></svg>`,

    // Nouveautés : gerbe d'étincelles + badge.
    spark: `<svg ${VB}>
      ${[[70, 60, 0], [170, 54, .3], [150, 116, .6], [60, 112, .9], [120, 40, .45]].map(([x, y, d]) => `<path class="a-twinkle" style="--d:${d}s" d="M${x} ${y - 11} l3.5 8.5 8.5 3.5 -8.5 3.5 -3.5 8.5 -3.5 -8.5 -8.5 -3.5 8.5 -3.5 z" class="sg-fill"/>`).join('')}
      <g class="a-pop" style="--d:.2s"><rect x="92" y="74" width="56" height="26" rx="13" class="sg-fill" /><text class="sg-txt" x="120" y="91" fill="var(--bg)" font-size="12">NEW</text></g></svg>`,

    // Onboarding : cases cochées une à une.
    checklist: `<svg ${VB}>
      ${[44, 76, 108].map((y, i) => `<g><rect x="44" y="${y}" width="22" height="22" rx="6" class="sg-fill-soft" stroke="var(--accent)" stroke-width="2"/><path class="a-tick sg-stroke" d="M49 ${y + 11} l4 5 9 -11" pathLength="1" style="--d:${0.4 + i * 0.7}s"/><rect class="a-fillx sg-fill-soft" x="78" y="${y + 6}" width="118" height="10" rx="3" style="--d:${0.5 + i * 0.7}s"/></g>`).join('')}</svg>`,

    // Import : un fichier glisse et se déplie en page.
    import: `<svg ${VB}>
      <g class="a-rise"><path d="M70 40 h54 l24 24 v64 a6 6 0 0 1 -6 6 h-72 a6 6 0 0 1 -6 -6 v-82 a6 6 0 0 1 6 -6 z" class="sg-fill-card"/><path d="M124 40 v24 h24" fill="none" stroke="var(--border-strong)" stroke-width="1.6"/></g>
      ${[64, 82, 100, 118].map((y, i) => `<rect class="a-fillx sg-fill-soft" x="78" y="${y}" width="${82 - i * 8}" height="8" rx="3" style="--d:${0.6 + i * 0.25}s"/>`).join('')}</svg>`,

    // Animation/HyperFrames : bouton play, pellicule, barre de progression.
    reveal: `<svg ${VB}>
      <rect class="sg-fill-card" x="40" y="40" width="160" height="74" rx="10"/>
      ${[48, 192].map((x) => [50, 64, 78, 92].map((y) => `<rect x="${x}" y="${y}" width="8" height="8" rx="2" class="sg-fill-2" opacity=".5"/>`).join('')).join('')}
      <circle cx="120" cy="77" r="22" class="sg-fill-soft a-pulse" stroke="var(--accent)" stroke-width="2"/>
      <path d="M114 67 l16 10 -16 10 z" class="sg-fill"/>
      <rect x="40" y="128" width="160" height="7" rx="3.5" fill="var(--border-strong)"/>
      <rect class="a-fillx sg-fill" x="40" y="128" width="160" height="7" rx="3.5"/></svg>`,

    // Veille tarifaire : deux étiquettes prix, courbe qui se trace, ping d'alerte.
    pricewatch: `<svg ${VB}>
      <path class="a-draw sg-stroke" d="M34 120 L78 96 L116 108 L154 64 L200 44" pathLength="1"/>
      ${[[34, 120, 0], [78, 96, .3], [116, 108, .5], [154, 64, .7], [200, 44, .9]].map(([x, y, d]) => `<circle class="a-pop sg-fill" style="--d:${d}s" cx="${x}" cy="${y}" r="4"/>`).join('')}
      <g class="a-pulse" style="--d:.6s"><circle cx="200" cy="44" r="12" fill="none" stroke="var(--accent-2)" stroke-width="2.5"/></g>
      <rect x="30" y="30" width="40" height="20" rx="5" class="sg-fill-soft"/><text class="sg-txt" x="50" y="44" font-size="11">€</text></svg>`,

    // Accès & rôles : bouclier qui se trace, coche de validation.
    access: `<svg ${VB}>
      <path class="a-draw sg-stroke" d="M120 36 L172 56 V92 C172 124 148 140 120 150 C92 140 68 124 68 92 V56 Z" pathLength="1"/>
      <path class="a-tick sg-stroke-2" d="M100 94 l14 15 26 -32" pathLength="1" style="--d:1.4s" stroke-width="3"/>
      <circle class="a-pulse sg-fill-soft" cx="120" cy="92" r="34" style="--d:.3s"/></svg>`,

    // Paramètres : engrenages qui tournent.
    settings: `<svg ${VB}>
      ${gear(96, 84, 30, 'a-spin', 'var(--accent)')}
      ${gear(158, 110, 22, 'a-spin-r', 'var(--accent-2)')}</svg>`,

    default: `<svg ${VB}>
      <circle class="a-pulse" cx="120" cy="84" r="34" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2.4"/>
      <circle class="sg-fill" r="6"><animateMotion dur="4s" repeatCount="indefinite" path="M120 84 m-50 0 a50 50 0 1 0 100 0 a50 50 0 1 0 -100 0"/></circle>
      <circle class="a-twinkle sg-fill" cx="120" cy="84" r="8"/></svg>`,
  }
  return `<div class="anim-stage" aria-hidden="true">${A[key] || A.default}</div>`
}

/** Roue dentée (8 dents) centrée en (cx,cy). */
function gear(cx, cy, r, cls, color) {
  const teeth = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4
    const x = cx + Math.cos(a) * (r + 7), y = cy + Math.sin(a) * (r + 7)
    return `<rect x="${(x - 5).toFixed(1)}" y="${(y - 5).toFixed(1)}" width="10" height="10" rx="2" fill="${color}" transform="rotate(${i * 45} ${x.toFixed(1)} ${y.toFixed(1)})"/>`
  }).join('')
  return `<g class="${cls}">${teeth}<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--surface)" stroke="${color}" stroke-width="3.5"/><circle cx="${cx}" cy="${cy}" r="${r * 0.32}" fill="${color}"/></g>`
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
  // prefers-reduced-motion : SMIL n'est pas couvert par la media query CSS → on fige.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const panel = tile.nextElementSibling
    panel?.querySelectorAll('svg').forEach((svg) => svg.pauseAnimations && svg.pauseAnimations())
  }
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
