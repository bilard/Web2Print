// functions/src/workflow/nodes/analyticsReport.ts
// Jumeau SERVEUR du node « Rapport de fréquentation » (client : src/features/
// workflows/registry/analyticsReport.ts + analyticsReportNode.tsx). Génère le même
// HTML/CSS récapitulant le trafic du site, en headless (cron).
//
// ⚠️ SYNCHRO : les métriques (computeKpis/topBy/topSources/pageLabel) et les
// générateurs purs (buildHtml/buildEmailHtml + helpers) sont COPIÉS VERBATIM depuis
// le client (src/features/analytics/metrics.ts + registry/analyticsReport.ts). Toute
// évolution de l'onglet Analytics / du node client doit être répercutée ici.
//
// ⚠️ SÉCURITÉ : `analyticsEvents` est une collection GLOBALE owner-only (cf. règles
// Firestore). L'Admin SDK bypasse ces règles ; on GARDE donc l'exécution sur l'owner
// (`ctx.uid === getOwnerUid()`) — sinon n'importe quel utilisateur RBAC recevrait par
// cron le trafic de tout le site.
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { registerServerNode } from '../registry'
import { makeServerFile } from './serverFile'
import { getOwnerUid } from '../../email/ownerMailer'

// ───────────────────────────── Métriques (copie de src/features/analytics/metrics.ts) ──
type Area = 'promo' | 'docs' | 'app' | 'other'
type Device = 'mobile' | 'tablet' | 'desktop'

interface AnalyticsEvent {
  ts: number
  path: string
  area: Area
  ref: string | null
  src: string | null
  device: Device
  country: string | null
  vid: string
  sid: string
  uid: string | null
}

interface Kpis {
  pageViews: number
  visitors: number
  sessions: number
  avgSessionMs: number
  bounceRate: number
}

function computeKpis(events: AnalyticsEvent[]): Kpis {
  if (events.length === 0) return { pageViews: 0, visitors: 0, sessions: 0, avgSessionMs: 0, bounceRate: 0 }
  const visitors = new Set<string>()
  const sessions = new Map<string, { min: number; max: number; count: number }>()
  for (const e of events) {
    visitors.add(e.vid)
    const s = sessions.get(e.sid)
    if (!s) sessions.set(e.sid, { min: e.ts, max: e.ts, count: 1 })
    else {
      s.min = Math.min(s.min, e.ts)
      s.max = Math.max(s.max, e.ts)
      s.count++
    }
  }
  const sList = [...sessions.values()]
  const totalMs = sList.reduce((a, s) => a + (s.max - s.min), 0)
  const single = sList.filter((s) => s.count === 1).length
  return {
    pageViews: events.length,
    visitors: visitors.size,
    sessions: sessions.size,
    avgSessionMs: Math.round(totalMs / sessions.size),
    bounceRate: single / sessions.size,
  }
}

function topBy(events: AnalyticsEvent[], field: 'path' | 'src' | 'country' | 'device', limit: number): { label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const e of events) {
    const v = e[field]
    if (!v) continue
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, limit)
}

function topSources(events: AnalyticsEvent[], limit: number): { label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const e of events) {
    const s = e.src ?? e.ref
    if (!s) continue
    counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, limit)
}

function recentEvents(events: AnalyticsEvent[], limit: number): AnalyticsEvent[] {
  return [...events].sort((a, b) => b.ts - a.ts).slice(0, limit)
}

const KNOWN_PAGES: Record<string, string> = {
  '/promo': 'Promo', '/docs': 'Documentation', '/dashboard': 'Tableau de bord', '/login': 'Connexion', '/onboarding': 'Bienvenue',
}
const KNOWN_ANCHORS: Record<string, string> = {
  modules: 'Modules', scraper: 'Collecter', templates: 'Mapper', pim: 'Données', taxonomies: 'Classer',
  publipostage: 'Décliner', export: 'Publier', import: 'Importer', nouveau: 'Créer', editer: 'Éditer',
  bibliotheque: 'Organiser', imgen: 'Générer', animation: 'Animer', chat: 'Assister', dam: 'Médias',
  telegram: 'Piloter', workflows: 'Automatiser', settings: 'Paramétrer', roles: 'Gouverner',
  decouverte: 'Découverte', explorer: 'Explorer',
}
const pretty = (s: string): string => s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

function pageLabel(path: string): string {
  if (!path) return 'Accueil'
  const hashIdx = path.indexOf('#')
  if (hashIdx >= 0) {
    const anchor = path.slice(hashIdx + 1)
    if (!anchor) return 'Accueil'
    return KNOWN_ANCHORS[anchor] ?? pretty(anchor)
  }
  if (path === '/') return 'Accueil'
  const clean = path.replace(/\/+$/, '')
  if (KNOWN_PAGES[clean]) return KNOWN_PAGES[clean]
  const segs = clean.split('/').filter(Boolean)
  if (segs.length === 0) return 'Accueil'
  if (segs.length === 1) return pretty(segs[0])
  const head = KNOWN_PAGES['/' + segs[0]] ?? pretty(segs[0])
  return head + ' · ' + segs.slice(1).map(pretty).join(' · ')
}

/** Libellés FR des appareils (mêmes valeurs que le filtre Appareil de l'onglet Analytics). */
const DEVICE_LABEL: Record<string, string> = { desktop: 'Ordinateur', mobile: 'Mobile', tablet: 'Tablette' }

/** Navigation interne du propriétaire à exclure de « Activité récente » (copie de metrics.ts). */
function isInternalActivity(path: string): boolean {
  const label = pageLabel(path)
  return label === 'Tableau de bord' || label.startsWith('Workflows')
}

// ───────────────────────────── Rendu (copie de registry/analyticsReport.ts) ──
type AnalyticsPeriod = '7d' | '30d' | '90d' | '12m'
const DAY = 86_400_000
const SPAN: Record<AnalyticsPeriod, number> = { '7d': 7 * DAY, '30d': 30 * DAY, '90d': 90 * DAY, '12m': 365 * DAY }
const PERIOD_LABEL: Record<AnalyticsPeriod, string> = {
  '7d': '7 derniers jours', '30d': '30 derniers jours', '90d': '90 derniers jours', '12m': '12 derniers mois',
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function formatDuration(ms: number): string {
  return `${Math.round(ms / 1000)} s`
}
const formatNumber = (n: number): string => n.toLocaleString('fr-FR')

interface DaySeries { day: string; pageViews: number; visitors: number }

interface ReportInput {
  title: string
  periodLabel: string
  dateLabel: string
  kpis: Kpis
  series: DaySeries[]
  topPages: { label: string; count: number }[]
  topSources: { label: string; count: number }[]
  topCountries: { label: string; count: number }[]
  topDevices: { label: string; count: number }[]
  topUsers: { label: string; count: number }[]
  recent: { label: string; meta: string }[]
}

/** Dernières visites (page + appareil · pays · date/heure) — calque AnalyticsRecent. */
function buildRecent(events: AnalyticsEvent[], limit: number): { label: string; meta: string }[] {
  return recentEvents(events.filter((e) => !isInternalActivity(e.path)), limit).map((e) => ({
    label: pageLabel(e.path),
    meta: `${DEVICE_LABEL[e.device] ?? e.device} · ${e.country ?? '—'} · ${new Date(e.ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
  }))
}

function buildTopUsers(events: AnalyticsEvent[], usersMap: Map<string, string>, limit: number): { label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const e of events) {
    if (!e.uid) continue
    counts.set(e.uid, (counts.get(e.uid) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([uid, count]) => ({ label: usersMap.get(uid) ?? uid, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

function buildSeries(events: AnalyticsEvent[], fromMs: number, toMs: number): DaySeries[] {
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
  return [...buckets.entries()].map(([day, b]) => ({ day, pageViews: b.pageViews, visitors: b.vids.size }))
}

/** Palette d'accents — une teinte par carte KPI / panneau (égaye le rapport, thème sombre conservé). */
interface Accent { solid: string; faint: string }
const PALETTE: Accent[] = [
  { solid: '#818cf8', faint: 'rgba(99,102,241,.18)' },   // indigo
  { solid: '#34d399', faint: 'rgba(16,185,129,.16)' },   // émeraude
  { solid: '#fbbf24', faint: 'rgba(245,158,11,.16)' },   // ambre
  { solid: '#22d3ee', faint: 'rgba(6,182,212,.16)' },    // cyan
  { solid: '#f472b6', faint: 'rgba(236,72,153,.16)' },   // rose
]

function topListHtml(title: string, rows: { label: string; count: number }[], accent: Accent): string {
  const styleVars = `--accent:${accent.solid};--bar:${accent.faint}`
  if (rows.length === 0) {
    return `<div class="panel" style="${styleVars}"><div class="panel-h">${esc(title)}</div><div class="empty">—</div></div>`
  }
  const max = Math.max(...rows.map((r) => r.count), 1)
  const items = rows.map((r) => `
    <div class="row">
      <div class="bar" style="width:${Math.round((r.count / max) * 100)}%"></div>
      <span class="lbl">${esc(r.label)}</span>
      <span class="cnt">${formatNumber(r.count)}</span>
    </div>`).join('')
  return `<div class="panel" style="${styleVars}"><div class="panel-h">${esc(title)}</div>${items}</div>`
}

/** Panneau pleine largeur listant les dernières visites (accent violet). */
function recentListHtml(rows: { label: string; meta: string }[]): string {
  if (rows.length === 0) return ''
  const items = rows.map((r) => `
    <div class="rrow"><span class="rlbl">${esc(r.label)}</span><span class="rmeta">${esc(r.meta)}</span></div>`).join('')
  return `<div class="panel recent" style="--accent:#a78bfa"><div class="panel-h">Activité récente</div>${items}</div>`
}

function chartHtml(series: DaySeries[]): string {
  if (series.length === 0) return ''
  const max = Math.max(...series.map((s) => s.pageViews), 1)
  const bars = series.map((s) => {
    const h = s.pageViews > 0 ? Math.max(4, Math.round((s.pageViews / max) * 100)) : 0
    return `<div class="cbar" title="${s.day} · ${s.pageViews} vues / ${s.visitors} visiteurs"><div class="cbar-fill" style="height:${h}%"></div></div>`
  }).join('')
  const first = series[0]?.day ?? ''
  const last = series[series.length - 1]?.day ?? ''
  return `<div class="chart-wrap" style="--accent:#818cf8">
    <div class="panel-h">Évolution — pages vues par jour (max ${formatNumber(max)})</div>
    <div class="chart">${bars}</div>
    <div class="chart-axis"><span>${first}</span><span>${last}</span></div>
  </div>`
}

function buildHtml(d: ReportInput): string {
  const kpi = (h: string, v: string, foot: string, accent: string): string => `
    <div class="kpi" style="--accent:${accent}"><div class="kpi-h">${h}</div><div class="kpi-v">${v}</div><div class="kpi-foot">${foot}</div></div>`
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
  .kpi { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); border-top: 2px solid var(--accent,#818cf8); border-radius: 12px; padding: 12px 14px; }
  .kpi-h { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.32); }
  .kpi-v { font-size: 24px; font-weight: 600; color: var(--accent,#fff); margin-top: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .kpi-foot { font-size: 9.5px; color: rgba(255,255,255,.30); margin-top: 4px; }
  .chart-wrap { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); border-radius: 12px; padding: 14px; margin-bottom: 18px; }
  .chart { display: flex; align-items: flex-end; gap: 2px; height: 96px; margin-top: 10px; }
  .cbar { flex: 1; display: flex; align-items: flex-end; height: 100%; min-width: 2px; }
  .cbar-fill { width: 100%; background: linear-gradient(180deg, #818cf8, rgba(99,102,241,.45)); border-radius: 2px 2px 0 0; }
  .chart-axis { display: flex; justify-content: space-between; font-size: 9.5px; color: rgba(255,255,255,.30);
    margin-top: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .panel { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); border-radius: 12px; padding: 14px; }
  .panel-h { font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--accent,rgba(255,255,255,.42)); margin-bottom: 10px; }
  .row { position: relative; display: flex; align-items: center; padding: 7px 8px; border-radius: 7px; overflow: hidden; }
  .bar { position: absolute; left: 0; top: 0; bottom: 0; background: var(--bar,rgba(99,102,241,.18)); border-radius: 7px; }
  .lbl { position: relative; font-size: 12px; color: rgba(255,255,255,.82); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cnt { position: relative; font-size: 12px; color: var(--accent,rgba(255,255,255,.55)); margin-left: 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .recent { margin-top: 10px; }
  .rrow { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 7px 8px; border-bottom: 1px solid rgba(255,255,255,.05); }
  .rrow:last-child { border-bottom: none; }
  .rlbl { font-size: 12px; color: rgba(255,255,255,.82); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rmeta { font-size: 11px; color: rgba(255,255,255,.40); white-space: nowrap; flex: 0 0 auto;
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
      ${kpi('Pages vues', formatNumber(d.kpis.pageViews), 'sur la période', PALETTE[0].solid)}
      ${kpi('Visiteurs uniques', formatNumber(d.kpis.visitors), 'identifiants distincts', PALETTE[1].solid)}
      ${kpi('Sessions', formatNumber(d.kpis.sessions), `rebond ${Math.round(d.kpis.bounceRate * 100)} %`, PALETTE[2].solid)}
      ${kpi('Durée moy. session', formatDuration(d.kpis.avgSessionMs), 'par session', PALETTE[3].solid)}
    </div>
    ${chartHtml(d.series)}
    <div class="grid">
      ${topListHtml('Pages consultées', d.topPages, PALETTE[0])}
      ${topListHtml('Sources de trafic', d.topSources, PALETTE[1])}
      ${topListHtml('Pays', d.topCountries, PALETTE[2])}
      ${topListHtml('Appareils', d.topDevices, PALETTE[3])}
      ${topListHtml('Utilisateurs connectés', d.topUsers, PALETTE[4])}
    </div>
    ${recentListHtml(d.recent)}
    <footer>
      Données agrégées depuis Firestore — collection <code>analyticsEvents</code>. Trafic de l'ensemble du site (accès réservé au propriétaire).
    </footer>
  </div>
</body>
</html>`
}

const C = {
  bg: '#0b0b0f', panel: '#15151b', border: '#26262e', line: '#1c1c22',
  text: '#e8e8ea', dim: '#9a9aa2', faint: '#6a6a72', white: '#ffffff', bar: '#4f46e5',
} as const

/** Accents email (styles inline obligatoires : Gmail strippe <style> et var()). Calque sur PALETTE. */
const EMAIL_ACCENTS = ['#818cf8', '#34d399', '#fbbf24', '#22d3ee', '#f472b6'] as const

function emailTopList(title: string, rows: { label: string; count: number }[], accent: string): string {
  const body = rows.length === 0
    ? `<tr><td style="padding:6px 8px;font-size:12px;color:${C.faint};">—</td></tr>`
    : rows.map((r) => `<tr>
        <td style="padding:6px 8px;font-size:12px;color:${C.text};border-bottom:1px solid ${C.line};">${esc(r.label)}</td>
        <td align="right" style="padding:6px 8px;font-size:12px;color:${accent};border-bottom:1px solid ${C.line};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${formatNumber(r.count)}</td>
      </tr>`).join('')
  return `<td width="50%" valign="top" style="background:${C.panel};border:1px solid ${C.border};border-top:2px solid ${accent};border-radius:10px;padding:12px;">
    <div style="font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:${accent};margin-bottom:6px;">${esc(title)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${body}</table>
  </td>`
}

function emailRecentList(rows: { label: string; meta: string }[]): string {
  if (rows.length === 0) return ''
  const accent = '#a78bfa'
  const body = rows.map((r) => `<tr>
      <td style="padding:6px 8px;font-size:12px;color:${C.text};border-bottom:1px solid ${C.line};">${esc(r.label)}</td>
      <td align="right" style="padding:6px 8px;font-size:11px;color:${C.faint};border-bottom:1px solid ${C.line};white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${esc(r.meta)}</td>
    </tr>`).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:6px;margin-top:6px;"><tr>
    <td valign="top" style="background:${C.panel};border:1px solid ${C.border};border-top:2px solid ${accent};border-radius:10px;padding:12px;">
      <div style="font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:${accent};margin-bottom:6px;">Activité récente</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${body}</table>
    </td>
  </tr></table>`
}

function emailChartHtml(series: DaySeries[]): string {
  if (series.length === 0) return ''
  const max = Math.max(...series.map((s) => s.pageViews), 1)
  const H = 72
  const cells = series.map((s) => {
    const h = s.pageViews > 0 ? Math.max(3, Math.round((s.pageViews / max) * H)) : 1
    return `<td valign="bottom" style="padding:0 1px;"><div style="width:100%;height:${h}px;background:${s.pageViews > 0 ? '#818cf8' : C.line};font-size:1px;line-height:1px;">&nbsp;</div></td>`
  }).join('')
  return `<div style="background:${C.panel};border:1px solid ${C.border};border-radius:10px;padding:12px;margin-top:6px;">
    <div style="font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:${C.dim};margin-bottom:8px;">Évolution — pages vues par jour (max ${formatNumber(max)})</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;height:${H}px;"><tr>${cells}</tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;"><tr>
      <td align="left" style="font-size:9.5px;color:${C.faint};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${series[0]?.day ?? ''}</td>
      <td align="right" style="font-size:9.5px;color:${C.faint};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${series[series.length - 1]?.day ?? ''}</td>
    </tr></table>
  </div>`
}

function buildEmailHtml(d: ReportInput): string {
  const kpi = (head: string, value: string, foot: string, accent: string): string =>
    `<td width="25%" valign="top" style="background:${C.panel};border:1px solid ${C.border};border-top:2px solid ${accent};border-radius:10px;padding:12px 14px;">
      <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:${C.dim};">${head}</div>
      <div style="font-size:22px;font-weight:600;color:${accent};margin-top:5px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${value}</div>
      <div style="font-size:10px;color:${C.faint};margin-top:4px;">${foot}</div>
    </td>`
  return `<div style="background:${C.bg};color:${C.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:24px;border-radius:14px;max-width:720px;margin:0 auto;">
    <div style="font-size:20px;font-weight:600;color:${C.white};margin-bottom:3px;">${esc(d.title)}</div>
    <div style="font-size:11px;color:${C.dim};margin-bottom:16px;">${esc(d.periodLabel)} · généré le ${d.dateLabel}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:6px;">
      <tr>
        ${kpi('Pages vues', formatNumber(d.kpis.pageViews), 'sur la période', EMAIL_ACCENTS[0])}
        ${kpi('Visiteurs uniques', formatNumber(d.kpis.visitors), 'distincts', EMAIL_ACCENTS[1])}
        ${kpi('Sessions', formatNumber(d.kpis.sessions), `rebond ${Math.round(d.kpis.bounceRate * 100)} %`, EMAIL_ACCENTS[2])}
        ${kpi('Durée moy.', formatDuration(d.kpis.avgSessionMs), 'par session', EMAIL_ACCENTS[3])}
      </tr>
    </table>
    ${emailChartHtml(d.series)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:6px;margin-top:6px;">
      <tr>
        ${emailTopList('Pages consultées', d.topPages, EMAIL_ACCENTS[0])}
        ${emailTopList('Sources de trafic', d.topSources, EMAIL_ACCENTS[1])}
      </tr>
      <tr>
        ${emailTopList('Pays', d.topCountries, EMAIL_ACCENTS[2])}
        ${emailTopList('Appareils', d.topDevices, EMAIL_ACCENTS[3])}
      </tr>
      <tr>
        ${emailTopList('Utilisateurs connectés', d.topUsers, EMAIL_ACCENTS[4])}
        <td width="50%"></td>
      </tr>
    </table>
    ${emailRecentList(d.recent)}
    <div style="font-size:9.5px;color:${C.faint};margin-top:18px;line-height:1.6;">
      Données agrégées depuis Firestore (collection analyticsEvents). Trafic de l'ensemble du site.
    </div>
  </div>`
}

// ───────────────────────────── Collecte headless ─────────────────────────────
async function collectAnalyticsReportServer(period: AnalyticsPeriod, title: string): Promise<{
  html: string; emailHtml: string; summaryRows: Record<string, unknown>[]; kpis: Kpis
}> {
  const db = getFirestore()
  const toMs = Date.now()
  const fromMs = toMs - SPAN[period]

  const [snap, usersSnap] = await Promise.all([
    db.collection('analyticsEvents')
      .where('ts', '>=', Timestamp.fromMillis(fromMs))
      .where('ts', '<=', Timestamp.fromMillis(toMs))
      .orderBy('ts', 'asc')
      .get(),
    db.collection('users').get().catch(() => null),
  ])
  const usersMap = new Map<string, string>()
  for (const u of usersSnap?.docs ?? []) {
    const x = u.data()
    usersMap.set(u.id, (x.displayName as string) || (x.email as string) || u.id)
  }

  const events: AnalyticsEvent[] = snap.docs.map((s) => {
    const d = s.data()
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
  })

  const now = new Date()
  const input: ReportInput = {
    title: title.trim() || 'Statistiques de fréquentation',
    periodLabel: PERIOD_LABEL[period],
    dateLabel: now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
    kpis: computeKpis(events),
    series: buildSeries(events, fromMs, toMs),
    topPages: topBy(events, 'path', 8).map((p) => ({ label: pageLabel(p.label), count: p.count })),
    topSources: topSources(events, 8),
    topCountries: topBy(events, 'country', 8),
    topDevices: topBy(events, 'device', 8).map((dev) => ({ label: DEVICE_LABEL[dev.label] ?? dev.label, count: dev.count })),
    topUsers: buildTopUsers(events, usersMap, 8),
    recent: buildRecent(events, 12),
  }

  const summaryRows: Record<string, unknown>[] = input.series.map((s) => ({
    Jour: s.day, 'Pages vues': s.pageViews, Visiteurs: s.visitors,
  }))

  return { html: buildHtml(input), emailHtml: buildEmailHtml(input), summaryRows, kpis: input.kpis }
}

// ───────────────────────────── Enregistrement node serveur ───────────────────────
function isPeriod(v: unknown): v is AnalyticsPeriod {
  return v === '7d' || v === '30d' || v === '90d' || v === '12m'
}

registerServerNode({
  type: 'analytics-report',
  run: async (ctx, config) => {
    // Garde owner : la collection est globale, l'Admin SDK bypasse les règles.
    const ownerUid = await getOwnerUid()
    if (ctx.uid !== ownerUid) {
      throw new Error('Rapport de fréquentation réservé au propriétaire du site (trafic global).')
    }

    const period: AnalyticsPeriod = isPeriod(config.period) ? config.period : '30d'
    const title = String(config.title ?? '')
    ctx.log('info', `Agrégation du trafic (${PERIOD_LABEL[period]}, headless)…`)
    const report = await collectAnalyticsReportServer(period, title)

    const day = new Date().toISOString().slice(0, 10)
    const rawName = String(config.fileName ?? '').trim() || `rapport-trafic-${day}.html`
    const fileName = rawName.toLowerCase().endsWith('.html') ? rawName : `${rawName}.html`
    const file = makeServerFile(fileName, 'text/html;charset=utf-8', report.html)

    const columns = report.summaryRows.length > 0
      ? Object.keys(report.summaryRows[0]).map((k) => ({ key: k, label: k }))
      : []

    ctx.log(
      'info',
      `Rapport généré : ${report.kpis.pageViews} pages vues · ${report.kpis.visitors} visiteurs · ${report.kpis.sessions} sessions.`,
    )
    return { html: report.emailHtml, file, summary: { columns, rows: report.summaryRows } }
  },
})
