// src/features/workflows/registry/analyticsReport.ts
// Collecte le trafic du site (collection `analyticsEvents`, owner-only) sur une
// période donnée et le rend en HTML/CSS autonome — destiné à être stocké sur Drive
// ou envoyé par mail (rapport de fréquentation). Mêmes métriques que l'onglet
// Analytics (computeKpis / topBy / topSources / pageLabel). Un jumeau serveur
// (functions/src/workflow/nodes/analyticsReport.ts) duplique le rendu pour le cron ;
// à garder synchronisé.
import { collection, getDocs, query, where, orderBy, Timestamp, type DocumentData } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import {
  computeKpis, topBy, topSources, pageLabel,
  type AnalyticsEvent, type Kpis,
} from '@/features/analytics/metrics'

export type AnalyticsPeriod = '7d' | '30d' | '90d' | '12m'

const DAY = 86_400_000
const SPAN: Record<AnalyticsPeriod, number> = {
  '7d': 7 * DAY, '30d': 30 * DAY, '90d': 90 * DAY, '12m': 365 * DAY,
}

export const PERIOD_LABEL: Record<AnalyticsPeriod, string> = {
  '7d': '7 derniers jours', '30d': '30 derniers jours', '90d': '90 derniers jours', '12m': '12 derniers mois',
}

function mapDoc(d: DocumentData): AnalyticsEvent {
  return {
    ts: (d.ts as Timestamp | undefined)?.toMillis() ?? 0,
    path: d.path ?? '/',
    area: d.area ?? 'other',
    ref: d.ref ?? null,
    src: d.src ?? null,
    device: d.device ?? 'desktop',
    country: d.country ?? null,
    vid: d.vid ?? '',
    sid: d.sid ?? '',
    uid: d.uid ?? null,
  }
}

/** Lit `analyticsEvents` entre deux timestamps (mêmes filtres que `useAnalyticsEvents`). */
async function fetchEvents(fromMs: number, toMs: number): Promise<AnalyticsEvent[]> {
  const snap = await getDocs(
    query(
      collection(db, 'analyticsEvents'),
      where('ts', '>=', Timestamp.fromMillis(fromMs)),
      where('ts', '<=', Timestamp.fromMillis(toMs)),
      orderBy('ts', 'asc'),
    ),
  )
  return snap.docs.map((s) => mapDoc(s.data()))
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Durée de session en secondes — même format que l'onglet Analytics (« 171 s »). */
export function formatDuration(ms: number): string {
  return `${Math.round(ms / 1000)} s`
}

export function formatNumber(n: number): string {
  return n.toLocaleString('fr-FR')
}

export interface AnalyticsReportData {
  /** Document autonome riche (cartes KPI, listes) — archive Drive / navigateur. */
  html: string
  /** Variante email-safe (tables + styles inline) — corps de mail (Gmail strippe grid/flex/<style>). */
  emailHtml: string
  /** Lignes plates (1 par jour : date, pages vues, visiteurs) pour brancher vers Sheets. */
  summaryRows: Record<string, unknown>[]
  kpis: Kpis
  eventCount: number
}

interface ReportInput {
  title: string
  periodLabel: string
  dateLabel: string
  kpis: Kpis
  topPages: { label: string; count: number }[]
  topSources: { label: string; count: number }[]
  topCountries: { label: string; count: number }[]
}

/** Construit l'entrée de rendu (KPIs + top listes) à partir des events bruts. */
function buildReportInput(events: AnalyticsEvent[], title: string, period: AnalyticsPeriod): ReportInput {
  const now = new Date()
  const topPagesRaw = topBy(events, 'path', 8)
  return {
    title: title.trim() || 'Statistiques de fréquentation',
    periodLabel: PERIOD_LABEL[period],
    dateLabel: now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
    kpis: computeKpis(events),
    topPages: topPagesRaw.map((p) => ({ label: pageLabel(p.label), count: p.count })),
    topSources: topSources(events, 8),
    topCountries: topBy(events, 'country', 8),
  }
}

/** Lit Firestore, agrège et assemble le HTML autonome + email + résumé plat. */
export async function collectAnalyticsReport(opts: {
  period?: AnalyticsPeriod
  title?: string
}): Promise<AnalyticsReportData> {
  const period = opts.period ?? '30d'
  const toMs = Date.now()
  const fromMs = toMs - SPAN[period]
  const events = await fetchEvents(fromMs, toMs)

  const input = buildReportInput(events, opts.title ?? '', period)
  const html = buildHtml(input)
  const emailHtml = buildEmailHtml(input)

  // Résumé : 1 ligne par jour (le plus utile pour un export Sheets / graphe).
  const buckets = new Map<string, { pageViews: number; vids: Set<string> }>()
  for (let t = fromMs; t <= toMs; t += DAY) {
    buckets.set(new Date(t).toISOString().slice(0, 10), { pageViews: 0, vids: new Set() })
  }
  for (const e of events) {
    const b = buckets.get(new Date(e.ts).toISOString().slice(0, 10))
    if (!b) continue
    b.pageViews++
    b.vids.add(e.vid)
  }
  const summaryRows: Record<string, unknown>[] = [...buckets.entries()].map(([day, b]) => ({
    Jour: day, 'Pages vues': b.pageViews, Visiteurs: b.vids.size,
  }))

  return { html, emailHtml, summaryRows, kpis: input.kpis, eventCount: events.length }
}

// ───────────────────────────── Rendu HTML riche (Drive / navigateur) ─────────────────────────────
function topListHtml(title: string, rows: { label: string; count: number }[]): string {
  if (rows.length === 0) {
    return `<div class="panel"><div class="panel-h">${esc(title)}</div><div class="empty">—</div></div>`
  }
  const max = Math.max(...rows.map((r) => r.count), 1)
  const items = rows.map((r) => `
    <div class="row">
      <div class="bar" style="width:${Math.round((r.count / max) * 100)}%"></div>
      <span class="lbl">${esc(r.label)}</span>
      <span class="cnt">${formatNumber(r.count)}</span>
    </div>`).join('')
  return `<div class="panel"><div class="panel-h">${esc(title)}</div>${items}</div>`
}

export function buildHtml(d: ReportInput): string {
  const kpi = (h: string, v: string, foot: string): string => `
    <div class="kpi"><div class="kpi-h">${h}</div><div class="kpi-v">${v}</div><div class="kpi-foot">${foot}</div></div>`
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.title)} — ${esc(d.periodLabel)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0b0b0f; color: #e8e8ea;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased; padding: 28px 18px; }
  .wrap { max-width: 1120px; margin: 0 auto; background: rgba(255,255,255,.02);
    border: 1px solid rgba(255,255,255,.10); border-radius: 18px; padding: 24px; }
  header { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 18px; }
  .spark { width: 22px; height: 22px; flex: 0 0 auto; color: #818cf8; }
  h1 { font-size: 17px; font-weight: 600; margin: 0; color: #fff; }
  .sub { font-size: 11px; color: rgba(255,255,255,.32); margin-top: 3px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
  .kpi { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); border-radius: 12px; padding: 12px 14px; }
  .kpi-h { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.32); }
  .kpi-v { font-size: 24px; font-weight: 600; color: #fff; margin-top: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .kpi-foot { font-size: 9.5px; color: rgba(255,255,255,.30); margin-top: 4px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .panel { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); border-radius: 12px; padding: 14px; }
  .panel-h { font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.32); margin-bottom: 10px; }
  .row { position: relative; display: flex; align-items: center; padding: 7px 8px; border-radius: 7px; overflow: hidden; }
  .bar { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(99,102,241,.18); border-radius: 7px; }
  .lbl { position: relative; font-size: 12px; color: rgba(255,255,255,.82); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cnt { position: relative; font-size: 12px; color: rgba(255,255,255,.55); margin-left: 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .empty { font-size: 12px; color: rgba(255,255,255,.25); padding: 7px 8px; }
  footer { font-size: 9.5px; color: rgba(255,255,255,.25); line-height: 1.6; margin-top: 18px; }
  footer code { color: rgba(255,255,255,.40); }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <svg class="spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
      <div>
        <h1>${esc(d.title)}</h1>
        <div class="sub">${esc(d.periodLabel)} · généré le ${d.dateLabel}</div>
      </div>
    </header>
    <div class="kpis">
      ${kpi('Pages vues', formatNumber(d.kpis.pageViews), 'sur la période')}
      ${kpi('Visiteurs uniques', formatNumber(d.kpis.visitors), 'identifiants distincts')}
      ${kpi('Sessions', formatNumber(d.kpis.sessions), `rebond ${Math.round(d.kpis.bounceRate * 100)} %`)}
      ${kpi('Durée moy. session', formatDuration(d.kpis.avgSessionMs), 'par session')}
    </div>
    <div class="grid">
      ${topListHtml('Pages consultées', d.topPages)}
      ${topListHtml('Sources de trafic', d.topSources)}
      ${topListHtml('Pays', d.topCountries)}
    </div>
    <footer>
      Données agrégées depuis Firestore — collection <code>analyticsEvents</code>. Trafic de l'ensemble du site (accès réservé au propriétaire).
    </footer>
  </div>
</body>
</html>`
}

// ───────────────────────────── Rendu EMAIL (corps de mail, styles inline) ─────────────────────────────
const C = {
  bg: '#0b0b0f', panel: '#15151b', border: '#26262e', line: '#1c1c22',
  text: '#e8e8ea', dim: '#9a9aa2', faint: '#6a6a72', white: '#ffffff',
} as const

function emailTopList(title: string, rows: { label: string; count: number }[]): string {
  const body = rows.length === 0
    ? `<tr><td style="padding:6px 8px;font-size:12px;color:${C.faint};">—</td></tr>`
    : rows.map((r) => `<tr>
        <td style="padding:6px 8px;font-size:12px;color:${C.text};border-bottom:1px solid ${C.line};">${esc(r.label)}</td>
        <td align="right" style="padding:6px 8px;font-size:12px;color:${C.dim};border-bottom:1px solid ${C.line};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${formatNumber(r.count)}</td>
      </tr>`).join('')
  return `<td width="33%" valign="top" style="background:${C.panel};border:1px solid ${C.border};border-radius:10px;padding:12px;">
    <div style="font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:${C.dim};margin-bottom:6px;">${esc(title)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${body}</table>
  </td>`
}

export function buildEmailHtml(d: ReportInput): string {
  const kpi = (head: string, value: string, foot: string): string =>
    `<td width="25%" valign="top" style="background:${C.panel};border:1px solid ${C.border};border-radius:10px;padding:12px 14px;">
      <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:${C.dim};">${head}</div>
      <div style="font-size:22px;font-weight:600;color:${C.white};margin-top:5px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${value}</div>
      <div style="font-size:10px;color:${C.faint};margin-top:4px;">${foot}</div>
    </td>`
  return `<div style="background:${C.bg};color:${C.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:24px;border-radius:14px;max-width:720px;margin:0 auto;">
    <div style="font-size:20px;font-weight:600;color:${C.white};margin-bottom:3px;">${esc(d.title)}</div>
    <div style="font-size:11px;color:${C.dim};margin-bottom:16px;">${esc(d.periodLabel)} · généré le ${d.dateLabel}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:6px;">
      <tr>
        ${kpi('Pages vues', formatNumber(d.kpis.pageViews), 'sur la période')}
        ${kpi('Visiteurs uniques', formatNumber(d.kpis.visitors), 'distincts')}
        ${kpi('Sessions', formatNumber(d.kpis.sessions), `rebond ${Math.round(d.kpis.bounceRate * 100)} %`)}
        ${kpi('Durée moy.', formatDuration(d.kpis.avgSessionMs), 'par session')}
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:6px;margin-top:6px;">
      <tr>
        ${emailTopList('Pages consultées', d.topPages)}
        ${emailTopList('Sources de trafic', d.topSources)}
        ${emailTopList('Pays', d.topCountries)}
      </tr>
    </table>
    <div style="font-size:9.5px;color:${C.faint};margin-top:18px;line-height:1.6;">
      Données agrégées depuis Firestore (collection analyticsEvents). Trafic de l'ensemble du site.
    </div>
  </div>`
}
