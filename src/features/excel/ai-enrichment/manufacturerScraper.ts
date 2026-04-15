import { getApiKey } from '@/lib/apiKeys'
import type { EnrichedProduct } from './types'
import { jinaScrapeMarkdown } from './jinaClient'

const JINA_PROXY_URL = 'https://europe-west1-web2print-6fe5a.cloudfunctions.net/jinaScrape'
const PUPPETEER_URL = 'https://europe-west1-web2print-6fe5a.cloudfunctions.net/scrapePage'

interface JinaProxyResponse {
  markdown: string
  html: string
  images: Record<string, string>
  links: Record<string, string>
  error?: string
}

interface PuppeteerResponse {
  html: string
  markdown: string
  error?: string
}

async function callJinaProxy(params: {
  url: string
  apiKey: string
  injectScript?: string
  timeout?: number
}): Promise<JinaProxyResponse> {
  const res = await fetch(JINA_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(`proxy HTTP ${res.status}`)
  return (await res.json()) as JinaProxyResponse
}

/** Scrape via Puppeteer serveur (SPA hydratée + accordéons expandés).
 *  Contrairement à Jina qui capture à readyState=loading avant hydratation,
 *  Puppeteer contrôle exactement quand capturer : après networkidle + waitMs. */
async function callPuppeteerScrape(params: {
  url: string
  waitMs?: number
  injectScript?: string
}): Promise<PuppeteerResponse> {
  const res = await fetch(PUPPETEER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(`puppeteer HTTP ${res.status}`)
  return (await res.json()) as PuppeteerResponse
}
import { extractSpecsBlockFromHtml, extractDocumentsBlockFromHtml } from './htmlSpecsExtractor'
import { extractSemantic, type SemanticResult } from './semanticExtractor'
import {
  isGarbageContent,
  parseSpecsFromMarkdown,
  parseVariantsFromMarkdown,
  parseAdvantagesFromMarkdown,
  parseImagesFromMarkdown,
} from './markdownParsers'
import {
  parseDescriptionFromMarkdown,
  deduplicateDocuments,
  isMainlyGarbage,
} from './postProcess'

// ── Scraping avancé des sites fabricants (REDUX store, embedded data) ────────

interface ManufacturerData {
  downloads: Array<{ name: string; url: string }>
  variants: Array<{ reference: string; label: string; properties: Record<string, string> }>
  images: string[]
  specs: Array<{ name: string; value: string; group?: string }>
  description: string
}


export interface DeepScrapeResult {
  markdown: string
  html: string | null
  source: 'post-browser' | 'get-fallback' | 'basic-merged' | 'puppeteer'
}

/**
 * Filet de sécurité : si le markdown ne contient pas déjà les blocs
 * JINA_EXTRACTED_SPECS / DOCUMENTS (cas où le script injecté n'a pas tourné —
 * POST bloqué par CORS, CSP, etc.), on parse le HTML capturé côté TS avec
 * DOMParser et on ajoute les blocs manuellement. DOMParser ignore CSS donc
 * les panels `display:none` sont parcourus de toute façon.
 */
/** Formate un SemanticResult en bloc texte taggué, compatible avec les
 *  parseurs existants (format "Nom = Valeur" + "GROUP: " + "url | label").
 *  La source primaire type-based est préfixée à l'ancien bloc ; les deux
 *  coexistent pour permettre une transition sans régression. */
function formatSemanticBlock(sem: SemanticResult): string {
  const lines: string[] = []
  lines.push('SEMANTIC_EXTRACT_START')
  if (sem.title.value) lines.push(`TITLE: ${sem.title.value}`)
  if (sem.description.value) lines.push(`DESCRIPTION: ${sem.description.value}`)
  if (sem.price.value) lines.push(`PRICE: ${sem.price.value.amount} ${sem.price.value.currency}`)
  if (sem.specs.length > 0) {
    const byGroup = new Map<string, string[]>()
    for (const s of sem.specs) {
      const g = s.group || 'Spécifications'
      if (!byGroup.has(g)) byGroup.set(g, [])
      byGroup.get(g)!.push(`${s.name} = ${s.value}`)
    }
    for (const [g, pairs] of byGroup) {
      lines.push(`GROUP: ${g}`)
      lines.push(...pairs)
    }
  }
  if (sem.images.length > 0) {
    lines.push('IMAGES:')
    for (const img of sem.images.slice(0, 20)) {
      lines.push(img.alt ? `${img.url} | ${img.alt}` : img.url)
    }
  }
  if (sem.documents.length > 0) {
    lines.push('DOCUMENTS:')
    for (const doc of sem.documents) lines.push(`${doc.url} | ${doc.label}`)
  }
  if (sem.variants.length > 0) {
    lines.push('VARIANTS:')
    for (const v of sem.variants) {
      const props = Object.entries(v.properties).map(([k, val]) => `${k}: ${val}`).join(', ')
      lines.push(`${v.sku}${props ? ` | ${props}` : ''}`)
    }
  }
  lines.push('SEMANTIC_EXTRACT_END')
  return lines.join('\n')
}

/**
 * Extrait les tokens "produit" significatifs du path d'une URL.
 * Heuristique générique :
 *   • Split sur / - _ . puis garde les tokens ≥ 3 chars
 *   • Filtre les mots-stop courants (produit, catalogue, fr, be, html, etc.)
 *   • Garde uniquement les tokens qui contiennent un chiffre OU qui sont ≥ 5 chars
 *     (un nom de modèle produit est quasi toujours alphanum ou long)
 */
function extractUrlProductTokens(pageUrl: string): string[] {
  const STOP = new Set([
    'products', 'product', 'produit', 'produits', 'catalog', 'catalogue',
    'category', 'categories', 'categorie', 'categories',
    'detail', 'details', 'html', 'htm', 'php', 'index', 'page', 'pages',
    'fiche', 'article', 'articles', 'item', 'items', 'ref', 'sku',
    'shop', 'boutique', 'store', 'www', 'com', 'fr', 'be', 'eu', 'en', 'de',
    'fr-fr', 'fr-be', 'en-gb', 'en-us', 'de-de',
    'media', 'content', 'public', 'static', 'assets',
  ])
  try {
    const u = new URL(pageUrl)
    const raw = u.pathname.split(/[/\-_.]/).map((s) => s.toLowerCase().trim()).filter(Boolean)
    const tokens: string[] = []
    for (const t of raw) {
      if (t.length < 3) continue
      if (STOP.has(t)) continue
      const hasDigit = /\d/.test(t)
      if (hasDigit || t.length >= 5) tokens.push(t)
    }
    return tokens
  } catch {
    return []
  }
}

/** Vérifie que le contenu extrait mentionne le produit ciblé par l'URL.
 *
 *  Stratégie hiérarchique :
 *    • Si l'URL contient des tokens à CHIFFRE (ex: m18, fpd3, duh752z), au
 *      moins UN doit apparaître dans title+description+specs+docs+variants.
 *      Les codes produit à chiffre sont les identifiants réels ; les mots
 *      génériques (perceuse, percussion) peuvent leaker via des cross-sells.
 *    • Sinon, fallback : au moins un token alphabétique (≥5 chars) doit
 *      matcher (pour URLs comme /kenadrain sans code numérique).
 *
 *  Garde contre les SPA qui servent un contenu générique/wrong sur l'URL
 *  cible (ex: Milwaukee renvoyant "Forets Multi-matériaux" sur m18-fpd3). */
function semanticMatchesUrl(sem: SemanticResult, urlTokens: string[]): boolean {
  if (urlTokens.length === 0) return true // pas de signal → on ne bloque pas
  const haystack = [
    sem.title.value ?? '',
    sem.description.value ?? '',
    ...sem.specs.map((s) => `${s.name} ${s.value}`),
    ...sem.documents.map((d) => `${d.url} ${d.label}`),
    ...sem.variants.map((v) => v.sku),
  ].join(' ').toLowerCase()
  const digitTokens = urlTokens.filter((t) => /\d/.test(t))
  if (digitTokens.length > 0) {
    return digitTokens.some((tok) => haystack.includes(tok))
  }
  return urlTokens.some((tok) => haystack.includes(tok))
}

function enrichResultWithHtmlExtraction(result: DeepScrapeResult, pageUrl: string): DeepScrapeResult {
  let md = result.markdown
  if (result.html) {
    // Source primaire type-based : extracteur sémantique (0 dépendance par
    // fournisseur). Si un champ a une confiance ≥ 0.5 ou si des specs sont
    // trouvées, on injecte le bloc SEMANTIC_EXTRACT en tête du markdown.
    try {
      const sem = extractSemantic(result.html, pageUrl)
      const hasSignal =
        !!sem.title.value || !!sem.description.value ||
        sem.specs.length > 0 || sem.images.length > 0 || sem.documents.length > 0
      if (hasSignal && md.indexOf('SEMANTIC_EXTRACT_START') === -1) {
        const block = formatSemanticBlock(sem)
        md = `${block}\n\n${md}`
        console.log('[semantic-extractor] ✓ block injected — title:', !!sem.title.value,
          'desc:', !!sem.description.value, 'specs:', sem.specs.length,
          'images:', sem.images.length, 'docs:', sem.documents.length)
      }
    } catch (e) {
      console.warn('[semantic-extractor] extraction failed:', e)
    }

    // TS-side specs extraction : TOUJOURS tenter, car DOMParser traverse même
    // les accordéons display:none que le script injecté peut rater (Makita
    // techspecs tab content). Si plus de specs que le bloc existant → remplacer.
    const tsBlock = extractSpecsBlockFromHtml(result.html)
    if (tsBlock) {
      const startTag = 'JINA_EXTRACTED_SPECS_START'
      const endTag = 'JINA_EXTRACTED_SPECS_END'
      const start = md.indexOf(startTag)
      const end = md.indexOf(endTag)
      const countPairs = (s: string) => (s.match(/ = /g) ?? []).length
      const tsCount = countPairs(tsBlock)
      if (start === -1 || end <= start) {
        md += `\n\n${tsBlock}`
        console.log('[html-extractor] ✓ TS-side specs block appended (', tsBlock.length, 'chars,', tsCount, 'pairs)')
      } else {
        const existing = md.slice(start, end + endTag.length)
        const existingCount = countPairs(existing)
        if (tsCount > existingCount) {
          md = md.slice(0, start) + tsBlock + md.slice(end + endTag.length)
          console.log('[html-extractor] ✓ TS-side specs block REPLACED injected (', existingCount, '→', tsCount, 'pairs)')
        }
      }
    }
    if (md.indexOf('JINA_EXTRACTED_DOCUMENTS_START') === -1) {
      const block = extractDocumentsBlockFromHtml(result.html, pageUrl)
      if (block) {
        md += `\n\n${block}`
        console.log('[html-extractor] ✓ TS-side documents block appended from Jina html (', block.length, 'chars)')
      }
    }
  }
  return md === result.markdown ? result : { ...result, markdown: md }
}


/**
 * Scrape optimisé pour les sites fabricants via Jina Reader.
 * Utilise des headers avancés (X-Wait-For-Selector, X-Target-Selector, X-Engine)
 * pour forcer le rendu complet des accordéons / sections dynamiques.
 */
export async function jinaScrapeMaufacturerPage(pageUrl: string): Promise<DeepScrapeResult | null> {
  console.log('[jina-manufacturer] deep scraping →', pageUrl)

  // JavaScript injecté dans la page via Jina injectPageScript.
  // IMPORTANT : le script s'exécute AVANT les scripts de la page.
  // On utilise setInterval pour attendre que le framework JS de la page soit prêt.
  //
  // Stratégies universelles :
  // 1. Relay (TTI : Milwaukee, Ryobi, AEG) → extraire les IDs, appeler l'API specs
  // 2. Accordéons classiques → cliquer/ouvrir tous les éléments repliés
  // 3. Next.js / Nuxt → extraire __NEXT_DATA__ / __NUXT__
  //
  // Le contenu extrait est injecté via document.body.prepend(div) avec innerText
  // car c'est la seule méthode capturée par Jina (appendChild + innerHTML ne marchent pas).
  const EXPAND_ACCORDIONS_SCRIPT = `
(function() {
  // ── STRATÉGIE UNIVERSELLE : s'appuyer sur les primitives W3C / WAI-ARIA.
  //    Tout site accessible expose les mêmes attributs standard :
  //      • Tabs pattern   → [role="tab"] + aria-controls="id" + [role="tabpanel"]
  //      • Disclosure     → [aria-expanded] + aria-controls="id"
  //      • Native HTML5   → <details open>, <summary>
  //      • Hidden content → [hidden] (attribut HTML), [aria-hidden="true"]
  //    Aucun besoin de deviner des noms de classes — on parse ces contrats.
  //    Pour les sites non conformes (rares) : le fallback click() générique
  //    sur tout bouton/lien parent d'une région cachée couvre le reste.
  function unhide(el) {
    if (!el || el.nodeType !== 1) return;
    el.style.setProperty('display', 'revert', 'important');
    el.style.setProperty('visibility', 'visible', 'important');
    el.style.setProperty('opacity', '1', 'important');
    el.style.setProperty('height', 'auto', 'important');
    el.style.setProperty('max-height', 'none', 'important');
    el.style.setProperty('overflow', 'visible', 'important');
    el.style.setProperty('clip', 'auto', 'important');
    el.style.setProperty('clip-path', 'none', 'important');
    el.removeAttribute('hidden');
    el.setAttribute('aria-hidden', 'false');
  }

  // Bombe atomique : force-unhide TOUT élément display:none/visibility:hidden.
  // Couvre les patterns legacy non-ARIA (ex: Makita <div class="article_tab_content"
  // style="display:none">) que la navigation par primitives W3C ne peut pas cibler.
  function revealAllHidden() {
    var SKIP = { SCRIPT:1, STYLE:1, LINK:1, META:1, TEMPLATE:1, NOSCRIPT:1, HEAD:1, HTML:1, IFRAME:1, TITLE:1, BASE:1 };
    document.querySelectorAll('body *').forEach(function(el) {
      if (SKIP[el.tagName]) return;
      try {
        var cs = window.getComputedStyle(el);
        if (!cs) return;
        if (cs.display === 'none') el.style.setProperty('display', 'block', 'important');
        if (cs.visibility === 'hidden') el.style.setProperty('visibility', 'visible', 'important');
        if (cs.opacity === '0') el.style.setProperty('opacity', '1', 'important');
      } catch(e) {}
    });
  }

  function expandAll() {
    // 0) Unhide massif — avant toute autre opération.
    revealAllHidden();

    // 1) Tabs pattern (W3C WAI-ARIA) — activer TOUS les panels simultanément.
    //    Chaque [role="tab"] pointe vers son panel via aria-controls.
    document.querySelectorAll('[role="tab"]').forEach(function(tab) {
      tab.setAttribute('aria-selected', 'true');
      tab.setAttribute('tabindex', '0');
      var panelId = tab.getAttribute('aria-controls');
      if (panelId) {
        var panel = document.getElementById(panelId);
        if (panel) unhide(panel);
      }
    });
    // Couvrir les tabpanels même si aucun tab ne les référence (mal codé).
    document.querySelectorAll('[role="tabpanel"]').forEach(unhide);

    // 2) Disclosure pattern (WAI-ARIA) — tout [aria-expanded] + aria-controls.
    document.querySelectorAll('[aria-expanded="false"]').forEach(function(trigger) {
      trigger.setAttribute('aria-expanded', 'true');
      var targetId = trigger.getAttribute('aria-controls');
      if (targetId) {
        targetId.split(/\\s+/).forEach(function(id) {
          var target = document.getElementById(id);
          if (target) unhide(target);
        });
      }
    });

    // 3) Native HTML5 <details> — juste ajouter l'attribut open.
    document.querySelectorAll('details:not([open])').forEach(function(d) {
      d.setAttribute('open', '');
    });

    // 4) Attribut natif [hidden] — retirer (spec HTML5 : équivaut à display:none).
    document.querySelectorAll('[hidden]').forEach(function(el) {
      // Préserver <script>/<style>/<template> qui sont légitimement cachés.
      var tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE' || tag === 'LINK' || tag === 'META') return;
      el.removeAttribute('hidden');
      unhide(el);
    });

    // 5) [aria-hidden="true"] hors navigation — WAI-ARIA indique contenu caché
    //    aux AT, donc typiquement caché visuellement aussi sur sites accessibles.
    document.querySelectorAll('[aria-hidden="true"]').forEach(function(el) {
      if (el.closest('nav,header,footer')) return;
      unhide(el);
    });

    // 6) CSS global : filet de sécurité pour les cas non couverts par JS (re-render React/Vue).
    if (!document.getElementById('__jina_force_visible__')) {
      var styleTag = document.createElement('style');
      styleTag.id = '__jina_force_visible__';
      styleTag.textContent = [
        '[role="tabpanel"]{display:block!important;visibility:visible!important;opacity:1!important;height:auto!important;max-height:none!important;overflow:visible!important}',
        '[aria-hidden="true"]:not(nav):not(header):not(footer){display:revert!important;visibility:visible!important;opacity:1!important}',
        'details{open:true}',
        'img[loading="lazy"]{content-visibility:visible}'
      ].join('\\n');
      document.head.appendChild(styleTag);
    }

    // 7) Lazy-load images : spec HTML5 loading="lazy" → forcer le chargement.
    document.querySelectorAll('img[loading="lazy"]').forEach(function(img) { img.loading = 'eager'; });
    // Conventions de facto (HTMLImageElement ne définit pas data-src, mais les
    // libs lazyload standard s'en servent) — swap si src absent.
    document.querySelectorAll('img[data-src],img[data-srcset]').forEach(function(img) {
      var ds = img.getAttribute('data-src');
      var dss = img.getAttribute('data-srcset');
      if (ds && !img.getAttribute('src')) img.setAttribute('src', ds);
      if (dss && !img.getAttribute('srcset')) img.setAttribute('srcset', dss);
    });
    // Scroll pour réveiller IntersectionObserver (pattern lazy-load standard).
    try { window.scrollTo(0, document.body.scrollHeight); window.scrollTo(0, 0); } catch(e) {}

    // 8) Pattern tabs de facto : <a href="#id"> qui pointe vers un panel local.
    //    Très courant (Bootstrap tabs legacy, onglets custom Drupal/Makita, etc.).
    //    On dé-masque la cible ET on déclenche le click (pour les handlers JS).
    document.querySelectorAll('a[href^="#"]').forEach(function(a) {
      var href = a.getAttribute('href') || '';
      if (href.length < 2) return;
      var id = href.substring(1);
      if (!id || /^[!?\\/]/.test(id)) return;
      var target = document.getElementById(id);
      if (!target) return;
      // Ne cliquer que si la cible ressemble à un panel (contient du contenu bloc),
      // pas une simple ancre vers un titre (pour éviter de casser la navigation).
      if (target.children.length > 0 || (target.textContent || '').trim().length > 40) {
        unhide(target);
        try { a.click(); } catch(e) {}
      }
    });

    // 9) Bootstrap (legacy + v5) : data-toggle/data-bs-toggle + data-target/data-bs-target.
    document.querySelectorAll('[data-toggle],[data-bs-toggle]').forEach(function(trigger) {
      var sel = trigger.getAttribute('data-target') || trigger.getAttribute('data-bs-target') || '';
      if (sel && sel.charAt(0) === '#') {
        var tgt = document.getElementById(sel.substring(1));
        if (tgt) unhide(tgt);
      }
      try { trigger.click(); } catch(e) {}
    });

    // 10) Fallback générique : cliquer tout ce qui a un handler explicite (onclick
    //     inline, role="tab"/"button") ou un <summary>. Couvre les sites legacy
    //     non-ARIA (ex: Makita <li id="tab_3" onclick="switchArtikelTab(this)">).
    document.querySelectorAll(
      '[onclick],[role="tab"],[role="button"],button[aria-controls],a[aria-controls],summary'
    ).forEach(function(el) {
      try { el.click(); } catch(e) {}
    });
  }

  // ── Extraction VIDÉOS (iframe YouTube/Vimeo + <video> + data-video-id) ──
  function extractVideos() {
    var videos = [];
    var seen = {};
    var addVideo = function(url, title) {
      if (!url || seen[url]) return;
      seen[url] = true;
      videos.push((title ? title + ' | ' : '') + url);
    };
    // iframes YouTube / Vimeo / Wistia
    document.querySelectorAll('iframe[src*="youtube"],iframe[src*="youtu.be"],iframe[src*="vimeo"],iframe[src*="wistia"]').forEach(function(f) {
      addVideo(f.src, f.getAttribute('title') || '');
    });
    // video tags
    document.querySelectorAll('video[src],video source[src]').forEach(function(v) {
      addVideo(v.src, v.getAttribute('title') || v.getAttribute('aria-label') || '');
    });
    // data-video-id → reconstruire URL YouTube
    document.querySelectorAll('[data-youtube-id],[data-video-id],[data-yt-id]').forEach(function(el) {
      var id = el.getAttribute('data-youtube-id') || el.getAttribute('data-video-id') || el.getAttribute('data-yt-id');
      if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) {
        addVideo('https://www.youtube.com/watch?v=' + id, el.getAttribute('aria-label') || el.textContent || '');
      }
    });
    // Liens <a> vers YouTube/Vimeo
    document.querySelectorAll('a[href*="youtube.com/watch"],a[href*="youtu.be/"],a[href*="vimeo.com/"]').forEach(function(a) {
      addVideo(a.href, (a.textContent || '').trim());
    });
    if (videos.length > 0) {
      var div = document.createElement('div');
      div.innerText = 'JINA_EXTRACTED_VIDEOS_START\\n' + videos.join('\\n') + '\\nJINA_EXTRACTED_VIDEOS_END';
      document.body.prepend(div);
    }
  }

  // ── Extraction SPECS génériques (<table> + <dl>) ──
  //    Couvre tous les sites qui exposent des caractéristiques via tables HTML standard.
  function extractGenericSpecs() {
    var out = '';
    var seenPairs = {};

    function nearestHeading(el) {
      var cur = el;
      for (var i = 0; i < 4 && cur; i++) {
        var sib = cur.previousElementSibling;
        while (sib) {
          if (/^H[1-6]$/.test(sib.tagName)) {
            var t = (sib.textContent || '').replace(/\\s+/g, ' ').trim();
            if (t && t.length <= 80) return t;
          }
          sib = sib.previousElementSibling;
        }
        cur = cur.parentElement;
      }
      return '';
    }

    // Tables 2-colonnes : label | value
    document.querySelectorAll('table').forEach(function(tbl) {
      var rows = tbl.querySelectorAll('tr');
      if (rows.length < 2) return;
      var localPairs = [];
      rows.forEach(function(tr) {
        var cells = tr.querySelectorAll('td,th');
        if (cells.length < 2) return;
        var k = (cells[0].textContent || '').replace(/\\s+/g, ' ').trim();
        var v = (cells[1].textContent || '').replace(/\\s+/g, ' ').trim();
        // Support ✓/✗ → Oui/Non
        if (!v && cells[1].querySelector('[class*="check"],svg')) v = 'Oui';
        if (!k || !v || k === v) return;
        if (k.length > 80 || v.length > 200) return;
        var pk = k.toLowerCase();
        if (seenPairs[pk]) return;
        seenPairs[pk] = true;
        localPairs.push(k + ' = ' + v);
      });
      if (localPairs.length >= 2) {
        var cap = tbl.querySelector('caption');
        var title = (cap && (cap.textContent || '').trim()) || nearestHeading(tbl) || 'Spécifications';
        out += 'GROUP: ' + title + '\\n' + localPairs.join('\\n') + '\\n';
      }
    });

    // Listes de définition <dl><dt>/<dd>
    document.querySelectorAll('dl').forEach(function(dl) {
      var dts = dl.querySelectorAll('dt');
      var dds = dl.querySelectorAll('dd');
      if (dts.length < 2 || dts.length !== dds.length) return;
      var localPairs = [];
      for (var i = 0; i < dts.length; i++) {
        var k = (dts[i].textContent || '').replace(/\\s+/g, ' ').trim();
        var v = (dds[i].textContent || '').replace(/\\s+/g, ' ').trim();
        if (!k || !v || k.length > 80 || v.length > 200) continue;
        var pk = k.toLowerCase();
        if (seenPairs[pk]) continue;
        seenPairs[pk] = true;
        localPairs.push(k + ' = ' + v);
      }
      if (localPairs.length >= 2) {
        var title = nearestHeading(dl) || 'Spécifications';
        out += 'GROUP: ' + title + '\\n' + localPairs.join('\\n') + '\\n';
      }
    });

    // Pseudo-tables en <div> : pattern ultra-courant sur e-commerce moderne.
    //   <div class="specs"><div class="row"><div>Label</div><div>Value</div></div>...</div>
    // Heuristique : élément avec ≥3 enfants directs "similaires", chaque enfant
    // contenant un label court + une valeur courte → c'est une table de specs.
    function extractPairFromRow(row) {
      // Déballer récursivement les wrappers à enfant unique (Makita : <div.techspecs--row>
      // → <div.techspecs-content-inner> → <li.row-content> → 2 divs label/value).
      var cur = row;
      for (var u = 0; u < 6; u++) {
        var ch = Array.from(cur.children).filter(function(e) {
          var t = (e.textContent || '').trim();
          return t.length > 0;
        });
        if (ch.length >= 2) break;
        if (ch.length === 1) { cur = ch[0]; continue; }
        break;
      }
      var subs = Array.from(cur.children).filter(function(e) {
        var t = (e.textContent || '').trim();
        return t.length > 0;
      });
      if (subs.length >= 2) {
        var k1 = (subs[0].textContent || '').replace(/\\s+/g, ' ').trim();
        var v1 = (subs[1].textContent || '').replace(/\\s+/g, ' ').trim();
        if (!v1 && subs[1].querySelector('svg,[class*="check"]')) v1 = 'Oui';
        if (k1 && v1 && k1 !== v1 && k1.length <= 80 && v1.length <= 200) return [k1, v1];
      }
      // Fallback : pattern "Label : valeur" dans un seul élément texte
      var flat = (row.textContent || '').replace(/\\s+/g, ' ').trim();
      var m = flat.match(/^([^:：]{2,60})\\s*[:：]\\s*(.{1,200})$/);
      if (m) return [m[1].trim(), m[2].trim()];
      return null;
    }

    // Filtre anti-parasite : écarter nav, cookies, menus, footers.
    function isJunkContext(el) {
      var cur = el;
      while (cur && cur !== document.body) {
        var tag = cur.tagName;
        if (tag === 'NAV' || tag === 'HEADER' || tag === 'FOOTER') return true;
        var cls = (cur.className || '') + ' ' + (cur.id || '');
        if (typeof cls !== 'string') cls = '';
        if (/cookie|consent|gdpr|mega-?menu|navigation|breadcrumb|footer|cart|panier|newsletter|social/i.test(cls)) return true;
        cur = cur.parentElement;
      }
      return false;
    }

    function scanContainerForPairs(el) {
      var tag = el.tagName;
      if (tag === 'TABLE' || tag === 'DL' || tag === 'TR' || tag === 'THEAD' || tag === 'TBODY' || tag === 'TFOOT') return null;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return null;
      if (isJunkContext(el)) return null;
      var kids = el.children;
      if (!kids || kids.length < 2 || kids.length > 80) return null;
      var pairs = [];
      for (var i = 0; i < kids.length; i++) {
        var p = extractPairFromRow(kids[i]);
        if (p) pairs.push(p);
      }
      if (pairs.length < 2 || pairs.length / kids.length < 0.5) return null;
      return pairs;
    }

    // 1) PRIORITÉ : conteneurs explicitement nommés "specs/tech/caracteristic/features".
    //    Couvre Makita <ul class="techspecs">, sites avec class="specifications" / "product-specs" / "tech-details".
    var priorityContainers = document.querySelectorAll(
      '[class*="techspec" i],[class*="tech-spec" i],[class*="specification" i],[class*="product-spec" i],' +
      '[class*="caracteris" i],[class*="features-list" i],[class*="attributes" i],[id*="specification" i],' +
      '[id*="techspec" i],[id*="caracteris" i],[class*="datasheet" i]'
    );
    var priorityHit = {};
    priorityContainers.forEach(function(el) {
      if (priorityHit[el.tagName + '#' + (el.id||'') + '.' + (el.className||'')]) return;
      var pairs = scanContainerForPairs(el);
      if (!pairs) return;
      priorityHit[el.tagName + '#' + (el.id||'') + '.' + (el.className||'')] = true;
      var localPairs = [];
      for (var pi = 0; pi < pairs.length; pi++) {
        var k = pairs[pi][0], v = pairs[pi][1], pk = k.toLowerCase();
        if (seenPairs[pk]) continue;
        seenPairs[pk] = true;
        localPairs.push(k + ' = ' + v);
      }
      if (localPairs.length >= 2) {
        var title = nearestHeading(el) || 'Caractéristiques techniques';
        out += 'GROUP: ' + title + '\\n' + localPairs.join('\\n') + '\\n';
      }
    });

    // 2) Générique : si le pre-scan n'a rien sorti, tenter tout le body (ordre document).
    if (Object.keys(priorityHit).length === 0) {
      document.querySelectorAll('body *').forEach(function(el) {
        var pairs = scanContainerForPairs(el);
        if (!pairs || pairs.length < 3) return;
        var localPairs = [];
        for (var pi = 0; pi < pairs.length; pi++) {
          var k = pairs[pi][0], v = pairs[pi][1], pk = k.toLowerCase();
          if (seenPairs[pk]) continue;
          seenPairs[pk] = true;
          localPairs.push(k + ' = ' + v);
        }
        if (localPairs.length >= 3) {
          var title = nearestHeading(el) || 'Spécifications';
          out += 'GROUP: ' + title + '\\n' + localPairs.join('\\n') + '\\n';
        }
      });
    }

    // Remove previous injection to avoid duplicates
    var prev = document.getElementById('__jina_specs_block__');
    if (prev) prev.remove();
    if (out) {
      var div = document.createElement('div');
      div.id = '__jina_specs_block__';
      div.innerText = 'JINA_EXTRACTED_SPECS_START\\n' + out + 'JINA_EXTRACTED_SPECS_END';
      document.body.prepend(div);
    }
  }

  // ── Extraction DOCUMENTS (PDF) avec label row correct ──
  //    Pattern courant : <tr><td>Déclaration CE</td><td><a>PDF</a></td></tr>
  //    Le texte de l'anchor est juste "PDF" ou filename → on remonte au row.
  function extractGenericDocuments() {
    var docs = [];
    var seen = {};

    var GENERIC = /^(pdf|download|t[eé]l[eé]charger|voir|view|open|ouvrir|link|file|document|generate|index|get|fetch|asset|content|resource|uploads?)\\.?$/i;
    var SKU_ONLY = /^[0-9]{4,}$/;
    var SKU_LINE = /^(ref|r[eé]f[eé]rence|sku|code)\\s*[:#]?\\s*[0-9a-z-]{4,}$/i;
    var HEADING_SEL = 'h1,h2,h3,h4,h5,h6,strong,b,[class*="title" i],[class*="heading" i],[class*="name" i],[class*="label" i]';
    function cleanLabel(raw) {
      var lines = String(raw).split(/\\n+/).map(function(l) { return l.replace(/\\s+/g, ' ').trim(); })
        .filter(function(l) { return l && !SKU_ONLY.test(l) && !SKU_LINE.test(l); });
      return lines[0] || '';
    }
    function isGood(t) {
      return t && t.length >= 3 && t.length <= 200 && !GENERIC.test(t) && !SKU_ONLY.test(t);
    }
    function findNearestHeading(a, container) {
      var all = Array.prototype.slice.call(container.querySelectorAll(HEADING_SEL));
      if (all.length === 0) return null;
      if (all.length === 1) return all[0];
      var insideA = null, lastPreceding = null;
      for (var i = 0; i < all.length; i++) {
        var h = all[i];
        var pos = a.compareDocumentPosition(h);
        if (pos & Node.DOCUMENT_POSITION_CONTAINED_BY) { insideA = h; continue; }
        if (pos & Node.DOCUMENT_POSITION_CONTAINS) continue;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) lastPreceding = h;
      }
      return insideA || lastPreceding || all[0];
    }
    function labelForAnchor(a) {
      // 0) aria-labelledby
      var labelledById = (a.getAttribute('aria-labelledby') || '').split(/\\s+/)[0];
      if (labelledById) {
        var ref = document.getElementById(labelledById);
        if (ref) { var t0 = cleanLabel(ref.textContent || ''); if (isGood(t0)) return t0; }
      }
      // 1) data-* attributes
      var dataAttrs = ['data-title','data-name','data-file-title','data-document-name','data-label'];
      for (var i = 0; i < dataAttrs.length; i++) {
        var v = a.getAttribute(dataAttrs[i]) || '';
        var t1 = cleanLabel(v);
        if (isGood(t1)) return t1;
      }
      // 2) Texte du <a> lui-meme
      var aText = cleanLabel(a.textContent || '');
      if (isGood(aText)) return aText;
      // 3) Walk up : heading le plus proche de a dans chaque ancetre
      var cur = a.parentElement;
      for (var d = 0; d < 5 && cur; d++) {
        var tag = cur.tagName;
        if (tag === 'BODY' || tag === 'HTML' || tag === 'MAIN') break;
        var h = findNearestHeading(a, cur);
        if (h) {
          var th = cleanLabel(h.textContent || '');
          if (isGood(th)) return th;
        }
        var clone = cur.cloneNode(true);
        clone.querySelectorAll('a, button, img, svg, script, style, noscript').forEach(function(e) { e.remove(); });
        var pt = cleanLabel(clone.textContent || '');
        if (pt && pt.length >= 5 && pt.length <= 120 && isGood(pt)) return pt;
        cur = cur.parentElement;
      }
      // 4) aria-label / title
      var aria = cleanLabel(a.getAttribute('aria-label') || '');
      if (isGood(aria)) return aria;
      var ttl = cleanLabel(a.getAttribute('title') || '');
      if (isGood(ttl)) return ttl;
      // 5) URL : query params nommés puis filename
      try {
        var u = new URL(a.href);
        var keys = ['type','name','file','doc','title','format','label','nom'];
        for (var k = 0; k < keys.length; k++) {
          var qv = u.searchParams.get(keys[k]);
          if (!qv) continue;
          var cq = decodeURIComponent(qv.replace(/\\.pdf$/i, '')).replace(/[_-]+/g, ' ').trim();
          if (isGood(cq)) return cq;
        }
        var fn = u.pathname.split('/').pop() || '';
        var cf = decodeURIComponent(fn.replace(/\\.pdf$/i, '')).replace(/[_-]+/g, ' ').trim();
        if (isGood(cf)) return cf;
      } catch(e) { /* noop */ }
      return 'Document';
    }

    document.querySelectorAll('a[href]').forEach(function(a) {
      var url = a.href || '';
      if (!/\\.pdf($|\\?|#)/i.test(url)) return;
      if (seen[url]) return;
      seen[url] = true;
      var label = labelForAnchor(a);
      docs.push(label + ' | ' + url);
    });

    var prev = document.getElementById('__jina_docs_block__');
    if (prev) prev.remove();
    if (docs.length > 0) {
      var div = document.createElement('div');
      div.id = '__jina_docs_block__';
      div.innerText = 'JINA_EXTRACTED_DOCUMENTS_START\\n' + docs.join('\\n') + '\\nJINA_EXTRACTED_DOCUMENTS_END';
      document.body.prepend(div);
    }
  }

  // ── Extraction VARIANTS (selects + swatches + liste déclinaisons) ──
  function extractVariants() {
    var variants = [];
    var seen = {};
    // <select> nommé variant/color/size/option
    document.querySelectorAll('select').forEach(function(sel) {
      var name = (sel.name || sel.id || '').toLowerCase();
      if (!/variant|color|couleur|size|taille|option|model|modele|ref/i.test(name)) return;
      Array.from(sel.options).forEach(function(opt) {
        var label = (opt.textContent || '').trim();
        var val = (opt.value || '').trim();
        if (label && val && label !== '—' && !/choisir|select|please/i.test(label)) {
          var k = name + '|' + val;
          if (!seen[k]) { seen[k] = true; variants.push(name + ' = ' + label + ' (' + val + ')'); }
        }
      });
    });
    // Swatches de couleur / radios variant
    document.querySelectorAll('[class*="swatch"],[class*="variant-option"],[class*="color-option"],[class*="size-option"],input[type="radio"][name*="variant" i],input[type="radio"][name*="color" i]').forEach(function(el) {
      var label = (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-value') || el.textContent || el.value || '').trim();
      var name = (el.getAttribute('name') || el.className || 'variant').toLowerCase();
      if (label && label.length > 0 && label.length < 80) {
        var k = name + '|' + label;
        if (!seen[k]) { seen[k] = true; variants.push(name + ' = ' + label); }
      }
    });
    if (variants.length > 0) {
      var div = document.createElement('div');
      div.innerText = 'JINA_EXTRACTED_VARIANTS_START\\n' + variants.join('\\n') + '\\nJINA_EXTRACTED_VARIANTS_END';
      document.body.prepend(div);
    }
  }

  // ── Extraire les specs depuis les frameworks SPA (polling — attend le chargement) ──
  function tryExtractSPA() {
    // ── Relay (TTI Group : Milwaukee, Ryobi, AEG) ──
    if (window.Relay && window.Relay.components) {
      var comps = window.Relay.components;
      var specComp = null;
      for (var i = 0; i < comps.length; i++) {
        if (comps[i].name === 'ProductSpecifications') specComp = comps[i];
      }
      if (specComp) {
        try {
          var props = JSON.parse(specComp.props);
          var pd = props.reduxContext && props.reduxContext.productDetail;
          if (pd && pd.modelAgilityId && pd.selectedVariantAgilityId) {
            var culture = (props.pageContext && props.pageContext.documentCulture) || 'fr-FR';
            var apiUrl = '/api/product-detail/product-specifications?modelAgilityId=' + pd.modelAgilityId
              + '&variantAgilityId=' + pd.selectedVariantAgilityId + '&cultureCode=' + culture + '&published=true';
            var xhr = new XMLHttpRequest();
            xhr.open('GET', apiUrl, false);
            xhr.send();
            if (xhr.status === 200) {
              var data = JSON.parse(xhr.responseText);
              if (Array.isArray(data) && data.length > 0) {
                var txt = 'JINA_EXTRACTED_SPECS_START\\n';
                data.forEach(function(g) {
                  txt += 'GROUP: ' + (g.title || g.name || '').trim() + '\\n';
                  (g.specifications || []).forEach(function(s) {
                    var n = (s.title || s.name || '');
                    var v = (s.value || '');
                    if (n && v) txt += n.trim() + ' = ' + v.trim() + '\\n';
                  });
                });
                txt += 'JINA_EXTRACTED_SPECS_END';
                var div = document.createElement('div');
                div.innerText = txt;
                document.body.prepend(div);
              }
            }
            // ── Images & Downloads : scanner TOUS les composants Relay pour trouver les assets complets ──
            var imgTxt = '';
            var dlTxt = '';
            var seen = {};
            // Chercher productDetail dans TOUS les composants (pas seulement ProductSpecifications)
            for (var ci = 0; ci < comps.length; ci++) {
              try {
                var cProps = (ci === (function() { for (var si = 0; si < comps.length; si++) { if (comps[si] === specComp) return si; } return -1; })()) ? props : JSON.parse(comps[ci].props);
                var cpd = cProps.reduxContext && cProps.reduxContext.productDetail;
                if (!cpd) continue;
                // Assets images
                var assets = cpd.assets;
                if (assets) {
                  var allKeys = Object.keys(assets);
                  allKeys.forEach(function(gk) {
                    var arr = assets[gk];
                    if (Array.isArray(arr)) {
                      arr.forEach(function(a) {
                        var url = a.imageUrl || a.url || a.src || a.original || '';
                        if (url && url.indexOf('http') === 0 && !seen[url]) {
                          seen[url] = true;
                          imgTxt += url + '\\n';
                        }
                      });
                    }
                  });
                }
                // Fallback pd.images
                if (Array.isArray(cpd.images)) {
                  cpd.images.forEach(function(img) {
                    var url = typeof img === 'string' ? img : (img.url || img.src || img.imageUrl || '');
                    if (url && url.indexOf('http') === 0 && !seen[url]) {
                      seen[url] = true;
                      imgTxt += url + '\\n';
                    }
                  });
                }
                // Packshots from includedProducts (kit components: bare tool, battery, charger, etc.)
                if (Array.isArray(cpd.includedProducts)) {
                  cpd.includedProducts.forEach(function(p) {
                    var url = p.imageUrl || p.image || p.thumbnailUrl || '';
                    if (url && url.indexOf('http') === 0 && !seen[url]) {
                      seen[url] = true;
                      imgTxt += url + '\\n';
                    }
                  });
                }
                // Downloads
                if (Array.isArray(cpd.downloads) && !dlTxt) {
                  cpd.downloads.forEach(function(dl) {
                    var name = dl.name || dl.title || dl.fileName || 'Document';
                    var url = dl.url || dl.downloadUrl || dl.fileUrl || dl.href || '';
                    if (url) dlTxt += name + ' | ' + url + '\\n';
                  });
                }
              } catch(ce) {}
            }
            if (imgTxt) {
              var imgDiv = document.createElement('div');
              imgDiv.innerText = 'JINA_EXTRACTED_IMAGES_START\\n' + imgTxt + 'JINA_EXTRACTED_IMAGES_END';
              document.body.prepend(imgDiv);
            }
            if (dlTxt) {
              var dlDiv = document.createElement('div');
              dlDiv.innerText = 'JINA_EXTRACTED_DOWNLOADS_START\\n' + dlTxt + 'JINA_EXTRACTED_DOWNLOADS_END';
              document.body.prepend(dlDiv);
            }
            return true;
          }
        } catch(e) {}
      }
    }

    // ── __NEXT_DATA__ (Next.js : DeWalt, Bosch, etc.) ──
    if (window.__NEXT_DATA__ && window.__NEXT_DATA__.props) {
      try {
        var nd = JSON.stringify(window.__NEXT_DATA__.props);
        if (nd.length > 500 && (nd.indexOf('specification') !== -1 || nd.indexOf('technical') !== -1)) {
          var div = document.createElement('div');
          div.innerText = 'NEXT_DATA_SPECS: ' + nd.substring(0, 30000);
          document.body.prepend(div);
          return true;
        }
      } catch(e) {}
    }

    // ── __NUXT__ (Nuxt.js) ──
    if (window.__NUXT__ && window.__NUXT__.data) {
      try {
        var nuxt = JSON.stringify(window.__NUXT__.data);
        if (nuxt.length > 500) {
          var div = document.createElement('div');
          div.innerText = 'NUXT_DATA_SPECS: ' + nuxt.substring(0, 30000);
          document.body.prepend(div);
          return true;
        }
      } catch(e) {}
    }

    // ── Generic window.* product object detection + HATEOAS API links ──
    // Scans common global variable names for product-like objects,
    // then follows HATEOAS links ({exist, link: {rel, href}}) to fetch API data.
    var PRODUCT_GLOBALS = ['product', 'productData', 'productInfo', 'pageProduct',
      'currentProduct', 'productDetail', 'itemData', 'pdpData', 'productConfig'];
    var ID_KEYS = ['productnumber', 'sku', 'productid', 'articlenumber', 'itemid',
      'gtin', 'ean', 'upc', 'mpn', 'partnumber', 'itemno', 'modelnumber', 'reference'];

    for (var pgi = 0; pgi < PRODUCT_GLOBALS.length; pgi++) {
      var pObj = window[PRODUCT_GLOBALS[pgi]];
      if (!pObj || typeof pObj !== 'object' || Array.isArray(pObj)) continue;

      var pKeys = Object.keys(pObj);
      if (pKeys.length < 3) continue;

      // Vérifier que l'objet a un champ "nom" ET/OU un champ "identifiant"
      var hasNameF = false;
      var hasIdF = false;
      for (var pki = 0; pki < pKeys.length; pki++) {
        var lk = pKeys[pki].toLowerCase().replace(/[_-]/g, '');
        if (lk === 'name' || lk === 'title' || lk === 'productname') hasNameF = true;
        for (var idi = 0; idi < ID_KEYS.length; idi++) {
          if (lk === ID_KEYS[idi]) { hasIdF = true; break; }
        }
      }
      if (!hasNameF && !hasIdF) continue;

      // ── Objet produit confirmé — extraction des données ──
      var gwSpecs = '';
      var gwImgs = [];
      var gwDesc = '';
      var gwDocs = '';

      // 1. Collecter les endpoints HATEOAS : { key: { exist: bool, link: { rel, href } } }
      var endpoints = [];
      for (var hki = 0; hki < pKeys.length; hki++) {
        var hVal = pObj[pKeys[hki]];
        if (!hVal || typeof hVal !== 'object' || Array.isArray(hVal)) continue;
        // Lien simple : { exist, link: { rel, href } }
        if (hVal.link && typeof hVal.link === 'object' && hVal.link.href) {
          endpoints.push({ key: pKeys[hki], rel: hVal.link.rel || pKeys[hki], href: hVal.link.href, exist: !!hVal.exist });
        }
        // Liens multiples : { links: [{ rel, href }] }
        if (hVal.links && Array.isArray(hVal.links)) {
          for (var hli = 0; hli < hVal.links.length; hli++) {
            if (hVal.links[hli] && hVal.links[hli].href) {
              endpoints.push({ key: pKeys[hki], rel: hVal.links[hli].rel || pKeys[hki], href: hVal.links[hli].href, exist: true });
            }
          }
        }
      }

      // Si pas assez de liens HATEOAS et objet trop simple, skip
      if (endpoints.length === 0 && pKeys.length < 8) continue;

      // 2. Fetch des endpoints de données via XHR synchrone
      for (var epi = 0; epi < endpoints.length; epi++) {
        var ep = endpoints[epi];
        if (!ep.exist) continue;
        var ek = ep.key.toLowerCase();
        var er = (ep.rel || '').toLowerCase();

        // Endpoints images → collecter les URLs
        if (er.indexOf('image') !== -1 || er.indexOf('photo') !== -1 || er.indexOf('picture') !== -1) {
          gwImgs.push(ep.href);
          continue;
        }
        // Skip endpoints média/dessin (pas des données textuelles)
        if (er.indexOf('curve') !== -1 || er.indexOf('drawing') !== -1 || er.indexOf('diagram') !== -1 ||
            er.indexOf('cad') !== -1 || er.indexOf('sound') !== -1 || er.indexOf('vibration') !== -1 ||
            er.indexOf('motor') !== -1 || er.indexOf('sizing') !== -1 || er.indexOf('lifecycle') !== -1 ||
            er.indexOf('submittal') !== -1 || er.indexOf('load') !== -1 || er.indexOf('zeta') !== -1 ||
            er.indexOf('replacement') !== -1 || er.indexOf('installation') !== -1) continue;

        try {
          var epXhr = new XMLHttpRequest();
          epXhr.open('GET', ep.href, false);
          epXhr.setRequestHeader('Accept', 'application/json');
          epXhr.send();
          if (epXhr.status !== 200) continue;

          var epJson;
          try { epJson = JSON.parse(epXhr.responseText); } catch(pe) { continue; }

          // Pattern A : { datavalues: [{ label, description, value, unit }] }
          var dvArr = epJson.datavalues || epJson.data || epJson.values || epJson.attributes || epJson.specifications;
          if (dvArr && Array.isArray(dvArr) && dvArr.length > 0 && dvArr[0] && typeof dvArr[0] === 'object') {
            var groupLabel = ep.key.charAt(0).toUpperCase() + ep.key.slice(1).replace(/([A-Z])/g, ' $1').trim();
            gwSpecs += 'GROUP: ' + groupLabel + '\\n';
            for (var dvi = 0; dvi < dvArr.length; dvi++) {
              var dvItem = dvArr[dvi];
              var dvName = dvItem.description || dvItem.label || dvItem.name || dvItem.title || '';
              var dvVal = (dvItem.value != null) ? String(dvItem.value) : '';
              var dvUnit = dvItem.unit || dvItem.uom || '';
              if (dvName && dvVal && dvVal !== 'null' && dvVal !== '') {
                gwSpecs += dvName.trim() + ' = ' + dvVal.trim() + (dvUnit ? ' ' + dvUnit.trim() : '') + '\\n';
              }
            }
          }

          // Pattern B : { entities: [{ text, languagecode }] } — description/quotation
          if (epJson.entities && Array.isArray(epJson.entities)) {
            for (var enti = 0; enti < epJson.entities.length; enti++) {
              var entTxt = epJson.entities[enti].text || epJson.entities[enti].description || '';
              if (entTxt && entTxt.length > gwDesc.length) gwDesc = entTxt;
            }
          }

          // Pattern C : { text: "..." } — description directe
          if (epJson.text && typeof epJson.text === 'string' && epJson.text.length > 50 && epJson.text.length > gwDesc.length) {
            gwDesc = epJson.text;
          }

          // Pattern D : tableau plat [{ name, value }]
          if (Array.isArray(epJson) && epJson.length > 0 && epJson[0] && epJson[0].name && epJson[0].value != null) {
            gwSpecs += 'GROUP: ' + ep.key + '\\n';
            for (var fai = 0; fai < epJson.length; fai++) {
              if (epJson[fai].name && epJson[fai].value != null) {
                gwSpecs += String(epJson[fai].name).trim() + ' = ' + String(epJson[fai].value).trim() + '\\n';
              }
            }
          }

          // Pattern E : { groups: [{ title, items: [{ name, value }] }] } — specs groupées
          var grpArr = epJson.groups || epJson.specGroups || epJson.sections || epJson.categories;
          if (grpArr && Array.isArray(grpArr) && grpArr.length > 0) {
            for (var gi = 0; gi < grpArr.length; gi++) {
              var grp = grpArr[gi];
              var grpTitle = grp.title || grp.name || grp.label || '';
              if (grpTitle) gwSpecs += 'GROUP: ' + grpTitle.trim() + '\\n';
              var grpItems = grp.items || grp.specifications || grp.attributes || grp.values || [];
              if (Array.isArray(grpItems)) {
                for (var gii = 0; gii < grpItems.length; gii++) {
                  var gi2 = grpItems[gii];
                  var giName = gi2.description || gi2.label || gi2.name || gi2.title || '';
                  var giVal = (gi2.value != null) ? String(gi2.value) : '';
                  var giUnit = gi2.unit || gi2.uom || '';
                  if (giName && giVal) {
                    gwSpecs += giName.trim() + ' = ' + giVal.trim() + (giUnit ? ' ' + giUnit.trim() : '') + '\\n';
                  }
                }
              }
            }
          }

          // Pattern F : service/spare parts — [{ parts: [{ name, qty }] }] or similar
          if (ek.indexOf('service') !== -1 || ek.indexOf('spare') !== -1) {
            var partsList = epJson.parts || epJson.spareparts || epJson.serviceparts;
            if (!partsList && epJson.entities) {
              // Nested in entities
              for (var sei = 0; sei < epJson.entities.length; sei++) {
                if (epJson.entities[sei].parts) { partsList = epJson.entities[sei].parts; break; }
                if (epJson.entities[sei].serviceparts) { partsList = epJson.entities[sei].serviceparts; break; }
              }
            }
            if (partsList && Array.isArray(partsList) && partsList.length > 0) {
              gwSpecs += 'GROUP: Service Parts\\n';
              for (var spi = 0; spi < partsList.length; spi++) {
                var sp = partsList[spi];
                var spName = sp.name || sp.description || sp.title || '';
                var spQty = sp.qty || sp.quantity || '';
                if (spName) gwSpecs += spName.trim() + (spQty ? ' = Qty: ' + spQty : '') + '\\n';
              }
            }
          }
        } catch(fetchErr) { /* skip failed endpoints */ }
      }

      // 3. Extraire les champs scalaires directs de l'objet global
      var directTxt = '';
      var skipFieldNames = ['exist', 'link', 'links', 'configured', 'hascad', 'saleable',
        'crmsaleable', 'hideprice', 'inproductrange', 'issparepart', 'iseproduct',
        'pricestatus', 'productstatus', 'isdiscontinued'];
      for (var fki = 0; fki < pKeys.length; fki++) {
        var fk = pKeys[fki];
        if (skipFieldNames.indexOf(fk.toLowerCase()) !== -1) continue;
        var fv = pObj[fk];
        if (typeof fv === 'object') continue;
        if (typeof fv === 'boolean') continue;
        if (typeof fv === 'string' && (fv.length === 0 || fv.length > 200)) continue;
        if (typeof fv === 'string' || typeof fv === 'number') {
          directTxt += fk + ' = ' + String(fv) + '\\n';
        }
      }

      // 4. Injecter dans le DOM
      if (gwSpecs || directTxt) {
        var fullTxt = 'JINA_EXTRACTED_SPECS_START\\n';
        if (directTxt) fullTxt += 'GROUP: Product\\n' + directTxt;
        fullTxt += gwSpecs;
        fullTxt += 'JINA_EXTRACTED_SPECS_END';
        var specDiv = document.createElement('div');
        specDiv.innerText = fullTxt;
        document.body.prepend(specDiv);
      }

      if (gwImgs.length > 0) {
        var imgDiv = document.createElement('div');
        imgDiv.innerText = 'JINA_EXTRACTED_IMAGES_START\\n' + gwImgs.join('\\n') + '\\nJINA_EXTRACTED_IMAGES_END';
        document.body.prepend(imgDiv);
      }

      if (gwDesc) {
        var descDiv = document.createElement('div');
        descDiv.innerText = '# Product Description\\n\\n' + gwDesc;
        document.body.prepend(descDiv);
      }

      return true;
    }

    return false;
  }

  // Exécution immédiate : expand + extraire specs/docs du DOM initial (tables
  // et liens PDF sont en général déjà là, juste cachés par display:none).
  expandAll();
  try { extractGenericSpecs(); } catch(e) {}
  try { extractGenericDocuments(); } catch(e) {}

  // Polling 20s (100 × 200ms) : ré-applique expansion + extractions à chaque tick
  // (remove+re-insert idempotent). Couvre les ré-rendus React/Vue et les AJAX lazy.
  var attempts = 0;
  var spaDone = false;
  var finalDone = false;
  var interval = setInterval(function() {
    attempts++;
    expandAll();
    if (!spaDone && tryExtractSPA()) spaDone = true;
    // Re-scan specs + docs à chaque tick — chaque passage remplace le div injecté.
    try { extractGenericSpecs(); } catch(e) {}
    try { extractGenericDocuments(); } catch(e) {}
    // Après 8s (40 ticks), on considère que les AJAX lazy sont arrivés :
    // extraire vidéos + variants à partir du DOM stabilisé.
    if (attempts === 40) {
      try { extractVideos(); } catch(e) {}
      try { extractVariants(); } catch(e) {}
    }
    if (attempts > 100) {
      if (!finalDone) {
        finalDone = true;
        try { expandAll(); } catch(e) {}
        try { extractVideos(); } catch(e) {}
        try { extractVariants(); } catch(e) {}
        try { extractGenericSpecs(); } catch(e) {}
        try { extractGenericDocuments(); } catch(e) {}
      }
      clearInterval(interval);
    }
  }, 200);
})();
`

  try {
    // 1) Puppeteer serveur : rend la page complètement (SPA + hydratation).
    //    Contrairement à Jina (readyState=loading), Puppeteer attend networkidle2
    //    puis waitMs pour laisser les API post-hydratation (Relay, Next) résoudre.
    console.log('[manufacturer] puppeteer scrapePage with W3C expand + custom script')
    try {
      const pup = await callPuppeteerScrape({
        url: pageUrl,
        waitMs: 8000,
        injectScript: EXPAND_ACCORDIONS_SCRIPT,
      })
      if (!pup.error && pup.html && pup.html.length > 500) {
        let md = pup.markdown || ''
        md = md
          .replace(/#{1,4}\s*(Your Privacy|Cookie|GDPR|Manage Preferences|Bienvenue chez)[\s\S]*?(?=\n#{1,4}\s|\n\n---|\n\n\*\*|$)/gi, '')
          .replace(/^[-*•]\s*.*?(cookie|privacy|captcha|recaptcha|consent|targeting|functional|necessary).*$/gim, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
        console.log('[manufacturer] puppeteer ✓', { htmlLen: pup.html.length, mdLen: md.length })
        return enrichResultWithHtmlExtraction(
          { markdown: md, html: pup.html, source: 'puppeteer' as const },
          pageUrl,
        )
      }
      console.warn('[manufacturer] puppeteer empty/error:', pup.error, '— falling back to Jina')
    } catch (err) {
      console.warn('[manufacturer] puppeteer failed:', err, '— falling back to Jina')
    }

    const jinaKey = getApiKey('jina')
    if (!jinaKey) {
      console.warn('[jina-manufacturer] ⚠ no Jina API key — falling back to basic scrape')
      const fallbackMd = await jinaScrapeMarkdown(pageUrl)
      return fallbackMd ? { markdown: fallbackMd, html: null, source: 'get-fallback' as const } : null
    }

    // POST avec injectPageScript via Cloud Function (bypass CORS).
    // Le POST direct depuis le navigateur est bloqué par Cloudflare sur certaines
    // réponses d'erreur → impossible d'utiliser injectPageScript côté client.
    // La Cloud Function `jinaScrape` fait le POST côté serveur et relaie le résultat.
    console.log('[jina-manufacturer] proxy jinaScrape with injectPageScript')
    let callResult: JinaProxyResponse
    try {
      callResult = await callJinaProxy({
        url: pageUrl,
        apiKey: jinaKey,
        injectScript: EXPAND_ACCORDIONS_SCRIPT,
        timeout: 90,
      })
    } catch (err) {
      console.warn('[jina-manufacturer] proxy failed:', err, '— falling back to GET browser')
      return jinaScrapeMaufacturerPageFallback(pageUrl, jinaKey)
    }
    if (callResult.error || !callResult.markdown) {
      console.warn('[jina-manufacturer] proxy returned error:', callResult.error, '— falling back')
      return jinaScrapeMaufacturerPageFallback(pageUrl, jinaKey)
    }

    let md = callResult.markdown || ''
    const postImages = callResult.images
    const postLinks = callResult.links
    const capturedHtml: string | null = callResult.html || null

    if (!md || md.length < 100) {
      console.warn('[jina-manufacturer] POST returned empty content — falling back to GET')
      return jinaScrapeMaufacturerPageFallback(pageUrl, jinaKey)
    }

    // Nettoyage cookie/GDPR
    md = md
      .replace(/#{1,4}\s*(Your Privacy|Cookie|GDPR|Manage Preferences|Bienvenue chez)[\s\S]*?(?=\n#{1,4}\s|\n\n---|\n\n\*\*|$)/gi, '')
      .replace(/^[-*•]\s*.*?(cookie|privacy|captcha|recaptcha|consent|targeting|functional|necessary).*$/gim, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    console.log('[jina-manufacturer] POST got', md.length, 'chars (with JS accordion expand)')

    // Injecter images et documents PDF depuis le JSON response
    if (postImages && typeof postImages === 'object') {
      const imgEntries = Object.entries(postImages).filter(([, url]) => typeof url === 'string' && url.startsWith('http'))
      if (imgEntries.length > 0 && md.indexOf('JINA_EXTRACTED_IMAGES_START') === -1) {
        md += '\n\nJINA_EXTRACTED_IMAGES_START\n' + imgEntries.map(([, url]) => url).join('\n') + '\nJINA_EXTRACTED_IMAGES_END'
        console.log('[jina-manufacturer] ✓ injected', imgEntries.length, 'images from POST JSON')
      }
    }
    if (postLinks && typeof postLinks === 'object') {
      const DOC_EXT = /\.(pdf|docx?|xlsx?)(\?[^"']*)?$/i
      const docEntries = Object.entries(postLinks).filter(([, href]) => DOC_EXT.test(href))
      if (docEntries.length > 0 && md.indexOf('JINA_EXTRACTED_DOWNLOADS_START') === -1) {
        md += '\n\nJINA_EXTRACTED_DOWNLOADS_START\n' + docEntries.map(([title, url]) => `${title}##${url}`).join('\n') + '\nJINA_EXTRACTED_DOWNLOADS_END'
        console.log('[jina-manufacturer] ✓ injected', docEntries.length, 'documents from POST JSON')
      }
    }

    const deepSpecs = parseSpecsFromMarkdown(md).length
    const deepAdvs = parseAdvantagesFromMarkdown(md).length
    console.log('[jina-manufacturer] POST scrape quality:', { specs: deepSpecs, advantages: deepAdvs })

    // TOUJOURS fusionner avec le GET JSON pour avoir un maximum de données
    // Le POST capture les accordéons expandés, le GET capture la structure + images JSON
    const basicMd = await jinaScrapeMarkdown(pageUrl)
    if (basicMd) {
      const basicSpecs = parseSpecsFromMarkdown(basicMd).length
      const basicAdvs = parseAdvantagesFromMarkdown(basicMd).length
      console.log('[jina-manufacturer] basic scrape quality:', { specs: basicSpecs, advantages: basicAdvs })
      // Fusionner les deux sources (dédoublonner specs au moment du parsing)
      if (basicMd.length > 200) {
        md = md + '\n\n' + basicMd
        console.log('[jina-manufacturer] ✓ merged POST + JSON →', md.length, 'chars')
      }
    }

    return enrichResultWithHtmlExtraction({ markdown: md, html: capturedHtml, source: 'post-browser' as const }, pageUrl)
  } catch (err) {
    console.warn('[jina-manufacturer] POST scrape failed:', err, '— trying GET browser fallback')
    const jinaKey = getApiKey('jina')
    if (jinaKey) {
      return jinaScrapeMaufacturerPageFallback(pageUrl, jinaKey)
    }
    const fallbackMd = await jinaScrapeMarkdown(pageUrl)
    return fallbackMd ? { markdown: fallbackMd, html: null, source: 'get-fallback' as const } : null
  }
}

/** Fallback GET pour le scraping fabricant (sans injection JS).
 *  Essaie d'abord le mode GET browser engine (rend le DOM JS sans injection),
 *  puis retombe sur le mode JSON classique. Utile quand le POST est bloqué
 *  par CORS mais que GET browser passe (SPA qui rend son contenu côté client).
 */
async function jinaScrapeMaufacturerPageFallback(pageUrl: string, jinaKey: string): Promise<DeepScrapeResult | null> {
  console.log('[jina-manufacturer-fallback] proxy jinaScrape (no JS injection)')
  try {
    const data = await callJinaProxy({
      url: pageUrl,
      apiKey: jinaKey,
      timeout: 60,
    })
    if (data.error) {
      console.warn('[jina-manufacturer-fallback] proxy error:', data.error)
    }
    const md = data.markdown || ''
    const html = data.html || null
    if (md && md.length > 500) {
      console.log('[jina-manufacturer-fallback] ✓ got', md.length, 'chars (html:', html?.length ?? 0, ')')
      return enrichResultWithHtmlExtraction({ markdown: md, html, source: 'get-fallback' as const }, pageUrl)
    }
    console.warn('[jina-manufacturer-fallback] proxy returned thin content (', md.length, 'chars)')
  } catch (e) {
    console.warn('[jina-manufacturer-fallback] proxy threw:', e)
  }

  // Dernier recours : mode JSON classique
  console.log('[jina-manufacturer-fallback] falling back to JSON mode scrape')
  const fallbackMd = await jinaScrapeMarkdown(pageUrl)
  return fallbackMd ? { markdown: fallbackMd, html: null, source: 'get-fallback' as const } : null
}

/**
 * Fetch le HTML brut d'une page via CORS proxy et en extrait les données embarquées :
 * - `window.__REDUX_STORE` (TTI Group / sites Relay) → downloads, variants, images
 * - JSON-LD (schema.org Product) → specs, images, description
 * - `window.__NEXT_DATA__` (Next.js) → product data
 * - Embedded JSON in script tags
 */
export async function scrapeManufacturerRawData(pageUrl: string): Promise<ManufacturerData> {
  console.log('[manufacturer] fetching raw HTML →', pageUrl)
  const data: ManufacturerData = { downloads: [], variants: [], images: [], specs: [], description: '' }

  const corsProxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(pageUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(pageUrl)}`,
  ]

  let html = ''
  for (const proxyUrl of corsProxies) {
    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(25000) })
      if (!res.ok) continue
      html = await res.text()
      if (html.length > 1000) {
        console.log('[manufacturer] CORS proxy got', html.length, 'chars from', proxyUrl.split('?')[0])
        break
      }
    } catch (err) {
      console.warn('[manufacturer] CORS proxy failed:', proxyUrl.split('?')[0], err)
    }
  }

  if (!html || html.length < 1000) {
    console.log('[manufacturer] no HTML from CORS proxies')
    return data
  }

  // ── 1. Parse window.__REDUX_STORE (TTI Group / sites Relay) ──
  // Le regex paresseux \{[\s\S]*?\} s'arrête au premier } — on utilise un extracteur JSON à accolades
  const reduxStart = html.indexOf('window.__REDUX_STORE')
  let reduxJson: string | null = null
  if (reduxStart !== -1) {
    const eqPos = html.indexOf('{', reduxStart)
    if (eqPos !== -1) {
      let depth = 0
      let end = eqPos
      for (let ci = eqPos; ci < html.length && ci < eqPos + 500000; ci++) {
        if (html[ci] === '{') depth++
        else if (html[ci] === '}') { depth--; if (depth === 0) { end = ci + 1; break } }
      }
      if (depth === 0) reduxJson = html.slice(eqPos, end)
    }
  }
  if (reduxJson) {
    try {
      const store = JSON.parse(reduxJson)
      const pd = store?.productDetail
      if (pd) {
        console.log('[manufacturer] REDUX_STORE.productDetail found — keys:', Object.keys(pd))

        // Downloads (PDFs)
        if (Array.isArray(pd.downloads)) {
          for (const dl of pd.downloads) {
            const name = dl.name || dl.title || dl.fileName || 'Document'
            const url = dl.url || dl.downloadUrl || dl.fileUrl || dl.href
            if (url && typeof url === 'string') {
              data.downloads.push({ name: String(name), url })
            }
          }
          console.log('[manufacturer] ✓ downloads:', data.downloads.length)
        }

        // Specs : chercher dans toutes les clés possibles du productDetail
        const specKeys = ['specifications', 'specs', 'technicalData', 'technicalSpecifications',
          'features', 'attributes', 'properties', 'specGroups', 'specificationGroups']
        for (const key of specKeys) {
          if (!pd[key]) continue
          const specData = pd[key]
          // Format 1 : tableau plat [{name, value}]
          if (Array.isArray(specData)) {
            for (const s of specData) {
              if (s.name && s.value != null) {
                data.specs.push({ name: String(s.name), value: String(s.value), group: s.group ? String(s.group) : s.section ? String(s.section) : undefined })
              }
              // Format groupé : { title: "Poids", items: [{name, value}] }
              if (s.title && Array.isArray(s.items)) {
                for (const item of s.items) {
                  if (item.name && item.value != null) {
                    data.specs.push({ name: String(item.name), value: String(item.value), group: String(s.title) })
                  }
                }
              }
              // Format groupé alt : { name: "INFORMATIONS", specifications: [...] }
              if (s.name && Array.isArray(s.specifications)) {
                for (const item of s.specifications) {
                  if (item.name && item.value != null) {
                    data.specs.push({ name: String(item.name), value: String(item.value), group: String(s.name) })
                  }
                }
              }
            }
          }
          // Format 2 : objet { "Poids": [{name, value}], "Puissance": [...] }
          else if (typeof specData === 'object') {
            for (const [groupName, groupSpecs] of Object.entries(specData)) {
              if (Array.isArray(groupSpecs)) {
                for (const s of groupSpecs as Array<Record<string, unknown>>) {
                  if (s.name && s.value != null) {
                    data.specs.push({ name: String(s.name), value: String(s.value), group: groupName })
                  }
                }
              }
            }
          }
          if (data.specs.length > 0) {
            console.log('[manufacturer] ✓ specs from REDUX key "' + key + '":', data.specs.length)
            break
          }
        }

        // Deep search récursif si aucune spec trouvée
        if (data.specs.length === 0) {
          const deepFindSpecs = (obj: unknown, depth = 0, parentKey = ''): void => {
            if (!obj || typeof obj !== 'object' || depth > 6) return
            if (Array.isArray(obj)) {
              // Tableau d'objets avec {name, value} → specs
              if (obj.length >= 2 && obj[0]?.name && obj[0]?.value != null) {
                const looksLikeSpecs = obj.every((item: Record<string, unknown>) =>
                  item.name && item.value != null && String(item.name).length < 80)
                if (looksLikeSpecs) {
                  const group = parentKey.replace(/([A-Z])/g, ' $1').trim()
                  for (const item of obj) {
                    data.specs.push({ name: String(item.name), value: String(item.value), group: group || undefined })
                  }
                  console.log('[manufacturer] ✓ deep-found', obj.length, 'specs under key "' + parentKey + '"')
                }
              }
              for (const item of obj) deepFindSpecs(item, depth + 1, parentKey)
            } else {
              for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
                deepFindSpecs(v, depth + 1, k)
              }
            }
          }
          deepFindSpecs(pd)
          if (data.specs.length > 0) console.log('[manufacturer] ✓ deep search found', data.specs.length, 'specs total')
        }

        // Variants
        if (Array.isArray(pd.variants)) {
          for (const v of pd.variants) {
            const ref = v.modelCode || v.sku || v.reference || v.articleNumber || ''
            const label = v.name || v.title || v.label || v.description || ''
            const properties: Record<string, string> = {}
            if (v.color) properties['Couleur'] = v.color
            if (v.size) properties['Taille'] = v.size
            if (v.packaging) properties['Conditionnement'] = v.packaging
            for (const [k, val] of Object.entries(v)) {
              if (typeof val === 'string' && !['modelCode', 'sku', 'reference', 'articleNumber', 'name', 'title', 'label', 'description', 'color', 'size', 'packaging', 'id', 'agilityId', 'slug', 'url'].includes(k) && val.length < 100) {
                properties[k] = val
              }
            }
            if (ref) data.variants.push({ reference: String(ref), label: String(label), properties })
          }
          console.log('[manufacturer] ✓ variants:', data.variants.length)
        }

        // Images
        if (Array.isArray(pd.assets)) {
          for (const a of pd.assets) {
            const url = a.url || a.src || a.imageUrl || a.original || ''
            if (typeof url === 'string' && /^https?:\/\//.test(url) && /\.(jpe?g|png|webp)/i.test(url)) {
              data.images.push(url)
            }
          }
        } else if (Array.isArray(pd.images)) {
          for (const img of pd.images) {
            const url = typeof img === 'string' ? img : (img?.url || img?.src || '')
            if (typeof url === 'string' && /^https?:\/\//.test(url)) data.images.push(url)
          }
        }
        console.log('[manufacturer] ✓ images:', data.images.length)

        // Description from REDUX
        if (pd.description && typeof pd.description === 'string' && pd.description.length > 30) {
          data.description = pd.description
        }
      }

      // Chercher aussi dans d'autres parties du store (pas juste productDetail)
      if (data.specs.length === 0) {
        for (const topKey of Object.keys(store)) {
          if (topKey === 'productDetail') continue
          const section = store[topKey]
          if (!section || typeof section !== 'object') continue
          // Chercher des tableaux avec {name, value} structure
          for (const [k, v] of Object.entries(section)) {
            if (Array.isArray(v) && v.length >= 3 && v[0]?.name && v[0]?.value != null) {
              for (const item of v as Array<Record<string, unknown>>) {
                if (item.name && item.value != null && String(item.name).length < 80) {
                  data.specs.push({ name: String(item.name), value: String(item.value), group: k })
                }
              }
              if (data.specs.length > 0) {
                console.log('[manufacturer] ✓ specs from REDUX store.' + topKey + '.' + k + ':', data.specs.length)
                break
              }
            }
          }
          if (data.specs.length > 0) break
        }
      }
    } catch (err) {
      console.warn('[manufacturer] REDUX_STORE parse error:', err)
    }
  }

  // ── 2. Parse JSON-LD (schema.org Product) — works for many manufacturer sites ──
  const jsonLdBlocks = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  for (const block of jsonLdBlocks) {
    try {
      let jsonLd = JSON.parse(block[1])
      if (jsonLd['@graph']) jsonLd = jsonLd['@graph']
      const products = Array.isArray(jsonLd) ? jsonLd.filter((x: Record<string, unknown>) => x['@type'] === 'Product') : (jsonLd['@type'] === 'Product' ? [jsonLd] : [])
      for (const product of products) {
        // Description
        if (!data.description && product.description) {
          data.description = String(product.description).replace(/<[^>]+>/g, '').trim()
        }
        // Images
        if (product.image) {
          const imgs = Array.isArray(product.image) ? product.image : [product.image]
          for (const img of imgs) {
            const url = typeof img === 'string' ? img : img?.url || ''
            if (url && /^https?:\/\//.test(url) && !data.images.includes(url)) data.images.push(url)
          }
        }
        // Specs from additionalProperty
        if (Array.isArray(product.additionalProperty)) {
          for (const prop of product.additionalProperty) {
            if (prop.name && prop.value != null) {
              data.specs.push({ name: String(prop.name), value: String(prop.value) })
            }
          }
        }
      }
    } catch { /* invalid JSON-LD */ }
  }

  // ── 3. Parse window.__NEXT_DATA__ (Next.js sites like some Bosch/Makita) ──
  const nextDataMatch = html.match(/window\.__NEXT_DATA__\s*=\s*(\{[\s\S]*?\})(?:\s*<\/script>|;\s*$)/m)
  if (nextDataMatch && data.specs.length === 0) {
    try {
      const nextData = JSON.parse(nextDataMatch[1])
      // Deep search for product specs in Next.js page props
      const findSpecs = (obj: unknown, depth = 0): void => {
        if (!obj || typeof obj !== 'object' || depth > 5) return
        const o = obj as Record<string, unknown>
        if (o.specifications && Array.isArray(o.specifications)) {
          for (const spec of o.specifications as Array<Record<string, unknown>>) {
            if (spec.name && spec.value != null) {
              data.specs.push({
                name: String(spec.name),
                value: String(spec.value),
                group: spec.group ? String(spec.group) : undefined,
              })
            }
          }
        }
        for (const val of Object.values(o)) {
          if (val && typeof val === 'object') findSpecs(val, depth + 1)
        }
      }
      findSpecs(nextData?.props?.pageProps)
    } catch { /* parse error */ }
  }

  // ── 4. Parse HTML DOM pour les specs (tables, dt/dd, accordéons) ──
  if (data.specs.length === 0 && html.length > 1000) {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      // Tables de specs
      const tables = doc.querySelectorAll('table')
      for (const table of tables) {
        const rows = table.querySelectorAll('tr')
        for (const row of rows) {
          const cells = row.querySelectorAll('td, th')
          if (cells.length >= 2) {
            const n = cells[0].textContent?.trim()
            const v = cells[1].textContent?.trim()
            if (n && v && n.length < 80 && v.length < 200 && !/^[-:]+$/.test(n)) {
              data.specs.push({ name: n, value: v })
            }
          }
        }
      }
      // dt/dd pairs
      const dlElements = doc.querySelectorAll('dl')
      for (const dl of dlElements) {
        const dts = dl.querySelectorAll('dt')
        const dds = dl.querySelectorAll('dd')
        const count = Math.min(dts.length, dds.length)
        for (let di = 0; di < count; di++) {
          const n = dts[di].textContent?.trim()
          const v = dds[di].textContent?.trim()
          if (n && v && n.length < 80 && v.length < 200) {
            data.specs.push({ name: n, value: v })
          }
        }
      }
      // Éléments avec class spec-* / attr-* / feature-*
      const labelEls = doc.querySelectorAll('[class*="spec-label"], [class*="spec-name"], [class*="attr-label"], [class*="feature-label"]')
      const valueEls = doc.querySelectorAll('[class*="spec-value"], [class*="spec-data"], [class*="attr-value"], [class*="feature-value"]')
      if (labelEls.length >= 2 && labelEls.length === valueEls.length) {
        for (let di = 0; di < labelEls.length; di++) {
          const n = labelEls[di].textContent?.trim()
          const v = valueEls[di].textContent?.trim()
          if (n && v) data.specs.push({ name: n, value: v })
        }
      }
      if (data.specs.length > 0) console.log('[manufacturer] ✓ specs from HTML DOM:', data.specs.length)
    } catch (err) {
      console.warn('[manufacturer] HTML DOM spec extraction failed:', err)
    }
  }

  // ── 5. Fallback: extract all PDF links from the HTML ──
  if (data.downloads.length === 0) {
    const pdfLinks = [...html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+\.pdf[^"]*)"/gi)]
    for (const m of pdfLinks) {
      const url = m[1]
      const filename = url.split('/').pop()?.split('?')[0] || 'Document.pdf'
      if (!data.downloads.some(d => d.url === url)) {
        data.downloads.push({ name: filename, url })
      }
    }
    console.log('[manufacturer] ✓ PDF links from HTML:', data.downloads.length)
  }

  console.log('[manufacturer] raw data summary:', {
    downloads: data.downloads.length,
    variants: data.variants.length,
    images: data.images.length,
    specs: data.specs.length,
    hasDescription: data.description.length > 0,
  })

  return data
}

/**
 * Construit un EnrichedProduct complet depuis le markdown Jina + les données brutes fabricant.
 * AUCUN appel LLM — tout vient du scraping.
 */
export function buildManufacturerProduct(
  markdownContent: string | null,
  rawData: ManufacturerData,
  productUrl: string,
  additionalSources: string[],
  primaryImages: string[] = [],
): EnrichedProduct {
  console.log('[manufacturer-build] combining markdown + raw data')

  // Specs : priorité aux données REDUX/JSON-LD, enrichies par le markdown
  const mdSpecs = markdownContent ? parseSpecsFromMarkdown(markdownContent) : []
  const rawSpecs = rawData.specs
  // Merge : raw specs first (plus fiables), puis ajouter celles du markdown non dupliquées
  const specsMap = new Map<string, { name: string; value: string; group?: string }>()
  for (const s of rawSpecs) {
    specsMap.set(s.name.toLowerCase().trim(), s)
  }
  for (const s of mdSpecs) {
    const key = s.name.toLowerCase().trim()
    if (!specsMap.has(key)) specsMap.set(key, s)
  }
  const specifications = [...specsMap.values()]

  // Advantages : depuis le markdown uniquement (les bullet points)
  const advantages = markdownContent ? parseAdvantagesFromMarkdown(markdownContent) : []

  // Description : REDUX > markdown (avec filtrage du cookie/GDPR banner)
  let description = rawData.description || ''
  if (description && (isGarbageContent(description) || isMainlyGarbage(description))) {
    console.log('[manufacturer-build] garbage description from REDUX, clearing')
    description = ''
  }
  if (!description || description.length < 30) {
    const mdDesc = markdownContent ? parseDescriptionFromMarkdown(markdownContent) : ''
    // Vérifier que la description markdown n'est pas du contenu parasite
    if (mdDesc && !isGarbageContent(mdDesc) && !isMainlyGarbage(mdDesc)) description = mdDesc
  }
  // Si la description est vide, prendre le H1 du markdown
  if (!description || description.length < 20) {
    const h1Match = markdownContent?.match(/^#\s+(.+)/m)
    if (h1Match) description = h1Match[1].replace(/\*\*/g, '').trim()
  }

  // Variants : REDUX > markdown
  let variants = rawData.variants
  if (variants.length === 0 && markdownContent) {
    variants = parseVariantsFromMarkdown(markdownContent)
  }

  // Images : primaires (og:image / twitter:image / JSON-LD / link image_src) en tête,
  // puis markdown (Jina injected + inline + summary), puis REDUX. Dédupliquées.
  const mdImages = markdownContent ? parseImagesFromMarkdown(markdownContent) : []
  const imgSeen = new Set<string>()
  const images: string[] = []
  for (const url of [...primaryImages, ...mdImages, ...rawData.images]) {
    if (!imgSeen.has(url)) { imgSeen.add(url); images.push(url) }
  }
  console.log('[manufacturer-build] images:', images.length, '(primary:', primaryImages.length, ', md:', mdImages.length, ', redux:', rawData.images.length, ')')

  // Documents : Jina injected > REDUX downloads > PDFs du markdown
  const documents: string[] = []
  // D'abord : extraire depuis le bloc JINA_EXTRACTED_DOWNLOADS injecté par le script
  if (markdownContent) {
    const dlStart = markdownContent.indexOf('JINA_EXTRACTED_DOWNLOADS_START')
    const dlEnd = markdownContent.indexOf('JINA_EXTRACTED_DOWNLOADS_END')
    if (dlStart >= 0 && dlEnd > dlStart) {
      const dlBlock = markdownContent.slice(dlStart + 'JINA_EXTRACTED_DOWNLOADS_START'.length, dlEnd)
      for (const line of dlBlock.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const pipeIdx = trimmed.indexOf(' | ')
        if (pipeIdx > 0) {
          const name = trimmed.slice(0, pipeIdx).trim()
          const url = trimmed.slice(pipeIdx + 3).trim()
          if (url) documents.push(`${name}##${url}`)
        } else if (/^https?:\/\//.test(trimmed)) {
          documents.push(trimmed)
        }
      }
      console.log('[manufacturer-build] ✓ Jina injected downloads:', documents.length)
    }
  }
  // Fallback : REDUX downloads
  if (documents.length === 0) {
    for (const dl of rawData.downloads) {
      const titledDoc = `${dl.name}##${dl.url}`
      documents.push(titledDoc)
    }
  }
  // Ajouter les PDFs du markdown qui ne sont pas déjà dans les downloads
  if (markdownContent) {
    const mdPdfUrls = [...markdownContent.matchAll(/https?:\/\/[^\s)"'\]]+\.pdf[^\s)"'\]]*/gi)].map(m => m[0])
    const existingUrls = new Set(rawData.downloads.map(d => d.url))
    for (const url of mdPdfUrls) {
      if (!existingUrls.has(url)) documents.push(url)
    }
    // Liens titrés [titre](url.pdf) du markdown
    const mdLinks = [...markdownContent.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+\.pdf[^\s)]*)\)/gi)]
    for (const m of mdLinks) {
      const url = m[2].trim()
      if (!existingUrls.has(url) && !documents.includes(url)) {
        documents.push(`${m[1].trim()}##${url}`)
      }
    }
  }

  console.log('[manufacturer-build] result:', {
    specs: specifications.length,
    advantages: advantages.length,
    variants: variants.length,
    images: images.length,
    documents: documents.length,
    descLen: description.length,
  })

  return {
    description,
    advantages,
    specifications,
    variants,
    images: [...new Set(images)],
    documents: deduplicateDocuments(documents),
    sourceUrl: productUrl,
    additionalSources,
    generatedAt: Date.now(),
    scrapingProvider: 'Jina + Fabricant (scraping direct)',
    llmProvider: undefined,
    llmModel: undefined,
  }
}
