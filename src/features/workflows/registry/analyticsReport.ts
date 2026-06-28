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
  computeKpis, topBy, topSources, pageLabel, recentEvents, isInternalActivity,
  moduleGroupOf, MODULE_GROUP_ORDER,
  type AnalyticsEvent, type Kpis,
} from '@/features/analytics/metrics'
import { listUsers } from '@/features/access/usersApi'

export type AnalyticsPeriod = '7d' | '30d' | '90d' | '12m'

const DAY = 86_400_000
const SPAN: Record<AnalyticsPeriod, number> = {
  '7d': 7 * DAY, '30d': 30 * DAY, '90d': 90 * DAY, '12m': 365 * DAY,
}

export const PERIOD_LABEL: Record<AnalyticsPeriod, string> = {
  '7d': '7 derniers jours', '30d': '30 derniers jours', '90d': '90 derniers jours', '12m': '12 derniers mois',
}

/** Libellés FR des appareils (mêmes valeurs que le filtre Appareil de l'onglet Analytics). */
const DEVICE_LABEL: Record<string, string> = { desktop: 'Ordinateur', mobile: 'Mobile', tablet: 'Tablette' }

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

interface DaySeries { day: string; pageViews: number; visitors: number }

export interface AnalyticsReportData {
  /** Document autonome riche (cartes KPI, listes, courbe) — archive Drive / navigateur. */
  html: string
  /** Variante email-safe (tables + styles inline) — corps de mail (Gmail strippe grid/flex/<style>). */
  emailHtml: string
  /** Lignes plates (1 par jour : date, pages vues, visiteurs) pour brancher vers Sheets. */
  summaryRows: Record<string, unknown>[]
  kpis: Kpis
  eventCount: number
}

export interface ReportInput {
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
  recent: RecentRow[]
}

/** Ligne d'activité récente : libellé + méta affichable + groupe de modules + appareil (pour filtrer/grouper). */
interface RecentRow { label: string; meta: string; group: string; device: string }

/** Dernières visites (page + appareil · pays · date/heure), regroupées par module — calque AnalyticsRecent. */
function buildRecent(events: AnalyticsEvent[], limit: number): RecentRow[] {
  return recentEvents(events.filter((e) => !isInternalActivity(e.path)), limit).map((e) => ({
    label: pageLabel(e.path),
    meta: `${DEVICE_LABEL[e.device] ?? e.device} · ${e.country ?? '—'} · ${new Date(e.ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
    group: moduleGroupOf(e.path),
    device: e.device,
  }))
}

/** Utilisateurs connectés (events avec uid) classés par pages vues — calque AnalyticsUsers. */
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

/** Série quotidienne (pages vues + visiteurs uniques) entre deux bornes. */
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

/** Construit l'entrée de rendu (KPIs + courbe + top listes) à partir des events bruts. */
function buildReportInput(events: AnalyticsEvent[], title: string, period: AnalyticsPeriod, fromMs: number, toMs: number, usersMap: Map<string, string>): ReportInput {
  const now = new Date()
  return {
    title: title.trim() || 'Statistiques de fréquentation',
    periodLabel: PERIOD_LABEL[period],
    dateLabel: now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
    kpis: computeKpis(events),
    series: buildSeries(events, fromMs, toMs),
    topPages: topBy(events, 'path', 8).map((p) => ({ label: pageLabel(p.label), count: p.count })),
    topSources: topSources(events, 8),
    topCountries: topBy(events, 'country', 8),
    topDevices: topBy(events, 'device', 8).map((d) => ({ label: DEVICE_LABEL[d.label] ?? d.label, count: d.count })),
    topUsers: buildTopUsers(events, usersMap, 8),
    recent: buildRecent(events, 100),
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
  const [events, users] = await Promise.all([
    fetchEvents(fromMs, toMs),
    listUsers().catch(() => []),
  ])
  const usersMap = new Map(users.map((u) => [u.uid, u.displayName || u.email || u.uid]))

  const input = buildReportInput(events, opts.title ?? '', period, fromMs, toMs, usersMap)
  const html = buildHtml(input)
  const emailHtml = buildEmailHtml(input)

  // Résumé : 1 ligne par jour (le plus utile pour un export Sheets / graphe).
  const summaryRows: Record<string, unknown>[] = input.series.map((s) => ({
    Jour: s.day, 'Pages vues': s.pageViews, Visiteurs: s.visitors,
  }))

  return { html, emailHtml, summaryRows, kpis: input.kpis, eventCount: events.length }
}

// ───────────────────────────── Rendu HTML riche (Drive / navigateur) ─────────────────────────────
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

/**
 * Panneau pleine largeur des dernières visites, AVEC filtres (recherche/catégorie/
 * appareil) + pagination pilotés par un `<script>` autonome. Le JS ne s'exécute que
 * si le fichier est ouvert dans un navigateur (pas l'aperçu Drive, pas le corps de
 * mail) ; sans JS, dégradation propre via CSS : liste des 12 premières, contrôles masqués.
 */
function recentListHtml(rows: RecentRow[]): string {
  if (rows.length === 0) return ''
  const groups = MODULE_GROUP_ORDER.filter((g) => rows.some((r) => r.group === g))
  const devices = [...new Set(rows.map((r) => r.device))]
  const grpOpts = groups.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('')
  const devOpts = devices.map((d) => `<option value="${esc(d)}">${esc(DEVICE_LABEL[d] ?? d)}</option>`).join('')
  const items = rows.map((r) => `
      <div class="rrow" data-label="${esc(r.label.toLowerCase())}" data-group="${esc(r.group)}" data-device="${esc(r.device)}"><span class="rlbl">${esc(r.label)}</span><span class="rmeta">${esc(r.meta)}</span></div>`).join('')
  return `<div class="panel recent" id="recent" style="--accent:#a78bfa">
    <div class="recent-top">
      <div class="panel-h">Activité récente <span class="rcount" id="rcount"></span></div>
      <div class="rpager"><button type="button" id="rprev" class="rbtn">‹</button><span id="rpage" class="rpageinfo"></span><button type="button" id="rnext" class="rbtn">›</button></div>
    </div>
    <div class="rfilters">
      <input id="rsearch" class="rinput" type="search" placeholder="Rechercher une page…">
      <select id="rgroup" class="rsel"><option value="all">Tous les groupes</option>${grpOpts}</select>
      <select id="rdevice" class="rsel"><option value="all">Tous appareils</option>${devOpts}</select>
    </div>
    <div class="rlist" id="rlist">${items}</div>
    ${recentScript()}
  </div>`
}

/** IIFE vanilla : filtre (recherche + catégorie + appareil) et pagine la liste (12/page). */
function recentScript(): string {
  return `<script>(function(){
    var PS=12, page=0;
    var list=document.getElementById('rlist');
    if(!list) return;
    var rows=[].slice.call(list.querySelectorAll('.rrow'));
    var search=document.getElementById('rsearch'), groupSel=document.getElementById('rgroup'), devSel=document.getElementById('rdevice');
    var prev=document.getElementById('rprev'), next=document.getElementById('rnext');
    var pageInfo=document.getElementById('rpage'), count=document.getElementById('rcount'), pager=document.querySelector('#recent .rpager');
    var filters=document.querySelector('#recent .rfilters');
    if(filters) filters.style.display='flex';
    function match(r){
      var q=search.value.trim().toLowerCase();
      if(q && r.getAttribute('data-label').indexOf(q)<0) return false;
      if(groupSel.value!=='all' && r.getAttribute('data-group')!==groupSel.value) return false;
      if(devSel.value!=='all' && r.getAttribute('data-device')!==devSel.value) return false;
      return true;
    }
    function render(){
      var vis=rows.filter(match);
      var pc=Math.max(1, Math.ceil(vis.length/PS));
      if(page>pc-1) page=pc-1; if(page<0) page=0;
      rows.forEach(function(r){ r.style.display='none'; });
      vis.slice(page*PS, page*PS+PS).forEach(function(r){ r.style.display='flex'; });
      count.textContent=vis.length.toLocaleString('fr-FR')+' événements';
      pageInfo.textContent=(page+1)+' / '+pc;
      prev.disabled=page<=0; next.disabled=page>=pc-1;
      if(pager) pager.style.display = pc>1 ? 'flex' : 'none';
    }
    function reset(){ page=0; render(); }
    search.addEventListener('input', reset);
    groupSel.addEventListener('change', reset);
    devSel.addEventListener('change', reset);
    prev.addEventListener('click', function(){ page--; render(); });
    next.addEventListener('click', function(){ page++; render(); });
    render();
  })();</script>`
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

export function buildHtml(d: ReportInput): string {
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
  .recent-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .rcount { color: rgba(255,255,255,.30); text-transform: none; letter-spacing: 0; font-weight: 400; margin-left: 6px; }
  .rpager { display: none; align-items: center; gap: 8px; margin-bottom: 10px; }
  .rbtn { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.10); color: rgba(255,255,255,.70);
    width: 22px; height: 22px; border-radius: 6px; cursor: pointer; font-size: 14px; line-height: 1; padding: 0; }
  .rbtn:hover { background: rgba(255,255,255,.09); color: #fff; }
  .rbtn:disabled { opacity: .3; cursor: default; }
  .rpageinfo { font-size: 11px; color: rgba(255,255,255,.45); font-variant-numeric: tabular-nums; min-width: 34px; text-align: center; }
  .rfilters { display: none; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
  .rinput, .rsel { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.10); color: rgba(255,255,255,.82);
    border-radius: 6px; padding: 4px 8px; font-size: 12px; font-family: inherit; }
  .rinput { min-width: 180px; }
  .rrow { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 7px 8px; border-bottom: 1px solid rgba(255,255,255,.05); }
  .rrow:last-child { border-bottom: none; }
  /* Sans JS (aperçu Drive) : n'afficher que les 12 premières lignes. */
  .rlist .rrow:nth-child(n+13) { display: none; }
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

// ───────────────────────────── Rendu EMAIL (corps de mail, styles inline) ─────────────────────────────
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

/**
 * Panneau « Activité récente » email-safe : Gmail n'exécute ni JS ni `<style>`, donc
 * pas de filtres/pagination cliquables. On rend un équivalent STATIQUE : l'activité
 * regroupée par GROUPE DE MODULES (sections = « filtre » figé), 8 lignes max par section.
 */
function emailRecentList(rows: RecentRow[]): string {
  if (rows.length === 0) return ''
  const accent = '#a78bfa'
  const sections = MODULE_GROUP_ORDER.map((group) => {
    const rs = rows.filter((r) => r.group === group).slice(0, 8)
    if (rs.length === 0) return ''
    const body = rs.map((r) => `<tr>
        <td style="padding:6px 8px;font-size:12px;color:${C.text};border-bottom:1px solid ${C.line};">${esc(r.label)}</td>
        <td align="right" style="padding:6px 8px;font-size:11px;color:${C.faint};border-bottom:1px solid ${C.line};white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${esc(r.meta)}</td>
      </tr>`).join('')
    return `<div style="font-size:9px;letter-spacing:.05em;text-transform:uppercase;color:${accent};margin:12px 0 4px;opacity:.85;">${esc(group)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${body}</table>`
  }).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:6px;margin-top:6px;"><tr>
    <td valign="top" style="background:${C.panel};border:1px solid ${C.border};border-top:2px solid ${accent};border-radius:10px;padding:12px;">
      <div style="font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:${accent};margin-bottom:2px;">Activité récente</div>
      ${sections}
    </td>
  </tr></table>`
}

/** Courbe email-safe : table de barres verticales (td valign=bottom + div à hauteur fixe). */
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

export function buildEmailHtml(d: ReportInput): string {
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
