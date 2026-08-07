// functions/src/priceWatch/reportHtml.ts
// ⚠ COPIE de src/features/priceWatch/reportHtml.ts — le cron envoie le MÊME mail.
// Rendu HTML du rapport de VEILLE TARIFAIRE — PUR (aucune dépendance Firebase/React).
//
// ⚠ Module DUPLIQUÉ dans functions/src/priceWatch/ (bundles séparés) : le cron doit
// pouvoir envoyer exactement le même mail que le navigateur.
import type { StoredReport } from './reportStore'

const esc = (s: string): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const nf = (n: number) => n.toLocaleString('fr-FR')
const eur = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const pct = (n: number | null | undefined) =>
  n == null ? '—' : `${n > 0 ? '+' : ''}${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`

export interface PriceWatchReportOptions {
  title: string
  /** Écart médian (%) à partir duquel un concurrent est signalé comme agressif. */
  competitorThresholdPct: number
  /** Part (%) de produits sous-cotés à partir de laquelle une famille est signalée. */
  familyThresholdPct: number
  /** Nombre d'exemples de produits listés dans la section d'alerte. */
  examples: number
}

export const DEFAULT_PW_REPORT: PriceWatchReportOptions = {
  title: 'Veille tarifaire',
  competitorThresholdPct: 5,
  familyThresholdPct: 40,
  examples: 15,
}

// ── Rendu ────────────────────────────────────────────────────────────────────────────
// HTML d'e-mail : tables et styles INLINE. Gmail retire les feuilles de style, ignore
// flexbox et grid — une mise en page moderne s'y obtient par des tableaux et des bordures
// arrondies, pas par du CSS moderne qui n'arriverait jamais jusqu'à la boîte de réception.

const BG = '#0f1117'
const CARD = '#171a23'
const LINE = '#242836'
const TXT = '#e8eaf0'
const MUTED = '#9aa0b4'
const ROSE = '#fb7185'
const GREEN = '#34d399'
const AMBER = '#fbbf24'

function kpiCell(label: string, value: string, color: string, sub: string): string {
  return `<td width="25%" valign="top" style="padding:0 6px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:${CARD};border:1px solid ${LINE};border-radius:10px;">
      <tr><td style="padding:14px 16px;">
        <div style="font:600 10px/1.2 -apple-system,Segoe UI,Roboto,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">${esc(label)}</div>
        <div style="font:700 26px/1.15 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${color};padding-top:6px;">${esc(value)}</div>
        <div style="font:400 11px/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${MUTED};padding-top:4px;">${esc(sub)}</div>
      </td></tr>
    </table>
  </td>`
}

function section(title: string, lead: string, body: string): string {
  return `<tr><td style="padding:26px 12px 0;">
    <div style="font:700 15px/1.3 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${TXT};">${esc(title)}</div>
    <div style="font:400 12px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${MUTED};padding:4px 0 10px;">${esc(lead)}</div>
    ${body}
  </td></tr>`
}

function alertBox(items: string[], tone: 'danger' | 'ok'): string {
  const color = tone === 'danger' ? ROSE : GREEN
  const bg = tone === 'danger' ? 'rgba(251,113,133,.08)' : 'rgba(52,211,153,.08)'
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:${bg};border:1px solid ${color}40;border-radius:10px;">
    <tr><td style="padding:14px 16px;font:400 13px/1.7 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${TXT};">
      ${items.map((i) => `<div style="padding:2px 0;">${i}</div>`).join('')}
    </td></tr></table>`
}

function table(headers: string[], rows: string[][], aligns: ('l' | 'r')[]): string {
  const th = headers.map((h, i) => `<th align="${aligns[i] === 'r' ? 'right' : 'left'}" style="padding:8px 10px;font:600 10px/1.2 -apple-system,Segoe UI,Roboto,Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};border-bottom:1px solid ${LINE};">${esc(h)}</th>`).join('')
  const tr = rows.map((r, n) => `<tr style="background:${n % 2 ? 'rgba(255,255,255,.02)' : 'transparent'};">${
    r.map((c, i) => `<td align="${aligns[i] === 'r' ? 'right' : 'left'}" style="padding:8px 10px;font:400 13px/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${TXT};border-bottom:1px solid ${LINE};">${c}</td>`).join('')
  }</tr>`).join('')
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:${CARD};border:1px solid ${LINE};border-radius:10px;border-collapse:separate;overflow:hidden;">
    <tr>${th}</tr>${tr}</table>`
}

const gapCell = (v: number | null | undefined) =>
  `<span style="color:${v == null ? MUTED : v < 0 ? ROSE : GREEN};font-weight:600;">${pct(v)}</span>`

/**
 * Rend le rapport. `report` est le document persisté : ses KPIs et ses agrégats par
 * concurrent / par famille portent sur le catalogue COMPLET, sa liste `products` non.
 */
export function renderPriceWatchReport(
  report: StoredReport,
  opts: PriceWatchReportOptions,
  watchLabel: string,
): string {
  const k = report.kpis
  const matched = k.products ?? 0
  const comparisons = k.comparisons ?? 0
  const undercut = k.productsUndercut ?? 0
  const exposedPct = matched > 0 ? (undercut / matched) * 100 : null
  const holdPct = comparisons > 0 ? ((comparisons - (k.cheaperThanMe ?? 0)) / comparisons) * 100 : null
  const index = k.priceIndex ?? null
  const analysedAt = new Date(report.runAt).toLocaleString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
  })

  // Concurrents actifs sur l'appariement, classés par agressivité (médiane la plus basse).
  const comps = (report.byCompetitor ?? []).filter((c) => c.matched > 0)
  const byAggression = [...comps].sort((a, b) => (a.medGapPct ?? a.avgGapPct ?? 0) - (b.medGapPct ?? b.avgGapPct ?? 0))
  const aggressive = byAggression.filter((c) => (c.medGapPct ?? c.avgGapPct ?? 0) <= -opts.competitorThresholdPct)

  // Familles : part de produits sous-cotés. Calculée sur le catalogue complet (byFamily),
  // donc comparable d'une famille à l'autre — ce que la liste plafonnée ne permet pas.
  const fams = (report.byFamily ?? [])
    .filter((f) => f.products >= 5)
    .map((f) => ({ ...f, pct: (f.undercut / f.products) * 100 }))
    .sort((a, b) => b.pct - a.pct)
  const riskyFams = fams.filter((f) => f.pct >= opts.familyThresholdPct)

  // Exemples : tirés de la liste plafonnée, donc NON représentatifs — annoncés comme tels.
  const examples = [...(report.products ?? [])]
    .filter((p) => p.bestGapPct != null)
    .sort((a, b) => (a.bestGapPct ?? 0) - (b.bestGapPct ?? 0))
    .slice(0, opts.examples)

  const alerts: string[] = []
  if (aggressive.length > 0) {
    alerts.push(`<b style="color:${ROSE};">${aggressive.length} concurrent(s)</b> vendent en médiane sous vos prix de plus de ${opts.competitorThresholdPct} % : ${
      aggressive.slice(0, 5).map((c) => `${esc(c.domain.replace(/^www\./, ''))} (${pct(c.medGapPct ?? c.avgGapPct)})`).join(', ')
    }${aggressive.length > 5 ? '…' : ''}`)
  }
  if (riskyFams.length > 0) {
    alerts.push(`<b style="color:${ROSE};">${riskyFams.length} famille(s)</b> ont plus de ${opts.familyThresholdPct} % de leurs produits sous-cotés : ${
      riskyFams.slice(0, 5).map((f) => `${esc(f.famille)} (${Math.round(f.pct)} %)`).join(', ')
    }${riskyFams.length > 5 ? '…' : ''}`)
  }
  if (index != null && index > 105) {
    alerts.push(`Votre <b>indice tarif est à ${Math.round(index)}</b> : vous vendez en médiane ${Math.round(index - 100)} % au-dessus du marché.`)
  }
  if ((k.ruptures ?? 0) > 0) {
    alerts.push(`<b style="color:${AMBER};">${nf(k.ruptures)} rupture(s)</b> chez vos concurrents — autant d'occasions de vendre pendant qu'ils ne le peuvent pas.`)
  }

  const compRows = byAggression.slice(0, 20).map((c) => [
    esc(c.domain.replace(/^www\./, '')),
    nf(c.matched),
    gapCell(c.medGapPct ?? c.avgGapPct),
    `${nf(c.cheaper)} <span style="color:${MUTED};">/ ${nf(c.matched)}</span>`,
    nf(c.audit?.indexed ?? 0),
  ])

  const famRows = fams.slice(0, 12).map((f) => [
    esc(f.famille),
    nf(f.products),
    `<span style="color:${f.pct >= opts.familyThresholdPct ? ROSE : MUTED};font-weight:600;">${Math.round(f.pct)} %</span>`,
  ])

  const exRows = examples.map((p) => [
    `${esc(p.name)}${p.reference ? `<br><span style="color:${MUTED};font-size:11px;">${esc(p.reference)}</span>` : ''}`,
    p.myPriceHt != null ? eur(p.myPriceHt) : '—',
    gapCell(p.bestGapPct),
  ])

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background:${BG};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 12px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:760px;">

  <tr><td style="padding:0 12px 18px;">
    <div style="font:700 22px/1.25 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${TXT};">${esc(opts.title)}</div>
    <div style="font:400 12px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${MUTED};padding-top:5px;">
      ${esc(watchLabel)} · analyse du ${esc(analysedAt)} · ${nf(matched)} produits appariés chez ${comps.length} concurrent(s)
    </div>
  </td></tr>

  <tr><td>
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      ${kpiCell('Indice tarif', index == null ? '—' : String(Math.round(index)),
        index == null ? TXT : index > 101 ? ROSE : index < 99 ? GREEN : AMBER,
        'base 100 = médiane du marché')}
      ${kpiCell('Tenue prix', holdPct == null ? '—' : `${Math.round(holdPct)} %`, GREEN,
        'comparaisons où je tiens')}
      ${kpiCell('Exposés', exposedPct == null ? '—' : `${Math.round(exposedPct)} %`, ROSE,
        `${nf(undercut)} produits sur ${nf(matched)}`)}
      ${kpiCell('Ruptures', nf(k.ruptures ?? 0), AMBER, 'chez les concurrents')}
    </tr></table>
  </td></tr>

  ${alerts.length > 0
    ? section('⚠ Écarts significatifs', `Seuils appliqués : concurrent sous vos prix de plus de ${opts.competitorThresholdPct} % en médiane, famille au-delà de ${opts.familyThresholdPct} % de produits sous-cotés.`, alertBox(alerts, 'danger'))
    : section('Écarts significatifs', 'Aucun seuil d’alerte franchi sur cette analyse.', alertBox(['Aucun concurrent ni famille au-delà des seuils configurés.'], 'ok'))}

  ${section('Position par concurrent',
    'Écart MÉDIAN de ses prix face aux vôtres — la médiane, et non la moyenne : quelques appariements aberrants suffisent à faire dériver une moyenne. Négatif = il vend moins cher.',
    table(['Concurrent', 'Appariés', 'Écart médian', 'Moins cher sur', 'Fiches'], compRows, ['l', 'r', 'r', 'r', 'r']))}

  ${famRows.length > 0
    ? section('Familles les plus exposées',
        'Part de vos produits qu’au moins un concurrent vend moins cher. Familles de moins de 5 produits écartées : le ratio n’y veut rien dire.',
        table(['Famille', 'Produits', 'Sous-cotés'], famRows, ['l', 'r', 'r']))
    : ''}

  ${exRows.length > 0
    ? section('Exemples d’écarts',
        'Extraits de la liste détaillée, qui est PLAFONNÉE aux produits les plus sous-cotés : ces lignes illustrent, elles ne mesurent pas. Les chiffres ci-dessus, eux, portent sur le catalogue complet.',
        table(['Produit', 'Mon prix HT', 'Meilleur écart'], exRows, ['l', 'r', 'r']))
    : ''}

  <tr><td style="padding:26px 12px 8px;">
    <div style="font:400 11px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${MUTED};border-top:1px solid ${LINE};padding-top:12px;">
      Prix concurrents convertis en HT depuis le TTC affiché sur leurs sites. Vos tarifs sont des prix catalogue non remisés :
      l’indice mesure un positionnement, pas une marge nette.${report.truncated ? ` La liste détaillée est bornée à ${nf(report.products?.length ?? 0)} lignes sur ${nf(report.totalMatched ?? matched)} appariés — l’exhaustif est dans l’export.` : ''}
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`
}
