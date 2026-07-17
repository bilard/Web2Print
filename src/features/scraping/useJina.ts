import { useState, useCallback, useRef } from 'react'
import { httpsCallable } from 'firebase/functions'
import type { ExcelColumn, ExcelRow, ExcelSheet } from '@/features/excel/types'
import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import { ENRICHMENT_COLUMNS, buildEnrichmentColumn, serializeEnriched } from '@/features/excel/ai-enrichment/useSaveEnrichedProduct'
import { buildTaxonomyFromLevels } from '@/features/excel/taxonomyBuilder'
import { getApiKey } from '@/lib/apiKeys'
import { llmPostWithFallback } from '@/lib/llmProxyClient'
import { functions } from '@/lib/firebase/config'
import { appendDebugEntry, genId } from '@/features/scraping-hub/debugLog'
import { sanitizeSchemaForGemini } from '@/features/briefs/ai/geminiClient'
import { selectDiscoveryEntries } from './core/discoverLinks'
import { firecrawlScrapeHtml } from './core/firecrawlFallback'
import { brightDataScrapeHtml } from './core/brightDataFallback'
import { fetchSourceHtml } from '@/features/scraping-templates/fetchSourceHtml'
import { recordScrapeUsage } from '@/features/stats/aiUsageTracking'

/** Cloud Function Puppeteer : extrait le breadcrumb visible d'une page
 *  e-commerce (contourne les protections anti-bot qui servent aux crawlers
 *  une version SEO différente du HTML visible). */
const extractBreadcrumbCloudFn = httpsCallable<
  { url: string },
  {
    items: string[]
    selector: string | null
    images: string[]
    links?: string[]
    /** Ancres en zone de navigation (header/nav/footer/aside) — exclues de la découverte. */
    navLinks?: string[]
    /** Ancres « carte produit » (groupes répétés en zone contenu) — source prioritaire. */
    cardLinks?: { url: string; title: string }[]
  }
>(functions, 'extractBreadcrumb', { timeout: 185_000 })

const JINA_READER = 'https://r.jina.ai'

const jinaHeaders = (extra: Record<string, string> = {}) => {
  // Sans clé (compte sans clé perso ni VITE_JINA_API_KEY) : NE PAS envoyer
  // `Authorization: Bearer ` vide — Jina répond 401 AuthenticationFailedError,
  // alors que le tier anonyme (rate-limité) fonctionne sans header.
  const key = getApiKey('jina').trim()
  return {
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
    Accept: 'application/json',
    'X-With-Links-Summary': 'true',
    'X-With-Images-Summary': 'true',
    ...extra,
  }
}

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
  aeg:        { label: 'AEG',              baseUrl: 'https://www.aeg-powertools.eu/fr/' },
  hilti:      { label: 'Hilti',            baseUrl: 'https://www.hilti.fr/' },
  grundfos:   { label: 'Grundfos',         baseUrl: 'https://product-selection.grundfos.com/fr/' },
  geberit:    { label: 'Geberit',          baseUrl: 'https://www.geberit.fr/' },
  villeroy:   { label: 'Villeroy & Boch',  baseUrl: 'https://www.villeroy-boch.fr/' },
  roca:       { label: 'Roca',             baseUrl: 'https://www.roca.fr/' },
  ideal:      { label: 'Ideal Standard',   baseUrl: 'https://www.idealstandard.fr/' },
}

export const RESELLER_HOSTS = /leroymerlin|castorama|boulanger|fnac|darty|amazon|cdiscount|manomano|conforama|ikea|bricomarche|bricodepot|bricorama|mr-bricolage|toolstation|prolians|wurth|berner|distriartisan|outillage-online|guedo|mabeo|maxoutil|debonix|rubix|screwfix|tooled-up|orexad|raja|rs-online|rs-components|conrad|farnell|distrelec|reichelt/i

/** Labels affichables pour les revendeurs reconnus dans `RESELLER_HOSTS`.
 *  Utilisés pour nommer une source à l'import quand l'URL ne révèle pas
 *  de marque produit (ex: `fr.rubix.com` → « Rubix »). L'ordre n'a pas
 *  d'importance : on prend le premier hit du regex source. */
const RESELLER_LABELS: Record<string, string> = {
  leroymerlin: 'Leroy Merlin',
  castorama: 'Castorama',
  boulanger: 'Boulanger',
  fnac: 'Fnac',
  darty: 'Darty',
  amazon: 'Amazon',
  cdiscount: 'Cdiscount',
  manomano: 'ManoMano',
  conforama: 'Conforama',
  ikea: 'IKEA',
  bricomarche: 'Bricomarché',
  bricodepot: 'Brico Dépôt',
  bricorama: 'Bricorama',
  'mr-bricolage': 'Mr.Bricolage',
  toolstation: 'Toolstation',
  prolians: 'Prolians',
  wurth: 'Würth',
  berner: 'Berner',
  distriartisan: 'Distri Artisan',
  'outillage-online': 'Outillage Online',
  guedo: 'Guedo',
  mabeo: 'Mabéo',
  maxoutil: 'Maxoutil',
  debonix: 'Debonix',
  rubix: 'Rubix',
  screwfix: 'Screwfix',
  'tooled-up': 'Tooled-Up',
  orexad: 'Orexad',
  raja: 'Raja',
  'rs-online': 'RS Online',
  'rs-components': 'RS Components',
  conrad: 'Conrad',
  farnell: 'Farnell',
  distrelec: 'Distrelec',
  reichelt: 'Reichelt',
}

/** Préfixes SKU industriels reconnus → marque. Permet de détecter la marque
 *  même quand son nom n'est pas dans l'URL — courant chez les revendeurs B2B
 *  qui n'utilisent que la référence (Rubix : `dga506rtj`, `dcg405n`, etc.).
 *  Liste à étendre au besoin, mais reste universelle (préfixes constructeurs
 *  documentés, pas du keyword retail-français). */
const SKU_BRAND_PREFIXES: Array<{ pattern: RegExp; brand: string }> = [
  { pattern: /\b(?:dga|dhr|dhp|ddf|dls|dpb|duh|dub|dlw|djr|dtm|dtw|dtd|dlm|dmr|dur|dn|drt|drv|dcl|dcs|djs)\d{2,4}/i, brand: 'makita' },
  { pattern: /\b(?:dcg|dcd|dch|dcs|dcb|dcn|dcf|dcr|dcm|dcl|dcw|dcp|dcst|dcmt|dcmw)\d{2,4}/i, brand: 'dewalt' },
  { pattern: /\b(?:gbh|gsr|gbs|gbm|gws|gas|gst|gop|gho|gli|gex|gss|gco|glm|gtb|gke|gkf|gks|gkt)\d{2,4}/i, brand: 'bosch' },
  { pattern: /\bm(?:12|18|28)\b\s?[-_]?[a-z]{2,5}/i, brand: 'milwaukee' },
  { pattern: /\b(?:bsb|btw|bdd|bek|bex|bks|bsh|bsp|bts|bvc|bsj|bld|bmm)\d{2,4}/i, brand: 'aeg' },
  { pattern: /\b(?:ts|of|ro|ets|psc|pdc|kapex|domino)\b\s?\d{2,4}/i, brand: 'festool' },
  { pattern: /\bksc?[a-z]{0,3}\d{2,4}/i, brand: 'metabo' },
  { pattern: /\b(?:rb|olt|rl)\d{2,4}/i, brand: 'ryobi' },
]

/** Détecte le label de marque depuis une URL — site officiel OU revendeur.
 *  Retourne le label affichable (« Milwaukee », « DeWalt »…) ou null si rien
 *  n'est reconnu. À utiliser pour nommer une source/sheet à l'import.
 *  Stratégie :
 *   1. Site officiel : hostname matche le baseUrl de `BRAND_OFFICIAL_SITES`
 *      (ex : `fr.milwaukeetool.eu` → « Milwaukee »).
 *   2. Revendeur : délègue à `detectBrandFromUrl` qui inspecte path + SKU.
 *   3. Fallback : la clé de marque apparaît comme segment isolé du hostname
 *      (entre points/tirets), pour les sous-domaines régionaux non listés. */
export function detectBrandLabelFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()

    // Revendeur : tente d'abord la marque produit (path + SKU). Si rien, on
    // affiche le nom du revendeur lui-même (« Rubix », « Leroy Merlin »…)
    // plutôt que le hostname brut.
    if (RESELLER_HOSTS.test(host)) {
      const detected = detectBrandFromUrl(url)
      if (detected) return detected.officialSite.label
      for (const [key, label] of Object.entries(RESELLER_LABELS)) {
        if (host.includes(key)) return label
      }
      return null
    }

    // Site officiel : match hostname strict (avec/sans `www.`) ou suffix.
    for (const site of Object.values(BRAND_OFFICIAL_SITES)) {
      try {
        const officialHost = new URL(site.baseUrl).hostname.toLowerCase()
        const stripped = officialHost.replace(/^www\./, '')
        if (host === officialHost || host === stripped || host.endsWith('.' + stripped)) {
          return site.label
        }
      } catch { /* baseUrl invalide — ignore */ }
    }

    // Dernier recours : clé de marque comme segment isolé du hostname
    // (`fr.milwaukee-tools.eu` mais pas `flexitarian.com` pour `flex`).
    for (const [key, site] of Object.entries(BRAND_OFFICIAL_SITES)) {
      const re = new RegExp(`(^|[.\\-])${key}([.\\-]|$)`, 'i')
      if (re.test(host)) return site.label
    }

    return null
  } catch { return null }
}

/** Détecte la marque dans une URL de revendeur et retourne le site officiel FR.
 *  Cherche dans 3 sources :
 *   1. Mot-clé marque dans le path/host (`milwaukee`, `bosch`…)
 *   2. Préfixe SKU industriel connu (`DGA506RTJ` → Makita, `DCG405N` → DeWalt)
 *   3. Aucune trouvée → null
 *  Fonctionne aussi sur les URLs de gros revendeurs B2B qui n'écrivent que
 *  la référence sans nom de marque (ex: Rubix, Mabéo, Würth). */
export function detectBrandFromUrl(url: string): { brand: string; officialSite: typeof BRAND_OFFICIAL_SITES[string] } | null {
  try {
    const host = new URL(url).hostname
    if (!RESELLER_HOSTS.test(host)) return null
    const path = new URL(url).pathname.toLowerCase() + ' ' + host.toLowerCase()

    // 1. Match par nom de marque (existant)
    for (const [key, site] of Object.entries(BRAND_OFFICIAL_SITES)) {
      if (path.includes(key)) return { brand: key, officialSite: site }
    }

    // 2. Match par préfixe SKU (nouveau)
    for (const { pattern, brand } of SKU_BRAND_PREFIXES) {
      if (pattern.test(path)) {
        const site = BRAND_OFFICIAL_SITES[brand]
        if (site) return { brand, officialSite: site }
      }
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

const BREADCRUMB_DESCRIPTION =
  'Fil d\'Ariane (breadcrumb) de la page, recopié VERBATIM depuis la source. ' +
  'Il s\'agit de la séquence de liens courte affichée juste sous le header (chevrons ">", slashes "/" ou flèches) qui indique la position de la page dans le site. ' +
  'Exemples : ["Homme", "Chaussures", "Baskets"] pour une page Decathlon ; ["Outillage", "Perceuses"] pour une page bricolage. ' +
  'Règles : recopie chaque libellé EXACTEMENT tel qu\'il est écrit (pas de traduction, pas de reformulation). ' +
  'Si la page affiche un breadcrumb plus détaillé dans le JSON-LD (schema.org BreadcrumbList) que celui rendu visuellement, privilégie celui qui est le plus court et qui correspond au chemin affiché à l\'utilisateur. ' +
  'Ignore le méga-menu principal et les menus latéraux de navigation — ce ne sont pas des breadcrumbs.'

export const FIELD_TEMPLATES: Record<string, { label: string; fields: ScrapingField[] }> = {
  product: {
    label: 'Produit',
    fields: [
      { key: 'name', label: 'Nom', description: 'Nom complet du produit principal uniquement, EN FRANÇAIS', type: 'string' },
      { key: 'reference', label: 'Référence', description: 'Code référence ou SKU du produit principal', type: 'string' },
      { key: 'price', label: 'Prix', description: 'Prix de vente TTC affiché (ex: 299,00 €)', type: 'string' },
      { key: 'description', label: 'Description', description: 'Description ou accroche principale du produit recopiée VERBATIM depuis la page (mot pour mot, sans reformuler ni résumer), pas les accessoires. Conserve les retours à la ligne de la source (paragraphes, listes)', type: 'string' },
      { key: 'category', label: 'Catégorie', description: 'Catégorie ou famille de produit, en français', type: 'string' },
      { key: 'breadcrumb', label: 'Fil d\'Ariane', description: BREADCRUMB_DESCRIPTION, type: 'strings' },
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
      { key: 'description', label: 'Description', description: 'Description du produit principal recopiée VERBATIM depuis la page (mot pour mot, sans reformuler ni résumer). Conserve les retours à la ligne de la source (paragraphes, listes)', type: 'string' },
      { key: 'breadcrumb', label: 'Fil d\'Ariane', description: BREADCRUMB_DESCRIPTION, type: 'strings' },
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
      { key: 'price', label: 'Prix', description: 'Prix de vente TTC affiché (ex: 299,00 €) — vide si la page n\'affiche pas de prix (site fabricant)', type: 'string' },
      { key: 'description', label: 'Description', description: 'Description complète du produit principal recopiée VERBATIM depuis la page : toutes les phrases descriptives telles qu\'écrites par la source, mot pour mot, EN CONSERVANT sa structure (retours à la ligne entre paragraphes, listes à puces). NE PAS tronquer, NE PAS reformuler, NE PAS résumer, NE PAS traduire.', type: 'string' },
      { key: 'breadcrumb', label: 'Fil d\'Ariane', description: BREADCRUMB_DESCRIPTION, type: 'strings' },
      { key: 'advantages', label: 'Avantages', description: 'Liste de TOUS les avantages/caractéristiques clés, chaque puce recopiée VERBATIM telle qu\'écrite par la source (mot pour mot, sans reformuler ni traduire). Chercher dans les sections "Avantages", "Points forts", "Caractéristiques clés", "Features", etc. Tableau de strings.', type: 'strings' },
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
      { key: 'breadcrumb', label: 'Fil d\'Ariane', description: BREADCRUMB_DESCRIPTION, type: 'strings' },
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
      { key: 'breadcrumb', label: 'Fil d\'Ariane', description: BREADCRUMB_DESCRIPTION, type: 'strings' },
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

export function scrapeResultToSheet(result: ScrapeResult, fields: ScrapingField[], name: string, sourceUrl?: string): ExcelSheet {
  const labelMap = Object.fromEntries(fields.map((f) => [f.key, f.label]))

  // Absolutise un chemin d'image relatif (`img/x.jpg`) en URL complète via l'URL
  // source du scrape — sinon il est inexploitable hors du site (affichage, DAM).
  const absolutizeImg = (s: string | null): string | null => {
    if (!s || !sourceUrl) return s
    return s
      .split(' | ')
      .map((part) => {
        const p = part.trim()
        if (!p || /^(https?:|data:)/i.test(p)) return p
        try { return new URL(p, sourceUrl).toString() } catch { return p }
      })
      .join(' | ')
  }

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

  // Helper: détecter si une colonne contient des URLs d'images.
  // Heuristiques cumulatives :
  //   1. Nom de champ explicitement "image/photo/picture" (ex: `image_url`, `images`)
  //   2. URL avec extension image classique
  //   3. URL sur un CDN d'images connu (Scene7, Cloudinary, Imgix, Akamai…) —
  //      ces CDN ne mettent pas d'extension dans le path (ex: Boulanger Scene7
  //      `https://boulanger.scene7.com/is/image/Boulanger/1207575_0?...`)
  const IMG_EXTS = /\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i
  const IMG_CDN = /scene7\.com|cloudinary\.com|imgix\.net|akamaized\.net|cdninstagram|fbcdn\.net|\/is\/image\/|\/image\/upload\/|\/image\/fetch\//i
  const isImageUrl = (s: string): boolean =>
    s.startsWith('http') && (IMG_EXTS.test(s) || IMG_CDN.test(s))
  const isImageCol = (key: string): boolean => {
    if (/image|photo|picture/i.test(key)) return true
    for (const r of result.rows) {
      const v = r[key]
      if (typeof v === 'string' && isImageUrl(v)) return true
      if (Array.isArray(v) && v.length > 0) {
        const first = v.find((x) => typeof x === 'string' && isImageUrl(x as string))
        if (first) return true
      }
    }
    return false
  }

  // 2. Expansion du fil d'Ariane en colonnes taxonomie hiérarchiques
  const BREADCRUMB_KEY = 'breadcrumb'
  const hasBreadcrumbField = fields.some((f) => f.key === BREADCRUMB_KEY)
  let breadcrumbDepth = 0
  if (hasBreadcrumbField) {
    for (const r of result.rows) {
      const v = r[BREADCRUMB_KEY]
      if (Array.isArray(v)) breadcrumbDepth = Math.max(breadcrumbDepth, v.length)
    }
  }
  const taxonomyColumns: ExcelColumn[] = []
  const taxonomyLevels: Record<string, number> = {}
  for (let lvl = 1; lvl <= breadcrumbDepth; lvl++) {
    const key = `taxonomie_n${lvl}`
    taxonomyColumns.push({
      key,
      label: `Taxonomie Niveau ${lvl}`,
      fieldType: 'text' as const,
      detectedType: 'text' as const,
      isPrimary: false,
      width: 160,
    })
    taxonomyLevels[key] = lvl
  }

  // 3. Colonnes standard (sauf celles expansées en specs ou en taxonomie).
  //    La colonne primaire reste le premier champ standard (ex: `name`) — les
  //    colonnes taxonomie sont annexes et ne doivent jamais devenir le titre
  //    de la fiche produit.
  const specsKeys = new Set(specsColumns.map((s) => s.key))
  const baseColumns: ExcelColumn[] = result.columns
    .filter((key) => key !== BREADCRUMB_KEY && !isSpecsArray(result.rows[0]?.[key]) && !(isStringsArray(result.rows[0]?.[key]) && specsKeys.has(key)))
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

  // Ordre : colonnes standard (name en primary) → taxonomie → specs.
  const columns = [...baseColumns, ...taxonomyColumns, ...specsColumns]
  const imageColKeys = new Set(baseColumns.filter((c) => c.fieldType === 'image').map((c) => c.key))

  // 4. Lignes
  const rows: ExcelRow[] = result.rows.map((r, i) => {
    const base: ExcelRow = {
      _id: `scraped_${i}`,
      ...Object.fromEntries(
        result.columns
          .filter((k) => k !== BREADCRUMB_KEY && !isSpecsArray(r[k]))
          .map((k) => [k, imageColKeys.has(k) ? absolutizeImg(serializeCell(r[k])) : serializeCell(r[k])])
      ),
    }
    const crumb = Array.isArray(r[BREADCRUMB_KEY]) ? (r[BREADCRUMB_KEY] as unknown[]) : []
    for (let lvl = 1; lvl <= breadcrumbDepth; lvl++) {
      const v = crumb[lvl - 1]
      base[`taxonomie_n${lvl}`] = typeof v === 'string' && v.trim() ? v.trim() : null
    }
    for (const [key, values] of specsData.entries()) {
      base[key] = values[i] ?? null
    }
    return base
  })

  const sheet: ExcelSheet = { name, columns, rows, taxonomy: [] }
  if (sourceUrl) sheet.sourceUrl = sourceUrl
  if (breadcrumbDepth > 0) {
    sheet.taxonomyLevels = taxonomyLevels
    sheet.taxonomy = buildTaxonomyFromLevels(sheet, taxonomyLevels)
  }
  return sheet
}

/** Aplatit un EnrichedProduct (mode "Produit unique") en ExcelSheet à 1 ligne,
 *  en utilisant la convention `ai_*` reconnue par EnrichmentPanel et
 *  deserializeEnrichedFromRow — la ligne ainsi créée se réhydrate
 *  automatiquement en affichage structuré (variants en accordéon, images en
 *  grille, documents PDF cliquables, advantages groupés colorés).
 *
 *  La feuille a une colonne primary `name` (titre du produit) + toutes les
 *  colonnes `ENRICHMENT_COLUMNS`. */
export function enrichedProductToSheet(
  product: EnrichedProduct,
  name: string,
  productTitle: string,
): ExcelSheet {
  const columns: ExcelColumn[] = [
    {
      key: 'name',
      label: 'Nom',
      fieldType: 'text',
      detectedType: 'text',
      isPrimary: true,
      width: 240,
    },
    ...ENRICHMENT_COLUMNS.map(buildEnrichmentColumn),
  ]

  const serialized = serializeEnriched(product, null)
  const row: ExcelRow = {
    _id: 'enriched_0',
    name: productTitle,
    ...serialized,
  }

  return { name, columns, rows: [row], taxonomy: [] }
}

/** Variante multi-produits de `enrichedProductToSheet` — agrège plusieurs
 *  EnrichedProduct dans une même feuille (un produit = une ligne).
 *  Utilisé par Map+Extract et Crawl quand on enrichit plusieurs URLs d'un coup. */
export function enrichedProductsToSheet(
  products: EnrichedProduct[],
  name: string,
  titles: string[],
): ExcelSheet {
  const columns: ExcelColumn[] = [
    {
      key: 'name',
      label: 'Nom',
      fieldType: 'text',
      detectedType: 'text',
      isPrimary: true,
      width: 240,
    },
    ...ENRICHMENT_COLUMNS.map(buildEnrichmentColumn),
  ]

  const rows: ExcelRow[] = products.map((product, i) => ({
    _id: `enriched_${i}`,
    name: titles[i] ?? `Produit ${i + 1}`,
    ...serializeEnriched(product, null),
  }))

  return { name, columns, rows, taxonomy: [] }
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
    usage?: { tokens?: number }
  }
}

/** Proxy résidentiel Jina activé (défaut oui) — coupe-circuit `jina.proxy=off`. */
function jinaProxyEnabled(): boolean {
  try { return localStorage.getItem('jina.proxy') !== 'off' } catch { return true }
}
/** Pays du proxy Jina déduit de l'URL (TLD national / sous-domaine `fr.`), sinon
 *  `auto` (Jina choisit). Générique — jamais de pays en dur. */
function jinaProxyCountry(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase()
    const sub = host.match(/^([a-z]{2})\./)
    if (sub && /^(fr|de|es|it|nl|be|pt|uk|us)$/.test(sub[1])) return sub[1]
    const tld = host.split('.').pop() ?? ''
    if (/^(fr|de|es|it|nl|be|pt)$/.test(tld)) return tld
  } catch { /* ignore */ }
  return 'auto'
}
/** Locale navigateur (`fr-FR`) déduite de l'URL pour un rendu dans la bonne langue. */
function localeFromUrl(url: string): string | null {
  const c = jinaProxyCountry(url)
  if (c === 'auto') return null
  const lang = c === 'be' ? 'fr' : c === 'uk' || c === 'us' ? 'en' : c
  return `${lang}-${c.toUpperCase()}`
}

export async function jinaRead(url: string, opts: { timeout?: number; noCache?: boolean; listing?: boolean } = {}): Promise<JinaReaderResponse['data']> {
  const extra: Record<string, string> = {}

  // Les gros revendeurs FR (Darty, Boulanger, Fnac, Leroy Merlin…) sont derrière
  // DataDome/Akamai. Le moteur Jina par défaut reçoit une page challenge vide →
  // Gemini n'a rien à extraire. Forcer `X-Engine: browser` (Chromium headless
  // Jina) + timeout 30s + selector produit permet de traverser le challenge.
  let isProtected = false
  try {
    isProtected = RESELLER_HOSTS.test(new URL(url).hostname)
  } catch { /* URL invalide — on garde les defaults */ }

  // `listing` : page de catégorie/famille en lazy-load (grille de cartes
  // produit hydratée côté client). Le moteur Jina par défaut ne rend pas la
  // grille → 0 lien produit. Forcer le moteur navigateur (Puppeteer headless,
  // qui gère le lazy-load) + attendre les cartes + timeout long.
  const forceBrowser = isProtected || !!opts.listing
  const timeout = Math.max(opts.timeout ?? 0, forceBrowser ? 30000 : 10000)
  extra['X-Timeout'] = String(Math.ceil(timeout / 1000))
  if (opts.noCache) extra['X-No-Cache'] = 'true'

  if (opts.listing) {
    extra['X-Engine'] = 'browser'
    // Attendre qu'une grille/carte produit (ou un lien produit) soit rendue
    // avant de capturer le résumé des liens.
    extra['X-Wait-For-Selector'] = 'a[href*="/product" i], a[href*="/produit" i], [class*="product" i], [class*="card" i], main'
    // Découverte : on veut TOUS les liens de la grille (exhaustif, pas le résumé
    // dédupliqué partiel) et aucune image (payload allégé). Cf. references/jina-api.md.
    extra['X-With-Links-Summary'] = 'all'
    extra['X-Retain-Images'] = 'none'
    // Proxy résidentiel Jina (premium) : rend une page anti-bot (DataDome/Akamai,
    // ex. Rubix) là où le moteur browser nu reçoit une page vide → la grille
    // COMPLÈTE est rendue et TOUS ses liens produit remontent, au lieu de la
    // cascade brute (ancres tronquées). Désactivable via localStorage
    // `jina.proxy=off`. Si le plan ne le supporte pas, Jina erreur → la cascade
    // anti-bot prend le relais (discover). Locale forcée sur la langue source.
    if (jinaProxyEnabled()) extra['X-Proxy'] = jinaProxyCountry(url)
    const loc = localeFromUrl(url)
    if (loc) extra['X-Locale'] = loc
  } else if (isProtected) {
    extra['X-Engine'] = 'browser'
    // Attendre qu'un conteneur produit (pas seulement <body>) soit hydraté.
    extra['X-Wait-For-Selector'] = 'main, [itemtype*="Product" i], [class*="product" i]'
  } else {
    // Forcer le rendu JS complet pour les accordéons dynamiques
    extra['X-Wait-For-Selector'] = 'body'
  }

  const headers = jinaHeaders(extra)
  const startedAt = performance.now()
  const entryBase = {
    id: genId(),
    timestamp: Date.now(),
    kind: 'jina' as const,
    url,
    method: 'GET' as const,
    headers: sanitizeHeaders(headers),
  }

  try {
    const res = await fetch(`${JINA_READER}/${url}`, { headers })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const error = `Jina Reader: HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}`
      appendDebugEntry({ ...entryBase, durationMs: Math.round(performance.now() - startedAt), error })
      throw new Error(error)
    }
    const json = await res.json() as JinaReaderResponse
    if (!json.data?.content && !json.data?.title) {
      const error = 'Jina Reader n\'a retourné aucun contenu — le site bloque peut-être le scraping'
      appendDebugEntry({ ...entryBase, durationMs: Math.round(performance.now() - startedAt), error })
      throw new Error(error)
    }
    appendDebugEntry({
      ...entryBase,
      durationMs: Math.round(performance.now() - startedAt),
      response: json.data.content ?? '',
    })
    // Coût Jina live (tokens réels si l'API les renvoie, sinon estimés chars/4)
    recordScrapeUsage({ platform: 'jina', tokens: json.data.usage?.tokens ?? Math.round((json.data.content?.length ?? 0) / 4) })
    return json.data
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!/Jina Reader:/.test(msg) && !/n'a retourné aucun contenu/.test(msg)) {
      appendDebugEntry({ ...entryBase, durationMs: Math.round(performance.now() - startedAt), error: msg })
    }
    throw err
  }
}

/** Extrait les libellés d'un conteneur breadcrumb : priorité aux `<a>` puis
 *  aux `[itemprop=name]` (microdata), puis aux `<li>` directs en dernier
 *  recours. Nettoyage + dédup ordonnée. */
function extractItemsFromContainer(container: Element): string[] {
  const anchors = Array.from(container.querySelectorAll('a'))
  const microdata = Array.from(container.querySelectorAll('[itemprop="name"]'))
  let nodes: Element[]
  if (anchors.length > 0) nodes = anchors
  else if (microdata.length > 0) nodes = microdata
  else nodes = Array.from(container.querySelectorAll('li'))
  const items = nodes
    .map((n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 0 && t.length < 80 && !/^[>›/\\|]+$/.test(t))
  const seen = new Set<string>()
  const out: string[] = []
  for (const it of items) {
    if (seen.has(it.toLowerCase())) continue
    seen.add(it.toLowerCase())
    out.push(it)
  }
  return out
}

/** Extrait le fil d'Ariane d'une page HTML. Stratégie :
 *  1. Collecter TOUS les conteneurs breadcrumb candidats (nav, ol, ul, div avec
 *     classe/aria-label/data-testid contenant "breadcrumb").
 *  2. Filtrer ceux qui sont cachés (aria-hidden, style display:none).
 *  3. Retourner le candidat le PLUS COURT avec ≥ 2 items — les sites ont
 *     souvent un breadcrumb visible (3-4 items) + un breadcrumb SEO/catégorie
 *     plus long (5+ items) ; l'utilisateur attend le visible. */
export function extractBreadcrumbFromHtml(html: string): string[] {
  if (!html || typeof DOMParser === 'undefined') return []
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch (e) {
    console.warn('[extractBreadcrumbFromHtml] DOMParser error:', e)
    return []
  }

  const containerSelectors = [
    'nav[aria-label*="breadcrumb" i]',
    'nav[aria-label*="fil d" i]',
    '[data-testid*="breadcrumb" i]',
    '[itemtype*="BreadcrumbList" i]',
    'nav[class*="breadcrumb" i]',
    'ol[class*="breadcrumb" i]',
    'ul[class*="breadcrumb" i]',
    '[class*="breadcrumbs__list" i]',
    '[class*="breadcrumb" i]',
  ]

  const candidates: { items: string[]; selector: string }[] = []
  const containerSet = new Set<Element>()
  for (const sel of containerSelectors) {
    let nodes: Element[]
    try {
      nodes = Array.from(doc.querySelectorAll(sel))
    } catch {
      continue
    }
    for (const container of nodes) {
      if (containerSet.has(container)) continue
      containerSet.add(container)
      // Exclure les conteneurs cachés (aria-hidden=true ou style display:none).
      if (container.getAttribute('aria-hidden') === 'true') continue
      const style = container.getAttribute('style') ?? ''
      if (/display\s*:\s*none/i.test(style)) continue
      const items = extractItemsFromContainer(container)
      if (items.length >= 2) candidates.push({ items, selector: sel })
    }
  }

  // Stratégie BEM : collecter tous les `<li>` ou `<a>` dont la classe matche le
  // pattern `breadcrumb*item` (ex: `breadcrumbs__breadcrumb-item`, `breadcrumb-item`).
  // Ces éléments sont souvent des frères dans un conteneur qui ne matche aucun de
  // nos sélecteurs principaux (quand Decathlon n'enveloppe pas le breadcrumb
  // visible dans un nav/ul typé).
  const bemItems = Array.from(
    doc.querySelectorAll(
      '[class*="breadcrumb" i][class*="item" i], [class*="BreadcrumbItem"]',
    ),
  )
  if (bemItems.length >= 2) {
    // Grouper par parent — on peut avoir plusieurs breadcrumbs indépendants.
    const byParent = new Map<Element | null, Element[]>()
    for (const it of bemItems) {
      const p = it.parentElement
      if (!byParent.has(p)) byParent.set(p, [])
      byParent.get(p)!.push(it)
    }
    for (const [parent, siblings] of byParent.entries()) {
      if (siblings.length < 2) continue
      if (parent && parent.getAttribute('aria-hidden') === 'true') continue
      const items = siblings
        .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter((t) => t.length > 0 && t.length < 80 && !/^[>›/\\|]+$/.test(t))
      const seen = new Set<string>()
      const out: string[] = []
      for (const it of items) {
        if (seen.has(it.toLowerCase())) continue
        seen.add(it.toLowerCase())
        out.push(it)
      }
      if (out.length >= 2) candidates.push({ items: out, selector: 'bem-items[parent]' })
    }
  }

  if (candidates.length === 0) {
    console.log('[extractBreadcrumbFromHtml] no candidate found — HTML preview:', html.slice(0, 500))
    return []
  }

  // Log détaillé (sortir chaque candidat séparément pour que les items soient
  // visibles dans la console Chrome, qui collapse `Array(5)` sinon).
  console.log('[extractBreadcrumbFromHtml] total candidates:', candidates.length)
  candidates.forEach((c, i) => {
    console.log(`  candidate #${i} (n=${c.items.length}, sel="${c.selector}") :`, JSON.stringify(c.items))
  })

  // Le breadcrumb visible est typiquement le plus court ; le SEO/catégorie est
  // plus long. À égalité de longueur, garder l'ordre de découverte.
  candidates.sort((a, b) => a.items.length - b.items.length)
  const picked = candidates[0]
  console.log(`[extractBreadcrumbFromHtml] picked (shortest): ${picked.items.length} items from "${picked.selector}"`, picked.items)
  return picked.items
}

/** Masque la clé d'API Jina dans les headers loggés. */
function sanitizeHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(h)) {
    out[k] = /authorization/i.test(k) ? 'Bearer ***' : v
  }
  return out
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

  const res = await llmPostWithFallback('gemini', 'gemini-3.1-pro-preview', {
    contents: [{
      parts: [{ text: userPrompt }],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: sanitizeSchemaForGemini(schema),
      temperature: 0.1,
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(`Gemini: ${err.error?.message ?? `HTTP ${res.status}`}`)
  }

  const json = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  }
  // Comptabilise les tokens (coût live dans le header du modal + stats Firestore).
  if (json.usageMetadata) {
    const { recordAiUsage } = await import('@/features/stats/aiUsageTracking')
    recordAiUsage({
      provider: 'gemini',
      model: 'gemini-3.1-pro-preview',
      inputTokens: json.usageMetadata.promptTokenCount ?? 0,
      outputTokens: json.usageMetadata.candidatesTokenCount ?? 0,
    })
  }
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
    prompt: string,
    opts: { target?: ExtractionTarget; waitFor?: number; noCache?: boolean; manualBreadcrumb?: string[] } = {},
  ): Promise<ScrapeResult | null> => {
    setLoading(true); reset()
    try {
      const hasFields = mode === 'schema' && fields.length > 0
      const target = opts.target ?? 'multiple'
      const isSingle = target === 'single'

      // 1. Lire la page (markdown pour Gemini + extraction breadcrumb/images
      //    côté serveur via Cloud Function Puppeteer, qui voit la version
      //    hydratée de la page avec scroll déclenché — indispensable pour les
      //    revendeurs en lazy-load React (Boulanger, Darty, Fnac).
      //    Si l'utilisateur a fourni un breadcrumb manuel ET qu'aucun champ
      //    image n'est demandé, on SKIP la Cloud Function (pas de latence).
      const wantsBreadcrumb = fields.some((f) => f.key === 'breadcrumb')
      const wantsImages = fields.some((f) => f.key === 'image_url' || f.key === 'images')
      const manualCrumb = opts.manualBreadcrumb ?? []
      const hasManualCrumb = manualCrumb.length >= 2
      const needsCloud = (wantsBreadcrumb && !hasManualCrumb) || wantsImages
      const emptyCloud = { items: [] as string[], selector: null as string | null, images: [] as string[] }
      const [page, cloudResult] = await Promise.all([
        jinaRead(url, { timeout: opts.waitFor, noCache: opts.noCache }),
        needsCloud
          ? extractBreadcrumbCloudFn({ url }).then(
              (r) => r.data,
              (err: unknown) => {
                console.warn('[scrape] extractBreadcrumb cloud function failed:', err)
                return emptyCloud
              },
            )
          : Promise.resolve(emptyCloud),
      ])
      // Le manuel a la priorité absolue, sinon on prend le résultat Cloud.
      const finalBreadcrumb = hasManualCrumb ? manualCrumb : cloudResult.items
      const cloudImages = cloudResult.images ?? []
      if (wantsBreadcrumb) {
        console.log(
          '[scrape] breadcrumb source:',
          hasManualCrumb ? 'manual' : 'cloud',
          finalBreadcrumb,
        )
      }
      if (wantsImages) {
        console.log('[scrape] cloud images count:', cloudImages.length)
      }

      // 2. Construire le prompt contextuel : instructions par défaut + prompt
      // utilisateur (concaténé, pas remplacé — l'utilisateur affine le comportement).
      const defaultPrompt = isSingle
        ? `Extrais UNIQUEMENT les données du produit PRINCIPAL visible sur cette page. Ignore les produits similaires, accessoires, navigation et footer. Retourne un objet unique (PAS une liste). Vérifie que TOUTES les sections de spécifications (y compris accordéons) sont couvertes.`
        : hasFields
          ? `Extrais TOUS les éléments de la liste sur cette page sous forme de tableau "items". Ignore menus et footer.`
          : `Extrais les données structurées PRINCIPALES de cette page sous forme de tableau "items".`
      const userPrompt = prompt.trim()
      const extractPrompt = userPrompt
        ? `${defaultPrompt}\n\nCONSIGNES UTILISATEUR (prioritaires sur les consignes ci-dessus en cas de conflit) :\n${userPrompt}`
        : defaultPrompt

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

      // 6. Override déterministe du breadcrumb. Priorité :
      //    1) saisie manuelle (pour les sites anti-bot style Decathlon)
      //    2) Cloud Function Puppeteer (sites non protégés)
      //    3) fallback Gemini (souvent le JSON-LD / SEO, peu fiable)
      if (finalBreadcrumb.length > 0) {
        if (target === 'single') {
          extracted.breadcrumb = finalBreadcrumb
        } else if (Array.isArray(extracted.items)) {
          for (const item of extracted.items as Record<string, unknown>[]) {
            item.breadcrumb = finalBreadcrumb
          }
        }
      }

      // 6b. Fallback images via Cloud Function Puppeteer quand Jina/Gemini
      //     n'ont rien remonté (typique des revendeurs en lazy-load React —
      //     Boulanger, Darty, Fnac). Respecte le choix de Gemini quand il a
      //     trouvé quelque chose.
      if (cloudImages.length > 0) {
        const fillItem = (item: Record<string, unknown>) => {
          if (fields.some((f) => f.key === 'image_url')) {
            const existing = item.image_url
            const isEmpty = existing == null || (typeof existing === 'string' && existing.trim() === '')
            if (isEmpty) item.image_url = cloudImages[0]
          }
          if (fields.some((f) => f.key === 'images')) {
            const existing = item.images
            const isEmpty = !Array.isArray(existing) || existing.length === 0
            if (isEmpty) item.images = cloudImages
          }
        }
        if (target === 'single') {
          fillItem(extracted)
        } else if (Array.isArray(extracted.items)) {
          for (const item of extracted.items as Record<string, unknown>[]) {
            fillItem(item)
          }
        }
      }

      // 7. Détecter les données hallucinées
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

  // ── Discover (Crawl) — découverte DÉTERMINISTE des fiches produit ───────────
  // Remplace l'ancienne découverte par LLM (qui échouait en silence sur les
  // grilles lazy-load type Makita). Stratégie :
  //   1) jinaRead(listing) : moteur navigateur Jina → rend le lazy-load, on
  //      récupère le résumé de liens (page.links).
  //   2) Cloud Function Puppeteer (scrolle + stealth anti-bot) qui CLASSIFIE
  //      les ancres hydratées : cartes produit (groupes répétés en zone
  //      contenu) vs navigation (header/menu/footer).
  //   3) selectDiscoveryEntries choisit l'étage le plus fiable : cartes
  //      seules > contenu (union − nav) > union brute (dernier recours).
  //      Sans ça, les centaines de liens du méga-menu consomment tout le
  //      `limit` avant les vraies fiches → on enrichissait des pages
  //      catégorie (mêmes textes partout, qualité déplorable).
  // Retourne {pages, source, error} ; le caller décide du message si vide.
  const discover = useCallback(async (
    url: string,
    opts: { includePaths?: string; excludePaths?: string; limit?: number; instruction?: string } = {},
  ): Promise<{ pages: CrawlPage[]; source: 'cards' | 'content' | 'jina' | 'cloud' | 'firecrawl' | 'none'; error?: string; diag?: string }> => {
    // Terme recherché (sans un éventuel « 2 » de tête) pour un diagnostic ciblé :
    // « le HTML rendu contient-il ce mot ? » → tranche render vs extraction.
    const probe = (opts.instruction ?? '').toLowerCase().replace(/^\d+\s*/, '').trim().split(/\s+/)[0] ?? ''
    const safeRe = (s?: string): RegExp | null => {
      const t = (s ?? '').trim()
      if (!t) return null
      try { return new RegExp(t) } catch { return null }
    }
    const slugTitle = (u: string): string => {
      try {
        const url2 = new URL(u)
        const segs = url2.pathname.split('/').filter(Boolean)
        if (segs.length === 0) return url2.hostname
        // Choisit le segment le plus DESCRIPTIF (le plus de lettres/mots), en
        // écartant les codes/SKU courts (« p-G3515003978 », « c-1049 », ids nus)
        // et les segments de locale (« fr »). Sinon le titre serait le SKU et un
        // filtre par type produit (« perforateur ») ne matcherait rien.
        const score = (s: string): number => {
          if (/^[a-z]{2}$/i.test(s)) return -1                       // locale
          if (/^\d+$/.test(s)) return -1                             // id nu
          if (/^[a-z]{1,2}-?[a-z]?\d{3,}$/i.test(s)) return -1       // SKU (p-G…, c-…)
          const letters = (s.match(/[a-zà-ÿ]/gi) ?? []).length
          const words = s.split(/[-_]/).filter(Boolean).length
          return letters + words * 2
        }
        const best = segs.reduce((a, b) => (score(b) > score(a) ? b : a))
        const chosen = score(best) > 0 ? best : segs[segs.length - 1]
        return chosen.replace(/\.\w{2,5}$/, '').replace(/[-_]+/g, ' ').trim() || url2.hostname
      } catch { return u }
    }
    let baseHost = ''
    try { baseHost = new URL(url).hostname.replace(/^www\./, '') } catch { /* URL invalide */ }
    let startPath = ''
    try { startPath = new URL(url).pathname } catch { /* idem */ }
    const includeRe = safeRe(opts.includePaths)
    const excludeRe = safeRe(opts.excludePaths)
    const limit = opts.limit ?? 30

    // Filtre commun : host identique, chemin ≠ page de départ, regex include/exclude.
    const toProducts = (entries: [string, string][]): CrawlPage[] => {
      const seen = new Set<string>()
      const out: CrawlPage[] = []
      for (const [rawTitle, rawHref] of entries) {
        if (!rawHref) continue
        let u: URL
        try { u = new URL(rawHref, url) } catch { continue }
        const abs = u.toString()
        if (seen.has(abs)) continue
        const host = u.hostname.replace(/^www\./, '')
        if (baseHost && !host.includes(baseHost) && !baseHost.includes(host)) continue
        if (u.pathname === startPath) continue // lien retour vers la page de listing / ancres
        if (includeRe && !includeRe.test(u.pathname)) continue
        if (excludeRe && excludeRe.test(u.pathname)) continue
        seen.add(abs)
        out.push({ url: abs, title: rawTitle.trim() || slugTitle(abs), content: '' })
        if (out.length >= limit) break
      }
      return out
    }

    setLoading(true); reset()
    try {
      // On lance EN PARALLÈLE les deux sources :
      //   • Jina moteur navigateur (rapide, lazy-load rendu) → résumé de liens.
      //   • Cloud Function Puppeteer (scroll itératif + stealth anti-bot) →
      //     ancres hydratées CLASSIFIÉES (cartes produit vs navigation).
      const errors: string[] = []
      const emptyCloud = { links: [] as string[], navLinks: [] as string[], cardLinks: [] as { url: string; title: string }[] }
      const [jinaEntries, cloud] = await Promise.all([
        jinaRead(url, { listing: true, noCache: true })
          .then((p) => Object.entries(p.links ?? {}))
          .catch((e) => { errors.push(`Jina: ${e instanceof Error ? e.message : String(e)}`); return [] as [string, string][] }),
        extractBreadcrumbCloudFn({ url })
          .then((r) => ({
            links: r.data.links ?? [],
            navLinks: r.data.navLinks ?? [],
            cardLinks: r.data.cardLinks ?? [],
          }))
          .catch((e) => { errors.push(`Escalade: ${e instanceof Error ? e.message : String(e)}`); return emptyCloud }),
      ])

      // Étage le plus fiable : grille produit > contenu sans nav > union brute.
      const { entries, tier } = selectDiscoveryEntries({
        jinaEntries,
        cloudLinks: cloud.links,
        cloudNavLinks: cloud.navLinks,
        cloudCardLinks: cloud.cardLinks,
      })
      const products = toProducts(entries)
      console.log('[discover] tier:', tier, '— candidats:', entries.length, '— retenus:', products.length)

      // Diagnostic + détection « rien rendu ».
      const cloudTotal = cloud.links.length + cloud.navLinks.length + cloud.cardLinks.length
      const counts = `Jina : ${jinaEntries.length} lien(s) · escalade Puppeteer : ${cloudTotal} lien(s)`
      const nothingRendered = jinaEntries.length === 0 && cloudTotal === 0

      // Extraction d'ancres depuis un HTML rendu par la cascade anti-bot.
      const extractAnchors = (html: string): [string, string][] => {
        const out: [string, string][] = []
        const clean = (s: string | null | undefined): string => {
          const t = (s ?? '').replace(/\s+/g, ' ').trim()
          return /[{}<>]|fill\s*:/.test(t) ? '' : t
        }
        try {
          const dom = new DOMParser().parseFromString(html, 'text/html')
          dom.querySelectorAll('a[href]').forEach((a) => {
            const href = a.getAttribute('href') ?? ''
            if (!href) return
            // VRAI nom produit, par ordre de fiabilité : aria-label / title du lien
            // > alt de l'image de la carte (« Perforateur Bosch GBH 18V-26 F »)
            // > titre d'un heading interne > texte du lien. Sinon vide → slug d'URL.
            const img = a.querySelector('img')
            const heading = a.querySelector('h1,h2,h3,h4,[class*="title" i],[class*="name" i]')
            let title =
              clean(a.getAttribute('aria-label')) ||
              clean(a.getAttribute('title')) ||
              clean(img?.getAttribute('alt')) ||
              clean(heading?.textContent) ||
              ''
            if (!title) {
              a.querySelectorAll('style,script,svg').forEach((el) => el.remove())
              title = clean(a.textContent)
            }
            out.push([title, href])
          })
        } catch { /* DOMParser indisponible */ }
        return out
      }

      // UNION : on démarre avec les produits Jina+Puppeteer PUIS on complète via
      // la cascade anti-bot (Firecrawl scroll → CF fetchPageHtml → Bright Data),
      // TOUJOURS pour un listing dont la grille paraît incomplète (< min(limit,24))
      // ou si rien n'a été rendu. Une source partielle (ex. Jina proxy = 4) ne
      // court-circuite donc PLUS les autres : on fusionne tout (dédup par URL).
      const merged = new Map<string, CrawlPage>(products.map((p) => [p.url, p] as const))
      const diagParts: string[] = [`Jina+Puppeteer: ${products.length}`]
      // discover() EST toujours une découverte de listing → on complète dès que
      // la grille paraît incomplète (ou si rien n'a été rendu).
      const wantMore = merged.size < Math.min(limit, 24)
      if (nothingRendered || wantMore) {
        const fcKey = getApiKey('firecrawl').trim()
        const htmlSources: Array<{ label: string; run: () => Promise<string | null> }> = [
          ...(fcKey ? [{ label: 'Firecrawl+scroll', run: () => firecrawlScrapeHtml(url, fcKey, { scroll: true }).catch(() => null) }] : []),
          { label: 'CF fetchPageHtml', run: () => fetchSourceHtml(url, 25_000).catch(() => null) },
          { label: 'Bright Data', run: () => brightDataScrapeHtml(url).catch(() => null) },
        ]
        for (const src of htmlSources) {
          const html = await src.run()
          if (!html || html.length < 1500) { diagParts.push(`${src.label}: 0`); continue }
          const anchors = extractAnchors(html)
          const prods = toProducts(anchors)
          // Sonde décisive : le HTML rendu contient-il le terme cherché ? + combien
          // d'ancres produit brutes (avant filtres) vs retenues.
          const rawHit = probe && html.toLowerCase().includes(probe) ? ` · « ${probe} » DANS LE HTML ✓` : probe ? ` · « ${probe} » absent du HTML` : ''
          diagParts.push(`${src.label}: ${anchors.length} ancres → ${prods.length} produits${rawHit}`)
          for (const p of prods) if (!merged.has(p.url)) merged.set(p.url, p)
          if (merged.size >= 60) break // grille substantielle → stop
        }
      }

      // PAGINATION : beaucoup de listings (Rubix, Magento, Algolia…) chargent la
      // suite via `?page=N` — le défilement seul ne suffit pas. On récupère les
      // pages suivantes et on UNIONNE, jusqu'à ce qu'une page n'apporte plus de
      // nouveau produit (ou plafond). C'est ce qui débloque les produits au-delà
      // du haut de grille (ex. perforateurs en page 2+). Universel ; s'arrête net
      // si `?page=N` ne rend rien de neuf (site sans ce schéma → inchangé).
      if (merged.size > 0) {
        const base = (() => { try { const u = new URL(url); u.hash = ''; u.search = ''; return u } catch { return null } })()
        const fcKey = getApiKey('firecrawl').trim()
        const fetchPageHtml = async (pageUrl: string): Promise<string | null> => {
          if (fcKey) { const h = await firecrawlScrapeHtml(pageUrl, fcKey).catch(() => null); if (h) return h }
          const cf = await fetchSourceHtml(pageUrl, 25_000).catch(() => null); if (cf) return cf
          return brightDataScrapeHtml(pageUrl).catch(() => null)
        }
        // Profondeur = « Limite de pages » (plafonnée à 15 pour le coût), robuste :
        // on tolère 2 pages vides/challenge d'affilée avant d'arrêter (un hoquet
        // Bright Data sur une page ne doit pas stopper toute la pagination).
        const maxPages = Math.min(Math.max(limit, 4), 15)
        let emptyStreak = 0
        for (let page = 2; base && page <= maxPages && merged.size < 200; page++) {
          const u = new URL(base.toString()); u.searchParams.set('page', String(page))
          const html = await fetchPageHtml(u.toString())
          if (!html || html.length < 1500) { diagParts.push(`page ${page}: 0`); if (++emptyStreak >= 2) break; continue }
          const before = merged.size
          for (const p of toProducts(extractAnchors(html))) if (!merged.has(p.url)) merged.set(p.url, p)
          const added = merged.size - before
          diagParts.push(`page ${page}: +${added}`)
          if (added === 0) { if (++emptyStreak >= 2) break } else emptyStreak = 0
        }
      }

      const all = [...merged.values()]
      if (all.length > 0) {
        const cascadeUsed = all.length > products.length || products.length === 0
        const jinaProducts = toProducts(jinaEntries)
        const source: 'cards' | 'content' | 'jina' | 'cloud' | 'firecrawl' =
          cascadeUsed ? 'firecrawl'
            : tier === 'cards' || tier === 'content' ? tier
              : products.length > jinaProducts.length ? 'cloud' : 'jina'
        return { pages: all, source, diag: diagParts.length > 1 ? diagParts.join(' · ') : undefined }
      }

      const tierHint = nothingRendered
        ? 'Page NON CHARGÉE : ni le moteur navigateur Jina ni l\'escalade Puppeteer n\'ont récupéré de lien. '
          + 'La page est très probablement protégée par un anti-bot (captcha / DataDome) ou entièrement rendue en JS. '
          + 'Pistes : essaie une URL de sous-catégorie plus précise, ou colle directement les URLs produit via « Plusieurs URLs » (mode Liste).'
        : tier === 'content'
          ? 'La page ne contient que des liens de navigation (menu/footer) — probablement une page hub : descends dans une sous-catégorie.'
          : 'Des liens ont été trouvés mais aucun ne ressemble à une fiche produit. Ajuste le filtre « Inclure (regex) » (ex. la partie commune des URLs produit) ou vide-le.'
      return { pages: [], source: 'none', error: [counts, errors.join(' · '), tierHint].filter(Boolean).join(' — ') || undefined }
    } finally {
      setLoading(false)
    }
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

  return { scrape, map, discover, extract, crawl, abort, loading, error, progress }
}
