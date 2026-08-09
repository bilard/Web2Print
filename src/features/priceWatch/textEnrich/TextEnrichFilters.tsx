// La barre de commande de l'écran « Traduire et améliorer les textes » : ce qu'on regarde
// (langue, présence d'un texte de vente) et ce qu'on demande (traduire, améliorer).
//
// Sorti de l'écran parce que celui-ci portait la liste ET tous ses réglages, et qu'aucun
// des deux ne se relisait.
import { useTranslation, intlLocale } from '@/lib/i18n'
import { Loader2, Play } from 'lucide-react'
import type { LangTally } from './langBreakdown'

export type SaleTextFilter = 'all' | 'with' | 'without'
/** Ce qui entre dans la file. `foreign` = langue étrangère RECONNUE ; `foreignPlus` y
 *  ajoute les indéterminés — le gros du catalogue, que le détecteur n'a pas su trancher
 *  et qui n'est pas pour autant du français. */
export type EnrichScope = 'foreign' | 'foreignPlus' | 'all'
/** Ce qu'on veut RELIRE. `translated`/`improved` distinguent les deux travaux, que la
 *  colonne APRÈS montrait de la même façon alors qu'on ne les relit pas pareil : une
 *  traduction se vérifie, une réécriture se juge. */
export type DoneFilter = 'all' | 'todo' | 'translated' | 'improved'

export function TextEnrichFilters({
  tallies, pickedLang, onPickLang,
  scope, onScope, searching,
  saleText, onSaleText,
  doneFilter, onDoneFilter,
  modes, onModes,
  limitText, onLimitText,
  running, done, count, canRun, onRun,
}: {
  tallies: LangTally[]
  pickedLang: string | null | undefined
  onPickLang: (lang: string | null | undefined) => void
  scope: EnrichScope
  onScope: (v: EnrichScope) => void
  searching: boolean
  saleText: SaleTextFilter
  onSaleText: (v: SaleTextFilter) => void
  /** Ce qui a DÉJÀ été fait — pour relire séparément traductions et réécritures. */
  doneFilter: DoneFilter
  onDoneFilter: (v: DoneFilter) => void
  modes: { translate: boolean; improve: boolean }
  onModes: (m: { translate: boolean; improve: boolean }) => void
  limitText: string
  onLimitText: (v: string) => void
  running: boolean
  done: number
  /** Nombre de fiches que le prochain lancement traitera. */
  count: number
  canRun: boolean
  onRun: () => void
}) {
  const { t, locale } = useTranslation()
  const n = (v: number) => v.toLocaleString(intlLocale(locale))
  const langLocked = searching || pickedLang !== undefined

  const chip = (active: boolean, accent = false) =>
    `rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
      active
        ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-200'
        : accent
          ? 'border-amber-400/25 text-amber-200/70 hover:text-amber-100'
          : 'border-white/10 text-white/40 hover:text-white/70'}`

  return (
    <>
      {tallies.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-white/25">{t('pwte.filter.lang')}</span>
          <button type="button" onClick={() => onPickLang(undefined)} className={chip(pickedLang === undefined)}>
            {t('pwte.lang.all')}
          </button>
          {tallies.map((x) => (
            <button key={x.lang ?? '?'} type="button"
              onClick={() => onPickLang(pickedLang === x.lang ? undefined : x.lang)}
              className={`flex items-center gap-1 ${chip(pickedLang === x.lang, !!x.lang && x.lang !== 'fr')}`}>
              <span className="uppercase">{x.lang ?? t('pwte.lang.undecided')}</span>
              <span className="tabular-nums opacity-70">{n(x.count)}</span>
            </button>
          ))}
        </div>
      )}

      {/* ⚠ Trois familles de filtres sur UNE ligne, séparées par un trait. Empilées, elles
          poussaient la liste — le sujet de l'écran — sous la ligne de flottaison, et il
          fallait défiler pour voir la première fiche. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[10px] uppercase tracking-wide text-white/25">{t('pwte.filter.saleText')}</span>
        {(['all', 'with', 'without'] as SaleTextFilter[]).map((v) => (
          <button key={v} type="button" onClick={() => onSaleText(v)} className={chip(saleText === v)}>
            {t(v === 'all' ? 'pwte.sale.all' : v === 'with' ? 'pwte.sale.with' : 'pwte.sale.without')}
          </button>
        ))}

        <span className="mx-1 h-3 w-px bg-white/10" />
        <span className="text-[10px] uppercase tracking-wide text-white/25">{t('pwte.filter.done')}</span>
        {(['all', 'todo', 'translated', 'improved'] as DoneFilter[]).map((v) => (
          <button key={v} type="button" onClick={() => onDoneFilter(v)} className={chip(doneFilter === v)}>
            {t(v === 'all' ? 'pwte.done.all' : v === 'todo' ? 'pwte.done.todo' : v === 'translated' ? 'pwte.done.translated' : 'pwte.done.improved')}
          </button>
        ))}

        <span className={`mx-1 h-3 w-px bg-white/10 ${langLocked ? 'opacity-40' : ''}`} />
        <span className={`text-[10px] uppercase tracking-wide text-white/25 ${langLocked ? 'opacity-40' : ''}`}>{t('pwte.filter.scope')}</span>
        {(['foreign', 'foreignPlus', 'all'] as EnrichScope[]).map((v) => (
          <button key={v} type="button" onClick={() => onScope(v)} disabled={langLocked}
            className={`${chip(scope === v)} ${langLocked ? 'opacity-40' : ''}`}>
            {t(v === 'foreign' ? 'pwte.scope.foreign' : v === 'foreignPlus' ? 'pwte.scope.foreignPlus' : 'pwte.scope.all')}
          </button>
        ))}
        {searching && <span className="text-[11px] text-amber-300/80">{t('pwte.searchOverrides')}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/50">
        <span className="text-[10px] uppercase tracking-wide text-white/25">{t('pwte.filter.action')}</span>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={modes.translate} className="h-3.5 w-3.5 accent-accent"
            onChange={(e) => onModes({ ...modes, translate: e.target.checked })} />
          {t('pwte.mode.translate')}
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={modes.improve} className="h-3.5 w-3.5 accent-accent"
            onChange={(e) => onModes({ ...modes, improve: e.target.checked })} />
          {t('pwte.mode.improve')}
        </label>
        <label className="flex items-center gap-1.5">
          {t('pwte.limit')}
          {/* Les flèches donnent des valeurs rondes (200 → 150 → 100 → 50 → 0 = tout) ;
              au clavier, rien n'est corrigé sous les doigts. */}
          <input type="number" min={0} step={50} value={limitText}
            onChange={(e) => onLimitText(e.target.value)}
            className="h-7 w-20 rounded border border-border bg-well px-2 text-xs text-white outline-none focus:border-accent" />
        </label>
        <button type="button" onClick={onRun} disabled={!canRun}
          className="ml-auto flex items-center gap-1.5 rounded bg-indigo-500/90 px-3 py-1.5 text-[11px] font-medium text-[#fff] hover:bg-indigo-500 disabled:opacity-40">
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {running ? t('pwte.running', { done: n(done), total: n(count) }) : t('pwte.run', { count: n(count) })}
        </button>
      </div>
    </>
  )
}
