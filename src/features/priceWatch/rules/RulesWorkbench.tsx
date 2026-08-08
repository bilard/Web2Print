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
    <div className="space-y-3">
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
        {measuring && <span className="text-[11px] text-white/40">{t('pwx.lectureDesFichesCollectees')}</span>}
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

      <RulesTree rules={rules} onChange={onChange} weights={weights} />

      <div className="space-y-2 pt-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
          {t('pw.rules.preview.title')}
        </h3>
        <p className="text-[11px] text-white/40">{t('pw.rules.preview.scope')}</p>
        <RulesPreview products={source.products} listings={listings} current={baseline} proposed={rules} />
      </div>
    </div>
  )
}
