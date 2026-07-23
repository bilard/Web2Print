import { Coins } from 'lucide-react'
import { useScrapeSpend } from '@/features/priceWatch/dashboard/useScrapeSpend'

const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`
    : n >= 1_000 ? `${(n / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k`
    : `${n}`
const usd = (n: number) => `$${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const PLATFORMS: { key: string; label: string; unit: 'tokens' | 'req' }[] = [
  { key: 'jina', label: 'Jina', unit: 'tokens' },
  { key: 'firecrawl', label: 'Firecrawl', unit: 'req' },
  { key: 'brightdata', label: 'Bright Data', unit: 'req' },
]

/** Onglet Coûts : consommation scraping du mois courant, EN LIVE (useScrapeSpend). */
export function RadarCosts() {
  const spend = useScrapeSpend()
  if (!spend) {
    return <div className="radar-card px-5 py-8 text-center text-[13px]" style={{ color: 'var(--radar-text-2)' }}>Chargement de la consommation…</div>
  }
  const rows = PLATFORMS.map((p) => ({ ...p, u: spend.byPlatform[p.key] })).filter((r) => r.u)
  const maxCost = Math.max(0.0001, ...rows.map((r) => r.u!.costUsd))

  return (
    <section className="radar-card radar-in px-4 py-4">
      <div className="mb-1 flex items-center gap-2">
        <Coins size={16} color="var(--radar-warn)" />
        <h2 className="text-[15px] font-semibold">Consommation scraping</h2>
        <span className="ml-auto text-[12px]" style={{ color: 'var(--radar-text-3)' }}>ce mois · live</span>
      </div>
      <p className="radar-rounded radar-tnum text-[38px] font-bold leading-none" style={{ color: 'var(--radar-warn)' }}>{usd(spend.total)}</p>
      <p className="mt-1 mb-3 text-[12px]" style={{ color: 'var(--radar-text-3)' }}>total scraping</p>

      {rows.length === 0 ? (
        <p className="text-[12px]" style={{ color: 'var(--radar-text-2)' }}>
          Aucune consommation ce mois. Le compteur monte dès que la moisson tourne.
        </p>
      ) : (
        <ul className="space-y-3 border-t pt-3" style={{ borderColor: 'var(--radar-hair)' }}>
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-medium">{r.label}</span>
                <span className="radar-tnum shrink-0" style={{ color: 'var(--radar-text-2)' }}>
                  {r.unit === 'tokens' ? `${fmtTokens(r.u!.tokens)} tokens` : `${r.u!.requests.toLocaleString('fr-FR')} req`}
                  <span className="ml-2 font-semibold" style={{ color: 'var(--radar-warn)' }}>{usd(r.u!.costUsd)}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--radar-surface-2)' }}>
                <div className="h-full rounded-full" style={{ width: `${(r.u!.costUsd / maxCost) * 100}%`, background: 'var(--radar-warn)' }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
