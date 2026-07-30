import { forwardRef, useRef, useState, useEffect, useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import type { RuleEffect } from '@/features/merge/conditionalRules'
import { PromoSelectionOverlay } from './PromoSelectionOverlay'
import {
  STYLE_KEYS, DEFAULT_PROMO_CONFIG,
  type RetailCardData, type PromoTemplateConfig, type PromoColorKey, type PromoBlockId,
} from './promoCardTypes'
import {
  PROMO_CSS, splitPrice, layoutTune, idealText,
  resolveElementStyle, resolveBlockBg, blockBoxCss,
} from './promoStyles'
import { t } from '@/lib/i18n'

/** Blocs déco sélectionnables (fond uni/dégradé + resize par échelle). */
const DECO_BLOCKS: PromoBlockId[] = ['header', 'image', 'badge', 'price', 'details']
/** Textes éditables inline (double-clic dans la carte). */
const EDITABLE_TEXT: PromoColorKey[] = ['category', 'name', 'brand', 'description', 'priceLabel']
const SELECTABLE: PromoBlockId[] = [...(STYLE_KEYS as PromoBlockId[]), ...DECO_BLOCKS]

interface CardProps {
  data: RetailCardData
  config?: PromoTemplateConfig
  /** Active le glisser-déposer + la sélection + les poignées de resize (aperçu éditable). */
  editable?: boolean
  onMoveBlock?: (id: PromoBlockId, dx: number, dy: number) => void
  /** Bloc sélectionné (contour + poignées + cible du panneau de propriétés). */
  selectedKey?: PromoBlockId | null
  onSelect?: (id: PromoBlockId) => void
  /** Resize d'un texte (fontSize / largeur). */
  onResizeText?: (key: PromoColorKey, patch: { fontSize?: number; width?: number }) => void
  /** Resize d'un bloc déco (échelle + ancrage du décalage). */
  onScaleBlock?: (id: PromoBlockId, sx: number, sy: number, dx: number, dy: number) => void
  /** Édition inline du texte d'un élément (double-clic) → surcharge pour ce produit. */
  onEditText?: (key: PromoColorKey, value: string) => void
  /** Effets des règles conditionnelles pour le produit courant (par bloc). */
  effects?: Partial<Record<PromoBlockId, RuleEffect>>
  /** Aplatit le dégradé-texte et masque contour/poignées (capture PNG fidèle). */
  capturing?: boolean
}

/** Carte Création studio (HTML/CSS) — design data-driven, couleurs/polices/champs/positions configurables. */
export const RetailPromoCard = forwardRef<HTMLDivElement, CardProps>(
  ({ data, config = DEFAULT_PROMO_CONFIG, editable = false, onMoveBlock, selectedKey = null, onSelect, onResizeText, onScaleBlock, onEditText, effects, capturing = false }, ref) => {
    const { amount, cur, fontSize } = splitPrice(data.priceNow)
    const tune = layoutTune(config)
    const hText = tune.headerColor ?? idealText(config.headerBg)
    const aText = idealText(config.accent)
    const catText = tune.categoryColor ?? aText
    const priceText = tune.priceColor ?? aText
    const priceFontSize = Math.round(fontSize * tune.priceFontScale)
    const cardElRef = useRef<HTMLDivElement | null>(null)
    const blockEls = useRef(new Map<PromoBlockId, HTMLElement | null>())
    const setters = useRef(new Map<PromoBlockId, (el: HTMLElement | null) => void>())
    // Callback ref stable par bloc (évite le thrash des refs à chaque render).
    const setEl = (id: PromoBlockId) => {
      let fn = setters.current.get(id)
      if (!fn) { fn = (el) => { blockEls.current.set(id, el) }; setters.current.set(id, fn) }
      return fn
    }
    // Stable : un callback ref recréé à chaque render serait rappelé avec null (thrash → rect effacé).
    const setRefs = useCallback((el: HTMLDivElement | null) => {
      cardElRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el
    }, [ref])

    // ── Édition inline du texte (double-clic) ───────────────────────────────────
    const [editingKey, setEditingKey] = useState<PromoColorKey | null>(null)
    const clickPos = useRef<{ x: number; y: number } | null>(null)
    useEffect(() => {
      if (!editingKey) return
      const el = blockEls.current.get(editingKey)
      if (!el) return
      el.focus()
      const sel = window.getSelection()
      const pos = clickPos.current; clickPos.current = null
      // Curseur à l'endroit cliqué (caretRangeFromPoint) ; repli : fin du texte.
      const fromPoint = pos && (document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint?.(pos.x, pos.y)
      const range = (fromPoint && el.contains(fromPoint.startContainer)) ? fromPoint : (() => { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); return r })()
      sel?.removeAllRanges(); sel?.addRange(range)
    }, [editingKey])
    const canEdit = (key: PromoColorKey) => editable && !!onEditText && EDITABLE_TEXT.includes(key)
    const startEdit = (key: PromoColorKey, x?: number, y?: number) => { clickPos.current = (x != null && y != null) ? { x, y } : null; onSelect?.(key); setEditingKey(key) }
    const editProps = (key: PromoColorKey): React.HTMLAttributes<HTMLElement> => {
      if (!canEdit(key)) return {}
      if (editingKey !== key) return { onDoubleClick: (e) => { e.stopPropagation(); startEdit(key, e.clientX, e.clientY) }, title: t('rp.doubleCliquezPourEditer') }
      return {
        contentEditable: true, suppressContentEditableWarning: true,
        onDoubleClick: (e) => e.stopPropagation(),
        // Laisse le clic placer le curseur dans le texte sans déclencher le drag du bloc parent.
        onPointerDown: (e) => e.stopPropagation(),
        onBlur: (e) => { onEditText!(key, (e.currentTarget.innerText || '').replace(/\s*\n\s*/g, ' ').trim()); setEditingKey(null) },
        onKeyDown: (e) => {
          if (e.key === 'Escape') { e.preventDefault(); setEditingKey(null) }
          else if (e.key === 'Enter' && key !== 'description') { e.preventDefault(); (e.currentTarget as HTMLElement).blur() }
        },
      }
    }

    const startDrag = (e: ReactPointerEvent, id: PromoBlockId) => {
      if (!editable) return
      e.stopPropagation()
      if (onSelect && SELECTABLE.includes(id)) onSelect(id)
      if (!onMoveBlock) return
      e.preventDefault()
      const rect = cardElRef.current?.getBoundingClientRect()
      const scale = rect && rect.width ? rect.width / 595 : 1
      const o = config.offsets[id] ?? { dx: 0, dy: 0 }
      const sx = e.clientX, sy = e.clientY
      const move = (ev: PointerEvent) =>
        onMoveBlock(id, Math.round(o.dx + (ev.clientX - sx) / scale), Math.round(o.dy + (ev.clientY - sy) / scale))
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    }
    // Style commun d'un bloc : transform (décalage + échelle) + curseur + contour de sélection.
    const blk = (id: PromoBlockId, extra?: React.CSSProperties): React.CSSProperties => {
      const selected = editable && !capturing && selectedKey === id
      const css: React.CSSProperties = {
        ...blockBoxCss(config, id),
        ...(config.hidden?.[id] ? { display: 'none' } : null),
        ...(editable ? { cursor: editingKey === id ? 'text' : 'move' } : null),
        ...(selected ? { outline: '2px solid #6366f1', outlineOffset: 2, borderRadius: 2 } : null),
        ...extra,
      }
      // Effet des règles conditionnelles (produit courant) — l'emporte sur le style statique.
      const ef = effects?.[id]
      if (ef) {
        if (ef.visible === false) css.display = 'none'
        if (ef.opacity != null) css.opacity = ef.opacity
        // « Changer la couleur » : texte → couleur du texte ; bloc déco → fond.
        if (ef.fill) { if ((STYLE_KEYS as PromoBlockId[]).includes(id)) css.color = ef.fill; else css.background = ef.fill }
        if (ef.zOrder) css.zIndex = ef.zOrder === 'front' ? 999 : -1
        if (ef.scale && ef.scale !== 1) css.transform = `${css.transform ?? ''} scale(${ef.scale})`.trim()
      }
      return css
    }
    const es = (key: PromoColorKey) => resolveElementStyle(config, key, { capturing })
    const bg = (id: PromoBlockId) => resolveBlockBg(config, id)
    const drag = (id: PromoBlockId) => (editable && editingKey !== id ? { onPointerDown: (e: ReactPointerEvent) => startDrag(e, id) } : {})

    return (
      <div ref={setRefs} className="rp-card" data-layout={config.layout ?? 'classique'} style={styleVars(config)}>
        <style>{PROMO_CSS}</style>
        <div ref={setEl('header')} className="rp-head" style={blk('header', { color: hText, ...bg('header') })} {...drag('header')}>
          {config.showCategory && <span ref={setEl('category')} className="rp-kicker" style={blk('category', { color: catText, ...es('category') })} {...drag('category')} {...editProps('category')}>{data.category || 'Offre spéciale'}</span>}
          <div ref={setEl('name')} className="rp-name" style={blk('name', es('name'))} {...drag('name')} {...editProps('name')}>{data.name || 'Produit'}</div>
          {(data.brand || data.ref || data.ean) && (
            <div ref={setEl('brand')} className="rp-brand" style={blk('brand', es('brand'))} {...drag('brand')} {...editProps('brand')}>{[data.brand, data.ref, data.ean].filter(Boolean).join(' · ')}</div>
          )}
          {config.showDescription && data.description && <div ref={setEl('description')} className="rp-desc" style={blk('description', es('description'))} {...drag('description')} {...editProps('description')}>{data.description}</div>}
        </div>
        <div className="rp-product" style={bg('image')}>
          {data.imageUrl
            ? <img ref={setEl('image')} src={data.imageUrl} crossOrigin="anonymous" alt={data.name} style={blk('image')} {...drag('image')} />
            : <div className="rp-ph">{t('rp.photoProduit')}</div>}
          {config.showBadge && data.remiseLabel && (
            <div ref={setEl('badge')} className="rp-badge" style={blk('badge', { color: aText, ...bg('badge') })} {...drag('badge')}>
              <span className="rp-pct">{data.remiseLabel}</span>
              <span className="rp-pctlbl">de remise</span>
            </div>
          )}
        </div>
        {!config.hidden?.details && data.details.length > 0 && (
          <div ref={setEl('details')} className="rp-details" style={blk('details', bg('details'))} {...drag('details')}>
            {data.details.map((d, i) => <div key={i} className="rp-detail">{d}</div>)}
          </div>
        )}
        <div ref={setEl('price')} className="rp-price" style={blk('price', { color: priceText, ...bg('price') })} {...drag('price')}>
          <div className="rp-left">
            <span ref={setEl('priceLabel')} className="rp-plabel" style={blk('priceLabel', es('priceLabel'))} {...drag('priceLabel')} {...editProps('priceLabel')}>{data.priceLabel || 'Prix promo'}</span>
            {data.priceWas && <span ref={setEl('priceWas')} className="rp-was" style={blk('priceWas', es('priceWas'))} {...drag('priceWas')}>{data.priceWas}</span>}
            {config.showUnitPrice && data.unitPrice && <span ref={setEl('unitPrice')} className="rp-unit" style={blk('unitPrice', es('unitPrice'))} {...drag('unitPrice')}>{data.unitPrice}</span>}
          </div>
          <div ref={setEl('priceNow')} className="rp-now" style={blk('priceNow', { fontSize: priceFontSize, ...es('priceNow') })} {...drag('priceNow')}>
            {amount}{cur && <span className="rp-cur">{cur}</span>}{data.unit && <span className="rp-cur">{data.unit}</span>}
          </div>
        </div>
        {config.showFooter && <div ref={setEl('footer')} className="rp-foot" style={blk('footer', es('footer'))} {...drag('footer')} {...editProps('footer')}>{[data.enseigne, data.validite, data.mentions].filter(Boolean).join(' — ')}</div>}
        {editable && !capturing && selectedKey && !editingKey && (
          <PromoSelectionOverlay
            cardRef={cardElRef}
            getEl={() => (selectedKey ? blockEls.current.get(selectedKey) ?? null : null)}
            selected={selectedKey}
            isText={(STYLE_KEYS as PromoBlockId[]).includes(selectedKey)}
            config={config}
            onResizeText={onResizeText}
            onScaleBlock={onScaleBlock}
          />
        )}
      </div>
    )
  },
)
RetailPromoCard.displayName = 'RetailPromoCard'

function styleVars(config: PromoTemplateConfig): React.CSSProperties {
  return {
    '--rp-accent': config.accent, '--rp-head': config.headerBg,
    '--rp-font-h': `'${config.fontHeading}', sans-serif`, '--rp-font-p': `'${config.fontPrice}', sans-serif`,
  } as React.CSSProperties
}
