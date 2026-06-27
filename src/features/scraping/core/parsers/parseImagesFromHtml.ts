// Extrait les URLs d'images d'un HTML brut — source DÉTERMINISTE des images
// produit, en complément du markdown Jina (dont l'imagesMap dépend du rendu JS
// et varie d'un appel à l'autre). Générique, aucun code par-vendeur :
//   - balaie <img src|data-src|data-original|data-lazy>, srcset, <source srcset>,
//     <meta og:image>, <link rel=image_src> ;
//   - DÉCODE les entités HTML (`&amp;` → `&`) — sinon les URLs sont cassées
//     (téléchargement DAM + affichage KO) ;
//   - quand une URL porte une signature de VIGNETTE (flou ou largeur imposée
//     ≤ 200 px : lazy-load placeholders), retire les paramètres de redimension
//     pour récupérer la pleine résolution, puis dédoublonne.
// Additif par contrat : l'appelant FUSIONNE le résultat (ne remplace jamais).

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/g, '&')
    .replace(/&#x0*26;/gi, '&')
    .replace(/&#x0*2F;/gi, '/')
    .replace(/&#0*47;/g, '/')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
}

const THUMB_PARAMS = ['width', 'height', 'w', 'h', 'blur', 'sigma', 'threshold', 'mode', 'entropycrop', 'heightratio', 'quality', 'q']

/** Si l'URL est une vignette (flou ou largeur ≤ 200), retire les paramètres de
 *  redimension pour viser la pleine résolution (garde la clé de version `v`). */
function upscale(u: string): string {
  try {
    const url = new URL(u)
    const p = url.searchParams
    const w = Number(p.get('width') || p.get('w') || '0')
    const h = Number(p.get('height') || p.get('h') || '0')
    const isThumb = p.has('blur') || (w > 0 && w <= 200) || (h > 0 && h <= 200)
    if (isThumb) {
      for (const k of THUMB_PARAMS) p.delete(k)
      url.search = p.toString()
    }
    return url.toString()
  } catch {
    return u
  }
}

const SRC_RE = /<(?:img|source)\b[^>]*?\b(?:src|data-src|data-original|data-lazy(?:-src)?|srcset|data-srcset)\s*=\s*["']([^"']+)["']/gi
const OG_RE = /<meta\b[^>]+(?:property|name)\s*=\s*["']og:image(?::secure_url|:url)?["'][^>]+content\s*=\s*["']([^"']+)["']/gi
const LINK_RE = /<link\b[^>]+rel\s*=\s*["']image_src["'][^>]+href\s*=\s*["']([^"']+)["']/gi

export function parseImagesFromHtml(html: string): string[] {
  if (!html) return []
  const out = new Set<string>()
  const add = (raw: string | undefined) => {
    if (!raw) return
    const u = upscale(decodeEntities(raw.trim()))
    if (/^https?:\/\//i.test(u)) out.add(u)
  }
  for (const m of html.matchAll(SRC_RE)) {
    const val = m[1]
    // srcset = « url 320w, url 2x » → prendre l'URL de chaque candidat.
    if (val.includes(',') && /\s+\d+(?:w|x)\b/.test(val)) {
      for (const cand of val.split(',')) add(cand.trim().split(/\s+/)[0])
    } else {
      add(val)
    }
  }
  for (const m of html.matchAll(OG_RE)) add(m[1])
  for (const m of html.matchAll(LINK_RE)) add(m[1])
  return Array.from(out)
}
