// Bandeau de jointure : quelle base PIM alimente les descriptions et visuels F1, et
// quelles colonnes y ont été reconnues. La détection est automatique mais doit rester
// VÉRIFIABLE — une colonne devinée en silence, c'est la panne muette du module
// « Comparer catalogue » qu'on ne veut pas reproduire ici.
import { Link2, AlertTriangle } from 'lucide-react'
import type { SourceExtrasIndex } from './sourceExtras'
import { useTranslation, intlLocale } from '@/lib/i18n'

export function ExplorerSourceLink({ sheet, sheets, sheetIndex, onPick, extras }: {
  sheet: { name: string; rows: number } | null
  sheets: { name: string; rows: number }[]
  sheetIndex: number
  onPick: (i: number) => void
  extras: SourceExtrasIndex
}) {
  const { t, locale } = useTranslation()
  if (!sheet) {
    return (
      <p className="text-[11px] text-white/35 flex items-center gap-1.5">
        <AlertTriangle className="w-3 h-3 shrink-0" />
        {t('pwx.aucuneBaseOuverteOuvrez')}
      </p>
    )
  }

  const ok = extras.size > 0
  return (
    <div className="flex items-center gap-2 flex-wrap text-[11px] text-white/40">
      <Link2 className="w-3 h-3 shrink-0" />
      <span>{t('pwx.descriptionsEtVisuelsF1')}</span>
      {sheets.length > 1 ? (
        <select value={sheetIndex} onChange={(e) => onPick(Number(e.target.value))}
          className="bg-well text-white/70 text-[11px] rounded px-1.5 py-0.5 border border-white/10 focus:outline-none focus:border-white/25">
          {sheets.map((s, i) => <option key={s.name} value={i}>{s.name} ({s.rows})</option>)}
        </select>
      ) : (
        <span className="text-white/70">{sheet.name}</span>
      )}
      {ok ? (
        <span className="text-white/30">
          {t('pwx.link.indexed', { count: extras.size.toLocaleString(intlLocale(locale)) })}
          {extras.descriptionKey
            ? t('pwx.link.descCol', { col: extras.descriptionKey })
            : t('pwx.aucuneColonneDeDescription')}
          {extras.imageKeys.length > 0
            ? t('pwx.link.imgCols', { cols: extras.imageKeys.join(' », « ') })
            : t('pwx.aucuneColonneDImage')}
        </span>
      ) : (
        <span className="text-amber-400/80 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {t('pwx.aucuneColonneDeReference')}
        </span>
      )}
    </div>
  )
}
