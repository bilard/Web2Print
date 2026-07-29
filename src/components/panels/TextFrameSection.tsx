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
import { useTranslation, type TranslationKey } from '@/lib/i18n'

// ⚠️ Constantes de MODULE : `t()` n'y est pas disponible (pas de contexte
// React). On stocke la clé, on traduit au rendu.
const AUTO_SIZING_OPTIONS: { v: AutoSizing; labelKey: TranslationKey }[] = [
  { v: 'off', labelKey: 'textFrame.autoSize.off' },
  { v: 'height', labelKey: 'textFrame.autoSize.height' },
  { v: 'width', labelKey: 'textFrame.autoSize.width' },
  { v: 'both', labelKey: 'textFrame.autoSize.both' },
]

const STROKE_ALIGN_OPTIONS: { v: NonNullable<TextFrameProps['strokeAlign']>; labelKey: TranslationKey }[] = [
  { v: 'center', labelKey: 'textFrame.align.center' },
  { v: 'inside', labelKey: 'textFrame.align.inside' },
  { v: 'outside', labelKey: 'textFrame.align.outside' },
]

const V_ALIGN_OPTIONS = [
  { v: 'top' as const, node: <AlignVerticalJustifyStart className="h-3.5 w-3.5" />, titleKey: 'textFrame.vAlign.top' as TranslationKey },
  { v: 'center' as const, node: <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />, titleKey: 'textFrame.vAlign.center' as TranslationKey },
  { v: 'bottom' as const, node: <AlignVerticalJustifyEnd className="h-3.5 w-3.5" />, titleKey: 'textFrame.vAlign.bottom' as TranslationKey },
]

const INDENT_FIELDS: { key: keyof ParagraphIndents; labelKey: TranslationKey; titleKey: TranslationKey }[] = [
  { key: 'left', labelKey: 'textFrame.left', titleKey: 'textFrame.indentLeft' },
  { key: 'right', labelKey: 'textFrame.right', titleKey: 'textFrame.indentRight' },
  { key: 'firstLine', labelKey: 'textFrame.indent.firstLine.short', titleKey: 'textFrame.indentFirst' },
  { key: 'lastLine', labelKey: 'textFrame.indent.lastLine.short', titleKey: 'textFrame.indentLast' },
  { key: 'spaceBefore', labelKey: 'textFrame.spaceBefore.short', titleKey: 'textFrame.spaceBefore' },
  { key: 'spaceAfter', labelKey: 'textFrame.spaceAfter.short', titleKey: 'textFrame.spaceAfter' },
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
  const { t } = useTranslation()
  const sel = useSelectedTextFrame(selectedObjectId)
  if (!sel) return null
  const { frame, patch } = sel

  return (
    <PropertySection
      defaultOpen={false}
      title={t('textFrame.title')}
      tourId="prop-textframe"
      help={t('textFrame.help')}
    >
      <ColorPicker label={t('textFrame.fill')} value={frame.fill ?? 'transparent'}
        onChange={(v) => patch({ fill: v })} />
      <ColorPicker label={t('textFrame.stroke')} value={frame.stroke ?? 'transparent'}
        onChange={(v) => patch({ stroke: v })} />

      <div className="grid grid-cols-3 gap-1.5">
        <PtField label={t('textFrame.strokeWidth')} title={t('textFrame.strokeWidth.title')} step={0.25} min={0}
          value={frame.strokeWidth} onChange={(v) => patch({ strokeWidth: v ?? 0 })} />
        <PtField label={t('textFrame.radius')} title={t('textFrame.radius.title')} min={0}
          value={frame.cornerRadius} onChange={(v) => patch({ cornerRadius: v ?? 0 })} />
        <label title={t('textFrame.strokeAlign')} className="flex flex-col gap-0.5 min-w-0">
          <span className="truncate text-[10px] uppercase tracking-wide text-white/35">{t('textFrame.aligned')}</span>
          <select value={frame.strokeAlign ?? 'center'}
            onChange={(e) => patch({ strokeAlign: e.target.value as TextFrameProps['strokeAlign'] })}
            className="w-full rounded border border-white/10 bg-well px-1 py-0.5 text-[11px] text-white outline-none focus:border-[#6366f1] [&>option]:bg-neutral-900">
            {STROKE_ALIGN_OPTIONS.map((o) => <option key={o.v} value={o.v}>{t(o.labelKey)}</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <GroupLabel>{t('textFrame.padding')}</GroupLabel>
        <div className="grid grid-cols-4 gap-1.5">
          <PtField label={t('textFrame.top')} min={0} value={frame.insetTop} onChange={(v) => patch({ insetTop: v ?? 0 })} />
          <PtField label={t('textFrame.bottom')} min={0} value={frame.insetBottom} onChange={(v) => patch({ insetBottom: v ?? 0 })} />
          <PtField label={t('textFrame.left')} min={0} value={frame.insetLeft} onChange={(v) => patch({ insetLeft: v ?? 0 })} />
          <PtField label={t('textFrame.right')} min={0} value={frame.insetRight} onChange={(v) => patch({ insetRight: v ?? 0 })} />
        </div>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
          <GroupLabel>{t('textFrame.vAlign')}</GroupLabel>
          <SegButtons<VerticalAlign> value={frame.verticalAlign ?? 'top'} options={V_ALIGN_OPTIONS.map((o) => ({ ...o, title: t(o.titleKey) }))}
            onChange={(v) => patch({ verticalAlign: v })} />
        </div>
      </div>

      <SelectField<AutoSizing> label={t('textFrame.autoResize')}
        value={frame.autoSizing ?? 'off'} options={AUTO_SIZING_OPTIONS.map((o) => ({ v: o.v, label: t(o.labelKey) }))}
        onChange={(v) => patch({ autoSizing: v })} />
    </PropertySection>
  )
}

/** Retraits et espaces de paragraphe — onglet « Retrait et espacement » d'InDesign. */
export function ParagraphIndentsSection({ selectedObjectId }: { selectedObjectId: string | null }) {
  const { t } = useTranslation()
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
      title={t('textFrame.indents')}
      tourId="prop-indents"
      help={t('textFrame.indents.help')}
    >
      <div className="grid grid-cols-3 gap-1.5">
        {INDENT_FIELDS.map(({ key, labelKey, titleKey }) => (
          <PtField key={key} label={t(labelKey)} title={`${t(titleKey)} (pt)`}
            value={shownIndents[key]} onChange={(v) => patchIndent(key, v)} />
        ))}
      </div>
    </PropertySection>
  )
}
