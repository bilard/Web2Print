// Bandeau de mesure de la vue « Mon catalogue ».
//
// ⚠ Il REMPLACE celui du concurrent, il ne s'y ajoute pas : sur l'écran du catalogue, la
// ligne « appariées / chez lui seul / prix médian / promos » décrivait le marchand resté
// sélectionné dans le rail. Des chiffres justes au mauvais endroit se lisent comme des
// chiffres faux — « 1 183 / 103 407 » en face de « 115 814 produits ».
//
// Ce qu'il mesure : la COMPLÉTUDE du catalogue relu. C'est la seule question qu'on se
// pose ici — de quoi dispose-t-on pour comparer, publier, enrichir.
import { AlertTriangle } from 'lucide-react'
import { Stat } from './ExplorerStat'
import type { CatalogFacts } from './catalogList'
import { useTranslation, intlLocale } from '@/lib/i18n'

export function ExplorerCatalogStats({ facts, loading, partial, expected }: {
  facts: CatalogFacts
  /** Relecture en cours : les compteurs de complétude ne sont pas « bas », ils sont partiels. */
  loading: boolean
  /** Des tranches manquent à la relecture — cf. `useSourceCatalog`. */
  partial: boolean
  /** Produits annoncés à la dernière écriture, pour chiffrer l'amputation. */
  expected: number
}) {
  const { t, locale } = useTranslation()
  const n = (v: number) => v.toLocaleString(intlLocale(locale))
  // Part du PÉRIMÈTRE AFFICHÉ, pas du catalogue entier : après un filtre par famille,
  // « 40 % avec image » doit parler de cette famille, sinon le chiffre ne bouge jamais.
  const pct = (v: number) => (facts.shown === 0 ? '—' : `${Math.round((v / facts.shown) * 100)} %`)
  const both = (v: number) => (loading ? '…' : `${n(v)} · ${pct(v)}`)

  return (
    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
      {/* Le total AVANT toute recherche : c'est le nombre auquel on compare tout le reste. */}
      <Stat label={t('pwx.catalog.stat.products')}
        value={loading ? '…' : n(facts.total)} tone="text-white"
        hint={t('pwx.catalog.stat.products.help')} />
      <Stat label={t('pwx.catalog.stat.shown')}
        value={loading ? '…' : `${n(facts.shown)} / ${n(facts.total)}`}
        hint={t('pwx.catalog.stat.shown.help')} />
      {/* Un catalogue amputé sous-compte TOUT ce qui suit : le dire ici, pas seulement
          dans une console. C'est aussi la vraie réponse à « je ne vois pas tout ». */}
      {partial && !loading && (
        <span className="flex items-center gap-1.5 whitespace-nowrap rounded px-1.5 py-0.5 border border-amber-500/35 bg-amber-500/10 text-[11px] text-amber-200"
          title={t('pwx.catalog.stat.partial.help')}>
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {t('pwx.catalog.stat.partial', { read: n(facts.total), expected: n(expected) })}
        </span>
      )}
      <Stat label={t('pwx.catalog.stat.price')} value={both(facts.withPrice)}
        tone={facts.withPrice === 0 && !loading ? 'text-amber-300' : 'text-white/80'}
        hint={t('pwx.catalog.stat.price.help')} />
      <Stat label={t('pwx.catalog.stat.image')} value={both(facts.withImage)}
        hint={t('pwx.catalog.stat.image.help')} />
      <Stat label={t('pwx.catalog.stat.taxo')} value={both(facts.withTaxo)}
        tone={facts.withTaxo === 0 && !loading ? 'text-amber-300' : 'text-white/80'}
        hint={t('pwx.catalog.stat.taxo.help')} />
      <Stat label={t('pwx.catalog.stat.description')} value={both(facts.withDescription)}
        hint={t('pwx.catalog.stat.description.help')} />
      <Stat label={t('pwx.catalog.stat.url')} value={both(facts.withUrl)}
        hint={t('pwx.catalog.stat.url.help')} />
    </div>
  )
}
