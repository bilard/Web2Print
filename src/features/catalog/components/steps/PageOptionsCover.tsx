// Options contextuelles de la COUVERTURE et de la 4E : textes, éléments
// affichés, échelles, assombrissement du visuel et génération du visuel IA.
import { useState } from 'react'
import { useCatalogStore } from '@/stores/catalog.store'
import type { CatalogPageStyle, CatalogPlan } from '../../catalogTypes'
import { CoverVisualField } from './CoverVisualField'
import { OptSection, OptSlider, OptToggle, optFieldClass } from './PageOptionControls'
import { t } from '@/lib/i18n'

interface Props {
  variant: 'cover' | 'back'
  plan: CatalogPlan
  setPlan: (plan: CatalogPlan) => void
  style: CatalogPageStyle
  patchStyle: (p: Partial<CatalogPageStyle>) => void
  imageUrl: string | null
}

export function PageOptionsCover({ variant, plan, setPlan, style, patchStyle, imageUrl }: Props) {
  const [backPrompt, setBackPrompt] = useState('')
  const globalPrompt = useCatalogStore((s) => s.prompt)
  const isCover = variant === 'cover'
  const setCover = (p: Partial<CatalogPlan['cover']>) => setPlan({ ...plan, cover: { ...plan.cover, ...p } })
  const setBack = (p: Partial<CatalogPlan['backCover']>) => setPlan({ ...plan, backCover: { ...plan.backCover, ...p } })
  const prompt = isCover ? plan.cover.imagePrompt : backPrompt

  return (
    <>
      <OptSection title="Textes">
        {isCover ? (
          <>
            <input value={plan.cover.title} onChange={(e) => setCover({ title: e.target.value })} placeholder="Titre" className={optFieldClass} />
            <input value={plan.cover.subtitle} onChange={(e) => setCover({ subtitle: e.target.value })} placeholder="Sous-titre" className={optFieldClass} />
            <input value={plan.cover.baseline} onChange={(e) => setCover({ baseline: e.target.value })} placeholder="Bandeau (baseline)" className={optFieldClass} />
          </>
        ) : (
          <>
            <input value={plan.backCover.title} onChange={(e) => setBack({ title: e.target.value })} placeholder="Titre" className={optFieldClass} />
            <textarea value={plan.backCover.text} onChange={(e) => setBack({ text: e.target.value })} rows={4}
              placeholder="Texte (contact, mentions…)" className={`${optFieldClass} resize-none`} />
          </>
        )}
      </OptSection>
      <OptSection title={t('cat.page.coverElements')}>
        {isCover ? (
          <>
            <OptToggle label="Bandeau baseline" checked={style.showCoverBaseline} onChange={(v) => patchStyle({ showCoverBaseline: v })} />
            <OptToggle label="Sous-titre" checked={style.showCoverSubtitle} onChange={(v) => patchStyle({ showCoverSubtitle: v })} />
            <OptToggle label="Filet accent" checked={style.showCoverRule} onChange={(v) => patchStyle({ showCoverRule: v })} />
          </>
        ) : (
          <OptToggle label="Filet accent" checked={style.showBackRule} onChange={(v) => patchStyle({ showBackRule: v })} />
        )}
      </OptSection>
      <OptSection title="Tailles & visuel">
        {isCover
          ? <OptSlider label="Titres" value={style.coverTitleScale} min={0.2} max={1.5} step={0.05} onChange={(v) => patchStyle({ coverTitleScale: v })} />
          : <OptSlider label="Textes" value={style.backScale} min={0.2} max={1.5} step={0.05} onChange={(v) => patchStyle({ backScale: v })} />}
        <OptSlider label="Assombrissement visuel" value={style.coverOverlay} min={0} max={80} step={5} unit="%" onChange={(v) => patchStyle({ coverOverlay: v })} />
      </OptSection>
      <OptSection title="Visuel IA">
        {/* Champ vide = on retombe sur le Prompt global, comme à l'étape Prompt :
            sans ce repli, le bouton restait désactivé alors qu'un prompt existe. */}
        <CoverVisualField target={variant} prompt={prompt || (isCover ? globalPrompt : '')} imageUrl={imageUrl}
          onPrompt={(v) => (isCover ? setCover({ imagePrompt: v }) : setBackPrompt(v))} />
        {isCover && !prompt.trim() && globalPrompt.trim() && (
          <p className="text-[10px] text-white/40 leading-snug">
            Champ vide : c'est le Prompt global de l'étape « Prompt &amp; style » qui part.
          </p>
        )}
      </OptSection>
    </>
  )
}
