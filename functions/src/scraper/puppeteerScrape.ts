import { onRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import puppeteer, { Browser } from 'puppeteer-core'
import TurndownService from 'turndown'
// @ts-expect-error — pas de types publiés pour @joplin/turndown-plugin-gfm
import { gfm } from '@joplin/turndown-plugin-gfm'

/**
 * Proxy Puppeteer serveur : rend la page complètement (SPA, accordéons, lazy-load)
 * puis retourne le HTML + markdown bruts. Contrairement à Jina Reader qui capture
 * à readyState=loading (avant hydratation React), ici on contrôle exactement quand
 * capturer : après networkidle + expansion des accordéons + délai configurable.
 *
 * POST body : { url, waitMs?, injectScript?, timeout? }
 * Réponse : { html, markdown, error? }
 */

// Dismiss cookie/consent banners. Sans ça, de nombreux SPA (Milwaukee, Makita,
// SAP Hybris…) ne rendent pas le contenu produit tant que l'utilisateur n'a pas
// accepté les cookies. Générique : cherche boutons par texte + attributs OneTrust/
// Cookiebot/Didomi/TrustArc + selectors ID standards.
const DISMISS_COOKIES_SCRIPT = `
(function() {
  var clicked = 0;
  var hidden = 0;
  // Regex sans ancres — match "Accepter tous les cookies", "Tout accepter",
  // "Accept All Cookies", "Allow all", etc. On accepte le texte libre à condition
  // qu'il contienne des mots-clés spécifiques au consentement.
  var ACCEPT_RE = /\\b(accepter|accept(?:\\s+all)?|tout\\s+accepter|accept\\s+cookies?|j'accepte|autoriser|tout\\s+autoriser|allow(?:\\s+all)?|agree|i\\s+agree|got\\s+it|j'ai\\s+compris|d'accord)\\b/i;
  var REJECT_RE = /\\b(refuser|reject|d[eé]cliner|decline|personnaliser|customize|settings?|param[eè]tres?|manage|g[eé]rer|options?)\\b/i;
  // Sélecteurs IDs/classes connus
  var KNOWN_IDS = [
    'onetrust-accept-btn-handler',
    'truste-consent-button',
    'CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    'CybotCookiebotDialogBodyButtonAccept',
    'didomi-notice-agree-button',
    'consent_prompt_submit',
    'hs-eu-confirmation-button',
  ];
  for (var i = 0; i < KNOWN_IDS.length; i++) {
    var el = document.getElementById(KNOWN_IDS[i]);
    if (el) { try { el.click(); clicked++; } catch(e) {} }
  }
  // Boutons avec attributs standards
  document.querySelectorAll('[data-cky-tag="accept-button"],[data-consent="accept"],[aria-label*="accept" i][aria-label*="cookie" i],button[aria-label*="accepter" i],[data-testid*="accept" i],[data-testid*="cookie-accept" i]').forEach(function(el) {
    try { el.click(); clicked++; } catch(e) {}
  });
  // Fallback texte — un texte contenant un mot-clé d'acceptation et AUCUN mot-clé
  // de rejet/personnalisation est considéré comme le bouton "Accepter tout".
  document.querySelectorAll('button,[role="button"],a,input[type="button"],input[type="submit"]').forEach(function(el) {
    var t = (el.textContent || el.value || '').trim();
    if (t.length === 0 || t.length > 80) return;
    if (ACCEPT_RE.test(t) && !REJECT_RE.test(t)) {
      try { el.click(); clicked++; } catch(e) {}
    }
  });
  // Retirer bannières overlay restantes (class/id cookies/consent)
  document.querySelectorAll('[id*="cookie" i],[id*="consent" i],[class*="cookie-banner" i],[class*="consent-banner" i],[class*="cookie-notice" i],[class*="gdpr" i],[class*="privacy-banner" i]').forEach(function(el) {
    try {
      if (el.style) { el.style.setProperty('display', 'none', 'important'); hidden++; }
    } catch(e) {}
  });
  return { clicked: clicked, hidden: hidden };
})();
`

// Stratégie universelle d'expansion : primitives W3C/WAI-ARIA + fallback click.
// Pas de sélecteurs spécifiques à un fournisseur (contrainte projet).
const EXPAND_SCRIPT = `
(function() {
  function unhide(el) {
    if (!el || el.nodeType !== 1) return;
    el.style.setProperty('display', 'revert', 'important');
    el.style.setProperty('visibility', 'visible', 'important');
    el.style.setProperty('height', 'auto', 'important');
    el.style.setProperty('max-height', 'none', 'important');
    el.style.setProperty('overflow', 'visible', 'important');
    el.removeAttribute('hidden');
    el.setAttribute('aria-hidden', 'false');
  }
  // Dispatch une séquence pointer/mouse/click complète. Certains frameworks (SAP
  // Hybris, stencil-web, custom React) écoutent pointerdown ou mousedown et pas
  // le click classique — donc .click() seul ne suffit pas.
  function fullClick(el) {
    try { el.click(); } catch(e) {}
    try {
      var r = el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 0, top: 0, width: 1, height: 1 };
      var opts = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
      ['pointerover','pointerenter','pointerdown','mousedown','pointerup','mouseup','click'].forEach(function(type) {
        var Ev = (type.indexOf('pointer') === 0 && window.PointerEvent) ? window.PointerEvent
               : (type.indexOf('mouse') === 0 || type === 'click') ? window.MouseEvent : window.Event;
        try { el.dispatchEvent(new Ev(type, opts)); } catch(e) {}
      });
    } catch(e) {}
  }
  // 1) WAI-ARIA Tabs
  document.querySelectorAll('[role="tab"]').forEach(function(t) {
    t.setAttribute('aria-selected', 'true');
    var id = t.getAttribute('aria-controls');
    if (id) { var p = document.getElementById(id); if (p) unhide(p); }
  });
  document.querySelectorAll('[role="tabpanel"]').forEach(unhide);
  // 2) WAI-ARIA Disclosure — set flag + full click (pointerdown + mousedown + click)
  document.querySelectorAll('[aria-expanded="false"]').forEach(function(t) {
    t.setAttribute('aria-expanded', 'true');
    var id = t.getAttribute('aria-controls');
    if (id) id.split(/\\s+/).forEach(function(i) { var e = document.getElementById(i); if (e) unhide(e); });
    fullClick(t);
  });
  // 3) Native HTML5 <details>
  document.querySelectorAll('details:not([open])').forEach(function(d) { d.setAttribute('open', ''); });
  // 4) Attribut [hidden]
  document.querySelectorAll('[hidden]').forEach(function(el) {
    var tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE') return;
    el.removeAttribute('hidden'); unhide(el);
  });
  // 5) Click triggers standard (ARIA + Bootstrap/jQuery/SAP data-*)
  document.querySelectorAll('button[aria-controls],a[aria-controls],summary,[data-toggle],[data-bs-toggle],[data-target],[data-bs-target],[data-accordion-trigger],[data-a-accordion-toggle],[data-pa-kind*="accordion" i],[data-pa-kind*="expander" i]').forEach(fullClick);
  // 6) Click éléments avec classes accordéon/collapse génériques (universel).
  //    Liste enrichie avec patterns SAP Hybris (a-accordion, js-*, cmp-*),
  //    BEM (__header, __toggle), emotion-css (css-xyz__title), headless (hds-*).
  var ACCORDION_CLASS_RE = /\\b(accordion|collapse|toggle|expand|expander|disclosure|panel-header|panel-trigger|card-header|spec-header|variant-header|show-more|see-more|a-accordion|js-accordion|cmp-accordion|hds-accordion|chakra-accordion|m-accordion|o-accordion|u-accordion|mod-accordion|accordion-header|accordion-toggle|accordion-button|accordion-trigger|__header|__toggle|__trigger)\\b/i;
  document.querySelectorAll('[class]').forEach(function(el) {
    var tag = el.tagName;
    if (tag === 'DIV' || tag === 'BUTTON' || tag === 'A' || tag === 'LI' || tag === 'SPAN' || tag === 'H2' || tag === 'H3' || tag === 'H4' || tag === 'SECTION' || tag === 'ARTICLE') {
      if (ACCORDION_CLASS_RE.test(el.className || '')) {
        fullClick(el);
      }
    }
  });
  // 6b) Heading (h2/h3/h4) contenant un bouton ou un <span> chevron : pattern
  //     Kärcher/SAP où le heading EST le trigger. On clique le heading lui-même.
  document.querySelectorAll('h2,h3,h4').forEach(function(h) {
    var inside = h.querySelector('button,[role="button"],[class*="chevron" i],[class*="arrow" i],[class*="caret" i],[class*="toggle" i],svg');
    var parentRole = h.parentElement && h.parentElement.getAttribute && h.parentElement.getAttribute('role');
    if (inside || parentRole === 'button' || /button|trigger|toggle|accordion/i.test(h.className || '')) {
      fullClick(h);
      if (inside) fullClick(inside);
    }
  });
  // 7) Click boutons texte "Voir plus / Afficher / Caractéristiques / Détails /
  //    Spécifications / Équipement / Données techniques"
  var TRIGGER_TEXT_RE = /^\\s*(voir\\s+(plus|tout|détail|caract|fiche)|afficher(?:\\s+(plus|tout))?|show\\s+(more|all|details?)|d[eé]tails?|caract[eé]ristiques?(?:\\s+techniques?)?|sp[eé]cifications?(?:\\s+techniques?)?|donn[eé]es\\s+techniques?|[eé]quipement|fonctionnalit[eé]s?|inclus\\s+dans\\s+la\\s+livraison|en\\s+savoir\\s+plus|plus\\s+d'infos?|read\\s+more|technical\\s+(data|specs?)|features?)\\s*$/i;
  document.querySelectorAll('button,a,[role="button"],div[onclick],span[onclick],h2,h3,h4,h5,li').forEach(function(el) {
    var txt = (el.textContent || '').trim();
    if (txt.length > 0 && txt.length < 60 && TRIGGER_TEXT_RE.test(txt)) {
      fullClick(el);
    }
  });
  // 8) Lazy-load images
  document.querySelectorAll('img[loading="lazy"]').forEach(function(i) { i.loading = 'eager'; });
  // 9) Scroll progressif pour réveiller IntersectionObserver + dispatcher
  //    des events scroll/resize qui déclenchent les lazy-renders.
  try {
    var h = document.body.scrollHeight;
    [0.2, 0.4, 0.6, 0.8, 1.0, 0.5, 0].forEach(function(p) {
      window.scrollTo(0, h * p);
      window.dispatchEvent(new Event('scroll'));
    });
    window.dispatchEvent(new Event('resize'));
  } catch(e) {}
})();
`

// Turndown partagé : HTML → Markdown structuré (titres ##, images ![alt](url),
// tableaux GFM |col|col|, listes). Indispensable — body.innerText perd tout ça
// et les parseurs downstream (advantages groups, variants table, images) cassent.
const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  linkStyle: 'inlined',
})
turndown.use(gfm)
turndown.remove(['script', 'style', 'noscript', 'iframe'])

let browserPromise: Promise<Browser> | null = null

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const chromium = (await import('@sparticuz/chromium')).default
      return puppeteer.launch({
        args: chromium.args,
        defaultViewport: { width: 1280, height: 800 },
        executablePath: await chromium.executablePath(),
        headless: true,
      })
    })()
  }
  return browserPromise
}

export const scrapePage = onRequest(
  {
    region: 'europe-west1',
    timeoutSeconds: 300,
    memory: '2GiB',
    cpu: 2,
    cors: true,
    concurrency: 1,
  },
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') { res.status(204).send(''); return }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return }

    const { url, waitMs, injectScript } = (req.body ?? {}) as {
      url?: string
      waitMs?: number
      injectScript?: string
    }
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'url manquant' })
      return
    }

    const extraWait = Math.min(Math.max(waitMs ?? 5000, 0), 30000)
    const browser = await getBrowser()
    const page = await browser.newPage()

    try {
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
      )
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' })

      logger.info('[scrapePage] goto', { url })
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }).catch((e) => {
        logger.warn('[scrapePage] goto non-fatal', { msg: (e as Error).message })
      })

      // Dismiss cookie/consent banners AVANT expand.
      // Beaucoup de sites (Milwaukee, Makita, etc.) ne rendent le contenu
      // produit que lorsque la bannière cookies est fermée.
      const cookieResult1 = await page
        .evaluate(DISMISS_COOKIES_SCRIPT)
        .catch(() => ({ clicked: 0, hidden: 0 }))
      logger.info('[scrapePage] cookie dismiss pass 1', cookieResult1 as object)
      await new Promise((r) => setTimeout(r, 3000)) // laisser la page se re-rendre post-acceptation
      const cookieResult2 = await page
        .evaluate(DISMISS_COOKIES_SCRIPT)
        .catch(() => ({ clicked: 0, hidden: 0 }))
      logger.info('[scrapePage] cookie dismiss pass 2', cookieResult2 as object)

      // Après acceptation des cookies, beaucoup de SPA (Milwaukee, Makita, SAP
      // Hybris…) déclenchent les XHR qui chargent les données produit. On attend
      // un nouveau networkidle pour capturer la vraie page hydratée.
      await page
        .waitForNetworkIdle({ idleTime: 1200, timeout: 8000 })
        .catch(() => {
          logger.info('[scrapePage] post-cookie networkidle timeout (non-fatal)')
        })

      // Boucle multi-pass : expansion → attente → expansion. Nécessaire car les
      // accordéons chargent leur contenu en async après le clic (fetch/XHR), et
      // de nouveaux triggers apparaissent après chaque pass. 3 passes suffisent
      // en général pour capturer les hiérarchies profondes (variantes dépliées +
      // specs de chaque variante).
      const PASSES = 3
      const INITIAL_WAIT = Math.min(extraWait, 5000)
      const PASS_WAIT = Math.max(1500, Math.floor(extraWait / PASSES))

      await page.evaluate(EXPAND_SCRIPT).catch(() => {})
      if (injectScript && typeof injectScript === 'string') {
        await page.evaluate(injectScript).catch((e) => {
          logger.warn('[scrapePage] custom script failed', { msg: (e as Error).message })
        })
      }
      await new Promise((r) => setTimeout(r, INITIAL_WAIT))

      for (let pass = 1; pass <= PASSES; pass++) {
        const before = await page.evaluate(() => document.body.innerText.length).catch(() => 0)
        await page.evaluate(EXPAND_SCRIPT).catch(() => {})
        await new Promise((r) => setTimeout(r, PASS_WAIT))
        const after = await page.evaluate(() => document.body.innerText.length).catch(() => 0)
        logger.info('[scrapePage] pass', { pass, before, after, delta: after - before })
        // Si plus aucun changement de contenu, inutile de boucler.
        if (after > 0 && after - before < 100) break
      }

      // ── Phase click-through par variante ───────────────────────────────
      // Beaucoup de sites SPA (Nicoll, Makita, Bosch…) n'affichent qu'UNE
      // variante à la fois dans la section "Caractéristiques". Pour capturer
      // les specs de CHAQUE variante, on détecte les éléments cliquables
      // portant une référence SKU et on les clique un par un, en capturant
      // le contenu de la section specs après chaque clic.
      const variantSnapshots = await page
        .evaluate(async () => {
          const SKU_RE = /\b([A-Z]{1,4}\d{2,6}[A-Z0-9]{0,6})\b/

          function findSkuClickables(): Array<{ sku: string; el: Element }> {
            const out: Array<{ sku: string; el: Element }> = []
            const seen = new Set<string>()
            // Éléments clairement cliquables
            const candidates = document.querySelectorAll(
              'button,a[href],[role="button"],[role="tab"],[role="option"],li[data-sku],[data-variant],[data-reference]',
            )
            for (const el of Array.from(candidates)) {
              if (!(el instanceof HTMLElement)) continue
              const texts = [
                el.textContent?.trim() ?? '',
                el.getAttribute('aria-label') ?? '',
                el.getAttribute('title') ?? '',
                el.getAttribute('data-sku') ?? '',
                el.getAttribute('data-variant') ?? '',
                el.getAttribute('data-reference') ?? '',
              ]
              for (const t of texts) {
                const m = t.match(SKU_RE)
                if (!m) continue
                const sku = m[1].toUpperCase()
                if (sku.length < 4 || seen.has(sku)) continue
                seen.add(sku)
                out.push({ sku, el })
                break
              }
            }
            return out
          }

          function findSpecsContainer(): Element | null {
            // Préférer les conteneurs avec beaucoup de paires "K : V"
            const all = document.querySelectorAll(
              '[class*="caract" i],[class*="spec" i],[class*="detail" i],[class*="properties" i],[class*="feature" i],section,aside,article',
            )
            let best: Element | null = null
            let bestScore = 0
            for (const el of Array.from(all)) {
              const txt = el.textContent ?? ''
              if (txt.length < 100 || txt.length > 20000) continue
              const pairs = (txt.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{2,30}\s*:\s*[^\s:]/g) || []).length
              if (pairs > bestScore) { bestScore = pairs; best = el }
            }
            return bestScore >= 5 ? best : null
          }

          const clickables = findSkuClickables()
          if (clickables.length === 0 || clickables.length > 50) return []

          const snaps: Array<{ sku: string; text: string }> = []
          for (const { sku, el } of clickables) {
            try {
              ;(el as HTMLElement).click()
              // Attendre le re-render React/Vue/etc.
              await new Promise((r) => setTimeout(r, 800))
              const container = findSpecsContainer()
              const text = container?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 8000) ?? ''
              if (text.length > 100) snaps.push({ sku, text })
            } catch {
              /* ignore clic raté */
            }
          }
          return snaps
        })
        .catch((e) => {
          logger.warn('[scrapePage] click-through failed', { msg: (e as Error).message })
          return [] as Array<{ sku: string; text: string }>
        })

      if (variantSnapshots.length > 0) {
        logger.info('[scrapePage] captured per-variant snapshots', {
          count: variantSnapshots.length,
          skus: variantSnapshots.map((s) => s.sku),
        })
      }

      const html = await page.content()

      // Injecter les snapshots par variante en fin de markdown sous forme de sections
      // reconnaissables par le scanner inline côté client.
      let variantAppendix = ''
      if (variantSnapshots.length > 0) {
        variantAppendix = '\n\n## VARIANT_DETAILS\n\n'
        for (const s of variantSnapshots) {
          // Injecter avec séparation claire et format "Key : Value" par ligne pour
          // que parseInlineVariantSpecs capte les paires.
          const normalized = s.text
            .replace(/•/g, '\n- ')
            .replace(/\s{2,}/g, ' ')
            .replace(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'’-]{2,40})\s*:\s*/g, '\n- $1 : ')
          variantAppendix += `### VARIANT: ${s.sku}\n${normalized.trim()}\n\n`
        }
      }
      // HTML → Markdown structuré via turndown+GFM : conserve headings, images,
      // tableaux, listes (nécessaire pour advantages groups + variants table +
      // images côté parseurs). Résolution des URL relatives vers pageUrl.
      let markdown = ''
      try {
        // Injecter <base> pour que turndown résolve correctement les href/src.
        const htmlWithBase = /<base\s/i.test(html)
          ? html
          : html.replace(/<head[^>]*>/i, (m) => `${m}\n<base href="${url}">`)
        markdown = turndown.turndown(htmlWithBase).replace(/\n{3,}/g, '\n\n')
      } catch (e) {
        logger.warn('[scrapePage] turndown failed, fallback innerText', { msg: (e as Error).message })
        markdown = await page.evaluate(() => {
          const body = document.body
          return body ? (body.innerText || '').replace(/\n{3,}/g, '\n\n') : ''
        })
      }

      if (variantAppendix) markdown += variantAppendix

      logger.info('[scrapePage] ✓ OK', { htmlLen: html.length, mdLen: markdown.length, variantSnaps: variantSnapshots.length })
      res.status(200).json({ html, markdown })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[scrapePage] error', { msg })
      res.status(200).json({ html: '', markdown: '', error: msg })
    } finally {
      await page.close().catch(() => {})
    }
  }
)
