// ZONE PRODUIT — extraction en LISTE BLANCHE.
//
// Renversement structurel du moteur (feedback 2026-07-14 : « scraping universel,
// pas des fixes par cas ») : au lieu de FILTRER le junk a posteriori (footer,
// login, CGV, réassurance enseigne — liste noire sans fin), on identifie LA
// zone du DOM qui décrit le produit et on extrait DEDANS. Tout ce qui est
// hors-scope (header, footer, checkout, newsletter…) disparaît PAR CONSTRUCTION.
//
// Signaux par STANDARD/PLATEFORME uniquement (microdata schema.org, conteneurs
// canoniques Magento/Woo/Presta/Shopify, convention « pdp- »), jamais par site.
// Repli heuristique : plus petit ancêtre commun du H1 et du prix.
// Garde-fou : scope introuvable ou trop maigre → null, l'appelant garde son
// comportement page-entière (le scope ne RETIRE jamais de données, il priorise).

/** Sélecteurs de conteneurs produit canoniques, par plateforme (ordre = confiance). */
const SCOPE_SELECTORS: string[] = [
  // Microdata schema.org — standard universel
  '[itemtype*="schema.org/Product"]',
  // Magento 2 : bloc info + onglets description/caractéristiques
  '.product-info-main', '.product.info.detailed',
  // WooCommerce
  'div.product > .summary', '.woocommerce-tabs',
  // PrestaShop
  '#product-details', '.product-information',
  // Shopify
  '.product__info-wrapper', 'section[id^="ProductInfo"]',
  // Convention « product detail page » répandue (pdp-…)
  '[class*="pdp-"]',
]

/** Longueur de texte minimale pour qu'un candidat compte comme conteneur
 *  (élimine les micro-nœuds décoratifs qui matchent par leur classe). */
const MIN_CANDIDATE_TEXT = 120
/** En-dessous de ce texte total, le scope est raté → null (repli page entière).
 *  Bas volontairement : une fiche PAUVRE mais réelle (description d'une ligne
 *  + une référence) reste un scope valide — c'est le junk qu'on écarte, pas
 *  les petits produits. */
const MIN_SCOPE_TEXT = 150
/** Un ancêtre H1+prix qui couvre plus de cette part du body est le body déguisé. */
const MAX_ANCESTOR_SHARE = 0.6

const PRICE_TEXT_RE = /\d[\d\s.,]{0,12}\s*(?:[€$£]|\bEUR\b)|[€$£]\s*\d/

function textLen(el: Element): number {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim().length
}

/** Déduplique par CONTENANCE : un candidat contenu dans un autre est retiré. */
function dedupeByContainment(els: Element[]): Element[] {
  return els.filter((el) => !els.some((other) => other !== el && other.contains(el)))
}

/** Plus petit ancêtre du H1 contenant aussi un nœud de prix — borné (jamais
 *  body ni un ancêtre qui couvre presque toute la page). */
function ancestorOfTitleAndPrice(doc: Document): Element | null {
  const h1 = doc.querySelector('h1')
  const body = doc.body
  if (!h1 || !body) return null
  const bodyLen = textLen(body)
  if (!bodyLen) return null
  let cur: Element | null = h1.parentElement
  while (cur && cur !== body) {
    if (PRICE_TEXT_RE.test(cur.textContent ?? '')) {
      if (textLen(cur) / bodyLen > MAX_ANCESTOR_SHARE) return null
      return cur
    }
    cur = cur.parentElement
  }
  return null
}

/** HTML de la ZONE PRODUIT (concaténation des conteneurs canoniques trouvés),
 *  ou null si aucun scope fiable — l'appelant traite alors la page entière. */
export function extractProductScope(html: string): string | null {
  if (!html || html.length < 400) return null
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch {
    return null
  }

  const candidates: Element[] = []
  for (const sel of SCOPE_SELECTORS) {
    try {
      for (const el of Array.from(doc.querySelectorAll(sel))) {
        if (textLen(el) >= MIN_CANDIDATE_TEXT) candidates.push(el)
      }
    } catch { /* sélecteur non supporté par ce parseur : suivant */ }
  }

  let zones = dedupeByContainment([...new Set(candidates)])
  if (zones.length === 0) {
    const fallback = ancestorOfTitleAndPrice(doc)
    if (fallback) zones = [fallback]
  }
  if (zones.length === 0) return null

  const scoped = zones.map((z) => z.outerHTML).join('\n')
  const totalText = zones.reduce((n, z) => n + textLen(z), 0)
  if (totalText < MIN_SCOPE_TEXT) return null
  return scoped
}

/** Texte lisible de la zone produit (pour le contexte LLM) : headings et
 *  puces préservés, scripts/styles retirés, espaces normalisés. */
export function productScopeText(scopeHtml: string, maxChars = 8000): string {
  const cleaned = scopeHtml
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(?:h[1-6])[^>]*>/gi, '\n## ')
    .replace(/<li[^>]*>/gi, '\n* ')
    .replace(/<\/(?:p|div|tr|li|h[1-6]|table|section)>/gi, '\n')
    .replace(/<td[^>]*>|<th[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return cleaned.slice(0, maxChars)
}
