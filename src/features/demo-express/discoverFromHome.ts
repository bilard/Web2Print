// src/features/demo-express/discoverFromHome.ts
// Descente automatique depuis l'URL DE BASE du prospect : l'accueil est un
// « hub » (menu, pas de cartes produit) — on récupère ses liens par DEUX
// sources en parallèle, comme discover() : Jina Reader (règle « Jina
// d'abord » ; tier anonyme accepté) ET la Cloud Function Puppeteer (robuste
// SPA), chacune tolérant l'échec de l'autre. Puis on filtre les rubriques
// plausibles du catalogue, et l'appelant explore chacune jusqu'à trouver des
// produits. Filtrage GÉNÉRALISTE (jamais de logique par enseigne).
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { jinaRead } from '@/features/scraping/useJina'

interface HomeLinks {
  links?: string[]
  navLinks?: string[]
  cardLinks?: { url: string; title: string }[]
}

const extractBreadcrumbFn = httpsCallable<{ url: string }, HomeLinks>(functions, 'extractBreadcrumb')

/** Chemins qui ne mènent jamais au catalogue (institutionnel, compte, légal…). */
const EXCLUDE_PATH_RE =
  /(contact|blog|actualit|news|presse|cgv|cgu|mention|legal|panier|cart|checkout|login|connexion|inscription|compte|account|register|faq|aide|help|a-propos|about|qui-sommes|recrutement|carriere|jobs|magasin|store-locator|agence|service|livraison|retour|paiement|garantie|newsletter|plan-du-site|sitemap|politique|privacy|cookie|rgpd|devis|tel:|mailto:)/i

const FILE_EXT_RE = /\.(pdf|jpe?g|png|webp|gif|svg|zip|xml|js|css)(\?|#|$)/i

/**
 * Rubriques candidates du site (ordre du menu = ordre de la taxonomie).
 * navLinks (menu/footer) d'abord — c'est là que vit l'arborescence — puis le
 * reste des liens en complément.
 */
export async function discoverCategories(baseUrl: string): Promise<string[]> {
  const [cloud, jinaLinks] = await Promise.all([
    extractBreadcrumbFn({ url: baseUrl }).then((r) => r.data).catch(() => ({}) as HomeLinks),
    jinaRead(baseUrl, { listing: true })
      .then((p) => Object.values(p.links ?? {}))
      .catch(() => [] as string[]),
  ])
  const base = new URL(baseUrl)
  const baseHost = base.hostname.replace(/^www\./, '')
  const basePath = base.pathname.replace(/\/+$/, '')
  // Menu (navLinks) d'abord — c'est l'arborescence — puis Jina, puis le reste.
  const candidates = [...(cloud.navLinks ?? []), ...jinaLinks, ...(cloud.links ?? [])]
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of candidates) {
    let u: URL
    try { u = new URL(raw, baseUrl) } catch { continue }
    if (u.hostname.replace(/^www\./, '') !== baseHost) continue
    const path = u.pathname.replace(/\/+$/, '')
    if (!path || path === basePath) continue // la home elle-même / ancres
    const depth = path.split('/').filter(Boolean).length
    if (depth > 3) continue
    if (EXCLUDE_PATH_RE.test(u.href)) continue
    if (FILE_EXT_RE.test(path)) continue
    const key = `${u.origin}${path}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}
