// Collecte les coûts IA & scraping du mois courant (mêmes sources que le panneau
// live `LiveLlmUsagePanel`) et les rend en HTML/CSS autonome — destiné à être
// stocké sur Drive ou envoyé par mail (suivi des dépenses Tokens). Le data-shaping
// (split Gemini texte/image, TOTAL = Σ lignes + Bright Data) duplique celui du
// panneau ; à garder synchronisé si le panneau évolue.
import { formatEur } from '@/lib/money'
import { getBadgeKind, formatTokens, formatBillingDate, type BadgeKind } from '@/features/stats/usageFormat'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { AI_MODELS, getModel, type AiProvider } from '@/lib/aiModels'
import { useAiSettingsStore, getSelectedModel } from '@/stores/aiSettings.store'
import { fetchAiCost, fetchBrightData, type AiCostStats } from '@/features/stats/useUsageStats'
import { fetchProviderBalances } from '@/features/stats/providerBalances'
import { resolveModelCost, resolveProviderCost, summarizeModels } from '@/features/stats/modelCost'
import type { BrightDataAccountStats } from '@/features/stats/useBrightDataAccount'

const USD_TO_EUR = 0.92
const GEMINI_IMAGE_MODEL_ID = 'gemini-3.1-flash-image-preview'

const PROVIDERS: AiProvider[] = ['claude', 'gemini', 'openai', 'deepseek', 'qwen', 'kimi', 'glm', 'openrouter']

const PROVIDER_META: Record<AiProvider, { label: string; dot: string; topup: string }> = {
  claude:     { label: 'Claude (Anthropic)', dot: '#fb923c', topup: 'https://console.anthropic.com/settings/billing' },
  gemini:     { label: 'Gemini (Google)',    dot: '#38bdf8', topup: 'https://aistudio.google.com/app/plan_information' },
  openai:     { label: 'OpenAI',             dot: '#34d399', topup: 'https://platform.openai.com/settings/organization/billing/overview' },
  deepseek:   { label: 'DeepSeek',           dot: '#818cf8', topup: 'https://platform.deepseek.com/top_up' },
  qwen:       { label: 'Qwen',               dot: '#a78bfa', topup: 'https://bailian.console.aliyun.com/' },
  kimi:       { label: 'Kimi',               dot: '#fbbf24', topup: 'https://platform.moonshot.cn/console/account' },
  glm:        { label: 'GLM (Z.ai)',         dot: '#3859ff', topup: 'https://z.ai/manage-apikey/apikey-list' },
  openrouter: { label: 'OpenRouter',         dot: '#e879f9', topup: 'https://openrouter.ai/settings/credits' },
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

/** Reconstruit les lignes par provider (split Gemini texte/image) — calque exact
 *  de `LiveLlmUsagePanel` (rows useMemo). */
export function buildCostRows(
  stats: AiCostStats,
  selectedModel: Record<AiProvider, string>,
  budgets: Record<AiProvider, number | null>,
): CostRow[] {
  const result: CostRow[] = []
  for (const p of PROVIDERS) {
    const u = stats.byProvider[p]
    const budget = budgets[p]
    // ⚠⚠ Le coût de la base peut SOUS-COMPTER : un modèle absent du catalogue s'y écrit à
    // zéro, et un tarif ajouté en cours de mois ne rattrape pas les appels déjà passés.
    // Ce rapport part par mail — il ne peut pas annoncer une facture cent fois trop basse.
    const providerCost = resolveProviderCost(p, u)
    const pct = budget !== null && budget > 0 ? providerCost / budget : null
    const kind = getBadgeKind(providerCost, budget)
    const selectedModelId = selectedModel[p] ?? getSelectedModel(p)
    const selectedInfo = AI_MODELS[p].find((m) => m.id === selectedModelId)

    if (p === 'gemini') {
      // ⚠⚠ TOUS les modèles texte, pas `byModel[modèle coché]` : une dépense faite sur un
      // autre modèle Gemini que celui sélectionné donnait 0 token et 0 € — un rapport de
      // coûts envoyé par mail ne peut pas taire une facture.
      const text = summarizeModels(p, u.byModel, [GEMINI_IMAGE_MODEL_ID])
      const imageLeaf = u.byModel[GEMINI_IMAGE_MODEL_ID]
      const textInfo = text.dominantId ? getModel(p, text.dominantId) : null
      result.push({
        provider: p,
        title: textInfo?.label ?? text.dominantId ?? selectedInfo?.label ?? selectedModelId,
        subtitle: 'Gemini (Google) · texte',
        tokensIn:  text.hasDetail ? text.tokensIn  : u.tokensIn  - (imageLeaf?.tokensIn  ?? 0),
        tokensOut: text.hasDetail ? text.tokensOut : u.tokensOut - (imageLeaf?.tokensOut ?? 0),
        costUsd:   text.hasDetail ? text.costUsd   : u.costUsd   - (imageLeaf?.costUsd   ?? 0),
        budget, pct, kind, pricing: textInfo?.pricing ?? selectedInfo?.pricing,
      })
      const imageInfo = AI_MODELS.gemini.find((m) => m.id === GEMINI_IMAGE_MODEL_ID)
      result.push({
        provider: p,
        title: imageInfo?.label ?? 'Gemini 3.1 Flash Image',
        subtitle: 'Gemini (Google) · image (Image IA)',
        tokensIn:  imageLeaf?.tokensIn  ?? 0,
        tokensOut: imageLeaf?.tokensOut ?? 0,
        costUsd:   imageLeaf ? resolveModelCost(p, GEMINI_IMAGE_MODEL_ID, imageLeaf).costUsd : 0,
        budget, pct, kind, pricing: imageInfo?.pricing, isSubRow: true,
      })
      continue
    }

    // Le modèle qui a CONSOMMÉ prime sur celui qui est coché dans les Réglages.
    const used = summarizeModels(p, u.byModel)
    const usedInfo = used.dominantId ? getModel(p, used.dominantId) : null
    result.push({
      provider: p,
      title: PROVIDER_META[p].label,
      subtitle: used.dominantId ? (usedInfo?.label ?? used.dominantId) : (selectedInfo?.label ?? selectedModelId),
      tokensIn: u.tokensIn, tokensOut: u.tokensOut, costUsd: providerCost,
      budget, pct, kind, pricing: selectedInfo?.pricing,
    })
  }
  return result
}

export interface CostReportData {
  /** Document autonome riche (grilles CSS, cartes) — pour archive Drive / navigateur. */
  html: string
  /** Variante email-safe (tables + styles inline) — pour un corps de mail (Gmail strippe grid/flex/<style>). */
  emailHtml: string
  /** Lignes plates (1 par provider + TOTAL) pour brancher vers Sheets/autres. */
  summaryRows: Record<string, unknown>[]
  totalUsd: number
  totalEur: number
  tokensIn: number
  tokensOut: number
}

const BADGE_HTML: Record<BadgeKind, string> = {
  over:    '<span class="badge over">Limite atteinte</span>',
  warning: '<span class="badge warn">Proche</span>',
  ok:      '<span class="badge ok">OK</span>',
  unset:   '<span class="badge none">sans budget</span>',
}

/** Récupère toutes les sources, assemble le HTML autonome + le résumé plat. */
export async function collectCostReport(opts: {
  uid: string
  email?: string | null
  title?: string
}): Promise<CostReportData> {
  const month = new Date().toISOString().slice(0, 7)
  const { selectedModel, monthlyBudgetUsd, brightDataBudgetUsd } = useAiSettingsStore.getState()

  const [aiCost, brightData, balances] = await Promise.all([
    fetchAiCost(opts.uid),
    fetchBrightData(opts.uid),
    fetchProviderBalances().catch(() => ({} as Record<string, number | null>)),
  ])

  // Bright Data live (owner-gated, best-effort) → repli sur le compteur Firestore.
  let bdAccount: BrightDataAccountStats | null = null
  try {
    const call = httpsCallable<undefined, BrightDataAccountStats>(functions, 'getBrightDataAccount')
    bdAccount = (await call()).data
  } catch {
    bdAccount = null
  }

  const rows = buildCostRows(aiCost, selectedModel, monthlyBudgetUsd)
  const consumedBdUsd = bdAccount?.consumedThisMonthUsd ?? brightData.costUsd
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
    title: opts.title?.trim() || 'Consommation IA & Scraping',
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
    },
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

export interface BrightDataView {
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

export function buildHtml(d: {
  title: string
  month: string
  dateLabel: string
  updatedLabel: string
  totalUsd: number
  tokensIn: number
  tokensOut: number
  overCount: number
  warnCount: number
  rows: CostRow[]
  balances: Record<string, number | null>
  brightData: BrightDataView
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

// Palette email (mêmes teintes que le dashboard, en hex opaques email-safe).
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

/**
 * Variante EMAIL du rapport : layout en `<table>` + styles 100 % inline (thème sombre),
 * pour un CORPS de mail. Les clients (Gmail) strippent `display:grid/flex` et les blocs
 * `<style>` ; ici tout est inline et tabulaire → le rendu survit. Renvoie un FRAGMENT
 * autonome (un `<div>` racine), pas un document complet.
 */
export function buildEmailHtml(d: {
  title: string
  month: string
  dateLabel: string
  updatedLabel: string
  totalUsd: number
  tokensIn: number
  tokensOut: number
  overCount: number
  warnCount: number
  rows: CostRow[]
  balances: Record<string, number | null>
  brightData: BrightDataView
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
