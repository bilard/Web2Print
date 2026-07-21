// src/features/workflows/registry/harvestCompetitorNode.ts
// Node « Moisson concurrents » : parcourt les catalogues concurrents (pages liste) et
// alimente un index Firestore persistant, un lot borné de pages par run. Sur cron, les
// ticks successifs accumulent puis rafraîchissent l'index. Aucune donnée volumineuse ne
// transite par la mémoire du run — le matching relira l'index (cf. audit scalabilité).
import { TrendingUpDown } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelSheet } from '@/features/excel/types'
import { useAuthStore } from '@/stores/auth.store'
import { fetchSourceHtml } from '@/features/scraping-templates/fetchSourceHtml'
import { parseSitesConfig, stableId } from '@/features/priceWatch/core'
import { DEFAULT_WATCH_ID } from '@/features/priceWatch/paths'
import { harvestPass, type CompetitorConfig, type HarvestDeps } from '@/features/priceWatch/catalog/runHarvest'
import { loadCompetitorMeta, saveCompetitorMeta, savePage, countPages } from '@/features/priceWatch/catalog/store'
import { harvestProgress } from '@/features/priceWatch/catalog/harvest'

interface HarvestConfig {
  watchId: string
  sites: string
  families: string
  pageBudget: number
}
type HarvestOutputs = { status: ExcelSheet }

function statusSheet(rows: Record<string, unknown>[]): ExcelSheet {
  return {
    name: 'Index concurrents',
    columns: [
      { key: 'site', label: 'Concurrent', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 200 },
      { key: 'pagesFetched', label: 'Pages ce run', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 120 },
      { key: 'productsIndexed', label: 'Produits ce run', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 140 },
      { key: 'pagesTotal', label: 'Pages indexées', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 140 },
      { key: 'progress', label: 'Balayage', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 },
    ],
    rows: rows.map((r, i) => ({ _id: `site_${i}`, ...r })),
    taxonomy: [],
  }
}

const harvestCompetitorNode: NodeSpec<HarvestConfig, Record<string, never>, HarvestOutputs> = {
  type: 'harvest-competitor',
  category: 'import',
  label: 'Moisson concurrents',
  description:
    "Parcourt les catalogues concurrents (pages liste) et construit un index persistant " +
    "prix/référence/stock. Un lot de pages par run ; sur cron, les ticks accumulent puis " +
    "rafraîchissent. Ne fait transiter aucune donnée volumineuse — l'index vit dans Firestore.",
  icon: TrendingUpDown,
  connectors: ['jina'],
  inputs: [],
  outputs: [{ name: 'status', type: 'sheet' }],
  configSchema: [
    {
      name: 'sites', kind: 'textarea', label: 'Sites concurrents (un par ligne)', required: true,
      help: 'Domaine par ligne. Ex : « pro-motoculture.com ». PrestaShop supporté nativement.',
    },
    {
      name: 'families', kind: 'text', label: 'Familles ciblées (séparées par des virgules)',
      help: 'Ex : « COURROIES, FILTRATION, COUPE ». Vide = catalogue complet (plus long).',
    },
    {
      name: 'pageBudget', kind: 'number', label: 'Pages par run',
      help: 'Nombre de pages liste moissonnées à chaque exécution. Réparti entre les sites.',
    },
    { name: 'watchId', kind: 'text', label: 'Identifiant du suivi (avancé)', help: 'Laisse VIDE : le suivi est automatiquement celui du workflow (partagé avec « Comparer catalogue » du même workflow). Ne remplis que pour partager un même suivi entre plusieurs workflows.' },
  ],
  defaultConfig: { watchId: '', sites: '', families: '', pageBudget: 40 },
  cardSummary: (c) => {
    const n = parseSitesConfig(c.sites).length
    return n ? `${n} site(s) · ${c.pageBudget}/run${c.families.trim() ? ` · ${c.families.trim()}` : ''}` : ''
  },
  runtime: 'client',
  run: async (ctx, config) => {
    const uid = useAuthStore.getState().user?.uid
    if (!uid) throw new Error('Utilisateur non connecté.')
    // Identité du suivi : l'id du workflow par défaut (→ Moisson & Comparer du même
    // workflow partagent forcément le même suivi, sans rien saisir). Override manuel
    // possible pour partager un suivi entre workflows.
    const watchId = stableId((config.watchId || '').trim() || ctx.workflowId || DEFAULT_WATCH_ID)
    const sites = parseSitesConfig(config.sites)
    if (sites.length === 0) {
      ctx.log('warn', 'Aucun site concurrent configuré.')
      return { status: statusSheet([]) }
    }
    const families = config.families.split(',').map((f) => f.trim()).filter(Boolean)
    // Budget réparti équitablement entre les sites (au moins 1 page chacun).
    const perSite = Math.max(1, Math.floor(Math.max(1, config.pageBudget) / sites.length))

    const rows: Record<string, unknown>[] = []
    for (const site of sites) {
      if (ctx.signal.aborted) break
      ctx.reportConnector?.('jina')
      const cfg: CompetitorConfig = { siteId: stableId(site.domain), domain: site.domain, families }
      const prevMeta = await loadCompetitorMeta(uid, watchId, cfg.siteId)
      const deps: HarvestDeps = {
        fetchHtml: (url) => fetchSourceHtml(url),
        loadCursor: async () => prevMeta?.cursor ?? null,
        saveCursor: (siteId, cursor) => saveCompetitorMeta(uid, watchId, siteId, { domain: site.domain, cursor }),
        savePage: (siteId, pageId, url, page, products) => savePage(uid, watchId, siteId, pageId, url, page, products),
        log: (m) => ctx.log('info', m),
        signal: ctx.signal,
      }
      const t0 = Date.now()
      const res = await harvestPass(cfg, deps, perSite)
      const elapsedMs = Date.now() - t0
      const pagesTotal = await countPages(uid, watchId, cfg.siteId)
      await saveCompetitorMeta(uid, watchId, cfg.siteId, {
        pageCount: pagesTotal,
        lastHarvestMs: elapsedMs,
        cumulHarvestMs: (prevMeta?.cumulHarvestMs ?? 0) + elapsedMs,
      })
      ctx.reportCount?.(rows.reduce((s, r) => s + Number(r.productsIndexed ?? 0), 0) + res.productsIndexed)
      rows.push({
        site: site.domain,
        pagesFetched: res.pagesFetched,
        productsIndexed: res.productsIndexed,
        pagesTotal,
        progress: res.sweepComplete ? 'complet' : `${Math.round(harvestProgress(res.cursor) * 100)} %`,
      })
      ctx.log('info', `${site.domain} : +${res.productsIndexed} produit(s) sur ${res.pagesFetched} page(s) (index : ${pagesTotal} pages).`)
    }
    return { status: statusSheet(rows) }
  },
}

nodeRegistry.register(harvestCompetitorNode)
