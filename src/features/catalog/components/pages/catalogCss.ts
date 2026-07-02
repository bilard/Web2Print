// src/features/catalog/components/pages/catalogCss.ts
// CSS partagé des pages du catalogue (aperçu React + capture html2canvas).
// 1 mm = 96/25.4 px CSS → une page A4 portrait fait 794×1123 px.
import type React from 'react'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFieldKey } from '@/features/retail-promo/promoTypes'
import { FONTS_HREF } from '@/features/retail-promo/RetailPromoCard'
import type { CatalogFormat, CatalogPlan, CatalogTheme } from '../../catalogTypes'

export const PX_PER_MM = 96 / 25.4

export function pagePx(format: CatalogFormat): { w: number; h: number } {
  return { w: Math.round(format.widthMm * PX_PER_MM), h: Math.round(format.heightMm * PX_PER_MM) }
}

/** Contexte de rendu passé à toutes les pages (une seule prop drill, pas de store dans le rendu). */
export interface CatalogRenderCtx {
  plan: CatalogPlan
  format: CatalogFormat
  rowsById: Map<string, MergeRow>
  columns: MergeColumn[]
  fieldMap: Partial<Record<PromoFieldKey, string>>
  catalogName: string
  totalPages: number
  coverImageUrl: string | null
  backCoverImageUrl: string | null
}

/** Charge une fois les polices Google (nécessaire aussi pour html2canvas). */
export function ensureCatalogFonts(): void {
  if (typeof document === 'undefined' || document.getElementById('catalog-fonts')) return
  const link = document.createElement('link')
  link.id = 'catalog-fonts'; link.rel = 'stylesheet'; link.href = FONTS_HREF
  document.head.appendChild(link)
}

export function themeVars(theme: CatalogTheme): React.CSSProperties {
  return {
    '--cat-accent': theme.accent, '--cat-bg': theme.pageBg, '--cat-ink': theme.ink,
    '--cat-head-bg': theme.headerBg, '--cat-head-ink': theme.headerInk,
    '--cat-font-h': `'${theme.fontHeading}', sans-serif`, '--cat-font-b': `'${theme.fontBody}', sans-serif`,
  } as React.CSSProperties
}

export function formatPrice(n: number | null): string {
  if (n == null) return ''
  return `${n.toFixed(2).replace('.', ',')} €`
}

export const CATALOG_CSS = `
.cat-page * { margin:0; padding:0; box-sizing:border-box; }
.cat-page { position:relative; overflow:hidden; background:var(--cat-bg,#fff); color:var(--cat-ink,#111827);
  font-family:var(--cat-font-b,'Inter',sans-serif); display:flex; flex-direction:column; }
.cat-head { flex:none; background:var(--cat-head-bg,#111827); color:var(--cat-head-ink,#fff);
  padding:14px 32px; display:flex; align-items:baseline; gap:10px; }
.cat-head-univers { font-family:var(--cat-font-h); font-weight:800; font-size:18px; text-transform:uppercase; letter-spacing:.08em; }
.cat-head-crumb { font-size:13px; opacity:.85; }
.cat-head-sep { opacity:.5; }
.cat-foot { flex:none; margin-top:auto; border-top:2px solid var(--cat-accent); padding:10px 32px;
  display:flex; justify-content:space-between; font-size:11px; opacity:.9; }
.cat-grid { flex:1; display:grid; gap:16px; padding:24px 32px; min-height:0; }
.cat-cell { display:flex; flex-direction:column; border:1px solid rgba(0,0,0,.08); border-radius:8px; overflow:hidden; min-height:0; }
.cat-cell-img { flex:1; min-height:0; display:flex; align-items:center; justify-content:center; background:#f8fafc; }
.cat-cell-img img { max-width:100%; max-height:100%; object-fit:contain; }
.cat-cell-img-ph { font-size:11px; color:#94a3b8; }
.cat-cell-body { flex:none; padding:10px 12px; display:flex; flex-direction:column; gap:2px; }
.cat-cell-brand { font-size:10px; text-transform:uppercase; letter-spacing:.1em; color:var(--cat-accent); font-weight:700; }
.cat-cell-name { font-family:var(--cat-font-h); font-weight:700; font-size:13px;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.cat-cell-desc { font-size:10px; opacity:.75; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.cat-cell-row { display:flex; align-items:flex-end; justify-content:space-between; margin-top:4px; }
.cat-cell-ref { font-size:9px; opacity:.55; }
.cat-cell-price { font-family:var(--cat-font-h); font-weight:800; font-size:18px; color:var(--cat-accent); }
.cat-cell-was { font-size:11px; text-decoration:line-through; opacity:.55; margin-right:6px; }
.cat-featured .cat-cell-name { font-size:26px; -webkit-line-clamp:3; }
.cat-featured .cat-cell-desc { font-size:14px; -webkit-line-clamp:5; }
.cat-featured .cat-cell-price { font-size:40px; }
.cat-cover { flex:1; display:flex; flex-direction:column; justify-content:flex-end; padding:48px;
  background-size:cover; background-position:center; }
.cat-cover-title { font-family:var(--cat-font-h); font-weight:900; font-size:56px; line-height:1.05; }
.cat-cover-sub { font-size:20px; margin-top:12px; opacity:.9; }
.cat-cover-base { font-size:14px; margin-top:24px; opacity:.75; }
.cat-cover-band { align-self:flex-start; background:var(--cat-accent); color:#fff; padding:10px 22px;
  border-radius:6px; font-family:var(--cat-font-h); font-weight:800; letter-spacing:.12em; text-transform:uppercase; font-size:13px; margin-bottom:18px; }
.cat-toc { flex:1; padding:40px 48px; }
.cat-toc-title { font-family:var(--cat-font-h); font-weight:900; font-size:34px; margin-bottom:24px;
  border-bottom:3px solid var(--cat-accent); padding-bottom:12px; }
.cat-toc-entry { display:flex; align-items:baseline; gap:8px; padding:5px 0; font-size:13px; }
.cat-toc-entry.lvl1 { font-family:var(--cat-font-h); font-weight:800; font-size:16px; margin-top:10px; }
.cat-toc-entry.lvl2 { padding-left:18px; }
.cat-toc-entry.lvl3 { padding-left:36px; font-size:12px; opacity:.85; }
.cat-toc-dots { flex:1; border-bottom:1px dotted rgba(0,0,0,.35); }
.cat-toc-num { font-weight:700; color:var(--cat-accent); }
.cat-opener { flex:1; display:flex; flex-direction:column; justify-content:center; padding:48px; background:var(--cat-head-bg); color:var(--cat-head-ink); }
.cat-opener-kicker { font-size:13px; letter-spacing:.2em; text-transform:uppercase; color:var(--cat-accent); font-weight:800; }
.cat-opener-title { font-family:var(--cat-font-h); font-weight:900; font-size:48px; margin-top:12px; }
.cat-back { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; padding:48px; text-align:center; }
.cat-back-title { font-family:var(--cat-font-h); font-weight:900; font-size:30px; }
.cat-back-text { font-size:13px; opacity:.8; white-space:pre-wrap; max-width:70%; }
`
