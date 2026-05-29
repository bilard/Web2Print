import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, Pencil, Globe, ExternalLink } from 'lucide-react'
import { useUsageStats } from '@/features/stats/useUsageStats'
import { useBrightDataAccount } from '@/features/stats/useBrightDataAccount'
import { useAiSettingsStore, getSelectedModel } from '@/stores/aiSettings.store'
import { AI_MODELS, type AiProvider } from '@/lib/aiModels'

const USD_TO_EUR = 0.92

const PROVIDER_META: Record<AiProvider, { label: string; dot: string; topup: string }> = {
  claude:     { label: 'Claude (Anthropic)', dot: 'bg-orange-400',  topup: 'https://console.anthropic.com/settings/billing' },
  gemini:     { label: 'Gemini (Google)',    dot: 'bg-sky-400',     topup: 'https://aistudio.google.com/app/plan_information' },
  openai:     { label: 'OpenAI',             dot: 'bg-emerald-400', topup: 'https://platform.openai.com/settings/organization/billing/overview' },
  deepseek:   { label: 'DeepSeek',           dot: 'bg-indigo-400',  topup: 'https://platform.deepseek.com/top_up' },
  qwen:       { label: 'Qwen',               dot: 'bg-violet-400',  topup: 'https://bailian.console.aliyun.com/?productCode=p_efm#/expense-center' },
  kimi:       { label: 'Kimi',               dot: 'bg-amber-400',   topup: 'https://platform.moonshot.cn/console/account' },
  openrouter: { label: 'OpenRouter',         dot: 'bg-fuchsia-400', topup: 'https://openrouter.ai/settings/credits' },
}

const PROVIDERS: AiProvider[] = ['claude', 'gemini', 'openai', 'deepseek', 'qwen', 'kimi', 'openrouter']

/** Modèle image Gemini (Nano Banana 2). Affiché sur sa propre ligne sous le
 *  modèle texte Gemini sélectionné — il a son propre pricing ($30 / 1M output)
 *  et il est utile de voir sa consommation isolément. */
const GEMINI_IMAGE_MODEL_ID = 'gemini-3.1-flash-image-preview'

function formatEur(usd: number, decimals = 4): string {
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

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + ' M'
  if (n >= 10_000) return (n / 1_000).toFixed(1) + ' k'
  return n.toLocaleString('fr-FR')
}

/** "2026-06-01" → "01-Jun-26" comme le dashboard Bright Data. */
function formatBillingDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]
  const year = String(d.getUTCFullYear()).slice(-2)
  return `${day}-${month}-${year}`
}

type BadgeKind = 'ok' | 'warning' | 'over' | 'unset'

function getBadgeKind(costUsd: number, budgetUsd: number | null): BadgeKind {
  if (budgetUsd === null || budgetUsd <= 0) return 'unset'
  const pct = costUsd / budgetUsd
  if (pct >= 1) return 'over'
  if (pct >= 0.8) return 'warning'
  return 'ok'
}

function StatusBadge({ kind, pct }: { kind: BadgeKind; pct: number | null }) {
  const pctLabel = pct !== null ? `${Math.round(pct * 100)}%` : null
  if (kind === 'over') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-red-500/15 text-red-300 border border-red-500/40">
        <ShieldAlert className="w-3 h-3" />
        Limite atteinte {pctLabel && `(${pctLabel})`}
      </span>
    )
  }
  if (kind === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40">
        <AlertTriangle className="w-3 h-3" />
        Proche {pctLabel && `(${pctLabel})`}
      </span>
    )
  }
  if (kind === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-300/80 border border-emerald-500/30">
        <CheckCircle2 className="w-3 h-3" />
        OK {pctLabel && pctLabel}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/5 text-white/30 border border-white/10">
      sans budget
    </span>
  )
}

function BudgetEditor({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value !== null ? String(value) : '')

  useEffect(() => {
    if (!editing) setDraft(value !== null ? String(value) : '')
  }, [value, editing])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed === '') {
      onChange(null)
    } else {
      const n = Number(trimmed.replace(',', '.'))
      onChange(Number.isFinite(n) && n > 0 ? n : null)
    }
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        title={`Définir un seuil d'alerte mensuel pour ${label} — local, ne recharge pas le compte`}
        className="group inline-flex items-center gap-1 text-[10px] text-white/40 hover:text-indigo-300 transition-colors"
      >
        <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100" />
        {typeof value === 'number' ? `Alerte : ${value.toFixed(2)} $/mois` : 'Définir alerte'}
      </button>
    )
  }
  return (
    <div className="inline-flex items-center gap-1">
      <input
        type="number"
        autoFocus
        inputMode="decimal"
        step="0.5"
        min="0"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(value !== null ? String(value) : ''); setEditing(false) }
        }}
        placeholder="∞"
        className="w-16 bg-white/5 border border-indigo-500/40 rounded px-1.5 py-0.5 text-[10px] text-white font-mono focus:outline-none focus:border-indigo-500"
      />
      <span className="text-[10px] text-white/30">$/mois</span>
    </div>
  )
}

function ProgressBar({ pct, kind }: { pct: number; kind: BadgeKind }) {
  const clamped = Math.min(100, pct * 100)
  const barColor =
    kind === 'over' ? 'bg-red-500' :
    kind === 'warning' ? 'bg-amber-500' :
    kind === 'ok' ? 'bg-emerald-500' :
    'bg-white/20'
  return (
    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
      <div className={`h-full ${barColor} transition-all`} style={{ width: `${clamped}%` }} />
    </div>
  )
}

export function LiveLlmUsagePanel() {
  const { data: stats, isLoading, isFetching, refetch, dataUpdatedAt } = useUsageStats()
  const { data: bdAccount, isFetching: isFetchingBd, refetch: refetchBd, error: bdError } = useBrightDataAccount()
  const budgets = useAiSettingsStore((s) => s.monthlyBudgetUsd)
  const setBudget = useAiSettingsStore((s) => s.setMonthlyBudgetUsd)
  const brightDataBudget = useAiSettingsStore((s) => s.brightDataBudgetUsd)
  const setBrightDataBudget = useAiSettingsStore((s) => s.setBrightDataBudgetUsd)
  const selectedModel = useAiSettingsStore((s) => s.selectedModel)

  // Auto-refresh toutes les 15s pour la "vue live"
  useEffect(() => {
    const t = setInterval(() => refetch(), 15_000)
    return () => clearInterval(t)
  }, [refetch])

  type Row = {
    key: string
    provider: AiProvider
    /** Titre principal — généralement le label du modèle (ex: "Gemini 3.1 Pro Preview"). */
    title: string
    /** Sous-titre fin sous le titre (ex: provider, pricing). */
    subtitle: string
    tokensIn: number
    tokensOut: number
    costUsd: number
    budget: number | null
    pct: number | null
    kind: BadgeKind
    pricing?: { input: number; output: number }
    /** True pour les sous-lignes d'un même provider — le budget/alerte appartient
     *  à la ligne principale pour ne pas dupliquer le contrôle. */
    isSubRow?: boolean
  }

  const rows = useMemo<Row[]>(() => {
    if (!stats) return []
    const result: Row[] = []
    for (const p of PROVIDERS) {
      const u = stats.aiCost.byProvider[p]
      const budget = budgets[p]
      // Le pct/kind reste basé sur le coût provider total (pas par modèle) —
      // l'alerte budgétaire suit le provider, pas un modèle isolé.
      const pct = budget !== null && budget > 0 ? u.costUsd / budget : null
      const kind = getBadgeKind(u.costUsd, budget)
      const selectedModelId = selectedModel[p] ?? getSelectedModel(p)
      const selectedInfo = AI_MODELS[p].find((m) => m.id === selectedModelId)

      // Cas spécial Gemini : on émet 1 ligne pour le texte (modèle sélectionné)
      // + 1 ligne pour le modèle image. Les autres providers gardent 1 ligne.
      if (p === 'gemini') {
        const textLeaf = u.byModel[selectedModelId]
        // Fallback : si pas de byModel (anciennes écritures), on attribue tout
        // au texte et on soustrait ce qu'on a vu côté image pour ne pas double-compter.
        const imageLeaf = u.byModel[GEMINI_IMAGE_MODEL_ID]
        const hasByModel = Object.keys(u.byModel).length > 0
        const textTokensIn  = textLeaf?.tokensIn  ?? (hasByModel ? 0 : u.tokensIn  - (imageLeaf?.tokensIn  ?? 0))
        const textTokensOut = textLeaf?.tokensOut ?? (hasByModel ? 0 : u.tokensOut - (imageLeaf?.tokensOut ?? 0))
        const textCostUsd   = textLeaf?.costUsd   ?? (hasByModel ? 0 : u.costUsd   - (imageLeaf?.costUsd   ?? 0))
        result.push({
          key: `${p}-text`,
          provider: p,
          title: selectedInfo?.label ?? selectedModelId,
          subtitle: 'Gemini (Google) · texte',
          tokensIn:  textTokensIn,
          tokensOut: textTokensOut,
          costUsd:   textCostUsd,
          budget,
          pct,
          kind,
          pricing: selectedInfo?.pricing,
        })
        const imageInfo = AI_MODELS.gemini.find((m) => m.id === GEMINI_IMAGE_MODEL_ID)
        result.push({
          key: `${p}-image`,
          provider: p,
          title: imageInfo?.label ?? 'Gemini 3.1 Flash Image',
          subtitle: 'Gemini (Google) · image (Nano Banana 2)',
          tokensIn:  imageLeaf?.tokensIn  ?? 0,
          tokensOut: imageLeaf?.tokensOut ?? 0,
          costUsd:   imageLeaf?.costUsd   ?? 0,
          budget,
          pct,
          kind,
          pricing: imageInfo?.pricing,
          isSubRow: true,
        })
        continue
      }

      result.push({
        key: p,
        provider: p,
        title: PROVIDER_META[p].label,
        subtitle: selectedInfo?.label ?? selectedModelId,
        tokensIn: u.tokensIn,
        tokensOut: u.tokensOut,
        costUsd: u.costUsd,
        budget,
        pct,
        kind,
        pricing: selectedInfo?.pricing,
      })
    }
    return result
  }, [stats, budgets, selectedModel])

  const brightDataRow = useMemo(() => {
    const localRequests = stats?.brightData.requests ?? 0
    const localCostUsd = stats?.brightData.costUsd ?? 0
    // Si l'API BD répond, on utilise le coût LIVE (vérité absolue) ; sinon on
    // tombe sur notre compteur Firestore (sous-estimé tant que recordBrightDataUsage
    // n'a pas eu le temps d'accumuler).
    const consumedUsd = bdAccount?.consumedThisMonthUsd ?? localCostUsd
    const budget = brightDataBudget
    const pct = budget !== null && budget > 0 ? consumedUsd / budget : null
    const kind = getBadgeKind(consumedUsd, budget)
    return {
      localRequests,
      consumedUsd,
      balanceUsd: bdAccount?.balanceUsd ?? null,
      pendingBalanceUsd: bdAccount?.pendingBalanceUsd ?? null,
      accountStatus: bdAccount?.accountStatus ?? null,
      nextBillingDate: bdAccount?.nextBillingDate ?? null,
      nextBillingDateFromApi: bdAccount?.nextBillingDateFromApi ?? false,
      isLive: bdAccount?.consumedThisMonthUsd !== null && bdAccount?.consumedThisMonthUsd !== undefined,
      apiErrors: bdAccount?.errors ?? {},
      budget,
      pct,
      kind,
    }
  }, [stats, brightDataBudget, bdAccount])

  const hasBdApiErrors = useMemo(() => {
    const e = brightDataRow.apiErrors as Record<string, string | undefined>
    return !!(e.balance ?? e.zoneCost)
  }, [brightDataRow.apiErrors])

  const grandTotalUsd = useMemo(
    () => rows.reduce((s, r) => s + r.costUsd, 0) + brightDataRow.consumedUsd,
    [rows, brightDataRow.consumedUsd],
  )
  const grandTokensIn = useMemo(() => rows.reduce((s, r) => s + r.tokensIn, 0), [rows])
  const grandTokensOut = useMemo(() => rows.reduce((s, r) => s + r.tokensOut, 0), [rows])
  // Alertes : on compte une fois par provider (pas par sous-ligne) pour ne pas
  // doubler le décompte quand un provider est éclaté en plusieurs modèles.
  const mainRows = useMemo(() => rows.filter((r) => !r.isSubRow), [rows])
  const overCount =
    mainRows.filter((r) => r.kind === 'over').length +
    (brightDataRow.kind === 'over' ? 1 : 0)
  const warnCount =
    mainRows.filter((r) => r.kind === 'warning').length +
    (brightDataRow.kind === 'warning' ? 1 : 0)

  const updatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  return (
    <aside
      aria-label="Consommation IA en temps réel"
      className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 flex flex-col gap-4 max-h-[calc(100dvh-10rem)]"
    >
      <header className="flex items-start justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="w-4 h-4 text-emerald-400" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white">Consommation IA & Scraping — live</h3>
            <p className="text-[10px] text-white/30">
              Vue globale des coûts ce mois · {updatedLabel ? `MAJ ${updatedLabel}` : '—'}
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          title="Rafraîchir maintenant"
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-white/50 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Bandeau global */}
      <div className="grid grid-cols-3 gap-2 text-[10px] shrink-0">
        <div className="bg-white/[0.03] rounded-lg px-3 py-2 border border-white/5">
          <p className="text-white/30 uppercase tracking-wider">Total ce mois</p>
          <p className="text-base font-mono text-white mt-0.5">{formatEur(grandTotalUsd)}</p>
          <p className="text-[9px] text-white/30 mt-0.5">≈ ${grandTotalUsd.toFixed(4)} USD</p>
        </div>
        <div className="bg-white/[0.03] rounded-lg px-3 py-2 border border-white/5">
          <p className="text-white/30 uppercase tracking-wider">Tokens in / out</p>
          <p className="text-base font-mono text-white mt-0.5">
            {formatTokens(grandTokensIn)}
            <span className="text-white/30"> / </span>
            {formatTokens(grandTokensOut)}
          </p>
          <p className="text-[9px] text-white/30 mt-0.5">tous providers cumulés</p>
        </div>
        <div className="bg-white/[0.03] rounded-lg px-3 py-2 border border-white/5">
          <p className="text-white/30 uppercase tracking-wider">Alertes</p>
          {overCount === 0 && warnCount === 0 ? (
            <p className="text-base font-mono text-emerald-400 mt-0.5">OK</p>
          ) : (
            <p className="text-base font-mono mt-0.5">
              {overCount > 0 && <span className="text-red-400">{overCount} dépassé{overCount > 1 ? 's' : ''}</span>}
              {overCount > 0 && warnCount > 0 && <span className="text-white/30"> · </span>}
              {warnCount > 0 && <span className="text-amber-400">{warnCount} proche{warnCount > 1 ? 's' : ''}</span>}
            </p>
          )}
          <p className="text-[9px] text-white/30 mt-0.5">≥ 80% = warning · ≥ 100% = over</p>
        </div>
      </div>

      {/* Liste scrollable — l'en-tête et les cartes KPI ci-dessus restent fixes. */}
      <div className="flex-1 min-h-0 overflow-y-auto -mr-2 pr-2 flex flex-col gap-4">
        {/* Tableau par provider */}
        <div className="flex flex-col">
        <div className="grid grid-cols-12 gap-2 px-2 py-1.5 text-[9px] text-white/30 uppercase tracking-wider border-b border-white/5">
          <div className="col-span-4">Provider</div>
          <div className="col-span-3 text-right">Tokens (in / out)</div>
          <div className="col-span-2 text-right">Coût</div>
          <div className="col-span-3 text-right">Statut</div>
        </div>

        {isLoading && (
          <div className="flex flex-col gap-1 mt-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-white/[0.02] rounded animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && rows.map((row) => {
          const hasUsage = row.tokensIn > 0 || row.tokensOut > 0
          const meta = PROVIDER_META[row.provider]
          return (
            <div
              key={row.key}
              className={`grid grid-cols-12 gap-2 items-center px-2 py-2 border-b border-white/5 last:border-0 ${
                row.kind === 'over' && !row.isSubRow ? 'bg-red-500/5' :
                row.kind === 'warning' && !row.isSubRow ? 'bg-amber-500/[0.04]' : ''
              }`}
            >
              <div className={`col-span-4 flex items-center gap-2 min-w-0 ${row.isSubRow ? 'pl-4' : ''}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} shrink-0 ${row.isSubRow ? 'opacity-50' : ''}`} />
                <div className="min-w-0">
                  <a
                    href={meta.topup}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Ouvrir la console ${meta.label} — recharger les crédits chez le provider`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-white/80 hover:text-indigo-300 transition-colors truncate"
                  >
                    <span className="truncate">{row.title}</span>
                    <ExternalLink className="w-2.5 h-2.5 text-white/40 hover:text-indigo-300 shrink-0" />
                  </a>
                  <p className="text-[9.5px] text-white/30 font-mono truncate">{row.subtitle}</p>
                </div>
              </div>
              <div className="col-span-3 text-right">
                <p className={`text-[11px] font-mono ${hasUsage ? 'text-white/70' : 'text-white/20'}`}>
                  {formatTokens(row.tokensIn)} <span className="text-white/30">/</span> {formatTokens(row.tokensOut)}
                </p>
                {row.pricing && (
                  <p className="text-[9px] font-mono text-white/20">
                    ${row.pricing.input}/{row.pricing.output} par M tokens
                  </p>
                )}
              </div>
              <div className="col-span-2 text-right">
                <p className={`text-[11px] font-mono ${hasUsage ? 'text-white/80' : 'text-white/20'}`}>
                  {formatEur(row.costUsd)}
                </p>
                <p className="text-[9px] font-mono text-white/30">${row.costUsd.toFixed(4)}</p>
              </div>
              <div className="col-span-3 flex flex-col items-end gap-1">
                {row.isSubRow ? (
                  // Sous-ligne : pas de budget/alerte propre (partagé avec le provider).
                  <span className="text-[9px] text-white/30 italic">budget partagé</span>
                ) : (
                  <>
                    <StatusBadge kind={row.kind} pct={row.pct} />
                    <BudgetEditor
                      label={meta.label}
                      value={row.budget}
                      onChange={(v) => setBudget(row.provider, v)}
                    />
                    {row.budget !== null && row.pct !== null && (
                      <ProgressBar pct={row.pct} kind={row.kind} />
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}

        {/* Section Scraping — Bright Data Web Unlocker */}
        <div className="grid grid-cols-12 gap-2 px-2 pt-3 pb-1.5 text-[9px] text-white/30 uppercase tracking-wider border-t border-white/10 mt-2">
          <div className="col-span-9">Scraping (server-side)</div>
          <div className="col-span-3 flex justify-end items-center gap-1.5">
            <button
              onClick={() => refetchBd()}
              disabled={isFetchingBd}
              title="Rafraîchir le statut Bright Data"
              className="text-white/30 hover:text-orange-300 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-2.5 h-2.5 ${isFetchingBd ? 'animate-spin' : ''}`} />
            </button>
            <a
              href="https://brightdata.com/cp/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              title="Ouvrir le dashboard Bright Data"
              className="text-white/30 hover:text-orange-300 transition-colors inline-flex items-center gap-0.5"
            >
              dashboard <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        </div>

        {!isLoading && (
          <div
            className={`flex flex-col gap-2 px-2 py-3 border-b border-white/5 last:border-0 ${
              brightDataRow.kind === 'over' ? 'bg-red-500/5' :
              brightDataRow.kind === 'warning' ? 'bg-amber-500/[0.04]' : ''
            }`}
          >
            {/* Ligne 1 : Identité + statut + budget */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <Globe className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <div className="min-w-0">
                  <a
                    href="https://brightdata.com/cp/setting/billing"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Ouvrir la facturation Bright Data — recharger le solde"
                    className="inline-flex items-center gap-1 text-xs font-medium text-white/80 hover:text-orange-300 transition-colors truncate"
                  >
                    <span className="truncate">Bright Data</span>
                    <ExternalLink className="w-2.5 h-2.5 text-white/40 hover:text-orange-300 shrink-0" />
                  </a>
                  <p className="text-[9.5px] text-white/30 font-mono truncate">Web Unlocker</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <StatusBadge kind={brightDataRow.kind} pct={brightDataRow.pct} />
                <BudgetEditor
                  label="Bright Data"
                  value={brightDataRow.budget}
                  onChange={setBrightDataBudget}
                />
                {brightDataRow.budget !== null && brightDataRow.pct !== null && (
                  <div className="w-24"><ProgressBar pct={brightDataRow.pct} kind={brightDataRow.kind} /></div>
                )}
              </div>
            </div>

            {/* Ligne 2 : 4 mini-cards Solde / Consommé / Prochaine facture / Statut */}
            <div className="grid grid-cols-4 gap-1.5">
              {/* Solde */}
              <div className="bg-white/[0.03] rounded-md px-2 py-1.5 border border-white/5">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-[9px] text-white/30 uppercase tracking-wider">Solde</p>
                  <a
                    href="https://brightdata.com/cp/setting/billing"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Recharger le solde Bright Data"
                    className="text-[9px] text-white/30 hover:text-orange-300 inline-flex items-center gap-0.5 transition-colors"
                  >
                    recharger <ExternalLink className="w-2 h-2" />
                  </a>
                </div>
                {brightDataRow.balanceUsd !== null ? (
                  <>
                    <p className="text-sm font-mono text-white/90 leading-tight">
                      ${brightDataRow.balanceUsd.toFixed(2)}
                    </p>
                    {brightDataRow.pendingBalanceUsd !== null && brightDataRow.pendingBalanceUsd > 0 ? (
                      <p className="text-[9px] font-mono text-white/30">
                        +${brightDataRow.pendingBalanceUsd.toFixed(2)} pending
                      </p>
                    ) : (
                      <p className="text-[9px] font-mono text-emerald-400/70">live</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm font-mono text-white/20 leading-tight">—</p>
                )}
              </div>

              {/* Consommé */}
              <div className="bg-white/[0.03] rounded-md px-2 py-1.5 border border-white/5">
                <p className="text-[9px] text-white/30 uppercase tracking-wider">Consommé</p>
                <p className={`text-sm font-mono leading-tight ${brightDataRow.consumedUsd > 0 ? 'text-white/90' : 'text-white/30'}`}>
                  ${brightDataRow.consumedUsd.toFixed(2)}
                </p>
                <p className="text-[9px] font-mono text-white/30">
                  {formatEur(brightDataRow.consumedUsd)}
                  {brightDataRow.isLive ? (
                    <span className="text-emerald-400/70"> · live</span>
                  ) : brightDataRow.localRequests > 0 ? (
                    <span> · {brightDataRow.localRequests} req local</span>
                  ) : null}
                </p>
              </div>

              {/* Prochaine facture */}
              <div className="bg-white/[0.03] rounded-md px-2 py-1.5 border border-white/5">
                <p className="text-[9px] text-white/30 uppercase tracking-wider">Prochaine facture</p>
                <p className="text-sm font-mono text-white/90 leading-tight">
                  {formatBillingDate(brightDataRow.nextBillingDate)}
                </p>
                <p className="text-[9px] font-mono text-white/30">
                  {brightDataRow.nextBillingDate
                    ? brightDataRow.nextBillingDateFromApi
                      ? <span className="text-emerald-400/70">live</span>
                      : 'estimé (1er du mois)'
                    : '—'}
                </p>
              </div>

              {/* Statut compte */}
              <div className="bg-white/[0.03] rounded-md px-2 py-1.5 border border-white/5">
                <p className="text-[9px] text-white/30 uppercase tracking-wider">Statut compte</p>
                {brightDataRow.accountStatus ? (
                  <>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider mt-0.5 ${
                      /active|ok|enabled/i.test(brightDataRow.accountStatus)
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                        : /suspend|disabled|expired/i.test(brightDataRow.accountStatus)
                          ? 'bg-red-500/15 text-red-300 border border-red-500/40'
                          : 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
                    }`}>
                      {brightDataRow.accountStatus}
                    </span>
                    <p className="text-[9px] font-mono text-emerald-400/70 mt-0.5">live</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-mono text-white/20 leading-tight">—</p>
                    <p className="text-[9px] font-mono text-white/30">token sans scope Account</p>
                  </>
                )}
              </div>
            </div>

            {/* Debug strip : visible uniquement si erreur API ou shape inattendu */}
            {(hasBdApiErrors || bdAccount?.rawBalanceResponse !== undefined) && (
              <details className="text-[9px] text-amber-300/60" open={!hasBdApiErrors && bdAccount?.rawBalanceResponse !== undefined}>
                <summary className="cursor-pointer hover:text-amber-300/90">
                  Debug API
                  {hasBdApiErrors && ` — erreurs : ${Object.keys(brightDataRow.apiErrors).filter((k) => (brightDataRow.apiErrors as Record<string, string | undefined>)[k]).join(', ')}`}
                  {bdAccount?.rawBalanceResponse !== undefined && ' — shape /customer/balance inattendu'}
                </summary>
                <div className="mt-1 px-2 py-1.5 bg-black/30 rounded border border-amber-500/20 font-mono leading-relaxed">
                  {Object.entries(brightDataRow.apiErrors as Record<string, string | undefined>).map(([k, v]) => v ? (
                    <div key={k} className="break-all">
                      <span className="text-amber-300/80">{k}</span>
                      <span className="text-white/40"> · </span>
                      <span className="text-white/60">{v}</span>
                    </div>
                  ) : null)}
                  {bdAccount?.rawBalanceResponse !== undefined && (
                    <div className="mt-1 pt-1 border-t border-white/5">
                      <p className="text-amber-300/80 mb-0.5">Réponse brute /customer/balance :</p>
                      <pre className="text-white/60 whitespace-pre-wrap break-all max-h-32 overflow-auto">
                        {JSON.stringify(bdAccount.rawBalanceResponse, null, 2)}
                      </pre>
                    </div>
                  )}
                  <div className="mt-1 pt-1 border-t border-white/5 text-white/40">
                    Côté serveur : <code className="text-white/60">firebase functions:log --only getBrightDataAccount</code>
                  </div>
                </div>
              </details>
            )}
          </div>
        )}

        {/* Hint quand la CF n'est pas déployée — guide vers le déploiement */}
        {!isLoading && bdError && (
          <div className="px-2 py-1.5 text-[9px] text-amber-300/60 leading-relaxed">
            Données live BD indisponibles ({(bdError as Error).message?.slice(0, 80) || 'CF non déployée'}).
            Déployer : <code className="text-amber-300/80">firebase deploy --only functions:getBrightDataAccount</code>
          </div>
        )}
      </div>

      <p className="text-[9px] text-white/25 leading-relaxed">
        Données agrégées depuis Firestore — collections{' '}
        <code className="text-white/40">aiUsage/{`{user}_${new Date().toISOString().slice(0, 7)}`}</code> et{' '}
        <code className="text-white/40">brightDataUsage/{`{user}_${new Date().toISOString().slice(0, 7)}`}</code>.
        Auto-refresh toutes les 15 s. Les <strong className="text-white/60">alertes</strong> sont des seuils mensuels{' '}
        <em>locaux</em> : elles déclenchent un warning à ≥ 80 % et un état "limite atteinte" à ≥ 100 %, mais ne rechargent pas le compte chez le provider.
        Pour recharger réellement les crédits, cliquer sur le nom du provider <ExternalLink className="inline w-2 h-2 -translate-y-px" />.
      </p>
      </div>
    </aside>
  )
}
