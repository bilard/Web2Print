// Section « Relance du cycle (calendrier) » du panneau de config du node Cron :
// quotidien / jours de semaine / quantième mensuel / dates précises (agenda graphique).
// La cadence rapide (toutes les minutes…) fait AVANCER la moisson ; ce calendrier décide
// QUAND un cycle terminé à 100 % repart (au lieu d'enchaîner en continu).
import { X } from 'lucide-react'
import { MiniCalendar } from '@/components/shared/panel/MiniCalendar'
import { NumField, SegButtons, inputCls } from '@/components/shared/panel/fields'
import { computeNextCycleRun, type CycleCalendar, type CycleKind } from '../runtime/cronSchedule'

export const DEFAULT_CYCLE: CycleCalendar = {
  enabled: false, kind: 'week', atTime: '07:00', every: 1, weekdays: [5], monthday: 1, dates: [],
}

const KIND_OPTIONS: Array<{ v: CycleKind; node: string; title: string }> = [
  { v: 'day', node: 'Jour', title: 'Tous les N jours' },
  { v: 'week', node: 'Semaine', title: 'Certains jours de la semaine' },
  { v: 'month', node: 'Mois', title: 'Un quantième chaque mois' },
  { v: 'dates', node: 'Dates', title: 'Dates précises (agenda)' },
]
/** Pastilles lundi → dimanche (valeurs JS : 0 = dimanche). */
const WEEKDAY_PILLS = [
  { v: 1, l: 'L' }, { v: 2, l: 'M' }, { v: 3, l: 'M' }, { v: 4, l: 'J' },
  { v: 5, l: 'V' }, { v: 6, l: 'S' }, { v: 0, l: 'D' },
]

const fmtNext = (ms: number) => new Date(ms).toLocaleString('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
const fmtChip = (d: string) => { const [y, mo, day] = d.split('-'); return `${day}/${mo}/${y}` }

export function CronCycleUi({ value, onChange }: {
  value: CycleCalendar | null | undefined
  onChange: (next: CycleCalendar) => void
}) {
  const cal: CycleCalendar = { ...DEFAULT_CYCLE, ...(value ?? {}) }
  const set = (p: Partial<CycleCalendar>) => onChange({ ...cal, ...p })
  const toggleWeekday = (d: number) => {
    const days = cal.weekdays ?? []
    set({ weekdays: days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b) })
  }
  const toggleDate = (d: string) => {
    const dates = cal.dates ?? []
    set({ dates: dates.includes(d) ? dates.filter((x) => x !== d) : [...dates, d].sort() })
  }
  const next = cal.enabled ? computeNextCycleRun(cal, Date.now()) : null

  return (
    <div className="rounded border border-white/10 bg-surface-2 p-2.5 space-y-2.5">
      <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
        <input type="checkbox" checked={cal.enabled} className="accent-[#6366f1]"
          onChange={(e) => set({ enabled: e.target.checked })} />
        Relance du cycle (calendrier)
      </label>
      <p className="text-[11px] text-white/30 -mt-1">
        Quand la moisson atteint 100 % sur TOUS les sites, la cadence s'arrête ; le cycle
        complet repart à l'échéance choisie ici (ex : tous les vendredis à 07:00).
      </p>
      {cal.enabled && (
        <>
          <SegButtons value={cal.kind} options={KIND_OPTIONS} onChange={(kind) => set({ kind })} />
          {cal.kind === 'day' && (
            <NumField label="Tous les" unit="jour(s)" value={cal.every ?? 1} min={1} step={1}
              onChange={(v) => set({ every: Math.max(1, Math.trunc(v ?? 1)) })} />
          )}
          {cal.kind === 'week' && (
            <div className="flex gap-1">
              {WEEKDAY_PILLS.map((p) => (
                <button key={p.v} type="button" onClick={() => toggleWeekday(p.v)}
                  title={['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][p.v]}
                  className={`flex-1 h-7 rounded text-xs font-medium transition-colors ${
                    (cal.weekdays ?? []).includes(p.v)
                      ? 'bg-[#6366f1] text-[#fff]' : 'bg-well text-white/60 hover:bg-white/10'
                  }`}>
                  {p.l}
                </button>
              ))}
            </div>
          )}
          {cal.kind === 'month' && (
            <div className="grid grid-cols-2 gap-2">
              <NumField label="Le" unit="du mois" value={cal.monthday ?? 1} min={1} max={31} step={1}
                onChange={(v) => set({ monthday: Math.min(31, Math.max(1, Math.trunc(v ?? 1))) })} />
              <NumField label="Tous les" unit="mois" value={cal.every ?? 1} min={1} step={1}
                onChange={(v) => set({ every: Math.max(1, Math.trunc(v ?? 1)) })} />
            </div>
          )}
          {cal.kind === 'dates' && (
            <div className="space-y-1.5">
              <MiniCalendar selected={cal.dates ?? []} onToggle={toggleDate} />
              {(cal.dates ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {(cal.dates ?? []).map((d) => (
                    <span key={d} className="flex items-center gap-1 rounded bg-[#6366f1]/20 border border-[#6366f1]/40 px-1.5 py-0.5 text-[11px] text-white">
                      {fmtChip(d)}
                      <button type="button" onClick={() => toggleDate(d)} title="Retirer cette date"
                        className="text-white/50 hover:text-white"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/40">
            Heure de relance
            <input type="time" value={cal.atTime} onChange={(e) => set({ atTime: e.target.value || '07:00' })}
              className={`${inputCls} [color-scheme:dark]`} />
          </label>
          <p className="text-[11px] text-indigo-300">
            {next != null
              ? <>Prochaine relance : <b className="capitalize">{fmtNext(next)}</b></>
              : 'Aucune échéance à venir — ajoute au moins une date future.'}
          </p>
        </>
      )}
    </div>
  )
}
