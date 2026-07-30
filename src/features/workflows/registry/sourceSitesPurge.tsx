// Popup « Vider les données de scraping » (node Sites sources) : choix des SITES et des
// TYPES de données à purger, récap + confirmation. Destructif → double garde (confirm).
import { useState } from 'react'
import { Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { purgeScrapingData, type PurgeProgress, type ScrapeDataType } from '@/features/priceWatch/catalog/purgeScraping'
import { type TranslationKey, t } from '@/lib/i18n'

const TYPE_META: { key: ScrapeDataType; labelKey: TranslationKey; hintKey: TranslationKey }[] = [
  { key: 'listings', labelKey: 'ss.purge.listings', hintKey: 'ss.purge.listingsHint' },
  { key: 'counters', labelKey: 'ss.purge.counters', hintKey: 'ss.purge.countersHint' },
  { key: 'cursors', labelKey: 'ss.purge.cursors', hintKey: 'ss.purge.cursorsHint' },
  { key: 'report', labelKey: 'ss.purge.report', hintKey: 'ss.purge.reportHint' },
]

export function PurgeScrapingPanel({ uid, watchId, sites, onClose }: {
  uid: string
  watchId: string
  sites: { domain: string; siteId: string }[]
  onClose: () => void
}) {
  const [selSites, setSelSites] = useState<Set<string>>(() => new Set(sites.map((s) => s.siteId)))
  const [types, setTypes] = useState<Set<ScrapeDataType>>(() => new Set<ScrapeDataType>(['listings', 'counters', 'cursors']))
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<PurgeProgress | null>(null)

  const toggle = <T,>(set: Set<T>, v: T): Set<T> => {
    const next = new Set(set); next.has(v) ? next.delete(v) : next.add(v); return next
  }
  const allSites = selSites.size === sites.length && sites.length > 0
  const needsSites = types.has('listings') || types.has('counters') || types.has('cursors')

  const run = async () => {
    if (types.size === 0) { toast.error(t('tst.ss.pickType')); return }
    if (needsSites && selSites.size === 0) { toast.error(t('tst.ss.pickSite')); return }
    // ⚠️ PAS `t` en variable de boucle : elle masquerait la traduction.
    const typeLabels = TYPE_META.filter((m) => types.has(m.key)).map((m) => t(m.labelKey).toLowerCase()).join(', ')
    const scope = needsSites ? t('cfm.ss.sitesScope', { count: selSites.size, total: sites.length }) : t('cfm.ss.watchScope')
    if (!window.confirm(t('cfm.ss.purge', { types: typeLabels, scope }))) return
    setBusy(true)
    setProgress(null)
    try {
      const res = await purgeScrapingData(uid, watchId, [...selSites], types, setProgress)
      toast.success(t('tst.ss.purged', { count: res.pagesDeleted, sites: needsSites ? t('tst.ss.purgedSites', { count: res.sites }) : '' }))
      onClose()
    } catch (e) {
      toast.error(t('tst.ss.purgeFailed', { message: e instanceof Error ? e.message : t('tst.ss.unknown') }))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const domainOf = (siteId: string) => sites.find((s) => s.siteId === siteId)?.domain ?? siteId

  return (
    <div className="rounded-lg bg-well border border-rose-500/25 p-2.5 flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-[11px] text-rose-300/90 font-medium">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Vider les données de scraping
      </p>

      {/* Types de données */}
      <div className="flex flex-col gap-1">
        {TYPE_META.map((meta) => (
          <label key={meta.key} className="flex items-start gap-2 cursor-pointer group">
            <input
              type="checkbox" checked={types.has(meta.key)}
              onChange={() => setTypes((s) => toggle(s, meta.key))}
              className="mt-0.5 accent-rose-500"
            />
            <span className="min-w-0">
              <span className="text-xs text-white/85 group-hover:text-white">{t(meta.labelKey)}</span>
              <span className="block text-[10px] text-white/35 leading-tight">{t(meta.hintKey)}</span>
            </span>
          </label>
        ))}
      </div>

      {/* Sites concernés (masqué si seul « Rapport » est coché → niveau suivi) */}
      {needsSites && sites.length > 0 && (
        <div className="border-t border-white/5 pt-1.5 flex flex-col gap-1">
          <button
            onClick={() => setSelSites(allSites ? new Set() : new Set(sites.map((s) => s.siteId)))}
            className="self-start text-[10px] text-white/45 hover:text-white/80"
          >
            {allSites ? '☑ Tous les sites' : '☐ Tous les sites'}
          </button>
          <div className="flex flex-wrap gap-1">
            {sites.map((s) => {
              const on = selSites.has(s.siteId)
              return (
                <button
                  key={s.siteId}
                  onClick={() => setSelSites((set) => toggle(set, s.siteId))}
                  className={`text-[10px] rounded-md border px-2 py-0.5 transition ${on ? 'text-rose-200 bg-rose-500/15 border-rose-500/40' : 'text-white/40 bg-white/[0.03] border-white/10 hover:text-white/70'}`}
                >
                  {s.domain}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Purge en cours : avancement live (site en cours + compteur de fiches, lot par lot) */}
      {busy && (
        <div className="flex items-center gap-1.5 text-[10px] text-rose-200/90 border-t border-white/5 pt-1.5">
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
          {progress ? (
            <span className="min-w-0 truncate">
              {domainOf(progress.siteId)}
              {progress.siteCount > 1 && <span className="text-white/40"> · site {progress.siteIndex}/{progress.siteCount}</span>}
              <span className="text-white/40"> · </span>{progress.pagesDeleted} fiche(s) supprimée(s)
            </span>
          ) : (
            <span>Suppression en cours…</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-0.5">
        <button onClick={onClose} disabled={busy} className="text-[10px] text-white/40 hover:text-white/70 px-2 py-1">Annuler</button>
        <button
          onClick={() => void run()} disabled={busy}
          className="flex items-center gap-1 text-[10px] bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-[#fff] px-2.5 py-1 rounded"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Vider
        </button>
      </div>
    </div>
  )
}
