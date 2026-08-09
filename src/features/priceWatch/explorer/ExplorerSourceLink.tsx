// Bandeau de jointure : quelle base PIM alimente descriptions, visuels et taxonomie F1,
// et quelles colonnes y ont été reconnues. La détection est automatique mais doit rester
// VÉRIFIABLE — une colonne devinée en silence, c'est la panne muette du module
// « Comparer catalogue » qu'on ne veut pas reproduire ici.
import { useState } from 'react'
import { Link2, AlertTriangle, Loader2, Image, ExternalLink, Database } from 'lucide-react'
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
  /** Produits dont le catalogue persisté porte l'adresse de MA fiche. 0 = la colonne
   *  d'URL n'a pas été mappée au dernier « Comparer catalogue ». */
  withUrl: number
  /** Une adresse RÉELLE tirée du fichier source, pour vérifier d'un clic ce que la colonne
   *  contient. Un compteur dit combien de lignes en portent une, jamais si elle est bonne :
   *  une colonne mal mappée affiche « 115 814 avec lien produit » et ouvre des pages mortes. */
  sampleUrl?: string
  workflowId?: string
  /** Des tranches du catalogue manquent : les appariés affichés sont SOUS-COMPTÉS. */
  partial: boolean
  expected: number
  /** Lignes fournies par la feuille source au dernier run (0 = non mesuré). */
  sourceRows: number
  /** Poids relu à CHAQUE ouverture de l'écran et durée de cette relecture : c'est ce
   *  chiffre, pas le nombre de produits, qui explique l'attente. */
  bytes: number
  ms: number
}

export function ExplorerSourceLink({ facts, databases, dbId, onPickDb, loading, sheets, sheetIndex, onPickSheet, extras, imagePrefix, onImagePrefix, productUrl, onProductUrl }: {
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
  productUrl: string
  onProductUrl: (v: string) => void
}) {
  const { t, locale } = useTranslation()
  const ok = extras.size > 0
  const n = (v: number) => v.toLocaleString(intlLocale(locale))

  // Quand le catalogue source porte déjà taxonomie et visuels, la jointure PIM ne sert
  // plus à rien : elle n'est qu'un REPLI pour les catalogues écrits avant, ou pour une
  // base plus riche que la feuille du workflow. Repliée par défaut dans ce cas — deux
  // sources affichées côte à côte laissaient croire qu'il fallait choisir.
  const rich = facts.withTaxo > 0 || facts.withImage > 0
  const [showFallback, setShowFallback] = useState(false)
  return (
    <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-white/40">
      {/* Catalogue source du WORKFLOW : c'est de là que viennent taxonomie, visuels et
          descriptions. La base PIM n'est qu'un repli, replié tant qu'il n'est pas utile. */}
      <Link2 className="w-3 h-3 shrink-0" />
      <span className="text-white/50">
        {facts.sourceRows > 0
          ? t('pwx.src.catalogRows', { count: n(facts.products), rows: n(facts.sourceRows) })
          : t('pwx.src.catalog', { count: n(facts.products) })}
      </span>
      {/* Le temps d'ouverture n'a rien d'un mystère : tout le catalogue est relu à chaque
          fois (aucun cache). On affiche donc ce qu'il a fallu transférer. */}
      {facts.bytes > 0 && (
        <span className="text-white/25" title={t('pwx.src.weight.help')}>
          {t('pwx.src.weight', { mb: (facts.bytes / 1e6).toFixed(1), s: (facts.ms / 1000).toFixed(1) })}
        </span>
      )}
      {/* Aucun lien dans le catalogue : c'est la colonne d'URL du node qui manque, pas un
          réglage de cet écran. On le dit là où on cherche, avec le geste qui corrige. */}
      {facts.products > 0 && facts.withUrl === 0 && (
        <span className="text-amber-400/80 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {t('pwx.src.noUrlCol')}
        </span>
      )}
      {facts.partial && (
        <span className="text-rose-300 flex items-center gap-1 font-medium">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {t('pwx.src.partial', { read: n(facts.products), expected: n(facts.expected) })}
        </span>
      )}
      {rich ? (
        <span className="text-white/30">
          {t('pwx.src.filled', {
            img: n(facts.withImage), taxo: n(facts.withTaxo), desc: n(facts.withDescription),
          })}
          {/* Le lien vers MA fiche mérite son compteur : sans lui, « pourquoi le nom F1
              n'est-il pas cliquable ? » n'a aucune réponse lisible à l'écran. */}
          {facts.withUrl > 0 && t('pwx.src.withUrl', { count: n(facts.withUrl) })}
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
      {rich && !showFallback ? (
        <button type="button" onClick={() => setShowFallback(true)}
          title={t('pwx.fallback.help')}
          className="flex items-center gap-1 text-white/25 hover:text-white/60 transition-colors">
          <Database className="w-3 h-3" />{t('pwx.fallback.show')}
        </button>
      ) : (
      <>
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
          {/* La colonne d'URL rend le gabarit inutile : le dire, sinon on cherche pourquoi
              le nom F1 est cliquable ici et pas là. */}
          {extras.urlKey && t('pwx.link.urlCol', { col: extras.urlKey })}
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

      </>
      )}

      {/* Préfixe des visuels : utile quelle que soit la source — PATH_PHOTO ne porte
          qu'un nom de fichier, côté catalogue du workflow comme côté base PIM. */}
      <label className="flex items-center gap-1 text-white/30">
        <Image className="w-3 h-3 shrink-0" />
        <input value={imagePrefix} onChange={(e) => onImagePrefix(e.target.value)}
          placeholder={t('pwx.imagePrefix.placeholder')} title={t('pwx.imagePrefix.help')}
          className="bg-well text-white/70 text-[11px] rounded px-1.5 py-0.5 border border-white/10 focus:outline-none focus:border-white/25 w-[240px] placeholder:text-white/20" />
      </label>

      {/* Fiche produit sur MON site. Le gabarit ne sert que de DERNIER recours : quand le
          fichier source porte sa propre colonne d'adresse, c'est elle qui gagne. */}
      <label className="flex items-center gap-1 text-white/30">
        <ExternalLink className="w-3 h-3 shrink-0" />
        <input value={productUrl} onChange={(e) => onProductUrl(e.target.value)}
          placeholder={t('pwx.productUrl.placeholder')} title={t('pwx.productUrl.help')}
          className="bg-well text-white/70 text-[11px] rounded px-1.5 py-0.5 border border-white/10 focus:outline-none focus:border-white/25 w-[240px] placeholder:text-white/20" />
      </label>

      {/* L'adresse telle qu'elle est DANS le fichier source, ouvrable. « 115 814 avec lien
          produit » ne dit pas si la colonne mappée est la bonne : une adresse de fiche
          fournisseur et une adresse de fiche interne se comptent pareil, et seule
          l'ouverture tranche. */}
      {facts.sampleUrl && (
        <a href={facts.sampleUrl} target="_blank" rel="noreferrer"
          title={t('pwx.src.sampleUrl.help', { url: facts.sampleUrl })}
          className="flex items-center gap-1 max-w-[280px] text-white/30 hover:text-indigo-300">
          <ExternalLink className="w-3 h-3 shrink-0" />
          <span className="truncate underline decoration-dotted underline-offset-2">
            {t('pwx.src.sampleUrl')}
          </span>
        </a>
      )}
    </div>
  )
}
