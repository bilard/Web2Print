// Conversion et formatage des montants de consommation. Les fournisseurs facturent en
// dollars, la facture arrive en euros : les deux sont affichés côte à côte partout.
const USD_TO_EUR = 0.92

/** Montant en euros, avec autant de décimales qu'il en faut pour rester lisible :
 *  $0.0002 arrondi à 2 décimales afficherait « 0,00 € » sur une dépense réelle. */
export function formatEur(usd: number, decimals = 4): string {
  const eur = usd * USD_TO_EUR
  let d = decimals
  if (eur >= 1) d = 2
  else if (eur >= 0.01) d = 3
  else if (eur >= 0.0001) d = 4
  else d = 6
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(eur)
}
