// Nuage de points en TROIS dimensions : trois mesures confrontées dans un volume qu'on tourne.
//
// ⚠⚠ Le seul visuel du module où une troisième dimension ne MENT pas. Une barre ou une part
// de camembert en 3D fausse la comparaison (la perspective raccourcit ce qui est au fond) ;
// un nuage n'encode ni longueur ni angle, seulement des POSITIONS — un axe de plus s'y
// ajoute sans rien déformer. Ce qu'il apporte est l'exploration (grappes, points aberrants),
// jamais la lecture exacte d'une valeur : celle-ci reste dans l'info-bulle.
import { Suspense, lazy, useCallback, useMemo } from 'react'
import { useThemeStore } from '@/stores/theme.store'
import { buildScatter3D } from './scatter3dData'
import type { Scatter3DAxisView, Scatter3DTheme } from './scatter3dScene'
import { RAMP_DARK, RAMP_LIGHT, rampCss } from './scatter3dRamp'
import { biLabel } from '../biLabel'
import { formatMeasure } from '../../engine/formatValue'
import { intlLocale, useTranslation } from '@/lib/i18n'
import type { AggregateResult } from '../../engine/aggregate'

const Scatter3DCanvas = lazy(() => import('./Scatter3DCanvas'))

/** Deux jeux CHOISIS, jamais l'inversion automatique l'un de l'autre : une rampe réglée sur
 *  fond sombre perd ses crans bas sur fond clair. */
const THEMES: Record<'dark' | 'light', Scatter3DTheme> = {
  dark: { frame: '#4a4a5e', ink: '#c4c4cc', inkDim: '#8b8b96', ramp: RAMP_DARK, bloom: 0.48 },
  // ⚠ Pas de halo sur fond clair : il n'éclaire que ce qui est plus sombre que lui, et sur
  // du blanc il délave les points au lieu de les faire ressortir.
  light: { frame: '#c9c9d2', ink: '#3f3f46', inkDim: '#71717a', ramp: RAMP_LIGHT, bloom: 0 },
}

export function Scatter3DTile({ result }: { result: AggregateResult }) {
  const { t, locale } = useTranslation()
  const dark = useThemeStore((s) => s.resolvedTheme) === 'dark'
  const model = useMemo(() => buildScatter3D(result), [result])
  const theme = dark ? THEMES.dark : THEMES.light

  const formatAt = useCallback((axis: 0 | 1 | 2, value: number) => {
    if (!model) return ''
    const column = [model.axes.x, model.axes.y, model.axes.z][axis].column
    return formatMeasure(value, column.format, intlLocale(locale))
  }, [model, locale])
  // ⚠ Référence STABLE : la scène repose ses étiquettes à chaque changement de cette
  // valeur. Un littéral frais à chaque rendu détruirait et rebâtirait neuf sprites en boucle.
  // ⚠⚠ Les BORNES accompagnent le nom : un axe seulement nommé montre une forme et aucune
  // valeur — impossible de dire si l'écart d'un point vaut 2 % ou 200 %.
  const axes = useMemo(() => {
    if (!model) return null
    return ([model.axes.x, model.axes.y, model.axes.z] as const).map((axis, i) => ({
      label: biLabel(axis.column, t),
      min: formatAt(i as 0 | 1 | 2, axis.min),
      max: formatAt(i as 0 | 1 | 2, axis.max),
    })) as [Scatter3DAxisView, Scatter3DAxisView, Scatter3DAxisView]
  }, [model, t, formatAt])

  // ⚠ Le message COMPTE ce qui manque et NOMME la zone où déposer : « demande trois mesures »
  // laissait devant une tuile vide sans savoir quel geste la remplirait.
  const missing = 3 - result.columns.filter((c) => c.role === 'measure').length
  // ⚠⚠ Sans dimension d'axe, le moteur ne rend qu'une LIGNE de totaux : le nuage se
  // réduirait à un point unique au centre du volume. On le dit plutôt que de le montrer.
  const noAxis = !result.columns.some((c) => c.role === 'dimension')
  if (!model || !axes || noAxis) {
    return (
      <p className="grid h-full place-items-center px-4 text-center text-[11px] text-white/35">
        {missing > 0
          ? t('bi.scatter3d.needsThreeMeasures', { missing })
          : t('bi.scatter3d.needsAxis')}
      </p>
    )
  }

  const z = model.axes.z
  return (
    <div className="flex h-full flex-col gap-1">
      <div className="min-h-0 flex-1">
        <Suspense fallback={<div className="h-full w-full animate-pulse rounded-md bg-well" />}>
          <Scatter3DCanvas model={model} theme={theme} axes={axes} formatAt={formatAt} />
        </Suspense>
      </div>
      <div className="flex items-center justify-between gap-3 text-[10px] text-white/40">
        {/* La rampe redit l'axe de profondeur : c'est le seul des trois que l'œil ne mesure
            pas sur un écran plat. */}
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{biLabel(z.column, t)}</span>
          <span className="tabular-nums">{formatAt(2, z.min)}</span>
          <span
            className="h-2 w-10 shrink-0 rounded-full"
            style={{ background: rampCss(theme.ramp) }}
          />
          <span className="tabular-nums">{formatAt(2, z.max)}</span>
        </span>
        {/* ⚠ Les lignes écartées sont DITES : un nuage amputé sans un mot se lit comme
            une donnée complète, et c'est sur lui qu'on décide. */}
        {model.dropped > 0 && (
          <span className="shrink-0 text-amber-400/70">
            {t('bi.scatter3d.dropped', { count: model.dropped })}
          </span>
        )}
      </div>
    </div>
  )
}
