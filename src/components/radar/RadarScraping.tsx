import { useMemo, useState } from 'react'
import { Radio } from 'lucide-react'
import type { StoredReport } from '@/features/priceWatch/reportStore'
import type { HarvestMeta } from '@/features/priceWatch/dashboard/opsMetrics'
import { SITE_STATUS_META, type SiteStatus } from '@/features/priceWatch/sourceSites'
import { buildScrapeRows, countByStatus, type RunPulse } from '@/features/priceWatch/radar/scrapeState'
import { fmtInt } from '@/features/priceWatch/radar/radarFormat'
import { RadarScrapingRow } from './RadarScrapingRow'

/** Ordre d'attention des pastilles de filtre (le plus urgent d'abord). */
const FILTERS: SiteStatus[] = ['live', 'error', 'empty', 'ok', 'never']

const PILL_TONE: Record<'ok' | 'warn' | 'err' | 'mute', { fg: string; bg: string; border: string }> = {
  ok: { fg: 'var(--radar-live)', bg: 'rgba(48, 209, 88, 0.12)', border: 'rgba(48, 209, 88, 0.3)' },
  warn: { fg: '#fbbf24', bg: 'rgba(217, 119, 6, 0.14)', border: 'rgba(217, 119, 6, 0.35)' },
  err: { fg: 'var(--radar-bad)', bg: 'rgba(255, 69, 58, 0.12)', border: 'rgba(255, 69, 58, 0.3)' },
  mute: { fg: 'var(--radar-text-2)', bg: 'var(--radar-surface-2)', border: 'var(--radar-hair)' },
}

/** Onglet « Scraping » : le tableau LIVE de la moisson, site par site (jumeau mobile du
 *  tableau « Sites sources » de l'app). Lecture seule — les commandes du run sont dans le
 *  bandeau épinglé en tête d'écran. */
export function RadarScraping({ report, meta, now, pulse }: {
  report: StoredReport | null
  meta: Map<string, HarvestMeta>
  now: number
  /** Arbitre de « ça tourne encore » : sans lui, les cartes clignotent après un STOP. */
  pulse: RunPulse
}) {
  const rows = useMemo(() => buildScrapeRows(report, meta, now, pulse), [report, meta, now, pulse])
  const counts = useMemo(() => countByStatus(rows), [rows])
  const [filter, setFilter] = useState<SiteStatus | null>(null)
  const shown = filter ? rows.filter((r) => r.status === filter) : rows

  if (rows.length === 0) {
    return (
      <div className="radar-card px-5 py-8 text-center text-[13px]" style={{ color: 'var(--radar-text-2)' }}>
        Aucun concurrent suivi. Ajoute des sites dans le node « Sites sources » du workflow.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <section className="radar-card radar-in px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Radio size={16} color="var(--radar-accent-2)" />
          <h2 className="text-[15px] font-semibold">Scraping site par site</h2>
          <span className="ml-auto radar-tnum text-[12px]" style={{ color: 'var(--radar-text-3)' }}>
            {fmtInt(rows.length)} sites · {fmtInt(rows.reduce((n, r) => n + r.products, 0))} fiches
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {FILTERS.filter((k) => counts[k] > 0).map((k) => {
            const m = SITE_STATUS_META[k]
            const tone = PILL_TONE[m.tone]
            const active = filter === k
            return (
              <button key={k} onClick={() => setFilter((f) => (f === k ? null : k))}
                className="radar-tap radar-tnum rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{
                  color: tone.fg, background: tone.bg,
                  border: `0.5px solid ${active ? tone.fg : tone.border}`,
                  boxShadow: active ? `inset 0 0 0 1px ${tone.fg}` : undefined,
                }}>
                {counts[k]} {m.short}
              </button>
            )
          })}
          {filter && (
            <button onClick={() => setFilter(null)} className="radar-tap px-1.5 text-[11px]" style={{ color: 'var(--radar-accent-2)' }}>
              ✕ tout
            </button>
          )}
        </div>
      </section>

      <ul className="space-y-2 landscape:grid landscape:grid-cols-2 landscape:gap-2 landscape:space-y-0">
        {shown.map((r) => <RadarScrapingRow key={r.siteId} row={r} now={now} />)}
      </ul>

      {/* Désambiguïsation reprise de l'app : ne JAMAIS additionner les « appariés ici ». */}
      <p className="px-1 text-[10.5px] leading-snug" style={{ color: 'var(--radar-text-3)' }}>
        « produits » = fiches relevées chez le concurrent (son catalogue, pas le vôtre).
        « appariés ici » = vos produits retrouvés chez CE concurrent : ce sont des paires
        produit×concurrent, non additionnables — un produit vendu par 5 concurrents pèse 5 ici
        mais 1 dans le total du tableau de bord. Ce compteur est figé au dernier « Comparer »,
        les autres bougent en direct.
      </p>
    </div>
  )
}
