import type { ScrapeStatus } from '@/features/priceWatch/radar/scrapeState'

const TONE: Record<ScrapeStatus['state'], { fg: string; bg: string; border: string; dot: string }> = {
  running: { fg: 'var(--radar-live)', bg: 'rgba(48, 209, 88, 0.12)', border: 'rgba(48, 209, 88, 0.3)', dot: 'var(--radar-live)' },
  waiting: { fg: 'var(--radar-accent-2)', bg: 'var(--radar-accent-soft)', border: 'rgba(99, 102, 241, 0.35)', dot: 'var(--radar-accent-2)' },
  idle: { fg: 'var(--radar-text-2)', bg: 'var(--radar-surface-2)', border: 'var(--radar-hair)', dot: 'var(--radar-text-3)' },
}

/** Pastille d'état du scraping (3 états : en cours / en attente / arrêté), miroir du
 *  Cockpit opérationnel de l'app. Optionnellement cliquable → onglet « Scraping ». */
export function RadarScrapeBadge({ status, onClick }: { status: ScrapeStatus; onClick?: () => void }) {
  const tone = TONE[status.state]
  const content = (
    <>
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${status.state === 'running' ? 'radar-live-dot' : ''}`}
        style={{ background: tone.dot }}
      />
      <span className="truncate">{status.label}</span>
    </>
  )
  const cls = 'radar-tap flex w-full items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-semibold'
  const style = { background: tone.bg, border: `0.5px solid ${tone.border}`, color: tone.fg }
  return onClick
    ? <button onClick={onClick} className={cls} style={style} aria-label={`${status.label} — ouvrir le détail du scraping`}>{content}</button>
    : <div className={cls} style={style}>{content}</div>
}
