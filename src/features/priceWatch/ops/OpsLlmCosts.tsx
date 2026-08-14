// Ce que les traitements ont COÛTÉ, fournisseur par fournisseur PUIS modèle par modèle.
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
//
// ⚠⚠ UN MODÈLE HORS CATALOGUE EST COMPTÉ ZÉRO. `recordAiUsage` tarife via `getModel()` :
// un identifiant absent d'`AI_MODELS` retombe sur un tarif nul et le coût s'écrit 0 en
// base, sans le moindre signal. Le cas n'est pas théorique — les modèles ramenés par le
// bouton « rafraîchir » des Réglages arrivent TOUS sans tarif, et rien n'empêche de les
// sélectionner. Relevé en production : 1,18 M tokens de sortie DeepSeek affichés
// « 0,000000 € », parce que `deepseek-v4-flash` n'était pas au catalogue. Cet écran
// DÉNONCE donc le cas au lieu de l'afficher comme gratuit, et son total se donne pour un
// minimum tant qu'un modèle manque à l'appel.
import { useQuery } from '@tanstack/react-query'
import { Coins, ExternalLink, AlertTriangle } from 'lucide-react'
import { useUsageStats } from '@/features/stats/useUsageStats'
import { fetchProviderBalances } from '@/features/stats/providerBalances'
import { PROVIDER_META, PROVIDERS } from '@/features/stats/providerMeta'
import { formatTokens } from '@/features/stats/usageFormat'
import { formatEur } from '@/lib/money'
import { useTranslation } from '@/lib/i18n'
import { buildOpsCostRows } from './opsCostRows'

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

  const { rows, totalUsd, partial } = buildOpsCostRows(PROVIDERS, stats?.aiCost)

  // Rien consommé ce mois-ci : pas de bloc vide, l'absence se lit d'elle-même.
  if (rows.length === 0) return null

  return (
    <div className="bg-surface rounded-lg px-3.5 py-2.5 min-w-0" data-pw-section="ops-costs">
      <div className="flex items-baseline gap-2 mb-1.5">
        <Coins className="w-3.5 h-3.5 text-white/40 self-center shrink-0" />
        <h3 className="text-[12px] font-semibold text-white whitespace-nowrap">{t('ops.costs.title')}</h3>
        <span className="text-[10px] text-white/40 whitespace-nowrap">{t('ops.costs.month')}</span>
        <span className="ml-auto text-[12px] tabular-nums text-white font-semibold whitespace-nowrap">
          {partial && <span className="mr-1 text-[10px] font-normal text-amber-300/80">{t('ops.costs.atLeast')}</span>}
          {formatEur(totalUsd)}
        </span>
      </div>

      {/* Les deux nombres de la colonne du milieu ne se devinent pas : ils sont nommés une
          fois pour tout le bloc, plutôt que répétés sur chaque ligne. */}
      <div className="flex items-center gap-2 text-[9px] uppercase tracking-wide text-white/25 mb-0.5">
        <span className="ml-auto hidden lg:inline">{t('ops.costs.header')}</span>
      </div>

      <div className="space-y-1">
        {rows.map(({ provider, tokensIn, tokensOut, costUsd, models }) => {
          const meta = PROVIDER_META[provider]
          const balance = balances?.[provider]
          return (
            <div key={provider}>
              <div className="flex items-center gap-2 text-[11px] min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                <a href={meta.topup} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 truncate text-white/70 hover:text-white inline-flex items-center gap-1">
                  {meta.label}
                  <ExternalLink className="w-2.5 h-2.5 opacity-40" />
                </a>
                {/* Tokens lus / écrits : le volume derrière la facture. Premier sacrifié
                    quand la place manque — le coût, lui, ne se cache jamais. */}
                <span className="tabular-nums text-white/35 whitespace-nowrap hidden lg:inline">
                  {formatTokens(tokensIn)} / {formatTokens(tokensOut)}
                </span>
                <span className="ml-auto tabular-nums text-white/80 whitespace-nowrap">
                  {formatEur(costUsd)}
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

              {/* Le détail par modèle vit DÉJÀ en base (`byModel`) : il était lu puis jeté.
                  C'est lui qui nomme le modèle responsable d'une consommation — et le seul
                  moyen de voir lequel n'est pas tarifé. */}
              {models.map((m) => (
                <div key={m.id} className="flex items-center gap-2 text-[10px] min-w-0 pl-3.5">
                  <span className="truncate text-white/45" title={m.id}>{m.label}</span>
                  <span className="tabular-nums text-white/25 whitespace-nowrap hidden lg:inline">
                    {formatTokens(m.tokensIn)} / {formatTokens(m.tokensOut)}
                  </span>
                  {m.unpriced ? (
                    <span
                      className="ml-auto inline-flex items-center gap-1 whitespace-nowrap text-amber-300/90"
                      title={t('ops.costs.noPricing.hint')}
                    >
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {t('ops.costs.noPricing')}
                    </span>
                  ) : (
                    <span
                      className={`ml-auto tabular-nums whitespace-nowrap ${m.estimated ? 'text-sky-300/80' : 'text-white/50'}`}
                      title={m.estimated ? t('ops.costs.estimated.hint') : undefined}
                    >
                      {m.estimated && <span className="mr-1 text-[9px]">≈</span>}
                      {formatEur(m.costUsd)}
                    </span>
                  )}
                  {typeof balance === 'number' && <span className="w-24 shrink-0" />}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
