// src/features/catalog/components/steps/PlanStylePanel.tsx
// Grille de cartes du plan : Couverture et 4e de couverture — génération des
// visuels via Nano Banana (useCoverImage). Le thème (couleurs/polices) et les
// Modèles vivent dans le panneau « Fond de page » de l'Aperçu (PageOptionsTheme).
import { useState, type ReactNode } from 'react'
import { Loader2, Image as ImageIcon, BookMarked, type LucideIcon } from 'lucide-react'
import type { CatalogPlan } from '../../catalogTypes'
import { useCoverImage } from '../../useCoverImage'

interface PlanStylePanelProps {
  plan: CatalogPlan
  setPlan: (plan: CatalogPlan) => void
  coverImageUrl: string | null
  backCoverImageUrl: string | null
}

const fieldClass = 'w-full px-3 py-1.5 rounded-md bg-surface-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-600'

function Card({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4 space-y-3 min-w-0">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
        <Icon className="w-4 h-4 text-indigo-400" /> {title}
      </h3>
      {children}
    </section>
  )
}

export function PlanStylePanel({ plan, setPlan, coverImageUrl, backCoverImageUrl }: PlanStylePanelProps) {
  const { generating, generateCover } = useCoverImage()
  const [backPrompt, setBackPrompt] = useState('')
  const setCover = (patch: Partial<CatalogPlan['cover']>) => setPlan({ ...plan, cover: { ...plan.cover, ...patch } })
  const setBackCover = (patch: Partial<CatalogPlan['backCover']>) => setPlan({ ...plan, backCover: { ...plan.backCover, ...patch } })

  return (
    <div className="grid gap-5 lg:grid-cols-2 items-start">
      <Card title="Couverture" icon={ImageIcon}>
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
      </Card>

      <Card title="4e de couverture" icon={BookMarked}>
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
      </Card>
    </div>
  )
}
