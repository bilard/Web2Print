// src/features/catalog/components/steps/PlanStylePanel.tsx
// Thème graphique + textes de couverture/4e + génération des visuels (Nano Banana).
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { FONT_OPTIONS } from '@/features/retail-promo/RetailPromoCard'
import type { CatalogPlan, CatalogTheme } from '../../catalogTypes'
import { useCoverImage } from '../../useCoverImage'

interface PlanStylePanelProps {
  plan: CatalogPlan
  setPlan: (plan: CatalogPlan) => void
  coverImageUrl: string | null
  backCoverImageUrl: string | null
}

const THEME_COLORS: { key: keyof Pick<CatalogTheme, 'accent' | 'pageBg' | 'ink' | 'headerBg' | 'headerInk'>; label: string }[] = [
  { key: 'accent', label: 'Accent' },
  { key: 'pageBg', label: 'Fond' },
  { key: 'ink', label: 'Texte' },
  { key: 'headerBg', label: 'Bandeau' },
  { key: 'headerInk', label: 'Texte bandeau' },
]

const fieldClass = 'w-full px-3 py-1.5 rounded-md bg-surface-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-600'

export function PlanStylePanel({ plan, setPlan, coverImageUrl, backCoverImageUrl }: PlanStylePanelProps) {
  const { generating, generateCover } = useCoverImage()
  const [backPrompt, setBackPrompt] = useState('')
  const theme = plan.theme
  const setThemeColor = (key: (typeof THEME_COLORS)[number]['key'], value: string) => setPlan({ ...plan, theme: { ...theme, [key]: value } })
  const setFont = (key: 'fontHeading' | 'fontBody', value: string) => setPlan({ ...plan, theme: { ...theme, [key]: value } })
  const setCover = (patch: Partial<CatalogPlan['cover']>) => setPlan({ ...plan, cover: { ...plan.cover, ...patch } })
  const setBackCover = (patch: Partial<CatalogPlan['backCover']>) => setPlan({ ...plan, backCover: { ...plan.backCover, ...patch } })

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Thème graphique</h3>
        <div className="flex flex-wrap gap-3">
          {THEME_COLORS.map(({ key, label }) => (
            <label key={key} className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
              {label}
              <input type="color" value={theme[key]} onChange={(e) => setThemeColor(key, e.target.value)} className="w-10 h-8 rounded-md bg-surface-2 cursor-pointer" />
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select value={theme.fontHeading} onChange={(e) => setFont('fontHeading', e.target.value)} className={fieldClass}>
            {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f} (titres)</option>)}
          </select>
          <select value={theme.fontBody} onChange={(e) => setFont('fontBody', e.target.value)} className={fieldClass}>
            {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f} (texte)</option>)}
          </select>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Couverture</h3>
        <input value={plan.cover.title} onChange={(e) => setCover({ title: e.target.value })} placeholder="Titre" className={fieldClass} />
        <input value={plan.cover.subtitle} onChange={(e) => setCover({ subtitle: e.target.value })} placeholder="Sous-titre" className={fieldClass} />
        <input value={plan.cover.baseline} onChange={(e) => setCover({ baseline: e.target.value })} placeholder="Bandeau (baseline)" className={fieldClass} />
        <textarea value={plan.cover.imagePrompt} onChange={(e) => setCover({ imagePrompt: e.target.value })} rows={2}
          placeholder="Prompt du visuel de couverture (EN)" className={`${fieldClass} resize-none`} />
        <div className="flex items-center gap-3">
          <button type="button" disabled={generating} onClick={() => void generateCover(plan.cover.imagePrompt, 'cover')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-[#fff] text-xs font-medium">
            {generating && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Générer le visuel de couverture
          </button>
          {coverImageUrl && <img src={coverImageUrl} alt="Couverture" className="w-14 h-14 object-cover rounded-md border border-border" />}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-white">4e de couverture</h3>
        <input value={plan.backCover.title} onChange={(e) => setBackCover({ title: e.target.value })} placeholder="Titre" className={fieldClass} />
        <textarea value={plan.backCover.text} onChange={(e) => setBackCover({ text: e.target.value })} rows={3}
          placeholder="Texte (contact, mentions…)" className={`${fieldClass} resize-none`} />
        <textarea value={backPrompt} onChange={(e) => setBackPrompt(e.target.value)} rows={2}
          placeholder="Prompt du visuel de 4e de couverture (EN)" className={`${fieldClass} resize-none`} />
        <div className="flex items-center gap-3">
          <button type="button" disabled={generating} onClick={() => void generateCover(backPrompt, 'back')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-[#fff] text-xs font-medium">
            {generating && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Générer le visuel de 4e
          </button>
          {backCoverImageUrl && <img src={backCoverImageUrl} alt="4e de couverture" className="w-14 h-14 object-cover rounded-md border border-border" />}
        </div>
      </section>
    </div>
  )
}
