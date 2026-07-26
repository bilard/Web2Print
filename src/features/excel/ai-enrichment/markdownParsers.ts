// Extraction des données produit depuis le Markdown renvoyé par le scraping
// (Jina Reader et consorts) : specs, description, variantes, caractéristiques,
// images.
//
// Ces parseurs encodent les formes réelles rencontrées sur les sites marchands
// et fabricants — tableaux, listes à puces, blobs de caractéristiques collés,
// vignettes à dé-vignetter. Chaque cas particulier vient d'une fiche produit
// qui sortait fausse : ne pas « simplifier » un motif sans un contre-exemple.
//
// Module pur (aucun réseau, aucun état) : testable seul.
// Le nettoyage AMONT du Markdown vit dans `markdownSanitize.ts`.
import { debugLog } from '@/lib/debugLog'
import { isJunkImageUrl } from './imageFilter'



/** Retire le préfixe du nom de colonne dans la valeur d'une cellule markdown.
 *  Certains sites (ex: Nicoll) rendent les tables responsive où chaque cellule
 *  commence par le nom de colonne (data-label CSS). Ex: colonne "Couleur" +
 *  cellule "Couleur Noir" → "Noir". Si la cellule ne contient que le header
 *  (aucune valeur), retourne chaîne vide. */
function stripCellHeaderPrefix(colName: string, val: string): string {
  if (!val?.trim()) return ''
  const v = val.trim()
  const normCol = colName.replace(/[.\s]+$/g, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const normVal = v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (normVal.startsWith(normCol)) {
    const rest = v.slice(colName.replace(/[.\s]+$/g, '').length).replace(/^[\s.:;,\-–—]+/, '').trim()
    return rest
  }
  return v
}

/** Détermine si une valeur de cellule est du bruit (prix masqué derrière login, markdown vide, etc.) */
function isJunkCellValue(v: string): boolean {
  if (!v) return true
  // Liens de login/modal markdown : "[](https://.../login)" ou similaire
  if (/^\[\]?\]?\(https?:\/\/[^)]*(login|modal|auth)/i.test(v)) return true
  return false
}

export function parseVariantsFromMarkdown(md: string): Array<{ reference: string; label: string; properties: Record<string, string> }> {
  const variants: Array<{ reference: string; label: string; properties: Record<string, string> }> = []

  const lines = md.split('\n')
  let headers: string[] = []
  let inTable = false
  let refIdx = -1
  let labelIdx = -1

  for (let li = 0; li < lines.length; li++) {
    const trimmed = lines[li].trim()

    if (trimmed.startsWith('|') && trimmed.endsWith('|') && !inTable) {
      const cells = trimmed.split('|').map(c => c.trim()).slice(1, -1)
      const refCol = cells.findIndex(c => /^r[eé]f|^code|^sku|^article|^part\s*n|^model/i.test(c))
      if (refCol >= 0) {
        headers = cells
        refIdx = refCol
        labelIdx = cells.findIndex(c => /^(libell[eé]|d[eé]signation|description|nom|produit|name|product)/i.test(c))
        inTable = true
        continue
      }
    }

    if (inTable && /^\|[\s-:|]+\|$/.test(trimmed)) continue

    if (inTable && trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed.split('|').map(c => c.replace(/\*\*/g, '').trim()).slice(1, -1)
      if (cells.length >= headers.length - 1 && refIdx < cells.length) {
        // Strip header prefix des cellules ref et label
        const refRaw = cells[refIdx]
        const ref = stripCellHeaderPrefix(headers[refIdx] || 'Réf.', refRaw)
        if (!ref || /^[-:]+$/.test(ref)) continue
        const labelRaw = labelIdx >= 0 && labelIdx < cells.length ? cells[labelIdx] : ''
        const label = stripCellHeaderPrefix(headers[labelIdx] || 'Libellé', labelRaw)
        const properties: Record<string, string> = {}
        headers.forEach((h, idx) => {
          if (idx === refIdx || idx === labelIdx || idx >= cells.length) return
          const cleaned = stripCellHeaderPrefix(h, cells[idx])
          if (cleaned && !isJunkCellValue(cleaned)) {
            properties[h] = cleaned
          }
        })
        variants.push({ reference: ref, label, properties })
      }
      continue
    }

    if (inTable && !trimmed.startsWith('|')) {
      inTable = false
      headers = []
    }
  }

  // Fallback : patterns de référence dans des listes
  if (variants.length === 0) {
    const refLineRe = /^[>*-]?\s*\**([A-Z]{1,4}\d{2,6}[A-Z]{0,3})\**\s*[-–—]\s*(.+)/gm
    let match
    while ((match = refLineRe.exec(md)) !== null) {
      const ref = match[1].trim()
      const rest = match[2].trim()
      const parts = rest.split(/\s*[-–—,]\s*/)
      const label = parts[0] || ''
      const properties: Record<string, string> = {}
      for (let i = 1; i < parts.length; i++) {
        if (parts[i]) {
          if (/^(noir|blanc|rouge|bleu|vert|gris|jaune)/i.test(parts[i])) {
            properties['Couleur'] = parts[i]
          } else {
            properties[`Col${i}`] = parts[i]
          }
        }
      }
      if (ref) variants.push({ reference: ref, label, properties })
    }
  }

  // Phase 2 : enrichir chaque variante avec les specs "Clé : Valeur" qui suivent
  if (variants.length > 0) {
    const refSet = new Map<string, number>()
    for (let vi = 0; vi < variants.length; vi++) {
      refSet.set(variants[vi].reference.toUpperCase(), vi)
    }
    let currentVariantIdx = -1
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('|')) continue
      const refMatch = trimmed.match(/\b([A-Z]{1,6}\d{2,8}[A-Z]{0,4})\b/)
      if (refMatch) {
        const found = refSet.get(refMatch[1].toUpperCase())
        if (found !== undefined) { currentVariantIdx = found; continue }
      }
      if (currentVariantIdx >= 0) {
        const kvMatch = trimmed.match(/^[*\-•]?\s*\**([^:*]{2,40})\**\s*:\s*(.+)$/)
        if (kvMatch) {
          const key = kvMatch[1].replace(/\*\*/g, '').trim()
          const value = kvMatch[2].replace(/\*\*/g, '').trim()
          if (key && value && !/tarif|prix|price/i.test(key)) {
            variants[currentVariantIdx].properties[key] = value
          }
        }
      }
    }
  }

  // Phase 3 : parser les blobs "Caractéristiques ... Voir moins" rendus par Jina
  // (ex: Nicoll où chaque ligne d'accordéon étalée inline contient ~26 attributs).
  // Les blobs apparaissent dans l'ordre des variantes → merge par index.
  if (variants.length > 0) {
    const blobs = extractCharacteristicsBlobs(md)
    if (blobs.length > 0) {
      for (let i = 0; i < Math.min(blobs.length, variants.length); i++) {
        const parsed = parseCharacteristicsBlob(blobs[i])
        for (const [k, v] of Object.entries(parsed)) {
          if (!variants[i].properties[k]) variants[i].properties[k] = v
        }
      }
    }
  }

  return variants
}

/** Extrait tous les blobs "Caractéristiques <contenu> Voir moins" du markdown, dans l'ordre. */
function extractCharacteristicsBlobs(md: string): string[] {
  const blobs: string[] = []
  const re = /Caract[eé]ristiques\s+([^|]+?)\s+Voir\s+moins/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(md)) !== null) {
    const content = m[1].trim()
    if (content.length > 20 && content.includes(' : ')) blobs.push(content)
  }
  return blobs
}

/** Parse un blob inline "K1 : V1 K2 : V2 ..." en paires nom/valeur.
 *  Le parser repère les frontières via le pattern d'un nom de clé
 *  (majuscule initiale + lettres/espaces/apostrophes/tirets + " : "). */
function parseCharacteristicsBlob(blob: string): Record<string, string> {
  const result: Record<string, string> = {}
  // Nettoyage léger
  const cleaned = blob.replace(/\s+/g, ' ').trim()
  // Pattern : clé = majuscule initiale (accents OK), ≤6 mots alphabétiques ; puis " : " ; puis
  // valeur jusqu'au prochain pattern de clé ou fin. Lookahead non-greedy.
  const pat = /([A-ZÉÈÊÀÂÎÔÛÇ][A-Za-zÀ-ÿ'’\- ]*?)\s*:\s*(.+?)(?=\s+[A-ZÉÈÊÀÂÎÔÛÇ][A-Za-zÀ-ÿ'’\- ]*?\s*:\s|\s*$)/g
  let m: RegExpExecArray | null
  while ((m = pat.exec(cleaned)) !== null) {
    const key = m[1].trim()
    const value = m[2].trim()
    if (!key || !value) continue
    // Filtrer clés trop courtes ou clairement du bruit
    if (key.length < 2 || key.length > 60) continue
    if (/tarif|prix|price/i.test(key)) continue
    result[key] = value
  }
  return result
}

/** Extrait toutes les URLs d'images produit depuis le markdown Jina.
 *  Gère : ![alt](url), Images Summary Jina, URLs brutes avec extension,
 *  et URLs CDN sans extension claire (dans le contexte d'une section images).
 */
/** Extrait le "stem" d'une URL d'image pour dédup : dernier segment path,
 *  extensions retirées (gère les doubles .jpg.webp de Drupal imagecache). */
export function imageStem(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\/$/, '')
    const last = path.split('/').pop() || ''
    // CDN à ASSET EN QUERY (Adobe Scene7 `/is/image/co?src=co/REF_A1&…`) : le
    // pathname est identique pour TOUTES les vues — sans l'asset de la query,
    // la dédup collapsait la galerie entière en 1 image. On stemme sur l'asset.
    if (!/\.[a-z0-9]{2,5}$/i.test(last)) {
      const asset = u.searchParams.get('src') || u.searchParams.get('image') || u.searchParams.get('asset')
      if (asset) return asset.toLowerCase()
    }
    return last.replace(/\.(jpe?g|png|webp|avif|gif|svg)(\.(jpe?g|png|webp|avif|gif))?$/i, '').toLowerCase()
  } catch { return url }
}

/** Test si une URL d'image pointe vers un chemin "produit" (CMS avec segment produits). */
const PRODUCT_PATH_RE = /\/(products?|produits?|product[-_]images?|product[-_]photos?|catalog\/products?|catalogue\/produits?)\//i

/** Canonicalise une URL Drupal imagecache → URL originale (haute résolution).
 *  Ex: /sites/default/files/styles/<style>/public/products/34955.jpg.webp?itok=xyz
 *   →  /sites/default/files/products/34955.jpg
 *  Si pas de pattern Drupal, retourne l'URL telle quelle. */
function canonicalizeImageUrl(url: string): string {
  try {
    const u = new URL(url)
    // Pattern Drupal : /styles/<style>/public/<rest>
    const styleMatch = u.pathname.match(/^(.*?)\/styles\/[^/]+\/public\/(.+)$/)
    if (styleMatch) {
      const [, prefix, rest] = styleMatch
      // Retirer la double extension ajoutée par imagecache (.jpg.webp → .jpg)
      const cleanRest = rest.replace(/\.(jpe?g|png|gif)\.(webp|avif)$/i, '.$1')
      u.pathname = `${prefix}/${cleanRest}`
      u.search = '' // retirer ?itok=...
      return u.toString()
    }
    return url
  } catch {
    return url
  }
}

export function parseImagesFromMarkdown(md: string): string[] {
  // On parcourt le markdown FULL — la troncature avalait :
  //   - les blocs `JINA_EXTRACTED_IMAGES_*` (Jina les injecte en queue ; et
  //     le scrape fabricant fusionne POST + GET → DEUX blocs distincts dont
  //     un seul était lu via `indexOf`),
  //   - les inline `![](url)` du carousel produit principal (les sites
  //     Drupal placent souvent leur galerie après une section qui matche
  //     le cutoff ex: "Documents" / "Téléchargements"),
  //   - l'Images Summary, Image N: url, og:image, Links Summary placés en
  //     fin de markdown.
  // Le filtrage des images de related-products se fait via `isJunkImageUrl`
  // (mégamenu, doc-carousel, picto, logo) puis le sélecteur PRODUCT_PATH_RE
  // + dedup par stem en fin de fonction — pas besoin de tronquer le source.
  const fullMd = md

  const seen = new Set<string>()
  const images: string[] = []

  const addImg = (url: string) => {
    const raw = url.trim().replace(/[)>\]}\s]+$/, '')
    if (!raw || !raw.startsWith('http') || isJunkImageUrl(raw)) return
    // Canonicaliser les URLs Drupal styled → original (haute résolution)
    const u = canonicalizeImageUrl(raw)
    if (seen.has(u)) return
    seen.add(u)
    images.push(u)
  }

  // 1. TOUS les blocs Jina injected images (JINA_EXTRACTED_IMAGES_START/END).
  //    La fusion POST + JSON dans `jinaScrapeMaufacturerPage` produit deux
  //    blocs successifs (30 + 69 images) — il faut les parcourir tous, pas
  //    seulement le premier.
  for (const m of fullMd.matchAll(/JINA_EXTRACTED_IMAGES_START\s*([\s\S]*?)\s*JINA_EXTRACTED_IMAGES_END/g)) {
    for (const line of m[1].split('\n')) {
      const url = line.trim()
      if (url && /^https?:\/\//.test(url)) addImg(url)
    }
  }

  // 2. Inline markdown images: ![alt](url) — fullMd
  for (const m of fullMd.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)) {
    addImg(m[2])
  }

  // 3. Jina "Images Summary" / "Images:" section at end of markdown — fullMd
  //    Formats: "Image N (alt): url" or "[Image N (alt)](url)" or just plain URLs
  const imgSectionMatch = fullMd.match(/(?:^|\n)#{0,4}\s*(?:Images?\s*(?:Summary)?|Photos?)\s*:?\s*\n([\s\S]+?)(?:\n#{1,4}\s|\n\n---|\n\n\*\*|$)/im)
  if (imgSectionMatch) {
    const section = imgSectionMatch[1]
    // [alt](url) format
    for (const m of section.matchAll(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)) {
      addImg(m[1])
    }
    // Plain URL with image extension
    for (const m of section.matchAll(/(https?:\/\/[^\s)"\]]+\.(?:jpe?g|png|webp|gif|avif|svg)[^\s)"\]]*)/gi)) {
      addImg(m[1])
    }
    // Plain URL without clear extension (CDN urls in an image context)
    for (const m of section.matchAll(/(https?:\/\/[^\s)"\]]+)/g)) {
      const u = m[1]
      // Only include if it looks like a CDN/media URL (not a regular page)
      if (/(?:media|image|img|photo|cdn|asset|upload|static|product|catalog)[\/.]/i.test(u)) {
        addImg(u)
      }
    }
  }

  // 4. Plain URLs with image extensions — fullMd
  for (const m of fullMd.matchAll(/(https?:\/\/[^\s)"\]]+\.(?:jpe?g|png|webp|avif)[^\s)"\]]*)/gi)) {
    addImg(m[1])
  }

  // 5. Jina "Image N (alt): url" format (Jina range ces ancres en fin de md) — fullMd
  for (const m of fullMd.matchAll(/Image\s+\d+[^:]*:\s*(https?:\/\/[^\s)"\]]+)/gim)) {
    addImg(m[1])
  }

  // 6. og:image or meta image URLs in Jina metadata — fullMd
  for (const m of fullMd.matchAll(/(?:og:image|twitter:image|image_src|meta\s*image)\s*[:=]\s*(https?:\/\/[^\s)"\]]+)/gim)) {
    addImg(m[1])
  }

  // 7. Links Summary — Jina place ce bloc en queue de markdown — fullMd
  //    Format: [alt text](url.jpg) in a Links section
  const linksSectionMatch = fullMd.match(/(?:^|\n)#{0,4}\s*Links?\s*(?:Summary)?\s*:?\s*\n([\s\S]+?)(?:\n#{1,4}\s|$)/im)
  if (linksSectionMatch) {
    for (const m of linksSectionMatch[1].matchAll(/\[[^\]]*\]\((https?:\/\/[^)\s]+\.(?:jpe?g|png|webp|avif)[^)\s]*)\)/gi)) {
      addImg(m[1])
    }
  }

  // 8. Priorité images produit : si ≥2 URLs ont un segment /products/, filtrer à celles-ci
  //    + dédup par filename stem (supprime les variantes de taille Drupal/imagecache).
  const productImages = images.filter(u => PRODUCT_PATH_RE.test(u))
  const finalImages = productImages.length >= 2 ? productImages : images
  const seenStems = new Set<string>()
  const deduped: string[] = []
  for (const url of finalImages) {
    const s = imageStem(url)
    if (!s || !seenStems.has(s)) {
      seenStems.add(s)
      deduped.push(url)
    }
  }
  debugLog('[parseImagesFromMarkdown] fullMdLen=', fullMd.length, 'raw=', images.length, 'productMatch=', productImages.length, 'final=', deduped.length, 'sample:', deduped.slice(0, 3))
  return deduped
}

// ── Hook principal ──────────────────────────────────────────────────────────

/**
 * Cœur d'enrichissement HEADLESS (hors React) — c'est LE moteur du scraper PIM. Partagé par le hook
 * `useProductEnrichment` (UI PIM) ET le node de workflow `scrape-url` (via enrichRow). Accès au store
 * Zustand via `getState()` ; `onRunning` pilote le spinner UI quand appelé depuis le hook (no-op en
 * headless). Le corps est INCHANGÉ par rapport à l'ancienne `enrich` du hook.
 */
/** Wrapper d'observabilité : persiste l'issue + les dernières étapes de chaque
 *  run dans Firestore `pipelineRuns` (diagnostic prod sans reproduction).
 *  Couvre TOUS les appelants (PIM, node workflow, Telegram) — le moteur réel
 *  est enrichProductCoreInner. */


/**
 * Extrait le fil d'Ariane depuis l'en-tête markdown de Jina.
 * Stratégie : prendre la portion AVANT le premier H1 (où le breadcrumb apparaît
 * typiquement), repérer une ligne contenant ≥ 1 séparateur (`>`, `›`, `»`, `→`)
 * et ≥ 2 textes de liens markdown, filtrer les termes de navigation génériques,
 * dédupliquer en préservant l'ordre.
 */
export function parseBreadcrumbFromMarkdown(md: string): string[] {
  if (!md) return []

  const h1Idx = md.search(/^#\s+/m)
  const headPart = h1Idx > 0 ? md.slice(0, h1Idx) : md.slice(0, 4000)
  const lines = headPart.split('\n').map((l) => l.trim()).filter(Boolean)

  // Termes de navigation site, pas du breadcrumb produit
  const NAV_RE = /^(menu|recherche|fermer|connexion|connectez|se\s+connecter|inscription|inscrire|panier|wishlist|liste\s+de\s+souhaits?|mon\s+compte|aide|contact|nous\s+contacter|langue|country|english|fran[çc]ais|skip|aller\s+au|retour\s+(en\s+)?haut|tous?\s+les?\s+(produits|cat[eé]gories)|voir\s+(tout|plus))/i

  // Texte d'un lien markdown — on capture aussi du texte final hors lien éventuel
  const mdLinkRe = /\[([^\]\n]+?)\]\(([^)]+)\)/g

  for (const line of lines) {
    if (line.length > 800) continue
    const sepCount = (line.match(/[›>»→]/g) ?? []).length
    if (sepCount < 1) continue

    const linkTexts: string[] = []
    for (const m of line.matchAll(mdLinkRe)) {
      const t = m[1].replace(/^!\[.*?\]\(.*?\)\s*/, '').trim()
      if (!t || t.length > 80) continue
      if (/^[›>»→/|·]+$/.test(t)) continue
      if (/^!?\[.*\]/.test(t)) continue
      if (NAV_RE.test(t)) continue
      linkTexts.push(t)
    }

    if (linkTexts.length < 2 || linkTexts.length > 8) continue

    // Tenter de récupérer le dernier segment (souvent texte brut, pas un lien)
    // après le dernier séparateur de la ligne
    const lastSep = Math.max(line.lastIndexOf('›'), line.lastIndexOf('>'), line.lastIndexOf('»'), line.lastIndexOf('→'))
    if (lastSep > 0) {
      const tail = line.slice(lastSep + 1).replace(mdLinkRe, '').trim()
      if (tail && tail.length <= 80 && !/^[›>»→/|·]+$/.test(tail) && !NAV_RE.test(tail)) {
        linkTexts.push(tail)
      }
    }

    const seen = new Set<string>()
    const out: string[] = []
    for (const t of linkTexts) {
      const key = t.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(t)
    }
    if (out.length >= 2) {
      debugLog('[post-process] ✓ breadcrumb from markdown:', out)
      return out
    }
  }

  return []
}
