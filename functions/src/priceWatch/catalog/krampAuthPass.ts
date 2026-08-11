// Passe kramp AUTHENTIFIÉE d'un lot de produits, EN UNE PHASE : la page de recherche
// connectée /search/<réf> porte déjà URL fiche + réf + nom + prix HT. Pour chaque produit
// on cherche par réf BRUTE (kramp indexe la réf affichée, avec ses points) puis par EAN en
// repli — fetch PARESSEUX : dès qu'une requête apparie, on ne fetch pas les suivantes.
// Le prix retenu est celui de la CARTE prouvée (proveMatch exact), jamais un € d'ailleurs.
// Serveur-only.
import { familiesConflict } from './partFamily'
import { vetoedPair } from './match'
import { DEFAULT_PAIRING_RULES, type PairingRules } from './pairingRules'
import type { DirectedSourceProduct } from './searchDirected'
import type { CompetitorListing } from './competitorListing'
import { candidateKeys, proveMatch } from './keys'
import { parseKrampSearchCards } from './krampParse'
import { t, DEFAULT_LOCALE, type Locale } from '../../i18nMessages'

export interface KrampScrapeDep {
  /** login + navigation + scrape → map(url cible → markdown connecté). Injecté. */
  scrape: (urls: string[]) => Promise<Map<string, string>>
  signal?: { aborted: boolean }
  log?: (m: string) => void
  /** Langue des messages de run (cf. `HarvestDeps.locale`). Repli FR. */
  locale?: Locale
}
export interface KrampHit {
  productId: string
  listing: CompetitorListing
  evidence: string
}

const searchUrl = (q: string): string => `https://www.kramp.com/shop-fr/fr/search/${encodeURIComponent(q)}`

/** Au plus deux références d'origine par produit : chaque requête kramp est un appel
 *  Firecrawl d'une vingtaine de secondes, et les suivantes désignent le même produit. */
const MAX_ORIGIN_QUERIES = 2

/**
 * Requêtes de recherche kramp d'un produit. On cherche par la valeur AFFICHÉE (kramp
 * l'indexe telle quelle), pas la forme normalisée.
 *
 * ⚠⚠ Les références d'ORIGINE passent EN PREMIER, et c'est tout l'enjeu sur un catalogue
 * de pièces adaptables. Relevé en production : la recherche n'interrogeait que `ref`,
 * `ref2` et `ean` — trois codes INTERNES au distributeur — et kramp répondait « Aucun
 * résultat n'a été trouvé pour 1108421 » à chaque produit, run après run. Les références
 * d'origine étaient pourtant extraites depuis toujours (« Remplace origine: 516747, … »),
 * mais elles ne servaient qu'à l'APPARIEMENT : on savait reconnaître le bon produit sans
 * jamais savoir le chercher. Ce sont les seules clés qu'un concurrent puisse porter.
 */
function searchQueries(p: DirectedSourceProduct): string[] {
  const out: string[] = []
  for (const v of [...(p.originRefs ?? []).slice(0, MAX_ORIGIN_QUERIES), p.ref, p.ref2, p.ean]) {
    const q = String(v ?? '').trim()
    if (q && !out.includes(q)) out.push(q)
  }
  return out
}

export async function krampAuthPass(
  products: DirectedSourceProduct[],
  deps: KrampScrapeDep & { rules?: PairingRules },
): Promise<KrampHit[]> {
  const rules = deps.rules ?? DEFAULT_PAIRING_RULES
  const hits: KrampHit[] = []
  for (const p of products) {
    if (deps.signal?.aborted) break
    const keys = candidateKeys(p, rules)
    if (keys.length === 0) continue
    let hit: KrampHit | null = null
    for (const q of searchQueries(p)) {
      if (deps.signal?.aborted) break
      const url = searchUrl(q)
      const md = (await deps.scrape([url])).get(url) ?? ''
      // On PROUVE chaque carte de la page (pas seulement la 1re) et on retient le prix de
      // la carte appariée — corrige le rattachement de prix ET les résultats multiples.
      for (const c of parseKrampSearchCards(md)) {
        const proof = proveMatch(keys, { sku: c.ref, url: c.url, name: c.name }, rules)
        // Même veto que les deux autres chemins d'appariement : une carte dont le libellé
        // nomme une pièce incompatible est écartée, même si la référence correspond. Sans
        // lui, le canal Kramp authentifié serait le seul à laisser passer ce que les
        // autres refusent — cf. `matchProduct`.
        // Réglage « démentis unifiés » : ce canal applique alors EXACTEMENT la règle de
        // la matrice, au lieu du seul veto des familles.
        if (proof && (rules.unifyDirectedVetoes
          ? vetoedPair(p, c, proof, rules)
          : proof.evidence !== 'gtin13'
            && rules.familyVeto && familiesConflict(p.name, c.name, rules.extraFamilies))) continue
        if (proof) {
          hit = {
            productId: p.id,
            listing: { url: c.url, name: c.name, ref: c.ref, price: c.price, currency: 'EUR', taxIncluded: false },
            evidence: proof.evidence,
          }
          break
        }
      }
      if (hit) break // réf appariée → repli EAN inutile (économie de crédits)
    }
    if (hit) {
      hits.push(hit)
      deps.log?.(t(deps.locale ?? DEFAULT_LOCALE, 'run.directed.krampHit', {
        // `price` est optionnel : String() conserve le rendu d'origine (« undefined »)
        // plutôt que d'inventer une valeur.
        name: hit.listing.name, price: String(hit.listing.price), evidence: hit.evidence,
      }))
    }
  }
  return hits
}
