import { useState } from 'react'
import { Loader2, Lock, LockOpen, Play, RotateCcw, Trash2, CheckSquare, Square } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { normalizeDomain, rowsToCompetitorSites, type SourceSiteRow } from '@/features/priceWatch/sourceSites'
import { patchSourceSite, removeSourceSite } from '@/features/priceWatch/radar/radarSiteActions'
import { harvestOneSite } from '@/features/priceWatch/catalog/runSingleSite'
import { resetCompetitorData } from '@/features/priceWatch/catalog/store'
import { stableId } from '@/features/priceWatch/core'
import { SiteCredentialsForm } from '@/features/workflows/registry/sourceSitesCreds'
import { t } from '@/lib/i18n'

const ENGINES = [
  { value: 'auto', label: 'Auto' },
  { value: 'jina', label: 'Jina' },
  { value: 'firecrawl', label: 'Firecrawl' },
  { value: 'brightdata', label: 'Bright Data' },
]

/** Bouton d'action carré, cible tactile confortable (34 px) et teinte au besoin. */
function IconBtn({ onClick, title, busy, tint, children }: {
  onClick: () => void; title: string; busy?: boolean; tint?: string; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} disabled={busy} aria-label={title} title={title}
      className="radar-tap grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl disabled:opacity-40"
      style={{ background: 'var(--radar-surface-2)', color: tint ?? 'var(--radar-text-2)' }}>
      {busy ? <Loader2 size={15} className="radar-spin" /> : children}
    </button>
  )
}

/** Toutes les commandes d'un concurrent, comme dans le tableau « Sites sources » de
 *  l'app : activer/désactiver, moteur forcé, scraper seul, accès connecté, purger,
 *  retirer. La config vit dans le workflow → `onChanged` recharge après écriture. */
export function RadarSiteActions({ domain, watchId, workflowId, row, onChanged }: {
  domain: string
  watchId: string | null
  workflowId: string | null
  /** Config du site dans le node « Sites sources » (absente = site hors liste). */
  row: SourceSiteRow | undefined
  onChanged: () => void
}) {
  const uid = useAuthStore((s) => s.user?.uid)
  const [busy, setBusy] = useState<'scrape' | 'toggle' | 'engine' | 'budget' | 'reset' | 'remove' | null>(null)
  const [creds, setCreds] = useState(false)
  const host = normalizeDomain(domain)
  const enabled = row?.enabled !== false

  const guard = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    if (!uid || !workflowId) { toast.error(t('tst.rd.unknownWorkflow')); return }
    setBusy(kind)
    try { await fn() } catch (e) { toast.error(e instanceof Error ? e.message : t('tst.rd.actionFailed')) } finally { setBusy(null) }
  }

  // Moisson de CE site seul : même moteur que le node, budget court (test depuis le mobile).
  const onScrape = () => guard('scrape', async () => {
    if (!watchId) { toast.error(t('tst.rd.unknownWatch')); return }
    // Conversion canonique (fields/engine/auth) — la même qu'à l'émission du node.
    const site = rowsToCompetitorSites([{ ...(row ?? { domain: host }), domain: host, enabled: true }])[0]
    if (!site) { toast.error(t('tst.rd.unreadableSite')); return }
    const res = await harvestOneSite(uid!, watchId, site, { pageBudget: 12 })
    toast.success(t('tst.rd.harvestResult', {
      host, products: res.productsIndexed, pct: res.pctPrice,
      engine: res.engine ? t('tst.rd.harvestEngine', { engine: res.engine }) : '',
    }))
  })

  const onToggle = () => guard('toggle', async () => {
    await patchSourceSite(uid!, workflowId!, host, { enabled: !enabled })
    onChanged()
    toast.success(t('tst.rd.siteToggled', { host, state: t(enabled ? 'tst.rd.disabled' : 'tst.rd.enabled') }))
  })

  const onEngine = (engine: string) => guard('engine', async () => {
    await patchSourceSite(uid!, workflowId!, host, { engine: engine === 'auto' ? undefined : engine })
    onChanged()
  })

  // Budget RÉSERVÉ à ce site : bride un concurrent coûteux (Bright Data est facturé à la
  // requête) sans rationner les gratuits. Vide = part du budget commun.
  const onBudget = (raw: string) => guard('budget', async () => {
    const pages = raw.trim() ? Math.max(1, Math.floor(Number(raw))) : undefined
    if (raw.trim() && !Number.isFinite(pages)) return
    await patchSourceSite(uid!, workflowId!, host, { pageBudget: pages })
    onChanged()
    toast.success(pages ? t('tst.rd.pagesPerRun', { host, pages }) : t('tst.rd.sharedBudget', { host }))
  })

  const onReset = () => {
    if (!window.confirm(t('cfm.rd.resetSite', { host }))) return
    void guard('reset', async () => {
      if (!watchId) return
      const n = await resetCompetitorData(uid!, watchId, stableId(host))
      toast.success(t('tst.rd.pagesCleared', { host, count: n }))
    })
  }

  const onRemove = () => {
    if (!window.confirm(t('cfm.rd.removeSite', { host }))) return
    void guard('remove', async () => {
      await removeSourceSite(uid!, workflowId!, host)
      onChanged()
      toast.success(t('tst.rd.siteRemoved', { host }))
    })
  }

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2" style={{ borderColor: 'var(--radar-hair)' }}>
        {row && (
          <IconBtn onClick={onToggle} busy={busy === 'toggle'} tint={enabled ? 'var(--radar-live)' : undefined}
            title={t(enabled ? 'ss.disableSite' : 'ss.enableSite')}>
            {enabled ? <CheckSquare size={15} /> : <Square size={15} />}
          </IconBtn>
        )}
        <IconBtn onClick={onScrape} busy={busy === 'scrape'} title="Scraper ce site maintenant" tint="var(--radar-accent-2)">
          <Play size={15} />
        </IconBtn>
        <IconBtn onClick={() => setCreds((c) => !c)} tint={row?.auth ? 'var(--radar-live)' : undefined}
          title={t(row?.auth ? 'ss.authConfigured' : 'ss.authConfigure')}>
          {row?.auth ? <Lock size={15} /> : <LockOpen size={15} />}
        </IconBtn>
        <IconBtn onClick={onReset} busy={busy === 'reset'} title={t('rd.resetCollected')} tint="#fbbf24">
          <RotateCcw size={15} />
        </IconBtn>
        {row && (
          <IconBtn onClick={onRemove} busy={busy === 'remove'} title="Retirer ce site de la moisson" tint="var(--radar-bad)">
            <Trash2 size={15} />
          </IconBtn>
        )}
        {row && (
          <input
            type="number" min={1} defaultValue={row.pageBudget ?? ''}
            onBlur={(e) => { if (String(row.pageBudget ?? '') !== e.target.value.trim()) onBudget(e.target.value) }}
            placeholder="pages" aria-label={t('rd.pagesPerRun')}
            title={t('rd.pagesPerRun.title')}
            className="radar-inset ml-auto h-[34px] w-[72px] px-2 text-[12px]"
            style={{ color: 'var(--radar-text-2)', border: '0.5px solid var(--radar-hair)' }}
          />
        )}
        {row && (
          <select value={row.engine ?? 'auto'} onChange={(e) => onEngine(e.target.value)}
            aria-label="Moteur de scraping" title="Moteur de scraping (Auto = cascade standard)"
            className="radar-inset h-[34px] px-2 text-[12px]"
            style={{ color: 'var(--radar-text-2)', border: '0.5px solid var(--radar-hair)' }}>
            {ENGINES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
      </div>
      {creds && (
        <div className="mt-2">
          <SiteCredentialsForm
            host={host}
            hasCreds={!!row?.auth}
            onSaved={() => { if (uid && workflowId) void patchSourceSite(uid, workflowId, host, { auth: true }).then(onChanged) }}
            onCleared={() => { if (uid && workflowId) void patchSourceSite(uid, workflowId, host, { auth: undefined }).then(onChanged) }}
            onClose={() => setCreds(false)}
          />
        </div>
      )}
    </>
  )
}
