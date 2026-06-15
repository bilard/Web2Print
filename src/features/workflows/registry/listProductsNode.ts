// src/features/workflows/registry/listProductsNode.ts
// Node « Produits d'une page liste » : prend une ou plusieurs URLs de page
// catégorie / résultats de recherche e-commerce (PAS des fiches produit), lit
// la page via Jina en mode `listing` (moteur navigateur + lazy-load), puis fait
// extraire par le LLM TOUS les produits affichés (nom, marque, EAN, prix, URL).
// Sortie : une feuille où chaque ligne = un produit, taguée par `site` (domaine).
// Brique d'entrée du workflow de comparaison de prix multi-sites — chaîner avec
// le node « Comparer les prix » puis un node Export.
import { ListChecks } from 'lucide-react'
import { z } from 'zod'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelColumn, ExcelRow, ExcelSheet } from '@/features/excel/types'
import { generateJson } from '@/features/ai/llmRouter'
import { parsePrice } from '@/features/priceWatch/core'

interface ListProductsConfig {
  /** URLs de pages liste (une par ligne ou séparées par virgule). */
  urls: string
  /** Nombre max de produits retenus par URL (0 = pas de limite). */
  maxProducts: number
}

interface ListProductsOutputs {
  sheet: ExcelSheet
}

/** Produit extrait d'une page liste par le LLM. */
const ExtractedSchema = z.object({
  products: z.array(
    z.object({
      name: z.string(),
      brand: z.string(),
      ean: z.string(),
      price: z.number(),
      url: z.string(),
      image: z.string(),
    }),
  ),
})
type Extracted = z.infer<typeof ExtractedSchema>

const EXTRACTED_SCHEMA_FOR_LLM = {
  type: 'object',
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Intitulé complet du produit tel qu’affiché.' },
          brand: { type: 'string', description: 'Marque du produit (vide si inconnue).' },
          ean: { type: 'string', description: 'Code EAN à 13 chiffres si visible (souvent dans l’URL de la fiche ou le nom de fichier image), sinon "".' },
          price: { type: 'number', description: 'Prix de vente ACTUEL en euros (si prix barré + promo, prendre le prix promo). 0 si illisible.' },
          url: { type: 'string', description: 'URL absolue de la fiche produit.' },
          image: { type: 'string', description: 'URL absolue de l’image du produit (souvent porteuse de l’EAN dans son chemin).' },
        },
        required: ['name', 'brand', 'ean', 'price', 'url', 'image'],
      },
    },
  },
  required: ['products'],
} as const

/** EAN robuste : l'EAN renvoyé s'il fait 13 chiffres, sinon premier nombre de
 *  13 chiffres trouvé dans l'image (Jardiland le cache dans le chemin image),
 *  puis l'URL fiche (Castorama : « 4892210822604_CAFR.prd »), puis le nom. */
export function resolveEan(ean: string, image: string, url: string, name: string): string {
  const clean = (ean ?? '').replace(/\D/g, '')
  if (clean.length === 13) return clean
  for (const src of [image, url, name]) {
    const m = String(src ?? '').match(/\d{13}/)
    if (m) return m[0]
  }
  return ''
}

const COLUMNS: ExcelColumn[] = [
  { key: 'site', label: 'Site', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 160 },
  { key: 'name', label: 'Produit', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 320 },
  { key: 'brand', label: 'Marque', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 },
  { key: 'ean', label: 'EAN', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 140 },
  { key: 'price', label: 'Prix', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 100 },
  { key: 'url', label: 'URL', fieldType: 'url', detectedType: 'url', isPrimary: false, width: 280 },
]

function parseUrls(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const listProductsNode: NodeSpec<ListProductsConfig, Record<string, never>, ListProductsOutputs> = {
  type: 'list-products',
  // Source autonome (URL → produits) : doit pouvoir démarrer un workflow seule.
  category: 'import',
  label: 'Produits d’une page liste',
  description:
    'Lit une page CATÉGORIE / résultats de recherche e-commerce (pas une fiche) via Jina (mode listing, anti-bot), ' +
    'puis fait extraire par le LLM tous les produits affichés : nom, marque, EAN, prix, URL. ' +
    'Chaque ligne est taguée par « site ». Chaîner avec « Comparer les prix » pour un tableau source↔cible.',
  icon: ListChecks,
  inputs: [],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [
    {
      name: 'urls',
      kind: 'textarea',
      label: 'URLs de pages liste (une par ligne)',
      required: true,
      help: 'Pages catégorie / recherche filtrées. Ex :\nhttps://www.jardiland.com/c/tondeuse-a-gazon-electrique?f=brand_in_Ryobi\nhttps://www.castorama.fr/search?Marque=Ryobi&term=tondeuse+electrique+batterie',
    },
    {
      name: 'maxProducts',
      kind: 'number',
      label: 'Max produits par URL',
      default: 40,
      help: '0 = pas de limite.',
    },
  ],
  defaultConfig: { urls: '', maxProducts: 40 },
  runtime: 'any',
  run: async (ctx, config) => {
    const urls = parseUrls(config.urls)
    if (urls.length === 0) {
      throw new Error('Aucune URL fournie — renseignez au moins une page liste dans la config.')
    }
    const max = Math.max(0, Number(config.maxProducts) || 0)

    const { readPageWithEscalation } = await import('@/features/scraping/readPageWithEscalation')
    const allRows: ExcelRow[] = []
    let rowId = 0

    for (let i = 0; i < urls.length; i++) {
      if (ctx.signal.aborted) break
      const url = urls[i]
      const site = hostOf(url)
      ctx.log('info', `(${i + 1}/${urls.length}) Lecture de la page liste ${site}…`)
      ctx.setProgress?.(Math.round((i / urls.length) * 100))

      const { markdown, source } = await readPageWithEscalation(url, {
        listing: true,
        log: ctx.log,
        onConnector: ctx.reportConnector,
      })
      if (!markdown.trim()) {
        ctx.log('warn', `Aucun contenu pour ${site} — bloqué malgré l'escalade (Jina + Bright Data).`)
        continue
      }
      if (source === 'brightdata') {
        ctx.log('info', `Contenu récupéré via Bright Data pour ${site}.`)
      }

      // Bornage du contexte LLM (les pages liste peuvent être volumineuses).
      const context = markdown.length > 28000 ? markdown.slice(0, 28000) : markdown
      ctx.reportConnector?.('llm')
      let extracted: Extracted
      try {
        extracted = await generateJson<Extracted>({
          task: 'product.enrichment',
          version: 'listProducts.extract.v1',
          prompt:
            'Voici le contenu MARKDOWN d’une page LISTE / catégorie d’un site e-commerce. ' +
            'Extrais TOUS les produits réellement listés sur cette page (ignore le menu de navigation, ' +
            'le pied de page, les bannières promo génériques et les blocs « vous aimerez aussi »). ' +
            'Pour chaque produit : name = intitulé complet ; brand = marque ; ean = code EAN à 13 chiffres ' +
            's’il apparaît dans l’URL de la fiche (ex : « 4892210822604_CAFR.prd ») ou le nom de fichier image, sinon "" ; ' +
            'price = prix de vente ACTUEL en euros (s’il y a un prix barré et un prix promo, prends le prix promo, pas le barré) ; ' +
            'url = lien absolu de la fiche produit ; image = URL absolue de l’image du produit ' +
            '(son chemin contient souvent l’EAN même quand l’URL fiche ne l’a pas).\n\n' +
            `## CONTENU\n${context}`,
          schema: ExtractedSchema,
          schemaForLLM: EXTRACTED_SCHEMA_FOR_LLM as unknown as Record<string, unknown>,
        })
      } catch (e) {
        ctx.log('error', `Extraction LLM échouée pour ${site} : ${e instanceof Error ? e.message : String(e)}`)
        continue
      }

      let products = extracted.products ?? []
      if (max > 0 && products.length > max) products = products.slice(0, max)
      for (const p of products) {
        const price = Number.isFinite(p.price) && p.price > 0 ? p.price : parsePrice(p.name)
        allRows.push({
          _id: `lp_${rowId++}`,
          site,
          name: (p.name ?? '').trim(),
          brand: (p.brand ?? '').trim(),
          ean: resolveEan(p.ean ?? '', p.image ?? '', p.url ?? '', p.name ?? ''),
          price: Number.isFinite(price) && price > 0 ? String(price) : '',
          url: (p.url ?? '').trim(),
        } as ExcelRow)
      }
      ctx.log('info', `${products.length} produit(s) extrait(s) de ${site}.`)
    }

    ctx.setProgress?.(100)
    if (allRows.length === 0) {
      ctx.log('warn', '⚠️ Aucun produit extrait — vérifie les URLs (pages liste) et la disponibilité Jina.')
    } else {
      ctx.log('info', `Total : ${allRows.length} produit(s) sur ${urls.length} page(s).`)
    }
    return { sheet: { name: 'Produits (liste)', columns: COLUMNS, rows: allRows, taxonomy: [] } }
  },
}

nodeRegistry.register(listProductsNode)
