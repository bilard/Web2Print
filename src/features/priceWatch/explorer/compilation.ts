// Compilation des appariements À CONTRÔLER de TOUS les concurrents, en une seule liste.
//
// Pourquoi. L'explorateur travaille un concurrent à la fois — c'est une contrainte de
// mémoire, pas un choix de lecture. Mais le travail de validation, lui, ne se découpe pas
// par site : l'acheteur veut voir d'un bloc ce qui n'est pas acquis, statuer, et sortir le
// tout en classeur. Répéter vingt-quatre fois « ouvrir un onglet, filtrer sur suspect,
// exporter » produit vingt-quatre fichiers que personne ne recolle.
//
// Ce que la compilation retient : les lignes APPARIÉES dont la bande n'est pas `sure`,
// c'est-à-dire « à vérifier » + « douteux » — exactement ce que désigne le filtre
// `trust: 'suspect'`, mais à travers tous les sites. Les orphelines sont écartées : sans
// appariement, il n'y a rien à valider.
//
// ⚠ La compilation ne garde JAMAIS l'index d'un site. `compileSite` reçoit les fiches,
// n'en retient que les suspectes, et l'appelant relâche le tableau complet avant de passer
// au site suivant (cf. `useCompilation`). À 200 000 fiches cumulées, tout garder ferait
// tomber l'onglet.
import { pairSiteListings, type PairedRow } from './pairing'
import { withVisual, type VisualCall } from './confidence'
import type { SourceProduct } from '../catalog/match'
import type { CompetitorListing } from '../catalog/competitorListing'

/** Une ligne de la compilation : la ligne appariée, plus le concurrent d'où elle vient —
 *  sans lui, l'écran ne peut plus dire qui l'on est en train de valider. */
export interface CompiledRow extends PairedRow {
  siteId: string
  domain: string
}

/**
 * Ligne à contrôler : appariée (sinon il n'y a pas d'appariement à juger) et pas encore
 * acquise. `check` et `doubt` sont réunis à dessein — le but est de sortir du lot tout ce
 * qui n'est pas sûr, pas de distinguer deux nuances de doute avant même d'avoir regardé.
 */
export function isSuspect(r: PairedRow): boolean {
  return !!r.confidence && r.confidence.band !== 'sure'
}

/**
 * Plafond de lignes retenues, tous concurrents confondus. Il existe parce qu'un rapport
 * mal appareillé peut rendre des dizaines de milliers de suspects et figer l'onglet ; il
 * est haut parce qu'un plafond atteint en silence se lirait comme « tout est compilé ».
 * L'écran DIT quand il est touché.
 */
export const COMPILE_CAP = 40000

/** Options d'appariement, reprises telles quelles de `pairSiteListings` : la compilation
 *  doit produire EXACTEMENT les mêmes lignes que l'onglet du site, sinon les deux écrans
 *  se contrediraient sur les mêmes données. */
export type CompileOptions = NonNullable<Parameters<typeof pairSiteListings>[3]>

/**
 * ⚠ `visualOf` n'est pas un raffinement d'affichage : le verdict des PHOTOS entre dans
 * l'indice, et c'est lui qui décide de la bande. Sans lui, un appariement démenti par les
 * images resterait « sûr » ICI et serait donc ÉCARTÉ de la compilation — l'écran d'audit
 * laisserait échapper précisément les cas les plus douteux, et la même ligne s'afficherait
 * « DOUTEUX » dans l'onglet du concurrent et « SÛR » dans la compilation.
 */
export function compileSite(
  site: { siteId: string; domain: string },
  products: SourceProduct[],
  listings: CompetitorListing[],
  opts: CompileOptions = {},
  visualOf?: (url: string) => VisualCall | null,
): CompiledRow[] {
  const out: CompiledRow[] = []
  for (const row of pairSiteListings(products, site.siteId, listings, opts)) {
    const call = row.confidence && visualOf ? visualOf(row.listing.url) : null
    const r = call && row.confidence
      ? { ...row, confidence: withVisual(row.confidence, call) }
      : row
    if (isSuspect(r)) out.push({ ...r, siteId: site.siteId, domain: site.domain })
  }
  return out
}

/**
 * Concurrent d'une ligne : porté par la ligne en compilation, celui de l'onglet sinon.
 *
 * Une seule fonction pour les deux modes, plutôt qu'un test de forme recopié à chaque
 * point d'affichage : l'export, l'en-tête et la ligne doivent nommer le MÊME marchand,
 * et c'est exactement le genre de détail qui diverge quand la règle est écrite trois fois.
 */
export function rowDomain(r: PairedRow, fallback: string): string {
  return (r as Partial<CompiledRow>).domain ?? fallback
}

/** Idem pour l'identifiant de site — c'est lui qui décide dans QUEL document d'audit le
 *  verdict s'écrit. Se tromper ici corromprait le travail d'un autre concurrent. */
export function rowSiteId(r: PairedRow, fallback: string): string {
  return (r as Partial<CompiledRow>).siteId ?? fallback
}

/** Répartition par concurrent, pour le résumé de la compilation. Trié par volume : le
 *  site qui pèse le plus dans la file de travail se lit en premier. */
export function compileBySite(rows: CompiledRow[]): { domain: string; count: number }[] {
  const by = new Map<string, number>()
  for (const r of rows) by.set(r.domain, (by.get(r.domain) ?? 0) + 1)
  return [...by.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain, 'fr'))
}
