import { topBy, topSourceCategories, pageLabel, type AnalyticsEvent, type EventFilter } from '../metrics'
import { useUsersMap } from '../useUsersMap'
import { t, type TranslationKey } from '@/lib/i18n'

/** ⚠️ Une CLÉ, pas un `t()` : dans une constante de module, l'appel serait
 *  évalué à l'import et figerait la langue du premier chargement. */
const DEVICE_KEYS: Record<string, TranslationKey> = {
  desktop: 'an.device.desktop', mobile: 'an.device.mobile', tablet: 'an.device.tablet',
}
// Zone : sépare le trafic du site web public (promo, docs, accueil) de celui de l'application.
const ZONE_OPTS: { value: string; labelKey: TranslationKey }[] = [
  { value: 'site', labelKey: 'an.zone.site' },
  { value: 'app', labelKey: 'an.zone.app' },
]

interface Opt {
  value: string
  label: string
}

function Field({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Opt[]
  onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="text-white/45">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface-2 text-white/80 rounded px-2 py-1 border border-white/10 max-w-[180px]"
      >
        <option value="all">{t('an.tous')}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Barre de filtres d'affichage : appareil, pays, page/section (façon Google Analytics). */
export function AnalyticsFilters({
  events,
  filter,
  onChange,
}: {
  events: AnalyticsEvent[]
  filter: EventFilter
  onChange: (f: EventFilter) => void
}) {
  const devices: Opt[] = topBy(events, 'device', 99).map((r) => ({
    value: r.label,
    label: DEVICE_KEYS[r.label] ? t(DEVICE_KEYS[r.label]) : r.label,
  }))
  const countries: Opt[] = topBy(events, 'country', 99).map((r) => ({ value: r.label, label: r.label }))
  const pages: Opt[] = topBy(events, 'path', 99).map((r) => ({ value: r.label, label: pageLabel(r.label) }))
  const sources: Opt[] = topSourceCategories(events, 99).map((r) => ({ value: r.label, label: r.label }))
  // Utilisateurs connectés (uid renseigné), résolus en nom/email.
  const usersMap = useUsersMap()
  const userCounts = new Map<string, number>()
  for (const e of events) {
    if (!e.uid) continue
    userCounts.set(e.uid, (userCounts.get(e.uid) ?? 0) + 1)
  }
  const users: Opt[] = [...userCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([uid]) => ({ value: uid, label: usersMap.get(uid) ?? uid }))

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Field label={t('an.zone')} value={filter.zone} options={ZONE_OPTS.map((o) => ({ value: o.value, label: t(o.labelKey) }))} onChange={(v) => onChange({ ...filter, zone: v })} />
      <Field label={t('an.appareil')} value={filter.device} options={devices} onChange={(v) => onChange({ ...filter, device: v })} />
      <Field label={t('an.pays')} value={filter.country} options={countries} onChange={(v) => onChange({ ...filter, country: v })} />
      <Field label={t('an.page')} value={filter.page} options={pages} onChange={(v) => onChange({ ...filter, page: v })} />
      <Field label={t('an.source')} value={filter.source} options={sources} onChange={(v) => onChange({ ...filter, source: v })} />
      {users.length > 0 && (
        <Field label={t('an.utilisateur')} value={filter.user} options={users} onChange={(v) => onChange({ ...filter, user: v })} />
      )}
    </div>
  )
}
