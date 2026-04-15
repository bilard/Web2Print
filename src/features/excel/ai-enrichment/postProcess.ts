import type { EnrichedProduct } from './types'
import {
  GARBAGE_RE,
  isGarbageContent,
  parseSpecsFromMarkdown,
  parseVariantsFromMarkdown,
  parseAdvantagesFromMarkdown,
} from './markdownParsers'

/**
 * Fusionne les groupes du markdown dans les avantages existants par matching textuel.
 * Ne supprime JAMAIS d'items existants — ajoute uniquement les groupes et éventuellement
 * les items manquants du markdown.
 */
export function mergeGroupsIntoAdvantages(
  existing: Array<{ text: string; group?: string }>,
  mdAdvantages: Array<{ text: string; group?: string }>,
): Array<{ text: string; group?: string }> {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-zàâéèêëîïôùûüç0-9]/g, ' ').replace(/\s+/g, ' ').trim()

  // Essayer de matcher chaque item existant avec un item markdown pour récupérer son groupe
  const result = existing.map(adv => {
    if (adv.group) return adv // déjà groupé
    const normAdv = normalize(adv.text)
    const match = mdAdvantages.find(md => {
      const normMd = normalize(md.text)
      return normMd === normAdv || normMd.includes(normAdv) || normAdv.includes(normMd)
    })
    return match?.group ? { ...adv, group: match.group } : adv
  })

  // Ajouter les items markdown qui n'ont pas de correspondance dans l'existant
  const existingNorms = new Set(existing.map(a => normalize(a.text)))
  for (const md of mdAdvantages) {
    const normMd = normalize(md.text)
    if (!existingNorms.has(normMd) && ![...existingNorms].some(e => e.includes(normMd) || normMd.includes(e))) {
      result.push(md)
    }
  }

  return result
}

/**
 * Post-processing : enrichit un EnrichedProduct avec les données du markdown source.
 * Le markdown est la SOURCE DE VÉRITÉ pour les groupes, les items manquants et les variantes.
 * Le LLM retourne tout à plat — le markdown conserve la structure d'origine.
 */
export function enrichWithMarkdownGroups(enriched: EnrichedProduct, markdownContent: string | null, productIds: string[] = []): EnrichedProduct {
  if (!markdownContent || markdownContent.length < 100) {
    console.log('[post-process] no markdown content, skipping')
    return enriched
  }

  console.log('[post-process] markdown length:', markdownContent.length, 'chars')
  // Log les lignes contenant des keywords features/avantages pour debug
  const featureLines = markdownContent.split('\n')
    .filter(l => /les\s*\+|avantage|caract[eé]ristique|points?\s*forts?|features?/i.test(l))
    .slice(0, 10)
  if (featureLines.length > 0) {
    console.log('[post-process] feature-related lines in markdown:', featureLines.map(l => l.trim().slice(0, 80)))
  }

  let { advantages, specifications, variants, description } = enriched

  // ── 0. Description : enrichir si le LLM a retourné un texte faible/vide ──
  const mdDescription = parseDescriptionFromMarkdown(markdownContent)
  if (mdDescription && mdDescription.length > 40) {
    if (!description || description.length < 40) {
      description = mdDescription
      console.log('[post-process] ✓ description from markdown:', description.slice(0, 80) + '…')
    } else if (mdDescription.length > description.length * 1.5) {
      // Le markdown a un texte significativement plus riche → le préférer
      description = mdDescription
      console.log('[post-process] ✓ replaced description with richer markdown version:', description.slice(0, 80) + '…')
    }
  }

  // ── 1. Advantages : JAMAIS réduire le nombre d'items ──
  // Le markdown peut contenir des groupes que le LLM/schema n'ont pas.
  // Règle : on ne remplace QUE si le markdown a STRICTEMENT PLUS d'items.
  // Sinon, on essaie d'ajouter les groupes aux items existants par matching textuel.
  const mdAdvantages = parseAdvantagesFromMarkdown(markdownContent)
  console.log('[post-process] markdown advantages:', mdAdvantages.length, 'items,', mdAdvantages.filter(a => a.group).length, 'grouped')
  console.log('[post-process] existing advantages:', advantages.length, 'items')
  if (mdAdvantages.length > 0) {
    if (mdAdvantages.length > advantages.length) {
      // Markdown a strictement plus d'items → le préférer
      advantages = mdAdvantages
      console.log('[post-process] ✓ replaced with markdown advantages:', advantages.length, 'items')
    } else if (mdAdvantages.some(a => a.group) && !advantages.some(a => a.group)) {
      // Markdown a des groupes, les items existants n'en ont pas → enrichir par matching
      advantages = mergeGroupsIntoAdvantages(advantages, mdAdvantages)
      console.log('[post-process] ✓ merged groups into existing advantages:', advantages.length, 'items,', advantages.filter(a => a.group).length, 'grouped')
    }
  }

  // ── 2. Specs : JINA block = source structurée fiable (extracteur DOM).
  //    Le LLM tronque souvent (budget tokens, priorité mal placée). Dès que
  //    le bloc JINA a STRICTEMENT plus de specs que le LLM, on préfère le
  //    bloc (avec groupes). Sinon on garde le LLM.
  const mdSpecs = parseSpecsFromMarkdown(markdownContent)
  const cleanSpecs = parseCleanSpecsFromJinaBlock(markdownContent)
  // Priorité : JINA block (DOM filtré) > LLM > markdown parser (dernier recours, peut gober du junk).
  let chosen: Array<{ name: string; value: string; group?: string }> | null = null
  let source = ''
  if (cleanSpecs.length > 0 && cleanSpecs.length >= specifications.length) {
    chosen = cleanSpecs; source = 'JINA block'
  } else if (specifications.length === 0 && mdSpecs.length > 0) {
    chosen = mdSpecs; source = 'markdown parser (fallback)'
  }
  if (chosen) {
    console.log('[post-process] ✓ specs preferred from', source + ':', chosen.length, 'items (LLM had', specifications.length, ', JINA block:', cleanSpecs.length, ', md parser:', mdSpecs.length, ')')
    specifications = chosen
  } else if (mdSpecs.length > 0 && mdSpecs.some(s => s.group) && !specifications.some(s => s.group)) {
    // Markdown a des groupes, pas le LLM → enrichir par matching
    specifications = specifications.map(spec => {
      const match = mdSpecs.find(ms => {
        const a = ms.name.toLowerCase().replace(/\s+/g, ' ')
        const b = spec.name.toLowerCase().replace(/\s+/g, ' ')
        return a === b || a.includes(b) || b.includes(a)
      })
      return match?.group ? { ...spec, group: match.group } : spec
    })
    console.log('[post-process] ✓ specs grouped:', specifications.filter(s => s.group).length, '/', specifications.length)
  }

  // ── 2bis. Backfill des specs omises par le LLM ──
  // Règle "100% des lignes" : si le markdown (JINA block ou parser) contient une
  // spec absente de la sortie LLM, on la rajoute. Match par nom normalisé.
  const sourceSpecs = cleanSpecs.length > 0 ? cleanSpecs : mdSpecs
  if (sourceSpecs.length > 0) {
    const normKey = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
    // Remplacement des values LLM vides/placeholder par la value du bloc source
    // (ex: Makita Tension LXT / BL Motor = checkmark → LLM retourne "" → bloc JINA a "Oui").
    const PLACEHOLDER_VALUE_RE = /^(valeur|value|-|–|n\/a|n\.a\.?)$/i
    const srcByKey = new Map(sourceSpecs.map(s => [normKey(s.name), s.value]))
    let filled = 0
    specifications = specifications.map(spec => {
      const isEmpty = !spec.value || !spec.value.trim() || PLACEHOLDER_VALUE_RE.test(spec.value.trim())
      if (!isEmpty) return spec
      const srcValue = srcByKey.get(normKey(spec.name))
      if (srcValue && srcValue.trim()) {
        filled++
        return { ...spec, value: srcValue }
      }
      return spec
    })
    if (filled > 0) {
      console.log('[post-process] ✓ filled', filled, 'empty/placeholder spec values from source block')
    }
    const existing = new Set(specifications.map(s => normKey(s.name)))
    const missing: typeof specifications = []
    for (const src of sourceSpecs) {
      const k = normKey(src.name)
      if (!k || existing.has(k)) continue
      // Match partiel pour tolérer les variations ("Tension" ≈ "Tension (V)")
      const partialHit = [...existing].some(e => e.includes(k) || k.includes(e))
      if (partialHit) continue
      missing.push(src)
      existing.add(k)
    }
    if (missing.length > 0) {
      specifications = [...specifications, ...missing]
      console.log('[post-process] ✓ backfilled', missing.length, 'missing specs from source:', missing.map(s => s.name))
    }
  }

  // ── 2bis-bis. Rejeter les specs UI chrome (cookies, consent, nav, player) ──
  //    Bouclier défensif si le LLM ou le parser ont gobé du bandeau RGPD /
  //    modale de cookies / raccourcis UI malgré les consignes du prompt.
  const UI_JUNK_RE = /cookie|consent|rgpd|gdpr|tracker|pixel|beacon|\b(leg\.?\s*interest|legitimate\s+interest)\b|search\s+icon|filter\s+icon|apply\s+cancel|\b(accept|refus|decline|personnalis|accepter|refuser|personnaliser|paramètres?\s+cookies?)\b|politique\s+(de\s+)?confidentialit|newsletter|s'inscrire|mon\s+compte|panier|\bintrouvable\b|^JINA_EXTRACTED_/i
  // Catégories de cookies (groupes de consentement RGPD). Quand un GROUPE spec
  // porte un de ces noms, la table entière est un tableau cookie, pas des specs
  // techniques. Cas réel Makita : "STRICTEMENT NÉCESSAIRE | FONCTIONNEL | …"
  // avec Finalité/Expiration/Prestataire/Nom.
  const COOKIE_CATEGORY_RE = /^(strictement\s+n[eé]cessaire|fonctionnel|statistiques?|marketing|publicit(?:é|aire)|analytique|performance|pr[eé]f[eé]rences?|ciblage|targeting|essential|necessary|functional|analytics|advertising)$/i
  const beforeFilter = specifications.length
  specifications = specifications.filter((s) => {
    const text = `${s.name} ${s.value} ${s.group ?? ''}`
    if (UI_JUNK_RE.test(text)) {
      console.log('[post-process] 🚫 rejected UI-junk spec:', s.name, '=', s.value, '(group:', s.group ?? '—', ')')
      return false
    }
    // Tableau de consentement cookies : group = catégorie de cookie RGPD.
    if (s.group && COOKIE_CATEGORY_RE.test(s.group.trim())) {
      console.log('[post-process] 🚫 rejected cookie-category spec:', s.name, '=', s.value, '(group:', s.group, ')')
      return false
    }
    // Faux-positif LLM : clé = libellé d'onglet ("Spécifications/Inclus/NOTES & AVIS/
    // Téléchargements") + valeur = indicateur ("Oui/Non/✓"). Milwaukee cas réel.
    if (UI_LABEL_KEY_RE.test(s.name) && UI_INDICATOR_VALUE_RE.test(s.value)) {
      console.log('[post-process] 🚫 rejected UI-tab-label spec:', s.name, '=', s.value)
      return false
    }
    // Nom vide/marqueur JINA ou clé = marqueur littéral (LLM hallucination)
    if (s.name.startsWith('JINA_EXTRACTED_')) {
      console.log('[post-process] 🚫 rejected JINA-marker spec:', s.name, '=', s.value)
      return false
    }
    return true
  })
  if (specifications.length !== beforeFilter) {
    console.log('[post-process] ✓ filtered', beforeFilter - specifications.length, 'UI-junk specs')
  }

  // ── 2ter. Dédup fuzzy par tokens : deux specs avec même valeur normalisée ET ──
  //    dont l'un des noms est un SOUS-ENSEMBLE TOKEN-À-TOKEN de l'autre sont
  //    considérées comme doublons. On garde le libellé le plus court (canonique).
  //    Protège contre les hallucinations LLM type "Débit (l/h)" vs
  //    "Débit max. avec aspiration de détergent (l/h)" (mêmes tokens {débit,l,h}
  //    côté court ⊆ tokens côté long, même valeur max. 500).
  //    Garde-fou : on exige value.length ≥ 2 pour ne pas fusionner les "oui/non".
  if (specifications.length >= 2) {
    const tokens = (s: string): Set<string> => {
      const norm = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      return new Set(norm.split(/[^a-z0-9]+/).filter(t => t.length > 0))
    }
    const normValue = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/[.,]/g, '')
    const isSubset = (a: Set<string>, b: Set<string>) => {
      for (const t of a) if (!b.has(t)) return false
      return a.size > 0
    }
    const kept: typeof specifications = []
    const keptTokens: Array<Set<string>> = []
    const dropped: Array<{ kept: string; drop: string; value: string }> = []
    for (const spec of specifications) {
      const tSpec = tokens(spec.name)
      const nVal = normValue(spec.value)
      if (nVal.length < 2) { kept.push(spec); keptTokens.push(tSpec); continue }
      const dupIdx = kept.findIndex((k, i) => {
        if (normValue(k.value) !== nVal) return false
        const tK = keptTokens[i]
        return isSubset(tSpec, tK) || isSubset(tK, tSpec)
      })
      if (dupIdx === -1) {
        kept.push(spec)
        keptTokens.push(tSpec)
      } else {
        // Garder le nom le plus court (typiquement le canonique)
        const existing = kept[dupIdx]
        if (spec.name.length < existing.name.length) {
          dropped.push({ kept: spec.name, drop: existing.name, value: spec.value })
          kept[dupIdx] = spec
          keptTokens[dupIdx] = tSpec
        } else {
          dropped.push({ kept: existing.name, drop: spec.name, value: spec.value })
        }
      }
    }
    if (dropped.length > 0) {
      console.log('[post-process] ✓ deduped', dropped.length, 'fuzzy duplicate specs:', dropped)
      specifications = kept
    }
  }

  // ── 3. Variants : extraire du markdown ──
  if (!variants || variants.length === 0) {
    variants = parseVariantsFromMarkdown(markdownContent)
    if (variants.length > 0) {
      console.log('[post-process] ✓ variants:', variants.length)
    }
  }

  // ── 3bis. Propriétés non-discriminantes → specifications ──
  // Une prop est "commune" si toutes les variantes qui la déclarent (≥2)
  // ont exactement la même valeur. On autorise les variantes sans cette prop
  // (ex: palettes sans accordéon détail) à ne pas la déclarer.
  // Les props communes sortent du tableau variantes et vont dans les specs
  // (groupe "Caractéristiques") — un seul endroit pour les attributs partagés.
  if (variants && variants.length >= 2) {
    const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const existingSpecNames = new Set(specifications.map(s => norm(s.name)))

    // Collecter toutes les clés présentes dans au moins une variante
    const allKeys = new Set<string>()
    for (const v of variants) for (const k of Object.keys(v.properties)) allKeys.add(k)

    const commonProps: Array<{ name: string; value: string }> = []
    for (const key of allKeys) {
      const nonEmpty = variants
        .map(v => v.properties[key]?.trim() || '')
        .filter(val => val.length > 0)
      // Au moins 2 déclarations, toutes identiques
      if (nonEmpty.length >= 2 && new Set(nonEmpty).size === 1) {
        if (!existingSpecNames.has(norm(key))) {
          commonProps.push({ name: key, value: nonEmpty[0] })
          existingSpecNames.add(norm(key))
        }
        // Retirer la clé de toutes les variantes (nettoie le tableau variantes)
        for (const v of variants) delete v.properties[key]
      }
    }

    if (commonProps.length > 0) {
      specifications = [
        ...specifications,
        ...commonProps.map(p => ({ name: p.name, value: p.value, group: 'Caractéristiques' })),
      ]
      console.log('[post-process] ✓', commonProps.length, 'props communes déplacées vers specifications')
    }
  }

  // ── 4. Documents : ajouter les PDFs trouvés dans le markdown (jamais en perdre) ──
  let { documents } = enriched
  const mdPdfUrls = [...markdownContent.matchAll(/https?:\/\/[^\s\)"\]]+\.pdf[^\s\)"\]]*/gi)].map(m => m[0])
  if (mdPdfUrls.length > 0) {
    const existingSet = new Set(documents)
    const newDocs = mdPdfUrls.filter(u => !existingSet.has(u))
    if (newDocs.length > 0) {
      documents = [...documents, ...newDocs]
      console.log('[post-process] ✓ added', newDocs.length, 'PDF docs from markdown')
    }
  }

  // ── 5. Documents titré "titre##url" depuis markdown links ──
  const mdLinks = [...markdownContent.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+\.pdf[^\s\)]*)\)/gi)]
  for (const m of mdLinks) {
    const title = m[1].trim()
    const url = m[2].trim()
    // Nettoyer les noms génériques via cleanDocumentName
    const titledDoc = `${title}##${url}`
    if (!documents.includes(url) && !documents.includes(titledDoc)) {
      documents.push(titledDoc)
    }
  }

  // Nettoyer tous les noms de documents (titres génériques → noms extraits de l'URL)
  const cleanedDocuments = documents.map(doc => cleanDocumentName(doc))

  // Rejeter les PDFs non-produit : doivent matcher au moins UN marqueur produit
  // (notice, manuel, datasheet, fiche technique, etc.) OU contenir un identifiant
  // produit (ref/SKU) dans titre/URL. Plus une blacklist corporate stricte.
  const productDocuments = cleanedDocuments.filter(doc => {
    if (isNonProductDoc(doc)) {
      console.log('[post-process] rejecting corporate doc:', doc)
      return false
    }
    if (!isProductDoc(doc, productIds)) {
      console.log('[post-process] rejecting non-whitelisted doc:', doc)
      return false
    }
    return true
  })

  // Dédupliquer par URL normalisée (un même PDF peut arriver plusieurs fois via
  // LLM + markdown + proxy CORS + reader Jina, chaque fois avec un titre différent).
  // On garde la PREMIÈRE occurrence (ordre : LLM → markdown) — cleanDocumentName
  // assure que le titre est lisible quel que soit le format source.
  const dedupedDocuments = deduplicateDocuments(productDocuments)

  return { ...enriched, description, advantages, specifications, variants, documents: dedupedDocuments }
}

/** Détecte si un texte est principalement du contenu cookie/GDPR (ratio de lignes garbage) */
export function isMainlyGarbage(text: string): boolean {
  const lines = text.split(/\n/).filter(l => l.trim().length > 10)
  if (lines.length === 0) return false
  const garbageLines = lines.filter(l => GARBAGE_RE.test(l))
  // Si plus de 30% des lignes sont garbage → considérer comme parasite
  return garbageLines.length / lines.length > 0.3
}

/** Nettoie un EnrichedProduct en retirant les contenus parasites */
export function sanitizeEnriched(enriched: EnrichedProduct, productIds: string[] = []): EnrichedProduct {
  // Description : vider si c'est du cookie/GDPR (court ou long)
  let description = enriched.description
  if (description && (isGarbageContent(description) || isMainlyGarbage(description))) {
    console.log('[sanitize] garbage description detected, clearing')
    description = ''
  }

  // Documents : nettoyer les noms génériques, puis whitelist produit stricte
  const documents = enriched.documents
    .map(doc => cleanDocumentName(doc))
    .filter(doc => {
      if (isNonProductDoc(doc)) {
        console.log('[sanitize] rejecting corporate doc:', doc)
        return false
      }
      if (!isProductDoc(doc, productIds)) {
        console.log('[sanitize] rejecting non-whitelisted doc:', doc)
        return false
      }
      return true
    })

  // Images : (1) écraser pictos/logos/badges marketing ; (2) ne conserver QUE
  // celles dont l'URL contient la référence produit. Si aucune ne matche la ref,
  // on tombe sur la liste anti-picto (évite l'affichage vide).
  const antiPicto = enriched.images.filter(u => !isPictoOrBadgeImage(u))
  const rejectedByPicto = enriched.images.length - antiPicto.length
  if (rejectedByPicto > 0) {
    console.log(`[sanitize] stripped ${rejectedByPicto} picto/badge image(s) from ${enriched.images.length}`)
  }
  const byRef = filterImagesByProductRef(antiPicto, productIds)
  const images = byRef.length ? byRef : antiPicto

  return {
    ...enriched,
    description,
    documents,
    images,
    advantages: enriched.advantages.filter(a => !isGarbageContent(a.text)),
    specifications: enriched.specifications.filter(s => !isGarbageContent(s.name) && !isGarbageContent(s.value)),
  }
}

/** Normalise une référence/ID pour matching dans une URL : "1.679-611.0" → "16796110". */
function normalizeRef(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Détecte picto/logo/badge/feature marketing depuis path ET filename.
 * Plus agressif qu'isJunkImage côté markdownParsers : attrape aussi les tokens
 * sans séparateur (madeingermany, vario_power, ssl_secured, world_record, etc.).
 */
export function isPictoOrBadgeImage(url: string): boolean {
  try {
    const u = new URL(url)
    const path = u.pathname.toLowerCase()
    const filename = decodeURIComponent(path.split('/').pop() ?? '')
    const segments = path.split('/').filter(Boolean)
    // Segment dédié
    if (segments.some(s => /^(logos?|pictos?|pictogram[a-z]*|icons?|icones?|badges?|brands?|flags?|labels?|stickers?|favicons?|apple-touch-icons?|features?|benefits?|highlights?|usps?|advantages?|campaigns?|promos?|promotions?|marketing|banners?|heros?|overlays?|schemas?|schematics?|illustrations?|trust|certified|certifications?|awards?|seals?)$/i.test(s))) return true
    // Préfixe / suffixe nom de fichier sur picto explicite
    if (/^(logo|picto|pictogram|favicon|sprite|spacer|blank|pixel|transparent|1x1|beacon|badge|flag|label|sticker|usp|feature|benefit|highlight|advantage|campaign|promo|banner|overlay|schema|schematic|illustration|icon|ic|ico|award|seal|trust|cert|certified|record|worldrecord)[\b_\-.\d]/i.test(filename)) return true
    if (/[-_](logo|picto|pictogram|icon|avatar|favicon|sprite|spacer|pixel|tracking|beacon|badge|flag|label|sticker|brand|usp|feature|benefit|highlight|advantage|campaign|promo|banner|overlay|schema|schematic|illustration|award|seal|trust|cert|record|worldrecord)(?:[-_.\d]|$)/i.test(filename)) return true
    // Tokens marketing Kärcher / multi-marques (sans séparateur nécessaire — on teste sur filename normalisé)
    const normalized = filename.toLowerCase().replace(/\.(jpe?g|png|webp|avif|gif|svg)$/, '')
    const MARKETING_TOKENS = [
      'madeingermany', 'worldrecord', 'guinness', 'recordholder',
      'sslsecured', 'trustsymbol', 'securepayment',
      'variopower', 'dirtblaster', 'powerboost', 'turboforce',
      'indicedereparabilite', 'indicereparabilite', 'reparabilite', 'durabilite',
      'energylabel', 'ecoscore', 'ecolabel', 'nutriscore',
      '100power', '200power', '300power',
      'ecoefficient', 'ecoperformance',
    ]
    if (MARKETING_TOKENS.some(t => normalized.includes(t))) return true
    // SVG / GIF / WEBP quasi-toujours déco (GIF = anim bannière, WEBP = visuel compressé marketing)
    if (/\.(svg|gif|webp)(\?|#|$)/i.test(filename)) return true
    return false
  } catch {
    return false
  }
}

/**
 * Conserve les images dont l'URL (dernier segment ou path) contient au moins un
 * productId normalisé (ref/SKU ≥ 4 caractères après normalisation). Retourne
 * une liste vide si rien ne matche — le caller gère le fallback.
 */
export function filterImagesByProductRef(images: string[], productIds: string[]): string[] {
  const normRefs = productIds
    .map(id => normalizeRef(id ?? ''))
    .filter(n => n.length >= 4)
  if (!normRefs.length || !images.length) return images
  const matched: string[] = []
  for (const url of images) {
    let haystack = ''
    try {
      const u = new URL(url)
      haystack = normalizeRef(decodeURIComponent(u.pathname))
    } catch {
      haystack = normalizeRef(url)
    }
    if (normRefs.some(r => haystack.includes(r))) matched.push(url)
  }
  console.log(`[sanitize] filterImagesByProductRef: refs=${JSON.stringify(normRefs)} kept=${matched.length}/${images.length}`)
  return matched
}

/** Noms de liens génériques qui doivent être remplacés par un nom extrait de l'URL */
export const GENERIC_DOC_NAMES_RE = /^(t[eé]l[eé]charger|download|voir|open|cliquez?\s*ici|click\s*here|lien|link|pdf|document|fichier|file|accéder|access)$/i

/**
 * Nettoie le nom d'un document :
 * - Si le titre est générique ("Télécharger"), extraire un nom lisible depuis l'URL
 * - Décoder les noms de fichiers URL-encodés
 * - Retirer les extensions et hashs illisibles
 */
export function cleanDocumentName(doc: string): string {
  if (!doc.includes('##')) {
    // URL brute sans titre → extraire un nom depuis l'URL
    const name = extractNameFromUrl(doc)
    return name ? `${name}##${doc}` : doc
  }

  const sepIdx = doc.indexOf('##')
  const title = doc.slice(0, sepIdx).trim()
  const url = doc.slice(sepIdx + 2)

  // Si le titre est générique, extraire un meilleur nom depuis l'URL
  if (GENERIC_DOC_NAMES_RE.test(title) || title.length < 3) {
    const betterName = extractNameFromUrl(url)
    return betterName ? `${betterName}##${url}` : doc
  }

  return doc
}

/** Extrait un nom lisible depuis une URL de document */
export function extractNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    // Dernier segment du path
    const filename = decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '')
    if (!filename) return ''
    // Retirer l'extension
    const withoutExt = filename.replace(/\.\w{2,4}$/, '')
    // Si c'est un hash/uuid, essayer le segment précédent
    if (/^[a-f0-9-]{20,}$/i.test(withoutExt) || withoutExt.length < 3) {
      const segments = pathname.split('/').filter(Boolean)
      if (segments.length >= 2) {
        const parent = decodeURIComponent(segments[segments.length - 2])
        if (parent.length > 3 && !/^[a-f0-9-]{20,}$/i.test(parent)) {
          return humanizeName(parent)
        }
      }
      return ''
    }
    return humanizeName(withoutExt)
  } catch {
    return ''
  }
}

/** Convertit un slug/filename en nom lisible : "fiche-technique_produit" → "Fiche technique produit" */
export function humanizeName(slug: string): string {
  const cleaned = slug
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length < 3) return ''
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

/**
 * Rejet des PDFs non-produit : corporate, légal/RGPD, RH, RSE, contrats,
 * newsletters, etc. S'appuie sur le nom du document ET l'URL (slug/path).
 */
const NON_PRODUCT_DOC_RE = /(?:^|[\s\-_\/.])(?:mentions?[-\s_]l[eé]gales?|confidentialit[eé]|privacy|privacy[-\s_]policy|cookies?|cgv|cgu|tos|terms|conditions?[-\s_]g[eé]n[eé]rales?|legal|rgpd|gdpr|charte|contrats?[-\s_]de[-\s_]services?|service[-\s_]packages?|recrutement|recruitment|carri[eè]res?|careers|jobs?|emploi|esg|rse|csr|sustainab[a-z]*|durabilit[eé]|co2|neutral|neutre|empreinte|carbon[e]?|climat[e]?|rapport[-\s_](?:annuel|rse|esg|dd|d[eé]veloppement)|investor|actionnaires?|newsletters?|lettre[-\s_]info|press|presse|communiqu[eé]|corporate|entreprise[-\s_]profile|company[-\s_]profile|about[-\s_]us|qui[-\s_]sommes|a[-\s_]propos|accessibilit[eé]|accessibility|faq|contact|sitemap|index|pricelist|tarifs?[-\s_]g[eé]n[eé]ral|liste[-\s_]prix|speak[-\s_]?up|speak[-\s_]avec|whistleblow|lanceur[-\s_]alerte|code[-\s_](?:conduct|ethique|conduite)|anti[-\s_]corruption|voirie|car[-\s_]wash|first[-\s_]climate|climate[-\s_]certificate|certificat[-\s_]climat)(?:[\s\-_\/.]|$)/i

/**
 * Mots-clés qui signent un document PRODUIT légitime (notice, manuel, fiche
 * technique, datasheet, déclaration de conformité, etc.). Au moins un doit
 * matcher le titre/URL/filename pour qu'un PDF soit conservé.
 */
const PRODUCT_DOC_POSITIVE_RE = /(?:^|[\s\-_\/.])(?:notice|manuel|manual|mode[-\s_]d['\s_]emploi|operating[-\s_]instructions?|owner[-\s_]manual|user[-\s_](?:manual|guide)|instructions?[-\s_]d['\s_]utilisation|instructions?|quick[-\s_]start|getting[-\s_]started|prise[-\s_]en[-\s_]main|datasheet|data[-\s_]sheet|spec[-\s_]sheet|specification[-\s_]sheet|fiche[-\s_](?:technique|produit|article|donn[eé]es|information|indice)|ft|fip|sds|msds|safety[-\s_]data|s[eé]curit[eé][-\s_](?:fiche|donn[eé]es)|assembly|montage|installation|d[eé]claration[-\s_](?:de[-\s_])?conformit[eé]|declaration[-\s_]of[-\s_]conformity|doc|doeu|doue|warranty|garantie|maintenance|entretien|r[eé]paration|service[-\s_]manual|brochure[-\s_]produit|product[-\s_]brochure|informations?[-\s_](?:produit|relatives?|relative[-\s_]au[-\s_]produit)|product[-\s_]information|fiche[-\s_]information|prospectus|catalog(?:ue)?[-\s_](?:produit|technique)|om|ug|bta|ba|pi|ma|oi|betriebsanleitung|bedienungsanleitung|indice[-\s_](?:de[-\s_])?(?:reparabilit[eé]|durabilit[eé])|reparabilit[eé]|durabilit[eé]|eco[-\s_]?score|energy[-\s_]label|ecolabel)(?:[\s\-_\/.]|$)/i

/**
 * Segments de path qui indiquent automatiquement un document produit
 * (hosted par le fabricant dans son arbo documentaire). Auto-acceptation.
 */
const PATH_PRODUCT_SEGMENT_RE = /\/(?:manuals?|datasheets?|notices?|fiches?|documentations?|brochures?|leaflets?|handbooks?|betriebsanleitungen?|bedienungsanleitungen?|manuels?|documents?\/(?:raw|datasheets?|manuals?|machines?|product))\//i

export function isNonProductDoc(entry: string): boolean {
  const sepIdx = entry.indexOf('##')
  const title = sepIdx > 0 ? entry.slice(0, sepIdx) : ''
  const url = sepIdx > 0 ? entry.slice(sepIdx + 2) : entry
  if (NON_PRODUCT_DOC_RE.test(title)) return true
  try {
    const u = new URL(url)
    if (NON_PRODUCT_DOC_RE.test(u.pathname)) return true
    const filename = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '')
    if (NON_PRODUCT_DOC_RE.test(filename)) return true
  } catch { /* URL brute non parsable → on se fie au titre */ }
  return false
}

/**
 * Retourne true si le document présente au moins UN marqueur produit explicite
 * dans son titre, son path ou son filename, OU s'il contient un identifiant
 * produit fourni (référence/SKU/modèle). Sinon, il est suspect et rejeté.
 */
export function isProductDoc(entry: string, productIds: string[] = []): boolean {
  const sepIdx = entry.indexOf('##')
  const title = sepIdx > 0 ? entry.slice(0, sepIdx) : ''
  const url = sepIdx > 0 ? entry.slice(sepIdx + 2) : entry
  const haystacks: string[] = [title]
  let filename = ''
  try {
    const u = new URL(url)
    haystacks.push(u.pathname)
    filename = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '')
    haystacks.push(filename)
  } catch { /* URL brute */ haystacks.push(url) }
  // 1. Marqueur produit explicite ?
  if (haystacks.some(h => PRODUCT_DOC_POSITIVE_RE.test(h))) return true
  // 1bis. Segment de path fabricant (ex: /manuals/, /datasheets/machines/) ?
  try {
    const u = new URL(url)
    if (PATH_PRODUCT_SEGMENT_RE.test(u.pathname)) return true
  } catch { /* URL brute → skip */ }
  // 2. Identifiant produit dans titre/URL ?
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const normTargets = haystacks.map(norm)
  for (const id of productIds) {
    const normId = norm(id)
    if (normId.length >= 3 && normTargets.some(t => t.includes(normId))) return true
  }
  return false
}

/** Déduplique les documents par URL normalisée (gère les entrées titre##url et urls brutes). */
export function deduplicateDocuments(docs: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const doc of docs) {
    // Extraire l'URL depuis le format "titre##url" ou URL brute
    const url = doc.includes('##') ? doc.split('##').pop()! : doc
    // Normaliser en gardant les query params (ils différencient les fact-tags, formats, etc.)
    const normalized = url.replace(/\/+$/, '').toLowerCase()
    if (!seen.has(normalized)) {
      seen.add(normalized)
      result.push(doc)
    }
  }
  return result
}

/**
 * Parse UNIQUEMENT le bloc JINA_EXTRACTED_SPECS (injecté par notre script ou
 * par l'extracteur HTML TS-side). Ne touche PAS au reste du markdown — évite
 * de récupérer les tables de cookies, accessoires, etc. Utilisé pour backfill
 * quand le LLM n'a rien retourné.
 */
/** Libellés d'onglets / sections / CTAs qui ressemblent à des specs quand
 *  une zone résumé produit a une structure 2-colonnes (Milwaukee, Leroy
 *  Merlin, etc.). Filtre appliqué en post-extraction DOM : générique. */
const UI_LABEL_KEY_RE = /^(documents?|t[eé]l[eé]chargements?|downloads?|sp[eé]cifications?|specs?|inclus|included|accessoires?|accessories|avis|reviews?|notes?(?:\s*[&et]+\s*avis)?|o[uù]\s*acheter|where\s*to\s*buy|choisir\s*(un\s*|le\s*)?mod[eè]le?|choose\s*(a\s*)?model|select\s*(a\s*)?model|services?|support|garantie|warranty|videos?|vid[eé]os?|galerie|gallery|questions?|faq|contact|partager|share|livraison|shipping|retour|return|stock|disponibilit[eé]|availability)$/i
const UI_INDICATOR_VALUE_RE = /^(oui|non|yes|no|true|false|trouve[rz]?\s+un\s+(magasin|revendeur)|find\s+a\s+(store|dealer)|en\s+savoir\s+plus|learn\s+more|voir\s+(plus|tout)|see\s+(more|all)|donner\s+votre?\s+avis|write\s+a\s+review)\s*$/i
const RATING_VALUE_RE = /^\d+[.,]?\d*\s*[\/(]\s*\d+\s*(avis|reviews?|\)|from)/i

export function parseCleanSpecsFromJinaBlock(md: string): Array<{ name: string; value: string; group?: string }> {
  const specs: Array<{ name: string; value: string; group?: string }> = []
  const seen = new Set<string>()
  const start = md.indexOf('JINA_EXTRACTED_SPECS_START')
  const end = md.indexOf('JINA_EXTRACTED_SPECS_END')
  if (start < 0 || end <= start) return specs
  const block = md.slice(start, end)
  let currentGroup: string | undefined
  const decodeHtml = (s: string) => s.replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c))).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  for (const line of block.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('GROUP:')) {
      currentGroup = decodeHtml(trimmed.slice(6).trim()) || undefined
    } else if (trimmed.includes(' = ')) {
      const eqIdx = trimmed.indexOf(' = ')
      const name = decodeHtml(trimmed.slice(0, eqIdx).trim())
      const value = decodeHtml(trimmed.slice(eqIdx + 3).trim())
      if (!name || !value) continue
      // Rejet faux-positif UI : name est un libellé d'onglet/CTA (ex: "Spécifications",
      // "Inclus", "Téléchargements"). UI_INDICATOR_VALUE_RE seul rejetterait de vraies
      // specs binaires ("Tension LXT = Oui", "BL Motor = Oui" sur Makita) → on ne
      // rejette sur value "Oui/Non" que lorsque name est aussi un UI label.
      if (UI_LABEL_KEY_RE.test(name)) continue
      if (RATING_VALUE_RE.test(value)) continue
      // Titre produit comme clé (long + marques commerciales ™®©) = ligne résumé, pas une spec
      if (name.length > 45 && /[™®©]/.test(name)) continue
      const key = `${name.toLowerCase()}::${value.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      specs.push({ name, value, group: currentGroup })
    }
  }
  return specs
}


export function parseDescriptionFromMarkdown(md: string): string {
  const lines = md.split('\n')

  // ── Helpers ──
  const isProseText = (s: string) =>
    s.length >= 40 && !s.startsWith('|') && !s.startsWith('#')
    && !/^\[.*\]\(.*\)$/.test(s) && !/^!\[/.test(s) && !s.startsWith('http')
    && !/^[-*•✓✔]\s/.test(s) && !isGarbageContent(s)
    && !/^\d+([.,]\d+)?\s*(b|kb|mb|gb|ko|mo|go|octets?|bytes?)\s*$/i.test(s)

  const clean = (s: string) => s.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim()

  // Sections qui contiennent typiquement de la description/prose
  const descSectionRe = /caract[eé]ristiques?\s*(du\s*produit|principales?|g[eé]n[eé]rales?)?|description|pr[eé]sentation|aper[çc]u|about|overview|introduction|r[eé]sum[eé]|en\s*bref|le\s*produit|d[eé]tail|points?\s*forts?\s*(du\s*produit)?|[eé]quipement\s*(et\s*application)?|informations?\s*compl[eé]ment/i
  // Sections techniques / non-descriptives → on sort de la description
  const nonDescSectionRe = /sp[eé]cification|descriptif\s*technique|donn[eé]es?\s*technique|fiche\s*technique|t[eé]l[eé]chargement|downloads?|documents?|r[eé]f[eé]rences?|variantes?|accessoires?\s*(?:associ|inclus|compatib)|avis|reviews?|galerie|vid[eé]os?|questions?|faq|contact|prix|tarif|dimensions?\s*et|table\s*des?\s*mati[eè]res/i

  // ── Phase 1 : texte entre le H1 et le premier H2 ──
  const phase1Parts: string[] = []
  let afterTitle = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^#\s/.test(trimmed)) { afterTitle = true; continue }
    if (!afterTitle) continue
    if (/^#{2,}\s/.test(trimmed)) break
    if (!trimmed) continue
    const c = clean(trimmed)
    if (isProseText(c)) phase1Parts.push(c)
    if (phase1Parts.length >= 4) break
  }

  // ── Phase 2 : texte dans les sections descriptives (## Caractéristiques du produit, etc.) ──
  const phase2Parts: string[] = []
  let inDescSection = false
  for (const line of lines) {
    const trimmed = line.trim()

    // Heading markdown
    if (/^#{2,4}\s/.test(trimmed)) {
      const heading = trimmed.replace(/^#{2,4}\s+/, '')
      if (nonDescSectionRe.test(heading)) {
        inDescSection = false
        continue
      }
      if (descSectionRe.test(heading)) {
        inDescSection = true
        continue
      }
      // Heading inconnu : quitter la section desc en cours
      if (inDescSection) {
        inDescSection = false
        continue
      }
      continue
    }

    // Titre en bold sur une ligne seule (format Bosch : **Points forts du produit**)
    const boldLine = trimmed.match(/^\*\*(.+?)\*\*\s*$/)
    if (boldLine) {
      const heading = boldLine[1]
      if (nonDescSectionRe.test(heading)) {
        inDescSection = false
        continue
      }
      if (descSectionRe.test(heading)) {
        inDescSection = true
        continue
      }
    }

    if (!inDescSection) continue
    if (!trimmed) continue
    const c = clean(trimmed)
    if (isProseText(c)) {
      const norm = c.toLowerCase().slice(0, 50)
      if (!phase2Parts.some(p => p.toLowerCase().slice(0, 50) === norm)) {
        phase2Parts.push(c)
      }
    }
    if (phase2Parts.length >= 8) break
  }

  // ── Phase 3 : fallback — trouver le plus long bloc de prose consécutif dans tout le markdown ──
  const phase3Parts: string[] = []
  if (phase1Parts.length === 0 && phase2Parts.length === 0) {
    let currentBlock: string[] = []
    let bestBlock: string[] = []
    let bestLen = 0
    for (const line of lines) {
      const trimmed = line.trim()
      const c = clean(trimmed)
      if (trimmed && isProseText(c) && c.length >= 50) {
        currentBlock.push(c)
      } else {
        const blockLen = currentBlock.reduce((s, p) => s + p.length, 0)
        if (blockLen > bestLen) {
          bestBlock = [...currentBlock]
          bestLen = blockLen
        }
        currentBlock = []
      }
    }
    // Vérifier le dernier bloc
    const blockLen = currentBlock.reduce((s, p) => s + p.length, 0)
    if (blockLen > bestLen) bestBlock = currentBlock
    if (bestBlock.length > 0) phase3Parts.push(...bestBlock.slice(0, 6))
  }

  // ── Sélection du meilleur résultat ──
  // Préférer Phase 2 (section descriptive identifiée) si elle a du contenu riche
  // Sinon Phase 1 (après le titre), sinon Phase 3 (fallback prose)
  const phase2Text = phase2Parts.join('\n\n').trim()
  const phase1Text = phase1Parts.join('\n\n').trim()
  const phase3Text = phase3Parts.join('\n\n').trim()

  // Si Phase 2 a trouvé du contenu riche, le préférer
  if (phase2Text.length > phase1Text.length && phase2Text.length >= 50) {
    return phase2Text
  }
  // Si Phase 1 a du contenu décent, le combiner avec Phase 2
  if (phase1Text.length >= 50) {
    if (phase2Text.length >= 50) {
      // Les deux ont du contenu — combiner en évitant les doublons
      const combined = phase1Text
      const p2Norm = phase2Text.toLowerCase().slice(0, 50)
      if (!combined.toLowerCase().includes(p2Norm.slice(0, 30))) {
        return (combined + '\n\n' + phase2Text).trim()
      }
      return combined
    }
    return phase1Text
  }
  // Fallback : Phase 2 ou Phase 3
  if (phase2Text.length >= 40) return phase2Text
  if (phase3Text.length >= 40) return phase3Text

  // Dernier recours : H1 comme description minimale
  const h1Match = md.match(/^#\s+(.+)/m)
  if (h1Match) return clean(h1Match[1])

  return ''
}
