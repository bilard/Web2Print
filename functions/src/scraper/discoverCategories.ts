import { load } from 'cheerio'

interface CategoryLink {
  url: string
  label: string
  score: number
}

/**
 * Découvre les liens internes (catégories, menus, sections) d'une home page
 * et les classe par matching de mots-clés dans le libellé ou l'URL.
 *
 * Ne dépend d'aucune structure site-spécifique : on ratisse tous les <a>
 * internes, on filtre les liens non-catégorie (contact, panier, etc.) puis
 * on scoree par mot-clé.
 */
export function discoverCategories(
  html: string,
  baseUrl: string,
  keywords: string[],
): CategoryLink[] {
  const $ = load(html)
  const origin = safeOrigin(baseUrl)
  const seen = new Map<string, CategoryLink>()
  const lowerKw = keywords.map((k) => k.toLowerCase()).filter(Boolean)

  const EXCLUDE = /(contact|mon-compte|account|panier|cart|checkout|login|register|blog|actualit|mentions|cgv|privacy|cookie|faq|help|aide|wishlist|newsletter|search|recherche|sitemap|#|javascript:|tel:|mailto:)/i

  $('a[href]').each((_, el) => {
    const $a = $(el)
    const href = $a.attr('href')
    if (!href) return
    let url: string
    try {
      url = new URL(href, baseUrl).toString()
    } catch {
      return
    }
    if (safeOrigin(url) !== origin) return
    if (EXCLUDE.test(url)) return
    // on veut des pages sans query params lourds (filtres)
    const u = new URL(url)
    if (u.search && u.search.length > 40) return
    const cleanUrl = `${u.origin}${u.pathname}`
    const label = ($a.text() || $a.attr('title') || '').replace(/\s+/g, ' ').trim()
    if (!label || label.length > 120) return

    const haystack = `${label} ${u.pathname}`.toLowerCase()
    let score = 0
    for (const kw of lowerKw) {
      if (!kw) continue
      if (haystack.includes(kw)) score += 10
      // matching partiel sur tokens
      for (const token of kw.split(/\s+/)) {
        if (token.length >= 4 && haystack.includes(token)) score += 3
      }
    }

    const existing = seen.get(cleanUrl)
    if (!existing || existing.score < score) {
      seen.set(cleanUrl, { url: cleanUrl, label, score })
    }
  })

  return Array.from(seen.values())
    .filter((l) => l.score > 0)
    .sort((a, b) => b.score - a.score)
}

function safeOrigin(u: string): string {
  try {
    return new URL(u).origin
  } catch {
    return ''
  }
}
