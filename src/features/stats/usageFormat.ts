// Vocabulaire commun des deux vues de consommation : le panneau LIVE (Réglages IA) et le
// RAPPORT de coûts (node de workflow). Les deux lisent les mêmes compteurs et doivent
// annoncer les mêmes seuils — un budget « proche » d'un côté ne peut pas être « OK » de
// l'autre. Ces quatre helpers vivaient en double, ce qui rendait la divergence possible
// sans que rien ne la signale.

/** Position vis-à-vis du budget mensuel. `unset` = aucun budget déclaré. */
export type BadgeKind = 'ok' | 'warning' | 'over' | 'unset'

/** Seuils d'alerte : avertissement à 80 % du budget, dépassement à 100 %. */
export function getBadgeKind(costUsd: number, budgetUsd: number | null): BadgeKind {
  if (budgetUsd === null || budgetUsd <= 0) return 'unset'
  const pct = costUsd / budgetUsd
  if (pct >= 1) return 'over'
  if (pct >= 0.8) return 'warning'
  return 'ok'
}

/** Volume de tokens compact : 1,25 M · 84,3 k · 912. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + ' M'
  if (n >= 10_000) return (n / 1_000).toFixed(1) + ' k'
  return n.toLocaleString('fr-FR')
}

/** « 2026-06-01 » → « 01-Jun-26 », comme le dashboard Bright Data — pour qu'une date lue
 *  ici se retrouve telle quelle chez le fournisseur. Dates en UTC : le jour de
 *  facturation ne doit pas glisser d'un fuseau à l'autre. */
export function formatBillingDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]
  return `${day}-${month}-${String(d.getUTCFullYear()).slice(-2)}`
}
