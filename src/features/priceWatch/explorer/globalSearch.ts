// Recherche d'une clé (référence, code-barres) chez TOUS les concurrents.
//
// L'explorateur n'a en mémoire que les fiches du concurrent affiché : une recherche y
// répondait « aucune fiche » dès que CE marchand ne vend pas l'article, sans dire s'il
// se trouvait ailleurs. Vécu : l'EAN 8008984359130 (un enjoliveur Castelgarden) cherché
// sur un vendeur de courroies — introuvable là, présent chez emc-motoculture.
//
// Deux principes de conception :
//   - on ne charge JAMAIS tous les index à la fois. Les sites sont parcourus un par un,
//     et l'index de chacun est relâché avant de passer au suivant : à 200 000 fiches
//     cumulées, tout garder ferait tomber l'onglet ;
//   - on ne retient de chaque site que le PREMIER résultat et son compte. L'écran a
//     besoin de savoir OÙ aller, pas de rejouer la liste ici.
import { normalizeEan, normalizeRef } from '../catalog/keys'
import type { CompetitorListing } from '../catalog/competitorListing'
import { foldText } from '../catalog/categories'

export interface GlobalHit {
  siteId: string
  domain: string
  /** Fiches du site qui correspondent à la saisie. */
  count: number
  /** La première, pour montrer à quoi ressemble ce qu'on a trouvé. */
  sample: CompetitorListing
}

export interface GlobalSearchSite {
  siteId: string
  domain: string
}

/** Une fiche répond-elle à la saisie ? Mêmes règles que la recherche locale : clés
 *  normalisées d'abord (un code-barres saisi avec des espaces doit tomber juste), puis
 *  repli textuel sur le libellé et l'adresse. */
export function listingMatchesKey(l: CompetitorListing, q: string): boolean {
  const raw = q.trim()
  if (!raw) return false
  const ean = normalizeEan(raw)
  if (ean && (normalizeEan(l.gtin13) === ean || (l.url ?? '').replace(/\D/g, '').includes(ean))) return true
  const ref = normalizeRef(raw)
  if (ref.length >= 4) {
    if (normalizeRef(l.ref) === ref) return true
    // Référence NOYÉE dans le libellé ou l'adresse : chez la moitié des marchands, elle
    // n'est écrite que là. On compare sur la forme normalisée des deux côtés, sinon
    // « 122600092/0 » ne retrouve pas « 1226000920 ».
    if (normalizeRef(l.name).includes(ref)) return true
    if (normalizeRef(l.url).includes(ref)) return true
  }
  const needle = foldText(raw)
  return needle.length >= 3 && foldText(l.name ?? '').includes(needle)
}

/** Résultats d'UN site, sans conserver son index. */
export function scanSite(site: GlobalSearchSite, listings: CompetitorListing[], q: string): GlobalHit | null {
  let count = 0
  let sample: CompetitorListing | null = null
  for (const l of listings) {
    if (!listingMatchesKey(l, q)) continue
    count++
    if (!sample) sample = l
  }
  return sample ? { siteId: site.siteId, domain: site.domain, count, sample } : null
}
