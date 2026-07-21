// src/features/priceWatch/dashboard/ScrapeSpendWidget.tsx
// Compteur de consommation scraping EN LIVE dans le dashboard veille (surtout Jina, la
// couche de fetch de la moisson/recherche dirigée). Évite d'ouvrir Paramètres/Finances.
import { useScrapeSpend } from './useScrapeSpend'

const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`
    : n >= 1_000 ? `${(n / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k`
    : `${n}`
const usd = (n: number) => `$${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Plateformes affichées dans l'ordre, avec le libellé et l'unité de volume.
const PLATFORMS: { key: string; label: string; unit: 'tokens' | 'req' }[] = [
  { key: 'jina', label: 'Jina', unit: 'tokens' },
  { key: 'firecrawl', label: 'Firecrawl', unit: 'req' },
  { key: 'brightdata', label: 'Bright Data', unit: 'req' },
]

export function ScrapeSpendWidget() {
  const spend = useScrapeSpend()
  if (!spend) return null
  const rows = PLATFORMS.map((p) => ({ ...p, u: spend.byPlatform[p.key] })).filter((r) => r.u)

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-semibold text-white">Consommation scraping</div>
        <div className="text-[11px] text-white/40">ce mois · live</div>
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-white/40">Aucune consommation ce mois. Le compteur monte dès que la moisson tourne.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-2 text-xs">
              <span className={`w-24 shrink-0 ${r.key === 'jina' ? 'text-white/85 font-medium' : 'text-white/60'}`}>{r.label}</span>
              <span className="text-white/50 tabular-nums flex-1">
                {r.unit === 'tokens' ? `${fmtTokens(r.u!.tokens)} tokens` : `${r.u!.requests.toLocaleString('fr-FR')} req`}
              </span>
              <span className="text-amber-300 tabular-nums">{usd(r.u!.costUsd)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-white/10 pt-2 text-xs">
            <span className="text-white/60">Total scraping</span>
            <span className="text-amber-400 font-semibold tabular-nums">{usd(spend.total)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
