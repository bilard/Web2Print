// ── Parsers markdown : extraction structurée depuis le texte brut ───────────
//
// Module dédié aux parsers purs qui transforment le markdown scrapé
// (Jina Reader ou équivalent) en données structurées : specs, variants,
// advantages, images. Aucune dépendance runtime (pas de fetch, pas de store).
// Testé par parsers.test.ts.

// ── Filtrage des contenus parasites (cookie banners, GDPR, reCAPTCHA) ───────

export const GARBAGE_RE = /\b(cookie[s ]?|gdpr|your privacy|recaptcha|captcha|consent manager|targeting cookies?|functional cookies?|performance cookies?|strictly necessary|necessary cookies?|checkbox.?label|onetrust|cookiebot|manage preferences|cookie settings|politique de confidentialit[eé]|param[eè]tres? des? cookies?|refuser les cookies?|accepter les cookies?|we use cookies|this site is exceeding|we and our partners store|non-sensitive information|personali[sz]ed ads|ad measurement|audience insights|legitimate interest|store and\/or access|advertising purposes?|consent purposes?|personalised content|accept all|reject all)\b/i

/** Détecte si un texte est du contenu parasite (cookie banner, GDPR, reCAPTCHA) */
export function isGarbageContent(text: string): boolean {
  return GARBAGE_RE.test(text)
}

// ── Specs ───────────────────────────────────────────────────────────────────

export function parseSpecsFromMarkdown(md: string): Array<{ name: string; value: string; group?: string }> {
  const specs: Array<{ name: string; value: string; group?: string }> = []
  const seen = new Set<string>()

  // ── Filtres financiers / prix (déclarés ici pour les réutiliser dans Jina ET dans add()) ──
  const FINANCIAL_NAME_RE = /^(date|payment|paiement|prix|price|montant|amount|total|ech[eé]ance|mensualit[eé]|versement|livraison|delivery|shipping|frais|fee|cost|co[uû]t|quantit[eé]|qty|stock|disponibilit[eé]|panier|cart|ajouter|add to|acheter|buy)\b|incl\.\s*vat|excl\.\s*vat|ttc|hors\s*taxe|tva/i
  const FINANCIAL_VALUE_RE = /^\d{1,4}[,.]\d{2}\s*[€$£]|^[€$£]\s*\d|^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$|incl\.\s*vat|excl\.\s*vat|ttc\b|hors\s*taxe|tva\b/i
  /** Noms de groupe / clés qui trahissent une section prix / tarif */
  const PRICE_GROUP_RE = /prix|price|tarif|co[uû]t|cost|tva|vat|ttc|ht\b|hors\s*taxe/i

  // ── Parser rapide pour les blocs structurés injectés ──
  // Format : <TAG>_START\nGROUP: Titre\nNom = Valeur\n...\n<TAG>_END
  // Deux sources coexistent : SEMANTIC_EXTRACT (primaire, type-based) et
  // JINA_EXTRACTED_SPECS (legacy). Les deux utilisent le même format de
  // paires, on les parse en séquence — la déduplication par name+value
  // évite les doublons si les deux contiennent les mêmes specs.
  const decodeHtml = (s: string) => s.replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c))).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  const parseBlock = (startTag: string, endTag: string, label: string) => {
    const s = md.indexOf(startTag)
    const e = md.indexOf(endTag)
    if (s < 0 || e <= s) return
    const block = md.slice(s, e)
    let currentGroup: string | undefined
    let added = 0
    for (const line of block.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('GROUP:')) {
        currentGroup = decodeHtml(trimmed.slice(6).trim()) || undefined
      } else if (trimmed.includes(' = ')) {
        const eqIdx = trimmed.indexOf(' = ')
        const name = decodeHtml(trimmed.slice(0, eqIdx).trim())
        const value = decodeHtml(trimmed.slice(eqIdx + 3).trim())
        if (name && value) {
          if (FINANCIAL_NAME_RE.test(name)) continue
          if (FINANCIAL_VALUE_RE.test(value)) continue
          if (PRICE_GROUP_RE.test(currentGroup ?? '')) continue
          if (PRICE_GROUP_RE.test(name)) continue
          const key = `${name.toLowerCase()}::${value.toLowerCase()}`
          if (!seen.has(key)) {
            seen.add(key)
            specs.push({ name, value, group: currentGroup })
            added++
          }
        }
      }
    }
    if (added > 0) console.log(`[parseSpecs] ✓ ${label} specs: ${added}`)
  }
  // Priorité : SEMANTIC_EXTRACT d'abord (plus fiable), puis legacy JINA.
  parseBlock('SEMANTIC_EXTRACT_START', 'SEMANTIC_EXTRACT_END', 'semantic')
  parseBlock('JINA_EXTRACTED_SPECS_START', 'JINA_EXTRACTED_SPECS_END', 'Jina injected')

  /** Rejette les contenus parasites : métadonnées Jina, URLs, titres de page, liens markdown, etc. */
  const JUNK_NAME_RE = /^(title|url|source|markdown|favicon|description|og:|meta |statuscode|viewport|http)/i
  const JUNK_VALUE_RE = /^https?:\/\/|\.pdf\b|\[.*\]\(http/i
  const LINK_BRACKETS_RE = /\[.*?\]\(.*?\)/
  /** Valeurs qui sont des types de fichiers (pdf, doc, zip...) ou des tailles de fichiers (74.3 MB, 563 KB...) */
  const FILE_VALUE_RE = /^(pdf|doc|docx|xls|xlsx|zip|rar|dwg|dxf|bim|ifc|step|stp|iges)$/i
  const FILE_SIZE_RE = /^\d+([.,]\d+)?\s*(b|kb|mb|gb|tb|ko|mo|go|to|octets?|bytes?)\s*$/i
  // FINANCIAL_NAME_RE et FINANCIAL_VALUE_RE déclarés plus haut (réutilisés aussi par le parser Jina)

  function add(name: string, value: string, group?: string) {
    let n = name.trim().replace(LINK_BRACKETS_RE, '').replace(/\*\*/g, '').trim()
    let v = value.trim().replace(LINK_BRACKETS_RE, '').replace(/\*\*/g, '').trim()
    const key = `${n.toLowerCase()}::${v.toLowerCase()}`
    if (!n || !v || seen.has(key)) return
    // Règle générique : rejeter les cellules polluées par des artefacts markdown
    // non nettoyés (image/lien non résolus) → indicatif d'un parsing raté, pas
    // d'une vraie paire name/value.
    if (/^!?\[/.test(n) || /^!?\[/.test(v)) return
    if (/\]\s*\(/.test(n) || /\]\s*\(/.test(v)) return
    if (/^blob:/i.test(v) || /^https?:\/\//i.test(v) || /^\/\//.test(v)) return
    // Rejeter les métadonnées Jina / balises HTML / URLs
    if (JUNK_NAME_RE.test(n)) return
    if (JUNK_VALUE_RE.test(v)) return
    // Rejeter les types de fichiers et tailles de fichiers (listes de téléchargements PDF)
    if (FILE_VALUE_RE.test(v)) return
    if (FILE_SIZE_RE.test(n) || FILE_SIZE_RE.test(v)) return
    // Rejeter les données financières / commerciales (tables de paiement, prix, dates)
    if (FINANCIAL_NAME_RE.test(n)) return
    if (FINANCIAL_VALUE_RE.test(v)) return
    // Rejeter les noms qui sont des titres markdown (#) ou des bullets (+)
    if (/^[#]/.test(n)) return
    // Rejeter les valeurs non-informatives (un seul caractère ponctuation)
    if (/^[.\-–—,;:!?]$/.test(v)) return
    // Rejeter les noms ou valeurs trop longs (titres de page entiers)
    if (n.length > 80 || v.length > 250) return
    // Rejeter si le nom contient "fiche" + "produit"/"technique" (liens doc)
    if (/fiche\s*(de\s*donn[eé]es|technique|produit)/i.test(n)) return
    // Rejeter si la valeur contient un domaine web complet
    if (/www\.[a-z]/i.test(v) || /\.com\//.test(v)) return
    // Rejeter les contenus qui sont du garbage (cookies, GDPR, etc.)
    if (isGarbageContent(n) || isGarbageContent(v)) return
    seen.add(key)
    specs.push({ name: n, value: v, group: group || undefined })
  }

  const lines = md.split('\n')

  // Lignes Jina metadata à ignorer complètement
  const jinaMetaRe = /^(Title|URL|Markdown Content|Source|Published Time|StatusCode|Favicon|ViewportWidth)\s*:/i

  const specSectionRe = /^#{1,4}\s*(sp[eé]cifications?|caract[eé]ristiques?\s*(?:techniques?|du\s*produit)?|descriptif\s*technique|donn[eé]es\s*techniques?|informations?\s*(?:techniques?)?|fiche\s*technique|d[eé]tails?\s*techniques?|[eé]quipement(?:s)?|outillage|fonctionnalit[eé]s?|options?|poids|puissance|d[eé]cibels?|vibrations?|dimensions?|batterie|general|g[eé]n[eé]ral|per[çc]age|vissage|couple|moteur|[eé]nergie|vitesse|mandrin|capacit[eé]s?|tension|autonomie|charge(?:ment)?|bruit|acoustique|emballage|inclus|contenu\s*(?:de\s*la\s*)?livr|accessoires?)/i
  let inSpecSection = false
  let currentGroup = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Ignorer les lignes de métadonnées Jina
    if (jinaMetaRe.test(trimmed)) continue
    // Ignorer les lignes qui sont des liens markdown vers des docs/PDFs
    if (/^\[.*\]\(https?:\/\//.test(trimmed) && /\.(pdf|doc)/i.test(trimmed)) continue
    // Ignorer les lignes qui sont des titres de page Bosch/Makita/etc. excessivement longs
    if (trimmed.startsWith('#') && trimmed.length > 120) continue

    // Quitter la section specs si on entre dans une section de téléchargements/documents
    if (/^#{1,4}\s*(t[eé]l[eé]chargements?|downloads?|documents?\s*(?:associ[eé]s|techniques?|utiles?)?|fichiers?|resources?|pi[eè]ces?\s*jointes?)/i.test(trimmed)) {
      inSpecSection = false
      currentGroup = ''
      continue
    }

    if (specSectionRe.test(trimmed)) {
      inSpecSection = true
      const heading = trimmed.replace(/^#{1,4}\s+/, '').trim()
      currentGroup = heading
      continue
    }
    const subHeading = trimmed.match(/^#{2,5}\s+(.+)/)
    if (subHeading) {
      const heading = subHeading[1].trim()
      const headingLc = heading.toLowerCase()
      const isSpecGroup = /(information|poids|puissance|d[eé]cibels?|vibration|dimension|batterie|per[çc]age|vissage|couple|vitesse|mandrin|capacit|g[eé]n[eé]ral|technique|sp[eé]cification|donn[eé]es|important|emballage|inclus|livr[eé]|tension|autonomie|charge|bruit|acoustique|moteur|[eé]nergie|accessoire|r[eé]sistance|performance|mat[eé]riau|d[eé]bit|pression|hydraulique|certification|norme|classe|s[eé]rie|gamme|mod[eè]le|r[eé]f[eé]rence|connect|bluetooth|wireless|wifi|[eé]quipement|outillage|fonctionnalit|option|couleur|finition)/i.test(headingLc)
      // Heading court tout en majuscules = très probable section de specs fabricant (Milwaukee, DeWalt, etc.)
      const isUpperCaseShort = heading.length <= 40 && heading === heading.toUpperCase() && /[A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ]{3,}/.test(heading)
      if (isSpecGroup || isUpperCaseShort) {
        inSpecSection = true
        currentGroup = heading
      } else if (inSpecSection) {
        if (/^#{1,2}\s/.test(trimmed)) {
          inSpecSection = false
          currentGroup = ''
        } else {
          currentGroup = heading
        }
      }
      continue
    }

    // Format 1 : Tableau markdown — | Nom | Valeur |
    const tableMatch = trimmed.match(/^\|?\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|?\s*$/)
    if (tableMatch) {
      const n = tableMatch[1].replace(/\*\*/g, '').trim()
      const v = tableMatch[2].replace(/\*\*/g, '').trim()
      if (n && v && !/^[-:]+$/.test(n) && !/^[-:]+$/.test(v)) {
        const nLc = n.toLowerCase()
        if (nLc !== 'nom' && nLc !== 'name' && nLc !== 'caractéristique' && nLc !== 'specification') {
          add(n, v, currentGroup)
        }
      }
      continue
    }

    // Format 2 : **Clé** Valeur  ou  **Clé** : Valeur
    const boldKeyMatch = trimmed.match(/^\*\*(.+?)\*\*\s*:?\s*(.+)/)
    if (boldKeyMatch) {
      const n = boldKeyMatch[1].trim()
      const v = boldKeyMatch[2].trim()
      if (v && v.length < 200 && !v.startsWith('http') && n.length < 60) {
        add(n, v, currentGroup)
        continue
      }
    }

    // Format 3 : Clé : Valeur (sans markdown bold)
    if (inSpecSection) {
      const kvMatch = trimmed.match(/^([^:]{2,50})\s*:\s+(.{1,200})$/)
      if (kvMatch) {
        const n = kvMatch[1].replace(/\*\*/g, '').trim()
        const v = kvMatch[2].replace(/\*\*/g, '').trim()
        if (n && v && !/^https?:/.test(n)) {
          add(n, v, currentGroup)
          continue
        }
      }
    }

    // Format 4 : Lignes consécutives "Nom" puis "Valeur" (avec tolérance aux lignes vides entre les deux)
    if (inSpecSection && trimmed.length > 2 && trimmed.length < 80
        && !trimmed.startsWith('-') && !trimmed.startsWith('*') && !trimmed.startsWith('[')
        && !trimmed.startsWith('#') && !trimmed.startsWith('|') && !trimmed.startsWith('http')
        && !trimmed.startsWith('!') && !/^[-:=]+$/.test(trimmed)) {
      // Chercher la prochaine ligne non-vide (skip max 2 lignes vides — format Bosch/Nicoll)
      let nextIdx = i + 1
      while (nextIdx < lines.length && nextIdx <= i + 3 && !lines[nextIdx].trim()) nextIdx++
      const nextLine = (lines[nextIdx] ?? '').trim()
      if (nextLine && nextLine.length > 0 && nextLine.length < 100
          && !nextLine.startsWith('#') && !nextLine.startsWith('-') && !nextLine.startsWith('*')
          && !nextLine.startsWith('[') && !nextLine.startsWith('|') && !nextLine.startsWith('http')
          && !nextLine.startsWith('!')) {
        const looksLikeValue = /\d/.test(nextLine) || nextLine.length < 30 || /\b(mm|cm|m|kg|g|nm|rpm|tr\/min|v|ah|w|kw|hz|db|dba|°|%|bar|l\/min|psi|mpa|ion|litre|watt|volt|amp)/i.test(nextLine)
        if (looksLikeValue) {
          add(trimmed, nextLine, currentGroup)
          i = nextIdx
          continue
        }
      }
    }
  }

  // Fallback global
  if (specs.length === 0) {
    const globalBoldKv = [...md.matchAll(/\*\*([^*]{2,50})\*\*\s*:?\s*([^\n*]{2,150})/g)]
    for (const m of globalBoldKv) {
      const n = m[1].trim()
      const v = m[2].trim()
      if (n && v && !v.startsWith('http') && !/^(voir|en savoir|d[eé]couvr)/i.test(v)) {
        add(n, v)
      }
    }
  }

  return specs
}

// ── Variants ────────────────────────────────────────────────────────────────

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

/**
 * Nettoie génériquement une cellule de table markdown des artefacts qui
 * peuvent s'y retrouver quand Jina rend du HTML avec images/liens inline :
 *  - `![alt](url)`   → garde `alt`
 *  - `[text](url)`   → garde `text` (sauf si text est une URL → vide)
 *  - `[x]` / `[ ]`   → cases à cocher → vide
 *  - `**bold**`      → garde le contenu
 * Règle générique : aucune table ne doit propager d'artefacts bruts à l'UI.
 */
export function cleanMarkdownCell(s: string): string {
  if (!s) return ''
  let v = s.trim()
  v = v.replace(/\*\*/g, '').replace(/__/g, '')
  v = v.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  v = v.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, target) => (/^https?:\/\//i.test(target.trim()) ? '' : label))
  v = v.replace(/^\[[\sxX]\]\s*/, '')
  v = v.replace(/^\[\]\s*/, '')
  return v.trim()
}

/**
 * Valide qu'une chaîne ressemble à une référence produit réaliste.
 * Règle générique : une variante sans référence valide est presque toujours
 * un faux positif (ligne de disclaimer, séparateur, en-tête dupliquée).
 */
export function isValidVariantRef(ref: string): boolean {
  if (!ref) return false
  const r = ref.trim()
  if (r.length < 3 || r.length > 40) return false
  if (!/\d/.test(r)) return false
  if (!/^[A-Za-z0-9][A-Za-z0-9\-_./+ ]*$/.test(r)) return false
  return true
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
      const cells = trimmed.split('|').map(c => cleanMarkdownCell(c)).slice(1, -1)
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
      const cells = trimmed.split('|').map(c => cleanMarkdownCell(c)).slice(1, -1)
      if (cells.length >= headers.length - 1 && refIdx < cells.length) {
        // Strip header prefix des cellules ref et label
        const refRaw = cells[refIdx]
        const ref = stripCellHeaderPrefix(headers[refIdx] || 'Réf.', refRaw)
        if (!ref || /^[-:]+$/.test(ref)) continue
        // Règle générique : rejet des lignes dont la "référence" n'a pas le
        // format d'une ref réelle (cas typique : tables de disclaimer ou
        // notes en prose).
        if (!isValidVariantRef(ref)) continue
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

  // Règle générique : dédoublonnage final par référence (uppercase).
  // Cas typique : Jina rend la même table 2× (mobile+desktop, ou DOM dupliqué
  // par onglets), ce qui produit des variantes identiques.
  const seenRefs = new Set<string>()
  const deduped: typeof variants = []
  for (const v of variants) {
    const key = v.reference.toUpperCase().trim()
    if (!key || seenRefs.has(key)) continue
    seenRefs.add(key)
    deduped.push(v)
  }
  return deduped
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

// ── Images ──────────────────────────────────────────────────────────────────

/** Coupe le markdown avant les sections qui ne contiennent PAS d'images produit
 *  (documents/téléchargements, produits associés/similaires, conseils, avis, FAQ, footer).
 *  Retourne le markdown restant — ou le markdown complet si aucune coupure trouvée. */
function truncateBeforeNonProductSections(md: string): string {
  const cutoffRe = /\n#{1,4}\s+(Documents?|T[eé]l[eé]chargements?|Downloads?|Conseils?|Produits?\s+associ[eé]s?|Produits?\s+similaires?|Produits?\s+r[eé]cemment|Produits?\s+compl[eé]mentaires?|Accessoires?\b|Related\s+products?|Complementary\s+products?|Avis|Reviews?|FAQ|Questions?\s+fr[eé]quentes?|Nos\s+Domaines)/i
  const m = cutoffRe.exec(md)
  return m ? md.slice(0, m.index) : md
}

/** Extrait le "stem" d'une URL d'image pour dédup : dernier segment path,
 *  extensions retirées (gère les doubles .jpg.webp de Drupal imagecache). */
function imageStem(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/$/, '')
    const last = path.split('/').pop() || ''
    return last.replace(/\.(jpe?g|png|webp|avif|gif|svg)(\.(jpe?g|png|webp|avif|gif))?$/i, '').toLowerCase()
  } catch { return url }
}

/** Test si une URL d'image pointe vers un chemin "produit" (CMS avec segment produits). */
const PRODUCT_PATH_RE = /\/(products?|product[-_]images?|product[-_]photos?|catalog\/products?)\//i

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

/** Extrait toutes les URLs d'images produit depuis le markdown Jina.
 *  Gère : ![alt](url), Images Summary Jina, URLs brutes avec extension,
 *  et URLs CDN sans extension claire (dans le contexte d'une section images).
 */
export function parseImagesFromMarkdown(md: string): string[] {
  // Limiter l'extraction au contenu avant les sections documents/associés/etc.
  md = truncateBeforeNonProductSections(md)

  const seen = new Set<string>()
  const images: string[] = []

  /** Teste si une URL est une image UI/junk (logo, icône, pixel, miniature de PDF, etc.) et pas un produit.
   *  On teste uniquement le nom de fichier (dernier segment du path), pas l'URL entière,
   *  pour éviter les faux positifs sur les chemins CMS (/sites/default/files/, /static/images/, etc.)
   */
  const isJunkImage = (url: string): boolean => {
    try {
      const path = new URL(url).pathname
      const filename = path.split('/').pop()?.toLowerCase() ?? ''
      // Petites images (< 3 segments de path = probablement un favicon/sprite inline)
      const segments = path.split('/').filter(Boolean)
      // Rejeter TOUS les SVG (quasi-jamais des photos produit — presque toujours icônes/logos)
      if (/\.svg(\?|#|$)/i.test(filename)) return true
      // Rejeter si un segment de path est dédié aux logos/pictos/icônes/badges/brands/features marketing
      // (ex: /pictos/xxx.png, /logos/brand.svg, /icons/warning.png, /features/vario-power.jpg)
      if (segments.some(s => /^(logos?|pictos?|pictogram[a-z]*|icons?|icones?|badges?|brands?|flags?|labels?|stickers?|favicons?|apple-touch-icons?|features?|benefits?|highlights?|usps?|advantages?|campaigns?|promos?|promotions?|marketing|banners?|heros?|overlays?|schemas?|schematics?|illustrations?)$/i.test(s))) return true
      // Tester le nom de fichier uniquement
      if (/^(logo|picto|pictogram|favicon|sprite|spacer|blank|pixel|transparent|1x1|beacon|badge|flag|label|sticker|usp|feature|benefit|highlight|advantage|campaign|promo|banner|overlay|schema|schematic|illustration|icon|ic|ico)\b/i.test(filename)) return true
      if (/[-_](logo|picto|pictogram|icon|avatar|favicon|sprite|spacer|pixel|tracking|beacon|badge|flag|label|sticker|brand|usp|feature|benefit|highlight|advantage|campaign|promo|banner|overlay|schema|schematic|illustration)(?:[-_.\d]|$)/i.test(filename)) return true
      // Indice de réparabilité (France) / score badges marketing
      if (/indice[-_]?(?:de[-_]?)?(?:reparabilit|durabilit|eco)/i.test(filename)) return true
      if (/(?:^|[-_])(?:energy[-_]?label|ecolabel|eco[-_]?score|nutriscore)(?:[-_.]|$)/i.test(filename)) return true
      // Miniatures de PDF/docs : filename ou path contient des marqueurs documentaires
      if (/\.pdf\.(jpe?g|png|webp|avif)$/i.test(filename)) return true
      if (/^(fiche|notice|datasheet|tech[-_]?sheet|manual|doc|document|brochure|catalog)[-_.]/i.test(filename)) return true
      // Drupal imagecache styles avec "doc" (ex: product_doc_carousel_mobile, doc_preview_*)
      const styleMatch = path.match(/\/styles\/([^/]+)\//i)
      if (styleMatch && /(^|[-_])(doc|docs|document|documents|pdf|notice|fiche|datasheet|brochure)([-_]|$)/i.test(styleMatch[1])) return true
      // Path segment dédié aux documents
      if (segments.some(s => /^(docs?|documents?|pdfs?|notices?|fiches?|brochures?|datasheets?)$/i.test(s))) return true
      // Tester le dernier segment de path pour les patterns sociaux/nav
      const lastSegments = segments.slice(-2).join('/')
      if (/\b(facebook|twitter|instagram|youtube|linkedin|tiktok|pinterest)\b/i.test(lastSegments)) return true
      // Très petit fichier (souvent des icônes SVG en ligne)
      if (/\bsvg\b/i.test(filename) && segments.length <= 2) return true
      return false
    } catch {
      return false
    }
  }

  const addImg = (url: string) => {
    const raw = url.trim().replace(/[)>\]}\s]+$/, '')
    if (!raw || !raw.startsWith('http') || isJunkImage(raw)) return
    // Canonicaliser les URLs Drupal styled → original (haute résolution)
    const u = canonicalizeImageUrl(raw)
    if (seen.has(u)) return
    seen.add(u)
    images.push(u)
  }

  // 1. Jina injected images block (JINA_EXTRACTED_IMAGES_START/END)
  const jinaImgStart = md.indexOf('JINA_EXTRACTED_IMAGES_START')
  const jinaImgEnd = md.indexOf('JINA_EXTRACTED_IMAGES_END')
  if (jinaImgStart >= 0 && jinaImgEnd > jinaImgStart) {
    const block = md.slice(jinaImgStart + 'JINA_EXTRACTED_IMAGES_START'.length, jinaImgEnd)
    for (const line of block.split('\n')) {
      const url = line.trim()
      if (url && /^https?:\/\//.test(url)) addImg(url)
    }
  }

  // 2. Inline markdown images: ![alt](url)
  for (const m of md.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)) {
    addImg(m[2])
  }

  // 3. Jina "Images Summary" / "Images:" section at end of markdown
  //    Formats: "Image N (alt): url" or "[Image N (alt)](url)" or just plain URLs
  const imgSectionMatch = md.match(/(?:^|\n)#{0,4}\s*(?:Images?\s*(?:Summary)?|Photos?)\s*:?\s*\n([\s\S]+?)(?:\n#{1,4}\s|\n\n---|\n\n\*\*|$)/im)
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

  // 4. Plain URLs with image extensions anywhere in the markdown
  for (const m of md.matchAll(/(https?:\/\/[^\s)"\]]+\.(?:jpe?g|png|webp|avif)[^\s)"\]]*)/gi)) {
    addImg(m[1])
  }

  // 5. Jina "Image N (alt): url" format (sometimes outside a section)
  for (const m of md.matchAll(/Image\s+\d+[^:]*:\s*(https?:\/\/[^\s)"\]]+)/gim)) {
    addImg(m[1])
  }

  // 6. og:image or meta image URLs in Jina metadata
  for (const m of md.matchAll(/(?:og:image|twitter:image|image_src|meta\s*image)\s*[:=]\s*(https?:\/\/[^\s)"\]]+)/gim)) {
    addImg(m[1])
  }

  // 7. Links Summary — images disguised as regular links in Jina's Links section
  //    Format: [alt text](url.jpg) in a Links section
  const linksSectionMatch = md.match(/(?:^|\n)#{0,4}\s*Links?\s*(?:Summary)?\s*:?\s*\n([\s\S]+?)(?:\n#{1,4}\s|$)/im)
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
  console.log('[parseImagesFromMarkdown] mdLen=', md.length, 'raw=', images.length, 'productMatch=', productImages.length, 'final=', deduped.length, 'sample:', deduped.slice(0, 3))
  return deduped
}

// ── Advantages ──────────────────────────────────────────────────────────────

export function parseAdvantagesFromMarkdown(md: string): Array<{ text: string; group?: string }> {
  const advantages: Array<{ text: string; group?: string }> = []
  const seenTexts = new Set<string>()

  // Sections qui contiennent des avantages (bullet points)
  const featureKeywords = /(?:avantages?|features?|points?\s*forts?|b[eé]n[eé]fices?|les\s*\+|atouts?|plus\s+produit|caract[eé]ristiques?)/i
  // Sections qui NE contiennent PAS des avantages → quitter la featureZone
  const exitKeywords = /(?:sp[eé]cification|caract[eé]ristiques?\s*techniques?|donn[eé]es\s*technique|descriptif\s*technique|t[eé]l[eé]chargement|downloads?|documents?|avis|reviews?|r[eé]f[eé]rences?|variantes?|accessoires?\s*associ|prix|tarif|contact|mentions?\s*l[eé]gal|conditions?\s*g[eé]n[eé]ral|informations?\s*compl[eé]ment|[eé]quipement|application)/i
  // Contenu commercial/politique à filtrer
  const COMMERCIAL_RE = /achet[eé]|achat|retourn|rembours|livr[eé]|exp[eé]di|panier|commander|boutique|magasin|labellis[eé]|certifi[eé].*utilisateur|v[eé]rifi[eé].*identit|historique.*d.achat|provien.*d.utilisateur|contrefaçon|authenticit|service\s*client|cat[eé]gories?\s*d.?[eé]valuation|distinguons?\s*trois|noter\s*ce\s*produit/i

  const extractGroupName = (raw: string): string | undefined => {
    const cleaned = raw
      .replace(/\*\*/g, '')
      .replace(/^les\s*\+\s*/i, '')
      .replace(/^(avantages?|features?|points?\s*forts?|b[eé]n[eé]fices?|atouts?|plus\s+produit|caract[eé]ristiques?)\s*/i, '')
      .trim()
    return cleaned.length > 1 && cleaned.length < 80 ? cleaned : undefined
  }

  const addBullet = (text: string, group: string | undefined) => {
    const clean = text
      .replace(/\*\*/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\\\\/g, '')
      .trim()
    if (clean.length < 15 || clean.startsWith('http') || /^\d+$/.test(clean) || seenTexts.has(clean)) return
    // Rejeter le contenu commercial / politique
    if (COMMERCIAL_RE.test(clean)) return
    // Rejeter les noms de specs isolés (sans verbe, sans valeur)
    if (clean.length < 50 && /\*\s*$/.test(clean)) return
    // Rejeter les adresses, noms d'entreprise, disclaimers, liens
    if (/^\d{4,5}\s+[A-Z]/.test(clean)) return
    if (/GmbH|S\.A\.|SAS|SARL|Ltd|Inc/i.test(clean)) return
    if (/avertissement|consigne.*s[eé]curit|notice.*utilisation|t[eé]l[eé]charg|cliqu/i.test(clean)) return
    if (isGarbageContent(clean)) return
    seenTexts.add(clean)
    advantages.push({ text: clean, group })
  }

  const lines = md.split('\n')
  let currentGroup: string | undefined
  let inFeatureZone = false

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue

    const headingMatch = trimmed.match(/^#{1,5}\s+(.+)$/)
    if (headingMatch) {
      const headingText = headingMatch[1].replace(/\*\*/g, '').trim()
      // Quitter si on entre dans une section technique / commerciale / autre
      if (exitKeywords.test(headingText)) {
        inFeatureZone = false
        currentGroup = undefined
        continue
      }
      if (featureKeywords.test(headingText)) {
        inFeatureZone = true
        currentGroup = extractGroupName(headingText)
        continue
      }
      if (inFeatureZone) {
        const level = trimmed.match(/^(#{1,5})/)?.[1].length ?? 99
        if (level <= 2) {
          inFeatureZone = false
          currentGroup = undefined
        }
      }
      continue
    }

    // Texte bold seul = potentiel titre de section
    const boldMatch = trimmed.match(/^\*\*(.+?)\*\*\s*$/)
    if (boldMatch) {
      if (exitKeywords.test(boldMatch[1])) {
        inFeatureZone = false
        currentGroup = undefined
        continue
      }
      if (featureKeywords.test(boldMatch[1])) {
        inFeatureZone = true
        currentGroup = extractGroupName(boldMatch[1])
        continue
      }
      // Dans une zone features, un libellé bold isolé court est un sous-groupe
      // plain-text (ex: **Performances**, **Installation**).
      if (inFeatureZone && boldMatch[1].length > 1 && boldMatch[1].length < 50) {
        currentGroup = extractGroupName(boldMatch[1])
        continue
      }
    }

    // Texte non-markdown qui matche les keywords
    if (!trimmed.startsWith('-') && !trimmed.startsWith('*') && !trimmed.startsWith('•')
        && featureKeywords.test(trimmed) && !exitKeywords.test(trimmed) && trimmed.length < 80) {
      const nextLine = (lines[i + 1] ?? '').trim()
      const isTitleBeforeBullets = /^[-*•·✓✔]\s+/.test(nextLine)
      if (isTitleBeforeBullets || inFeatureZone) {
        inFeatureZone = true
        currentGroup = extractGroupName(trimmed)
        continue
      }
    }

    if (!inFeatureZone) continue

    // Bullet points explicites
    const bulletMatch = trimmed.match(/^[-*•·✓✔]\s+(.+)/)
    if (bulletMatch) {
      addBullet(bulletMatch[1], currentGroup)
      continue
    }

    // Numérotés : "1. Texte"
    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)/)
    if (numberedMatch && numberedMatch[1].length > 20) {
      addBullet(numberedMatch[1], currentGroup)
      continue
    }

    // Paragraphes de prose dans la zone features (pas un heading, pas un tableau, pas un lien)
    // Certaines pages mettent les avantages en texte libre plutôt qu'en bullets
    if (
      trimmed.length >= 40
      && !trimmed.startsWith('|')
      && !trimmed.startsWith('#')
      && !trimmed.startsWith('![')
      && !/^\[.*\]\(/.test(trimmed)
      && !COMMERCIAL_RE.test(trimmed)
      && !isGarbageContent(trimmed)
    ) {
      addBullet(trimmed, currentGroup)
      continue
    }
  }

  return advantages
}
