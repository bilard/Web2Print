import { isGarbageContent } from './garbageFilter'

/** Lignes de métadonnées produit ("Code commande RS:…", "Référence fabricant:…",
 *  "SKU:", "EAN:", "Marque:") concaténées en haut de fiche par les revendeurs
 *  B2B (RS Components, Conrad…). Ce ne sont pas de la prose descriptive. */
const METADATA_LINE_RE = /^[^.]*?\b(code\s+commande|r[eé]f[eé]rence(\s+fabricant)?|num[eé]ro\s+(de\s+)?(?:s[eé]rie|article)|sku|ean|gtin|code[\s-]?barres?|marque)\s*[:=]/i

/**
 * Extrait la description structurée depuis un blob `NEXT_DATA_SPECS: {...}`
 * injecté par notre scrape POST sur les sites Next.js (RS Components, etc.).
 *
 * Le blob contient `descriptiveContent.unique.content[]` qui est une liste
 * ordonnée d'items typés (`Heading`, `Paragraph`, `List`). On extrait les
 * `Paragraph` consécutifs (qui forment la description marketing) et on
 * s'arrête au premier `Heading` qui ressemble à une question (FAQ).
 *
 * Cette source est 100% déterministe : pas de regex sur le rendu markdown,
 * pas de heuristique. Préférer ce path quand le blob est présent.
 */
function parseDescriptionFromNextData(md: string): string {
  const m = md.match(/NEXT_DATA_SPECS:\s*(\{[\s\S]+)/)
  if (!m) return ''
  const jsonStr = m[1]

  // Stratégie 1 : tentative de parse JSON complet.
  // Le scrape POST tronque à 30 000 chars (`nd.substring(0, 30000)`) — donc
  // le JSON peut être incomplet et le parse échoue. On essaie quand même.
  let parsed: unknown = null
  try { parsed = JSON.parse(jsonStr) }
  catch {
    let depth = 0, inString = false, escape = false, lastValid = -1
    for (let i = 0; i < jsonStr.length; i++) {
      const c = jsonStr[i]
      if (escape) { escape = false; continue }
      if (c === '\\') { escape = true; continue }
      if (c === '"') { inString = !inString; continue }
      if (inString) continue
      if (c === '{') depth++
      else if (c === '}') { depth--; if (depth === 0) { lastValid = i; break } }
    }
    if (lastValid > 0) {
      try { parsed = JSON.parse(jsonStr.slice(0, lastValid + 1)) }
      catch { /* parsed stays null → fallback regex */ }
    }
  }

  // Stratégie 1bis : si le JSON parse a réussi, naviguer la structure.
  if (parsed) {
    const findContent = (obj: unknown): Array<{ name?: string; type?: string; value?: string[] }> | null => {
      if (!obj || typeof obj !== 'object') return null
      const o = obj as Record<string, unknown>
      if (o.descriptiveContent && typeof o.descriptiveContent === 'object') {
        const dc = o.descriptiveContent as Record<string, unknown>
        const unique = dc.unique as Record<string, unknown> | undefined
        if (unique && Array.isArray(unique.content)) return unique.content as never
      }
      for (const v of Object.values(o)) {
        const r = findContent(v)
        if (r) return r
      }
      return null
    }
    const content = findContent(parsed)
    if (content && content.length > 0) {
      const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').trim()
      const paragraphs: string[] = []
      let seenFirstHeading = false
      for (const item of content) {
        if (item.type === 'Heading') {
          const heading = stripHtml((item.value ?? []).join(' '))
          if (!seenFirstHeading) { seenFirstHeading = true; continue }
          if (/^(quelle?|comment|est[-\s]?(il|ce)|pourquoi|où|quand|applications?|caract[eé]ristiques)/i.test(heading)) break
          continue
        }
        if (item.type === 'Paragraph' && Array.isArray(item.value)) {
          const text = stripHtml(item.value.join(' '))
          if (text.length >= 30) paragraphs.push(text)
        }
      }
      const joined = paragraphs.join('\n\n').trim()
      if (joined.length >= 50) return joined
    }
  }

  // Stratégie 2 (fallback regex) : le JSON est tronqué, mais le pattern
  // `"01Paragraph"..."type":"Paragraph"..."value":["TEXTE"]` est intact dans
  // les ~5 premiers Ko du blob. On extrait directement par regex sans parser
  // le JSON. Chercher `01Paragraph`, `02Paragraph`, etc. en ordre.
  const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
  const paragraphs: string[] = []
  // Regex : capture la VALEUR string d'un Paragraph numéroté `0X` (où le
  // numéro doit augmenter pour suivre l'ordre logique). On limite aux 4
  // premiers Paragraph (au-delà c'est de la FAQ).
  const paraRe = /"0([1-4])Paragraph"[^{]*?"type":"Paragraph"[^{]*?"value":\s*\[\s*"((?:[^"\\]|\\.)+)"/g
  let mp: RegExpExecArray | null
  let lastIdx = 0
  while ((mp = paraRe.exec(jsonStr)) !== null) {
    const idx = parseInt(mp[1], 10)
    if (idx <= lastIdx) break // ordre cassé → fin description
    lastIdx = idx
    const text = stripHtml(mp[2])
    if (text.length >= 30) paragraphs.push(text)
  }
  // S'arrêter avant la 1re question FAQ (Heading qui commence par "Quelle"/"Comment"/etc.)
  // — on cherche dans le JSON le 1er Heading FAQ et on coupe les paragraphs
  // qui viennent APRÈS son numéro.
  const faqHeadingRe = /"0([1-9])Heading"[^{]*?"type":"Heading"[^{]*?"value":\s*\[\s*"<B>(quelle?|comment|est[-\s]?(?:il|ce)|pourquoi|o[uù]|quand)/i
  const faqMatch = faqHeadingRe.exec(jsonStr)
  if (faqMatch && paragraphs.length > 0) {
    const faqIdx = parseInt(faqMatch[1], 10)
    // Garder seulement les Paragraph dont l'index est < faqIdx
    const filtered: string[] = []
    paraRe.lastIndex = 0
    let mp2: RegExpExecArray | null
    while ((mp2 = paraRe.exec(jsonStr)) !== null) {
      const idx = parseInt(mp2[1], 10)
      if (idx >= faqIdx) break
      const text = stripHtml(mp2[2])
      if (text.length >= 30) filtered.push(text)
    }
    if (filtered.length > 0) return filtered.join('\n\n').trim()
  }
  return paragraphs.join('\n\n').trim()
}

/**
 * Cherche un H2/H3/H4 en gras (`### **Titre**`) dont le titre est long et qui
 * ressemble à un nom complet de produit (≥ 30 chars, contient marque/référence/
 * dimension), puis retourne le 1er paragraphe de prose qui le suit immédiatement.
 *
 * Pattern typique RS Components / Conrad / Distrelec : la fiche rendue a un
 * `### **Tondeuse à gazon Makita LXT, diamètre de coupe de 43 cm - DLM432Z**`
 * suivi de "Cette tondeuse à gazon alimentée par batterie...". On capture
 * le paragraphe qui suit (et pas le H3 lui-même qui est un titre).
 */
function parseDescriptionAfterBoldHeading(md: string): string {
  const lines = md.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    // H2/H3/H4 dont le contenu est `**...**` et le texte est ≥ 30 chars
    const m = t.match(/^#{2,4}\s+\*\*(.{30,})\*\*\s*$/)
    if (!m) continue
    // Skip headings qui sont des sections (Caractéristiques, Spécifications, etc.)
    const heading = m[1]
    if (/^(caract[eé]ristiques|sp[eé]cifications?|applications?|points?\s+forts?|features?|advantages?|description|d[eé]tail|aper[çc]u|pr[eé]sentation|t[eé]l[eé]chargements?|documents?|faq|questions?|comment|quelle?|est[-\s]?(il|ce))/i.test(heading)) continue

    // Chercher le 1er paragraphe non-vide qui suit, ≥ 100 chars, qui n'est
    // pas un autre heading ni une bullet ni une URL.
    for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
      const p = lines[j].trim()
      if (!p) continue
      if (/^#{1,6}\s/.test(p)) break // autre heading → stop
      if (p.length < 100) continue
      if (/^[-*•✓✔]\s/.test(p)) continue
      if (/^\[/.test(p) || /^!\[/.test(p)) continue
      if (/^https?:\/\//.test(p)) continue
      if (isGarbageContent(p)) continue
      // OK, c'est notre paragraphe descriptif
      return p.replace(/\*\*/g, '').trim()
    }
  }
  return ''
}

/**
 * Extrait la description marketing d'un produit depuis du markdown.
 * Stratégie :
 *   0. NEXT_DATA_SPECS : si présent (sites Next.js), parser direct du JSON
 *      structuré — 100% déterministe.
 *   0bis. H3 en gras (titre produit) suivi d'un long paragraphe — pattern B2B FR.
 *   1. Chercher une section "## Description" / "## À propos" en priorité
 *   2. Sinon, premier paragraphe non-titre après le H1
 *   3. Filtrer les bandeaux cookies (isGarbageContent)
 *   4. Couper avant la première section "Spécifications" / "Caractéristiques"
 */
export function parseDescriptionFromMarkdown(md: string): string {
  // Phase 0 : Next.js structured data — source de vérité quand disponible
  const nextDataDesc = parseDescriptionFromNextData(md)
  if (nextDataDesc && nextDataDesc.length >= 50) return nextDataDesc

  // Phase 0bis : H3 (ou H2/H4) en gras `### **Titre du produit**` immédiatement
  // suivi d'un paragraphe long. Pattern typique des fiches B2B FR (RS, Conrad,
  // Distrelec…) où le NEXT_DATA n'est pas accessible mais où la fiche rendue
  // a cette structure prévisible.
  const boldHeadingDesc = parseDescriptionAfterBoldHeading(md)
  if (boldHeadingDesc && boldHeadingDesc.length >= 80) return boldHeadingDesc

  const lines = md.split('\n')

  // ── Helpers ──
  const isProseText = (s: string) =>
    s.length >= 40 && !s.startsWith('|') && !s.startsWith('#')
    && !/^\[.*\]\(.*\)$/.test(s) && !/^!\[/.test(s) && !s.startsWith('http')
    && !/^[-*•✓✔]\s/.test(s) && !isGarbageContent(s)
    && !/^\d+([.,]\d+)?\s*(b|kb|mb|gb|ko|mo|go|octets?|bytes?)\s*$/i.test(s)
    // Rejet des lignes-documents (format "Label | URL" ou "Label ## URL") :
    // label court suivi d'un séparateur puis d'une URL → c'est une ligne
    // téléchargement, pas de la prose descriptive.
    && !/\s[|#]{1,2}\s*https?:\/\//.test(s)
    && !/https?:\/\/\S+/.test(s)
    // Sans ce rejet, sur RS Components la 1re ligne sous le H1 — "Code commande
    // RS:252-2566 Référence fabricant:DLM432Z Marque:Makita" — passe le filtre
    // prose (≥ 40 chars, pas de bullet, pas de garbage), occupe Phase 1, et
    // empêche Phase 3 (longest prose) de s'activer.
    && !METADATA_LINE_RE.test(s)

  const clean = (s: string) => s.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim()

  // Sections qui contiennent typiquement de la description/prose
  // "Caractéristiques" seul = section de specs Dyson/e-commerce (nom + valeur sur 2 lignes).
  // Seul "Caractéristiques du produit / principales / générales" est une section de présentation.
  const descSectionRe = /caract[eé]ristiques?\s+(du\s*produit|principales?|g[eé]n[eé]rales?)|description|pr[eé]sentation|aper[çc]u|about|overview|introduction|r[eé]sum[eé]|en\s*bref|le\s*produit|d[eé]tail|points?\s*forts?\s*(du\s*produit)?|[eé]quipement\s*(et\s*application)?|informations?\s*compl[eé]ment/i
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
