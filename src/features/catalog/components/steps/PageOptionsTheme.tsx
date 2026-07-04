// src/features/catalog/components/steps/PageOptionsTheme.tsx
// Sections « Thème graphique » et « Modèles » du panneau Fond de page :
// couleurs + polices (globales, aperçu live sur la page affichée) et modèles
// réutilisables inter-catalogues (thème + styles fiches/pages, sans données).
import { FontSelectOptions } from '@/features/fonts/FontSelectOptions'
import { UserFontsPanel } from '@/features/fonts/UserFontsPanel'
import type { CatalogPlan, CatalogTheme } from '../../catalogTypes'
import { mergedPageStyle } from '../pages/catalogCss'
import { TemplatesBar } from './TemplatesBar'
import { OptSection, OptToggle, optFieldClass } from './PageOptionControls'

interface Props {
  plan: CatalogPlan
  setPlan: (plan: CatalogPlan) => void
}

const THEME_COLORS: { key: keyof Pick<CatalogTheme, 'accent' | 'pageBg' | 'ink' | 'headerBg' | 'headerInk'>; label: string }[] = [
  { key: 'accent', label: 'Accent' },
  { key: 'pageBg', label: 'Fond' },
  { key: 'ink', label: 'Texte' },
  { key: 'headerBg', label: 'Bandeau' },
  { key: 'headerInk', label: 'Txt bandeau' },
]

export function PageOptionsTheme({ plan, setPlan }: Props) {
  const theme = plan.theme
  const style = mergedPageStyle(plan.pageStyle)
  const setColor = (key: (typeof THEME_COLORS)[number]['key'], value: string) => setPlan({ ...plan, theme: { ...theme, [key]: value } })
  const setFont = (key: 'fontHeading' | 'fontBody', value: string) => setPlan({ ...plan, theme: { ...theme, [key]: value } })

  return (
    <>
      <OptSection title="Thème graphique — couleurs">
        <div className="flex flex-wrap gap-2">
          {THEME_COLORS.map(({ key, label }) => (
            <label key={key} className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground">
              {label}
              <input type="color" value={theme[key]} onChange={(e) => setColor(key, e.target.value)}
                className="w-9 h-7 rounded-md bg-surface-2 cursor-pointer" />
            </label>
          ))}
        </div>
        {/* Le bandeau du thème s'efface quand les couleurs par chapitre sont actives. */}
        <OptToggle label="Couleurs par chapitre (bandeau & ouvertures)" checked={style.chapterColors}
          onChange={(v) => setPlan({ ...plan, pageStyle: { ...style, chapterColors: v } })} />
      </OptSection>
      <OptSection title="Polices">
        <div className="grid grid-cols-2 gap-2">
          {(['fontHeading', 'fontBody'] as const).map((key) => (
            <label key={key} className="flex flex-col gap-1 text-xs text-muted-foreground">
              {key === 'fontHeading' ? 'Titres' : 'Texte'}
              <select value={theme[key]} onChange={(e) => setFont(key, e.target.value)} className={optFieldClass}>
                <FontSelectOptions />
              </select>
            </label>
          ))}
        </div>
        <UserFontsPanel />
      </OptSection>
      <OptSection title="Modèles — réutilisables dans vos autres catalogues">
        <TemplatesBar plan={plan} setPlan={setPlan} fieldClass={optFieldClass} />
      </OptSection>
    </>
  )
}
