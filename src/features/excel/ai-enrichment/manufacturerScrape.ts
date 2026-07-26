// Enrichissement depuis le site OFFICIEL du fabricant : détection du domaine,
// scraping profond de la fiche, puis construction du produit enrichi.
//
// Pourquoi un chemin dédié : la page fabricant est la source la plus fidèle
// (specs complètes, notices PDF, visuels HD) mais la plus hostile — pagination
// d'onglets, specs derrière des accordéons, anti-bot. Les replis successifs et
// les cas par domaine encodent des sites réels ; chacun vient d'une fiche qui
// sortait incomplète.
//
// Voir le skill `scraping-pipeline` avant d'y toucher.
import { debugLog } from '@/lib/debugLog'
import { getApiKey } from '@/lib/apiKeys'
import { jinaScrapeMarkdown } from './jinaScrape'
import { sanitizeJinaMarkdown } from './markdownSanitize'
import { parseBreadcrumbFromMarkdown, parseImagesFromMarkdown } from './markdownParsers'
import { buildIdentity } from './liftIdentity'
import { isJunkImageUrl } from './imageFilter'
import { buildDocument } from './documentUtils'
import { isGarbageContent, isMainlyGarbage } from '@/features/scraping/core/parsers/garbageFilter'
import { parseSpecsFromMarkdown } from '@/features/scraping/core/parsers/parseSpecifications'
import { parseVariantsFromMarkdown } from './markdownParsers'
import { extractPrimarySourceSection } from './scrapeBundle'
import { parseDescriptionFromMarkdown } from '@/features/scraping/core/parsers/parseDescription'
import { isNonProductRegion, isSaneSpecPair } from '@/features/scraping/core/parsers/parseSpecifications'
import { parseAdvantagesFromMarkdown, parseAdvantagesFromHtml, mergeAdvantagesAdditive } from '@/features/scraping/core/parsers/parseAdvantages'
import { parseIcecatGtin } from '@/features/scraping/core/parsers/parseIcecatGtin'
import { extractProductScope, productScopeText } from '@/features/scraping/core/parsers/productScope'
import { normalizeSpecPairs } from '@/features/scraping/core/parsers/normalizeSpecPairs'
import { filterImagesByProductRef } from '@/features/scraping/core/parsers/filterImagesByRef'
import { parseNamedDocLinks } from '@/features/scraping/core/parsers/parseNamedDocLinks'
import { recordScrapeUsage } from '@/features/stats/aiUsageTracking'
import type { StructuredProductData } from '@/features/scraping/core/structuredData'
import type { EnrichedProduct, EnrichedDocument, Pricing } from './types'

// ── Détection site fabricant officiel ────────────────────────────────────────

/** Domaines connus des sites fabricants officiels (clé = slug marque). */
export const MANUFACTURER_DOMAINS: Record<string, string[]> = {
  milwaukee:  ['milwaukeetool.eu', 'milwaukeetool.com'],
  ryobi:      ['ryobitools.eu', 'ryobitools.com'],
  aeg:        ['aeg-powertools.eu'],
  dewalt:     ['dewalt.fr', 'dewalt.com', 'dewalt.eu'],
  makita:     ['makita.fr', 'makita.com'],
  bosch:      ['bosch-professional.com', 'bosch-home.fr'],
  metabo:     ['metabo.com'],
  hikoki:     ['hikoki-powertools.fr', 'hikoki-powertools.com'],
  festool:    ['festool.fr', 'festool.com'],
  stihl:      ['stihl.fr', 'stihl.com'],
  husqvarna:  ['husqvarna.com'],
  stanley:    ['stanleyoutillage.fr', 'stanleytools.com'],
  karcher:    ['kaercher.com'],
  einhell:    ['einhell.fr', 'einhell.com'],
  flex:       ['flex-tools.com'],
  worx:       ['worx.com'],
  hilti:      ['hilti.fr', 'hilti.com'],
  facom:      ['facom.fr', 'facom.com'],
}

/** Retourne le slug de la marque si l'URL est un site fabricant officiel, null sinon. */
export function detectManufacturerSite(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    for (const [brand, domains] of Object.entries(MANUFACTURER_DOMAINS)) {
      if (domains.some(d => host === d || host.endsWith('.' + d))) return brand
    }
    return null
  } catch { return null }
}

// ── Scraping avancé des sites fabricants (REDUX store, embedded data) ────────

export interface ManufacturerData {
  downloads: Array<{ name: string; url: string }>
  variants: Array<{ reference: string; label: string; properties: Record<string, string> }>
  images: string[]
  specs: Array<{ name: string; value: string; group?: string }>
  description: string
  breadcrumb: string[]
  /** Texte de la ZONE PRODUIT du DOM (liste blanche `extractProductScope`) —
   *  fourni en PRIORITÉ au LLM : le header/footer/login/CGV n'y existent pas
   *  par construction. Absent quand le scope n'est pas identifiable. */
  productScopeText?: string
  /** URLs d'images dont la PROVENANCE dit que ce sont des pictos/badges
   *  (ex: REDUX `standardsFeaturesIcons` chez TTI — Ryobi/Milwaukee/AEG :
   *  badges Garantie, Brushless, labels énergie). Signal plus fiable que
   *  l'heuristique URL : pré-remplit `imageClassOverrides`. */
  pictoUrls: string[]
  /** Avantages parsés depuis le HTML STATIQUE (listes complètes même quand le
   *  rendu navigateur replie la section « Voir plus » ou qu'un markdown de
   *  cache tronqué est resservi). Fusion ADDITIVE en aval, jamais remplaçante. */
  advantages: Array<{ text: string; group?: string }>
  /** Données structurées JSON-LD/microdata du HTML fabricant (prix `offers`,
   *  gtin/mpn, description) — source DÉTERMINISTE prioritaire pour le prix
   *  constructeur (RRP) et la clé de correspondance EAN. */
  structured: StructuredProductData | null
}


interface DeepScrapeResult {
  markdown: string
  html: string | null
  source: 'post-browser' | 'get-fallback' | 'basic-merged'
}

/**
 * Scrape optimisé pour les sites fabricants via Jina Reader.
 * Utilise des headers avancés (X-Wait-For-Selector, X-Target-Selector, X-Engine)
 * pour forcer le rendu complet des accordéons / sections dynamiques.
 */
export async function jinaScrapeMaufacturerPage(pageUrl: string): Promise<DeepScrapeResult | null> {
  debugLog('[jina-manufacturer] deep scraping →', pageUrl)

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
  // ── Zones hors-produit : ne JAMAIS y cliquer ni les déplier ──
  // Header/nav/footer, overlay de recherche, store locator, mini-panier,
  // newsletter, cookies : les déplier fait entrer leurs textes dans le
  // markdown (suggestions de recherche, CGV, adresses) qui deviennent de
  // fausses specs en aval. Signal par STRUCTURE, jamais par site.
  var NOISE_ZONES = 'header, footer, nav, aside, [role="search"], [role="navigation"], [role="banner"], [role="contentinfo"], [class*="footer" i], [id*="footer" i], [class*="search-" i], [class*="-search" i], [id*="search" i], [class*="locator" i], [class*="minicart" i], [class*="newsletter" i], [class*="cookie" i], [class*="consent" i]';
  function inNoiseZone(el) {
    try { return !!(el.closest && el.closest(NOISE_ZONES)); } catch(e) { return false; }
  }

  // ── Ouvrir les accordéons classiques (universel, tout type de site) ──
  function expandAll() {
    var sels = [
      '[aria-expanded="false"]',
      '[data-toggle="collapse"]', '[data-bs-toggle="collapse"]',
      '.accordion-header', '.accordion__header', '.accordion-trigger',
      '.accordion-button.collapsed',
      'details:not([open]) > summary',
      '[role="tab"][aria-selected="false"]', '[role="tab"]:not([aria-selected="true"])',
      '[class*="accordion"] button', '[class*="collapse"] button',
      '.tab-link:not(.active)', '[class*="tab-button"]:not(.active)',
      '[class*="spec"] [class*="toggle"]', '[class*="spec"] [class*="expand"]',
      '[class*="tab-item"]:not(.active)', '[data-tab]:not(.active)',
      '.expandable:not(.expanded)', '[class*="show-more"]', '[class*="read-more"]',
      '[class*="collapsible"] [class*="header"]', '[class*="panel-heading"]',
      'button[class*="more"]', 'a[class*="more"]'
    ];
    sels.forEach(function(sel) {
      try { document.querySelectorAll(sel).forEach(function(el) { if (inNoiseZone(el)) return; try { el.click(); } catch(e) {} }); } catch(e) {}
    });
    document.querySelectorAll('details:not([open])').forEach(function(d) { if (inNoiseZone(d)) return; d.setAttribute('open', ''); });
    // Ouvrir tous les contenus cachés (accordéons, onglets, sections repliées)
    var hiddenSels = [
      '.collapse:not(.show)', '[class*="accordion-content"]', '[class*="accordion__content"]',
      '[class*="tab-panel"][hidden]', '[class*="tab-pane"]:not(.active)',
      '[class*="panel-body"][style*="display: none"]', '[class*="panel-body"][style*="display:none"]',
      '[role="tabpanel"][hidden]', '[role="tabpanel"][aria-hidden="true"]',
      '[class*="collapsible-content"]', '[class*="expandable-content"]',
      '[class*="spec"][style*="display: none"]', '[class*="spec"][style*="display:none"]',
      '[class*="hidden-content"]', '[class*="more-content"]',
      '[data-expanded="false"]', '[aria-hidden="true"][class*="panel"]'
    ];
    hiddenSels.forEach(function(sel) {
      try {
        document.querySelectorAll(sel).forEach(function(el) {
          if (inNoiseZone(el)) return;
          el.style.display = 'block'; el.style.height = 'auto'; el.style.overflow = 'visible';
          el.style.maxHeight = 'none'; el.style.opacity = '1'; el.style.visibility = 'visible';
          el.classList.add('show', 'in', 'active'); el.classList.remove('collapsed', 'hidden', 'hide');
          el.removeAttribute('hidden'); el.setAttribute('aria-hidden', 'false');
        });
      } catch(e) {}
    });
  }

  // ── Navigation séquentielle des onglets (appelée à chaque tick du polling) ──
  var _tabClickIdx = 0;
  function cycleTabs() {
    var tabSels = [
      '[role="tab"]',
      '.nav-link[data-toggle="tab"]', '.nav-link[data-bs-toggle="tab"]',
      '.tab-link', '[class*="tab-button"]', '[class*="tab-trigger"]',
      '[class*="tab-item"] a', '[class*="tab-item"] button',
      '[data-tab]', '.tabs__link', '.product-tabs a', '.product-tab'
    ];
    var allTabs = [];
    tabSels.forEach(function(sel) {
      try {
        document.querySelectorAll(sel).forEach(function(el) {
          if (inNoiseZone(el)) return;
          if (allTabs.indexOf(el) === -1) allTabs.push(el);
        });
      } catch(e) {}
    });
    if (allTabs.length > 1 && _tabClickIdx < allTabs.length) {
      try { allTabs[_tabClickIdx].click(); } catch(e) {}
      _tabClickIdx++;
      // Forcer TOUS les panneaux d'onglets à rester visibles après le clic
      setTimeout(function() {
        var panelSels = [
          '[role="tabpanel"]', '[class*="tab-pane"]', '[class*="tab-content"] > *',
          '[class*="tab-panel"]', '[class*="product-tab-content"]'
        ];
        panelSels.forEach(function(sel) {
          try {
            document.querySelectorAll(sel).forEach(function(el) {
              if (inNoiseZone(el)) return;
              el.style.display = 'block';
              el.style.visibility = 'visible';
              el.style.height = 'auto';
              el.style.opacity = '1';
              el.style.overflow = 'visible';
              el.removeAttribute('hidden');
              el.setAttribute('aria-hidden', 'false');
            });
          } catch(e) {}
        });
      }, 150);
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

  // Exécution immédiate : accordéons + premier onglet
  expandAll();
  cycleTabs();

  // Polling : attendre que le framework SPA soit prêt (max 10s)
  // Chaque tick : expand accordéons + cliquer l'onglet suivant + tenter extraction
  var attempts = 0;
  var interval = setInterval(function() {
    attempts++;
    expandAll();
    cycleTabs();
    if (tryExtractSPA() || attempts > 50) {
      clearInterval(interval);
    }
  }, 200);
})();
`

  try {
    const jinaKey = getApiKey('jina')
    if (!jinaKey) {
      console.warn('[jina-manufacturer] ⚠ no Jina API key — falling back to basic scrape')
      const fallbackMd = await jinaScrapeMarkdown(pageUrl)
      return fallbackMd ? { markdown: fallbackMd, html: null, source: 'get-fallback' as const } : null
    }

    // POST avec injectPageScript pour exécuter le JS d'expansion des accordéons
    debugLog('[jina-manufacturer] POST with injectPageScript to expand accordions')
    const res = await fetch('https://r.jina.ai/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${jinaKey}`,
        'X-Engine': 'browser',
        'X-Timeout': '60',
        'X-No-Cache': 'true',
        'X-With-Links-Summary': 'all',
        'X-With-Images-Summary': 'all',
        'X-With-Iframe': 'true',
        'X-With-Shadow-Dom': 'true',
        'X-Return-Format': 'html,markdown',
      },
      body: JSON.stringify({
        url: pageUrl,
        injectPageScript: [EXPAND_ACCORDIONS_SCRIPT],
      }),
    })

    if (!res.ok) {
      console.warn('[jina-manufacturer] POST HTTP error', res.status, '— falling back to GET then basic')
      // Fallback : essayer GET classique sans JS injection
      return jinaScrapeMaufacturerPageFallback(pageUrl, jinaKey)
    }

    const json = await res.json() as { data?: { content?: string; html?: string; links?: Record<string, string>; images?: Record<string, string> } }
    let md = json?.data?.content || ''
    const postImages = json?.data?.images
    const postLinks = json?.data?.links
    const capturedHtml: string | null = json?.data?.html ?? null

    if (!md || md.length < 100) {
      console.warn('[jina-manufacturer] POST returned empty content — falling back to GET')
      return jinaScrapeMaufacturerPageFallback(pageUrl, jinaKey)
    }

    // Nettoyage complet : cookies, nav top RS-like, facettes, pricing tables…
    // Sans ça, le markdown POST conserve les liens nav concaténés
    // ("Nos servicesLe blog RSAide & Contact") et la ligne métadonnées
    // ("Code commande RS:… Référence fabricant:…") qui empoisonnent
    // parseDescriptionFromMarkdown en aval.
    md = sanitizeJinaMarkdown(md)

    debugLog('[jina-manufacturer] POST got', md.length, 'chars (with JS accordion expand)')
    recordScrapeUsage({ platform: 'jina', tokens: Math.round(md.length / 4) })

    // Injecter images et documents PDF depuis le JSON response
    if (postImages && typeof postImages === 'object') {
      const imgEntries = Object.entries(postImages).filter(([, url]) => typeof url === 'string' && url.startsWith('http'))
      if (imgEntries.length > 0 && md.indexOf('JINA_EXTRACTED_IMAGES_START') === -1) {
        md += '\n\nJINA_EXTRACTED_IMAGES_START\n' + imgEntries.map(([, url]) => url).join('\n') + '\nJINA_EXTRACTED_IMAGES_END'
        debugLog('[jina-manufacturer] ✓ injected', imgEntries.length, 'images from POST JSON')
      }
    }
    if (postLinks && typeof postLinks === 'object') {
      const DOC_EXT = /\.(pdf|docx?|xlsx?)(\?[^"']*)?$/i
      const docEntries = Object.entries(postLinks).filter(([, href]) => DOC_EXT.test(href))
      if (docEntries.length > 0 && md.indexOf('JINA_EXTRACTED_DOWNLOADS_START') === -1) {
        md += '\n\nJINA_EXTRACTED_DOWNLOADS_START\n' + docEntries.map(([title, url]) => `${title}##${url}`).join('\n') + '\nJINA_EXTRACTED_DOWNLOADS_END'
        debugLog('[jina-manufacturer] ✓ injected', docEntries.length, 'documents from POST JSON')
      }
    }

    const deepSpecs = parseSpecsFromMarkdown(md).length
    const deepAdvs = parseAdvantagesFromMarkdown(md).length
    debugLog('[jina-manufacturer] POST scrape quality:', { specs: deepSpecs, advantages: deepAdvs })

    // TOUJOURS fusionner avec le GET JSON pour avoir un maximum de données
    // Le POST capture les accordéons expandés, le GET capture la structure + images JSON
    const basicMd = await jinaScrapeMarkdown(pageUrl)
    if (basicMd) {
      const basicSpecs = parseSpecsFromMarkdown(basicMd).length
      const basicAdvs = parseAdvantagesFromMarkdown(basicMd).length
      debugLog('[jina-manufacturer] basic scrape quality:', { specs: basicSpecs, advantages: basicAdvs })
      // Fusionner les deux sources (dédoublonner specs au moment du parsing)
      if (basicMd.length > 200) {
        md = md + '\n\n' + basicMd
        debugLog('[jina-manufacturer] ✓ merged POST + JSON →', md.length, 'chars')
      }
    }

    return { markdown: md, html: capturedHtml, source: 'post-browser' as const }
  } catch (err) {
    console.warn('[jina-manufacturer] POST scrape failed:', err)
    const fallbackMd = await jinaScrapeMarkdown(pageUrl)
    return fallbackMd ? { markdown: fallbackMd, html: null, source: 'get-fallback' as const } : null
  }
}

/** Fallback GET pour le scraping fabricant (sans injection JS) — utilise le mode JSON */
async function jinaScrapeMaufacturerPageFallback(pageUrl: string, _jinaKey: string): Promise<DeepScrapeResult | null> {
  // Réutilise jinaScrapeMarkdown qui est déjà en mode JSON avec images/links
  debugLog('[jina-manufacturer-fallback] falling back to JSON mode scrape')
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
  debugLog('[manufacturer] fetching raw HTML →', pageUrl)
  const data: ManufacturerData = { downloads: [], variants: [], images: [], specs: [], description: '', breadcrumb: [], pictoUrls: [], advantages: [], structured: null }

  // Voie principale : Cloud Function `fetchPageHtml` (serveur, pas de CORS),
  // avec les proxies publics en filet — les proxies seuls sont morts depuis
  // 2026-06 (allorigins 522, corsproxy sans ACAO), ce qui laissait TOUT le
  // path fabricant sans HTML (ni breadcrumb, ni specs DOM, ni JSON-LD).
  let html = ''
  try {
    const { fetchSourceHtml } = await import('@/features/scraping-templates/fetchSourceHtml')
    html = (await fetchSourceHtml(pageUrl)) ?? ''
    if (html) debugLog('[manufacturer] HTML fetched:', html.length, 'chars')
  } catch (err) {
    console.warn('[manufacturer] fetchSourceHtml failed:', err)
  }

  if (!html || html.length < 1000) {
    debugLog('[manufacturer] no HTML available (CF + proxies down)')
    return data
  }

  // ── 0−. Données structurées JSON-LD/microdata (prix RRP, gtin, description) ──
  try {
    const { parseStructuredDataAny } = await import('@/features/scraping/core/structuredData')
    data.structured = parseStructuredDataAny(html)
    if (data.structured?.offers?.price != null) {
      debugLog('[manufacturer] ✓ JSON-LD price (RRP):', data.structured.offers.price, data.structured.offers.priceCurrency)
    }
    if (data.structured?.gtin) debugLog('[manufacturer] ✓ JSON-LD gtin:', data.structured.gtin)
  } catch (err) {
    console.warn('[manufacturer] structured data parse failed:', err)
  }

  // ── 0. Breadcrumb depuis HTML (nav>ol/ul, BreadcrumbList microdata, etc.) ──
  try {
    const { extractBreadcrumbFromHtml } = await import('@/features/scraping/useJina')
    const items = extractBreadcrumbFromHtml(html)
    if (items.length > 0) {
      data.breadcrumb = items
      debugLog('[manufacturer] ✓ breadcrumb from HTML:', items)
    }
  } catch (err) {
    console.warn('[manufacturer] breadcrumb extraction failed:', err)
  }

  // ── 0bis. ZONE PRODUIT (liste blanche) + avantages depuis le HTML statique ──
  // Universalité par CONSTRUCTION : les avantages sont d'abord cherchés dans la
  // zone produit scopée (header/footer/login/CGV hors-scope) ; repli page
  // entière si le scope est introuvable ou n'en donne aucun (jamais moins
  // qu'avant). Le texte du scope est aussi fourni au LLM (PATH B).
  const scopeHtml = extractProductScope(html)
  if (scopeHtml) {
    data.productScopeText = productScopeText(scopeHtml)
    debugLog('[manufacturer] ✓ product scope:', scopeHtml.length, 'chars (page:', html.length, ')')
  }
  data.advantages = scopeHtml ? parseAdvantagesFromHtml(scopeHtml) : []
  if (data.advantages.length === 0) data.advantages = parseAdvantagesFromHtml(html)
  if (data.advantages.length > 0) {
    debugLog('[manufacturer] ✓ advantages from HTML:', data.advantages.length)
  }

  // ── 0ter. EAN depuis le widget Icecat Live (plateforme standard) ──
  // Poussé en paire spec « EAN » : liftIdentityFromSpecs la remonte en identité
  // (et la retire des specs) — souvent le SEUL EAN fiable quand le JSON-LD
  // recopie le sku interne (cf. parseIcecatGtin).
  const icecatGtin = parseIcecatGtin(html)
  if (icecatGtin) {
    data.specs.push({ name: 'EAN', value: icecatGtin })
    debugLog('[manufacturer] ✓ EAN from Icecat widget:', icecatGtin)
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
        debugLog('[manufacturer] REDUX_STORE.productDetail found — keys:', Object.keys(pd))

        // Downloads (PDFs)
        if (Array.isArray(pd.downloads)) {
          for (const dl of pd.downloads) {
            const name = dl.name || dl.title || dl.fileName || 'Document'
            const url = dl.url || dl.downloadUrl || dl.fileUrl || dl.href
            if (url && typeof url === 'string') {
              data.downloads.push({ name: String(name), url })
            }
          }
          debugLog('[manufacturer] ✓ downloads:', data.downloads.length)
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
            debugLog('[manufacturer] ✓ specs from REDUX key "' + key + '":', data.specs.length)
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
                  debugLog('[manufacturer] ✓ deep-found', obj.length, 'specs under key "' + parentKey + '"')
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
          if (data.specs.length > 0) debugLog('[manufacturer] ✓ deep search found', data.specs.length, 'specs total')
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
          debugLog('[manufacturer] ✓ variants:', data.variants.length)
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
        debugLog('[manufacturer] ✓ images:', data.images.length)

        // Description from REDUX
        if (pd.description && typeof pd.description === 'string' && pd.description.length > 30) {
          data.description = pd.description
        }

        // Pictos/badges par PROVENANCE : les plateformes TTI (Ryobi, Milwaukee,
        // AEG) séparent la galerie (`assets`) des icônes marketing
        // (`standardsFeaturesIcons` : Garantie 2 ans, Brushless, labels
        // énergie, Home Index…). Tout imageUrl trouvé sous ces clés est un
        // picto CERTAIN — bien plus fiable que l'heuristique sur l'URL.
        const PICTO_SOURCE_KEYS = ['standardsFeaturesIcons', 'featureIcons', 'certificationIcons', 'standardsIcons', 'badges']
        const collectImageUrls = (obj: unknown, depth = 0): string[] => {
          if (!obj || typeof obj !== 'object' || depth > 4) return []
          const out: string[] = []
          if (Array.isArray(obj)) {
            for (const item of obj) out.push(...collectImageUrls(item, depth + 1))
            return out
          }
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            if (typeof v === 'string' && /^https?:\/\//.test(v) && /image|icon/i.test(k)) {
              out.push(v)
            } else if (v && typeof v === 'object') {
              out.push(...collectImageUrls(v, depth + 1))
            }
          }
          return out
        }
        for (const key of PICTO_SOURCE_KEYS) {
          if (pd[key]) data.pictoUrls.push(...collectImageUrls(pd[key]))
        }
        data.pictoUrls = [...new Set(data.pictoUrls)]
        if (data.pictoUrls.length > 0) {
          debugLog('[manufacturer] ✓ picto/badge URLs (provenance):', data.pictoUrls.length)
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
                debugLog('[manufacturer] ✓ specs from REDUX store.' + topKey + '.' + k + ':', data.specs.length)
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

  // ── 2bis. Parser canonique structuredData (gère ProductGroup.hasVariant,
  //     microdata, entités HTML) — couvre les schémas que la passe maison
  //     ci-dessus rate (Milwaukee/TTI : les Product sont dans hasVariant).
  if (data.specs.length === 0) {
    try {
      const { parseStructuredDataAny } = await import('@/features/scraping/core/structuredData')
      const sd = parseStructuredDataAny(html)
      if (sd) {
        for (const s of sd.specs) data.specs.push({ name: s.name, value: s.value })
        if (!data.description && sd.description) data.description = sd.description
        for (const img of sd.images) {
          if (!data.images.includes(img)) data.images.push(img)
        }
        if (sd.specs.length > 0) debugLog('[manufacturer] ✓ specs from structured-data (hasVariant aware):', sd.specs.length)
      }
    } catch (err) {
      console.warn('[manufacturer] structured-data parse failed:', err)
    }
  }

  // ── 2ter. Images depuis le HTML brut (source DÉTERMINISTE) — l'imagesMap Jina
  //     varie selon le rendu JS ; le HTML, lui, porte toujours les <img>/og:image.
  //     ADDITIF : on complète data.images, on ne retire jamais. Décodage entités
  //     (&amp;) + dé-vignettage gérés dans le parser. isJunkImageUrl écarte les
  //     pictos/logos ; filterImagesByProductRef isolera la galerie en aval. ──
  try {
    const { parseImagesFromHtml, expandSceneSevenGallery } = await import('@/features/scraping/core/parsers/parseImagesFromHtml')
    // Galerie Adobe Scene7/Dynamic Media : les vues du carrousel (REF_A1…An)
    // sont des assets SANS extension jamais rendus en <img> — leurs noms sont
    // dans le HTML, on reconstruit leurs URLs depuis l'asset og:image.
    const parsed = expandSceneSevenGallery(html, parseImagesFromHtml(html))
    let added = 0
    for (const img of parsed) {
      if (!isJunkImageUrl(img) && !data.images.includes(img)) { data.images.push(img); added++ }
    }
    if (added > 0) debugLog('[manufacturer] ✓ images from raw HTML:', added)
  } catch (err) {
    console.warn('[manufacturer] HTML image parse failed:', err)
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
      // Tables de specs — jamais dans les régions hors-produit (header/footer/
      // nav/recherche/store locator) : sur une page rendue « tout dépliée »,
      // le footer fournit des paires plausibles (adresses, moyens de paiement).
      const tables = doc.querySelectorAll('table')
      for (const table of tables) {
        if (isNonProductRegion(table)) continue
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
        if (isNonProductRegion(dl)) continue
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
          if (isNonProductRegion(labelEls[di])) continue
          const n = labelEls[di].textContent?.trim()
          const v = valueEls[di].textContent?.trim()
          if (n && v) data.specs.push({ name: n, value: v })
        }
      }
      // Makita / sites avec convention "techspecs--row-*".
      // Pairing par ROW container (parent commun) — pas index global, car les
      // selectors `.row-specification` et `.row-value` n'ont pas le même count
      // (Makita : 27 labels vs 17 values à cause de variantes type `.row-specification-info`).
      const techRows = doc.querySelectorAll('[class*="techspecs--row"][class*="row-content"], [class~="techspecs--row"]')
      let techCount = 0
      const seenRows = new Set<Element>()
      for (const row of techRows) {
        if (seenRows.has(row)) continue
        if (isNonProductRegion(row)) continue
        seenRows.add(row)
        const label = row.querySelector('[class*="techspecs--row-specification"]:not([class*="info"]), [class*="techspec-name"], [class*="techspec-label"]')
        const value = row.querySelector('[class*="techspecs--row-value"], [class*="techspec-value"], [class*="techspec-data"]')
        if (!label || !value) continue
        const n = label.textContent?.trim()
        const hasCheckIcon = !!value.querySelector('i[class*="fa-check"], i[class*="check"], svg[class*="check"], [class*="checkmark"]')
        const v = value.textContent?.trim() || (hasCheckIcon ? 'Oui' : '')
        if (n && v) {
          data.specs.push({ name: n, value: v })
          techCount++
        }
      }
      if (techCount > 0) debugLog('[manufacturer] ✓ specs from techspecs HTML rows:', techCount)

      // ── Tables de specs en <div> (convention body-row / body-cell) ──
      // Beaucoup de fabricants (Bosch Professional & co) rendent la fiche
      // technique dans une grille <div class="…body-row"><div class="…body-cell">
      // <span>Nom</span></div><div class="…body-cell"><span>Valeur</span></div>
      // — invisible aux parsers <table>/<dl>/techspecs. Générique par convention
      // de classe. SCOPÉ à la section « caractéristiques techniques » : sans ce
      // scope, d'autres grilles body-row (adresse fabricant, blocs marketing)
      // entrent comme fausses specs. Signal par heading, pas par site.
      const SPEC_SECTION_RE = /caract[eé]ristiques?\s*techniques?|donn[eé]es?\s*techniques?|fiche\s*technique|sp[eé]cifications?|technical\s*data|technische\s*daten|dati\s*tecnici|especificaciones|technische\s*gegevens/i
      const specRoots: Element[] = []
      for (const h of doc.querySelectorAll('h1, h2, h3, h4')) {
        if (!SPEC_SECTION_RE.test(h.textContent || '')) continue
        // Remonter jusqu'au conteneur qui englobe la table de la section.
        let root: Element | null = h.parentElement
        for (let i = 0; i < 4 && root; i++) {
          if (root.querySelector('[class*="body-row"]')) break
          root = root.parentElement
        }
        if (root && !specRoots.includes(root)) specRoots.push(root)
      }
      let divCount = 0
      const seenDiv = new Set<string>()
      for (const root of specRoots) {
        for (const row of root.querySelectorAll('[class*="body-row"]')) {
          if (isNonProductRegion(row)) continue
          const cells = row.querySelectorAll('[class*="body-cell"]')
          if (cells.length < 2) continue
          const n = (cells[0].textContent || '').replace(/\s+/g, ' ').trim()
          const v = (cells[1].textContent || '').replace(/\s+/g, ' ').trim()
          // Libellé court, valeur bornée, nom ≠ valeur, non dupliqué.
          if (!n || !v || n.length > 80 || v.length > 200 || n === v) continue
          const key = n.toLowerCase()
          if (seenDiv.has(key)) continue
          seenDiv.add(key)
          data.specs.push({ name: n, value: v })
          divCount++
        }
      }
      if (divCount > 0) debugLog('[manufacturer] ✓ specs from <div> table rows:', divCount)

      if (data.specs.length > 0) debugLog('[manufacturer] ✓ specs from HTML DOM:', data.specs.length)
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
    debugLog('[manufacturer] ✓ PDF links from HTML:', data.downloads.length)
  }

  debugLog('[manufacturer] raw data summary:', {
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
/** Déduplique les documents par URL normalisée. */
function deduplicateDocuments(docs: EnrichedDocument[]): EnrichedDocument[] {
  const seen = new Set<string>()
  const result: EnrichedDocument[] = []
  for (const doc of docs) {
    const normalized = doc.url.replace(/\/+$/, '').toLowerCase()
    if (!seen.has(normalized)) {
      seen.add(normalized)
      result.push(doc)
    }
  }
  return result
}

/** Extrait le sous-titre produit : la première ligne courte qui suit un H1
 *  (en sautant la ligne-référence SKU), avant la description longue.
 *  Ex Makita : `# Perceuse visseuse d'angle LXT ®` → `DDA351RTJ` (skip) →
 *  `18 V Li-Ion - 5 Ah - Ø 10 mm - Auto-serrant` (← sous-titre). */
function extractSubtitleFromMarkdown(md: string): string | undefined {
  const SKU_RE = /^[A-Z][A-Z0-9][A-Z0-9./-]{2,18}$/
  const lines = md.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!/^#\s+/.test(lines[i])) continue
    let scanned = 0
    for (let j = i + 1; j < lines.length && scanned < 5; j++) {
      const t = lines[j].trim()
      if (!t) continue
      scanned++
      if (SKU_RE.test(t)) continue            // ligne référence — pas le sous-titre
      if (/^#{1,5}\s|^[!\[*>|-]|https?:\/\//.test(t)) break  // heading/lien/image/bullet → pas de sous-titre ici
      // Sous-titre plausible : court, pas une phrase terminée par un point,
      // avec un signal "fiche produit" (chiffre+unité ou séparateurs " - ").
      if (t.length >= 8 && t.length <= 100 && !/[.!?]$/.test(t)
          && (/\d/.test(t) || / - /.test(t))) {
        return t
      }
      break // 1re ligne candidate non conforme → ce H1 n'a pas de sous-titre
    }
  }
  return undefined
}

/** Extrait les pictogrammes d'équipement : section dont le heading contient
 *  "Symbols"/"Symboles"/"Pictogrammes" (ex Makita `## sr132*Symbols:`) suivie
 *  de courtes lignes texte ("Vitesse variable", "Frein", "Inversion"…).
 *  Rendus comme avantages groupés « Équipement ». */
function parsePictosFromMarkdown(md: string): { text: string; group: string }[] {
  const out: { text: string; group: string }[] = []
  const lines = md.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!/^#{1,5}\s.*\b(symbols?|symboles?|pictogrammes?)\b/i.test(lines[i].trim())) continue
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j].trim()
      if (!t) continue
      if (/^#{1,5}\s|^\[|^!\[|https?:\/\//.test(t)) break   // fin de section
      if (t.length < 3 || t.length > 50 || !/[a-zà-ÿ]/i.test(t)) break
      out.push({ text: t, group: 'Équipement' })
      if (out.length >= 20) break
    }
    if (out.length > 0) break
  }
  return out
}

export function buildManufacturerProduct(
  markdownContent: string | null,
  rawData: ManufacturerData,
  productUrl: string,
  additionalSources: string[],
): EnrichedProduct {
  debugLog('[manufacturer-build] combining markdown + raw data')

  // Specs : priorité aux données REDUX/JSON-LD, enrichies par le markdown
  const mdSpecs = markdownContent ? parseSpecsFromMarkdown(markdownContent) : []
  const rawSpecs = rawData.specs
  // Merge : raw specs first (plus fiables), puis ajouter celles du markdown non dupliquées
  const specsMap = new Map<string, { name: string; value: string; group?: string }>()
  for (const s of rawSpecs) {
    specsMap.set(s.name.toLowerCase().trim(), s)
  }
  // Le markdown n'est fusionné QUE si le HTML structuré est pauvre. Quand le
  // fabricant a livré une vraie table technique (≥ 6 specs via REDUX/JSON-LD/DOM),
  // elle fait AUTORITÉ : le markdown Jina n'ajoute alors que du bruit (tableaux
  // configurateur d'accessoires avec prix, adresse société, paires inversées) que
  // la dédup par nom ne peut pas rattraper (noms différents). Signal par richesse
  // de la source structurée, pas par site.
  if (rawSpecs.length < 6) {
    for (const s of mdSpecs) {
      const key = s.name.toLowerCase().trim()
      if (!specsMap.has(key)) specsMap.set(key, s)
    }
  }
  // Normaliseur universel (rejette nom-en-forme-de-valeur, dédup) PUIS sanity
  // canonique (UI, adresses, financier). Deux garde-fous complémentaires.
  const specifications = normalizeSpecPairs([...specsMap.values()])
    .filter((s) => isSaneSpecPair(s.name, s.value))

  // Advantages : markdown (bullet points, avec groupes) + HTML statique en
  // fusion ADDITIVE — le HTML récupère la queue des listes repliées que le
  // rendu navigateur ou un cache tronqué a perdues.
  let advantages = markdownContent ? parseAdvantagesFromMarkdown(markdownContent) : []
  if (rawData.advantages.length > 0) {
    const beforeCount = advantages.length
    advantages = mergeAdvantagesAdditive(advantages, rawData.advantages)
    if (advantages.length > beforeCount) {
      debugLog('[manufacturer-build] ✓ advantages completed from HTML:', beforeCount, '→', advantages.length)
    }
  }
  // + pictogrammes d'équipement (section "Symbols" des fiches fabricant)
  if (markdownContent) {
    const pictos = parsePictosFromMarkdown(markdownContent)
    const seenAdv = new Set(advantages.map((a) => a.text.toLowerCase()))
    for (const p of pictos) {
      if (!seenAdv.has(p.text.toLowerCase())) advantages.push(p)
    }
    if (pictos.length > 0) debugLog('[manufacturer-build] ✓ pictos:', pictos.length)
  }

  // Description : REDUX > markdown (avec filtrage du cookie/GDPR banner)
  let description = rawData.description || ''
  if (description && (isGarbageContent(description) || isMainlyGarbage(description))) {
    debugLog('[manufacturer-build] garbage description from REDUX, clearing')
    description = ''
  }
  if (!description || description.length < 30) {
    const primaryMd = markdownContent ? extractPrimarySourceSection(markdownContent) : null
    const mdDesc = primaryMd ? parseDescriptionFromMarkdown(primaryMd) : ''
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

  // Images : markdown (inclut Jina injected + inline + summary) > REDUX
  const images: string[] = markdownContent ? parseImagesFromMarkdown(markdownContent) : []
  // Merge avec REDUX rawData images (sans doublons)
  if (rawData.images.length > 0) {
    const seen = new Set(images)
    for (const url of rawData.images) {
      if (!seen.has(url)) { images.push(url); seen.add(url) }
    }
  }
  debugLog('[manufacturer-build] images:', images.length)

  // Documents : libellés visibles du markdown > Jina injected > REDUX > PDFs bruts
  const documents: EnrichedDocument[] = []
  const docsByUrl = new Set<string>()
  const pushDocBuild = (url: string, name?: string) => {
    if (!url || docsByUrl.has(url)) return
    docsByUrl.add(url)
    documents.push(buildDocument(url, name))
  }
  // D'abord : les paires « libellé visible ↑ / lien vide [](url.pdf) » — c'est
  // le seul endroit où le VRAI nom du document existe (« Déclaration de
  // conformité CE », « Notices », « vue éclatées »…). Passées en premier pour
  // que la dédup par URL leur donne la priorité sur les noms de fichier.
  if (markdownContent) {
    const named = parseNamedDocLinks(markdownContent)
    for (const d of named) pushDocBuild(d.url, d.name)
    if (named.length > 0) debugLog('[manufacturer-build] ✓ named doc links:', named.length)
  }
  // Puis : le bloc JINA_EXTRACTED_DOWNLOADS injecté par le script.
  // ⚠ injecté au format `titre##url` (cf. jinaScrapeMaufacturerPage) — l'ancien
  // parse ` | ` ne matchait jamais → tous les noms étaient perdus.
  if (markdownContent) {
    const dlStart = markdownContent.indexOf('JINA_EXTRACTED_DOWNLOADS_START')
    const dlEnd = markdownContent.indexOf('JINA_EXTRACTED_DOWNLOADS_END')
    if (dlStart >= 0 && dlEnd > dlStart) {
      const dlBlock = markdownContent.slice(dlStart + 'JINA_EXTRACTED_DOWNLOADS_START'.length, dlEnd)
      for (const line of dlBlock.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const sep = trimmed.includes('##') ? '##' : trimmed.includes(' | ') ? ' | ' : null
        const sepIdx = sep ? trimmed.indexOf(sep) : -1
        if (sep && sepIdx > 0) {
          const name = trimmed.slice(0, sepIdx).trim()
          const url = trimmed.slice(sepIdx + sep.length).trim()
          if (/^https?:\/\//.test(url)) pushDocBuild(url, name || undefined)
        } else if (/^https?:\/\//.test(trimmed)) {
          pushDocBuild(trimmed)
        }
      }
      debugLog('[manufacturer-build] ✓ Jina injected downloads:', documents.length)
    }
  }
  // REDUX/HTML downloads : merge inconditionnel — ils portent les vrais titres
  // (« Manuels et pièces de rechange », « Déclaration de conformité »…) et
  // certains n'ont pas d'extension .pdf (ex: partlist .jsp Milwaukee) donc
  // n'apparaissent dans AUCUNE autre source. La dédup par URL protège.
  for (const dl of rawData.downloads) pushDocBuild(dl.url, dl.name)
  // Ajouter les PDFs du markdown qui ne sont pas déjà dans les downloads
  if (markdownContent) {
    const mdPdfUrls = [...markdownContent.matchAll(/https?:\/\/[^\s)"'\]]+\.pdf[^\s)"'\]]*/gi)].map(m => m[0])
    for (const url of mdPdfUrls) pushDocBuild(url)
    // Liens titrés [titre](url.pdf) du markdown
    const mdLinks = [...markdownContent.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+\.pdf[^\s)]*)\)/gi)]
    for (const m of mdLinks) pushDocBuild(m[2].trim(), m[1].trim())
  }

  debugLog('[manufacturer-build] result:', {
    specs: specifications.length,
    advantages: advantages.length,
    variants: variants.length,
    images: images.length,
    documents: documents.length,
    descLen: description.length,
  })

  // Breadcrumb : HTML brut (extraction DOM fiable) > markdown (fallback parser)
  const mdBreadcrumb = markdownContent ? parseBreadcrumbFromMarkdown(markdownContent) : []
  const breadcrumb = rawData.breadcrumb.length > 0 ? rawData.breadcrumb : mdBreadcrumb

  // Identité (name/brand/model/refs/EAN) — liftée depuis specs Rubix-style ou
  // JSON-LD parallèle stocké dans __lastStructured. Les specs liftées sont
  // retirées du tableau `specifications` pour ne pas dupliquer dans l'UI.
  // Priorité au JSON-LD du HTML fabricant fraîchement parsé (rawData.structured) ;
  // repli sur le global posé par le pipeline principal.
  const structuredFromGlobal = rawData.structured
    ?? (globalThis as unknown as { __lastStructured?: StructuredProductData | null }).__lastStructured
    ?? null
  const { identity, specs: specsAfterLift } = buildIdentity({
    structured: structuredFromGlobal,
    specs: specifications,
    markdown: markdownContent,
  })

  // Prix constructeur (RRP) depuis JSON-LD `offers` — déterministe. C'est un prix
  // de RÉFÉRENCE, distinct du prix revendeur (ne pas traiter comme « divergent »).
  const mfrPricing: Pricing | undefined = structuredFromGlobal?.offers?.price != null
    ? { ttc: structuredFromGlobal.offers.price, currency: structuredFromGlobal.offers.priceCurrency || 'EUR', validUntil: structuredFromGlobal.offers.priceValidUntil }
    : undefined

  // Sous-titre : ligne courte sous le H1 (après la référence) — ex Makita
  // "18 V Li-Ion - 5 Ah - Ø 10 mm - Auto-serrant".
  const subtitle = markdownContent ? extractSubtitleFromMarkdown(markdownContent) : undefined

  // Images : ne garder que les vues du produit quand sa référence est connue
  // (élimine carrousels « machines connexes », accessoires, méga-menu — sur
  // les CDN fabricants le nom de fichier porte la référence).
  const uniqueImages = [...new Set(images)]
  const productImages = filterImagesByProductRef(uniqueImages, [
    identity.model, identity.manufacturerRef, identity.distributorRef, identity.ean,
  ])
  if (productImages.length !== uniqueImages.length) {
    debugLog('[manufacturer-build] ✓ images filtrées par référence :', uniqueImages.length, '→', productImages.length)
  }

  // Pictos par provenance (REDUX standardsFeaturesIcons & co) : ré-ajoutés
  // APRÈS le filtre par référence (ils ne portent jamais la réf produit) et
  // marqués 'picto' dans imageClassOverrides — l'onglet Photos/Pictos du
  // panneau les classe alors avec certitude, sans heuristique URL.
  const finalImages = [...productImages]
  const imageClassOverrides: Record<string, 'photo' | 'picto'> = {}
  for (const u of rawData.pictoUrls) {
    if (!finalImages.includes(u)) finalImages.push(u)
    imageClassOverrides[u] = 'picto'
  }

  return {
    ...identity,
    subtitle,
    description,
    advantages,
    specifications: specsAfterLift,
    variants,
    images: finalImages,
    imageClassOverrides: Object.keys(imageClassOverrides).length > 0 ? imageClassOverrides : undefined,
    documents: deduplicateDocuments(documents),
    breadcrumb: breadcrumb.length > 0 ? breadcrumb : undefined,
    pricing: mfrPricing,
    sourceUrl: productUrl,
    additionalSources,
    generatedAt: Date.now(),
    scrapingProvider: 'Jina + Fabricant (scraping direct)',
    llmProvider: undefined,
    llmModel: undefined,
  }
}

/**
 * Scrape une page produit FABRICANT et retourne un EnrichedProduct, SANS toucher
 * au flux source. Utilisé par le module « Vérification Fabricant » pour faire
 * co-exister source (revendeur) + fabricant et les comparer. Réutilise le chemin
 * « PATH FABRICANT » (scraping pur : markdown Jina + REDUX/JSON-LD/PDFs) — aucun LLM.
 * `blockedByAntiBot` est positionné quand une SPA dure ne livre aucun contenu.
 */
export async function scrapeManufacturerProduct(pageUrl: string): Promise<EnrichedProduct> {
  // Éviter un lift d'identité pollué par un __lastStructured d'un scrape précédent.
  ;(globalThis as unknown as { __lastStructured?: StructuredProductData | null }).__lastStructured = null
  const deep = await jinaScrapeMaufacturerPage(pageUrl)
  const markdownContent = deep?.markdown ?? null
  const rawData = await scrapeManufacturerRawData(pageUrl)
  const product = buildManufacturerProduct(markdownContent, rawData, pageUrl, [])
  const empty = product.specifications.length === 0 && product.images.length === 0 && !product.description
  if (empty && !markdownContent) product.blockedByAntiBot = true
  return product
}
