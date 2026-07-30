// Panneau de config du node « Cron (planifié) » : cadence de travail (minute/heure/
// jour/semaine/mois, mode « après la fin ») + relance calendaire du cycle (CronCycleUi).
// Remplace le rendu générique du configSchema (qui reste déclaré pour Prompt-to-Flow).
import { NumField, SelectField, inputCls } from '@/components/shared/panel/fields'
import type { CronConfig, CronUnit } from '../runtime/cronSchedule'
import { CronCycleUi } from './cronCycleUi'
import { t } from '@/lib/i18n'

const UNIT_OPTIONS: Array<{ v: CronUnit; label: string }> = [
  { v: 'minute', label: 'minute(s)' },
  { v: 'hour', label: 'heure(s)' },
  { v: 'day', label: 'jour(s)' },
  { v: 'week', label: 'semaine(s)' },
  { v: 'month', label: 'mois' },
]

const WEEKDAY_OPTIONS: Array<{ v: string; label: string }> = [
  { v: '-1', label: 'Tous les jours' },
  { v: '1', label: 'Lundi' }, { v: '2', label: 'Mardi' }, { v: '3', label: 'Mercredi' },
  { v: '4', label: 'Jeudi' }, { v: '5', label: 'Vendredi' }, { v: '6', label: 'Samedi' },
  { v: '0', label: 'Dimanche' },
]

export function CronConfigUi({ config, onChange }: {
  config: CronConfig
  onChange: (next: CronConfig) => void
}) {
  const set = (p: Partial<CronConfig>) => onChange({ ...config, ...p })
  // Grisé UNIQUEMENT en mode « après la fin » (demande utilisateur) — sinon éditable.
  const off = !!config.afterCompletion

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
        <input type="checkbox" checked={!!config.enabled} className="accent-[#6366f1]"
          onChange={(e) => set({ enabled: e.target.checked })} />
        Planification active
      </label>

      <div className="grid grid-cols-2 gap-2">
        <NumField label="Tous les" value={config.every ?? 1} min={1} step={1}
          onChange={(v) => set({ every: Math.max(1, Math.trunc(v ?? 1)) })} />
        <SelectField label="Unité" value={(config.unit ?? 'day') as CronUnit}
          options={UNIT_OPTIONS} onChange={(unit) => set({ unit })} />
      </div>

      <label className="flex items-start gap-2 text-sm text-white cursor-pointer">
        <input type="checkbox" checked={off} className="accent-[#6366f1] mt-0.5"
          onChange={(e) => set({ afterCompletion: e.target.checked })} />
        <span>
          {t('node.cron.f1')}
          <span className="block text-[11px] text-white/30 normal-case">
            {t('wfc.afterCompletionHint')}
          </span>
        </span>
      </label>

      <div className={`grid grid-cols-2 gap-2 ${off ? 'opacity-40 pointer-events-none select-none' : ''}`}>
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/40">
          Heure (HH:MM){off ? ' — sans effet ici' : ''}
          <input type="time" value={config.atTime ?? '09:00'}
            onChange={(e) => set({ atTime: e.target.value || '09:00' })}
            className={`${inputCls} [color-scheme:dark]`} />
        </label>
        <SelectField label={`Jour (unité semaine)${off ? ' — sans effet ici' : ''}`}
          value={String(config.weekday ?? '1')} options={WEEKDAY_OPTIONS}
          onChange={(v) => set({ weekday: Number(v) })} />
      </div>
      <p className="text-[11px] text-white/30 -mt-1.5">
        {t('wfc.atTimeHint')}
      </p>

      <CronCycleUi value={config.cycle} onChange={(cycle) => set({ cycle })} />
    </div>
  )
}
