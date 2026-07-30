import { ExternalLink } from 'lucide-react'
import type { RadarCostRow } from './radarCostRows'
import { t } from '@/lib/i18n'

const USD_TO_EUR = 0.92
function eur(usd: number): string {
  const v = usd * USD_TO_EUR
  const d = v >= 1 ? 2 : v >= 0.01 ? 3 : v >= 0.0001 ? 4 : 6
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
}
const usd = (n: number) => `$${n.toFixed(n >= 1 ? 2 : 4)}`

const BADGE: Record<RadarCostRow['badge'], { color: string; label: (p: number | null) => string } | null> = {
  ok: { color: 'var(--radar-good)', label: (p) => `OK ${p != null ? Math.round(p * 100) : 0}%` },
  warning: { color: 'var(--radar-warn)', label: (p) => `⚠ ${p != null ? Math.round(p * 100) : 0}%` },
  over: { color: 'var(--radar-bad)', label: (p) => `over ${p != null ? Math.round(p * 100) : 0}%` },
  unset: null,
}

/** Une ligne du tableau de consommation : provider/modèle, volume, coût, budget dispo, statut. */
export function RadarCostCard({ r }: { r: RadarCostRow }) {
  const badge = BADGE[r.badge]
  return (
    <li className="radar-card px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${r.dot}`} />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold">{r.model}</p>
            <p className="truncate text-[11px]" style={{ color: 'var(--radar-text-3)' }}>{r.label}</p>
          </div>
        </div>
        {r.billingUrl && (
          <a href={r.billingUrl} target="_blank" rel="noreferrer" className="radar-tap shrink-0 pt-0.5" style={{ color: 'var(--radar-text-3)' }} aria-label="Facturation">
            <ExternalLink size={13} />
          </a>
        )}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 border-t pt-2 text-[11.5px]" style={{ borderColor: 'var(--radar-hair)' }}>
        {/* Tokens / coût */}
        <div>
          <p className="radar-tnum" style={{ color: 'var(--radar-text-2)' }}>{r.volume}</p>
          <p className="radar-tnum" style={{ color: 'var(--radar-text-3)' }}>{eur(r.costUsd)}</p>
          <p className="radar-tnum text-[10px]" style={{ color: 'var(--radar-text-3)' }}>{r.pricingLabel ?? ''}</p>
        </div>
        {/* Budget dispo / solde */}
        <div className="text-center">
          {r.avail.kind === 'partagé' ? (
            <p className="italic" style={{ color: 'var(--radar-text-3)' }}>{t('rd.sharedBudget')}</p>
          ) : r.avail.usd != null ? (
            <>
              <p className="radar-tnum text-[15px] font-semibold" style={{ color: r.avail.kind === 'solde API' ? 'var(--radar-good)' : 'var(--radar-text)' }}>{usd(r.avail.usd)}</p>
              <p className="text-[10px]" style={{ color: 'var(--radar-text-3)' }}>{r.avail.kind}</p>
            </>
          ) : (
            <p style={{ color: 'var(--radar-text-3)' }}>—</p>
          )}
        </div>
        {/* Statut */}
        <div className="text-right">
          {badge ? (
            <>
              <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${badge.color} 18%, transparent)`, color: badge.color }}>
                {badge.label(r.pct)}
              </span>
              <div className="mt-1.5 ml-auto h-1 w-14 overflow-hidden rounded-full" style={{ background: 'var(--radar-surface-2)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (r.pct ?? 0) * 100)}%`, background: badge.color }} />
              </div>
            </>
          ) : (
            <span className="text-[10px]" style={{ color: 'var(--radar-text-3)' }}>—</span>
          )}
        </div>
      </div>
    </li>
  )
}
