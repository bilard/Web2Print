// Aperçu chiffré d'un changement de règles, sur UN concurrent.
//
// ⚠ Un site à la fois, et l'écran le dit. Rejouer l'appariement demande l'index complet du
// concurrent (des dizaines de milliers de fiches) : les tenir tous en mémoire est
// exactement ce que le comparatif s'interdit depuis qu'un run de 435 756 fiches ne s'est
// plus jamais terminé. Un site suffit à trancher un réglage — les proportions se
// transposent, et le run complet donnera le chiffre exact.
import { useMemo } from 'react'
import { useSourceCatalog, useSiteListings } from '../explorer/useSiteExplorer'
import { previewPairing } from '../pairingPreview'
import type { PairingRules } from '../catalog/pairingRules'
import { useTranslation } from '@/lib/i18n'

const cardCls = 'bg-surface rounded-lg p-4'

export function RulesPreview(
  { watchId, siteId, current, proposed }:
  { watchId: string | null; siteId: string | null; current: PairingRules; proposed: PairingRules },
) {
  const { t } = useTranslation()
  const source = useSourceCatalog(watchId)
  const { listings, loading } = useSiteListings(watchId, siteId)

  const preview = useMemo(
    () => (source.products.length === 0 || listings.length === 0
      ? null
      : previewPairing(source.products, listings, current, proposed)),
    [source.products, listings, current, proposed],
  )

  if (!siteId) return <p className="text-xs text-white/40">{t('pw.rules.preview.pickSite')}</p>
  // Même attente que l'écran « Concurrents », même phrase — c'est la même lecture.
  if (loading || source.loading) return <p className="text-xs text-white/40">{t('pwx.lectureDesFichesCollectees')}</p>
  if (!preview) return <p className="text-xs text-white/40">{t('pw.rules.preview.noData')}</p>

  const delta = preview.after - preview.before
  const unchanged = preview.lostTotal === 0 && preview.gainedTotal === 0

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className={cardCls}>
          <div className="text-xs text-white/40">{t('pw.rules.preview.before')}</div>
          <div className="text-xl text-white tabular-nums">{preview.before}</div>
        </div>
        <div className={cardCls}>
          <div className="text-xs text-white/40">{t('pw.rules.preview.after')}</div>
          <div className={`text-xl tabular-nums ${delta < 0 ? 'text-amber-400' : delta > 0 ? 'text-emerald-400' : 'text-white'}`}>
            {preview.after}{delta !== 0 && <span className="text-xs ml-1">({delta > 0 ? '+' : ''}{delta})</span>}
          </div>
        </div>
        <div className={cardCls}>
          <div className="text-xs text-white/40">{t('pw.rules.preview.lost')}</div>
          <div className="text-xl text-white tabular-nums">{preview.lostTotal}</div>
        </div>
        <div className={cardCls}>
          <div className="text-xs text-white/40">{t('pw.rules.preview.gained')}</div>
          <div className="text-xl text-white tabular-nums">{preview.gainedTotal}</div>
        </div>
      </div>

      {unchanged && <p className="text-xs text-white/40">{t('pw.rules.preview.unchanged')}</p>}

      {/* Par NATURE DE PREUVE : c'est ce qui dit OÙ le réglage a mordu, et donc s'il a
          fait ce qu'on croyait lui demander. */}
      {preview.byEvidence.length > 0 && (
        <div className={cardCls}>
          <div className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">
            {t('pw.rules.preview.byEvidence')}
          </div>
          <div className="space-y-1">
            {preview.byEvidence.map((row) => (
              <div key={row.evidence} className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-white/70">{t(`pw.rules.evidence.${row.evidence}` as 'pw.rules.evidence.gtin13')}</span>
                <span className="tabular-nums text-white/50">
                  {row.before}
                  {row.after !== row.before && <span className="text-white ml-2">→ {row.after}</span>}
                </span>
              </div>
            ))}
          </div>
          <div className="text-xs text-white/40 mt-2">
            {t('pw.rules.preview.vetoed', { before: preview.vetoed.before, after: preview.vetoed.after })}
          </div>
        </div>
      )}

      {/* Les paires elles-mêmes : un chiffre ne se juge qu'en regardant ce qu'il recouvre. */}
      {(preview.lost.length > 0 || preview.gained.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {([['lost', preview.lost, preview.lostTotal], ['gained', preview.gained, preview.gainedTotal]] as const)
            .filter(([, list]) => list.length > 0)
            .map(([kind, list, total]) => (
              <div key={kind} className={cardCls}>
                <div className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">
                  {kind === 'lost' ? t('pw.rules.preview.lostList') : t('pw.rules.preview.gainedList')}
                  {total > list.length && (
                    <span className="ml-2 normal-case font-normal text-white/30">
                      {t('pw.rules.preview.capped', { shown: list.length, total })}
                    </span>
                  )}
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {list.map((c) => (
                    <div key={`${c.productId}-${c.listingUrl}`} className="text-xs">
                      <div className="text-white/80 truncate">{c.productName}</div>
                      <a href={c.listingUrl} target="_blank" rel="noreferrer" className="text-white/50 hover:text-white/80 truncate block">
                        {c.listingName || c.listingUrl}
                      </a>
                      <div className="text-white/30">
                        {t(`pw.rules.evidence.${c.evidence}` as 'pw.rules.evidence.gtin13')} · {c.keyRaw}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
