// Affichage filtrable du journal d'audit : QUI (utilisateur) / QUOI (action) / QUAND
// (plage de dates). Réutilisé par l'onglet admin (showWho) et la vue « Mon activité ».
import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { auditActionKey, AUDIT_ACTIONS, AUDIT_MODULES, auditModuleOf, type AuditEntry } from '@/lib/auditLog'
import { useTranslation, intlLocale, type TranslationKey } from '@/lib/i18n'

interface Props {
  entries: AuditEntry[]
  loading?: boolean
  showWho?: boolean // afficher le filtre + la colonne « Qui » (vue admin)
  onRefresh?: () => void
}

const sel = 'bg-well border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50'

function fmt(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function AuditLogView({ entries, loading, showWho = false, onRefresh }: Props) {
  const { t, locale } = useTranslation()

  /**
   * Libellé affiché d'une action. Une action ABSENTE du catalogue rend sa clé
   * brute (« pim.export.v2 ») plutôt que « undefined » : le journal reste
   * lisible quand une action nouvelle n'a pas encore son libellé.
   */
  const actionLabel = (action: string): string => {
    const key = auditActionKey(action)
    return key ? t(key as TranslationKey) : action
  }

  const [who, setWho] = useState('')
  const [mod, setMod] = useState('')
  const [what, setWhat] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const whoOptions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.userEmail).filter(Boolean))).sort(),
    [entries],
  )
  // Tous les modules du catalogue (même ceux sans données encore).
  const moduleOptions = AUDIT_MODULES
  // Toutes les actions du catalogue, restreintes au module choisi, triées par libellé.
  const whatOptions = useMemo(
    () => Object.keys(AUDIT_ACTIONS)
      .filter((k) => !mod || auditModuleOf(k) === mod)
      .sort((a, b) => actionLabel(a).localeCompare(actionLabel(b), intlLocale(locale))),
    // `locale` en dépendance : le tri par libellé doit se refaire au changement de langue.
    [mod, locale],
  )

  const filtered = useMemo(() => {
    const fromTs = from ? new Date(from + 'T00:00:00').getTime() : null
    const toTs = to ? new Date(to + 'T23:59:59').getTime() : null
    return entries.filter((e) => {
      if (who && e.userEmail !== who) return false
      if (mod && e.module !== mod) return false
      if (what && e.action !== what) return false
      const ts = e.createdAt?.getTime() ?? 0
      if (fromTs && ts < fromTs) return false
      if (toTs && ts > toTs) return false
      return true
    })
  }, [entries, who, mod, what, from, to])

  const reset = () => { setWho(''); setMod(''); setWhat(''); setFrom(''); setTo('') }

  return (
    <div className="space-y-3">
      {/* Filtres QUI / QUOI / QUAND */}
      <div className="flex flex-wrap items-center gap-2">
        {showWho && (
          <select className={sel} value={who} onChange={(e) => setWho(e.target.value)} title={t('au.who')}>
            <option value="">{t('au.whoAll')}</option>
            {whoOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <select className={sel} value={mod} onChange={(e) => { setMod(e.target.value); setWhat('') }} title={t('au.moduleTitle')}>
          <option value="">{t('au.moduleAll')}</option>
          {moduleOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select className={sel} value={what} onChange={(e) => setWhat(e.target.value)} title={t('au.what')}>
          <option value="">{t('au.whatAll')}</option>
          {whatOptions.map((o) => <option key={o} value={o}>{actionLabel(o)}</option>)}
        </select>
        <label className="text-xs text-white/40">{t('au.from')}</label>
        <input type="date" className={sel} value={from} onChange={(e) => setFrom(e.target.value)} />
        <label className="text-xs text-white/40">{t('au.to')}</label>
        <input type="date" className={sel} value={to} onChange={(e) => setTo(e.target.value)} />
        {(who || mod || what || from || to) && (
          <button onClick={reset} className="text-xs text-white/50 hover:text-white px-2 py-1">{t('ac.reset')}</button>
        )}
        <span className="text-xs text-white/40 ml-auto">{filtered.length} action(s)</span>
        {onRefresh && (
          <button onClick={onRefresh} className="flex items-center gap-1 text-xs text-white/50 hover:text-white px-1">
            <RefreshCw className="h-3 w-3" /> {t('au.refresh')}
          </button>
        )}
      </div>

      {/* En-tête tableau — figé en haut au scroll des lignes */}
      <div className="sticky top-0 z-10 bg-background flex items-center gap-3 px-3 py-2 text-[10px] uppercase tracking-wide text-white/35">
        <span className="w-28 shrink-0">{t('au.when')}</span>
        {showWho && <span className="w-44 shrink-0">{t('au.who')}</span>}
        <span className="w-40 shrink-0">{t('au.action')}</span>
        <span className="w-24 shrink-0">{t('au.module')}</span>
        <span className="flex-1 min-w-0">{t('au.target')}</span>
      </div>

      {/* Lignes */}
      <div className="space-y-1">
        {loading && <p className="text-xs text-white/40 px-3">{t('au.loading')}</p>}
        {!loading && filtered.length === 0 && <p className="text-xs text-white/40 px-3">{t('au.noAction')}</p>}
        {filtered.map((e) => {
          const before = e.meta?.before
          const after = e.meta?.after
          const hasChange = before !== undefined || after !== undefined
          const otherMeta = e.meta
            ? Object.entries(e.meta).filter(([k]) => k !== 'before' && k !== 'after')
            : []
          return (
            <div key={e.id} className="rounded bg-surface-2 px-3 py-2 text-xs">
              <div className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-white/50 tabular-nums">{fmt(e.createdAt)}</span>
                {showWho && <span className="w-44 shrink-0 text-white truncate" title={e.userEmail}>{e.userName || e.userEmail || '—'}</span>}
                <span className="w-40 shrink-0 text-white">{actionLabel(e.action)}</span>
                <span className="w-24 shrink-0 text-white/45">{e.module}</span>
                <span className="flex-1 min-w-0 text-white/70 truncate" title={e.targetLabel ?? e.targetId ?? ''}>
                  {e.targetLabel ?? e.targetId ?? '—'}
                </span>
              </div>
              {hasChange && (
                <div className="mt-1 pl-[7.25rem] text-[11px] text-white/55">
                  {t('au.before')} <span className="text-amber-300/90">{String(before ?? '—')}</span>
                  {' → '}{t('au.after')} <span className="text-emerald-300/90">{String(after ?? '—')}</span>
                </div>
              )}
              {otherMeta.length > 0 && (
                <div className="mt-0.5 pl-[7.25rem] text-[11px] text-white/40">
                  {otherMeta.map(([k, v]) => `${k} : ${String(v)}`).join(' · ')}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
