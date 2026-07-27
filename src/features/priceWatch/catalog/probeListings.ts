// Découverte de pages LISTE par SONDAGE — dernier recours quand le motif d'URL ne dit
// rien (plateformes maison, SPA, enseignes). Principe : au lieu de deviner d'après le
// chemin (`/categorie/`, `/collections/`…), on ouvre quelques liens internes et on garde
// ceux dont la page contient RÉELLEMENT des produits. Le signal devient le contenu, pas
// la convention d'URL — c'est ce qui débloque castorama (`…/cat_id_0003374.cat`), et
// n'importe quelle future enseigne, sans une ligne de code par site.
// PUR + server-safe (regex, pas de DOMParser) : partagé client / Cloud Function.

/** Extensions d'assets : jamais une page liste. */
const ASSET_RE = /\.(?:js|mjs|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot|pdf|zip|xml|json|txt|mp4|webm)(?:$|\?)/i
/** Chemins qui ne sont jamais des listes produit (compte, tunnel, éditorial, légal). */
const NON_LISTING_RE = /\/(?:cart|panier|account|compte|customer|login|connexion|signin|checkout|commande|search|recherche|cms|blog|news|actualite|contact|mentions|cgv|cgu|conditions|newsletter|wishlist|favoris|faq|aide|help|about|apropos|tag|auth|password|magasin|store-locator|services?|conseils?)\b/i

const bare = (domain: string) => domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./i, '')

/**
 * « Forme » d'un chemin : profondeur + dernier segment normalisé (chiffres → `0`, suites
 * de lettres → `w`). `/abri-de-jardin-metal/cat_id_0003374.cat` → `2:w_w.w`, une fiche
 * `/mkp/…/3222871201653_CAFR.prd` → `3:0_w.w`, une page maison `/casto-pro` → `1:w`.
 *
 * C'est le signal qui remplace le devinage d'URL : une page d'accueil publie des DIZAINES
 * de liens partageant la forme de ses catégories, et une seule « nos engagements ». Trier
 * les formes par effectif décroissant met donc les gabarits de masse en tête, quelle que
 * soit la techno — et une seule sonde suffit à juger toute une forme.
 */
function pathShape(pathname: string): string {
  const segs = pathname.split('/').filter(Boolean)
  const last = (segs[segs.length - 1] ?? '')
    .replace(/\d+/g, '0')
    .replace(/[a-zÀ-ſ]{2,}/gi, 'w')
  return `${segs.length}:${last}`
}

export interface CandidateOptions {
  /** Nombre maximum de candidats retenus (borne le coût du sondage). */
  max?: number
  /** Mots-clés de familles : s'ils sont présents, les URLs qui en contiennent passent devant. */
  keywords?: string[]
}

/**
 * Liens internes de la page d'accueil susceptibles d'être des pages liste. On ne tranche
 * PAS ici (c'est le rôle de la sonde) : on écarte l'impossible (assets, tunnel d'achat,
 * éditorial), on regroupe par FORME d'URL et on propose un représentant de chaque forme —
 * une seule sonde suffit alors à juger tout un gabarit.
 */
export function candidateListingUrls(html: string, domain: string, opts: CandidateOptions = {}): string[] {
  const host = bare(domain)
  const max = opts.max ?? 24
  const keywords = (opts.keywords ?? []).filter(Boolean)
  const seen = new Set<string>()
  const urls: string[] = []

  for (const m of html.matchAll(/href\s*=\s*["']([^"'#\s]+)["']/gi)) {
    const raw = m[1].trim()
    if (!raw || /^(?:mailto|tel|javascript):/i.test(raw)) continue
    let u: URL
    try { u = new URL(raw, `https://www.${host}/`) } catch { continue }
    if (bare(u.hostname) !== host) continue
    if (u.pathname === '/' || u.pathname.length < 4) continue
    if (ASSET_RE.test(u.pathname)) continue
    if (NON_LISTING_RE.test(u.pathname.toLowerCase())) continue
    const clean = `${u.origin}${u.pathname}`
    // Dédup INSENSIBLE au `www.` et au `/` final : une même page publiée sous deux formes
    // entrerait deux fois au plan, donc sous deux `pageDocId` — « fiches » gonflées par
    // des doublons. L'URL est conservée telle quelle (forcer `www.` casserait les sites
    // dont seul le domaine nu résout).
    const key = `${bare(u.hostname)}${u.pathname.replace(/\/$/, '')}`
    if (seen.has(key)) continue
    seen.add(key)
    urls.push(clean)
  }

  const matchesKeyword = (u: string) => keywords.some((k) => u.toLowerCase().includes(k))
  // Regroupement par forme : les gabarits de masse (catégories, fiches) émergent seuls.
  const byShape = new Map<string, string[]>()
  for (const u of urls) {
    const shape = pathShape(new URL(u).pathname)
    const arr = byShape.get(shape)
    if (arr) arr.push(u); else byShape.set(shape, [u])
  }
  // Ordre des formes : celles qui touchent une famille suivie d'abord (l'utilisateur a
  // dit ce qui l'intéresse), puis les plus représentées — un gabarit de masse est un
  // gabarit de catalogue —, puis la moins profonde à effectif égal (un rayon contient
  // plus de produits qu'une sous-sous-catégorie).
  const shapes = [...byShape.entries()].sort((a, b) =>
    (a[1].some(matchesKeyword) ? 0 : 1) - (b[1].some(matchesKeyword) ? 0 : 1)
    || b[1].length - a[1].length
    || Number(a[0].split(':')[0]) - Number(b[0].split(':')[0]))
  for (const [, list] of shapes) {
    // Dans chaque forme, une URL qui parle d'une famille suivie passe devant.
    list.sort((a, b) => (matchesKeyword(a) ? 0 : 1) - (matchesKeyword(b) ? 0 : 1) || a.length - b.length)
  }

  // Un représentant par forme d'abord (une sonde suffit à juger toute une forme), puis un
  // second tour pour les formes peuplées si le budget le permet.
  const out: string[] = []
  for (let round = 0; round < 2 && out.length < max; round++) {
    for (const [, list] of shapes) {
      if (out.length >= max) break
      // Une forme représentée une seule fois est une page isolée (mentions, à-propos) :
      // au second tour on ne la reteste pas.
      if (round === 1 && list.length < 3) continue
      const u = list[round]
      if (u) out.push(u)
    }
  }
  return out
}

export interface ProbeOptions {
  /** Nombre maximum de pages ouvertes (chaque sonde = 1 fetch facturable). */
  maxProbes?: number
  /** Nombre de produits à partir duquel une page est considérée comme une LISTE. */
  minProducts?: number
  /** Nombre de listes suffisant pour arrêter le sondage. */
  enough?: number
  log?: (m: string) => void
}

/**
 * Ouvre les candidats un par un et retient ceux qui contiennent au moins `minProducts`
 * fiches. `countProducts` reçoit le HTML : l'appelant y branche les parseurs existants
 * (JSON-LD générique, cartes DOM, PrestaShop) — aucune duplication de parsing ici.
 * S'arrête dès que `enough` listes sont trouvées : inutile de payer 20 fetches.
 */
export async function probeListingUrls(
  candidates: string[],
  fetchHtml: (url: string) => Promise<string | null>,
  countProducts: (html: string, url: string) => number,
  opts: ProbeOptions = {},
): Promise<string[]> {
  const maxProbes = opts.maxProbes ?? 10
  const minProducts = opts.minProducts ?? 4
  const enough = opts.enough ?? 6
  const found: string[] = []
  let probes = 0

  for (const url of candidates) {
    if (probes >= maxProbes || found.length >= enough) break
    probes++
    const html = await fetchHtml(url)
    if (!html) continue
    const n = countProducts(html, url)
    if (n >= minProducts) {
      found.push(url)
      opts.log?.(`sonde : ${url} → ${n} produit(s), retenue comme page liste.`)
    }
  }
  if (found.length === 0) opts.log?.(`sonde : ${probes} page(s) ouverte(s), aucune ne contient de liste produit.`)
  return found
}
