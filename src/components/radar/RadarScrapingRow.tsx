import { SITE_STATUS_META } from '@/features/priceWatch/sourceSites'
import type { ScrapeRow } from '@/features/priceWatch/radar/scrapeState'
import { fmtInt, fmtPct, timeAgo } from '@/features/priceWatch/radar/radarFormat'

/** Libellés du moteur réellement utilisé (parité tableau « Sites sources » de l'app). */
const ENGINE_LABELS: Record<string, string> = {
  cloudFunction: 'Serveur', jina: 'Jina', proxy: 'Proxy', firecrawl: 'Firecrawl',
  brightdata: 'BD', authenticated: 'Connecté',
}

const TONE: Record<'ok' | 'warn' | 'err' | 'mute', { fg: string; bg: string }> = {
  ok: { fg: 'var(--radar-live)', bg: 'rgba(48, 209, 88, 0.12)' },
  warn: { fg: '#fbbf24', bg: 'rgba(217, 119, 6, 0.16)' },
  err: { fg: 'var(--radar-bad)', bg: 'rgba(255, 69, 58, 0.14)' },
  mute: { fg: 'var(--radar-text-3)', bg: 'var(--radar-surface-2)' },
}

function Chip({ label, value, tone = 'mute' }: { label: string; value: string; tone?: 'ok' | 'warn' | 'mute' }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap text-[11px]">
      <span style={{ color: 'var(--radar-text-3)' }}>{label}</span>
      <span className="radar-tnum" style={{ color: tone === 'ok' ? 'var(--radar-live)' : tone === 'warn' ? '#fbbf24' : 'var(--radar-text-2)' }}>{value}</span>
    </span>
  )
}

/** Ligne du tableau live : identité + verdict de la dernière passe + chiffres clés.
 *  Pendant la moisson : liseré vert + barre de balayage animée (comme dans l'app). */
export function RadarScrapingRow({ row, now }: { row: ScrapeRow; now: number }) {
  const meta = SITE_STATUS_META[row.status]
  const tone = TONE[meta.tone]
  const detail =
    row.status === 'ok' ? ` · +${fmtInt(row.lastPassProducts ?? 0)}` :
    row.status === 'empty' ? ` · ${row.lastPassPages ?? 0} p` :
    row.status === 'error' ? ' · 0 page' : ''
  const swept = row.progress >= 1

  return (
    // Site en moisson : carte franchement verte (halo + liseré épais), lisible d'un coup
    // d'œil en plein soleil sur iPhone — même intention que le ring pulsé de l'app.
    <li className="radar-card relative overflow-hidden px-3.5 py-3"
      style={row.live ? {
        borderColor: 'rgba(48, 209, 88, 0.75)',
        boxShadow: '0 0 0 1.5px rgba(48, 209, 88, 0.45), 0 0 18px rgba(48, 209, 88, 0.18)',
        background: 'linear-gradient(180deg, rgba(48, 209, 88, 0.16), rgba(48, 209, 88, 0.07))',
      } : undefined}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{row.domain.replace(/^www\./, '')}</span>
        {/* Badge PLEIN quand ça moissonne (vert saturé, texte sombre) : la ligne active
            doit se repérer sans lire, y compris en plein soleil. */}
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold radar-tnum"
          style={row.live
            ? { color: '#04270f', background: 'var(--radar-live)' }
            : { color: tone.fg, background: tone.bg, fontWeight: 600 }}>
          {meta.icon} {meta.label}{detail}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Chip label="produits" value={fmtInt(row.products)} tone={row.products > 0 ? 'ok' : 'mute'} />
        {row.pctPrice != null && <Chip label="prix" value={fmtPct(row.pctPrice)} tone={row.pctPrice >= 80 ? 'ok' : 'warn'} />}
        {row.matched != null && <Chip label="appariés ici" value={fmtInt(row.matched)} tone={row.matched > 0 ? 'ok' : 'mute'} />}
        {swept
          ? <Chip label="balayé" value={`×${row.sweeps || 1} ✓`} tone="ok" />
          : row.progress > 0 && <Chip label="balayage" value={fmtPct(row.progress * 100)} />}
        {row.lastEngine && <Chip label="via" value={ENGINE_LABELS[row.lastEngine] ?? row.lastEngine} />}
        {row.updatedAt != null && <Chip label="scrape" value={timeAgo(row.updatedAt, now)} />}
      </div>
      {row.live && (
        <div className="absolute bottom-0 left-2 right-2 h-[3px] overflow-hidden rounded-full" aria-hidden>
          <div className="progress-indeterminate absolute top-0 h-full w-1/3 rounded-full"
            style={{ background: 'var(--radar-live)', boxShadow: '0 0 6px rgba(48, 209, 88, 0.7)' }} />
        </div>
      )}
    </li>
  )
}
