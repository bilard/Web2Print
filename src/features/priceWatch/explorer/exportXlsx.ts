// Export CLASSEUR des lignes affichées — la sortie de travail de l'audit.
//
// Pourquoi en plus du CSV. Le CSV rend du texte : un tableur y voit « 8,97 » comme une
// chaîne, l'écart « -23,3 » aussi, et trier sur l'écart ou sommer les prix demande de
// reconvertir toute la feuille à la main. Le classeur écrit de vrais NOMBRES et pose un
// filtre automatique sur l'en-tête — c'est-à-dire exactement ce qu'il faut pour trier par
// concurrent, ne garder que les douteux et cocher au fil de l'eau.
//
// ⚠ Les intitulés sont en français, comme ceux de l'export CSV voisin : les deux fichiers
// sortent du même écran et doivent se recoller. Ce n'est pas de l'interface — un tableur
// livré à un acheteur n'a pas de langue d'affichage.
import * as XLSX from 'xlsx'
import { discountPct, type PairedRow } from './pairing'
import type { ConfidenceBand, DoubtReason } from './confidence'
import type { Verdict } from './verdictStore'

export const XLSX_HEAD = [
  'Concurrent', 'Fiabilité', 'Score', 'Motifs de doute', 'Verdict',
  'Ma référence', 'Mon EAN', 'Mon titre', 'Mon prix HT',
  'Titre concurrent', 'Réf concurrent', 'GTIN concurrent',
  'Prix HT', 'Prix TTC', 'Prix barré TTC', 'Remise %', 'Écart %',
  'Stock', 'Preuve', 'URL fiche',
]

const BAND_LABEL: Record<ConfidenceBand, string> = {
  sure: 'Sûr', check: 'À vérifier', doubt: 'Douteux',
}

const VERDICT_LABEL: Record<Verdict, string> = { ok: 'Validé', ko: 'Rejeté' }

/** Motifs de doute, en clair. Le code (`numeric-short`) ne dit rien à qui reçoit le
 *  fichier ; c'est pourtant la colonne qui explique pourquoi la ligne est là. */
const DOUBT_LABEL: Record<DoubtReason, string> = {
  'ean-conflict': 'codes-barres contradictoires',
  'ref-conflict': 'références contradictoires',
  'weak-key': 'clé courte',
  'numeric-short': 'clé numérique courte',
  'origin-key': 'référence d’origine',
  contested: 'plusieurs produits revendiquent la fiche',
  'price-gulf': 'écart de prix considérable',
  'price-abyss': 'rapport de prix inexplicable',
  'family-conflict': 'natures de pièces incompatibles',
  'visual-conflict': 'photos contradictoires',
}

const EVIDENCE_LABEL: Record<string, string> = {
  gtin13: 'code-barres déclaré',
  'ean-in-url': 'code-barres dans l’adresse',
  sku: 'référence déclarée (SKU)',
  mpn: 'référence constructeur (MPN)',
  'ref-in-name': 'référence en tête de libellé',
  'ref-in-url': 'référence dans l’adresse',
  'ref-in-title': 'référence dans le libellé',
}

/** Une cellule : un nombre reste un nombre. `null` laisse la case VIDE — écrire 0 pour un
 *  prix absent fausserait toute moyenne calculée dans le tableur. */
export type Cell = string | number | null

export interface SheetContext {
  /** Domaine du concurrent d'où vient la ligne. En compilation, il change à chaque ligne. */
  domainOf: (r: PairedRow) => string
  verdictOf?: (r: PairedRow) => Verdict | null
}

/**
 * Matrice du classeur, en-tête compris. PUR : c'est la partie qui se teste — l'écriture
 * du fichier, elle, n'est qu'un appel de bibliothèque.
 */
export function rowsToSheetMatrix(rows: PairedRow[], ctx: SheetContext): Cell[][] {
  const out: Cell[][] = [[...XLSX_HEAD]]
  for (const r of rows) {
    const s = r.source
    const c = r.confidence
    const v = ctx.verdictOf?.(r) ?? null
    out.push([
      ctx.domainOf(r),
      c ? BAND_LABEL[c.band] : null,
      c ? c.score : null,
      c && c.doubts.length ? c.doubts.map((d) => DOUBT_LABEL[d]).join(', ') : null,
      v ? VERDICT_LABEL[v] : null,
      s?.ref ?? null, s?.ean ?? null, s?.name ?? null, s?.priceHt ?? null,
      r.listing.name, r.listing.ref ?? null, r.listing.gtin13 ?? null,
      r.cmp.priceHt ?? null, r.cmp.priceTtc ?? null, r.cmp.listPriceTtc ?? null,
      discountPct(r.listing), r.cmp.deltaPct ?? null,
      r.listing.availability ?? null,
      r.proof ? (EVIDENCE_LABEL[r.proof.evidence] ?? r.proof.evidence) : null,
      r.listing.url,
    ])
  }
  return out
}

/** Largeurs de colonnes, dans l'ordre de `XLSX_HEAD`. Sans elles, « Titre concurrent »
 *  s'ouvre sur huit caractères et le fichier est illisible avant vingt ajustements. */
const WIDTHS = [22, 11, 7, 30, 9, 16, 15, 42, 11, 46, 16, 15, 11, 11, 13, 9, 9, 12, 26, 52]

export function downloadRowsXlsx(rows: PairedRow[], ctx: SheetContext, filename: string): void {
  const matrix = rowsToSheetMatrix(rows, ctx)
  const ws = XLSX.utils.aoa_to_sheet(matrix)
  ws['!cols'] = WIDTHS.map((wch) => ({ wch }))
  // Filtre automatique sur l'en-tête : sur plusieurs milliers de lignes à trier par
  // concurrent puis par écart, c'est la différence entre un outil et un tas de données.
  // ⚠ Le FIGEAGE des volets n'est pas posé : SheetJS ne l'écrit pas dans sa version
  // ouverte (`!freeze` est ignoré à l'écriture). Mieux vaut pas de volet figé qu'une
  // ligne de code qui laisse croire qu'il y en a un.
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: matrix.length - 1, c: XLSX_HEAD.length - 1 } }) }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'À valider')
  XLSX.writeFile(wb, filename)
}
