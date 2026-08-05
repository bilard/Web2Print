// Node « Comparer les visuels » : pour chaque appariement F1 ↔ concurrent, un modèle de
// vision juge si les deux photos montrent bien la même pièce.
//
// Pourquoi un node et pas un bouton d'écran : la passe porte sur des dizaines de milliers
// de paires, elle est reprenable et se relance périodiquement quand la moisson découvre
// de nouvelles fiches. C'est exactement le rôle du workflow, chef d'orchestre du module.
//
// Coût maîtrisé par construction : une paire déjà jugée n'est JAMAIS repayée (cf.
// `runVisualPass`), et le budget par run borne la dépense d'un tour.
import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { ScanEye } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelSheet } from '@/features/excel/types'
import { resolveSitesInput } from '@/features/priceWatch/sourceSites'
import { loadAllListings } from '@/features/priceWatch/catalog/store'
import { loadSourceCatalog } from '@/features/priceWatch/reportStore'
import { pairSiteListings } from '@/features/priceWatch/explorer/pairing'
import { runVisualPass, type VisualPair } from '@/features/priceWatch/visual/runVisualPass'
import { loadVisuals, saveVisuals, saveVisualPass } from '@/features/priceWatch/visual/visualStore'
import { t } from '@/lib/i18n'

/** Fenêtre d'un run lancé depuis le NAVIGATEUR, alignée sur la moisson. */
const CLIENT_WINDOW_MS = 10 * 60_000

interface VisualConfig {
  watchId: string
  sites: string
  /** Paires analysées au maximum par run et par site. */
  budget: number
  /** Analyses simultanées. Trop haut, les quotas du fournisseur se déclenchent. */
  concurrency: number
  /** Préfixe des visuels source (PATH_PHOTO ne porte qu'un nom de fichier). */
  imagePrefix: string
}
interface VisualInputs { sites?: unknown }
type VisualOutputs = { status: ExcelSheet }

function statusSheet(rows: Record<string, unknown>[]): ExcelSheet {
  return {
    name: 'Comparaison visuelle',
    columns: [
      { key: 'site', label: 'Concurrent', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 200 },
      { key: 'analyzed', label: 'Analysés ce run', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 140 },
      { key: 'same', label: 'Même pièce', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 120 },
      { key: 'different', label: 'Pièce différente', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 140 },
      { key: 'unclear', label: 'Non concluant', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 130 },
      { key: 'covered', label: 'Couverture', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 },
    ],
    rows: rows.map((r, i) => ({ _id: `vis_${i}`, ...r })),
    taxonomy: [],
  }
}

const visualMatchNode: NodeSpec<VisualConfig, VisualInputs, VisualOutputs> = {
  type: 'visual-match',
  category: 'import',
  labelKey: 'node.visual-match.label',
  descriptionKey: 'node.visual-match.desc',
  icon: ScanEye,
  inputs: [{ name: 'sites', type: 'sites' }],
  outputs: [{ name: 'status', type: 'sheet' }],
  configSchema: [
    {
      name: 'sites', kind: 'textarea', label: 'Sites concurrents (un par ligne)',
      helpKey: 'node.visual-match.sites.help',
      disabledWhen: (_c, wired) => wired('sites'),
      disabledNoteKey: 'node.visual-match.sites.wired',
    },
    { name: 'budget', kind: 'number', label: 'Paires par run et par site', helpKey: 'node.visual-match.budget.help' },
    { name: 'concurrency', kind: 'number', label: 'Analyses simultanées', helpKey: 'node.visual-match.concurrency.help' },
    { name: 'imagePrefix', kind: 'text', label: 'Préfixe des visuels source', helpKey: 'node.visual-match.imagePrefix.help' },
    {
      name: 'watchId', kind: 'text', labelKey: 'node.harvest-competitor.watchId.label',
      helpKey: 'node.visual-match.watchId.help',
      disabledWhen: (_c, wired) => wired('sites'),
      disabledNoteKey: 'node.visual-match.sites.wired',
    },
  ],
  defaultConfig: { watchId: '', sites: '', budget: 500, concurrency: 4, imagePrefix: '' },
  cardSummary: (c) => `${c.budget}/run · ×${c.concurrency}`,
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const uid = getWorkspaceUid()
    if (!uid) throw new Error(t('run.notSignedIn'))
    const { watchId, sites } = resolveSitesInput(inputs.sites, {
      sitesText: config.sites, watchIdRaw: config.watchId, workflowId: ctx.workflowId,
    })
    if (sites.length === 0) {
      ctx.log('warn', t('run.vm.noSite'))
      return { status: statusSheet([]) }
    }

    // Le catalogue source est lu UNE fois : il est commun à tous les concurrents.
    const src = await loadSourceCatalog(uid, watchId)
    if (!src || src.products.length === 0) {
      ctx.log('warn', t('run.vm.noCatalog'))
      return { status: statusSheet([]) }
    }

    // Échéance CLIENT : sans elle, un budget large tiendrait l'onglet des heures durant.
    // La passe est reprenable — ce qui n'est pas fait ce tour-ci le sera au suivant.
    const deadlineAt = Date.now() + CLIENT_WINDOW_MS
    const rows: Record<string, unknown>[] = []

    for (const site of sites) {
      if (Date.now() > deadlineAt) { ctx.log('warn', t('run.vm.windowClosed')); break }
      const listings = await loadAllListings(uid, watchId, site.id)
      if (listings.length === 0) continue

      // Même jointure que l'écran : les verdicts doivent porter sur EXACTEMENT les
      // appariements que l'acheteur voit, sinon ils désignent d'autres lignes.
      const paired = pairSiteListings(src.products, site.id, listings, {
        vatRate: src.vatRate, imagePrefix: config.imagePrefix,
      })
      const pairs: VisualPair[] = paired
        .filter((r) => r.source)
        .map((r) => ({
          url: r.listing.url,
          sourceImage: r.source?.images[0] ?? null,
          listingImage: r.listing.image ?? null,
          sourceName: r.source?.name ?? '',
          listingName: r.listing.name,
        }))

      const known = await loadVisuals(uid, watchId, site.id)
      const res = await runVisualPass({
        pairs, known, budget: config.budget, concurrency: config.concurrency,
        shouldStop: () => Date.now() > deadlineAt,
      })
      if (res.analyzed > 0) {
        await saveVisuals(uid, watchId, site.id, res.map)
        await saveVisualPass(uid, watchId, site.id, {
          cursor: res.map.size, analyzed: res.analyzed, updatedAt: Date.now(),
        })
      }
      const comparable = pairs.filter((p) => p.sourceImage && p.listingImage).length
      ctx.log('info', t('run.vm.site', {
        domain: site.domain, done: res.analyzed, same: res.same,
        different: res.different, unclear: res.unclear,
      }))
      rows.push({
        site: site.domain, analyzed: res.analyzed, same: res.same,
        different: res.different, unclear: res.unclear,
        // Couverture affichée sur les paires COMPARABLES, pas sur tous les appariements :
        // une paire sans visuel des deux côtés ne sera jamais analysable, et la compter
        // comme un manque ferait plafonner la couverture sans raison.
        covered: comparable > 0 ? `${Math.round((res.map.size / comparable) * 100)} %` : '—',
      })
    }

    ctx.reportCount?.(rows.length)
    return { status: statusSheet(rows) }
  },
}

nodeRegistry.register(visualMatchNode)
