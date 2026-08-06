// Export CSV des lignes AFFICHÉES (filtres compris) : l'export doit rendre exactement
// ce que l'écran montre, sinon il n'a aucune valeur de preuve. PUR.
import { discountPct, type PairedRow } from './pairing'

const HEAD = [
  'Ma référence', 'Mon EAN', 'Mon titre', 'Ma description', 'Mes visuels', 'Mon prix HT',
  'Concurrent', 'Titre concurrent', 'Réf concurrent', 'GTIN concurrent',
  'Prix TTC', 'Prix HT', 'Prix barré TTC', 'Remise %', 'Écart %', 'Stock', 'Appariement', 'URL',
]

const KIND: Record<string, string> = { 'exact-ean': 'EAN', 'exact-ref': 'Référence', origin: 'Réf origine' }

function esc(v: string | number | null | undefined): string {
  if (v == null) return ''
  const s = String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** `domainOf` et non un domaine unique : en compilation, chaque ligne vient d'un marchand
 *  différent, et une colonne « Concurrent » qui répéterait celui de l'onglet mentirait. */
export function rowsToCsv(rows: PairedRow[], domainOf: (r: PairedRow) => string): string {
  const lines = [HEAD.join(';')]
  for (const r of rows) {
    const s = r.source
    lines.push([
      esc(s?.ref), esc(s?.ean), esc(s?.name), esc(s?.description), esc(s?.images.join(' | ')), esc(s?.priceHt),
      esc(domainOf(r)), esc(r.listing.name), esc(r.listing.ref), esc(r.listing.gtin13),
      esc(r.cmp.priceTtc), esc(r.cmp.priceHt), esc(r.cmp.listPriceTtc), esc(discountPct(r.listing)),
      esc(r.cmp.deltaPct), esc(r.listing.availability), esc(r.kind ? KIND[r.kind] : 'non apparié'),
      esc(r.listing.url),
    ].join(';'))
  }
  return lines.join('\n')
}
