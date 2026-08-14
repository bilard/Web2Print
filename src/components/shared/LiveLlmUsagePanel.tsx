import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, Pencil, Globe, ExternalLink, Eraser, Clapperboard } from 'lucide-react'
import { useUsageStats } from '@/features/stats/useUsageStats'
import { fetchProviderBalances } from '@/features/stats/providerBalances'
import { useBrightDataAccount } from '@/features/stats/useBrightDataAccount'
import { useFirecrawlAccount } from '@/features/stats/useFirecrawlAccount'
import { ScrapeUsageCards } from './ScrapeUsageCards'
import { formatEur } from '@/lib/money'
import { getBadgeKind, formatTokens, formatBillingDate, type BadgeKind } from '@/features/stats/usageFormat'
import { useIsOwner } from '@/features/auth/useAuth'
import { useAiSettingsStore, getSelectedModel } from '@/stores/aiSettings.store'
import { resolveModelCost, resolveProviderCost } from '@/features/stats/modelCost'
import { AI_MODELS, getModel, type AiProvider } from '@/lib/aiModels'
// ⚠ Partagés avec l'écran « Suivi », qui liste les mêmes fournisseurs.
import { PROVIDER_META, PROVIDERS } from '@/features/stats/providerMeta'
import { recordAudit } from '@/lib/auditLog'
import { useTranslation } from '@/lib/i18n'


/** Modèle image Gemini (Image IA). Affiché sur sa propre ligne sous le
 *  modèle texte Gemini sélectionné — il a son propre pricing ($30 / 1M output)
 *  et il est utile de voir sa consommation isolément. */
const GEMINI_IMAGE_MODEL_ID = 'gemini-3.1-flash-image-preview'

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
  const { t } = useTranslation()
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
        title={t('live.setAlert.title', { label })}
        className="group inline-flex items-center gap-1 text-[10px] text-white/40 hover:text-indigo-300 transition-colors"
      >
        <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100" />
        {typeof value === 'number' ? t('live.alertValue', { value: value.toFixed(2) }) : t('live.setAlert')}
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

/** Le modèle qui a réellement consommé le plus chez ce fournisseur, ou `null` si le détail
 *  par modèle manque (écritures antérieures à `byModel`).
 *
 *  ⚠ Le sous-titre de chaque ligne montrait le modèle SÉLECTIONNÉ dans les Réglages — or la
 *  dépense vient de ce qui a TOURNÉ, pas de ce qui est coché. DeepSeek s'annonçait
 *  « DeepSeek Chat (V4) » au-dessus de 1,18 M de tokens consommés par `deepseek-v4-flash`,
 *  un modèle que l'écran ne nommait nulle part. */
function dominantModel(byModel: Record<string, { tokensIn: number; tokensOut: number }>): string | null {
  let best: string | null = null
  let bestTokens = 0
  for (const [id, leaf] of Object.entries(byModel)) {
    const tokens = leaf.tokensIn + leaf.tokensOut
    if (tokens > bestTokens) { best = id; bestTokens = tokens }
  }
  return best
}

export function LiveLlmUsagePanel() {
  const { t } = useTranslation()
  const { data: stats, isLoading, isFetching, refetch, dataUpdatedAt } = useUsageStats()
  const { data: bdAccount, isFetching: isFetchingBd, refetch: refetchBd, error: bdError } = useBrightDataAccount()
  // Firecrawl : clé PERSONNELLE → pas de gating propriétaire, contrairement à Bright Data.
  const { data: firecrawlAccount } = useFirecrawlAccount()
  // Le compte Bright Data est partagé (un seul abonnement) → ses infos financières
  // (solde/conso/facturation/statut) ne s'affichent que pour le propriétaire.
  const isOwner = useIsOwner()
  const budgets = useAiSettingsStore((s) => s.monthlyBudgetUsd)
  const setBudget = useAiSettingsStore((s) => s.setMonthlyBudgetUsd)
  const brightDataBudget = useAiSettingsStore((s) => s.brightDataBudgetUsd)
  const setBrightDataBudget = useAiSettingsStore((s) => s.setBrightDataBudgetUsd)
  const selectedModel = useAiSettingsStore((s) => s.selectedModel)
  // Soldes RÉELS via API (DeepSeek + OpenRouter) ; rafraîchis avec le panneau.
  const { data: balances } = useQuery({
    queryKey: ['providerBalances'],
    queryFn: fetchProviderBalances,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

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
    /** Le coût affiché a été RELEVÉ par recalcul : la base le sous-comptait (tarif ajouté
     *  au catalogue après les appels). Le montant est bon, il ne vient pas d'un relevé. */
    estimated?: boolean
    /** Des tokens consommés qu'AUCUN tarif ne permet de chiffrer : le montant manque. */
    unpriced?: boolean
  }


  const rows = useMemo<Row[]>(() => {
    if (!stats) return []
    const result: Row[] = []
    for (const p of PROVIDERS) {
      const u = stats.aiCost.byProvider[p]
      const budget = budgets[p]
      // ⚠⚠ Le coût AFFICHÉ n'est pas celui que la base porte tel quel : `recordAiUsage`
      // tarife au moment de l'appel, et un modèle absent du catalogue s'y écrit à zéro —
      // ou, pire, à une fraction du vrai montant quand le tarif arrive en cours de mois.
      // Mesuré ici même : 1,18 M de tokens DeepSeek facturés « 0,0034 € ». Le rattrapage
      // est celui de l'écran « Suivi », au mot près (`resolveModelCost`).
      const costUsd = resolveProviderCost(p, u)
      // Le pct/kind reste basé sur le coût provider total (pas par modèle) —
      // l'alerte budgétaire suit le provider, pas un modèle isolé.
      const pct = budget !== null && budget > 0 ? costUsd / budget : null
      const kind = getBadgeKind(costUsd, budget)
      const selectedModelId = selectedModel[p] ?? getSelectedModel(p)
      const selectedInfo = AI_MODELS[p].find((m) => m.id === selectedModelId)
      // Ce qui a réellement tourné prime sur ce qui est coché dans les Réglages.
      const usedModelId = dominantModel(u.byModel)
      const usedInfo = usedModelId ? getModel(p, usedModelId) : null
      // Sur TOUS les modèles du fournisseur, pas seulement le dominant : un seul modèle non
      // tarifé suffit à rendre le montant incomplet, et l'écran doit le dire.
      const resolved = Object.entries(u.byModel).map(([id, leaf]) => resolveModelCost(p, id, leaf))
      const anyUnpriced = resolved.some((r) => r.unpriced)
      const anyEstimated = resolved.some((r) => r.estimated)

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
        // Rattrapé comme partout ailleurs : le tarif du catalogue prime quand la base a
        // enregistré moins que ce que les tokens valent.
        const textResolved = textLeaf ? resolveModelCost(p, selectedModelId, textLeaf) : null
        const imageResolved = imageLeaf ? resolveModelCost(p, GEMINI_IMAGE_MODEL_ID, imageLeaf) : null
        const textCostUsd   = textResolved?.costUsd ?? (hasByModel ? 0 : u.costUsd - (imageLeaf?.costUsd ?? 0))
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
          ...(textResolved?.estimated ? { estimated: true } : {}),
          ...(textResolved?.unpriced ? { unpriced: true } : {}),
        })
        const imageInfo = AI_MODELS.gemini.find((m) => m.id === GEMINI_IMAGE_MODEL_ID)
        result.push({
          key: `${p}-image`,
          provider: p,
          title: imageInfo?.label ?? 'Gemini 3.1 Flash Image',
          subtitle: 'Gemini (Google) · image (Image IA)',
          tokensIn:  imageLeaf?.tokensIn  ?? 0,
          tokensOut: imageLeaf?.tokensOut ?? 0,
          costUsd:   imageResolved?.costUsd ?? 0,
          budget,
          pct,
          kind,
          pricing: imageInfo?.pricing,
          isSubRow: true,
          ...(imageResolved?.estimated ? { estimated: true } : {}),
          ...(imageResolved?.unpriced ? { unpriced: true } : {}),
        })
        continue
      }

      result.push({
        key: p,
        provider: p,
        title: PROVIDER_META[p].label,
        // Le modèle qui a CONSOMMÉ, sinon celui qui est coché (rien n'a encore tourné).
        subtitle: usedModelId ? (usedInfo?.label ?? usedModelId) : (selectedInfo?.label ?? selectedModelId),
        tokensIn: u.tokensIn,
        tokensOut: u.tokensOut,
        costUsd,
        budget,
        pct,
        kind,
        pricing: usedInfo?.pricing ?? selectedInfo?.pricing,
        ...(anyEstimated ? { estimated: true } : {}),
        ...(anyUnpriced ? { unpriced: true } : {}),
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

  // Remove.bg : conso PER-USER (clé propre à chaque utilisateur) → compteur Firestore
  // removebgUsage, pas un compte partagé. Pas d'API solde live (l'API ne l'expose pas).
  const removeBgRow = useMemo(() => {
    const images = stats?.removebg.images ?? 0
    const credits = stats?.removebg.credits ?? 0
    const consumedUsd = stats?.removebg.costUsd ?? 0
    return { images, credits, consumedUsd }
  }, [stats])

  const hasBdApiErrors = useMemo(() => {
    const e = brightDataRow.apiErrors as Record<string, string | undefined>
    return !!(e.balance ?? e.zoneCost)
  }, [brightDataRow.apiErrors])

  // Dépense des plateformes de scraping à l'usage (Jina, Firecrawl) : elle s'affiche
  // désormais dans la section Scraping, donc elle doit entrer dans le total — un montant
  // visible en carte mais absent du cumul fait mentir le bandeau « Total ce mois ».
  const scrapeUsd = useMemo(
    () => Object.values(stats?.scrape.byPlatform ?? {}).reduce((s, u) => s + u.costUsd, 0),
    [stats],
  )

  const grandTotalUsd = useMemo(
    () => rows.reduce((s, r) => s + r.costUsd, 0) + brightDataRow.consumedUsd + removeBgRow.consumedUsd + scrapeUsd,
    [rows, brightDataRow.consumedUsd, removeBgRow.consumedUsd, scrapeUsd],
  )
  // Au moins un modèle dont on ne sait pas chiffrer les tokens : le total n'est plus un
  // total, c'est un plancher — et il doit le dire, comme sur l'écran « Suivi ».
  const totalIsFloor = useMemo(() => rows.some((r) => r.unpriced), [rows])
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
      aria-label={t('live.aria')}
      className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 flex flex-col gap-4 h-full max-h-full min-h-0"
    >
      <header className="flex items-start justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="w-4 h-4 text-emerald-400" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white">{t('live.title')}</h3>
            <p className="text-[10px] text-white/30">
              {t('live.subtitle', { updated: updatedLabel ? t('live.updated', { time: updatedLabel }) : '—' })}
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          title={t('live.refresh')}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-white/50 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Bandeau global */}
      <div className="grid grid-cols-3 gap-2 text-[10px] shrink-0">
        <div className="bg-white/[0.03] rounded-lg px-3 py-2 border border-white/5">
          <p className="text-white/30 uppercase tracking-wider">{t('live.totalMonth')}</p>
          <p className="text-base font-mono text-white mt-0.5">
            {totalIsFloor && (
              <span className="text-[10px] text-amber-300/80 mr-1" title={t('ops.costs.noPricing.hint')}>
                {t('ops.costs.atLeast')}
              </span>
            )}
            {formatEur(grandTotalUsd)}
          </p>
          <p className="text-[9px] text-white/30 mt-0.5">≈ ${grandTotalUsd.toFixed(4)} USD</p>
        </div>
        <div className="bg-white/[0.03] rounded-lg px-3 py-2 border border-white/5">
          <p className="text-white/30 uppercase tracking-wider">{t('live.tokens')}</p>
          <p className="text-base font-mono text-white mt-0.5">
            {formatTokens(grandTokensIn)}
            <span className="text-white/30"> / </span>
            {formatTokens(grandTokensOut)}
          </p>
          <p className="text-[9px] text-white/30 mt-0.5">{t('live.allProviders')}</p>
        </div>
        <div className="bg-white/[0.03] rounded-lg px-3 py-2 border border-white/5">
          <p className="text-white/30 uppercase tracking-wider">{t('live.alerts')}</p>
          {overCount === 0 && warnCount === 0 ? (
            <p className="text-base font-mono text-emerald-400 mt-0.5">{t('live.ok')}</p>
          ) : (
            <p className="text-base font-mono mt-0.5">
              {overCount > 0 && <span className="text-red-400">{t(overCount === 1 ? 'live.overCount.one' : 'live.overCount.other', { count: overCount })}</span>}
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
          <div className="col-span-3">{t('live.col.provider')}</div>
          <div className="col-span-3 text-right">{t('live.col.tokens')}</div>
          <div className="col-span-2 text-right">{t('live.col.cost')}</div>
          <div className="col-span-2 text-right">{t('live.col.budget')}</div>
          <div className="col-span-2 text-right">{t('live.col.status')}</div>
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
              <div className={`col-span-3 flex items-center gap-2 min-w-0 ${row.isSubRow ? 'pl-4' : ''}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} shrink-0 ${row.isSubRow ? 'opacity-50' : ''}`} />
                <div className="min-w-0">
                  <a
                    href={meta.topup}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t('live.providerConsole', { label: meta.label })}
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
                {/* ⚠⚠ D'où vient le montant. Un coût enregistré peut être MUET sur ce qu'il
                    ne couvre pas : mesuré ici, 1,18 M de tokens facturés « 0,0034 € » parce
                    que le tarif n'est arrivé au catalogue qu'en cours de mois. */}
                {row.unpriced ? (
                  <p className="text-[9px] font-mono text-amber-300/80" title={t('ops.costs.noPricing.hint')}>
                    {t('ops.costs.noPricing')}
                  </p>
                ) : row.estimated ? (
                  <p className="text-[9px] font-mono text-white/40" title={t('ops.costs.estimated.hint')}>
                    ≈ ${row.costUsd.toFixed(4)} · {t('ops.costs.recomputed')}
                  </p>
                ) : (
                  <p className="text-[9px] font-mono text-white/30">${row.costUsd.toFixed(4)}</p>
                )}
              </div>
              {/* Budget disponible : solde RÉEL (API DeepSeek/OpenRouter) sinon restant
                  = budget mensuel − dépensé ; « — » si ni API ni budget saisi. */}
              <div className="col-span-2 text-right">
                {row.isSubRow ? (
                  <span className="text-[10px] text-white/20">—</span>
                ) : balances?.[row.provider] != null ? (
                  <>
                    <p className="text-[11px] font-mono text-emerald-300/90">${(balances[row.provider] as number).toFixed(2)}</p>
                    <p className="text-[8px] text-white/30">{t('live.apiBalance')}</p>
                  </>
                ) : row.budget != null ? (
                  <>
                    <p className="text-[11px] font-mono text-white/70">${Math.max(0, row.budget - row.costUsd).toFixed(2)}</p>
                    <p className="text-[8px] text-white/30">{t('live.remaining')}</p>
                  </>
                ) : (
                  <span className="text-[10px] text-white/20" title={t('live.noBalanceApi')}>—</span>
                )}
              </div>
              <div className="col-span-2 flex flex-col items-end gap-1">
                {row.isSubRow ? (
                  // Sous-ligne : pas de budget/alerte propre (partagé avec le provider).
                  <span className="text-[9px] text-white/30 italic">{t('live.sharedBudget')}</span>
                ) : (
                  <>
                    <StatusBadge kind={row.kind} pct={row.pct} />
                    <BudgetEditor
                      label={meta.label}
                      value={row.budget}
                      onChange={(v) => {
                        if (v !== row.budget) {
                          recordAudit({ action: 'settings.ai.budget', module: 'settings', targetLabel: meta.label, meta: { before: row.budget === null ? 'aucun' : `$${row.budget}`, after: v === null ? 'aucun' : `$${v}` } })
                        }
                        setBudget(row.provider, v)
                      }}
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

        {/* Section Scraping. L'EN-TÊTE est commun ; seul Bright Data est réservé au
            propriétaire (compte partagé → données financières personnelles). Jina et
            Firecrawl s'appuient sur la clé de CHAQUE utilisateur : les masquer reviendrait
            à cacher à quelqu'un sa propre dépense. */}
        <div className="grid grid-cols-12 gap-2 px-2 pt-3 pb-1.5 text-[9px] text-white/30 uppercase tracking-wider border-t border-white/10 mt-2">
          <div className="col-span-9">{t('live.scraping')}</div>
          {isOwner && (
          <div className="col-span-3 flex justify-end items-center gap-1.5">
            <button
              onClick={() => refetchBd()}
              disabled={isFetchingBd}
              title={t('live.bd.refresh')}
              className="text-white/30 hover:text-orange-300 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-2.5 h-2.5 ${isFetchingBd ? 'animate-spin' : ''}`} />
            </button>
            <a
              href="https://brightdata.com/cp/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              title={t('live.bd.dashboard')}
              className="text-white/30 hover:text-orange-300 transition-colors inline-flex items-center gap-0.5"
            >
              dashboard <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
          )}
        </div>

        {isOwner && (<>
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
                    title={t('live.bd.billing')}
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
                  onChange={(v) => {
                    if (v !== brightDataRow.budget) {
                      recordAudit({ action: 'settings.ai.budget', module: 'settings', targetLabel: 'Bright Data', meta: { before: brightDataRow.budget === null ? 'aucun' : `$${brightDataRow.budget}`, after: v === null ? 'aucun' : `$${v}` } })
                    }
                    setBrightDataBudget(v)
                  }}
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
                  <p className="text-[9px] text-white/30 uppercase tracking-wider">{t('live.balance')}</p>
                  <a
                    href="https://brightdata.com/cp/setting/billing"
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t('live.bd.topUp')}
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
                <p className="text-[9px] text-white/30 uppercase tracking-wider">{t('live.consumed')}</p>
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
                <p className="text-[9px] text-white/30 uppercase tracking-wider">{t('live.nextInvoice')}</p>
                <p className="text-sm font-mono text-white/90 leading-tight">
                  {formatBillingDate(brightDataRow.nextBillingDate)}
                </p>
                <p className="text-[9px] font-mono text-white/30">
                  {brightDataRow.nextBillingDate
                    ? brightDataRow.nextBillingDateFromApi
                      ? <span className="text-emerald-400/70">live</span>
                      : t('live.estimated')
                    : '—'}
                </p>
              </div>

              {/* Statut compte */}
              <div className="bg-white/[0.03] rounded-md px-2 py-1.5 border border-white/5">
                <p className="text-[9px] text-white/30 uppercase tracking-wider">{t('live.accountStatus')}</p>
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
                    <p className="text-[9px] font-mono text-white/30">{t('live.noAccountScope')}</p>
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
                      <p className="text-amber-300/80 mb-0.5">{t('live.rawResponse')}</p>
                      <pre className="text-white/60 whitespace-pre-wrap break-all max-h-32 overflow-auto">
                        {JSON.stringify(bdAccount.rawBalanceResponse, null, 2)}
                      </pre>
                    </div>
                  )}
                  <div className="mt-1 pt-1 border-t border-white/5 text-white/40">
                    {t('live.serverSide')}<code className="text-white/60">firebase functions:log --only getBrightDataAccount</code>
                  </div>
                </div>
              </details>
            )}
          </div>
        )}

        {/* Hint quand la CF n'est pas déployée — guide vers le déploiement */}
        {!isLoading && bdError && (
          <div className="px-2 py-1.5 text-[9px] text-amber-300/60 leading-relaxed">
            {t('live.bdUnavailable', { message: (bdError as Error).message?.slice(0, 80) || t('live.cfNotDeployed') })}
            {t('live.deploy')}<code className="text-amber-300/80">firebase deploy --only functions:getBrightDataAccount</code>
          </div>
        )}
        </>)}

        {/* Jina & Firecrawl — facturés à l'usage sur la clé de l'utilisateur. */}
        {!isLoading && (
          <ScrapeUsageCards byPlatform={stats?.scrape.byPlatform ?? {}} firecrawl={firecrawlAccount} />
        )}

        {/* Section Traitement d'images — Remove.bg : conso PER-USER (clé propre à
            chaque utilisateur) → visible par tous, pas owner-gated comme Bright Data. */}
        <div className="grid grid-cols-12 gap-2 px-2 pt-3 pb-1.5 text-[9px] text-white/30 uppercase tracking-wider border-t border-white/10 mt-2">
          <div className="col-span-9">{t('live.imaging')}</div>
        </div>

        {!isLoading && (
          <div className="flex flex-col gap-2 px-2 py-3 border-b border-white/5 last:border-0">
            {/* Ligne 1 : Identité + lien recharge */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <Eraser className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <div className="min-w-0">
                  <a
                    href="https://www.remove.bg/pricing"
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t('live.removebg.billing')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-white/80 hover:text-sky-300 transition-colors truncate"
                  >
                    <span className="truncate">Remove.bg</span>
                    <ExternalLink className="w-2.5 h-2.5 text-white/40 hover:text-sky-300 shrink-0" />
                  </a>
                  <p className="text-[9.5px] text-white/30 font-mono truncate">{t('live.removebg.desc')}</p>
                </div>
              </div>
              <a
                href="https://www.remove.bg/pricing"
                target="_blank"
                rel="noopener noreferrer"
                title={t('live.removebg.topUp')}
                className="text-[9px] text-white/30 hover:text-sky-300 inline-flex items-center gap-0.5 transition-colors"
              >
                recharger <ExternalLink className="w-2 h-2" />
              </a>
            </div>

            {/* Ligne 2 : 2 mini-cards Consommé / Images */}
            <div className="grid grid-cols-2 gap-1.5">
              {/* Consommé */}
              <div className="bg-white/[0.03] rounded-md px-2 py-1.5 border border-white/5">
                <p className="text-[9px] text-white/30 uppercase tracking-wider">{t('live.consumedEstimated')}</p>
                <p className={`text-sm font-mono leading-tight ${removeBgRow.consumedUsd > 0 ? 'text-white/90' : 'text-white/30'}`}>
                  ${removeBgRow.consumedUsd.toFixed(2)}
                </p>
                <p className="text-[9px] font-mono text-white/30">{formatEur(removeBgRow.consumedUsd)}</p>
              </div>

              {/* Images / crédits */}
              <div className="bg-white/[0.03] rounded-md px-2 py-1.5 border border-white/5">
                <p className="text-[9px] text-white/30 uppercase tracking-wider">{t('live.imagesProcessed')}</p>
                <p className={`text-sm font-mono leading-tight ${removeBgRow.images > 0 ? 'text-white/90' : 'text-white/30'}`}>
                  {removeBgRow.images}
                </p>
                <p className="text-[9px] font-mono text-white/30">
                  {removeBgRow.credits > 0 ? t(removeBgRow.credits < 2 ? 'live.credits.one' : 'live.credits.other', { count: removeBgRow.credits.toFixed(2).replace(/\.00$/, '') }) : t('live.thisMonth')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Section Génération IA — Higgsfield : solde géré par le dashboard
            (Clerk Commerce), non accessible par clé API → lien direct. */}
        <div className="grid grid-cols-12 gap-2 px-2 pt-3 pb-1.5 text-[9px] text-white/30 uppercase tracking-wider border-t border-white/10 mt-2">
          <div className="col-span-9">{t('live.aiGeneration')}</div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap px-2 py-3 border-b border-white/5 last:border-0">
          <div className="flex items-center gap-2 min-w-0">
            <Clapperboard className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-white/80">Higgsfield</p>
              <p className="text-[9.5px] text-white/30 font-mono truncate">{t('live.higgsfield.desc')}</p>
            </div>
          </div>
          <a
            href="https://cloud.higgsfield.ai/credits"
            target="_blank"
            rel="noopener noreferrer"
            title={t('live.higgsfield.dashboard')}
            className="text-[10px] text-indigo-300/90 hover:text-indigo-200 inline-flex items-center gap-1 border border-indigo-500/30 bg-indigo-500/10 rounded-md px-2 py-1 transition-colors shrink-0"
          >
            Voir le solde <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>

      <p className="text-[9px] text-white/25 leading-relaxed">
        {t('live.footer.aggregated')}
        <code className="text-white/40">aiUsage/{`{user}_${new Date().toISOString().slice(0, 7)}`}</code>,{' '}
        <code className="text-white/40">brightDataUsage/{`{user}_${new Date().toISOString().slice(0, 7)}`}</code>,{' '}
        <code className="text-white/40">removebgUsage/{`{user}_${new Date().toISOString().slice(0, 7)}`}</code>,{' '}
        <code className="text-white/40">scrapeUsage/{`{user}_${new Date().toISOString().slice(0, 7)}`}</code>.
        {t('live.footer.autoRefresh')}<strong className="text-white/60">{t('live.alertsSuffix')}</strong>
        {t('live.footer.thresholds')}<em>{t('live.localSuffix')}</em>
        {t('live.footer.explain')}<ExternalLink className="inline w-2 h-2 -translate-y-px" />.
      </p>
      </div>
    </aside>
  )
}
