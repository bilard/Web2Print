// Sections « Thème graphique » et « Modèles » du panneau Fond de page :
// couleurs + polices (globales, aperçu live sur la page affichée) et modèles
// réutilisables inter-catalogues (thème + styles fiches/pages, sans données).
import { FontSelectOptions } from '@/features/fonts/FontSelectOptions'
import { UserFontsPanel } from '@/features/fonts/UserFontsPanel'
import { ColorPicker } from '@/components/shared/ColorPicker'
import { inputCls } from '@/components/shared/panel'
import type { CatalogPlan, CatalogTheme } from '../../catalogTypes'
import { TemplatesBar } from './TemplatesBar'
import { OptSection, optFieldClass } from './PageOptionControls'
import { t } from '@/lib/i18n'

interface Props {
  plan: CatalogPlan
  setPlan: (plan: CatalogPlan) => void
}

/** Pastilles du thème global — partagées avec l'étape « Prompt & style » (CardStyleCard).
 *  Le BANDEAU (fond + textes Univers/Famille) n'est PAS ici : il se règle en un
 *  seul endroit, la section « Bandeau taxonomie » (HeaderBandOptions) — la
 *  duplication Bandeau/Txt bandeau entre deux panneaux rendait le tout illisible. */
export const THEME_COLORS: { key: keyof Pick<CatalogTheme, 'accent' | 'pageBg' | 'ink'>; label: string }[] = [
  { key: 'accent', label: 'Accent' },
  { key: 'pageBg', label: 'Fond' },
  { key: 'ink', label: 'Texte' },
]

export function PageOptionsTheme({ plan, setPlan }: Props) {
  const theme = plan.theme
  const setColor = (key: (typeof THEME_COLORS)[number]['key'], value: string) => setPlan({ ...plan, theme: { ...theme, [key]: value } })
  const setFont = (key: 'fontHeading' | 'fontBody', value: string) => setPlan({ ...plan, theme: { ...theme, [key]: value } })

  return (
    <>
      <OptSection title={t('cat.page.themeColors')}>
        <div className="flex flex-wrap gap-2">
          {THEME_COLORS.map(({ key, label }) => (
            <ColorPicker key={key} value={theme[key]} onChange={(v) => setColor(key, v)} label={label} />
          ))}
        </div>
        <p className="text-[10px] text-white/35 leading-snug">
          {t('pageOptionsTheme.theUniverseFamily')}
        </p>
      </OptSection>
      <OptSection title="Polices">
        <div className="grid grid-cols-2 gap-2">
          {(['fontHeading', 'fontBody'] as const).map((key) => (
            <label key={key} className="flex flex-col gap-1 text-xs text-white/40">
              {key === 'fontHeading' ? 'Titres' : 'Texte'}
              <select value={theme[key]} onChange={(e) => setFont(key, e.target.value)} className={inputCls}>
                <FontSelectOptions />
              </select>
            </label>
          ))}
        </div>
        <UserFontsPanel />
      </OptSection>
      <OptSection title={t('cat.page.templates')}>
        <TemplatesBar plan={plan} setPlan={setPlan} fieldClass={optFieldClass} />
      </OptSection>
    </>
  )
}
