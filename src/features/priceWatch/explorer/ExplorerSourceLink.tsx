// Bandeau de jointure : quelle base PIM alimente descriptions, visuels et taxonomie F1,
// et quelles colonnes y ont été reconnues. La détection est automatique mais doit rester
// VÉRIFIABLE — une colonne devinée en silence, c'est la panne muette du module
// « Comparer catalogue » qu'on ne veut pas reproduire ici.
import { Link2, AlertTriangle, Loader2, Image, ExternalLink } from 'lucide-react'
import type { SourceExtrasIndex } from './sourceExtras'
import { OPEN_DB, type SourceDbOption } from './useSourceSheet'
import { useTranslation, intlLocale } from '@/lib/i18n'

const selCls = 'bg-well text-white/70 text-[11px] rounded px-1.5 py-0.5 border border-white/10 focus:outline-none focus:border-white/25 max-w-[200px]'

/** Ce que le catalogue source PERSISTÉ porte réellement — la seule source possible pour
 *  un fichier F1 qui vient du workflow et non du PIM. */
export interface SourceCatalogFacts {
  products: number
  withImage: number
  withTaxo: number
  withDescription: number
  workflowId?: string
}

export function ExplorerSourceLink({ facts, databases, dbId, onPickDb, loading, sheets, sheetIndex, onPickSheet, extras, imagePrefix, onImagePrefix }: {
  facts: SourceCatalogFacts
  databases: SourceDbOption[]
  dbId: string
  onPickDb: (id: string) => void
  loading: boolean
  sheets: { name: string; rows: number }[]
  sheetIndex: number
  onPickSheet: (i: number) => void
  extras: SourceExtrasIndex
  imagePrefix: string
  onImagePrefix: (v: string) => void
}) {
  const { t, locale } = useTranslation()
  const ok = extras.size > 0
  const n = (v: number) => v.toLocaleString(intlLocale(locale))

  const rich = facts.withTaxo > 0 || facts.withImage > 0
  return (
    <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-white/40">
      {/* Catalogue source du WORKFLOW : c'est de là que viennent taxonomie, visuels et
          descriptions. La base PIM n'est qu'un repli, replié tant qu'il n'est pas utile. */}
      <Link2 className="w-3 h-3 shrink-0" />
      <span className="text-white/50">{t('pwx.src.catalog', { count: n(facts.products) })}</span>
      {rich ? (
        <span className="text-white/30">
          {t('pwx.src.filled', {
            img: n(facts.withImage), taxo: n(facts.withTaxo), desc: n(facts.withDescription),
          })}
        </span>
      ) : (
        <span className="text-amber-400/80 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {t('pwx.src.rerun')}
          {facts.workflowId && (
            <a href={`/workflows/${facts.workflowId}`} className="underline decoration-dotted hover:text-amber-200 inline-flex items-center gap-0.5">
              {t('pwx.src.openWorkflow')}<ExternalLink className="w-3 h-3" />
            </a>
          )}
        </span>
      )}

      <span className="text-white/15">|</span>
      <span>{t('pwx.descriptionsEtVisuelsF1')}</span>

      <select value={dbId} onChange={(e) => onPickDb(e.target.value)} className={selCls} title={t('pwx.db.pick')}>
        <option value={OPEN_DB}>{t('pwx.db.open')}</option>
        {databases.map((d) => (
          <option key={d.docId} value={d.docId}>{d.label} ({n(d.rows)})</option>
        ))}
      </select>

      {sheets.length > 1 && (
        <select value={sheetIndex} onChange={(e) => onPickSheet(Number(e.target.value))} className={selCls}>
          {sheets.map((s, i) => <option key={s.name} value={i}>{s.name} ({n(s.rows)})</option>)}
        </select>
      )}

      {loading ? (
        <span className="flex items-center gap-1 text-white/30"><Loader2 className="w-3 h-3 animate-spin" />{t('dam.loading')}</span>
      ) : sheets.length === 0 ? (
        <span className="text-amber-400/80 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />{t('pwx.aucuneBaseOuverteOuvrez')}
        </span>
      ) : ok ? (
        <span className="text-white/30">
          {t('pwx.link.indexed', { count: n(extras.size) })}
          {extras.descriptionKey
            ? t('pwx.link.descCol', { col: extras.descriptionKey })
            : t('pwx.aucuneColonneDeDescription')}
          {extras.imageKeys.length > 0
            ? t('pwx.link.imgCols', { cols: extras.imageKeys.join(' », « ') })
            : t('pwx.aucuneColonneDImage')}
          {extras.taxoKeys.some(Boolean)
            ? t('pwx.link.taxoCols', { cols: extras.taxoKeys.filter(Boolean).join(' › ') })
            : t('pwx.link.noTaxoCol')}
        </span>
      ) : (
        <span className="text-amber-400/80 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {t('pwx.aucuneColonneDeReference')}
        </span>
      )}

      {/* Préfixe d'URL des visuels : les catalogues ERP ne stockent souvent que le nom
          du fichier. Champ générique — aucune adresse client n'est codée en dur. */}
      <label className="flex items-center gap-1 text-white/30">
        <Image className="w-3 h-3 shrink-0" />
        <input value={imagePrefix} onChange={(e) => onImagePrefix(e.target.value)}
          placeholder={t('pwx.imagePrefix.placeholder')} title={t('pwx.imagePrefix.help')}
          className="bg-well text-white/70 text-[11px] rounded px-1.5 py-0.5 border border-white/10 focus:outline-none focus:border-white/25 w-[240px] placeholder:text-white/20" />
      </label>
    </div>
  )
}
