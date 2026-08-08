// Atelier de réglage : l'arbre de décision, ses poids mesurés sur un concurrent réel, et
// l'aperçu de ce que le changement ferait perdre ou gagner.
//
// Partagé par l'écran de la veille et par le panneau du node de workflow — délibérément.
// Deux interfaces pour le même réglage divergeraient en un mois, et l'une des deux
// finirait par mentir.
import { useMemo, useState } from 'react'
import { useCompetitorMeta } from '../useCatalogReport'
import { useSourceCatalog, useSiteListings } from '../explorer/useSiteExplorer'
import { measurePairing } from '../pairingWeights'
import { isCursorDomain } from '../radar/scrapeState'
import { RulesTree } from './RulesTree'
import { RulesPreview } from './RulesPreview'
import type { PairingRules } from '../catalog/pairingRules'
import { useTranslation } from '@/lib/i18n'
import { Info, Loader2 } from 'lucide-react'

export function RulesWorkbench(
  { watchId, rules, onChange, baseline }:
  {
    watchId: string | null
    rules: PairingRules
    onChange: (next: PairingRules) => void
    /** Règles de RÉFÉRENCE auxquelles comparer (celles enregistrées pour le suivi).
     *  L'aperçu dit alors ce que le passage de l'une à l'autre changerait. */
    baseline: PairingRules
  },
) {
  const { t } = useTranslation()
  const meta = useCompetitorMeta(watchId)
  const [site, setSite] = useState<string | null>(null)
  const source = useSourceCatalog(watchId)
  const { listings, loading } = useSiteListings(watchId, site)

  const sites = useMemo(
    () => [...meta.entries()]
      .map(([siteId, m]) => ({ siteId, domain: m.domain ?? '' }))
      // ⚠ Les docs de curseur de la recherche dirigée portent un `domain` et se
      // présentaient donc comme des concurrents. `directed-auth-cursor` apparaissait dans
      // la liste, mesurable, et n'aurait donné que des zéros.
      .filter((s) => s.domain !== '' && !isCursorDomain(s.domain))
      .sort((a, b) => a.domain.localeCompare(b.domain)),
    [meta],
  )

  // Poids mesurés avec les règles EN COURS D'ÉDITION : l'arbre montre l'état des lieux tel
  // qu'il serait sous ces réglages, pas un état passé.
  const weights = useMemo(
    () => (source.products.length === 0 || listings.length === 0
      ? null
      : measurePairing(source.products, listings, rules)),
    [source.products, listings, rules],
  )

  const measuring = !!site && (loading || source.loading)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
          {t('pw.rules.measure.on')}
        </span>
        <select
          value={site ?? ''} onChange={(e) => setSite(e.target.value || null)}
          className="bg-well text-white/80 text-xs rounded px-2 py-1.5 border border-white/10 focus:outline-none focus:border-white/25"
        >
          <option value="">{t('pw.rules.preview.pickSiteOption')}</option>
          {sites.map((s) => <option key={s.siteId} value={s.siteId}>{s.domain}</option>)}
        </select>
        {/* La relecture d'un index mûr, c'est des dizaines de milliers de fiches : sans
            avancement, on ne distingue pas « ça travaille » de « c'est bloqué ». Le
            catalogue source se lit par tranches et sait le dire ; les fiches du site, non. */}
        {measuring && (
          <span className="text-[11px] text-white/40 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            {source.loading && source.progress.total > 0
              ? t('pw.rules.measure.loadingSource', {
                done: source.progress.done, total: source.progress.total,
              })
              : t('pwx.lectureDesFichesCollectees')}
          </span>
        )}
        {weights && (
          <span className="text-[11px] text-white/40">
            {t('pw.rules.measure.scope', {
              products: weights.products, listings: weights.listings, matched: weights.matched,
            })}
          </span>
        )}
      </div>

      {/* ⚠ L'ABSENCE de mesure se dit, elle ne s'affiche pas en zéros. Un « 0 » en face de
          « code-barres déclaré » se lit « cette preuve ne prouve rien », soit l'inverse de
          la vérité quand la cause est qu'aucune moisson n'a encore tourné. */}
      {!site && <p className="text-[11px] text-white/40">{t('pw.rules.measure.pickToSee')}</p>}
      {site && !measuring && !weights && (
        <p className="text-[11px] text-amber-400/80">
          {source.products.length === 0 ? t('pw.rules.measure.noSource') : t('pw.rules.measure.noListings')}
        </p>
      )}

      <RulesTree rules={rules} onChange={onChange} weights={weights} loading={measuring} />

      <div className="space-y-2 pt-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-white/40 flex items-center gap-1.5">
          {t('pw.rules.preview.title')}
          <span className="font-normal normal-case text-white/30">· {t('pw.rules.measure.scopeShort')}</span>
          {/* La portée d'un seul concurrent DOIT rester visible — mais deux lignes de
              prose entre les chiffres et l'arbre les séparaient de leur cause. */}
          <span title={t('pw.rules.preview.scope')} className="inline-flex shrink-0 cursor-help">
            <Info className="w-3 h-3 text-white/25 hover:text-white/60" />
          </span>
        </h3>
        <RulesPreview products={source.products} listings={listings} current={baseline} proposed={rules} loading={measuring} />
      </div>
    </div>
  )
}
