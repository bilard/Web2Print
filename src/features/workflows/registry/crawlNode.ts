// Node « Crawl » (mode du node unifié Web Scraping) : URL(s) de page catégorie →
// découverte des liens de fiches produit (Cloud Function extractBreadcrumb : cardLinks
// via Puppeteer scroll/anti-bot) → enrichissement complet de chaque fiche (enrichRow,
// moteur PIM) → une sheet. Pendant client (discover + enrichProductCore client-only),
// donc runtime 'client' : ne tourne pas en cron headless (cf. spec unification).
// Masqué de la palette : exposé via le node unifié `web-scraping` (mode Crawl).
import { Network } from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelColumn, ExcelRow, ExcelSheet } from '@/features/excel/types'

interface CrawlConfig {
  urls: string
  limit: number
  includePaths?: string
  excludePaths?: string
  fields: string
}

interface CrawlOutputs {
  sheet: ExcelSheet
  assets: { url: string; type: string }[]
}

const extractBreadcrumbFn = httpsCallable<
  { url: string },
  { cardLinks?: { url: string; title: string }[]; links?: string[] }
>(functions, 'extractBreadcrumb')

function parseUrls(raw: string): string[] {
  return raw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
}
function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

const crawlNode: NodeSpec<CrawlConfig, Record<string, never>, CrawlOutputs> = {
  type: 'crawl',
  hidden: true,
  category: 'import',
  labelKey: 'node.crawl.label',
  descriptionKey: 'node.crawl.desc',
  icon: Network,
  inputs: [],
  outputs: [
    { name: 'sheet', type: 'sheet' },
    { name: 'assets', type: 'asset[]' },
  ],
  configSchema: [
    { name: 'urls', kind: 'textarea', label: 'URLs de pages catégorie (une par ligne)', required: true,
      help: 'Pages catégorie/listing dont on découvre les fiches produit.' },
    { name: 'limit', kind: 'number', label: 'Max fiches par page', default: 30, help: 'Plafond de liens découverts par URL.' },
    { name: 'includePaths', kind: 'text', label: 'Inclure (regex chemin)', help: 'Ex : /produits/.* — ne garde que ces chemins.' },
    { name: 'excludePaths', kind: 'text', label: 'Exclure (regex chemin)', help: 'Ex : /tag/.*, /auteur/.*' },
    { name: 'fields', kind: 'text', label: 'Champs à extraire par fiche', default: 'name,reference,ean,price,specifications,images,documents',
      help: 'Colonnes enrichies pour chaque fiche découverte.' },
  ],
  defaultConfig: { urls: '', limit: 30, includePaths: '', excludePaths: '', fields: 'name,reference,ean,price,specifications,images,documents' },
  runtime: 'client',
  connectors: ['jina', 'llm'],
  run: async (ctx, config) => {
    const urls = parseUrls(config.urls)
    if (urls.length === 0) throw new Error('Aucune URL de page catégorie fournie.')
    const limit = Math.max(1, Number(config.limit) || 30)
    const fields = String(config.fields ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    const inc = config.includePaths?.trim() ? new RegExp(config.includePaths.trim()) : null
    const exc = config.excludePaths?.trim() ? new RegExp(config.excludePaths.trim()) : null

    const { enrichRow } = await import('@/features/excel/ai-enrichment/enrichRow')
    const rows: ExcelRow[] = []
    const assets: { url: string; type: string }[] = []
    const seen = new Set<string>()
    let rowId = 0

    for (const root of urls) {
      if (ctx.signal.aborted) break
      const host = hostOf(root)
      ctx.reportConnector?.('jina')
      ctx.log('info', `Découverte des fiches sur ${host}…`)
      let links: string[] = []
      try {
        const { data } = await extractBreadcrumbFn({ url: root })
        links = data.cardLinks?.map((c) => c.url) ?? []
        if (links.length === 0) links = data.links ?? []
      } catch (e) {
        ctx.log('warn', `Découverte échouée pour ${host} : ${e instanceof Error ? e.message : e}`)
        continue
      }
      // Garde : même host, regex include/exclude, dédup, ≠ URL racine, plafond limit.
      const picked: string[] = []
      for (const u of links) {
        let p: URL
        try { p = new URL(u, root) } catch { continue }
        if (p.hostname.replace(/^www\./, '') !== host) continue
        if (inc && !inc.test(p.pathname)) continue
        if (exc && exc.test(p.pathname)) continue
        const abs = p.toString()
        if (abs === root || seen.has(abs)) continue
        seen.add(abs)
        picked.push(abs)
        if (picked.length >= limit) break
      }
      ctx.log('info', `${picked.length} fiche(s) à enrichir sur ${host}.`)
      ctx.reportConnector?.('llm')
      for (const link of picked) {
        if (ctx.signal.aborted) break
        try {
          const r = await enrichRow({ url: link, targetFields: fields, signal: ctx.signal, log: (m) => ctx.log('info', m) })
          rows.push({ _id: `cr_${rowId++}`, _url: link, ...r.fields } as ExcelRow)
          for (const a of r.assets) assets.push(a)
          ctx.reportCount?.(rows.length)
        } catch (e) {
          ctx.log('warn', `Enrichissement échoué ${link} : ${e instanceof Error ? e.message : e}`)
        }
      }
    }

    if (rows.length === 0) ctx.log('warn', 'Aucune fiche enrichie — vérifie les URLs (pages catégorie) et les filtres.')
    const columns: ExcelColumn[] = fields.map((k) => ({
      key: k, label: k, fieldType: 'text', detectedType: 'text', isPrimary: k === 'name', width: 180,
    }))
    return { sheet: { name: 'Crawl', columns, rows, taxonomy: [] }, assets }
  },
}

nodeRegistry.register(crawlNode)
