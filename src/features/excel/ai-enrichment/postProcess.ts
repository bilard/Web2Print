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
export function enrichWithMarkdownGroups(enriched: EnrichedProduct, markdownContent: string | null): EnrichedProduct {
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

  // Dédupliquer par URL normalisée (un même PDF peut arriver plusieurs fois via
  // LLM + markdown + proxy CORS + reader Jina, chaque fois avec un titre différent).
  // On garde la PREMIÈRE occurrence (ordre : LLM → markdown) — cleanDocumentName
  // assure que le titre est lisible quel que soit le format source.
  const dedupedDocuments = deduplicateDocuments(cleanedDocuments)

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
export function sanitizeEnriched(enriched: EnrichedProduct): EnrichedProduct {
  // Description : vider si c'est du cookie/GDPR (court ou long)
  let description = enriched.description
  if (description && (isGarbageContent(description) || isMainlyGarbage(description))) {
    console.log('[sanitize] garbage description detected, clearing')
    description = ''
  }

  // Documents : nettoyer les noms génériques ("Télécharger", "Download", etc.)
  const documents = enriched.documents.map(doc => cleanDocumentName(doc))

  return {
    ...enriched,
    description,
    documents,
    advantages: enriched.advantages.filter(a => !isGarbageContent(a.text)),
    specifications: enriched.specifications.filter(s => !isGarbageContent(s.name) && !isGarbageContent(s.value)),
  }
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
      // Filtrer libellés d'onglets/CTAs (faux-positifs des zones résumé produit)
      if (UI_LABEL_KEY_RE.test(name)) continue
      if (UI_INDICATOR_VALUE_RE.test(value)) continue
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
