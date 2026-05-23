import JSZip from 'jszip'
import type { AspectFormat } from './types'

interface ExportOptions {
  aspect: AspectFormat
  isMultiScene: boolean
  /** Variables HyperFrames injectées (composition multi-scene OU svg+brand+caption…) */
  variables: Record<string, unknown>
  /** Dimensions exactes du canvas source (si fourni, écrase data-width/height) */
  width?: number
  height?: number
  /** Durée totale de l'animation en secondes (si fournie, écrase data-duration
   *  du template — défaut 10 s). Le template lit vars.durationScale = sec/10
   *  pour scaler ses timings GSAP. */
  durationSec?: number
  /** Nom de base du ZIP (sans extension) */
  filename?: string
}

const TEMPLATE_ID = (aspect: AspectFormat, multi: boolean): string =>
  `${multi ? 'multi-scene' : 'design-reveal'}-${aspect}`

const fetchText = async (url: string): Promise<string> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`)
  return r.text()
}

/** Patch data-duration du root + injecte vars.durationScale pour que le
 *  template scale ses timings GSAP. Le défaut du template est 10 s. */
function patchDuration(html: string, durationSec: number): string {
  return html.replace(/data-duration="[\d.]+"/g, `data-duration="${durationSec}"`)
}

/** Patch des dimensions data-width/data-height + viewport meta + width/height
 *  CSS — reproduit le patch de `HyperframesPlayer` pour que le template exporté
 *  ait exactement le ratio du canvas source. */
function patchDimensions(html: string, width: number, height: number): string {
  const wMatch = html.match(/data-width="(\d+)"/)
  const hMatch = html.match(/data-height="(\d+)"/)
  if (!wMatch || !hMatch) return html
  const oldW = wMatch[1]
  const oldH = hMatch[1]
  const newW = String(Math.round(width))
  const newH = String(Math.round(height))
  let patched = html
    .replace(
      /(<meta\s+name="viewport"\s+content="width=)\d+(\s*,\s*height=)\d+("\s*\/?>)/,
      `$1${newW}$2${newH}$3`,
    )
    .replace(/data-width="\d+"/g, `data-width="${newW}"`)
    .replace(/data-height="\d+"/g, `data-height="${newH}"`)
  patched = patched.split(`width: ${oldW}px`).join(`width: ${newW}px`)
  patched = patched.split(`height: ${oldH}px`).join(`height: ${newH}px`)
  return patched
}

/** Inline le contenu d'un fichier auxiliaire (ex. mockups.js) directement dans
 *  le HTML : `<script src="./mockups.js"></script>` → `<script>{content}</script>`.
 *  Élimine les fetch relatifs qui échouent en file:// (origin unique) et en
 *  blob URL (pas de base path). */
function inlineExternalScript(html: string, srcName: string, content: string): string {
  const escaped = srcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`<script\\s+src=["']\\.\\/${escaped}["']\\s*></script>`, 'g')
  return html.replace(re, `<script>\n${content}\n</script>`)
}

function buildVarsScript(vars: Record<string, unknown>): string {
  const safe = JSON.stringify(vars, null, 2)
  return `<script>
// Variables HyperFrames injectées au moment de la génération.
window.__hyperframes = window.__hyperframes || {};
window.__hyperframes.getVariables = function () {
  return ${safe};
};
</script>`
}

/** Bootstrap standalone du HTML self-contained :
 *  - démarre la timeline GSAP en boucle infinie
 *  - habille la page d'un overlay de contrôle (zoom, fit, 100 %, play/pause,
 *    timeline scrub) inspiré du HyperframesPlayer React
 *  - capture les erreurs JS et affiche un diagnostic visible plutôt qu'une
 *    page noire silencieuse
 *
 *  Pourquoi cet overlay : le template natif rend dans un body 1080×1920 (ou
 *  1080×1080…) en taille fixe, qui déborde ou laisse plein de blanc selon la
 *  taille de la fenêtre. On wrap le root dans un stage scalé + on offre des
 *  contrôles utilisateur pour ajuster. */
function buildAutoplayScript(compositionId: string): string {
  return `<script>
(function () {
  var COMP_ID = ${JSON.stringify(compositionId)};
  var DBG = '[hyperframes/standalone]';
  console.log(DBG, 'bootstrap démarré, composition=', COMP_ID);

  function showError(msg, detail) {
    console.error(DBG, msg, detail);
    if (document.getElementById('__hf_error')) return;
    var box = document.createElement('div');
    box.id = '__hf_error';
    box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#7f1d1d;color:#fecaca;font:14px/1.5 -apple-system,sans-serif;padding:16px 24px;border-bottom:2px solid #ef4444;';
    box.innerHTML = '<strong style="color:#fff;display:block;margin-bottom:4px;">⚠ Diagnostic HyperFrames</strong>' + msg + (detail ? '<pre style="margin-top:8px;font-size:11px;white-space:pre-wrap;opacity:0.8;">' + String(detail).replace(/[<>&]/g, function (c) { return c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'; }) + '</pre>' : '');
    document.body.appendChild(box);
  }

  window.addEventListener('error', function (e) {
    showError('Erreur JS : ' + e.message, e.error && e.error.stack);
  });
  window.addEventListener('unhandledrejection', function (e) {
    showError('Promise rejetée : ' + e.reason, e.reason && e.reason.stack);
  });

  // ─── Stage container (scale/pan) ─────────────────────────────────────────
  // Le root du template a une taille fixe (data-width × data-height). On le
  // déplace dans un stage absolument positionné, et on applique transform
  // sur le stage. Le body est réinitialisé pour servir de viewport sombre.
  function setupStage() {
    var root = document.querySelector('[data-composition-id="' + COMP_ID + '"]');
    if (!root) { showError('Root [data-composition-id=' + COMP_ID + '] introuvable.'); return null; }
    var W = parseInt(root.getAttribute('data-width') || '1080', 10);
    var H = parseInt(root.getAttribute('data-height') || '1920', 10);

    // Reset du body pour servir de viewport
    document.documentElement.style.cssText = 'width:100%;height:100%;margin:0;padding:0;background:#0a0a0a;';
    document.body.style.cssText = 'width:100%;height:100vh;margin:0;padding:0;background:#0a0a0a;overflow:hidden;position:relative;font-family:-apple-system,"SF Pro Display","Helvetica Neue",sans-serif;';

    var stage = document.createElement('div');
    stage.id = '__hf_stage';
    stage.style.cssText = 'position:absolute;top:0;left:0;width:' + W + 'px;height:' + H + 'px;transform-origin:0 0;will-change:transform;';
    root.parentNode.insertBefore(stage, root);
    stage.appendChild(root);

    return { stage: stage, W: W, H: H };
  }

  // ─── Overlay contrôles ───────────────────────────────────────────────────
  function buildOverlay() {
    var bar = document.createElement('div');
    bar.id = '__hf_controls';
    bar.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:99998;display:flex;align-items:center;gap:6px;background:rgba(20,20,20,0.92);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:6px 8px;color:#fff;font:13px -apple-system,"SF Pro Display","Helvetica Neue",sans-serif;box-shadow:0 4px 20px rgba(0,0,0,0.4);';

    var btn = function (label, title, onclick) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      b.style.cssText = 'background:transparent;border:0;color:rgba(255,255,255,0.85);padding:4px 10px;height:28px;border-radius:6px;cursor:pointer;font:inherit;line-height:1;display:inline-flex;align-items:center;gap:4px;';
      b.onmouseenter = function () { b.style.background = 'rgba(255,255,255,0.08)'; };
      b.onmouseleave = function () { b.style.background = 'transparent'; };
      b.onclick = onclick;
      return b;
    };
    var sep = function () {
      var s = document.createElement('div');
      s.style.cssText = 'width:1px;height:18px;background:rgba(255,255,255,0.1);margin:0 2px;';
      return s;
    };

    var playBtn = btn('⏸', 'Pause / Reprendre (Espace)', function () {});
    var restartBtn = btn('↻', 'Redémarrer (double-clic)', function () {});
    var zoomOut = btn('−', 'Zoom arrière', function () {});
    var pct = document.createElement('span');
    pct.style.cssText = 'min-width:42px;text-align:center;font-variant-numeric:tabular-nums;font-size:12px;color:rgba(255,255,255,0.7);';
    pct.textContent = '100%';
    var zoomIn = btn('+', 'Zoom avant', function () {});
    var fitBtn = btn('Fit', 'Adapter à la fenêtre (0)', function () {});
    var hundredBtn = btn('100%', 'Taille réelle (1)', function () {});

    bar.appendChild(playBtn);
    bar.appendChild(restartBtn);
    bar.appendChild(sep());
    bar.appendChild(zoomOut);
    bar.appendChild(pct);
    bar.appendChild(zoomIn);
    bar.appendChild(sep());
    bar.appendChild(fitBtn);
    bar.appendChild(hundredBtn);

    document.body.appendChild(bar);

    return { bar: bar, playBtn: playBtn, restartBtn: restartBtn, zoomOut: zoomOut, zoomIn: zoomIn, fitBtn: fitBtn, hundredBtn: hundredBtn, pct: pct };
  }

  // ─── Logique zoom / pan ──────────────────────────────────────────────────
  function setupZoom(stage, W, H, ui) {
    var scale = 1;
    var panX = 0;
    var panY = 0;
    var ZOOM_MIN = 0.05;
    var ZOOM_MAX = 16;
    var clamp = function (z) { return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)); };

    function apply() {
      stage.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + scale + ')';
      ui.pct.textContent = Math.round(scale * 100) + '%';
    }

    function fit() {
      var vw = window.innerWidth;
      var vh = window.innerHeight - 70; // place pour la barre de contrôles
      scale = clamp(Math.min(vw / W, vh / H) * 0.96);
      panX = (window.innerWidth - W * scale) / 2;
      panY = (vh - H * scale) / 2;
      apply();
    }

    function hundred() {
      scale = 1;
      panX = (window.innerWidth - W) / 2;
      panY = (window.innerHeight - 70 - H) / 2;
      apply();
    }

    function zoomBy(factor, cx, cy) {
      var newScale = clamp(scale * factor);
      if (newScale === scale) return;
      // Zoom centré sur le point (cx, cy) viewport
      var sx = (cx - panX) / scale;
      var sy = (cy - panY) / scale;
      scale = newScale;
      panX = cx - sx * scale;
      panY = cy - sy * scale;
      apply();
    }

    ui.zoomIn.onclick = function () { zoomBy(1.25, window.innerWidth / 2, window.innerHeight / 2); };
    ui.zoomOut.onclick = function () { zoomBy(1 / 1.25, window.innerWidth / 2, window.innerHeight / 2); };
    ui.fitBtn.onclick = fit;
    ui.hundredBtn.onclick = hundred;

    // Molette : Ctrl/Cmd + wheel = zoom centré sur curseur, sinon scroll natif
    window.addEventListener('wheel', function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      var factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomBy(factor, e.clientX, e.clientY);
    }, { passive: false });

    // Pan : Espace + drag, OU clic du milieu drag
    var dragging = false;
    var dragStart = null;
    var spaceHeld = false;

    window.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && !spaceHeld) {
        spaceHeld = true;
        document.body.style.cursor = 'grab';
        e.preventDefault();
      } else if (e.key === '0') {
        fit();
      } else if (e.key === '1') {
        hundred();
      } else if (e.key === '+' || e.key === '=') {
        zoomBy(1.25, window.innerWidth / 2, window.innerHeight / 2);
      } else if (e.key === '-') {
        zoomBy(1 / 1.25, window.innerWidth / 2, window.innerHeight / 2);
      }
    });
    window.addEventListener('keyup', function (e) {
      if (e.code === 'Space') {
        spaceHeld = false;
        document.body.style.cursor = '';
      }
    });

    window.addEventListener('mousedown', function (e) {
      if (e.target.closest('#__hf_controls')) return;
      if (!spaceHeld && e.button !== 1) return;
      dragging = true;
      dragStart = { x: e.clientX, y: e.clientY, panX: panX, panY: panY };
      document.body.style.cursor = 'grabbing';
      e.preventDefault();
    });
    window.addEventListener('mousemove', function (e) {
      if (!dragging || !dragStart) return;
      panX = dragStart.panX + (e.clientX - dragStart.x);
      panY = dragStart.panY + (e.clientY - dragStart.y);
      apply();
    });
    window.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      dragStart = null;
      document.body.style.cursor = spaceHeld ? 'grab' : '';
    });

    window.addEventListener('resize', function () {
      // Re-fit doucement sur resize ; l'utilisateur peut re-zoomer manuellement
      if (Math.abs(scale - 1) < 0.01) return; // si à 100 %, on garde
      fit();
    });

    // Fit initial
    fit();
    return { fit: fit, hundred: hundred };
  }

  // ─── Timeline GSAP ───────────────────────────────────────────────────────
  function checkPreconditions() {
    if (typeof gsap === 'undefined') {
      showError('GSAP non chargé (CDN cdn.jsdelivr.net inaccessible ?)');
      return false;
    }
    if (!window.__hyperframes || typeof window.__hyperframes.getVariables !== 'function') {
      showError('window.__hyperframes.getVariables manquant.');
      return false;
    }
    var vars = window.__hyperframes.getVariables();
    console.log(DBG, 'vars reçues :', vars);
    // Détail composition pour vérifier que enforceAnimationIntent a bien
    // injecté entryAnim variés et customAnimations selon le brief.
    if (vars && vars.composition) {
      var comp = vars.composition;
      console.log(DBG, 'composition.transition =', comp.transition, '| pace =', comp.pace, '| theme =', comp.theme);
      console.log(DBG, 'composition.palette =', comp.palette);
      if (Array.isArray(comp.scenes)) {
        comp.scenes.forEach(function (s, i) {
          var animCount = Array.isArray(s.customAnimations) ? s.customAnimations.length : 0;
          console.log(DBG, '  scene[' + i + '] type=' + s.type + ' entryAnim=' + (s.entryAnim || '(default)') + ' customAnimations=' + animCount);
          if (animCount > 0) {
            s.customAnimations.forEach(function (a, j) {
              console.log(DBG, '    anim[' + j + ']', a);
            });
          }
        });
      }
    }
    return true;
  }

  function waitForTimeline(retriesLeft, elapsedMs, onFound) {
    var tl = window.__timelines && window.__timelines[COMP_ID];
    if (tl && typeof tl.play === 'function') {
      console.log(DBG, 'timeline trouvée, duration=', tl.duration(), 's');
      onFound(tl);
      return;
    }
    if (retriesLeft <= 0) {
      showError('Timeline introuvable après ' + elapsedMs + 'ms.');
      return;
    }
    setTimeout(function () { waitForTimeline(retriesLeft - 1, elapsedMs + 100, onFound); }, 100);
  }

  function start() {
    if (!checkPreconditions()) return;
    var stageInfo = setupStage();
    if (!stageInfo) return;
    var ui = buildOverlay();
    setupZoom(stageInfo.stage, stageInfo.W, stageInfo.H, ui);

    waitForTimeline(50, 0, function (tl) {
      window.__hfStandaloneTimeline = tl;
      tl.eventCallback('onComplete', function () { tl.restart(); });
      tl.play();

      // Câblage play/pause + restart
      ui.playBtn.onclick = function () {
        if (tl.paused()) { tl.play(); ui.playBtn.textContent = '⏸'; }
        else { tl.pause(); ui.playBtn.textContent = '▶'; }
      };
      ui.restartBtn.onclick = function () { tl.restart(); ui.playBtn.textContent = '⏸'; };
    });

    // Raccourcis globaux play/pause/restart
    document.addEventListener('keydown', function (e) {
      var tl = window.__hfStandaloneTimeline;
      if (!tl) return;
      // Espace = toggle play/pause (mais seulement si pas en train de panner)
      // → on délègue à setupZoom qui gère le Space drag aussi
      if (e.code === 'KeyP') {
        if (tl.paused()) { tl.play(); ui.playBtn.textContent = '⏸'; }
        else { tl.pause(); ui.playBtn.textContent = '▶'; }
      }
    });
    document.addEventListener('dblclick', function (e) {
      if (e.target.closest('#__hf_controls')) return;
      var tl = window.__hfStandaloneTimeline;
      if (tl) tl.restart();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
</script>`
}

function buildReadme(opts: { isMultiScene: boolean; aspect: AspectFormat }): string {
  const kind = opts.isMultiScene ? 'multi-scene (Gemini)' : 'design-reveal (SVG canvas)'
  return `# Animation HyperFrames

Template : **${kind}** · ratio **${opts.aspect}**

## Contenu

- \`index.html\` — page principale, **self-contained** (CSS + JS + données
  + auto-play tout inline). Double-clique pour ouvrir.
- \`vars.json\` — variables (composition, brand, caption, styleConfig…)
  au format JSON, à titre informationnel.

## Lecture

1. Décompresse le ZIP.
2. Double-clique \`index.html\` — ça marche en \`file://\`.
3. GSAP est chargé depuis le CDN public (cdn.jsdelivr.net) — connexion
   internet requise.
4. L'animation boucle automatiquement.

## Contrôles (barre flottante en bas)

- \`Fit\` — adapter à la fenêtre · raccourci \`0\`
- \`100 %\` — taille réelle pixel-perfect · raccourci \`1\`
- \`+\` / \`−\` — zoom in / out · raccourcis \`+\` / \`-\`
- \`Ctrl/Cmd + molette\` — zoom centré sur le curseur
- \`Espace + drag\` ou clic du milieu — panoramique
- \`P\` — play / pause
- double-clic — redémarrer l'animation

## Modification

Tout est dans \`index.html\`. Cherche le bloc \`window.__hyperframes.getVariables\`
pour changer composition / brand / caption, puis recharge la page.

Généré par Web2Print.
`
}

/** Construit l'HTML self-contained du ZIP. Inline mockups.js, vars et autoplay
 *  directement dans le document — pas de refs externes, donc compatible
 *  file:// et blob URL sans patch. */
async function buildSelfContainedHtml(opts: ExportOptions): Promise<string> {
  const id = TEMPLATE_ID(opts.aspect, opts.isMultiScene)
  const baseDir = `/hf-templates/${id}`

  // Fetch template + assets auxiliaires (mockups.js pour multi-scene).
  const auxFiles = opts.isMultiScene ? ['mockups.js'] : []
  const [rawHtml, ...auxContents] = await Promise.all([
    fetchText(`${baseDir}/index.html`),
    ...auxFiles.map((f) => fetchText(`${baseDir}/${f}`)),
  ])

  let html = rawHtml
  if (opts.width && opts.height) {
    html = patchDimensions(html, opts.width, opts.height)
  }
  if (opts.durationSec && opts.durationSec > 0) {
    html = patchDuration(html, opts.durationSec)
  }

  // Inline tous les <script src="./xxx.js"> auxiliaires (mockups.js, etc.).
  auxFiles.forEach((file, i) => {
    html = inlineExternalScript(html, file, auxContents[i])
  })

  // Injecte durationScale dans les variables — le template multiplie ses
  // timings GSAP par ce facteur (template par défaut = 10s ; pour 5s →
  // durationScale = 0.5 ; pour 30s → durationScale = 3).
  const durationScale = opts.durationSec ? opts.durationSec / 10 : 1
  console.log('[exportHtmlZip] opts.durationSec=', opts.durationSec, '→ durationScale=', durationScale)
  const variablesWithScale = {
    ...opts.variables,
    durationScale,
  }
  const varsTag = buildVarsScript(variablesWithScale)
  const autoplayTag = buildAutoplayScript(id)

  // Injection des vars : dans <head>, juste avant </head>. Garantit que
  // window.__hyperframes.getVariables existe AVANT que les scripts inline
  // du body s'exécutent (les browsers parsent linéairement). Plus
  // déterministe qu'une regex sur "le premier <script> sans src=" qui peut
  // matcher des blocs auxiliaires.
  if (html.includes('</head>')) {
    html = html.replace('</head>', `    ${varsTag}\n  </head>`)
  } else {
    // Fallback : tout en haut du body
    html = html.replace(/<body\b[^>]*>/i, (m) => `${m}\n    ${varsTag}`)
  }

  // Injection autoplay : juste avant </body>, donc après le script du
  // template qui a fini de créer window.__timelines[id].
  if (html.includes('</body>')) {
    html = html.replace('</body>', `    ${autoplayTag}\n  </body>`)
  } else {
    html += `\n${autoplayTag}`
  }

  return html
}

/** Construit le ZIP en mémoire (blob). Réutilisable pour download local OU
 *  upload Firebase Storage (sauvegarde DAM). Le ZIP contient un seul
 *  `index.html` self-contained + un `vars.json` informatif + un README. */
export async function buildHtmlZipBlob(opts: ExportOptions): Promise<Blob> {
  const html = await buildSelfContainedHtml(opts)

  const zip = new JSZip()
  zip.file('index.html', html)
  zip.file('vars.json', JSON.stringify(opts.variables, null, 2))
  zip.file('README.md', buildReadme({ isMultiScene: opts.isMultiScene, aspect: opts.aspect }))

  return zip.generateAsync({ type: 'blob' })
}

/** Variante directe : retourne juste le HTML self-contained, sans ZIP. Utile
 *  pour la card DAM qui veut l'ouvrir directement dans un nouvel onglet via
 *  blob URL sans passer par JSZip côté lecture. */
export async function buildHtmlBlob(opts: ExportOptions): Promise<Blob> {
  const html = await buildSelfContainedHtml(opts)
  return new Blob([html], { type: 'text/html' })
}

/** Construit le ZIP et déclenche le téléchargement navigateur. */
export async function downloadHtmlZip(opts: ExportOptions): Promise<void> {
  const blob = await buildHtmlZipBlob(opts)
  const id = TEMPLATE_ID(opts.aspect, opts.isMultiScene)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${opts.filename ?? `hyperframes-${id}`}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
