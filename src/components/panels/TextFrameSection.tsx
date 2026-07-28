// Réglages du BLOC de texte (le cadre InDesign) et de ses retraits de paragraphe.
// Le rendu correspondant vit dans features/editor/textFrame.ts.
import { AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd } from 'lucide-react'
import { globalFabricCanvas } from '@/features/editor/globalCanvas'
import { findFabricObjectDeep } from '@/features/editor/deepObjects'
import { syncToStore } from '@/features/editor/useAddObject'
import {
  applyTextFrame, getTextFrame, indentsFor,
  type AutoSizing, type ParagraphIndents, type TextFrameProps, type VerticalAlign,
} from '@/features/editor/textFrame'
import { ColorPicker } from '@/components/shared/ColorPicker'
import { SelectField, SegButtons, PropertySection } from '@/components/shared/panel'

const AUTO_SIZING_OPTIONS: { v: AutoSizing; label: string }[] = [
  { v: 'off', label: 'Cadre fixe' },
  { v: 'height', label: 'Hauteur seulement' },
  { v: 'width', label: 'Largeur seulement' },
  { v: 'both', label: 'Hauteur et largeur' },
]

const STROKE_ALIGN_OPTIONS: { v: NonNullable<TextFrameProps['strokeAlign']>; label: string }[] = [
  { v: 'center', label: 'Centré' },
  { v: 'inside', label: 'Intérieur' },
  { v: 'outside', label: 'Extérieur' },
]

const V_ALIGN_OPTIONS = [
  { v: 'top' as const, node: <AlignVerticalJustifyStart className="h-3.5 w-3.5" />, title: 'Aligner en haut' },
  { v: 'center' as const, node: <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />, title: 'Centrer' },
  { v: 'bottom' as const, node: <AlignVerticalJustifyEnd className="h-3.5 w-3.5" />, title: 'Aligner en bas' },
]

const INDENT_FIELDS: { key: keyof ParagraphIndents; label: string; title: string }[] = [
  { key: 'left', label: 'Gauche', title: 'Retrait à gauche' },
  { key: 'right', label: 'Droite', title: 'Retrait à droite' },
  { key: 'firstLine', label: '1re ligne', title: 'Retrait de première ligne' },
  { key: 'lastLine', label: 'Dern. ligne', title: 'Retrait de dernière ligne' },
  { key: 'spaceBefore', label: 'Esp. avant', title: 'Espace avant le paragraphe' },
  { key: 'spaceAfter', label: 'Esp. après', title: 'Espace après le paragraphe' },
]

/** Retraits « non encore réglés dans la palette » — sert à afficher les valeurs importées. */
const NO_INDENTS: ParagraphIndents = {}

/**
 * Les valeurs IDML arrivent en points avec toute leur précision machine
 * (2,8346456692913…) : illisible dans un champ étroit. On n'affiche qu'une
 * décimale — la valeur n'est réécrite que si l'utilisateur modifie le champ.
 */
function round1(v: number | undefined): number | undefined {
  return v == null ? undefined : Math.round(v * 10) / 10
}

/** Champ numérique compact : libellé court au-dessus, stepper natif conservé. */
function PtField({ label, title, value, onChange, step = 0.5, min }: {
  label: string; title?: string; value?: number; onChange: (v: number | undefined) => void
  step?: number; min?: number
}) {
  return (
    <label title={title ?? label} className="flex flex-col gap-0.5 min-w-0">
      <span className="truncate text-[10px] uppercase tracking-wide text-white/35">{label}</span>
      <input type="number" value={round1(value) ?? ''} step={step} min={min} placeholder="0"
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className="w-full rounded border border-white/10 bg-well px-1.5 py-0.5 text-[11px] tabular-nums text-white outline-none focus:border-[#6366f1] [color-scheme:dark]" />
    </label>
  )
}

/** Intitulé de sous-groupe à l'intérieur d'une section. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] uppercase tracking-wide text-white/25">{children}</span>
}

/**
 * Résout l'objet Fabric sélectionné et son cadre. Renvoie `null` si la sélection
 * n'est pas un bloc de texte.
 */
function useSelectedTextFrame(selectedObjectId: string | null) {
  const canvas = globalFabricCanvas
  const fObj = findFabricObjectDeep(canvas, selectedObjectId)
  if (!canvas || !fObj || fObj.data?.type !== 'text') return null

  const frame: TextFrameProps = getTextFrame(fObj) ?? {
    frameW: fObj.width ?? 0,
    frameH: fObj.height ?? 0,
    autoSizing: 'height',
  }
  const patch = (props: Partial<TextFrameProps>) => {
    applyTextFrame(fObj, props)
    canvas.requestRenderAll()
    canvas.fire('object:modified', { target: fObj })
    syncToStore(canvas)
  }
  return { frame, patch }
}

/** Fond, contour, arrondi, marges, alignement vertical et redimensionnement du cadre. */
export function TextFrameSection({ selectedObjectId }: { selectedObjectId: string | null }) {
  const sel = useSelectedTextFrame(selectedObjectId)
  if (!sel) return null
  const { frame, patch } = sel

  return (
    <PropertySection
      defaultOpen={false}
      title="Bloc de texte"
      tourId="prop-textframe"
      help="Le cadre qui contient le texte, comme dans InDesign : fond, contour, arrondi des angles, marges internes (en points), position verticale du texte et redimensionnement automatique."
    >
      <ColorPicker label="Fond du bloc" value={frame.fill ?? 'transparent'}
        onChange={(v) => patch({ fill: v })} />
      <ColorPicker label="Contour" value={frame.stroke ?? 'transparent'}
        onChange={(v) => patch({ stroke: v })} />

      <div className="grid grid-cols-3 gap-1.5">
        <PtField label="Épaisseur" title="Épaisseur du contour (pt)" step={0.25} min={0}
          value={frame.strokeWidth} onChange={(v) => patch({ strokeWidth: v ?? 0 })} />
        <PtField label="Arrondi" title="Arrondi des angles (pt)" min={0}
          value={frame.cornerRadius} onChange={(v) => patch({ cornerRadius: v ?? 0 })} />
        <label title="Alignement du contour" className="flex flex-col gap-0.5 min-w-0">
          <span className="truncate text-[10px] uppercase tracking-wide text-white/35">Aligné</span>
          <select value={frame.strokeAlign ?? 'center'}
            onChange={(e) => patch({ strokeAlign: e.target.value as TextFrameProps['strokeAlign'] })}
            className="w-full rounded border border-white/10 bg-well px-1 py-0.5 text-[11px] text-white outline-none focus:border-[#6366f1] [&>option]:bg-neutral-900">
            {STROKE_ALIGN_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <GroupLabel>Marges internes (pt)</GroupLabel>
        <div className="grid grid-cols-4 gap-1.5">
          <PtField label="Haut" min={0} value={frame.insetTop} onChange={(v) => patch({ insetTop: v ?? 0 })} />
          <PtField label="Bas" min={0} value={frame.insetBottom} onChange={(v) => patch({ insetBottom: v ?? 0 })} />
          <PtField label="Gauche" min={0} value={frame.insetLeft} onChange={(v) => patch({ insetLeft: v ?? 0 })} />
          <PtField label="Droite" min={0} value={frame.insetRight} onChange={(v) => patch({ insetRight: v ?? 0 })} />
        </div>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
          <GroupLabel>Alignement vertical</GroupLabel>
          <SegButtons<VerticalAlign> value={frame.verticalAlign ?? 'top'} options={V_ALIGN_OPTIONS}
            onChange={(v) => patch({ verticalAlign: v })} />
        </div>
      </div>

      <SelectField<AutoSizing> label="Redimensionnement auto"
        value={frame.autoSizing ?? 'off'} options={AUTO_SIZING_OPTIONS}
        onChange={(v) => patch({ autoSizing: v })} />
    </PropertySection>
  )
}

/** Retraits et espaces de paragraphe — onglet « Retrait et espacement » d'InDesign. */
export function ParagraphIndentsSection({ selectedObjectId }: { selectedObjectId: string | null }) {
  const sel = useSelectedTextFrame(selectedObjectId)
  if (!sel) return null
  const { frame, patch } = sel
  // Valeurs affichées : ce que l'utilisateur a réglé, sinon ce qu'a apporté l'IDML
  // pour le premier paragraphe (c'est aussi ce qu'affiche InDesign quand le bloc
  // entier est sélectionné).
  const shownIndents = indentsFor(frame, 0)
  const patchIndent = (key: keyof ParagraphIndents, value: number | undefined) => {
    patch({ indents: { ...(frame.indents ?? NO_INDENTS), [key]: value } })
  }

  return (
    <PropertySection
      defaultOpen={false}
      title="Retrait et espacement"
      tourId="prop-indents"
      help="Retraits du texte par rapport aux bords du bloc (gauche, droite, première et dernière ligne) et espaces insérés avant/après chaque paragraphe, en points — l'onglet « Retrait et espacement » du style de paragraphe InDesign."
    >
      <div className="grid grid-cols-3 gap-1.5">
        {INDENT_FIELDS.map(({ key, label, title }) => (
          <PtField key={key} label={label} title={`${title} (pt)`}
            value={shownIndents[key]} onChange={(v) => patchIndent(key, v)} />
        ))}
      </div>
    </PropertySection>
  )
}
