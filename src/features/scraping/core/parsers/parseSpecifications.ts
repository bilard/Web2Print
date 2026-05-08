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

  // ── 4b. Pattern Makita "techspecs--row-*" : pairing par ROW container ──
  //    Les sélecteurs globaux donnent des counts inégaux (27 labels vs 17 values
  //    à cause des variantes `*-specification-info`). On itère par row container.
  const techRows = doc.querySelectorAll('[class*="techspecs--row"][class*="row-content"], [class~="techspecs--row"]')
  if (techRows.length >= 2) {
    const techLines: string[] = []
    const seenRows = new Set<Element>()
    for (const row of techRows) {
      if (seenRows.has(row)) continue
      seenRows.add(row)
      const label = row.querySelector('[class*="techspecs--row-specification"]:not([class*="info"]), [class*="techspec-name"], [class*="techspec-label"]')
      const value = row.querySelector('[class*="techspecs--row-value"], [class*="techspec-value"], [class*="techspec-data"]')
      if (!label || !value) continue
      const n = label.textContent?.trim()
      const hasCheckIcon = !!value.querySelector('i[class*="fa-check"], i[class*="check"], svg[class*="check"], [class*="checkmark"]')
      const v = value.textContent?.trim() || (hasCheckIcon ? 'Oui' : '')
      if (n && v) techLines.push(`| ${n} | ${v} |`)
    }
    if (techLines.length >= 3) {
      mdParts.push('\n## Spécifications')
      mdParts.push(...techLines)
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
            // Si la valeur contient une icône check (<i class="fa fa-check">),
            // c'est une spec booléenne "Oui" (ex: Makita "Tension LXT", "BL Motor").
            const valueEl = values[i]
            const hasCheckIcon = !!valueEl.querySelector('i[class*="fa-check"], i[class*="check"], svg[class*="check"], [class*="checkmark"]')
            const textValue = valueEl.textContent?.trim()
            const v = textValue || (hasCheckIcon ? 'Oui' : '')
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
  /** UI de livraison/promo/checkout que les sites GSA mettent en cellule de
   *  tableau (Jardiland, Leroy Merlin) et qu'on capture par erreur en spec. */
  const DELIVERY_UI_RE = /^(en\s+stock|stock\s+disponible|disponible|indisponible|livraison|gratuit\s+(à\s+partir|d[eè]s)|estim(ée|ation)(\s+\S+)*|exp[eé]di[eé]e?|d[eé]livr[eé]e?|retir[eé]\s+en|click\s+&\s+collect|\+\s*\d+\s+offres?|voir\s+l['']offre|voir\s+d[eé]tails?|comparer)$/i

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
   *  quand la même table d'en-tête est répétée pour chaque sous-section.
   *  Inclut "attribut(s)" / "attribute(s)" — col header générique de Rubix & co. */
  const PLACEHOLDER_HEADER_RE = /^[\s*_]*(valeur|value|caract[eé]ristique|description|sp[eé]cification|name|nom|d[eé]signation|propri[eé]t[eé]|attributs?|attributes?|fields?|champs?|key|cl[eé])[\s*_]*$/i
  /** Nom entièrement entre crochets `[...]` sans contenu informatif. */
  const BRACKETED_HEADER_RE = /^\s*\[[^[\]()]+\]\s*$/

  // Heuristique anti-inversion : sur certains sites B2B (Rubix, Würth) la table
  // de specs est rendue avec valeur À GAUCHE et label À DROITE. Le parser HTML
  // capture donc `name=value, value=name` (inversé). On détecte et on swap si :
  //   - n ressemble à une VALEUR (digits + unité physique, OU "X €", OU OUI/NON)
  //   - ET v ressemble à un NOM (alphabétique, ≥1 lettre majuscule au début,
  //     pas d'unité physique seule)
  // Reste générique — applicable à tout site dont la mise en page est inversée.
  const VALUE_LIKE_RE = /^(?:\d[\d\s.,]*(?:\s*(?:[A-Za-zÀ-ÿ²³µ]{1,5}|\/[A-Za-z]+))?|\d+\s*[€$£%]|oui|non|yes|no)$/i
  const NAME_LIKE_RE = /^[A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ][A-Za-zÀ-ÿ\s'’\-()/]+$/
  const isInverted = (n: string, v: string): boolean => {
    if (!n || !v) return false
    if (n.length > 30) return false  // un vrai value reste court
    if (v.length < 3 || v.length > 60) return false  // un vrai name a une certaine longueur
    return VALUE_LIKE_RE.test(n) && NAME_LIKE_RE.test(v) && !VALUE_LIKE_RE.test(v)
  }

  /** Retourne true si la spec a été ajoutée, false si rejetée par un filtre.
   *  Permet aux callers (Format 4 notamment) de NE PAS consommer la ligne
   *  suivante quand la pair est rejetée — évite les cascades de shift. */
  function add(rawName: string, rawValue: string, group?: string): boolean {
    let n = rawName.trim().replace(LINK_BRACKETS_RE, '').replace(/\*\*/g, '').trim()
    let v = rawValue.trim().replace(LINK_BRACKETS_RE, '').replace(/\*\*/g, '').trim()
    if (isInverted(n, v)) {
      [n, v] = [v, n]
    }
    const key = `${n.toLowerCase()}::${v.toLowerCase()}`
    const nameKey = n.toLowerCase().trim()
    if (!n || !v || seen.has(key)) return false
    // Dedup par nom : garde la première occurrence pour les pages avec
    // comparaisons multi-modèles (RS Components etc.).
    if (seenNames.has(nameKey)) return false
    if (JUNK_NAME_RE.test(n)) return false
    if (JUNK_VALUE_RE.test(v)) return false
    if (FILE_VALUE_RE.test(v)) return false
    if (FILE_SIZE_RE.test(n) || FILE_SIZE_RE.test(v)) return false
    if (FINANCIAL_NAME_RE.test(n)) return false
    if (FINANCIAL_VALUE_RE.test(v)) return false
    // FINANCIAL_NAME_RE inclut "ajouter|panier|cart|acheter|buy" — appliquer aussi
    // sur la VALEUR pour rejeter les bouts de table prix `Unité=Ajouter`.
    if (FINANCIAL_NAME_RE.test(v)) return false
    // Delivery / promo UI cells (Jardiland-style)
    if (DELIVERY_UI_RE.test(n) || DELIVERY_UI_RE.test(v)) return false
    // Nom = juste un symbole/séparateur (ex: "+", "-", "/", "?")
    if (/^[+\-*/?!.,;:]$/.test(n)) return false
    // Cookie banner buttons : "Tout accepter=Enregistrer", "Accepter tout=Refuser"
    if (/^(tout\s+(accepter|refuser)|accepter\s+(tout|tous)|refuser\s+(tout|tous)|enregistrer|sauvegarder|save|continuer\s+sans\s+accepter)$/i.test(n)
        || /^(tout\s+(accepter|refuser)|accepter\s+(tout|tous)|refuser\s+(tout|tous)|enregistrer|sauvegarder|save)$/i.test(v)) return false
    if (/^[#]/.test(n)) return false
    if (/^[.\-–—,;:!?]$/.test(v)) return false
    if (n.length > 80 || v.length > 250) return false
    if (/fiche\s*(de\s*donn[eé]es|technique|produit)/i.test(n)) return false
    if (/www\.[a-z]/i.test(v) || /\.com\//.test(v)) return false
    if (PLACEHOLDER_HEADER_RE.test(v) || PLACEHOLDER_HEADER_RE.test(n)) return false
    if (BRACKETED_HEADER_RE.test(n)) return false
    // Rejet : nom purement numérique (ex: "414,20") — c'est probablement un prix
    // capturé par erreur dans une table 2-col. Les vrais codes de spec (EN60745,
    // 2014/30/UE) contiennent des lettres et passent ce test.
    if (/^\d[\d\s.,\-+/]*$/.test(n)) return false
    // Rejet : value qui est uniquement une unité/suffixe monétaire (ex: "€ HT",
    // "€ TTC", "/ unité", "/ pièce") — c'est le label d'une cellule prix mal
    // capturée comme value. Les vraies valeurs avec unité ont au moins un digit.
    if (/^[\s/]?[€$£%]\s*(?:HT|TTC|HTVA|TVA)?\s*$/i.test(v)) return false
    if (/^\/\s*(?:unit[eé]|pi[eè]ce|kilo|kg|m|m²|m³)\s*$/i.test(v)) return false
    // Rejet bullets "• Texte" en nom ou valeur (n'est PAS une spec, c'est
    // une cellule de table qui a capturé un bullet de feature)
    if (/^[•·]\s/.test(n) || /^[•·]\s/.test(v)) return false
    // Rejet bullets markdown `- ` ou `* ` en valeur (ex: `Avantages produits=- Item`)
    if (/^[-*]\s/.test(v)) return false
    // Rejet noms qui sont des headings de section (capturés par erreur via Format 1)
    const SECTION_HEADING_RE = /^(caract[eé]ristiques?|sp[eé]cifications?|d[eé]tails?|description|avantages?|points?\s+forts?|fiche|info\s|[eé]quipement|application)/i
    if (SECTION_HEADING_RE.test(n) && n.length < 35) return false
    // Anti-prose composite : nom > 5 mots ET valeur sans chiffre/unité
    // = très probablement une phrase prose découpée par erreur
    if (n.split(/\s+/).length > 5 && !/[:\d]|\b(mm|cm|kg|g|w|v|hz|ml|l|nm|rpm|db|°|%|bar|psi|mpa)\b/i.test(v)) return false

    // ── Anti-PDF-manuel : prose extraite des notices/manuels d'instruction ──
    // Quand Jina scrape un PDF (ex: notice sécurité Makita), le texte est
    // injecté brut dans le markdown et les heuristiques table le capturent.
    // Signatures : blockquote `>`, ruptures de page hyphenisées, multi-phrases,
    // lexique sécurité, prose anglaise/française composite.

    // Préfixe blockquote markdown — typique des tables PDF mal extraites
    if (/^>\s/.test(n) || /^>\s/.test(v)) return false
    // Lien markdown splitté : `[Texte](https` côté name + `//www....)` côté value
    // (artefact quand le `:` ou `|` d'un menu de navigation découpe l'URL).
    // Détection : présence du début ou de la fin d'un `[...](...)` incomplet.
    if (n.includes('](') || v.includes('](')) return false
    if (/^\/\/[a-z0-9]/i.test(v)) return false  // value qui démarre par "//www..." (URL coupée)
    if (/\)\s*$/.test(v) && /\.[a-z]{2,5}\)?$/i.test(v)) return false  // value qui finit par ".html)" — fin d'URL coupée
    // Trait d'union de fin = rupture de page PDF ("actua-", "influ-")
    if (/-\s*$/.test(n) || /-\s*$/.test(v)) return false
    // Multi-phrases : point/!/? suivi d'un espace + capitale → prose narrative
    if (/[.!?]\s+[A-Z]/.test(n) || /[.!?]\s+[A-Z]/.test(v)) return false
    // Phrase complète : nom ET valeur se terminent par un point déclaratif
    if (/[a-z]{3,}\.$/.test(n) && /[a-z]{3,}\.$/.test(v)) return false
    // Lexique sécurité/avertissement multilingue — jamais dans les vraies specs.
    // Couvre EN/FR/DE/IT/NL/ES/PT/DA/EL/TR (notices Makita-style multilingues).
    const SAFETY_RE = /\b(NOTICE|WARNING|CAUTION|DANGER|IMPORTANT|never\s+use|must\s+(?:not|be)|do\s+not\s+(?:use|operate|disassemble|short)|tape\s+(?:or|off)|hold\s+the\s+tool|annex\s+[a-z]|instruction\s+manual|HINWEIS|WARNUNG|VORSICHT|ANMERKUNG|BEMERKUNG|NOTA|AVVERTIMENTO|ATTENZIONE|AVVISO|OPMERKING|WAARSCHUWING|KENNISGEVING|LET\s+OP|ADVERTENCIA|PRECAUCI[ÓO]N|OBSERVA[ÇC][ÃA]O|BEM[ÆE]RK|ADVARSEL|FORSIGTIG|BEM[ÆE]RKNING|ΠΑΡΑΤΗΡΗΣΗ|ΠΡΟΕΙΔΟΠΟΙΗΣΗ|ΠΡΟΣΟΧΗ|ΕΙΔΟΠΟΙΗΣΗ|UYARI|D[İI]KKAT|[ÖO]NEML[İI]\s+NOT)\b/i
    if (SAFETY_RE.test(n) || SAFETY_RE.test(v)) return false
    // Caractères grecs ou turcs spécifiques → quasi-certainement du PDF multilingue
    if (/[ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψω]/.test(n) || /[ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψω]/.test(v)) return false
    // Prose anglaise composite : ≥5 mots ET ≥2 stopwords courants
    // Exception : si la valeur a une signature unité claire (digit + unité physique
    // OU valeur courte purement numérique), on garde — couvre les vraies specs
    // multi-mots type "Width of the cutting blade" → "300 mm".
    const ENGLISH_STOPWORDS = /\b(the|of|in|to|for|with|when|while|under|on|off|by|that|which|this|these|those|will|may|can|could|would|should|has|have|is|are|was|were|been|be|all|any|each|both|either|neither|some|few|many|several|most)\b/gi
    const looksLikeProse = (s: string): boolean => {
      const words = s.split(/\s+/).length
      if (words < 5) return false
      const stops = (s.match(ENGLISH_STOPWORDS) ?? []).length
      return stops >= 2
    }
    const hasUnitSignal = (s: string): boolean => {
      if (s.length > 80) return false
      if (!/\d/.test(s)) return false
      if (/\b(mm|cm|m|kg|g|nm|rpm|tr\/min|v|ah|w|kw|hz|db|dba|°|%|bar|l\/min|psi|mpa|ion|litre|watt|volt|amp)\b/i.test(s)) return true
      // Valeur courte purement numérique : "300", "0-1500", "300x500"
      if (s.length < 30 && /^[\d.,\s\-x×/]+$/.test(s)) return true
      return false
    }
    if ((looksLikeProse(n) || looksLikeProse(v)) && !hasUnitSignal(v)) return false

    if (isGarbageContent(n) || isGarbageContent(v)) return false
    seen.add(key)
    seenNames.add(nameKey)
    specs.push({ name: n, value: v, group: group || undefined })
    return true
  }

  const lines = md.split('\n')

  const jinaMetaRe = /^(Title|URL|Markdown Content|Source|Published Time|StatusCode|Favicon|ViewportWidth)\s*:/i

  // Lexique commun aux 3 formes de heading (markdown #, bold **, plain text avec `:`).
  const SPEC_HEADING_KEYWORDS = '(?:sp[eé]cifications?|caract[eé]ristiques?\\s*(?:techniques?|du\\s*produit)?|descriptif\\s*technique|donn[eé]es\\s*techniques?|informations?\\s*(?:techniques?)?|fiche\\s*technique|d[eé]tails?\\s*techniques?|normes?|directives?(?:\\s+europ[eé]ennes?)?|conformit[eé]|r[eé]glementation|certifications?|poids|puissance|d[eé]cibels?|vibrations?|dimensions?|batterie|general|g[eé]n[eé]ral|per[çc]age|vissage|couple|moteur|[eé]nergie|vitesse|mandrin|capacit[eé]s?|tension|autonomie|charge(?:ment)?|bruit|acoustique|emballage|inclus|contenu\\s*(?:de\\s*la\\s*)?livr|accessoires?)'
  // Forme 1 : heading markdown `## Spécifications`
  const specSectionRe = new RegExp(`^#{1,4}\\s*${SPEC_HEADING_KEYWORDS}`, 'i')
  // Forme 2 : heading bold `**Spécifications**`, `**Spécifications :**` ou
  // `**Spécifications**:` (Turndown d'un <strong> ou <b>). Trailer permissif :
  // accepte espaces/markers/colons dans n'importe quel ordre après le keyword.
  const specSectionBoldRe = new RegExp(`^[*_]{1,2}\\s*${SPEC_HEADING_KEYWORDS}[\\s*_:.]*$`, 'i')
  // Forme 3 : plain text `Spécifications :` sur sa propre ligne (sans markup).
  // Style Rubix/Leroy Merlin : `Caractéristiques :` mais aussi
  // `Capacité de perçage/burinage :` (contenu entre keyword et colon).
  const specSectionPlainRe = new RegExp(`^${SPEC_HEADING_KEYWORDS}[^:\\n]{0,60}:\\s*$`, 'i')
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
    // Heading bold (sans #) — `**Spécifications**` / `__Normes__`
    if (specSectionBoldRe.test(trimmed)) {
      inSpecSection = true
      currentGroup = trimmed.replace(/^[*_]{1,2}\s*|\s*[*_]{1,2}\s*[:.]?\s*$/g, '').trim()
      continue
    }
    // Heading plain text avec `:` — `Spécifications :`
    if (specSectionPlainRe.test(trimmed)) {
      inSpecSection = true
      currentGroup = trimmed.replace(/\s*:\s*$/, '').trim()
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
    // pas un article). La contrainte majuscule initiale est retirée : dans les
    // sections specs FR, "diamètre max dans l'acier" (minuscule) est une vraie spec.
    // Skip les bullets typographiques → laisser Format 5 les traiter (sinon ce
    // format les capture avec le bullet en préfixe puis add() rejette).
    if (inSpecSection && !/^[•·▪●◦▶]/.test(trimmed)) {
      const kvMatch = trimmed.match(/^([^:]{2,50})\s*:\s+(.{1,200})$/)
      if (kvMatch) {
        const n = kvMatch[1].replace(/\*\*/g, '').trim()
        const v = kvMatch[2].replace(/\*\*/g, '').trim()
        const wordCount = n.split(/\s+/).length
        const startsWithUpper = /^[A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ]/.test(n)
        // Noms minuscule-initial autorisés mais plus stricts (max 4 mots) :
        // "diamètre max dans l'acier" est une vraie spec, mais
        // "serre de jardin en polycarbonate" est de la prose.
        const looksLikeSpecName =
          (startsWithUpper ? wordCount <= 5 : wordCount <= 4)
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
        && !trimmed.startsWith('!') && !/^[=:\-]+$/.test(trimmed)
        && !/^[•·▪●◦▶]/.test(trimmed)  // bullets typographiques → laisser Format 5 les traiter
        && !/:\s*$/.test(trimmed)) {   // prose intro finissant par `:` (ex: "conforme aux directives :")
      let nextIdx = i + 1
      while (nextIdx < lines.length && nextIdx <= i + 3 && !lines[nextIdx].trim()) nextIdx++
      const nextLine = (lines[nextIdx] ?? '').trim()
      if (nextLine && nextLine.length > 0 && nextLine.length < 100
          && !nextLine.startsWith('#') && !nextLine.startsWith('-') && !nextLine.startsWith('*')
          && !nextLine.startsWith('[') && !nextLine.startsWith('|') && !nextLine.startsWith('http')
          && !nextLine.startsWith('!')
          && !/^[•·▪●◦▶]/.test(nextLine)) {  // ne pas absorber un bullet kv comme valeur
        const looksLikeValue = /\d/.test(nextLine) || nextLine.length < 30 || /\b(mm|cm|m|kg|g|nm|rpm|tr\/min|v|ah|w|kw|hz|db|dba|°|%|bar|l\/min|psi|mpa|ion|litre|watt|volt|amp)/i.test(nextLine)
        if (looksLikeValue) {
          // Tentative d'ajout. Si add() rejette (ex: nom = "Attributs" placeholder),
          // on NE consomme PAS la ligne suivante — elle redevient candidate au tour
          // d'après. Évite les cascades de shift quand un faux header générique
          // s'intercale dans une suite de specs alternées (Rubix-style).
          const accepted = add(trimmed, nextLine, currentGroup)
          if (accepted) {
            i = nextIdx
          }
          continue
        }
      }
    }

    // Format 5 : Bullet inline `• Nom : Valeur` (single-line, séparateur ` : `).
    // Pattern courant chez les revendeurs B2B (Rubix, Würth, Mabéo) qui rendent
    // les fiches Spécifications en liste à puces typographiques `•` plutôt qu'en
    // table. Restreint à `inSpecSection` pour éviter de capturer des bullets de
    // description marketing. Accepte aussi les variantes `·`, `▪`, `●`, `◦`.
    if (inSpecSection) {
      const bulletInlineMatch = trimmed.match(/^[•·▪●◦▶]\s+([^:]{2,60})\s*:\s+(.{1,200})$/)
      if (bulletInlineMatch) {
        const n = bulletInlineMatch[1].trim()
        const v = bulletInlineMatch[2].trim()
        // Garde-fou : nom doit ressembler à une vraie spec OU un code normatif.
        //   - Forme prose : ≤6 mots, commence par majuscule, pas par article
        //   - Forme code : alphanumérique avec / . - autorisés (ex: 2014/30/UE,
        //     EN60745-2-6, EN50581) — utilisé pour les sections "Normes"
        const isProseSpec =
          n.split(/\s+/).length <= 6
          && /^[A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ]/.test(n)
          && !/^(le|la|les|un|une|des|du|de|cette|ce|ces|votre|notre|optimis[eé]z?|am[eé]lior[eé]z?|d[eé]couvr[eé]z?|s[eé]lectionnez|profit[eé]z?)\b/i.test(n)
        const isCodeSpec = /^[A-Z\d][A-Z\d./\-+]{2,40}$/.test(n)
        if ((isProseSpec || isCodeSpec) && !/^https?:/.test(v)) {
          add(n, v, currentGroup)
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
