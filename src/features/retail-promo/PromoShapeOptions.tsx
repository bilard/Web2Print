import { ChevronsUp, ArrowUp, ArrowDown, ChevronsDown } from 'lucide-react'
import { ColorPicker } from '@/components/shared/ColorPicker'
import { GradientPicker, DEFAULT_GRADIENT } from '@/components/shared/GradientPicker'
import { useRetailPromoStore } from './retailPromo.store'
import { PropertySection as Section, NumField, SelectField, SliderField, SegButtons } from '@/components/shared/panel'
import { PromoConditionalSection } from './PromoConditionalSection'
import { STYLE_KEYS, type PromoBlockId, type PromoColorKey, type BlockFill } from './RetailPromoCard'

const BLEND_MODES: Array<{ v: string; label: string }> = [
  { v: 'normal', label: 'Normal' }, { v: 'multiply', label: 'Multiplier' }, { v: 'screen', label: 'Écran' },
  { v: 'overlay', label: 'Superposition' }, { v: 'darken', label: 'Obscurcir' }, { v: 'lighten', label: 'Éclaircir' },
  { v: 'color-dodge', label: 'Densité -' }, { v: 'color-burn', label: 'Densité +' }, { v: 'hard-light', label: 'Lumière crue' },
  { v: 'soft-light', label: 'Lumière douce' }, { v: 'difference', label: 'Différence' }, { v: 'exclusion', label: 'Exclusion' },
  { v: 'hue', label: 'Teinte' }, { v: 'saturation', label: 'Saturation' }, { v: 'color', label: 'Couleur' }, { v: 'luminosity', label: 'Luminosité' },
]
const decoFallback = (id: PromoBlockId, accent: string, headerBg: string) => id === 'image' ? '#f1f5f9' : id === 'header' ? headerBg : accent
const ALL_BLOCKS: PromoBlockId[] = ['header', 'image', 'badge', 'price', 'footer', 'category', 'name', 'brand', 'description', 'priceLabel', 'priceWas', 'unitPrice', 'priceNow']

/** OPTIONS DE FORME : remplissage, contour, opacité & fusion, ombre, taille & position, arranger. */
export function PromoShapeOptions({ id }: { id: PromoBlockId }) {
  const { config, setElementStyle, setBlockFill, setShape } = useRetailPromoStore()
  const isText = (STYLE_KEYS as PromoBlockId[]).includes(id)
  const sh = config.shapes?.[id] ?? {}
  const st = config.styles?.[id as PromoColorKey] ?? {}
  const bf: Partial<BlockFill> = config.blockFills?.[id] ?? {}

  // ── Remplissage : texte → styles.fill/gradient ; déco → blockFills ───────────
  const fillType = isText ? (st.fillType ?? (st.gradient ? 'gradient' : 'solid')) : (bf.fillType ?? (bf.gradient ? 'gradient' : 'solid'))
  const setFillType = (t: 'solid' | 'gradient') => isText
    ? setElementStyle(id as PromoColorKey, { fillType: t, ...(t === 'gradient' && !st.gradient ? { gradient: DEFAULT_GRADIENT } : null) })
    : setBlockFill(id, { fillType: t, ...(t === 'gradient' && !bf.gradient ? { gradient: DEFAULT_GRADIENT } : null) })
  const solidValue = isText ? (st.fill ?? config.colors[id as PromoColorKey] ?? '#ffffff') : (bf.fill ?? decoFallback(id, config.accent, config.headerBg))
  const setSolid = (c: string) => isText ? setElementStyle(id as PromoColorKey, { fillType: 'solid', fill: c }) : setBlockFill(id, { fillType: 'solid', fill: c })
  const gradValue = (isText ? st.gradient : bf.gradient) ?? DEFAULT_GRADIENT
  const setGrad = (g: typeof DEFAULT_GRADIENT) => isText ? setElementStyle(id as PromoColorKey, { fillType: 'gradient', gradient: g }) : setBlockFill(id, { fillType: 'gradient', gradient: g })

  // ── Arranger (ordre d'empilement) ───────────────────────────────────────────
  const zs = ALL_BLOCKS.map((b) => config.shapes?.[b]?.zIndex ?? 0)
  const maxZ = Math.max(...zs), minZ = Math.min(...zs)
  const cur = sh.zIndex ?? 0
  const arrange = (dir: 'front' | 'fwd' | 'back' | 'bwd') =>
    setShape(id, { zIndex: dir === 'front' ? maxZ + 1 : dir === 'back' ? minZ - 1 : dir === 'fwd' ? cur + 1 : cur - 1 })

  return (
    <>
      <Section title="Remplissage">
        <div className="flex flex-col gap-3">
          <SegButtons value={fillType} onChange={setFillType}
            options={[{ v: 'solid', node: 'Couleur unie' }, { v: 'gradient', node: 'Dégradé' }]} />
          {fillType === 'gradient'
            ? <GradientPicker value={gradValue} onChange={setGrad} />
            : <ColorPicker value={solidValue} onChange={setSolid} />}
          {fillType === 'gradient' && isText && (
            <p className="text-[11px] leading-snug text-amber-400/80">⚠ Dégradé sur texte : aplati en couleur unie à l'export PNG.</p>
          )}
        </div>
      </Section>

      <Section title="Contour" defaultOpen={false}>
        <div className="flex flex-col gap-2.5">
          <SegButtons value={sh.stroke ? 'on' : 'off'} onChange={(v) => setShape(id, { stroke: v === 'on' ? { width: 2, color: '#000000' } : null })}
            options={[{ v: 'off', node: 'Aucun' }, { v: 'on', node: 'Contour' }]} />
          {sh.stroke && (
            <>
              <NumField label="Épaisseur" unit="px" value={sh.stroke.width} min={0} max={40} onChange={(w) => setShape(id, { stroke: { ...sh.stroke!, width: w ?? 0 } })} />
              <ColorPicker label="Couleur" value={sh.stroke.color} onChange={(c) => setShape(id, { stroke: { ...sh.stroke!, color: c } })} />
            </>
          )}
        </div>
      </Section>

      <Section title="Opacité & Fusion" defaultOpen={false}>
        <div className="flex flex-col gap-2.5">
          <SliderField label="Opacité" value={sh.opacity ?? 1} onChange={(o) => setShape(id, { opacity: o })} />
          <SelectField label="Mode de fusion" value={sh.blendMode ?? 'normal'} options={BLEND_MODES} onChange={(m) => setShape(id, { blendMode: m })} />
          {sh.blendMode && sh.blendMode !== 'normal' && (
            <p className="text-[11px] leading-snug text-amber-400/80">⚠ Le mode de fusion s'affiche à l'écran/HTML mais n'est pas rendu à l'export PNG.</p>
          )}
        </div>
      </Section>

      <Section title="Ombre" defaultOpen={false}>
        <div className="flex flex-col gap-2.5">
          <SegButtons value={sh.shadow ? 'on' : 'off'} onChange={(v) => setShape(id, { shadow: v === 'on' ? { x: 4, y: 4, blur: 8, color: 'rgba(0,0,0,0.4)' } : null })}
            options={[{ v: 'off', node: 'Aucune' }, { v: 'on', node: 'Ombre' }]} />
          {sh.shadow && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <NumField label="X" value={sh.shadow.x} onChange={(x) => setShape(id, { shadow: { ...sh.shadow!, x: x ?? 0 } })} />
                <NumField label="Y" value={sh.shadow.y} onChange={(y) => setShape(id, { shadow: { ...sh.shadow!, y: y ?? 0 } })} />
                <NumField label="Flou" value={sh.shadow.blur} min={0} onChange={(b) => setShape(id, { shadow: { ...sh.shadow!, blur: b ?? 0 } })} />
              </div>
              <ColorPicker label="Couleur" value={sh.shadow.color} onChange={(c) => setShape(id, { shadow: { ...sh.shadow!, color: c } })} />
            </>
          )}
        </div>
      </Section>

      <Section title="Taille & Position" defaultOpen={false}>
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            <NumField label="X" unit="px" value={config.offsets[id]?.dx} placeholder="0" onChange={(v) => useRetailPromoStore.getState().setConfig({ offsets: { ...config.offsets, [id]: { dx: v ?? 0, dy: config.offsets[id]?.dy ?? 0 } } })} />
            <NumField label="Y" unit="px" value={config.offsets[id]?.dy} placeholder="0" onChange={(v) => useRetailPromoStore.getState().setConfig({ offsets: { ...config.offsets, [id]: { dx: config.offsets[id]?.dx ?? 0, dy: v ?? 0 } } })} />
          </div>
          {isText
            ? <NumField label="Largeur" unit="px" value={st.width} onChange={(w) => setElementStyle(id as PromoColorKey, { width: w })} />
            : <div className="grid grid-cols-2 gap-2">
                <NumField label="Échelle X" step={0.05} value={config.scales?.[id]?.sx} placeholder="1" onChange={(v) => useRetailPromoStore.getState().setConfig({ scales: { ...config.scales, [id]: { sx: v ?? 1, sy: config.scales?.[id]?.sy ?? 1 } } })} />
                <NumField label="Échelle Y" step={0.05} value={config.scales?.[id]?.sy} placeholder="1" onChange={(v) => useRetailPromoStore.getState().setConfig({ scales: { ...config.scales, [id]: { sx: config.scales?.[id]?.sx ?? 1, sy: v ?? 1 } } })} />
              </div>}
          <NumField label="Rotation" unit="°" value={sh.rotation} placeholder="0" onChange={(r) => setShape(id, { rotation: r })} />
        </div>
      </Section>

      <PromoConditionalSection id={id} />

      <Section title="Arranger" defaultOpen={false}>
        <SegButtons value={undefined} onChange={arrange}
          options={[
            { v: 'front', node: <ChevronsUp className="h-4 w-4" />, title: 'Premier plan' },
            { v: 'fwd', node: <ArrowUp className="h-4 w-4" />, title: 'Avancer' },
            { v: 'bwd', node: <ArrowDown className="h-4 w-4" />, title: 'Reculer' },
            { v: 'back', node: <ChevronsDown className="h-4 w-4" />, title: 'Arrière-plan' },
          ]} />
      </Section>
    </>
  )
}
