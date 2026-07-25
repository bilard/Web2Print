// src/features/workflows/registry/harvestCompetitorNode.ts
// Node « Moisson concurrents » : parcourt les catalogues concurrents (pages liste) et
// alimente un index Firestore persistant, un lot borné de pages par run. Sur cron, les
// ticks successifs accumulent puis rafraîchissent l'index. Aucune donnée volumineuse ne
// transite par la mémoire du run — le matching relira l'index (cf. audit scalabilité).
import { TrendingUpDown } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelSheet } from '@/features/excel/types'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { buildSiteFetcher } from '@/features/priceWatch/catalog/siteFetch'
import { parseSitesConfig, stableId } from '@/features/priceWatch/core'
import { resolveSitesInput } from '@/features/priceWatch/sourceSites'
import { harvestPass, type CompetitorConfig, type HarvestDeps } from '@/features/priceWatch/catalog/runHarvest'
import { loadCompetitorMeta, saveCompetitorMeta, savePage, countPages, touchWatch } from '@/features/priceWatch/catalog/store'
import { harvestProgress } from '@/features/priceWatch/catalog/harvest'

interface HarvestConfig {
  watchId: string
  sites: string
  families: string
  pageBudget: number
}
interface HarvestInputs { sites?: unknown }
type HarvestOutputs = { status: ExcelSheet }

/** Mode « cycle calendaire » (parité serveur) : porté par le doc workflowSchedules du
 *  workflow (champ `cycle` posé par le node Cron). En mode cycle, un site terminé ATTEND
 *  les autres au lieu de rouvrir son balayage. Fail-open : doc absent = mode continu. */
async function isCycleMode(workflowId: string | undefined): Promise<boolean> {
  if (!workflowId) return false
  try {
    const snap = await getDoc(doc(db, 'workflowSchedules', workflowId))
    return !!(snap.exists() && (snap.data()?.cycle as { enabled?: boolean } | undefined)?.enabled)
  } catch { return false }
}

function statusSheet(rows: Record<string, unknown>[]): ExcelSheet {
  return {
    name: 'Index concurrents',
    columns: [
      { key: 'site', label: 'Concurrent', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 200 },
      { key: 'pagesFetched', label: 'Pages ce run', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 120 },
      { key: 'productsIndexed', label: 'Produits ce run', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 140 },
      { key: 'pagesTotal', label: 'Pages indexées', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 140 },
      { key: 'progress', label: 'Familles', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 },
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

    // Le suivi existe dès la 1ʳᵉ moisson (liste + dashboard), sans attendre « Comparer ».
    await touchWatch(uid, watchId, ctx.workflowName)

    // Mode cycle (parité serveur) : metas préchargées pour décider GLOBALEMENT — tous
    // les balayages terminés = réouverture d'un cycle pour TOUS en même temps ; sinon
    // les sites terminés attendent (skip) que les retardataires finissent.
    const cycleMode = await isCycleMode(ctx.workflowId)
    const metas = new Map<string, Awaited<ReturnType<typeof loadCompetitorMeta>>>()
    for (const site of sites) {
      const siteId = stableId(site.domain)
      metas.set(siteId, await loadCompetitorMeta(uid, watchId, siteId))
    }
    const allDoneBefore = sites.every((s) => metas.get(stableId(s.domain))?.cursor?.done === true)
    if (cycleMode && allDoneBefore) ctx.log('info', 'Nouveau cycle : réouverture des balayages de tous les sites.')

    const rows: Record<string, unknown>[] = []
    for (const site of sites) {
      if (ctx.signal.aborted) break
      const cfg: CompetitorConfig = { siteId: stableId(site.domain), domain: site.domain, families }
      const prevMeta = metas.get(cfg.siteId)
      if (cycleMode && !allDoneBefore && prevMeta?.cursor?.done) {
        const pagesTotal = await countPages(uid, watchId, cfg.siteId)
        rows.push({ site: site.domain, pagesFetched: 0, productsIndexed: 0, pagesTotal, progress: 'complet' })
        ctx.log('info', `${site.domain} : balayage terminé — en attente de la fin du cycle.`)
        continue
      }
      // Moteur par site : site authentifié (login cookie) sinon moteur forcé
      // (jina | firecrawl | brightdata) sinon cascade auto.
      const fetcher = buildSiteFetcher(site.engine, { auth: site.auth, host: site.domain })
      ctx.reportConnector?.(fetcher.connectorId)
      if (site.auth) ctx.log('info', `${site.domain} : accès authentifié (login cookie).`)
      else if (site.engine) ctx.log('info', `${site.domain} : moteur forcé « ${site.engine} ».`)
      const t0 = Date.now()
      // % de prix de la passe : accumulé au fil des pages sauvées (aucune lecture en plus).
      let passProducts = 0
      let passWithPrice = 0
      const deps: HarvestDeps = {
        fetchHtml: fetcher.fetchHtml,
        loadCursor: async () => prevMeta?.cursor ?? null,
        saveCursor: (siteId, cursor) => saveCompetitorMeta(uid, watchId, siteId, { domain: site.domain, cursor }),
        savePage: (siteId, pageId, url, page, products) => {
          passProducts += products.length
          passWithPrice += products.filter((p) => p.price != null).length
          return savePage(uid, watchId, siteId, pageId, url, page, products)
        },
        // Progression live (toutes les 15 pages) : la jauge Balayage avance et le heartbeat
        // reste vert pendant le run, sans attendre la fin du site.
        onProgress: (_p, productsIndexed, cursor) => saveCompetitorMeta(uid, watchId, cfg.siteId, {
          domain: site.domain,
          harvestBeatAt: Date.now(), // battement de MOISSON (le « Comparer » ne l'écrit jamais)
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
      // % de prix CUMULÉ sur le balayage courant, pas sur la seule passe : une passe qui
      // tombe sur des catégories sans prix statiques (promos AJAX…) affichait « 0 % »
      // alors que l'index du site est sain. Compteurs remis à zéro quand la passe a
      // ROUVERT un balayage (le curseur précédent était done).
      const newSweep = prevMeta?.cursor?.done === true
      const sweepProducts = (newSweep ? 0 : prevMeta?.sweepProducts ?? 0) + passProducts
      const sweepWithPrice = (newSweep ? 0 : prevMeta?.sweepWithPrice ?? 0) + passWithPrice
      await saveCompetitorMeta(uid, watchId, cfg.siteId, {
        pageCount: pagesTotal,
        harvestBeatAt: Date.now(), // battement de MOISSON (le « Comparer » ne l'écrit jamais)
        productCount: (prevMeta?.productCount ?? 0) + res.productsIndexed,
        lastHarvestMs: elapsedMs,
        cumulHarvestMs: (prevMeta?.cumulHarvestMs ?? 0) + elapsedMs,
        harvestProgress: res.sweepComplete ? 1 : harvestProgress(res.cursor),
        harvestSweeps: res.cursor.sweeps,
        sweepProducts,
        sweepWithPrice,
        ...(sweepProducts > 0 ? { pctPrice: Math.round((sweepWithPrice / sweepProducts) * 100) } : {}),
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
