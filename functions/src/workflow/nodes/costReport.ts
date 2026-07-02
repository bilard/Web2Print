// functions/src/workflow/nodes/costReport.ts
// Jumeau SERVEUR du node « Rapport de coûts IA » (client : src/features/workflows/
// registry/costReport.ts + costReportNode.tsx). Génère le même HTML/CSS autonome
// récapitulant la consommation IA & scraping du mois, en headless (cron).
//
// ⚠️ SYNCHRO : les générateurs purs (AI_MODELS, buildCostRows, buildHtml,
// buildEmailHtml + helpers) sont COPIÉS VERBATIM depuis le client. Toute évolution
// du panneau / du node client doit être répercutée ici (et inversement). NE PAS
// re-dériver à la main (la logique du split Gemini texte/image est la zone à risque).
//
// Différences assumées côté serveur (best-effort, comme le fallback client) :
//   - soldes providers (DeepSeek/OpenRouter) : omis ({}) — clés API non lues ici.
//   - compte Bright Data live : omis (null) — secret BD non lié au scheduler → repli
//     sur le compteur Firestore brightDataUsage (exactement le `.catch()` du client).
import { getFirestore } from 'firebase-admin/firestore'
import { registerServerNode } from '../registry'
import { makeServerFile } from './serverFile'
import { fetchBrightDataAccountStats } from '../../scraper/brightDataAccount'

// ───────────────────────────── Catalogue modèles (copie de src/lib/aiModels.ts) ──
type AiProvider = 'claude' | 'gemini' | 'openai' | 'deepseek' | 'qwen' | 'kimi' | 'openrouter'
interface AiModelInfo {
  id: string
  label: string
  pricing: { input: number; output: number }
  isDefault?: boolean
}
const AI_MODELS: Record<AiProvider, AiModelInfo[]> = {
  claude: [
    { id: 'claude-opus-4-8',   label: 'Claude Opus 4.8',   pricing: { input: 15,   output: 75 }, isDefault: true },
    { id: 'claude-opus-4-7',   label: 'Claude Opus 4.7',   pricing: { input: 15,   output: 75 } },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', pricing: { input: 3,    output: 15 } },
    { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5',  pricing: { input: 0.80, output: 4 } },
  ],
  gemini: [
    { id: 'gemini-3.5-flash',               label: 'Gemini 3.5 Flash',                pricing: { input: 1.50,  output: 9 },    isDefault: true },
    { id: 'gemini-3.1-pro-preview',         label: 'Gemini 3.1 Pro Preview',          pricing: { input: 1.25,  output: 10 } },
    { id: 'gemini-3.1-flash',               label: 'Gemini 3.1 Flash',                pricing: { input: 0.30,  output: 2.50 } },
    { id: 'gemini-2.5-flash',               label: 'Gemini 2.5 Flash',                pricing: { input: 0.30,  output: 2.50 } },
    { id: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image (NB2)',    pricing: { input: 0.30,  output: 30 } },
  ],
  openai: [
    { id: 'gpt-5.6-sol',   label: 'GPT-5.6 Sol',   pricing: { input: 5,    output: 30 } },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', pricing: { input: 2.50, output: 15 } },
    { id: 'gpt-5.6-luna',  label: 'GPT-5.6 Luna',  pricing: { input: 1,    output: 6 } },
    { id: 'gpt-5.5-pro', label: 'GPT-5.5 Pro', pricing: { input: 30,   output: 180 } },
    { id: 'gpt-5.5',     label: 'GPT-5.5',     pricing: { input: 5,    output: 30 } },
    { id: 'gpt-5.4',     label: 'GPT-5.4',     pricing: { input: 2.50, output: 15 } },
    { id: 'gpt-5.1',     label: 'GPT-5.1',     pricing: { input: 1.25, output: 10 }, isDefault: true },
    { id: 'gpt-5-mini',  label: 'GPT-5 Mini',  pricing: { input: 0.25, output: 2 } },
    { id: 'gpt-5-nano',  label: 'GPT-5 Nano',  pricing: { input: 0.05, output: 0.40 } },
    { id: 'o3',          label: 'o3',          pricing: { input: 2,    output: 8 } },
    { id: 'o4-mini',     label: 'o4 Mini',     pricing: { input: 1.10, output: 4.40 } },
  ],
  deepseek: [
    { id: 'deepseek-chat',      label: 'DeepSeek Chat (V4)', pricing: { input: 0.27, output: 1.10 }, isDefault: true },
    { id: 'deepseek-reasoner',  label: 'DeepSeek Reasoner',  pricing: { input: 0.55, output: 2.19 } },
  ],
  qwen: [
    { id: 'qwen3.7-max',     label: 'Qwen 3.7 Max',        pricing: { input: 1.60, output: 6.40 }, isDefault: true },
    { id: 'qwen3-max',       label: 'Qwen3 Max',           pricing: { input: 1.20, output: 6 } },
    { id: 'qwen3-coder',     label: 'Qwen3 Coder',         pricing: { input: 0.30, output: 1.20 } },
    { id: 'qwen3-235b-a22b', label: 'Qwen3 235B Instruct', pricing: { input: 0.07, output: 0.30 } },
    { id: 'qwen-flash',      label: 'Qwen Flash',          pricing: { input: 0.05, output: 0.20 } },
  ],
  kimi: [
    { id: 'kimi-k2.6',        label: 'Kimi K2.6',        pricing: { input: 0.75, output: 3.50 }, isDefault: true },
    { id: 'kimi-k2-thinking', label: 'Kimi K2 Thinking', pricing: { input: 0.60, output: 2.50 } },
    { id: 'kimi-for-coding',  label: 'Kimi for Coding',  pricing: { input: 0,    output: 0 } },
  ],
  openrouter: [
    { id: 'openrouter/auto', label: 'OpenRouter Auto (routing)', pricing: { input: 0, output: 0 }, isDefault: true },
  ],
}
function getDefaultModel(provider: AiProvider): AiModelInfo {
  return AI_MODELS[provider].find((m) => m.isDefault) ?? AI_MODELS[provider][0]
}
/** Fallback de buildCostRows : le selectedModel serveur est toujours pré-rempli, donc
 *  ceci ne sert qu'à rester verbatim avec le client. */
function getSelectedModel(provider: AiProvider): string {
  return getDefaultModel(provider).id
}

// ───────────────────────────── Constantes & helpers (verbatim client) ────────────
const USD_TO_EUR = 0.92
const GEMINI_IMAGE_MODEL_ID = 'gemini-3.1-flash-image-preview'

const PROVIDERS: AiProvider[] = ['claude', 'gemini', 'openai', 'deepseek', 'qwen', 'kimi', 'openrouter']

const PROVIDER_META: Record<AiProvider, { label: string; dot: string; topup: string }> = {
  claude:     { label: 'Claude (Anthropic)', dot: '#fb923c', topup: 'https://console.anthropic.com/settings/billing' },
  gemini:     { label: 'Gemini (Google)',    dot: '#38bdf8', topup: 'https://aistudio.google.com/app/plan_information' },
  openai:     { label: 'OpenAI',             dot: '#34d399', topup: 'https://platform.openai.com/settings/organization/billing/overview' },
  deepseek:   { label: 'DeepSeek',           dot: '#818cf8', topup: 'https://platform.deepseek.com/top_up' },
  qwen:       { label: 'Qwen',               dot: '#a78bfa', topup: 'https://bailian.console.aliyun.com/' },
  kimi:       { label: 'Kimi',               dot: '#fbbf24', topup: 'https://platform.moonshot.cn/console/account' },
  openrouter: { label: 'OpenRouter',         dot: '#e879f9', topup: 'https://openrouter.ai/settings/credits' },
}

type BadgeKind = 'ok' | 'warning' | 'over' | 'unset'

function getBadgeKind(costUsd: number, budgetUsd: number | null): BadgeKind {
  if (budgetUsd === null || budgetUsd <= 0) return 'unset'
  const pct = costUsd / budgetUsd
  if (pct >= 1) return 'over'
  if (pct >= 0.8) return 'warning'
  return 'ok'
}

function formatEur(usd: number, decimals = 4): string {
  const eur = usd * USD_TO_EUR
  let d = decimals
  if (eur >= 1) d = 2
  else if (eur >= 0.01) d = 3
  else if (eur >= 0.0001) d = 4
  else d = 6
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: d, maximumFractionDigits: d,
  }).format(eur)
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + ' M'
  if (n >= 10_000) return (n / 1_000).toFixed(1) + ' k'
  return n.toLocaleString('fr-FR')
}

function formatBillingDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]
  return `${day}-${month}-${String(d.getUTCFullYear()).slice(-2)}`
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

interface CostRow {
  provider: AiProvider
  title: string
  subtitle: string
  tokensIn: number
  tokensOut: number
  costUsd: number
  budget: number | null
  pct: number | null
  kind: BadgeKind
  pricing?: { input: number; output: number }
  isSubRow?: boolean
}

// ───────────────────────────── Shapes de coûts (lecture Firestore admin) ─────────
interface AiUsageLeaf { tokensIn: number; tokensOut: number; costUsd: number }
interface AiProviderUsage { tokensIn: number; tokensOut: number; costUsd: number; byModel: Record<string, AiUsageLeaf> }
interface AiCostStats { total: number; byProvider: Record<AiProvider, AiProviderUsage> }
interface BrightDataUsage { requests: number; costUsd: number }

const emptyProvider = (): AiProviderUsage => ({ tokensIn: 0, tokensOut: 0, costUsd: 0, byModel: {} })
const emptyAiCost = (): AiCostStats => ({
  total: 0,
  byProvider: {
    claude: emptyProvider(), gemini: emptyProvider(), openai: emptyProvider(),
    deepseek: emptyProvider(), qwen: emptyProvider(), kimi: emptyProvider(), openrouter: emptyProvider(),
  },
})

/** Reconstruit AiCostStats depuis le doc aiUsage/{uid}_{month} (calque de fetchAiCost). */
function parseAiCost(data: FirebaseFirestore.DocumentData | undefined): AiCostStats {
  if (!data) return emptyAiCost()
  const d = data as {
    total?: { costUsd?: number }
    byProvider?: Partial<Record<AiProvider, Partial<AiProviderUsage> & { byModel?: Record<string, Partial<AiUsageLeaf>> }>>
  }
  const merge = (p: AiProvider): AiProviderUsage => {
    const rawByModel = d.byProvider?.[p]?.byModel ?? {}
    const byModel: Record<string, AiUsageLeaf> = {}
    for (const [modelId, leaf] of Object.entries(rawByModel)) {
      byModel[modelId] = {
        tokensIn:  leaf?.tokensIn  ?? 0,
        tokensOut: leaf?.tokensOut ?? 0,
        costUsd:   leaf?.costUsd   ?? 0,
      }
    }
    return {
      tokensIn:  d.byProvider?.[p]?.tokensIn  ?? 0,
      tokensOut: d.byProvider?.[p]?.tokensOut ?? 0,
      costUsd:   d.byProvider?.[p]?.costUsd   ?? 0,
      byModel,
    }
  }
  return {
    total: d.total?.costUsd ?? 0,
    byProvider: {
      claude: merge('claude'), gemini: merge('gemini'), openai: merge('openai'),
      deepseek: merge('deepseek'), qwen: merge('qwen'), kimi: merge('kimi'), openrouter: merge('openrouter'),
    },
  }
}

function parseBrightData(data: FirebaseFirestore.DocumentData | undefined): BrightDataUsage {
  if (!data) return { requests: 0, costUsd: 0 }
  return { requests: (data.requests as number) ?? 0, costUsd: (data.costUsd as number) ?? 0 }
}

/** Reconstruit les lignes par provider (split Gemini texte/image) — calque exact
 *  de `LiveLlmUsagePanel` (rows useMemo). VERBATIM client. */
function buildCostRows(
  stats: AiCostStats,
  selectedModel: Record<AiProvider, string>,
  budgets: Record<AiProvider, number | null>,
): CostRow[] {
  const result: CostRow[] = []
  for (const p of PROVIDERS) {
    const u = stats.byProvider[p]
    const budget = budgets[p]
    const pct = budget !== null && budget > 0 ? u.costUsd / budget : null
    const kind = getBadgeKind(u.costUsd, budget)
    const selectedModelId = selectedModel[p] ?? getSelectedModel(p)
    const selectedInfo = AI_MODELS[p].find((m) => m.id === selectedModelId)

    if (p === 'gemini') {
      const textLeaf = u.byModel[selectedModelId]
      const imageLeaf = u.byModel[GEMINI_IMAGE_MODEL_ID]
      const hasByModel = Object.keys(u.byModel).length > 0
      result.push({
        provider: p,
        title: selectedInfo?.label ?? selectedModelId,
        subtitle: 'Gemini (Google) · texte',
        tokensIn:  textLeaf?.tokensIn  ?? (hasByModel ? 0 : u.tokensIn  - (imageLeaf?.tokensIn  ?? 0)),
        tokensOut: textLeaf?.tokensOut ?? (hasByModel ? 0 : u.tokensOut - (imageLeaf?.tokensOut ?? 0)),
        costUsd:   textLeaf?.costUsd   ?? (hasByModel ? 0 : u.costUsd   - (imageLeaf?.costUsd   ?? 0)),
        budget, pct, kind, pricing: selectedInfo?.pricing,
      })
      const imageInfo = AI_MODELS.gemini.find((m) => m.id === GEMINI_IMAGE_MODEL_ID)
      result.push({
        provider: p,
        title: imageInfo?.label ?? 'Gemini 3.1 Flash Image',
        subtitle: 'Gemini (Google) · image (Image IA)',
        tokensIn:  imageLeaf?.tokensIn  ?? 0,
        tokensOut: imageLeaf?.tokensOut ?? 0,
        costUsd:   imageLeaf?.costUsd   ?? 0,
        budget, pct, kind, pricing: imageInfo?.pricing, isSubRow: true,
      })
      continue
    }

    result.push({
      provider: p,
      title: PROVIDER_META[p].label,
      subtitle: selectedInfo?.label ?? selectedModelId,
      tokensIn: u.tokensIn, tokensOut: u.tokensOut, costUsd: u.costUsd,
      budget, pct, kind, pricing: selectedInfo?.pricing,
    })
  }
  return result
}

const BADGE_HTML: Record<BadgeKind, string> = {
  over:    '<span class="badge over">Limite atteinte</span>',
  warning: '<span class="badge warn">Proche</span>',
  ok:      '<span class="badge ok">OK</span>',
  unset:   '<span class="badge none">sans budget</span>',
}

interface BrightDataView {
  consumedUsd: number
  balanceUsd: number | null
  pendingBalanceUsd: number | null
  accountStatus: string | null
  nextBillingDate: string | null
  isLive: boolean
  localRequests: number
  kind: BadgeKind
  show: boolean
}

// buildHtml — VERBATIM client (document autonome riche, archive Drive).
function buildHtml(d: {
  title: string; month: string; dateLabel: string; updatedLabel: string
  totalUsd: number; tokensIn: number; tokensOut: number; overCount: number; warnCount: number
  rows: CostRow[]; balances: Record<string, number | null>; brightData: BrightDataView
}): string {
  const rowsHtml = d.rows.map((r) => {
    const meta = PROVIDER_META[r.provider]
    const hasUsage = r.tokensIn > 0 || r.tokensOut > 0
    const apiBalance = r.isSubRow ? null : (d.balances[r.provider] ?? null)
    let budgetCell = '<span class="muted">—</span>'
    if (r.isSubRow) {
      budgetCell = '<span class="muted">—</span>'
    } else if (apiBalance != null) {
      budgetCell = `<div class="strong green">$${apiBalance.toFixed(2)}</div><div class="hint">solde API</div>`
    } else if (r.budget != null) {
      budgetCell = `<div class="strong">$${Math.max(0, r.budget - r.costUsd).toFixed(2)}</div><div class="hint">restant</div>`
    }
    const statusCell = r.isSubRow
      ? '<span class="shared">budget partagé</span>'
      : BADGE_HTML[r.kind]
    const rowCls = !r.isSubRow && r.kind === 'over' ? ' over-bg'
      : !r.isSubRow && r.kind === 'warning' ? ' warn-bg' : ''
    return `
      <tr class="prow${rowCls}${r.isSubRow ? ' sub' : ''}">
        <td class="prov">
          <span class="dot" style="background:${meta.dot}"></span>
          <a href="${meta.topup}" target="_blank" rel="noopener">${esc(r.title)}</a>
          <div class="hint">${esc(r.subtitle)}</div>
        </td>
        <td class="num">
          <div class="${hasUsage ? '' : 'muted'}">${formatTokens(r.tokensIn)} <span class="sep">/</span> ${formatTokens(r.tokensOut)}</div>
          ${r.pricing ? `<div class="hint">$${r.pricing.input}/${r.pricing.output} par M tokens</div>` : ''}
        </td>
        <td class="num">
          <div class="${hasUsage ? 'strong' : 'muted'}">${formatEur(r.costUsd)}</div>
          <div class="hint">$${r.costUsd.toFixed(4)}</div>
        </td>
        <td class="num">${budgetCell}</td>
        <td class="status">${statusCell}</td>
      </tr>`
  }).join('')

  const bd = d.brightData
  const bdHtml = bd.show ? `
    <div class="section-title">Scraping (server-side)</div>
    <div class="bd-card${bd.kind === 'over' ? ' over-bg' : bd.kind === 'warning' ? ' warn-bg' : ''}">
      <div class="bd-head">
        <div class="prov">
          <span class="dot" style="background:#fb923c"></span>
          <a href="https://brightdata.com/cp/setting/billing" target="_blank" rel="noopener">Bright Data</a>
          <div class="hint">Web Unlocker</div>
        </div>
        ${BADGE_HTML[bd.kind]}
      </div>
      <div class="bd-grid">
        <div class="mini">
          <div class="mini-h">Solde</div>
          <div class="mini-v">${bd.balanceUsd != null ? '$' + bd.balanceUsd.toFixed(2) : '—'}</div>
          <div class="hint">${bd.balanceUsd != null
            ? (bd.pendingBalanceUsd && bd.pendingBalanceUsd > 0 ? '+$' + bd.pendingBalanceUsd.toFixed(2) + ' pending' : '<span class="green">live</span>')
            : ''}</div>
        </div>
        <div class="mini">
          <div class="mini-h">Consommé</div>
          <div class="mini-v ${bd.consumedUsd > 0 ? '' : 'muted'}">$${bd.consumedUsd.toFixed(2)}</div>
          <div class="hint">${formatEur(bd.consumedUsd)}${bd.isLive ? ' · <span class="green">live</span>' : bd.localRequests > 0 ? ' · ' + bd.localRequests + ' req local' : ''}</div>
        </div>
        <div class="mini">
          <div class="mini-h">Prochaine facture</div>
          <div class="mini-v">${formatBillingDate(bd.nextBillingDate)}</div>
          <div class="hint">${bd.nextBillingDate ? 'estimé (1er du mois)' : '—'}</div>
        </div>
        <div class="mini">
          <div class="mini-h">Statut compte</div>
          <div class="mini-v">${bd.accountStatus
            ? `<span class="acct ${/active|ok|enabled/i.test(bd.accountStatus) ? 'green' : ''}">${esc(bd.accountStatus)}</span>`
            : '—'}</div>
          <div class="hint">${bd.accountStatus ? '<span class="green">live</span>' : 'token sans scope Account'}</div>
        </div>
      </div>
    </div>` : ''

  const alertsHtml = d.overCount === 0 && d.warnCount === 0
    ? '<div class="kpi-v green">OK</div>'
    : `<div class="kpi-v">${d.overCount > 0 ? `<span class="red">${d.overCount} dépassé${d.overCount > 1 ? 's' : ''}</span>` : ''}${d.overCount > 0 && d.warnCount > 0 ? ' · ' : ''}${d.warnCount > 0 ? `<span class="amber">${d.warnCount} proche${d.warnCount > 1 ? 's' : ''}</span>` : ''}</div>`

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.title)} — ${d.month}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0b0b0f; color: #e8e8ea;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased; padding: 28px 18px; }
  .wrap { max-width: 1120px; margin: 0 auto; background: rgba(255,255,255,.02);
    border: 1px solid rgba(255,255,255,.10); border-radius: 18px; padding: 24px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  header { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 18px; }
  .spark { width: 22px; height: 22px; flex: 0 0 auto; color: #34d399; }
  h1 { font-size: 17px; font-weight: 600; margin: 0; color: #fff; }
  .sub { font-size: 11px; color: rgba(255,255,255,.32); margin-top: 3px; }
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
  .kpi { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06);
    border-radius: 12px; padding: 12px 14px; }
  .kpi-h { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.32); }
  .kpi-v { font-size: 22px; font-weight: 600; color: #fff; margin-top: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .kpi-foot { font-size: 9.5px; color: rgba(255,255,255,.30); margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase;
    color: rgba(255,255,255,.32); font-weight: 500; text-align: right; padding: 8px;
    border-bottom: 1px solid rgba(255,255,255,.06); }
  thead th:first-child { text-align: left; }
  .prow td { padding: 11px 8px; border-bottom: 1px solid rgba(255,255,255,.06);
    vertical-align: top; font-size: 12px; }
  .prow.sub td { padding-top: 8px; }
  .prow.sub .prov { padding-left: 18px; }
  .over-bg { background: rgba(239,68,68,.06); }
  .warn-bg { background: rgba(245,158,11,.05); }
  td.prov { text-align: left; }
  td.num, td.status { text-align: right; }
  td.status { white-space: nowrap; }
  .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 7px; vertical-align: middle; }
  .prov a { color: rgba(255,255,255,.85); text-decoration: none; font-weight: 500; }
  .prov a:hover { color: #a5b4fc; }
  .hint { font-size: 9.5px; color: rgba(255,255,255,.30);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; margin-top: 2px; }
  .num .strong, td.num .strong { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: rgba(255,255,255,.82); }
  .num div:first-child { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: rgba(255,255,255,.70); }
  .muted { color: rgba(255,255,255,.22) !important; }
  .sep { color: rgba(255,255,255,.30); }
  .green { color: #34d399; }
  .red { color: #f87171; }
  .amber { color: #fbbf24; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; }
  .badge.ok   { background: rgba(16,185,129,.10); color: #6ee7b7; border: 1px solid rgba(16,185,129,.30); }
  .badge.warn { background: rgba(245,158,11,.15); color: #fcd34d; border: 1px solid rgba(245,158,11,.40); }
  .badge.over { background: rgba(239,68,68,.15); color: #fca5a5; border: 1px solid rgba(239,68,68,.40); }
  .badge.none { background: rgba(255,255,255,.05); color: rgba(255,255,255,.30); border: 1px solid rgba(255,255,255,.10); }
  .shared { font-size: 9.5px; color: rgba(255,255,255,.30); font-style: italic; }
  .section-title { font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase;
    color: rgba(255,255,255,.32); border-top: 1px solid rgba(255,255,255,.10);
    margin-top: 16px; padding-top: 14px; }
  .bd-card { border: 1px solid rgba(255,255,255,.06); border-radius: 12px; padding: 14px; margin-top: 10px; }
  .bd-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
  .bd-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .mini { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); border-radius: 9px; padding: 9px 10px; }
  .mini-h { font-size: 9px; letter-spacing: .06em; text-transform: uppercase; color: rgba(255,255,255,.30); }
  .mini-v { font-size: 15px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: rgba(255,255,255,.90); margin-top: 2px; }
  .acct { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;
    text-transform: uppercase; background: rgba(245,158,11,.15); border: 1px solid rgba(245,158,11,.40); color: #fcd34d; }
  .acct.green { background: rgba(16,185,129,.15); border-color: rgba(16,185,129,.40); color: #6ee7b7; }
  footer { font-size: 9.5px; color: rgba(255,255,255,.25); line-height: 1.6; margin-top: 18px; }
  footer code { color: rgba(255,255,255,.40); }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <svg class="spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      <div>
        <h1>${esc(d.title)} — rapport</h1>
        <div class="sub">Vue globale des coûts du mois (${d.month}) · généré le ${d.dateLabel} à ${d.updatedLabel}</div>
      </div>
    </header>

    <div class="kpis">
      <div class="kpi">
        <div class="kpi-h">Total ce mois</div>
        <div class="kpi-v">${formatEur(d.totalUsd)}</div>
        <div class="kpi-foot">≈ $${d.totalUsd.toFixed(4)} USD</div>
      </div>
      <div class="kpi">
        <div class="kpi-h">Tokens in / out</div>
        <div class="kpi-v">${formatTokens(d.tokensIn)} <span style="color:rgba(255,255,255,.30)">/</span> ${formatTokens(d.tokensOut)}</div>
        <div class="kpi-foot">tous providers cumulés</div>
      </div>
      <div class="kpi">
        <div class="kpi-h">Alertes</div>
        ${alertsHtml}
        <div class="kpi-foot">≥ 80% = warning · ≥ 100% = over</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Provider</th>
          <th>Tokens (in / out)</th>
          <th>Coût</th>
          <th>Budget dispo</th>
          <th>Statut</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    ${bdHtml}

    <footer>
      Données agrégées depuis Firestore — collections <code>aiUsage/{user}_${d.month}</code> et <code>brightDataUsage/{user}_${d.month}</code>.
      Les alertes sont des seuils mensuels locaux (warning ≥ 80 %, limite atteinte ≥ 100 %) ; elles ne rechargent pas les comptes chez les providers.
    </footer>
  </div>
</body>
</html>`
}

// Palette email (verbatim client).
const EMAIL_C = {
  bg: '#0b0b0f', panel: '#15151b', border: '#26262e', line: '#1c1c22',
  text: '#e8e8ea', dim: '#9a9aa2', faint: '#6a6a72', mute: '#4a4a52', white: '#ffffff',
  green: '#34d399', red: '#f87171', amber: '#fbbf24', orange: '#fb923c',
} as const

function emailBadge(kind: BadgeKind): string {
  const map: Record<BadgeKind, [string, string, string]> = {
    over:    ['Limite atteinte', '#fca5a5', 'rgba(239,68,68,.15)'],
    warning: ['Proche', '#fcd34d', 'rgba(245,158,11,.15)'],
    ok:      ['OK', '#6ee7b7', 'rgba(16,185,129,.12)'],
    unset:   ['sans budget', '#9a9aa2', 'rgba(255,255,255,.06)'],
  }
  const [label, fg, bgc] = map[kind]
  return `<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;color:${fg};background:${bgc};white-space:nowrap;">${label}</span>`
}

// buildEmailHtml — VERBATIM client (corps de mail email-safe).
function buildEmailHtml(d: {
  title: string; month: string; dateLabel: string; updatedLabel: string
  totalUsd: number; tokensIn: number; tokensOut: number; overCount: number; warnCount: number
  rows: CostRow[]; balances: Record<string, number | null>; brightData: BrightDataView
}): string {
  const C = EMAIL_C
  const mono = 'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;'
  const th = `font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:${C.dim};font-weight:600;padding:8px;border-bottom:1px solid ${C.border};`
  const td = `padding:10px 8px;border-bottom:1px solid ${C.line};font-size:13px;vertical-align:top;color:${C.text};`

  const kpi = (head: string, value: string, foot: string): string =>
    `<td width="33%" valign="top" style="background:${C.panel};border:1px solid ${C.border};border-radius:10px;padding:12px 14px;">
      <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:${C.dim};">${head}</div>
      <div style="font-size:21px;font-weight:600;color:${C.white};margin-top:5px;${mono}">${value}</div>
      <div style="font-size:10px;color:${C.faint};margin-top:4px;">${foot}</div>
    </td>`

  const alertsVal = d.overCount === 0 && d.warnCount === 0
    ? `<span style="color:${C.green};">OK</span>`
    : `${d.overCount > 0 ? `<span style="color:${C.red};">${d.overCount} dépassé${d.overCount > 1 ? 's' : ''}</span>` : ''}${d.overCount > 0 && d.warnCount > 0 ? ' · ' : ''}${d.warnCount > 0 ? `<span style="color:${C.amber};">${d.warnCount} proche${d.warnCount > 1 ? 's' : ''}</span>` : ''}`

  const rowsHtml = d.rows.map((r) => {
    const meta = PROVIDER_META[r.provider]
    const hasUsage = r.tokensIn > 0 || r.tokensOut > 0
    const apiBalance = r.isSubRow ? null : (d.balances[r.provider] ?? null)
    let budgetCell = `<span style="color:${C.mute};">—</span>`
    if (!r.isSubRow && apiBalance != null) {
      budgetCell = `<div style="color:${C.green};font-weight:600;">$${apiBalance.toFixed(2)}</div><div style="font-size:9.5px;color:${C.faint};">solde API</div>`
    } else if (!r.isSubRow && r.budget != null) {
      budgetCell = `<div style="font-weight:600;color:${C.text};">$${Math.max(0, r.budget - r.costUsd).toFixed(2)}</div><div style="font-size:9.5px;color:${C.faint};">restant</div>`
    }
    const status = r.isSubRow
      ? `<span style="font-size:9.5px;color:${C.faint};font-style:italic;">budget partagé</span>`
      : emailBadge(r.kind)
    const indent = r.isSubRow ? 'padding-left:18px;' : ''
    return `<tr>
      <td style="${td}${indent}">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${meta.dot};margin-right:7px;"></span>
        <a href="${meta.topup}" style="color:${C.text};text-decoration:none;font-weight:500;">${esc(r.title)}</a>
        <div style="font-size:9.5px;color:${C.faint};margin-top:2px;">${esc(r.subtitle)}</div>
      </td>
      <td align="right" style="${td}">
        <div style="${hasUsage ? `color:${C.text};` : `color:${C.mute};`}${mono}">${formatTokens(r.tokensIn)} / ${formatTokens(r.tokensOut)}</div>
        ${r.pricing ? `<div style="font-size:9.5px;color:${C.faint};">$${r.pricing.input}/${r.pricing.output} par M tokens</div>` : ''}
      </td>
      <td align="right" style="${td}">
        <div style="${hasUsage ? `color:${C.text};font-weight:600;` : `color:${C.mute};`}${mono}">${formatEur(r.costUsd)}</div>
        <div style="font-size:9.5px;color:${C.faint};">$${r.costUsd.toFixed(4)}</div>
      </td>
      <td align="right" style="${td}${mono}">${budgetCell}</td>
      <td align="right" style="${td}">${status}</td>
    </tr>`
  }).join('')

  const bd = d.brightData
  const mini = (h: string, v: string, foot: string): string =>
    `<td width="25%" valign="top" style="background:${C.panel};border:1px solid ${C.border};border-radius:8px;padding:9px 10px;">
      <div style="font-size:9px;letter-spacing:.04em;text-transform:uppercase;color:${C.faint};">${h}</div>
      <div style="font-size:15px;color:${C.text};margin-top:3px;${mono}">${v}</div>
      <div style="font-size:9.5px;color:${C.faint};margin-top:2px;">${foot}</div>
    </td>`
  const bdHtml = bd.show ? `
    <div style="font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:${C.dim};margin:20px 0 10px;padding-top:14px;border-top:1px solid ${C.border};">Scraping (server-side)</div>
    <div style="margin-bottom:10px;">
      <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${C.orange};margin-right:7px;"></span>
      <a href="https://brightdata.com/cp/setting/billing" style="color:${C.text};text-decoration:none;font-weight:500;">Bright Data</a>
      <span style="font-size:9.5px;color:${C.faint};"> · Web Unlocker</span>&nbsp; ${emailBadge(bd.kind)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:6px;">
      <tr>
        ${mini('Solde', bd.balanceUsd != null ? '$' + bd.balanceUsd.toFixed(2) : '—', bd.balanceUsd != null ? (bd.pendingBalanceUsd && bd.pendingBalanceUsd > 0 ? '+$' + bd.pendingBalanceUsd.toFixed(2) + ' pending' : `<span style="color:${C.green};">live</span>`) : '')}
        ${mini('Consommé', '$' + bd.consumedUsd.toFixed(2), formatEur(bd.consumedUsd) + (bd.isLive ? ` · <span style="color:${C.green};">live</span>` : bd.localRequests > 0 ? ' · ' + bd.localRequests + ' req local' : ''))}
        ${mini('Prochaine facture', formatBillingDate(bd.nextBillingDate), bd.nextBillingDate ? 'estimé (1er du mois)' : '—')}
        ${mini('Statut compte', bd.accountStatus ? esc(bd.accountStatus) : '—', bd.accountStatus ? `<span style="color:${C.green};">live</span>` : 'token sans scope Account')}
      </tr>
    </table>` : ''

  return `<div style="background:${C.bg};color:${C.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:24px;border-radius:14px;max-width:720px;margin:0 auto;">
    <div style="font-size:20px;font-weight:600;color:${C.white};margin-bottom:3px;">${esc(d.title)} — rapport</div>
    <div style="font-size:11px;color:${C.dim};margin-bottom:16px;">Vue globale des coûts du mois (${d.month}) · généré le ${d.dateLabel} à ${d.updatedLabel}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:6px;">
      <tr>
        ${kpi('Total ce mois', formatEur(d.totalUsd), '≈ $' + d.totalUsd.toFixed(4) + ' USD')}
        ${kpi('Tokens in / out', `${formatTokens(d.tokensIn)} / ${formatTokens(d.tokensOut)}`, 'tous providers cumulés')}
        <td width="33%" valign="top" style="background:${C.panel};border:1px solid ${C.border};border-radius:10px;padding:12px 14px;">
          <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:${C.dim};">Alertes</div>
          <div style="font-size:21px;font-weight:600;color:${C.white};margin-top:5px;">${alertsVal}</div>
          <div style="font-size:10px;color:${C.faint};margin-top:4px;">≥ 80% = warning · ≥ 100% = over</div>
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:16px;">
      <thead><tr>
        <th align="left" style="${th}">Provider</th>
        <th align="right" style="${th}">Tokens (in / out)</th>
        <th align="right" style="${th}">Coût</th>
        <th align="right" style="${th}">Budget dispo</th>
        <th align="right" style="${th}">Statut</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    ${bdHtml}
    <div style="font-size:9.5px;color:${C.faint};margin-top:18px;line-height:1.6;">
      Données agrégées depuis Firestore. Les alertes sont des seuils mensuels locaux (warning ≥ 80 %, limite atteinte ≥ 100 %) ; elles ne rechargent pas les comptes chez les providers.
    </div>
  </div>`
}

// ───────────────────────────── Collecte headless + assemblage ────────────────────
async function collectCostReportServer(uid: string, title?: string): Promise<{
  html: string; emailHtml: string; summaryRows: Record<string, unknown>[]
  totalUsd: number; totalEur: number; tokensIn: number; tokensOut: number
}> {
  const db = getFirestore()
  const month = new Date().toISOString().slice(0, 7)

  const [usageSnap, bdSnap, userSnap] = await Promise.all([
    db.doc(`aiUsage/${uid}_${month}`).get(),
    db.doc(`brightDataUsage/${uid}_${month}`).get(),
    db.doc(`users/${uid}`).get(),
  ])

  const aiCost = parseAiCost(usageSnap.data())
  const brightData = parseBrightData(bdSnap.data())
  const ai = (userSnap.data()?.aiSettings ?? {}) as {
    selectedModel?: Partial<Record<AiProvider, string>>
    monthlyBudgetUsd?: Partial<Record<AiProvider, number | null>>
    brightDataBudgetUsd?: number | null
  }

  const selectedModel = {} as Record<AiProvider, string>
  const monthlyBudget = {} as Record<AiProvider, number | null>
  for (const p of PROVIDERS) {
    selectedModel[p] = ai.selectedModel?.[p] ?? getDefaultModel(p).id
    monthlyBudget[p] = ai.monthlyBudgetUsd?.[p] ?? null
  }
  const brightDataBudgetUsd = ai.brightDataBudgetUsd ?? null

  // Soldes providers (DeepSeek/OpenRouter) : omis côté serveur (clés API non lues ici).
  const balances: Record<string, number | null> = {}

  // Compte Bright Data LIVE : on lit le token+zone GLOBAUX dans Firestore config/brightdata
  // (le scheduler ne bind PAS les secrets BD, cf. functions/src/workflow/brightData.ts) et on
  // interroge la même API que le panneau live — pour que le mail affiche les vraies valeurs
  // (solde / consommé / statut / facture) au lieu de —/compteur Firestore périmé. Best-effort :
  // repli sur le compteur Firestore brightDataUsage si le call échoue (token sans scope, réseau…).
  let bdAccount: Awaited<ReturnType<typeof fetchBrightDataAccountStats>> | null = null
  try {
    const cfg = (await db.doc('config/brightdata').get()).data() ?? {}
    const bdToken = String(cfg.apiToken ?? '').trim()
    const bdZone = String(cfg.zone ?? '').trim() || 'web_unlocker1'
    if (bdToken) bdAccount = await fetchBrightDataAccountStats(bdToken, bdZone)
  } catch (e) {
    console.warn('[cost-report] Bright Data live indisponible, repli compteur Firestore :', e instanceof Error ? e.message : e)
  }
  const consumedBdUsd = bdAccount?.consumedThisMonthUsd ?? brightData.costUsd

  const rows = buildCostRows(aiCost, selectedModel, monthlyBudget)
  const totalUsd = rows.reduce((s, r) => s + r.costUsd, 0) + consumedBdUsd
  const tokensIn = rows.reduce((s, r) => s + r.tokensIn, 0)
  const tokensOut = rows.reduce((s, r) => s + r.tokensOut, 0)

  const mainRows = rows.filter((r) => !r.isSubRow)
  const bdKind = getBadgeKind(consumedBdUsd, brightDataBudgetUsd)
  const overCount = mainRows.filter((r) => r.kind === 'over').length + (bdKind === 'over' ? 1 : 0)
  const warnCount = mainRows.filter((r) => r.kind === 'warning').length + (bdKind === 'warning' ? 1 : 0)

  const now = new Date()
  const updatedLabel = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateLabel = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

  const htmlInput = {
    title: title?.trim() || 'Consommation IA & Scraping',
    month, dateLabel, updatedLabel,
    totalUsd, tokensIn, tokensOut, overCount, warnCount,
    rows, balances,
    brightData: {
      consumedUsd: consumedBdUsd,
      balanceUsd: bdAccount?.balanceUsd ?? null,
      pendingBalanceUsd: bdAccount?.pendingBalanceUsd ?? null,
      accountStatus: bdAccount?.accountStatus ?? null,
      nextBillingDate: bdAccount?.nextBillingDate ?? null,
      isLive: bdAccount?.consumedThisMonthUsd != null,
      localRequests: brightData.requests,
      kind: bdKind,
      show: bdAccount !== null || brightData.requests > 0 || brightData.costUsd > 0,
    } as BrightDataView,
  }
  const html = buildHtml(htmlInput)
  const emailHtml = buildEmailHtml(htmlInput)

  const summaryRows: Record<string, unknown>[] = rows.map((r) => ({
    Provider: r.title,
    Détail: r.subtitle,
    'Tokens in': r.tokensIn,
    'Tokens out': r.tokensOut,
    'Coût (USD)': Number(r.costUsd.toFixed(6)),
    'Coût (EUR)': Number((r.costUsd * USD_TO_EUR).toFixed(6)),
  }))
  summaryRows.push({
    Provider: 'Bright Data', Détail: 'Web Unlocker', 'Tokens in': '', 'Tokens out': '',
    'Coût (USD)': Number(consumedBdUsd.toFixed(4)), 'Coût (EUR)': Number((consumedBdUsd * USD_TO_EUR).toFixed(4)),
  })
  summaryRows.push({
    Provider: 'TOTAL', Détail: month, 'Tokens in': tokensIn, 'Tokens out': tokensOut,
    'Coût (USD)': Number(totalUsd.toFixed(4)), 'Coût (EUR)': Number((totalUsd * USD_TO_EUR).toFixed(4)),
  })

  return { html, emailHtml, summaryRows, totalUsd, totalEur: totalUsd * USD_TO_EUR, tokensIn, tokensOut }
}

// ───────────────────────────── Enregistrement node serveur ───────────────────────
registerServerNode({
  type: 'cost-report',
  run: async (ctx, config) => {
    ctx.log('info', 'Agrégation des coûts IA & scraping du mois (headless)…')
    const title = String(config.title ?? '')
    const report = await collectCostReportServer(ctx.uid, title)

    const month = new Date().toISOString().slice(0, 7)
    const rawName = String(config.fileName ?? '').trim() || `rapport-couts-${month}.html`
    const fileName = rawName.toLowerCase().endsWith('.html') ? rawName : `${rawName}.html`
    const file = makeServerFile(fileName, 'text/html;charset=utf-8', report.html)

    const columns = report.summaryRows.length > 0
      ? Object.keys(report.summaryRows[0]).map((k) => ({ key: k, label: k }))
      : []

    ctx.log(
      'info',
      `Rapport généré : total ${report.totalEur.toFixed(2)} € · ${report.tokensIn} in / ${report.tokensOut} out.`,
    )
    // `file` = dashboard riche (archive Drive) ; `html` = variante email-safe (corps de mail).
    return { html: report.emailHtml, file, summary: { columns, rows: report.summaryRows } }
  },
})
