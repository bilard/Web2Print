// Réglages du BLOC de texte (le cadre InDesign) et de ses retraits de paragraphe.
// Le rendu correspondant vit dans features/editor/textFrame.ts.
import { AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd } from 'lucide-react'
import { globalFabricCanvas } from '@/features/editor/globalCanvas'
import { syncToStore } from '@/features/editor/useAddObject'
import {
  applyTextFrame, getTextFrame, indentsFor,
  type AutoSizing, type ParagraphIndents, type TextFrameProps, type VerticalAlign,
} from '@/features/editor/textFrame'
import { ColorPicker } from '@/components/shared/ColorPicker'
import { NumField, SelectField, SegButtons, PropertySection } from '@/components/shared/panel'

const AUTO_SIZING_OPTIONS: { v: AutoSizing; label: string }[] = [
  { v: 'off', label: 'Désactivé (cadre fixe)' },
  { v: 'height', label: 'Hauteur seulement' },
  { v: 'width', label: 'Largeur seulement' },
  { v: 'both', label: 'Hauteur et largeur' },
]

const STROKE_ALIGN_OPTIONS: { v: NonNullable<TextFrameProps['strokeAlign']>; label: string }[] = [
  { v: 'center', label: 'Centré sur le tracé' },
  { v: 'inside', label: "À l'intérieur" },
  { v: 'outside', label: "À l'extérieur" },
]

const V_ALIGN_OPTIONS = [
  { v: 'top' as const, node: <AlignVerticalJustifyStart className="h-3.5 w-3.5" />, title: 'Aligner en haut' },
  { v: 'center' as const, node: <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />, title: 'Centrer' },
  { v: 'bottom' as const, node: <AlignVerticalJustifyEnd className="h-3.5 w-3.5" />, title: 'Aligner en bas' },
]

const INDENT_FIELDS: { key: keyof ParagraphIndents; label: string }[] = [
  { key: 'left', label: 'Retrait à gauche' },
  { key: 'right', label: 'Retrait à droite' },
  { key: 'firstLine', label: 'Retrait de 1re ligne' },
  { key: 'lastLine', label: 'Retrait de dernière ligne' },
  { key: 'spaceBefore', label: 'Espace avant' },
  { key: 'spaceAfter', label: 'Espace après' },
]

/** Retraits « non encore réglés dans la palette » — sert à afficher les valeurs importées. */
const NO_INDENTS: ParagraphIndents = {}

/**
 * Résout l'objet Fabric sélectionné et son cadre. Renvoie `null` si la sélection
 * n'est pas un bloc de texte.
 */
function useSelectedTextFrame(selectedObjectId: string | null) {
  const canvas = globalFabricCanvas
  const fObj = selectedObjectId
    ? canvas?.getObjects().find((o) => o.data?.id === selectedObjectId)
    : undefined
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
    <>
      <PropertySection
        defaultOpen={false}
        title="Bloc de texte"
        tourId="prop-textframe"
        help="Le cadre qui contient le texte, comme dans InDesign : fond, contour, arrondi des angles, marges internes, position verticale du texte et redimensionnement automatique."
      >
        <ColorPicker label="Fond du bloc" value={frame.fill ?? 'transparent'}
          onChange={(v) => patch({ fill: v })} />
        <ColorPicker label="Couleur du contour" value={frame.stroke ?? 'transparent'}
          onChange={(v) => patch({ stroke: v })} />
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Épaisseur du contour" unit="pt" step={0.25} min={0}
            value={frame.strokeWidth} onChange={(v) => patch({ strokeWidth: v ?? 0 })} />
          <NumField label="Arrondi des angles" unit="pt" step={0.5} min={0}
            value={frame.cornerRadius} onChange={(v) => patch({ cornerRadius: v ?? 0 })} />
        </div>
        <SelectField<NonNullable<TextFrameProps['strokeAlign']>> label="Alignement du contour"
          value={frame.strokeAlign ?? 'center'} options={STROKE_ALIGN_OPTIONS}
          onChange={(v) => patch({ strokeAlign: v })} />

        <div className="grid grid-cols-2 gap-2">
          <NumField label="Marge haut" unit="pt" step={0.5} min={0}
            value={frame.insetTop} onChange={(v) => patch({ insetTop: v ?? 0 })} />
          <NumField label="Marge bas" unit="pt" step={0.5} min={0}
            value={frame.insetBottom} onChange={(v) => patch({ insetBottom: v ?? 0 })} />
          <NumField label="Marge gauche" unit="pt" step={0.5} min={0}
            value={frame.insetLeft} onChange={(v) => patch({ insetLeft: v ?? 0 })} />
          <NumField label="Marge droite" unit="pt" step={0.5} min={0}
            value={frame.insetRight} onChange={(v) => patch({ insetRight: v ?? 0 })} />
        </div>

        <div className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/40">
          Alignement vertical
          <SegButtons<VerticalAlign> value={frame.verticalAlign ?? 'top'} options={V_ALIGN_OPTIONS}
            onChange={(v) => patch({ verticalAlign: v })} />
        </div>

        <SelectField<AutoSizing> label="Redimensionnement auto"
          value={frame.autoSizing ?? 'off'} options={AUTO_SIZING_OPTIONS}
          onChange={(v) => patch({ autoSizing: v })} />
      </PropertySection>
    </>
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
    <>
      <PropertySection
        defaultOpen={false}
        title="Retrait et espacement"
        tourId="prop-indents"
        help="Retraits du texte par rapport aux bords du bloc (gauche, droite, première et dernière ligne) et espaces insérés avant/après chaque paragraphe — l'onglet « Retrait et espacement » du style de paragraphe InDesign."
      >
        <div className="grid grid-cols-2 gap-2">
          {INDENT_FIELDS.map(({ key, label }) => (
            <NumField key={key} label={label} unit="pt" step={0.5}
              value={shownIndents[key]} onChange={(v) => patchIndent(key, v)} />
          ))}
        </div>
      </PropertySection>
    </>
  )
}
