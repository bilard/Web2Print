import { useState, useCallback, useRef } from 'react'
import type { ExcelColumn, ExcelRow, ExcelSheet } from '@/features/excel/types'
import { getApiKey } from '@/lib/apiKeys'

const JINA_READER = 'https://r.jina.ai'

const jinaHeaders = (extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${getApiKey('jina')}`,
  Accept: 'application/json',
  'X-With-Links-Summary': 'true',
  'X-With-Images-Summary': 'true',
  ...extra,
})

// ─── Brand → Official Site mapping ───────────────────────────────────────────

export const BRAND_OFFICIAL_SITES: Record<string, { label: string; baseUrl: string; searchPattern?: string }> = {
  milwaukee:  { label: 'Milwaukee',       baseUrl: 'https://fr.milwaukeetool.eu/fr-fr/', searchPattern: '/fr-fr/product/' },
  dewalt:     { label: 'DeWalt',          baseUrl: 'https://www.dewalt.fr/' },
  makita:     { label: 'Makita',          baseUrl: 'https://www.makita.fr/' },
  bosch:      { label: 'Bosch Pro',       baseUrl: 'https://www.bosch-professional.com/fr/fr/' },
  metabo:     { label: 'Metabo',          baseUrl: 'https://www.metabo.com/fr/fr/' },
  hikoki:     { label: 'HiKOKI',         baseUrl: 'https://hikoki-powertools.fr/' },
  festool:    { label: 'Festool',         baseUrl: 'https://www.festool.fr/' },
  stihl:      { label: 'Stihl',           baseUrl: 'https://www.stihl.fr/' },
  husqvarna:  { label: 'Husqvarna',       baseUrl: 'https://www.husqvarna.com/fr/' },
  ryobi:      { label: 'Ryobi',           baseUrl: 'https://fr.ryobitools.eu/' },
  stanley:    { label: 'Stanley',          baseUrl: 'https://www.stanleyoutillage.fr/' },
  facom:      { label: 'Facom',           baseUrl: 'https://www.facom.fr/' },
  karcher:    { label: 'Kärcher',         baseUrl: 'https://www.kaercher.com/fr/' },
  einhell:    { label: 'Einhell',          baseUrl: 'https://www.einhell.fr/' },
  flex:       { label: 'Flex',             baseUrl: 'https://www.flex-tools.com/fr-fr/' },
  worx:       { label: 'Worx',            baseUrl: 'https://www.worx.com/fr/' },
}

const RESELLER_HOSTS = /leroymerlin|castorama|boulanger|fnac|darty|amazon|cdiscount|manomano|conforama|ikea|bricomarche|bricodepot|bricorama|mr-bricolage|toolstation|prolians|wurth|berner|distriartisan|outillage-online|guedo|mabeo|maxoutil|debonix/i

/** Détecte la marque dans une URL de revendeur et retourne le site officiel FR */
export function detectBrandFromUrl(url: string): { brand: string; officialSite: typeof BRAND_OFFICIAL_SITES[string] } | null {
  try {
    const host = new URL(url).hostname
    if (!RESELLER_HOSTS.test(host)) return null
    const path = new URL(url).pathname.toLowerCase() + ' ' + new URL(url).hostname.toLowerCase()
    for (const [key, site] of Object.entries(BRAND_OFFICIAL_SITES)) {
      if (path.includes(key)) return { brand: key, officialSite: site }
    }
    return null
  } catch { return null }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScrapingField {
  key: string
  label: string
  description: string
  type: 'string' | 'number' | 'boolean' | 'dict' | 'specs' | 'strings'
}

export interface ScrapeResult {
  rows: Record<string, unknown>[]
  columns: string[]
  screenshot?: string
}

export interface MapLink {
  url: string
  title?: string
}

export interface CrawlPage {
  url: string
  title: string
  content: string
}

export type ScrapingMode = 'auto' | 'schema'

// ─── Templates ────────────────────────────────────────────────────────────────

export const FIELD_TEMPLATES: Record<string, { label: string; fields: ScrapingField[] }> = {
  product: {
    label: 'Produit',
    fields: [
      { key: 'name', label: 'Nom', description: 'Nom complet du produit principal uniquement, EN FRANÇAIS', type: 'string' },
      { key: 'reference', label: 'Référence', description: 'Code référence ou SKU du produit principal', type: 'string' },
      { key: 'price', label: 'Prix', description: 'Prix de vente TTC affiché (ex: 299,00 €)', type: 'string' },
      { key: 'description', label: 'Description', description: 'Description ou accroche principale du produit, en français, pas les accessoires', type: 'string' },
      { key: 'category', label: 'Catégorie', description: 'Catégorie ou famille de produit, en français', type: 'string' },
      { key: 'brand', label: 'Marque', description: 'Marque ou fabricant', type: 'string' },
      { key: 'availability', label: 'Disponibilité', description: 'Disponibilité ou état du stock', type: 'string' },
      { key: 'ean', label: 'EAN', description: 'Code EAN ou code-barres du produit', type: 'string' },
      { key: 'image_url', label: 'Image', description: 'URL complète de la photo principale du produit', type: 'string' },
      { key: 'specifications', label: 'Spécifications', description: 'Toutes les spécifications techniques en tableau [{group, name, value}]. Inclure CHAQUE ligne du tableau technique de CHAQUE section/accordéon, en conservant le nom de la section dans le champ "group".', type: 'specs' },
    ],
  },
  product_tech: {
    label: 'Produit tech',
    fields: [
      { key: 'name', label: 'Nom', description: 'Nom complet du produit principal, EN FRANÇAIS', type: 'string' },
      { key: 'reference', label: 'Référence', description: 'Code référence (ex: DUH752Z)', type: 'string' },
      { key: 'price', label: 'Prix', description: 'Prix de vente affiché', type: 'string' },
      { key: 'description', label: 'Description', description: 'Description courte du produit principal uniquement, EN FRANÇAIS', type: 'string' },
      { key: 'brand', label: 'Marque', description: 'Marque ou fabricant', type: 'string' },
      { key: 'availability', label: 'Disponibilité', description: 'Stock ou disponibilité', type: 'string' },
      { key: 'ean', label: 'EAN', description: 'Code EAN ou code-barres', type: 'string' },
      { key: 'image_url', label: 'Image URL', description: 'URL complète de la photo principale du produit', type: 'string' },
      { key: 'specifications', label: 'Spécifications techniques', description: 'Capturer TOUTES les lignes de TOUTES les sections/accordéons techniques sous forme [{group, name, value}]. Le champ "group" correspond au titre de la section ou de l\'accordéon (ex: "Caractéristiques générales", "Batterie", "Bruit et vibrations"). Inclure CHAQUE ligne : Énergie, SPM, longueur lame, diamètre max, poids, dimensions, niveau sonore, vibrations, etc. AUCUNE EXCEPTION.', type: 'specs' },
    ],
  },
  product_full: {
    label: 'Produit complet',
    fields: [
      { key: 'name', label: 'Nom', description: 'Nom complet du produit principal, EN FRANÇAIS', type: 'string' },
      { key: 'reference', label: 'Référence', description: 'Code référence ou SKU (ex: DUH752Z, M18 FMTIW2F12-502X)', type: 'string' },
      { key: 'subtitle', label: 'Sous-titre', description: 'Sous-titre ou accroche courte du produit (ex: "18 V Li-Ion - 75 cm - Produit seul"), EN FRANÇAIS', type: 'string' },
      { key: 'description', label: 'Description', description: 'Description complète du produit principal EN FRANÇAIS : toutes les phrases descriptives, accroche, caractéristiques principales. NE PAS tronquer. Si le texte source est en anglais, TRADUIRE en français.', type: 'string' },
      { key: 'advantages', label: 'Avantages', description: 'Liste de TOUS les avantages/caractéristiques clés mentionnés (chaque bullet point, chaque USP), EN FRANÇAIS. Chercher dans les sections "Avantages", "Points forts", "Caractéristiques clés", "Features", etc. Tableau de strings.', type: 'strings' },
      { key: 'brand', label: 'Marque', description: 'Marque ou fabricant', type: 'string' },
      { key: 'availability', label: 'Disponibilité', description: 'Stock ou disponibilité (ex: "En stock", "En rupture de stock")', type: 'string' },
      { key: 'ean', label: 'EAN', description: 'Code EAN ou code-barres', type: 'string' },
      { key: 'images', label: 'Images', description: 'URLs COMPLÈTES de TOUTES les images produit (photos sous différents angles, vues, images lifestyle). Inclure chaque URL d\'image produit trouvée sur la page. Tableau de strings.', type: 'strings' },
      { key: 'specifications', label: 'Spécifications techniques', description: 'TOUTES les lignes de TOUTES les sections de spécifications sous forme [{group, name, value}]. Le champ "group" est le NOM EXACT du groupe/section/accordéon tel qu\'affiché sur la page (ex: "Informations générales", "Moteur", "Batterie", "Dimensions et poids", "Bruit et vibrations", "Contenu de la livraison"). Parcourir TOUTES les sections, y compris celles dans des accordéons repliables, onglets, ou sections dynamiques. AUCUNE EXCEPTION, AUCUNE LIMITE. Conserver les noms de groupes EN FRANÇAIS.', type: 'specs' },
      { key: 'documents', label: 'Documents', description: 'Tous les fichiers téléchargeables sous forme [{name, value}] où "name" est le NOM LISIBLE du document (ex: "Fiche technique", "Notice d\'utilisation", "Déclaration CE") et "value" est l\'URL ABSOLUE COMPLÈTE du fichier. Chercher les PDF, notices, fiches techniques, déclarations de conformité, manuels, schémas. Ne pas inventer de noms : utiliser le texte du lien tel qu\'affiché sur la page.', type: 'specs' },
    ],
  },
  listing: {
    label: 'Catalogue',
    fields: [
      { key: 'name', label: 'Nom', description: 'Nom du produit ou article, EN FRANÇAIS', type: 'string' },
      { key: 'price', label: 'Prix', description: 'Prix affiché', type: 'string' },
      { key: 'url', label: 'URL', description: 'Lien vers la page détail', type: 'string' },
      { key: 'image', label: 'Image', description: "URL de l'image principale", type: 'string' },
    ],
  },
  article: {
    label: 'Article',
    fields: [
      { key: 'title', label: 'Titre', description: "Titre de l'article", type: 'string' },
      { key: 'date', label: 'Date', description: 'Date de publication', type: 'string' },
      { key: 'author', label: 'Auteur', description: "Nom de l'auteur", type: 'string' },
      { key: 'summary', label: 'Résumé', description: "Résumé ou extrait de l'article, EN FRANÇAIS", type: 'string' },
      { key: 'url', label: 'URL', description: "Lien vers l'article", type: 'string' },
    ],
  },
  contact: {
    label: 'Contact',
    fields: [
      { key: 'name', label: 'Nom', description: 'Nom de la personne ou entreprise', type: 'string' },
      { key: 'email', label: 'Email', description: 'Adresse email', type: 'string' },
      { key: 'phone', label: 'Téléphone', description: 'Numéro de téléphone', type: 'string' },
      { key: 'address', label: 'Adresse', description: 'Adresse postale complète', type: 'string' },
    ],
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export type ExtractionTarget = 'single' | 'multiple'

function buildJsonSchema(fields: ScrapingField[], target: ExtractionTarget = 'multiple') {
  const properties: Record<string, unknown> = {}
  for (const f of fields) {
    if (f.type === 'dict') {
      properties[f.key] = {
        type: 'object',
        description: f.description,
        additionalProperties: { type: 'string' },
      }
    } else if (f.type === 'strings') {
      properties[f.key] = {
        type: 'array',
        description: f.description,
        items: { type: 'string' },
      }
    } else if (f.type === 'specs') {
      // Specs groupées : {group, name, value}
      properties[f.key] = {
        type: 'array',
        description: f.description,
        items: {
          type: 'object',
          properties: {
            group: { type: 'string', description: 'Nom du groupe ou de la section (ex: "Caractéristiques générales", "Batterie", "Dimensions"). Utiliser le titre de la section tel qu\'affiché sur la page.' },
            name: { type: 'string', description: 'Nom de la spécification' },
            value: { type: 'string', description: 'Valeur de la spécification' },
          },
          required: ['group', 'name', 'value'],
        },
      }
    } else {
      properties[f.key] = { type: f.type, description: f.description }
    }
  }
  if (target === 'single') {
    return { type: 'object', properties, required: fields.map((f) => f.key) }
  }
  return {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Liste exhaustive de TOUS les éléments trouvés sur la page',
        items: { type: 'object', properties, required: fields.map((f) => f.key) },
      },
    },
    required: ['items'],
  }
}

function normalizeToRows(
  data: unknown,
  fields: ScrapingField[],
  target: ExtractionTarget = 'multiple',
): Omit<ScrapeResult, 'screenshot'> {
  if (!data || typeof data !== 'object') return { rows: [], columns: [] }
  const d = data as Record<string, unknown>
  const cols = fields.length > 0 ? fields.map((f) => f.key) : Object.keys(d)

  if (target === 'single') {
    return { rows: [d], columns: cols }
  }

  const toColumns = (rows: Record<string, unknown>[]) =>
    fields.length > 0 ? fields.map((f) => f.key) : Object.keys(rows[0] ?? {})

  if (Array.isArray(d.items) && d.items.length > 0) {
    const rows = d.items as Record<string, unknown>[]
    return { rows, columns: toColumns(rows) }
  }
  if (Array.isArray(data) && (data as unknown[]).length > 0) {
    const rows = data as Record<string, unknown>[]
    return { rows, columns: toColumns(rows) }
  }
  for (const [key, v] of Object.entries(d)) {
    if (key === 'specifications') continue
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') continue
    if (Array.isArray(v) && v.length > 0 && typeof (v[0] as Record<string,unknown>)?.name !== 'string') {
      const rows = v as Record<string, unknown>[]
      return { rows, columns: toColumns(rows) }
    }
  }
  return { rows: [d], columns: cols }
}

// ─── Sheet conversion ────────────────────────────────────────────────────────

const isSpecsArray = (v: unknown): v is { group?: string; name: string; value: string }[] =>
  Array.isArray(v) && v.length > 0 && typeof (v[0] as Record<string, unknown>)?.name === 'string'

const isStringsArray = (v: unknown): v is string[] =>
  Array.isArray(v) && (v.length === 0 || typeof v[0] === 'string')

export function scrapeResultToSheet(result: ScrapeResult, fields: ScrapingField[], name: string): ExcelSheet {
  const labelMap = Object.fromEntries(fields.map((f) => [f.key, f.label]))

  const serializeCell = (v: unknown): string | null => {
    if (v == null) return null
    if (isSpecsArray(v)) return v.map((s) => `${s.group ? `[${s.group}] ` : ''}${s.name}: ${s.value}`).join(' | ')
    if (isStringsArray(v)) return v.join(' | ')
    if (typeof v === 'object') {
      return Object.entries(v as Record<string, unknown>).map(([k, val]) => `${k}: ${val}`).join(' | ')
    }
    return String(v)
  }

  // 1. Construire les colonnes de specs dynamiques, groupées
  const specsColumns: ExcelColumn[] = []
  const specsData: Map<string, string[]> = new Map()

  for (const row of result.rows) {
    for (const col of result.columns) {
      const v = row[col]
      if (!isSpecsArray(v)) continue

      // Déterminer si ce champ est "documents" (specs name/value = nom/url)
      const isDocField = col === 'documents'

      for (const spec of v) {
        const groupSlug = spec.group
          ? spec.group.toLowerCase().replace(/[^a-z0-9àâäéèêëïîôùûüÿçœæ]+/gi, '_').replace(/^_|_$/g, '').slice(0, 25)
          : ''
        const nameSlug = spec.name.toLowerCase().replace(/[^a-z0-9àâäéèêëïîôùûüÿçœæ]+/gi, '_').replace(/^_|_$/g, '').slice(0, 40)

        const key = isDocField
          ? `doc_${nameSlug}`
          : groupSlug
            ? `spec_${groupSlug}_${nameSlug}`
            : `spec_${nameSlug}`

        if (!specsData.has(key)) {
          specsData.set(key, [])
          const label = isDocField
            ? `📄 ${spec.name}`
            : spec.group
              ? `[${spec.group}] ${spec.name}`
              : spec.name
          specsColumns.push({
            key,
            label,
            fieldType: isDocField ? 'url' as const : 'text' as const,
            detectedType: isDocField ? 'url' as const : 'text' as const,
            isPrimary: false,
            width: isDocField ? 240 : 160,
          })
        }
        specsData.get(key)!.push(spec.value)
      }
    }
  }

  // Helper: détecter si une colonne contient des URLs d'images
  const IMG_EXTS = /\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i
  const isImageCol = (key: string): boolean => {
    for (const r of result.rows) {
      const v = r[key]
      if (typeof v === 'string' && v.startsWith('http')) return IMG_EXTS.test(v)
      if (Array.isArray(v) && v.length > 0) {
        const first = v.find(x => typeof x === 'string' && (x as string).startsWith('http'))
        if (first) return IMG_EXTS.test(first as string)
      }
    }
    return false
  }

  // 2. Colonnes standard (sauf celles expansées en specs)
  const specsKeys = new Set(specsColumns.map((s) => s.key))
  const baseColumns: ExcelColumn[] = result.columns
    .filter((key) => !isSpecsArray(result.rows[0]?.[key]) && !(isStringsArray(result.rows[0]?.[key]) && specsKeys.has(key)))
    .map((key, i) => {
      const imgCol = isImageCol(key)
      return {
        key, label: labelMap[key] ?? key,
        fieldType: imgCol ? 'image' as const : 'text' as const,
        detectedType: imgCol ? 'image' as const : 'text' as const,
        isPrimary: i === 0 && specsKeys.size === 0,
        width: imgCol ? 120 : 180,
      }
    })

  const columns = [...baseColumns, ...specsColumns]
  if (columns.length > 0) columns[0].isPrimary = true

  // 3. Lignes
  const rows: ExcelRow[] = result.rows.map((r, i) => {
    const base: ExcelRow = {
      _id: `scraped_${i}`,
      ...Object.fromEntries(
        result.columns
          .filter((k) => !isSpecsArray(r[k]))
          .map((k) => [k, serializeCell(r[k])])
      ),
    }
    for (const [key, values] of specsData.entries()) {
      base[key] = values[i] ?? null
    }
    return base
  })

  return { name, columns, rows, taxonomy: [] }
}

export function crawlPagesToSheet(pages: CrawlPage[], name: string): ExcelSheet {
  return {
    name,
    columns: [
      { key: 'url', label: 'URL', fieldType: 'url', detectedType: 'url', isPrimary: true, width: 280 },
      { key: 'title', label: 'Titre', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 200 },
      { key: 'content', label: 'Contenu', fieldType: 'text_long', detectedType: 'text_long', isPrimary: false, width: 400 },
    ],
    rows: pages.map((p, i) => ({ _id: `crawl_${i}`, url: p.url, title: p.title, content: p.content })),
    taxonomy: [],
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ─── Jina Reader ─────────────────────────────────────────────────────────────

interface JinaReaderResponse {
  code: number
  data: {
    title: string
    description: string
    url: string
    content: string
    links?: Record<string, string>
    images?: Record<string, string>
    html?: string
  }
}

async function jinaRead(url: string, opts: { timeout?: number; noCache?: boolean } = {}): Promise<JinaReaderResponse['data']> {
  const extra: Record<string, string> = {}
  // Timeout minimum 10s pour les sites fournisseurs (SPA, accordéons JS)
  const timeout = Math.max(opts.timeout ?? 0, 10000)
  extra['X-Timeout'] = String(Math.ceil(timeout / 1000))
  if (opts.noCache) extra['X-No-Cache'] = 'true'
  // Forcer le rendu JS complet pour les accordéons dynamiques
  extra['X-Wait-For-Selector'] = 'body'

  const res = await fetch(`${JINA_READER}/${url}`, { headers: jinaHeaders(extra) })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Jina Reader: HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}`)
  }
  const json = await res.json() as JinaReaderResponse
  if (!json.data?.content && !json.data?.title) {
    throw new Error('Jina Reader n\'a retourné aucun contenu — le site bloque peut-être le scraping')
  }
  return json.data
}

// ─── LLM extraction (Gemini Flash) ──────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `Tu es un extracteur de données produit professionnel. Tu travailles pour un éditeur de catalogues français.

RÈGLES ABSOLUES :
1. LANGUE : Toutes les données textuelles DOIVENT être retournées EN FRANÇAIS. Si le texte source est en anglais, allemand ou toute autre langue, TRADUIS-LE en français courant et naturel. Seules les références produit, codes EAN, URLs et unités de mesure restent dans leur forme originale.

2. EXHAUSTIVITÉ : Extrais TOUTES les informations disponibles, sans exception. Les pages de fabricants contiennent souvent des données dans des sections repliables (accordéons), des onglets, des panneaux dynamiques. Le contenu Markdown ci-dessous inclut le texte de TOUTES ces sections — parcours-le ENTIÈREMENT.

3. SPÉCIFICATIONS GROUPÉES : Les spécifications techniques sont souvent organisées en groupes/sections sur la page (ex: "Caractéristiques générales", "Moteur", "Batterie", "Dimensions et poids", "Bruit et vibrations", "Contenu de la livraison"). Tu DOIS conserver le nom exact du groupe dans le champ "group" de chaque spécification. Si une spec n'a pas de groupe visible, utilise "Général".

4. DOCUMENTS / PDF : Pour chaque document téléchargeable, utilise le texte du lien visible sur la page comme "name" (ex: "Fiche technique", "Notice d'utilisation", "Déclaration de conformité CE") et l'URL complète comme "value". Ne raccourcis pas les URLs, ne modifie pas les noms.

5. FIDÉLITÉ : N'invente JAMAIS de données. Si une information n'est pas clairement lisible dans le contenu, retourne null ou une chaîne vide. Ne déduis pas, n'invente pas, ne complète pas avec des valeurs fictives.

6. IMAGES : Retourne les URLs COMPLÈTES des images (pas de chemins relatifs). Inclure toutes les images produit, pas les icônes ou logos du site.`

async function llmExtract(
  content: string,
  schema: Record<string, unknown>,
  prompt: string,
  images?: Record<string, string>,
  links?: Record<string, string>,
): Promise<unknown> {
  const geminiKey = getApiKey('gemini')
  if (!geminiKey) throw new Error('Clé API Gemini requise pour l\'extraction structurée (onglet IA → Paramètres)')

  const imagesContext = images && Object.keys(images).length > 0
    ? `\n\n── IMAGES trouvées sur la page ──\n${Object.entries(images).map(([alt, url]) => `- ${alt || '(sans alt)'}: ${url}`).join('\n')}`
    : ''

  // Inclure les liens pour repérer les PDFs et documents
  const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|zip)(\?[^"']*)?$/i
  const docLinks = links
    ? Object.entries(links).filter(([, href]) => DOC_EXT.test(href))
    : []
  const docsContext = docLinks.length > 0
    ? `\n\n── DOCUMENTS TÉLÉCHARGEABLES trouvés ──\n${docLinks.map(([text, url]) => `- ${text}: ${url}`).join('\n')}`
    : ''

  const userPrompt = [
    EXTRACTION_SYSTEM_PROMPT,
    prompt ? `\nINSTRUCTIONS UTILISATEUR : ${prompt}` : '',
    `\n\n── CONTENU DE LA PAGE ──\n${content.slice(0, 80000)}`,
    imagesContext,
    docsContext,
  ].join('')

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: userPrompt }],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.1,
        },
      }),
    },
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(`Gemini: ${err.error?.message ?? `HTTP ${res.status}`}`)
  }

  const json = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini n\'a retourné aucun contenu')
  return JSON.parse(text)
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useJina() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const abortRef = useRef(false)

  const reset = () => { setError(null); setProgress(null); abortRef.current = false }

  // ── Scrape (single URL) ────────────────────────────────────────────────────
  const scrape = useCallback(async (
    url: string, mode: ScrapingMode, fields: ScrapingField[],
    prompt: string, opts: { target?: ExtractionTarget; waitFor?: number; noCache?: boolean } = {},
  ): Promise<ScrapeResult | null> => {
    setLoading(true); reset()
    try {
      const hasFields = mode === 'schema' && fields.length > 0
      const target = opts.target ?? 'multiple'
      const isSingle = target === 'single'

      // 1. Lire la page avec Jina Reader
      const page = await jinaRead(url, { timeout: opts.waitFor, noCache: opts.noCache })

      // 2. Construire le prompt contextuel
      const extractPrompt = prompt.trim() || (
        isSingle
          ? `Extrais UNIQUEMENT les données du produit PRINCIPAL visible sur cette page. Ignore les produits similaires, accessoires, navigation et footer. Retourne un objet unique (PAS une liste). Vérifie que TOUTES les sections de spécifications (y compris accordéons) sont couvertes.`
          : hasFields
            ? `Extrais TOUS les éléments de la liste sur cette page sous forme de tableau "items". Ignore menus et footer.`
            : `Extrais les données structurées PRINCIPALES de cette page sous forme de tableau "items".`
      )

      // 3. Construire le schema
      const schema = hasFields
        ? buildJsonSchema(fields, target)
        : {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: { type: 'object', additionalProperties: { type: 'string' } },
              },
            },
          }

      // 4. Extraction LLM avec tout le contexte (contenu + images + liens docs)
      const extracted = await llmExtract(page.content, schema, extractPrompt, page.images, page.links) as Record<string, unknown>

      // 5. Compléter les documents depuis les liens Jina si l'IA les a manqués
      if (fields.some(f => f.key === 'documents') && page.links) {
        const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|zip)(\?[^"']*)?$/i
        const docEntries = Object.entries(page.links).filter(([, href]) => DOC_EXT.test(href))
        if (docEntries.length > 0) {
          const existing = extracted.documents
          const isEmpty = !existing || (Array.isArray(existing) && existing.length === 0)
          if (isEmpty) {
            extracted.documents = docEntries.map(([text, href]) => ({
              group: 'Documents',
              name: text || href.split('/').pop()?.replace(/\?.*$/, '') || 'Document',
              value: href,
            }))
          }
        }
      }

      // 6. Détecter les données hallucinées
      const allValues = Object.values(extracted).filter(v => typeof v === 'string').map(v => String(v))
      const hallucinationPatterns = /^(produit principal|marque x|nom du produit|product name|example|lorem ipsum|n\/a|non disponible|non spécifié|not available|your product|test product)$/i
      const fakeEan = /^(1234567890123|0000000000000|9999999999999)$/
      const hasHallucination = allValues.some(v => hallucinationPatterns.test(v.trim()) || fakeEan.test(v.trim()))
      if (hasHallucination) {
        throw new Error('Les données extraites semblent fictives. Essayez avec un prompt plus précis ou vérifiez que la page est accessible.')
      }

      const { rows, columns } = normalizeToRows(extracted, fields, target)
      if (rows.length === 0) throw new Error('Aucune ligne extraite — affine le schéma ou le prompt')
      return { rows, columns }
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); return null }
    finally { setLoading(false) }
  }, [])

  // ── Map (discover URLs) ────────────────────────────────────────────────────
  const map = useCallback(async (url: string, search?: string): Promise<MapLink[] | null> => {
    setLoading(true); reset()
    try {
      const page = await jinaRead(url)

      if (!page.links || Object.keys(page.links).length === 0) {
        throw new Error('Aucun lien trouvé sur cette page')
      }

      const baseHost = new URL(url).hostname
      let links: MapLink[] = Object.entries(page.links)
        .filter(([, href]) => {
          try { return new URL(href).hostname.includes(baseHost) } catch { return false }
        })
        .map(([title, href]) => ({ url: href, title: title || undefined }))

      if (search?.trim()) {
        const q = search.trim().toLowerCase()
        links = links.filter(l =>
          l.url.toLowerCase().includes(q) || (l.title?.toLowerCase().includes(q) ?? false)
        )
      }

      const seen = new Set<string>()
      links = links.filter(l => {
        if (seen.has(l.url)) return false
        seen.add(l.url)
        return true
      })

      return links
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); return null }
    finally { setLoading(false) }
  }, [])

  // ── Extract async (multi-URL) ──────────────────────────────────────────────
  const extract = useCallback(async (
    urls: string[], fields: ScrapingField[], prompt: string,
  ): Promise<ScrapeResult | null> => {
    setLoading(true); reset()
    try {
      const allRows: Record<string, unknown>[] = []
      const cols = fields.length > 0 ? fields.map(f => f.key) : []

      for (let i = 0; i < urls.length; i++) {
        if (abortRef.current) break
        setProgress({ done: i, total: urls.length })

        try {
          const page = await jinaRead(urls[i])
          const schema = fields.length > 0
            ? buildJsonSchema(fields)
            : { type: 'object', properties: { items: { type: 'array', items: { type: 'object', additionalProperties: { type: 'string' } } } } }

          const extracted = await llmExtract(page.content, schema, prompt || 'Extrais les données structurées de cette page. Retourne toutes les données EN FRANÇAIS.', page.images, page.links)
          const { rows, columns } = normalizeToRows(extracted, fields)
          allRows.push(...rows)
          if (cols.length === 0 && columns.length > 0) cols.push(...columns)
        } catch (e) {
          console.warn(`[Jina] extract failed for ${urls[i]}:`, e)
        }

        if (i < urls.length - 1) await sleep(500)
      }

      setProgress({ done: urls.length, total: urls.length })
      if (allRows.length === 0) throw new Error('Aucun résultat extrait')
      return { rows: allRows, columns: cols }
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); return null }
    finally { setLoading(false) }
  }, [])

  // ── Crawl (full site) ──────────────────────────────────────────────────────
  const crawl = useCallback(async (
    url: string,
    opts: { limit?: number; includePaths?: string; excludePaths?: string } = {},
    onPage?: (page: CrawlPage) => void,
  ): Promise<CrawlPage[] | null> => {
    setLoading(true); reset()
    try {
      const limit = opts.limit ?? 50
      const baseHost = new URL(url).hostname
      const includeRe = opts.includePaths?.trim() ? new RegExp(opts.includePaths.trim()) : null
      const excludeRe = opts.excludePaths?.trim() ? new RegExp(opts.excludePaths.trim()) : null

      const pages: CrawlPage[] = []
      const visited = new Set<string>()
      const queue: string[] = [url]

      while (queue.length > 0 && pages.length < limit && !abortRef.current) {
        const currentUrl = queue.shift()!
        if (visited.has(currentUrl)) continue
        visited.add(currentUrl)

        setProgress({ done: pages.length, total: Math.min(limit, pages.length + queue.length + 1) })

        try {
          const page = await jinaRead(currentUrl)
          const crawlPage: CrawlPage = {
            url: page.url || currentUrl,
            title: page.title || '',
            content: page.content.slice(0, 2000),
          }
          pages.push(crawlPage)
          onPage?.(crawlPage)

          if (page.links && pages.length < limit) {
            for (const href of Object.values(page.links)) {
              try {
                const linkUrl = new URL(href)
                if (!linkUrl.hostname.includes(baseHost)) continue
                const path = linkUrl.pathname
                if (includeRe && !includeRe.test(path)) continue
                if (excludeRe && excludeRe.test(path)) continue
                if (!visited.has(href) && !queue.includes(href)) {
                  queue.push(href)
                }
              } catch { /* URL invalide */ }
            }
          }
        } catch (e) {
          console.warn(`[Jina] crawl failed for ${currentUrl}:`, e)
        }

        if (queue.length > 0 && pages.length < limit) await sleep(500)
      }

      setProgress({ done: pages.length, total: pages.length })
      return pages.length > 0 ? pages : null
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); return null }
    finally { setLoading(false) }
  }, [])

  const abort = () => { abortRef.current = true }

  return { scrape, map, extract, crawl, abort, loading, error, progress }
}
