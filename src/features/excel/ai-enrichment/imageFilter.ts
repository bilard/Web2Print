/**
 * Filtre universel d'images parasites — partagé entre l'extraction live
 * (`parseImagesFromMarkdown`) et la sanitization au reload Firestore
 * (`sanitizeEnrichedProduct`). Découpé hors de `useProductEnrichment.ts`
 * pour casser la dépendance circulaire avec `enrichmentSanitize.ts`.
 */

/** Extrait les références candidates d'un produit pour classifier ses images.
 *  Sources combinées : specs (Référence/SKU/EAN/code produit/gencod), titre,
 *  variantes, dernier segment de l'URL produit (souvent le SKU numérique).
 *  Retourne les valeurs en minuscule, sans espaces, ≥ 4 caractères. */
export function getProductRefs(input: {
  specifications?: Array<{ name?: string; value?: string }>
  variants?: Array<{ reference?: string }>
  title?: string | null
  sourceUrl?: string | null
}): string[] {
  const refs = new Set<string>()
  const add = (raw: string | undefined | null) => {
    if (!raw) return
    const cleaned = raw.replace(/\s+/g, '').toLowerCase()
    if (cleaned.length >= 4 && /[\w-]{4,}/.test(cleaned)) refs.add(cleaned)
  }
  for (const s of input.specifications ?? []) {
    if (s.name && /r[eé]f[eé]rence|^sku$|\bsku\b|^ean$|\bean\b|gencod|code\s+(?:produit|article|barres?|commande)|num[eé]ro\s+(?:de\s+)?(?:s[eé]rie|article)/i.test(s.name)) {
      add(s.value)
    }
  }
  for (const v of input.variants ?? []) add(v.reference)
  // Title : extraire pattern modèle (2-5 majuscules + chiffres) ET tout token alphanumérique ≥ 4 chars
  if (input.title) {
    for (const m of input.title.matchAll(/\b([A-Z]{2,5}[\s-]?\d{1,4}[\w-]*)\b/g)) add(m[1])
  }
  // sourceUrl : dernier segment numérique (Jardiland: …-21334841 ; SAP: …/586183)
  if (input.sourceUrl) {
    try {
      const segs = new URL(input.sourceUrl).pathname.split('/').filter(Boolean)
      const last = segs[segs.length - 1] ?? ''
      for (const m of last.matchAll(/(?<![a-z])(\d{5,})(?![a-z])/gi)) add(m[1])
    } catch { /* URL invalide → ignorer */ }
  }
  return Array.from(refs)
}

/** Classifie une URL d'image : photo produit ou picto/logo.
 *  Stratégie multi-signal :
 *   1. URL contient une référence produit → photo (signal positif fort)
 *   2. URL ressemble à un picto/logo (heuristique nom/path) → picto (signal négatif fort)
 *   3. Ambigu → photo par défaut (les CDN comme Cloudinary/Akamai utilisent souvent
 *      des IDs internes ≠ SKU, donc l'absence de match ref dans l'URL n'est pas
 *      une preuve que c'est un picto). */
export function classifyImage(url: string, refs: string[]): 'photo' | 'picto' {
  const lower = url.toLowerCase()
  if (refs.some((r) => lower.includes(r))) return 'photo'
  if (isPictoOrLogo(url)) return 'picto'
  return 'photo'
}

/** Teste si une URL ressemble à un picto, logo, badge, certif, flag, seal,
 *  emblem ou autre marqueur visuel — par opposition à une photo produit.
 *  Utilisé en fallback par `classifyImage` quand aucune ref produit n'est
 *  disponible. Plus permissif que `isJunkImageUrl` qui rejette en amont. */
export function isPictoOrLogo(url: string): boolean {
  if (!url) return false
  // SVG = quasi toujours un picto/logo (formats vectoriels marketing).
  if (/\.svg(\?|$)/i.test(url)) return true
  try {
    const u = new URL(url)
    const filename = u.pathname.split('/').pop()?.toLowerCase() ?? ''
    const segments = u.pathname.split('/').filter(Boolean).map((s) => s.toLowerCase())
    // Filename commence ou contient logo/picto/badge/certif/flag/seal/etc.
    if (/(?:^|[-_])(?:logo|favicon|sprite|icon|ico|picto|pictogram|badge|certif|cert|stamp|seal|award|emblem|flag|trust|medal|ribbon|monogram)(?:[-_.]|$)/i.test(filename)) return true
    // Path segment dédié picto/logo (ex: /logos/, /icons/, /pictos/, /badges/)
    if (segments.some((s) => /^(logos?|icons?|icones?|pictos?|pictograms?|badges?|certificats?|certificates?|seals?|awards?|emblems?|trust|sprites?)$/i.test(s))) return true
    return false
  } catch {
    return false
  }
}

/** Teste si une URL est une image junk (logo, picto, badge, miniature de PDF,
 *  campagne marketing, mégamenu Drupal, asset global, réseau social, etc.). */
export function isJunkImageUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname
    const filename = path.split('/').pop()?.toLowerCase() ?? ''
    const segments = path.split('/').filter(Boolean)
    // Extensions non-photo : SVG et ICO quasi toujours des pictos/icônes.
    if (/\.(svg|ico)(\?|$)/i.test(url)) return true
    // Noms de fichier de pictos/logos/ornements (start ou milieu de nom).
    if (/^(logo|favicon|sprite|spacer|blank|pixel|transparent|1x1|beacon|icon|ico|picto|pictogram|badge|banner|bannière|flag|trust|seal|award|certif|cert|stamp|star|rating|review|note|etoile|medal|ribbon|bullet|check|tick|arrow|fleche|chevron|caret|cross|croix)\b/i.test(filename)) return true
    if (/[-_](logo|icon|avatar|favicon|sprite|spacer|pixel|tracking|beacon|picto|pictogram|badge|banner|flag|trust|seal|award|certif|stamp|star|rating|medal|ribbon|thumb|thumbnail|miniature|preview|placeholder|overlay|watermark|social|share|heart|favorite|wish|cart|bag|compare|print|printer)[-_.\d]/i.test(filename)) return true
    // Miniatures de PDF/docs
    if (/\.pdf\.(jpe?g|png|webp|avif)$/i.test(filename)) return true
    if (/^(fiche|notice|datasheet|tech[-_]?sheet|manual|doc|document|brochure|catalog|flyer)[-_.]/i.test(filename)) return true
    // Noms de fichier promotionnels (campagnes, tarifs, plaquettes commerciales).
    if (/^(tarif|tarifs|catalogue|plaquette|affiche|promo|promotion|campagne|actu|actualite|news|blog|article|hero|slide|slider|slideshow|bandeau|encart|flyer|landing|home|homepage|carousel[-_]?home)[-_.]/i.test(filename)) return true
    // Bannières marketing saisonnières/événementielles (FR e-commerce GSA/GSM).
    // Patterns observés : french-days, jardiversaire, anniversaire, soldes, blackfriday,
    // offre-printemps, jeu-concours, etc.
    if (/(?:french[-_]?days?|jardi[-_]?versaire|jardiversaire|anniversaire|soldes?|black[-_]?friday|cyber[-_]?monday|noel|christmas|saint[-_]?valentin|paques|easter|halloween|rentree|back[-_]?to[-_]?school|offre[-_]?printemps|offre[-_]?ete|offre[-_]?automne|offre[-_]?hiver|jeu[-_]?concours|coup[-_]?de[-_]?coeur|essentiel[-_]?campagne|moment[-_]?fort|ventes?[-_]?privees?|exclu[-_]?web|deal[-_]?du[-_]?jour|votez[-_]?pour|votre[-_]?magasin)/i.test(url)) return true
    // Path-based : /promotions/, /jardiversaire/, /campagne/, /jeu-concours/
    if (/\/(promotions?|campagnes?|jardi[-_]?versaire|operations?[-_]?commerciales?|jeu[-_]?concours|french[-_]?days?|soldes?|black[-_]?friday|offres?[-_]?speciales?|operations?[-_]?marketing|home[-_]?cards?|push[-_]?cards?|tile[-_]?cards?|key[-_]?visuals?)\//i.test(path)) return true
    // Drupal imagecache styles avec doc/thumb/icon/banner/news/...
    // (`push[-_]menu` / `menu[-_]push` = mégamenu Drupal — Nicoll & co.)
    const styleMatch = path.match(/\/styles\/([^/]+)\//i)
    if (styleMatch && /(^|[-_])(doc|docs|document|documents|pdf|notice|fiche|datasheet|brochure|thumb|mini|icon|logo|picto|badge|flag|banner|bandeau|hero|slide|slider|slideshow|promo|promotion|news|blog|actualite|article|campagne|landing|hp|home|homepage|carousel[-_]?home|segment|secteur|domaine|metier|chantier|reference|projet|inspiration|temoignage|partenaire|brand|marque|lifestyle|tarif|catalogue|plaquette|affiche|encart|application|push[-_]?menu|menu[-_]?push)([-_]|$)/i.test(styleMatch[1])) return true
    // Path segment dédié aux documents/logos/icônes/banners/news/segments/megamenu
    if (segments.some(s => /^(docs?|documents?|pdfs?|notices?|fiches?|brochures?|datasheets?|logos?|icons?|icones?|pictos?|badges?|banners?|bandeaux?|sliders?|slideshows?|heroes?|promos?|promotions?|news|blog|actualit[ée]s?|articles?|campagnes?|marketing|communication|segments?|secteurs?|domaines?|m[ée]tiers?|chantiers?|r[ée]f[ée]rences?|projets?|inspirations?|t[ée]moignages?|partenaires?|brands?|marques?|lifestyle|landing|home|homepage|hp|tarifs?|catalogues?|flyers?|affiches?|plaquettes?|encarts?|flags?|seals?|awards?|certificates?|ornements?|sprites?|assets[-_]?icons?|menu[-_]push|push[-_]menu|menu[-_]pushs?|pushs?[-_]menu)$/i.test(s))) return true
    // Drupal year-folder : /sites/.../files/[styles/<x>/public/]20XX/... = contenu promo/actu daté
    // (un produit légitime serait sous /products/ ou /produits/, pas dans un dossier d'année).
    if (/\/sites\/[^/]+\/files\/(?:styles\/[^/]+\/public\/)?(?:19|20)\d{2}\b/i.test(path) && !/\/produits?\//i.test(path)) return true
    // Réseaux sociaux — tester TOUTE l'URL pas juste les 2 derniers segments
    // (certains CDN placent le logo LinkedIn à /assets/social/logo/linkedin.png).
    if (/\b(facebook|fb[-_]|twitter|instagram|youtube|linkedin|tiktok|pinterest|whatsapp|telegram|snapchat|reddit|vimeo|xing|discord)\b/i.test(url)) return true
    // Chemins assets globaux (sans dossier produit/media identifiable).
    if (/\/(assets|static|public|dist|build|common|shared)\/(images?|img|icons?|logos?|svg|media)\//i.test(path)) return true
    // URL très petite (< 2 segments = probable asset global)
    if (segments.length <= 1) return true
    return false
  } catch {
    return false
  }
}
