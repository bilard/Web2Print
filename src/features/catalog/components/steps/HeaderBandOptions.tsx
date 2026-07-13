// src/features/catalog/components/steps/HeaderBandOptions.tsx
// Section « Bandeau taxonomie » (Univers › Famille) : partagée entre le panneau
// « Fond de page » de l'Aperçu (pages produits) et l'aside « Style des fiches »
// de Prompt & style. Le bandeau est un élément de PAGE : il se voit sur les
// pages du catalogue (Aperçu/export), pas dans l'aperçu de fiche seule.
import { ColorPicker } from '@/components/shared/ColorPicker'
import { FontSelectOptions } from '@/features/fonts/FontSelectOptions'
import type { CatalogPageStyle, CatalogSectionPlan, CatalogTheme } from '../../catalogTypes'
import { defaultUniverseColor } from '../../catalogFlatplan'
import { OptSection, OptSlider, OptToggle, optFieldClass } from './PageOptionControls'

interface Props {
  style: CatalogPageStyle
  patch: (p: Partial<CatalogPageStyle>) => void
  theme: CatalogTheme
  /** Écrit la couleur « Bandeau » du thème (régime uniforme) — pastille « Fond bandeau » du groupe. */
  onHeaderBg?: (v: string) => void
  /** Sections du plan (une par univers) — pastilles de FOND par chapitre quand le régime chapitre est actif. */
  sections?: CatalogSectionPlan[]
  onSectionColor?: (nodeId: string, color: string) => void
  /** Note contextuelle (ex. depuis Prompt & style : « visible dans l'Aperçu »). */
  hint?: string
}

/** Nom lisible de l'univers depuis le nodeId de sa section (slug du label,
 *  cf. buildCatalogTree : id = segments slugifiés joints par « / »). */
function universeLabelFromNodeId(nodeId: string): string | null {
  const slug = nodeId.split('/')[0] ?? ''
  const human = slug.replace(/[-_]+/g, ' ').trim()
  return human ? human.charAt(0).toUpperCase() + human.slice(1) : null
}

export function HeaderBandOptions({ style, patch, theme, onHeaderBg, sections, onSectionColor, hint }: Props) {
  return (
    <OptSection title="Bandeau taxonomie (Univers › Famille)">
      {hint && <p className="text-[10px] text-white/35 leading-snug">{hint}</p>}
      <OptToggle label="Afficher" checked={style.showHeader} onChange={(v) => patch({ showHeader: v })} />
      {/* Le FOND du bandeau a DEUX régimes — la source de confusion classique :
          par chapitre (couleur de l'univers) ou couleur « Bandeau » du thème. */}
      <OptToggle label="Couleurs par chapitre (fond = couleur de l'univers)" checked={style.chapterColors}
        onChange={(v) => patch({ chapterColors: v })} />
      <p className="text-[10px] text-white/35 leading-snug">
        {style.chapterColors
          ? <>Fond du bandeau = couleur du <b>chapitre</b> (une par univers — pastille modifiable dans le panneau Sections / chemin de fer). La couleur « Bandeau » du thème est ignorée sur les pages produits.</>
          : <>Fond du bandeau = couleur « Bandeau » du thème (section Couleurs du thème).</>}
      </p>
      <OptSlider label="Taille" value={style.headerScale} min={0.7} max={1.5} step={0.05} onChange={(v) => patch({ headerScale: v })} />
      {/* Réglages FINS par niveau — échelles multiplicatives sur « Taille »
          (1× = suit), police et couleur du texte par niveau ('' = hérite). */}
      <OptSlider label="Taille Univers" value={style.headUniversScale ?? 1} min={0.7} max={2} step={0.05} onChange={(v) => patch({ headUniversScale: v })} />
      <OptSlider label="Taille Famille" value={style.headCrumbScale ?? 1} min={0.7} max={2} step={0.05} onChange={(v) => patch({ headCrumbScale: v })} />
      <div className="grid grid-cols-2 gap-2">
        {([['headUniversFont', 'Police Univers'], ['headCrumbFont', 'Police Famille']] as const).map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-white/40">
            {label}
            <select value={style[key] ?? ''} onChange={(e) => patch({ [key]: e.target.value } as Partial<CatalogPageStyle>)} className={optFieldClass}>
              <option value="">Police du thème</option>
              <FontSelectOptions />
            </select>
          </label>
        ))}
      </div>
      {/* TOUTES les couleurs du bandeau au même endroit : FOND (selon le régime —
          thème uniforme OU une pastille par univers) + textes des deux niveaux. */}
      <div className="flex flex-wrap gap-2">
        {!style.chapterColors && onHeaderBg && (
          <ColorPicker label="Fond bandeau" value={theme.headerBg} onChange={onHeaderBg} />
        )}
        {/* Une pastille par UNIVERS uniquement (nodeId sans « / ») : plan.sections
            contient TOUS les nœuds (familles/sous-familles incluses) mais seule la
            couleur du nœud de niveau 1 pilote le bandeau (universeColors). */}
        {style.chapterColors && onSectionColor && (sections ?? [])
          .filter((sec) => !sec.nodeId.includes('/'))
          .map((sec, i) => (
            <ColorPicker key={sec.nodeId} label={`Fond ${universeLabelFromNodeId(sec.nodeId) ?? `univers ${i + 1}`}`}
              value={sec.color || defaultUniverseColor(i)}
              onChange={(v) => onSectionColor(sec.nodeId, v)} />
          ))}
        <ColorPicker label="Txt Univers" value={style.headUniversInk || theme.headerInk}
          onChange={(v) => patch({ headUniversInk: v })} />
        <ColorPicker label="Txt Famille" value={style.headCrumbInk || theme.headerInk}
          onChange={(v) => patch({ headCrumbInk: v })} />
      </div>
    </OptSection>
  )
}
