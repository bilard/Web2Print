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
import { buildSiteFetcher } from '@/features/priceWatch/catalog/siteFetch'
import { parseSitesConfig, stableId } from '@/features/priceWatch/core'
import { resolveSitesInput } from '@/features/priceWatch/sourceSites'
import { harvestPass, type CompetitorConfig, type HarvestDeps } from '@/features/priceWatch/catalog/runHarvest'
import { loadCompetitorMeta, saveCompetitorMeta, savePage, countPages } from '@/features/priceWatch/catalog/store'
import { harvestProgress } from '@/features/priceWatch/catalog/harvest'

interface HarvestConfig {
  watchId: string
  sites: string
  families: string
  pageBudget: number
}
interface HarvestInputs { sites?: unknown }
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

const harvestCompetitorNode: NodeSpec<HarvestConfig, HarvestInputs, HarvestOutputs> = {
  type: 'harvest-competitor',
  category: 'import',
  label: 'Moisson concurrents',
  description:
    "Parcourt les catalogues concurrents (pages liste) et construit un index persistant " +
    "prix/référence/stock. Un lot de pages par run ; sur cron, les ticks accumulent puis " +
    "rafraîchissent. Ne fait transiter aucune donnée volumineuse — l'index vit dans Firestore.",
  icon: TrendingUpDown,
  connectors: ['jina'],
  // Port `sites` (facultatif) : brancher un node « Sites sources » remplace la textarea
  // ci-dessous ET l'identifiant de suivi — une seule liste à maintenir.
  inputs: [{ name: 'sites', type: 'sites' }],
  outputs: [{ name: 'status', type: 'sheet' }],
  configSchema: [
    {
      name: 'sites', kind: 'textarea', label: 'Sites concurrents (un par ligne)',
      help: 'Domaine par ligne. Ex : « pro-motoculture.com ». PrestaShop supporté nativement. IGNORÉ si un node « Sites sources » est branché sur le port sites.',
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
  run: async (ctx, config, inputs) => {
    const uid = useAuthStore.getState().user?.uid
    if (!uid) throw new Error('Utilisateur non connecté.')
    // Sites + identité du suivi : le port `sites` (node « Sites sources ») GAGNE ;
    // sinon repli sur la config locale historique (textarea + watchId, dérivé de
    // l'id du workflow par défaut → Moisson & Comparer partagent le même suivi).
    const { watchId, sites, fromPort } = resolveSitesInput(inputs.sites, {
      sitesText: config.sites, watchIdRaw: config.watchId, workflowId: ctx.workflowId,
    })
    if (fromPort) ctx.log('info', `Liste reçue du node « Sites sources » : ${sites.length} site(s) actif(s).`)
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
      // Moteur par site : forcé via « Sites sources » (jina | brightdata) sinon cascade auto.
      const fetcher = buildSiteFetcher(site.engine)
      ctx.reportConnector?.(fetcher.connectorId)
      if (site.engine) ctx.log('info', `${site.domain} : moteur forcé « ${site.engine} ».`)
      const cfg: CompetitorConfig = { siteId: stableId(site.domain), domain: site.domain, families }
      const prevMeta = await loadCompetitorMeta(uid, watchId, cfg.siteId)
      const t0 = Date.now()
      const deps: HarvestDeps = {
        fetchHtml: fetcher.fetchHtml,
        loadCursor: async () => prevMeta?.cursor ?? null,
        saveCursor: (siteId, cursor) => saveCompetitorMeta(uid, watchId, siteId, { domain: site.domain, cursor }),
        savePage: (siteId, pageId, url, page, products) => savePage(uid, watchId, siteId, pageId, url, page, products),
        // Progression live (toutes les 15 pages) : la jauge Balayage avance et le heartbeat
        // reste vert pendant le run, sans attendre la fin du site.
        onProgress: (_p, productsIndexed, cursor) => saveCompetitorMeta(uid, watchId, cfg.siteId, {
          domain: site.domain,
          productCount: (prevMeta?.productCount ?? 0) + productsIndexed, // fait ticker « Fiches collectées »
          harvestProgress: harvestProgress(cursor),
          harvestSweeps: cursor.sweeps,
          cumulHarvestMs: (prevMeta?.cumulHarvestMs ?? 0) + (Date.now() - t0),
        }),
        log: (m) => ctx.log('info', m),
        signal: ctx.signal,
      }
      const res = await harvestPass(cfg, deps, perSite)
      const elapsedMs = Date.now() - t0
      const pagesTotal = await countPages(uid, watchId, cfg.siteId)
      await saveCompetitorMeta(uid, watchId, cfg.siteId, {
        pageCount: pagesTotal,
        productCount: (prevMeta?.productCount ?? 0) + res.productsIndexed,
        lastHarvestMs: elapsedMs,
        cumulHarvestMs: (prevMeta?.cumulHarvestMs ?? 0) + elapsedMs,
        harvestProgress: res.sweepComplete ? 1 : harvestProgress(res.cursor),
        harvestSweeps: res.cursor.sweeps,
        // Télémétrie moteur : quel palier a réellement servi (affiché dans « Sites sources »).
        ...(fetcher.lastEngine() ? { lastEngine: fetcher.lastEngine() } : {}),
        // Verdict de la passe (✓/⚠/✗ dans « Sites sources ») : pages lues + produits.
        lastPassPages: res.pagesFetched,
        lastPassProducts: res.productsIndexed,
        lastPassAt: Date.now(),
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
