// src/features/catalog/components/steps/PageSimPreview.tsx
// Simulation de PAGE dans « Prompt & style » : la page complète (bandeau
// taxonomie + grille de N fiches échantillon) aux dimensions et au --cat-fit
// EXACTS de l'impression pour cette densité — pour régler les tailles de texte
// par bloc en voyant le résultat réel, sans aller-retour avec l'Aperçu.
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { PromoFields } from '@/features/retail-promo/promoTypes'
import type { SpecTable } from '@/features/retail-promo/promoMapping'
import { GRID_DIMS, type CardBox, type CardObjectId, type CatalogCardStyle, type CatalogGrid, type CatalogFormat, type CatalogPageStyle, type CatalogTheme } from '../../catalogTypes'
import { CATALOG_CSS, cardStyleVars, cellDims, cellFit, mergedPageStyle, pagePx, pageStyleVars, themeVars } from '../pages/catalogCss'
import { isWideCard } from '../pages/freeLayout'
import { CatalogHeader } from '../pages/CatalogHeader'
import { ProductCell } from '../pages/ProductCell'
import { CardLayoutOverlay } from './CardLayoutOverlay'

interface Props {
  theme: CatalogTheme
  cardStyle: CatalogCardStyle
  pageStyle?: CatalogPageStyle
  format: CatalogFormat
  /** Densité simulée (produits/page). */
  grid: CatalogGrid
  fields: PromoFields
  details: string[]
  specs?: SpecTable | null
  /** Zoom utilisateur relatif à l'ajustement auto (1 = remplit la colonne). */
  zoom?: number
  /** Édition des blocs sur la 1re fiche de la page (drag/resize/sélection). */
  onLayoutChange?: (id: CardObjectId, box: CardBox) => void
  onSelect?: (id: CardObjectId | null) => void
  selected?: CardObjectId | null
}

export function PageSimPreview({ theme, cardStyle, pageStyle, format, grid, fields, details, specs, zoom = 1, onLayoutChange, onSelect, selected }: Props) {
  const { w: pw, h: ph } = pagePx(format)
  const [cols, rows] = GRID_DIMS[grid]
  const cell = cellDims(format, grid)
  const fit = Math.round(cellFit(format, grid) * 100) / 100
  const wide = isWideCard(cell.w, cell.h)
  // Ajustement auto à la colonne (même pattern que CardStylePreview).
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [availW, setAvailW] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setAvailW(el.clientWidth))
    ro.observe(el)
    setAvailW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const K = Math.max(0.2, Math.round((availW != null ? Math.max(320, availW - 8) / pw : 0.6) * zoom * 100) / 100)
  // Overlay d'édition sur la 1RE FICHE : ses poignées vivent HORS de la page
  // scalée (px écran) — on mesure la position visuelle de la carte dans le wrap.
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [overlayRect, setOverlayRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const w = wrapRef.current, h = hostRef.current
    if (!w || !h || !onLayoutChange) return
    const measure = () => {
      const wr = w.getBoundingClientRect(), hr = h.getBoundingClientRect()
      setOverlayRect({ left: hr.left - wr.left, top: hr.top - wr.top, width: hr.width, height: hr.height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(w); ro.observe(h)
    return () => ro.disconnect()
  }, [K, grid, onLayoutChange])
  const ps = mergedPageStyle(pageStyle)
  const vars = { ...themeVars(theme), ...cardStyleVars(cardStyle, theme), ...pageStyleVars(pageStyle) } as CSSProperties
  return (
    <div ref={wrapRef} className="w-full min-w-0 relative">
      <div style={{ width: pw * K, height: ph * K, position: 'relative', overflow: 'hidden' }} className="rounded-lg border border-border shadow-2xl">
        <div className="cat-page" style={{ ...vars, width: pw, height: ph, transform: `scale(${K})`, transformOrigin: 'top left' }}>
          <style>{CATALOG_CSS}</style>
          {ps.showHeader !== false && <CatalogHeader breadcrumb={['Univers', 'Famille']} pageNumber={2} />}
          <div className="cat-grid" style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            ...(fit !== 1 ? ({ '--cat-fit': String(fit) } as CSSProperties) : {}),
          }}>
            {Array.from({ length: grid as number }, (_, i) => i === 0 && onLayoutChange ? (
              <div key={0} ref={hostRef} style={{ display: 'grid', position: 'relative' }}>
                <ProductCell fields={fields} featured={false} kicker="Sous-famille"
                  details={details} specs={specs} cardStyle={cardStyle} wide={wide} />
              </div>
            ) : (
              <ProductCell key={i} fields={fields} featured={false} kicker="Sous-famille"
                details={details} specs={specs} cardStyle={cardStyle} wide={wide} />
            ))}
          </div>
          {ps.showFooter !== false && (
            <div className="cat-foot">
              <span className="cat-foot-name">Simulation</span>
              <span className="cat-foot-folio">2</span>
            </div>
          )}
        </div>
      </div>
      {/* Overlay HORS de la page scalée : positions % invariantes, poignées en px. */}
      {onLayoutChange && overlayRect && (
        <div style={{ position: 'absolute', ...overlayRect }}>
          <CardLayoutOverlay cardRef={hostRef} style={cardStyle} wide={wide}
            onChange={onLayoutChange} onSelect={onSelect} selected={selected} />
        </div>
      )}
    </div>
  )
}
