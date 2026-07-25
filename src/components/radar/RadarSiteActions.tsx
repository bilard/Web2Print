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
  const [busy, setBusy] = useState<'scrape' | 'toggle' | 'engine' | 'reset' | 'remove' | null>(null)
  const [creds, setCreds] = useState(false)
  const host = normalizeDomain(domain)
  const enabled = row?.enabled !== false

  const guard = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    if (!uid || !workflowId) { toast.error('Workflow inconnu pour ce suivi.'); return }
    setBusy(kind)
    try { await fn() } catch (e) { toast.error(e instanceof Error ? e.message : 'Action impossible.') } finally { setBusy(null) }
  }

  // Moisson de CE site seul : même moteur que le node, budget court (test depuis le mobile).
  const onScrape = () => guard('scrape', async () => {
    if (!watchId) { toast.error('Suivi inconnu.'); return }
    // Conversion canonique (fields/engine/auth) — la même qu'à l'émission du node.
    const site = rowsToCompetitorSites([{ ...(row ?? { domain: host }), domain: host, enabled: true }])[0]
    if (!site) { toast.error('Site illisible.'); return }
    const res = await harvestOneSite(uid!, watchId, site, { pageBudget: 12 })
    toast.success(`${host} : +${res.productsIndexed} produit(s) · ${res.pctPrice} % avec prix${res.engine ? ` (via ${res.engine})` : ''}`)
  })

  const onToggle = () => guard('toggle', async () => {
    await patchSourceSite(uid!, workflowId!, host, { enabled: !enabled })
    onChanged()
    toast.success(`${host} ${enabled ? 'désactivé' : 'activé'} pour la moisson.`)
  })

  const onEngine = (engine: string) => guard('engine', async () => {
    await patchSourceSite(uid!, workflowId!, host, { engine: engine === 'auto' ? undefined : engine })
    onChanged()
  })

  const onReset = () => {
    if (!window.confirm(`Effacer toutes les données collectées de ${host} ?\n\nLe prochain scrape repartira de zéro.`)) return
    void guard('reset', async () => {
      if (!watchId) return
      const n = await resetCompetitorData(uid!, watchId, stableId(host))
      toast.success(`${host} : ${n} page(s) effacée(s).`)
    })
  }

  const onRemove = () => {
    if (!window.confirm(`Retirer ${host} de la moisson ?\n\nLes données déjà collectées sont conservées.`)) return
    void guard('remove', async () => {
      await removeSourceSite(uid!, workflowId!, host)
      onChanged()
      toast.success(`${host} retiré de la liste.`)
    })
  }

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2" style={{ borderColor: 'var(--radar-hair)' }}>
        {row && (
          <IconBtn onClick={onToggle} busy={busy === 'toggle'} tint={enabled ? 'var(--radar-live)' : undefined}
            title={enabled ? 'Désactiver ce site' : 'Activer ce site'}>
            {enabled ? <CheckSquare size={15} /> : <Square size={15} />}
          </IconBtn>
        )}
        <IconBtn onClick={onScrape} busy={busy === 'scrape'} title="Scraper ce site maintenant" tint="var(--radar-accent-2)">
          <Play size={15} />
        </IconBtn>
        <IconBtn onClick={() => setCreds((c) => !c)} tint={row?.auth ? 'var(--radar-live)' : undefined}
          title={row?.auth ? 'Accès connecté configuré — modifier' : 'Configurer un accès connecté'}>
          {row?.auth ? <Lock size={15} /> : <LockOpen size={15} />}
        </IconBtn>
        <IconBtn onClick={onReset} busy={busy === 'reset'} title="Réinitialiser les données collectées" tint="#fbbf24">
          <RotateCcw size={15} />
        </IconBtn>
        {row && (
          <IconBtn onClick={onRemove} busy={busy === 'remove'} title="Retirer ce site de la moisson" tint="var(--radar-bad)">
            <Trash2 size={15} />
          </IconBtn>
        )}
        {row && (
          <select value={row.engine ?? 'auto'} onChange={(e) => onEngine(e.target.value)}
            aria-label="Moteur de scraping" title="Moteur de scraping (Auto = cascade standard)"
            className="radar-inset ml-auto h-[34px] px-2 text-[12px]"
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
