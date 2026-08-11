// Ce que les traitements ont COÛTÉ, fournisseur par fournisseur.
//
// ⚠ Vue COMPACTE et en LECTURE SEULE, volontairement différente de `LiveLlmUsagePanel`
// (Finances) : ici on ne règle pas de budget, on constate. Seuls les fournisseurs ayant
// réellement consommé sont listés — un écran d'exploitation ne montre pas huit lignes à
// zéro pour en cacher deux qui travaillent.
//
// ⚠ Logée à DROITE des boutons d'action, dans la bande restée vide sur toute la largeur :
// le bloc occupait une rangée entière en bas de page pour deux lignes de texte. D'où la
// mise en page en colonnes serrées plutôt qu'en largeurs fixes — elle doit tenir dans une
// demi-largeur d'écran.
//
// ⚠⚠ La consommation est MENSUELLE (`aiUsage/{uid}_{YYYY-MM}`), pas celle du run : c'est
// la seule maille que la base tienne. Le titre le dit, sans quoi on lirait le total du
// mois comme le prix du dernier passage.
import { useQuery } from '@tanstack/react-query'
import { Coins, ExternalLink } from 'lucide-react'
import { useUsageStats } from '@/features/stats/useUsageStats'
import { fetchProviderBalances } from '@/features/stats/providerBalances'
import { PROVIDER_META, PROVIDERS } from '@/features/stats/providerMeta'
import { formatTokens } from '@/features/stats/usageFormat'
import { formatEur } from '@/lib/money'
import { useTranslation } from '@/lib/i18n'

export function OpsLlmCosts() {
  const { t } = useTranslation()
  const { data: stats } = useUsageStats()
  // Soldes réels chez les fournisseurs — même requête que l'écran Finances, mise en cache
  // par React Query : deux écrans ouverts ne tapent pas deux fois les API.
  const { data: balances } = useQuery({
    queryKey: ['provider-balances'],
    queryFn: fetchProviderBalances,
    staleTime: 5 * 60_000,
  })

  const rows = PROVIDERS
    .map((p) => ({ provider: p, usage: stats?.aiCost.byProvider[p] }))
    .filter((r) => (r.usage?.costUsd ?? 0) > 0 || (r.usage?.tokensIn ?? 0) > 0)

  // Rien consommé ce mois-ci : pas de bloc vide, l'absence se lit d'elle-même.
  if (rows.length === 0) return null

  const total = rows.reduce((n, r) => n + (r.usage?.costUsd ?? 0), 0)

  return (
    <div className="bg-surface rounded-lg px-3.5 py-2.5 min-w-0" data-pw-section="ops-costs">
      <div className="flex items-baseline gap-2 mb-1.5">
        <Coins className="w-3.5 h-3.5 text-white/40 self-center shrink-0" />
        <h3 className="text-[12px] font-semibold text-white whitespace-nowrap">{t('ops.costs.title')}</h3>
        <span className="text-[10px] text-white/40 whitespace-nowrap">{t('ops.costs.month')}</span>
        <span className="ml-auto text-[12px] tabular-nums text-white font-semibold">{formatEur(total)}</span>
      </div>

      <div className="space-y-0.5">
        {rows.map(({ provider, usage }) => {
          const meta = PROVIDER_META[provider]
          const balance = balances?.[provider]
          return (
            <div key={provider} className="flex items-center gap-2 text-[11px] min-w-0">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
              <a href={meta.topup} target="_blank" rel="noopener noreferrer"
                className="shrink-0 truncate text-white/70 hover:text-white inline-flex items-center gap-1">
                {meta.label}
                <ExternalLink className="w-2.5 h-2.5 opacity-40" />
              </a>
              {/* Tokens lus / écrits : le volume derrière la facture. Premier sacrifié
                  quand la place manque — le coût, lui, ne se cache jamais. */}
              <span className="tabular-nums text-white/35 whitespace-nowrap hidden lg:inline">
                {formatTokens(usage?.tokensIn ?? 0)} / {formatTokens(usage?.tokensOut ?? 0)}
              </span>
              <span className="ml-auto tabular-nums text-white/80 whitespace-nowrap">
                {formatEur(usage?.costUsd ?? 0)}
              </span>
              {/* Solde restant chez le fournisseur — l'information qui a manqué toute une
                  journée : deux comptes à sec, et l'écran n'en disait rien. */}
              {typeof balance === 'number' && (
                <span className="tabular-nums text-emerald-300/90 whitespace-nowrap w-24 text-right">
                  ${balance.toFixed(2)}
                  <span className="ml-1 text-white/30">{t('ops.costs.balance')}</span>
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
