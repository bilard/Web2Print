// Cartes de consommation des plateformes de scraping facturées à l'usage (Jina,
// Firecrawl). Elles manquaient au panneau live, qui n'y montrait que Bright Data — or
// la dépense Firecrawl est réelle et son solde est un POOL DE CRÉDITS PRÉPAYÉS : quand
// il tombe à zéro, la recherche dirigée et l'enrichissement s'arrêtent net.
//
// ⚠ Le compteur `scrapeUsage` est alimenté par le NAVIGATEUR seul : les appels Firecrawl
// des Cloud Functions (cron, run serveur, `directedSearch`) n'écrivent nulle part. Le
// « consommé » est donc un plancher, jamais la facture — c'est le solde de crédits, lui
// exact, qui fait foi. La carte le dit plutôt que de laisser croire à un $0.00 rassurant.
import { ExternalLink, Globe } from 'lucide-react'
import type { FirecrawlAccount } from '@/features/stats/useFirecrawlAccount'
import { FIRECRAWL_LOW_CREDITS } from '@/lib/firecrawlCredits'
import { formatEur } from '@/lib/money'
import { useTranslation } from '@/lib/i18n'

export interface ScrapePlatformUsage {
  tokens: number
  requests: number
  costUsd: number
}

/** Plateformes toujours affichées, même à zéro — comme les providers IA plus haut : une
 *  ligne absente se lit « pas branché », une ligne à 0 se lit « rien consommé ». */
const PLATFORMS: { id: string; label: string; desc: string; billing: string; volume: 'tokens' | 'requests' }[] = [
  { id: 'jina', label: 'Jina', desc: 'Reader / Search', billing: 'https://jina.ai/api-dashboard/', volume: 'tokens' },
  { id: 'firecrawl', label: 'Firecrawl', desc: 'Scrape / Extract', billing: 'https://www.firecrawl.dev/app/billing', volume: 'requests' },
]

const fmtInt = (n: number) => n.toLocaleString('fr-FR')

function MiniCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/[0.03] rounded-md px-2 py-1.5 border border-white/5">
      <p className="text-[9px] text-white/30 uppercase tracking-wider">{label}</p>
      {children}
    </div>
  )
}

export function ScrapeUsageCards({ byPlatform, firecrawl }: {
  byPlatform: Record<string, ScrapePlatformUsage>
  /** Solde live du compte Firecrawl (undefined tant qu'aucune clé n'est saisie). */
  firecrawl: FirecrawlAccount | undefined
}) {
  const { t } = useTranslation()
  return (
    <>
      {PLATFORMS.map((p) => {
        const u = byPlatform[p.id] ?? { tokens: 0, requests: 0, costUsd: 0 }
        const isFirecrawl = p.id === 'firecrawl'
        const credits = isFirecrawl ? firecrawl : undefined
        // Crédits bas = la moisson va s'arrêter d'elle-même : la couleur doit alerter
        // avant la panne, pas après.
        const low = credits?.remainingCredits != null && credits.remainingCredits < FIRECRAWL_LOW_CREDITS
        return (
          <div key={p.id} className="flex flex-col gap-2 px-2 py-3 border-b border-white/5 last:border-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <Globe className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <div className="min-w-0">
                  <a
                    href={p.billing}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t('live.scrape.billing', { platform: p.label })}
                    className="inline-flex items-center gap-1 text-xs font-medium text-white/80 hover:text-teal-300 transition-colors truncate"
                  >
                    <span className="truncate">{p.label}</span>
                    <ExternalLink className="w-2.5 h-2.5 text-white/40 shrink-0" />
                  </a>
                  <p className="text-[9.5px] text-white/30 font-mono truncate">{p.desc}</p>
                </div>
              </div>
              {low && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40">
                  {t('live.fc.lowCredits')}
                </span>
              )}
            </div>

            <div className={`grid gap-1.5 ${isFirecrawl ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <MiniCard label={t('live.consumedEstimated')}>
                <p className={`text-sm font-mono leading-tight ${u.costUsd > 0 ? 'text-white/90' : 'text-white/30'}`}>
                  ${u.costUsd.toFixed(2)}
                </p>
                <p className="text-[9px] font-mono text-white/30">{formatEur(u.costUsd)}</p>
              </MiniCard>

              <MiniCard label={p.volume === 'tokens' ? t('live.tokensRead') : t('live.requests')}>
                <p className={`text-sm font-mono leading-tight ${(p.volume === 'tokens' ? u.tokens : u.requests) > 0 ? 'text-white/90' : 'text-white/30'}`}>
                  {fmtInt(p.volume === 'tokens' ? u.tokens : u.requests)}
                </p>
                <p className="text-[9px] font-mono text-white/30">{t('live.browserOnly')}</p>
              </MiniCard>

              {isFirecrawl && (
                <MiniCard label={t('live.fc.credits')}>
                  {credits?.remainingCredits != null ? (
                    <>
                      <p className={`text-sm font-mono leading-tight ${low ? 'text-amber-300' : 'text-white/90'}`}>
                        {fmtInt(credits.remainingCredits)}
                        {credits.totalCredits != null && (
                          <span className="text-white/30"> / {fmtInt(credits.totalCredits)}</span>
                        )}
                      </p>
                      <p className="text-[9px] font-mono text-emerald-400/70">live</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-mono text-white/20 leading-tight">—</p>
                      <p className="text-[9px] font-mono text-white/30 truncate" title={credits?.error ?? undefined}>
                        {credits?.error ?? t('live.fc.noKey')}
                      </p>
                    </>
                  )}
                </MiniCard>
              )}
            </div>

            {/* Le sous-comptage est structurel, pas un retard d'agrégation : le dire une
                fois sous la carte évite de prendre le plancher pour la facture. */}
            {isFirecrawl && (
              <p className="text-[9px] text-white/25 leading-relaxed">{t('live.fc.serverNotCounted')}</p>
            )}

            {/* Réponse illisible : on la montre au lieu d'afficher « — » sans raison —
                l'API Firecrawl a déjà changé de forme plusieurs fois. */}
            {isFirecrawl && credits?.rawResponse !== undefined && (
              <details className="text-[9px] text-amber-300/60">
                <summary className="cursor-pointer hover:text-amber-300/90">{t('live.fc.debug')}</summary>
                <pre className="mt-1 px-2 py-1.5 bg-black/30 rounded border border-amber-500/20 text-white/60 whitespace-pre-wrap break-all max-h-32 overflow-auto">
                  {JSON.stringify(credits.rawResponse, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )
      })}
    </>
  )
}
