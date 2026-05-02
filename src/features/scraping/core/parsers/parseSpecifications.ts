// src/features/scraping/core/parsers/parseSpecifications.ts
//
// Extraction des spécifications produit depuis du HTML ou du markdown.
// Recopié depuis useProductEnrichment.ts (extractSpecsFromHtml l.991, parseSpecsFromMarkdown
// l.2378, extractCharacteristicsBlobs l.2889, parseCharacteristicsBlob l.2903,
// truncateBeforeNonProductSections l.2930).

import { isGarbageContent } from './garbageFilter'

export interface Specification {
  name: string
  value: string
  group?: string
}

/** Extrait du HTML les <table> de specs et les renvoie en markdown lisible. */
export function extractSpecsFromHtml(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const mdParts: string[] = []

  // ── 1. JSON-LD structured data (Product schema) ──
  const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]')
  for (const script of jsonLdScripts) {
    try {
      let data = JSON.parse(script.textContent ?? '')
      if (data['@graph']) data = data['@graph']
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        const type = item['@type']
        if (type !== 'Product' && !(Array.isArray(type) && type.includes('Product'))) continue
        if (item.name) mdParts.push(`# ${item.name}`)
        if (item.description) mdParts.push(`\n${item.description}`)
        if (Array.isArray(item.additionalProperty)) {
          mdParts.push('\n## Spécifications (JSON-LD)')
          for (const prop of item.additionalProperty) {
            if (prop.name && prop.value != null) {
              mdParts.push(`| ${prop.name} | ${prop.value}${prop.unitText ? ' ' + prop.unitText : ''} |`)
            }
          }
        }
        for (const dim of ['weight', 'width', 'height', 'depth']) {
          const val = item[dim]
          if (val?.value != null) {
            mdParts.push(`| ${dim} | ${val.value}${val.unitText ? ' ' + val.unitText : ''} |`)
          }
        }
      }
    } catch { /* JSON-LD invalide */ }
  }

  const processedEls = new Set<Element>()

  const accordionSelectors = [
    '[data-accordion-content]', '[data-accordion-body]', '[data-collapse-content]',
    '.accordion-content', '.accordion-body', '.accordion__body', '.accordion__content',
    '.accordion-panel', '.accordion__panel',
    '.collapse-content', '.collapsible-content', '.panel-collapse',
    '.tab-content', '.tab-pane', '[role="tabpanel"]',
    '.product-specs', '.product-specifications', '.specifications-table',
    '.specs-content', '.spec-table', '.technical-data', '.technical-specs',
    '[class*="accordion"]', '[class*="Accordion"]',
    '[class*="collapse"]', '[class*="Collapse"]',
    '[class*="specification"]', '[class*="Specification"]',
    '[class*="spec-"]', '[class*="Spec-"]',
    '[class*="technical"]', '[class*="Technical"]',
    '[class*="product-detail"]', '[class*="ProductDetail"]',
    '[class*="feature"]', '[class*="Feature"]',
  ]

  function extractKvFromElement(el: Element, heading?: string): void {
    if (heading && heading.length < 80 && !isGarbageContent(heading)) {
      mdParts.push(`\n## ${heading}`)
    }

    const tables = el.querySelectorAll('table')
    for (const table of tables) {
      processedEls.add(table)
      const rows = table.querySelectorAll('tr')
      for (const row of rows) {
        const cells = row.querySelectorAll('td, th')
        if (cells.length >= 2) {
          const n = cells[0].textContent?.trim()
          const v = cells[1].textContent?.trim()
          if (n && v && !/^[-:]+$/.test(n)) mdParts.push(`| ${n} | ${v} |`)
        }
      }
    }

    const dts = el.querySelectorAll('dt')
    const dds = el.querySelectorAll('dd')
    if (dts.length > 0 && dds.length > 0) {
      const count = Math.min(dts.length, dds.length)
      for (let i = 0; i < count; i++) {
        const n = dts[i].textContent?.trim()
        const v = dds[i].textContent?.trim()
        if (n && v) mdParts.push(`| ${n} | ${v} |`)
      }
    }

    const lis = el.querySelectorAll('li')
    for (const li of lis) {
      const text = li.textContent?.trim()
      if (!text || text.length < 5 || text.length > 300 || isGarbageContent(text)) continue
      const kv = text.match(/^([^:]{2,50})\s*:\s+(.{1,200})$/)
      if (kv) {
        mdParts.push(`| ${kv[1].trim()} | ${kv[2].trim()} |`)
      } else {
        const strong = li.querySelector('strong, b, span[class*="label"], span[class*="name"]')
        if (strong) {
          const name = strong.textContent?.trim()
          const rest = text.replace(name ?? '', '').replace(/^[\s:–—-]+/, '').trim()
          if (name && rest && rest.length > 1) mdParts.push(`| ${name} | ${rest} |`)
        }
      }
    }

    if (tables.length === 0 && dts.length === 0 && lis.length === 0) {
      const text = el.textContent?.trim()
      if (!text) return
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2 && l.length < 200)
      for (const line of lines) {
        if (isGarbageContent(line)) continue
        const kv = line.match(/^([^:]{2,50})\s*:\s+(.{1,200})$/)
          || line.match(/^(.{2,50})\t+(.{1,200})$/)
        if (kv) mdParts.push(`| ${kv[1].trim()} | ${kv[2].trim()} |`)
      }
    }
  }

  for (const sel of accordionSelectors) {
    try {
      const els = doc.querySelectorAll(sel)
      for (const el of els) {
        if (processedEls.has(el)) continue
        processedEls.add(el)
        const text = el.textContent?.trim()
        if (!text || text.length < 5 || isGarbageContent(text)) continue

        const parentBtn = el.previousElementSibling
        const heading = parentBtn?.textContent?.trim()
          || el.closest('[data-accordion-item], [class*="accordion-item"], [class*="AccordionItem"]')
              ?.querySelector('button, h2, h3, h4, [class*="title"], [class*="header"], [class*="trigger"]')
              ?.textContent?.trim()

        extractKvFromElement(el, heading)
      }
    } catch { /* sélecteur invalide */ }
  }

  // ── 3. Tables de specs orphelines (pas dans un accordéon) ──
  const allTables = doc.querySelectorAll('table')
  for (const table of allTables) {
    if (processedEls.has(table)) continue
    const tableText = table.textContent?.trim() ?? ''
    if (tableText.length < 20 || tableText.length > 10000 || isGarbageContent(tableText)) continue

    const rows = table.querySelectorAll('tr')
    let specCount = 0
    const tableLines: string[] = []
    for (const row of rows) {
      const cells = row.querySelectorAll('td, th')
      if (cells.length === 2) {
        const n = cells[0].textContent?.trim()
        const v = cells[1].textContent?.trim()
        if (n && v && n.length < 60 && v.length < 200 && !/^[-:]+$/.test(n)) {
          tableLines.push(`| ${n} | ${v} |`)
          if (/\d/.test(v) || /\b(mm|cm|kg|nm|rpm|v|ah|w|hz|db|°|%)\b/i.test(v)) specCount++
        }
      }
    }
    if (specCount >= 2 && tableLines.length >= 2) {
      mdParts.push('\n## Spécifications (table)')
      mdParts.push(...tableLines)
    }
  }

  // ── 4. dl/dt/dd orphelines ──
  const dlElements = doc.querySelectorAll('dl')
  for (const dl of dlElements) {
    if (processedEls.has(dl)) continue
    const dts = dl.querySelectorAll('dt')
    const dds = dl.querySelectorAll('dd')
    if (dts.length >= 2) {
      const count = Math.min(dts.length, dds.length)
      let specCount = 0
      const dlLines: string[] = []
      for (let i = 0; i < count; i++) {
        const n = dts[i].textContent?.trim()
        const v = dds[i].textContent?.trim()
        if (n && v) {
          dlLines.push(`| ${n} | ${v} |`)
          if (/\d/.test(v)) specCount++
        }
      }
      if (specCount >= 2) {
        mdParts.push('\n## Spécifications (définitions)')
        mdParts.push(...dlLines)
      }
    }
  }

  // ── 5. Dernier recours : chercher les paires .label / .value dans le body ──
  if (mdParts.filter(l => l.startsWith('|')).length < 3) {
    const labelValueSelectors = [
      { label: '[class*="spec-label"], [class*="spec-name"], [class*="SpecLabel"], [class*="SpecName"]',
        value: '[class*="spec-value"], [class*="spec-data"], [class*="SpecValue"], [class*="SpecData"]' },
      { label: '[class*="attr-label"], [class*="attr-name"], [class*="AttrLabel"]',
        value: '[class*="attr-value"], [class*="attr-data"], [class*="AttrValue"]' },
      { label: '[class*="feature-label"], [class*="feature-name"]',
        value: '[class*="feature-value"], [class*="feature-data"]' },
      { label: '[class*="property-label"], [class*="property-name"]',
        value: '[class*="property-value"], [class*="property-data"]' },
    ]
    for (const { label: lSel, value: vSel } of labelValueSelectors) {
      try {
        const labels = doc.querySelectorAll(lSel)
        const values = doc.querySelectorAll(vSel)
        if (labels.length >= 2 && labels.length === values.length) {
          mdParts.push('\n## Spécifications (DOM)')
          for (let i = 0; i < labels.length; i++) {
            const n = labels[i].textContent?.trim()
            const v = values[i].textContent?.trim()
            if (n && v) mdParts.push(`| ${n} | ${v} |`)
          }
          break
        }
      } catch { /* sélecteur invalide */ }
    }
  }

  if (mdParts.length === 0) {
    console.log('[html-fallback] no structured data found in HTML')
    return null
  }

  const result = mdParts.join('\n').trim()
  const specLines = result.split('\n').filter(l => l.startsWith('|')).length
  console.log('[html-fallback] extracted', result.length, 'chars,', specLines, 'spec lines')
  return result
}

/** Parse les spécifications depuis du markdown (tables + paires inline + blobs caractéristiques). */
export function parseSpecsFromMarkdown(md: string): Specification[] {
  const specs: Specification[] = []
  const seen = new Set<string>()
  // Dedup STRICT par nom (première occurrence gagne) — pour les pages e-commerce
  // qui affichent des comparaisons multi-modèles (RS Components, Conrad, etc.)
  // où "Poids", "Batterie", "Niveau sonore" reviennent plusieurs fois pour des
  // produits différents. On garde uniquement la spec du produit principal,
  // toujours rendue en premier.
  const seenNames = new Set<string>()

  const FINANCIAL_NAME_RE = /^(date|payment|paiement|prix|price|montant|amount|total|ech[eé]ance|mensualit[eé]|versement|livraison|delivery|shipping|frais|fee|cost|co[uû]t|quantit[eé]|qty|stock|disponibilit[eé]|panier|cart|ajouter|add to|acheter|buy)\b|incl\.\s*vat|excl\.\s*vat|ttc|hors\s*taxe|tva/i
  const FINANCIAL_VALUE_RE = /^\d{1,4}[,.]\d{2}\s*[€$£]|^[€$£]\s*\d|^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$|incl\.\s*vat|excl\.\s*vat|ttc\b|hors\s*taxe|tva\b/i
  const PRICE_GROUP_RE = /prix|price|tarif|co[uû]t|cost|tva|vat|ttc|ht\b|hors\s*taxe/i

  // ── Parser rapide pour le format injecté par notre script Jina ──
  const jinaStart = md.indexOf('JINA_EXTRACTED_SPECS_START')
  const jinaEnd = md.indexOf('JINA_EXTRACTED_SPECS_END')
  if (jinaStart >= 0 && jinaEnd > jinaStart) {
    const block = md.slice(jinaStart, jinaEnd)
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
        if (name && value) {
          if (FINANCIAL_NAME_RE.test(name)) continue
          if (FINANCIAL_VALUE_RE.test(value)) continue
          if (PRICE_GROUP_RE.test(currentGroup ?? '')) continue
          if (PRICE_GROUP_RE.test(name)) continue
          const key = `${name.toLowerCase()}::${value.toLowerCase()}`
          const nameKey = name.toLowerCase().trim()
          if (!seen.has(key) && !seenNames.has(nameKey)) {
            seen.add(key)
            seenNames.add(nameKey)
            specs.push({ name, value, group: currentGroup })
          }
        }
      }
    }
    if (specs.length > 0) {
      console.log('[parseSpecs] ✓ Jina injected specs:', specs.length)
    }
  }

  const JUNK_NAME_RE = /^(title|url|source|markdown|favicon|description|og:|meta |statuscode|viewport|http)/i
  const JUNK_VALUE_RE = /^https?:\/\/|\.pdf\b|\[.*\]\(http/i
  const LINK_BRACKETS_RE = /\[.*?\]\(.*?\)/
  const FILE_VALUE_RE = /^(pdf|doc|docx|xls|xlsx|zip|rar|dwg|dxf|bim|ifc|step|stp|iges)$/i
  const FILE_SIZE_RE = /^\d+([.,]\d+)?\s*(b|kb|mb|gb|tb|ko|mo|go|to|octets?|bytes?)\s*$/i
  /** Lignes d'en-tête de table dupliquées entre sections : "Valeur",
   *  "*Valeur*", "Caractéristique"… — souvent recopiées par le scraping
   *  quand la même table d'en-tête est répétée pour chaque sous-section. */
  const PLACEHOLDER_HEADER_RE = /^[\s*_]*(valeur|value|caract[eé]ristique|description|sp[eé]cification|name|nom|d[eé]signation|propri[eé]t[eé])[\s*_]*$/i
  /** Nom entièrement entre crochets `[...]` sans contenu informatif. */
  const BRACKETED_HEADER_RE = /^\s*\[[^[\]()]+\]\s*$/

  function add(name: string, value: string, group?: string) {
    const n = name.trim().replace(LINK_BRACKETS_RE, '').replace(/\*\*/g, '').trim()
    const v = value.trim().replace(LINK_BRACKETS_RE, '').replace(/\*\*/g, '').trim()
    const key = `${n.toLowerCase()}::${v.toLowerCase()}`
    const nameKey = n.toLowerCase().trim()
    if (!n || !v || seen.has(key)) return
    // Dedup par nom : garde la première occurrence pour les pages avec
    // comparaisons multi-modèles (RS Components etc.).
    if (seenNames.has(nameKey)) return
    if (JUNK_NAME_RE.test(n)) return
    if (JUNK_VALUE_RE.test(v)) return
    if (FILE_VALUE_RE.test(v)) return
    if (FILE_SIZE_RE.test(n) || FILE_SIZE_RE.test(v)) return
    if (FINANCIAL_NAME_RE.test(n)) return
    if (FINANCIAL_VALUE_RE.test(v)) return
    // FINANCIAL_NAME_RE inclut "ajouter|panier|cart|acheter|buy" — appliquer aussi
    // sur la VALEUR pour rejeter les bouts de table prix `Unité=Ajouter`.
    if (FINANCIAL_NAME_RE.test(v)) return
    // Cookie banner buttons : "Tout accepter=Enregistrer", "Accepter tout=Refuser"
    if (/^(tout\s+(accepter|refuser)|accepter\s+(tout|tous)|refuser\s+(tout|tous)|enregistrer|sauvegarder|save|continuer\s+sans\s+accepter)$/i.test(n)
        || /^(tout\s+(accepter|refuser)|accepter\s+(tout|tous)|refuser\s+(tout|tous)|enregistrer|sauvegarder|save)$/i.test(v)) return
    if (/^[#]/.test(n)) return
    if (/^[.\-–—,;:!?]$/.test(v)) return
    if (n.length > 80 || v.length > 250) return
    if (/fiche\s*(de\s*donn[eé]es|technique|produit)/i.test(n)) return
    if (/www\.[a-z]/i.test(v) || /\.com\//.test(v)) return
    if (PLACEHOLDER_HEADER_RE.test(v) || PLACEHOLDER_HEADER_RE.test(n)) return
    if (BRACKETED_HEADER_RE.test(n)) return
    // Rejet bullets "• Texte" en nom ou valeur (n'est PAS une spec, c'est
    // une cellule de table qui a capturé un bullet de feature)
    if (/^[•·]\s/.test(n) || /^[•·]\s/.test(v)) return
    if (isGarbageContent(n) || isGarbageContent(v)) return
    seen.add(key)
    seenNames.add(nameKey)
    specs.push({ name: n, value: v, group: group || undefined })
  }

  const lines = md.split('\n')

  const jinaMetaRe = /^(Title|URL|Markdown Content|Source|Published Time|StatusCode|Favicon|ViewportWidth)\s*:/i

  const specSectionRe = /^#{1,4}\s*(sp[eé]cifications?|caract[eé]ristiques?\s*(?:techniques?|du\s*produit)?|descriptif\s*technique|donn[eé]es\s*techniques?|informations?\s*(?:techniques?)?|fiche\s*technique|d[eé]tails?\s*techniques?|poids|puissance|d[eé]cibels?|vibrations?|dimensions?|batterie|general|g[eé]n[eé]ral|per[çc]age|vissage|couple|moteur|[eé]nergie|vitesse|mandrin|capacit[eé]s?|tension|autonomie|charge(?:ment)?|bruit|acoustique|emballage|inclus|contenu\s*(?:de\s*la\s*)?livr|accessoires?)/i
  let inSpecSection = false
  let currentGroup = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (jinaMetaRe.test(trimmed)) continue
    if (/^\[.*\]\(https?:\/\//.test(trimmed) && /\.(pdf|doc)/i.test(trimmed)) continue
    if (trimmed.startsWith('#') && trimmed.length > 120) continue

    if (/^#{1,4}\s*(t[eé]l[eé]chargements?|downloads?|documents?\s*(?:associ[eé]s|techniques?|utiles?)?|fichiers?|resources?|pi[eè]ces?\s*jointes?)/i.test(trimmed)) {
      inSpecSection = false
      currentGroup = ''
      continue
    }

    // Section avis Bazaarvoice (`## Avis`, `### Note générale`, `### Filtrer les avis`,
    // `### Avis régionaux`, `### Description sommaire de la notation`) → sortir et bloquer
    // l'entrée en spec mode via `isSpecGroup` qui matche faussement "générale".
    if (/^#{1,5}\s*(avis(?:\s+r[eé]gionaux|\s+clients?|\s+v[eé]rifi[eé]s?)?|reviews?|customer\s+reviews?|user\s+reviews?|note\s+g[eé]n[eé]rale|description\s+sommaire|filtrer\s+les\s+avis|trier\s+les\s+avis|avis\s+aliment[eé]s\s+par|foire\s+aux\s+questions|faq)\s*$/i.test(trimmed)) {
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
      const isSpecGroup = /(information|poids|puissance|d[eé]cibels?|vibration|dimension|batterie|per[çc]age|vissage|couple|vitesse|mandrin|capacit|g[eé]n[eé]ral|technique|sp[eé]cification|donn[eé]es|important|emballage|inclus|livr[eé]|tension|autonomie|charge|bruit|acoustique|moteur|[eé]nergie|accessoire|r[eé]sistance|performance|mat[eé]riau|d[eé]bit|pression|hydraulique|certification|norme|classe|s[eé]rie|gamme|mod[eè]le|r[eé]f[eé]rence|connect|bluetooth|wireless|wifi)/i.test(headingLc)
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
    // Anti-prose : le name doit ressembler à un vrai nom de spec (max 5 mots,
    // commence par majuscule, pas par article). Sans ce check, des phrases
    // prose contenant `:` étaient capturées comme specs (Jardiland-style).
    if (inSpecSection) {
      const kvMatch = trimmed.match(/^([^:]{2,50})\s*:\s+(.{1,200})$/)
      if (kvMatch) {
        const n = kvMatch[1].replace(/\*\*/g, '').trim()
        const v = kvMatch[2].replace(/\*\*/g, '').trim()
        const looksLikeSpecName =
          n.split(/\s+/).length <= 5
          && /^[A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ]/.test(n)
          && !/^(le|la|les|un|une|des|du|de|cette|ce|ces|votre|notre|optimis[eé]z?|am[eé]lior[eé]z?|d[eé]couvr[eé]z?|s[eé]lectionnez|profit[eé]z?)\b/i.test(n)
        if (n && v && !/^https?:/.test(n) && looksLikeSpecName) {
          add(n, v, currentGroup)
          continue
        }
      }
    }

    // Format 4 : Lignes consécutives "Nom" puis "Valeur"
    if (inSpecSection && trimmed.length > 2 && trimmed.length < 80
        && !trimmed.startsWith('-') && !trimmed.startsWith('*') && !trimmed.startsWith('[')
        && !trimmed.startsWith('#') && !trimmed.startsWith('|') && !trimmed.startsWith('http')
        && !trimmed.startsWith('!') && !/^[=:\-]+$/.test(trimmed)) {
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

    // Format 4b : Bullet PLAIN "* Nom" suivi d'une valeur courte sur la ligne suivante.
    // Style Dyson : ## Caractéristiques → * Temps de charge → (ligne vide) → 3 hrs
    // Exclut les bullets BOLD `* **Titre**` qui sont des titres de feature
    // (ex: `* **Connecté à l'application MyDyson™**` dans Description complète).
    if (inSpecSection) {
      // [^*] : 1er char ne doit PAS être `*` → exclut les bullets bold
      const bulletName = trimmed.match(/^[*-]\s{1,4}([^*].{1,58})$/)
      if (bulletName) {
        const name = bulletName[1].trim()
        let nextIdx = i + 1
        while (nextIdx < lines.length && nextIdx <= i + 3 && !lines[nextIdx].trim()) nextIdx++
        const nextLine = (lines[nextIdx] ?? '').trim()
        if (nextLine && nextLine.length > 0 && nextLine.length < 200
            && !nextLine.startsWith('#') && !nextLine.startsWith('*') && !nextLine.startsWith('-')
            && !nextLine.startsWith('[') && !nextLine.startsWith('|') && !nextLine.startsWith('http')
            && !nextLine.startsWith('!')) {
          // La valeur doit ressembler à une spec : courte, avec digit, ou avec unité.
          // Sans ça, on capture des paragraphes de prose comme valeurs de spec.
          const looksLikeValue = /\d/.test(nextLine)
            || nextLine.length < 30
            || /\b(mm|cm|m|kg|g|nm|rpm|tr\/min|v|ah|w|kw|hz|db|dba|°|%|bar|l\/min|psi|mpa|ion|litre|watt|volt|amp|micron)/i.test(nextLine)
          if (looksLikeValue) {
            add(name, nextLine, currentGroup)
            i = nextIdx
            continue
          }
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

/** Extrait tous les blobs "Caractéristiques <contenu> Voir moins" du markdown, dans l'ordre. */
export function extractCharacteristicsBlobs(md: string): string[] {
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
export function parseCharacteristicsBlob(blob: string): Record<string, string> {
  const result: Record<string, string> = {}
  const cleaned = blob.replace(/\s+/g, ' ').trim()
  const pat = /([A-ZÉÈÊÀÂÎÔÛÇ][A-Za-zÀ-ÿ'’\- ]*?)\s*:\s*(.+?)(?=\s+[A-ZÉÈÊÀÂÎÔÛÇ][A-Za-zÀ-ÿ'’\- ]*?\s*:\s|\s*$)/g
  let m: RegExpExecArray | null
  while ((m = pat.exec(cleaned)) !== null) {
    const key = m[1].trim()
    const value = m[2].trim()
    if (!key || !value) continue
    if (key.length < 2 || key.length > 60) continue
    if (/tarif|prix|price/i.test(key)) continue
    result[key] = value
  }
  return result
}

/** Coupe le markdown avant les sections qui ne contiennent PAS d'images produit
 *  (documents/téléchargements, produits associés/similaires, conseils, avis, FAQ, footer).
 *  Retourne le markdown restant — ou le markdown complet si aucune coupure trouvée. */
export function truncateBeforeNonProductSections(md: string): string {
  const cutoffRe = /\n#{1,4}\s+(Documents?|T[eé]l[eé]chargements?|Downloads?|Conseils?|Produits?\s+associ[eé]s?|Produits?\s+similaires?|Produits?\s+r[eé]cemment|Produits?\s+compl[eé]mentaires?|Accessoires?\b|Related\s+products?|Complementary\s+products?|Avis|Reviews?|FAQ|Questions?\s+fr[eé]quentes?|Nos\s+Domaines)/i
  const m = cutoffRe.exec(md)
  return m ? md.slice(0, m.index) : md
}
