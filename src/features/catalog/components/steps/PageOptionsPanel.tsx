// Panneau « Fond de page » de l'aperçu (options à droite, comme partout dans
// l'app) : options CONTEXTUELLES selon la page affichée — couverture/4e
// (textes, visuel, échelles), ouverture (éléments de l'affiche), pages
// produits/sommaire (bandeau taxonomie, pied de page, titre du sommaire).
// Réglages bornés du plan (pageStyle) : la mise en page fluide est préservée.
import { RotateCcw } from 'lucide-react'
import type { CatalogPageDescriptor, CatalogPageStyle, CatalogPlan } from '../../catalogTypes'
import { DEFAULT_PAGE_STYLE } from '../../catalogTypes'
import { mergedPageStyle } from '../pages/catalogCss'
import { OptSection, OptSlider, OptToggle, optFieldClass } from './PageOptionControls'
import { HeaderBandOptions } from './HeaderBandOptions'
import { LogoBrandOptions } from './LogoBrandOptions'
import { PageOptionsCover } from './PageOptionsCover'
import { PageOptionsTheme } from './PageOptionsTheme'
import { t } from '@/lib/i18n'

interface Props {
  page: CatalogPageDescriptor
  plan: CatalogPlan
  setPlan: (plan: CatalogPlan) => void
  coverImageUrl: string | null
  backCoverImageUrl: string | null
}

const KIND_TITLES: Record<CatalogPageDescriptor['kind'], string> = {
  'cover': 'Couverture', 'toc': 'Sommaire', 'opener': "Ouverture d'univers", 'products': 'Page produits', 'back-cover': '4e de couverture',
}

function FooterOptions({ style, patch }: { style: CatalogPageStyle; patch: (p: Partial<CatalogPageStyle>) => void }) {
  return (
    <OptSection title="Pied de page">
      <OptToggle label="Afficher" checked={style.showFooter} onChange={(v) => patch({ showFooter: v })} />
      <OptToggle label="Nom du catalogue" checked={style.showFooterName} onChange={(v) => patch({ showFooterName: v })} />
      <OptSlider label="Folio" value={style.folioScale} min={0.2} max={1.5} step={0.05} onChange={(v) => patch({ folioScale: v })} />
    </OptSection>
  )
}

export function PageOptionsPanel({ page, plan, setPlan, coverImageUrl, backCoverImageUrl }: Props) {
  const style = mergedPageStyle(plan.pageStyle)
  const patch = (p: Partial<CatalogPageStyle>) => setPlan({ ...plan, pageStyle: { ...style, ...p } })

  return (
    <aside className="w-80 shrink-0 border-l border-border bg-surface overflow-y-auto">
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">Fond de page <span className="text-xs font-normal text-white/40">— {KIND_TITLES[page.kind]}</span></h3>
          <button type="button" onClick={() => setPlan({ ...plan, pageStyle: { ...DEFAULT_PAGE_STYLE } })}
            className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-well" title={t('cat.page.resetElements')}>
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {(page.kind === 'cover' || page.kind === 'back-cover') && (
          <PageOptionsCover variant={page.kind === 'cover' ? 'cover' : 'back'} plan={plan} setPlan={setPlan}
            style={style} patchStyle={patch} imageUrl={page.kind === 'cover' ? coverImageUrl : backCoverImageUrl} />
        )}

        {page.kind === 'opener' && (
          <>
            <HeaderBandOptions style={style} patch={patch} theme={plan.theme}
              onHeaderBg={(v) => setPlan({ ...plan, theme: { ...plan.theme, headerBg: v } })}
              sections={plan.sections}
              onSectionColor={(nodeId, color) => setPlan({ ...plan, sections: plan.sections.map((s) => s.nodeId === nodeId ? { ...s, color } : s) })} />
            <OptSection title={t('cat.page.posterElements')}>
              <OptToggle label="Numéro XXL" checked={style.showOpenerNum} onChange={(v) => patch({ showOpenerNum: v })} />
              <OptToggle label="Chip chapitre" checked={style.showOpenerChip} onChange={(v) => patch({ showOpenerChip: v })} />
              <OptToggle label="Compteur produits" checked={style.showOpenerCount} onChange={(v) => patch({ showOpenerCount: v })} />
              <OptToggle label="Panneau familles" checked={style.showOpenerPanel} onChange={(v) => patch({ showOpenerPanel: v })} />
            </OptSection>
            <OptSection title="Tailles">
              <OptSlider label="Titre & numéro" value={style.openerTitleScale} min={0.2} max={1.5} step={0.05} onChange={(v) => patch({ openerTitleScale: v })} />
            </OptSection>
            <FooterOptions style={style} patch={patch} />
          </>
        )}

        {page.kind === 'products' && (
          <>
            <HeaderBandOptions style={style} patch={patch} theme={plan.theme}
              onHeaderBg={(v) => setPlan({ ...plan, theme: { ...plan.theme, headerBg: v } })}
              sections={plan.sections}
              onSectionColor={(nodeId, color) => setPlan({ ...plan, sections: plan.sections.map((s) => s.nodeId === nodeId ? { ...s, color } : s) })} />
            <FooterOptions style={style} patch={patch} />
          </>
        )}

        {page.kind === 'toc' && (
          <>
            <OptSection title="Titre du sommaire">
              <input value={plan.tocTitle} onChange={(e) => setPlan({ ...plan, tocTitle: e.target.value })} placeholder="Sommaire" className={optFieldClass} />
            </OptSection>
            <FooterOptions style={style} patch={patch} />
          </>
        )}

        {/* Logo + Thème (couleurs/polices) + Modèles : GLOBAUX, visibles sur toutes
            les pages — le logo se pose à la fois en couverture et dans le bandeau
            de chaque page, il n'appartient donc à aucun type de page. */}
        <LogoBrandOptions plan={plan} setPlan={setPlan} style={style} patchStyle={patch} />
        <PageOptionsTheme plan={plan} setPlan={setPlan} />

        <p className="text-[11px] text-white/40 leading-relaxed">
          {t('pageOptionsPanel.settingsAppliedTo')}
        </p>
      </div>
    </aside>
  )
}
