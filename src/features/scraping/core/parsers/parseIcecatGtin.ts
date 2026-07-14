// Icecat Live : des milliers de sites e-commerce (Magento & co) chargent leur
// fiche technique via `IcecatLive.getDatasheet({...}, {GTIN: '…'}, 'fr')`.
// L'appel embarque le GTIN/EAN RÉEL du produit — souvent la SEULE occurrence
// fiable de l'EAN quand le JSON-LD recopie le sku interne (fixture réelle
// trafic.com : JSON-LD gtin = « 1084074 » à 7 chiffres = la réf interne, alors
// que le script Icecat porte « 3431541125964 »). Signal par PLATEFORME
// (standard Icecat), jamais par site.

const ICECAT_RE = /IcecatLive\s*\.\s*getDatasheet[\s\S]{0,400}?GTIN:\s*['"]([0-9|]{8,})['"]/

/** EAN/GTIN plausible : 8-14 chiffres (EAN-8, UPC-A, EAN-13, GTIN-14). */
const GTIN_RE = /^\d{8,14}$/

/** Extrait le GTIN du widget Icecat Live embarqué dans le HTML (null si absent
 *  ou invalide). Les valeurs multiples « a|b » gardent la première plausible. */
export function parseIcecatGtin(html: string): string | null {
  const m = ICECAT_RE.exec(html)
  if (!m) return null
  for (const candidate of m[1].split('|')) {
    const v = candidate.trim()
    if (GTIN_RE.test(v)) return v
  }
  return null
}
