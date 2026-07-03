// src/features/catalog/components/pages/catalogCss.ts
// CSS partagé des pages du catalogue (aperçu React + capture html2canvas).
// 1 mm = 96/25.4 px CSS → une page A4 portrait fait 794×1123 px.
import type React from 'react'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFieldKey } from '@/features/retail-promo/promoTypes'
import { FONTS_HREF } from '@/features/retail-promo/RetailPromoCard'
import type { CatalogFormat, CatalogPlan, CatalogTheme } from '../../catalogTypes'

const PX_PER_MM = 96 / 25.4

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

/* ── Header : bandeau plein + liseré accent ─────────────────────────── */
.cat-head { flex:none; background:var(--cat-head-bg,#111827); color:var(--cat-head-ink,#fff);
  padding:16px 32px 14px; display:flex; align-items:baseline; gap:12px; border-bottom:4px solid var(--cat-accent); }
.cat-head-univers { font-family:var(--cat-font-h); font-weight:800; font-size:20px; text-transform:uppercase; letter-spacing:.1em; }
.cat-head-crumb { font-size:12px; opacity:.85; text-transform:uppercase; letter-spacing:.06em; }
.cat-head-sep { opacity:.5; }

/* ── Footer : folio en pastille accent ──────────────────────────────── */
.cat-foot { flex:none; margin-top:auto; padding:0 32px 14px; display:flex; align-items:center; justify-content:space-between; font-size:10px; }
.cat-foot-name { text-transform:uppercase; letter-spacing:.14em; opacity:.55; font-weight:600; }
.cat-foot-folio { background:var(--cat-accent); color:#fff; font-family:var(--cat-font-h); font-weight:800;
  font-size:12px; padding:5px 12px; border-radius:3px; }

/* ── Grille produits : cartes pleines, séparées par filets ──────────── */
.cat-grid { flex:1; display:grid; gap:14px; padding:20px 32px 16px; min-height:0; }
.cat-cell { position:relative; display:flex; flex-direction:column; min-height:0; background:#fff;
  border:1px solid rgba(17,24,39,.10); border-bottom:3px solid var(--cat-accent); border-radius:6px; overflow:hidden; }
.cat-cell-img { flex:1; min-height:0; display:flex; align-items:center; justify-content:center;
  background:linear-gradient(180deg,#fafbfc 0%,#eef1f4 100%); padding:10px; }
.cat-cell-img img { max-width:100%; max-height:100%; object-fit:contain; }
.cat-cell-img-ph { font-size:11px; color:#94a3b8; }
.cat-cell-kicker { position:absolute; top:0; left:0; background:var(--cat-head-bg); color:var(--cat-head-ink);
  font-family:var(--cat-font-h); font-weight:700; font-size:9px; letter-spacing:.12em; text-transform:uppercase;
  padding:4px 10px; border-radius:0 0 6px 0; }
.cat-cell-body { flex:none; padding:10px 12px 12px; display:flex; flex-direction:column; gap:2px; }
.cat-cell-brand { font-size:10px; text-transform:uppercase; letter-spacing:.12em; color:var(--cat-accent); font-weight:800; }
.cat-cell-name { font-family:var(--cat-font-h); font-weight:700; font-size:14px; line-height:1.2; text-transform:uppercase;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.cat-cell-desc { font-size:10px; opacity:.7; line-height:1.35; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.cat-cell-row { display:flex; align-items:flex-end; justify-content:space-between; margin-top:6px; gap:8px; }
.cat-cell-ref { font-size:8px; opacity:.5; letter-spacing:.04em; }
.cat-cell-pricebox { text-align:right; }
.cat-cell-was { display:block; font-size:11px; text-decoration:line-through; opacity:.5; }
.cat-cell-price { display:inline-block; background:var(--cat-accent); color:#fff; font-family:var(--cat-font-h);
  font-weight:800; font-size:18px; line-height:1; padding:6px 10px 5px; border-radius:4px; transform:rotate(-2deg); }

/* Tailles graduées (span issu du packing : prix élevé/vedette = carte plus grande) */
.cat-lg .cat-cell-name { font-size:17px; }
.cat-lg .cat-cell-desc { font-size:11px; -webkit-line-clamp:3; }
.cat-lg .cat-cell-price { font-size:22px; }
.cat-xl .cat-cell-name { font-size:26px; -webkit-line-clamp:3; }
.cat-xl .cat-cell-desc { font-size:13px; -webkit-line-clamp:5; }
.cat-xl .cat-cell-price { font-size:34px; padding:10px 16px 9px; }
.cat-xl .cat-cell-kicker { font-size:11px; padding:6px 13px; }
.cat-xl .cat-cell-brand { font-size:12px; }
.cat-xl .cat-cell-body { padding:14px 18px 16px; gap:4px; }

/* Vedette : mise en avant AU SEIN de la page — cadre accent + ruban en coin */
.cat-featured { border:2px solid var(--cat-accent); border-bottom:6px solid var(--cat-accent);
  box-shadow:0 6px 20px rgba(0,0,0,.12); }
.cat-featured .cat-cell-name { color:var(--cat-accent); }
.cat-cell-vedette { position:absolute; top:16px; right:-34px; transform:rotate(45deg); z-index:1;
  background:var(--cat-accent); color:#fff; font-family:var(--cat-font-h); font-weight:800; font-size:10px;
  letter-spacing:.16em; text-transform:uppercase; padding:5px 42px; }
.cat-xl .cat-cell-vedette { top:22px; right:-30px; font-size:12px; }

/* ── Couverture ─────────────────────────────────────────────────────── */
.cat-cover { flex:1; display:flex; flex-direction:column; justify-content:flex-end; padding:0;
  background-size:cover; background-position:center; position:relative; }
.cat-cover-panel { padding:40px 48px 48px; background:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,.28) 22%,rgba(0,0,0,.45) 100%); }
.cat-cover-band { align-self:flex-start; display:inline-block; background:var(--cat-accent); color:#fff; padding:10px 22px;
  border-radius:4px; font-family:var(--cat-font-h); font-weight:800; letter-spacing:.16em; text-transform:uppercase; font-size:13px; margin-bottom:20px; transform:rotate(-2deg); }
.cat-cover-title { font-family:var(--cat-font-h); font-weight:900; font-size:64px; line-height:1; text-transform:uppercase; }
.cat-cover-sub { font-family:var(--cat-font-h); font-size:24px; font-weight:700; margin-top:14px; opacity:.95; text-transform:uppercase; letter-spacing:.04em; }
.cat-cover-rule { width:120px; height:6px; background:var(--cat-accent); margin-top:24px; }

/* ── Sommaire ───────────────────────────────────────────────────────── */
.cat-toc { flex:1; padding:40px 48px; }
.cat-toc-title { font-family:var(--cat-font-h); font-weight:900; font-size:36px; text-transform:uppercase; margin-bottom:26px;
  border-bottom:5px solid var(--cat-accent); padding-bottom:12px; }
.cat-toc-entry { display:flex; align-items:baseline; gap:8px; padding:5px 0; font-size:13px; }
.cat-toc-entry.lvl1 { font-family:var(--cat-font-h); font-weight:800; font-size:17px; text-transform:uppercase; margin-top:12px;
  background:var(--cat-head-bg); color:var(--cat-head-ink); padding:7px 12px; border-radius:4px; }
.cat-toc-entry.lvl1 .cat-toc-num { color:#fff; background:var(--cat-accent); padding:1px 8px; border-radius:3px; }
.cat-toc-entry.lvl1 .cat-toc-dots { border-bottom-color:rgba(255,255,255,.35); }
.cat-toc-entry.lvl2 { padding-left:14px; font-weight:600; }
.cat-toc-entry.lvl3 { padding-left:30px; font-size:12px; opacity:.85; }
.cat-toc-dots { flex:1; border-bottom:1px dotted rgba(0,0,0,.35); }
.cat-toc-num { font-family:var(--cat-font-h); font-weight:800; color:var(--cat-accent); }

/* ── Ouverture d'univers : affiche chapitre (numéro XXL + panneau contenu) ── */
.cat-opener { flex:1; display:flex; flex-direction:column; padding:48px 48px 44px;
  background:var(--cat-head-bg); color:var(--cat-head-ink); position:relative; overflow:hidden; }
.cat-opener-stripe { position:absolute; top:-15%; right:-26%; width:46%; height:130%;
  background:var(--cat-accent); opacity:.92; transform:rotate(12deg); }
.cat-opener-stripe2 { position:absolute; top:-15%; right:-32%; width:12%; height:130%;
  background:var(--cat-head-ink); opacity:.16; transform:rotate(12deg); }
.cat-opener-num { position:absolute; top:-42px; right:18px; font-family:var(--cat-font-h); font-weight:900;
  font-size:300px; line-height:1; color:currentColor; opacity:.22; letter-spacing:-.05em; }
.cat-opener-chip { position:relative; align-self:flex-start; background:var(--cat-accent); color:#fff;
  font-family:var(--cat-font-h); font-weight:800; font-size:13px; letter-spacing:.24em; text-transform:uppercase;
  padding:8px 18px; border-radius:3px; transform:rotate(-2deg); }
.cat-opener-kicker { position:relative; margin-top:26px; font-family:var(--cat-font-h); font-size:14px; letter-spacing:.28em; text-transform:uppercase; font-weight:800; opacity:.75; }
.cat-opener-title { position:relative; font-family:var(--cat-font-h); font-weight:900; font-size:74px; line-height:.98;
  text-transform:uppercase; margin-top:14px; max-width:82%; }
.cat-opener-count { position:relative; margin-top:20px; font-family:var(--cat-font-h); font-weight:800; font-size:14px;
  letter-spacing:.2em; text-transform:uppercase; }
.cat-opener-count b { background:var(--cat-accent); color:#fff; padding:4px 12px; border-radius:3px; margin-right:10px; }
/* Panneau contenu ancré en bas : fond de page (contraste fort) + barre accent */
.cat-opener-panel { position:relative; margin-top:auto; background:var(--cat-bg); color:var(--cat-ink);
  border-radius:12px; border-top:10px solid var(--cat-accent); padding:30px 36px 34px;
  box-shadow:0 14px 40px rgba(0,0,0,.28); }
.cat-opener-panel-title { font-family:var(--cat-font-h); font-weight:800; font-size:13px; letter-spacing:.22em;
  text-transform:uppercase; opacity:.55; margin-bottom:22px; }
.cat-opener-fams { display:grid; grid-template-columns:1fr 1fr; gap:24px 32px; align-content:start; }
.cat-opener-fam { border-top:3px solid var(--cat-accent); padding-top:12px; }
.cat-opener-fam-name { display:flex; align-items:baseline; gap:10px; font-family:var(--cat-font-h); font-weight:800;
  font-size:19px; text-transform:uppercase; line-height:1.15; }
.cat-opener-fam-idx { color:var(--cat-accent); font-size:15px; letter-spacing:.06em; }
.cat-opener-fam-count { font-size:11px; opacity:.6; letter-spacing:.14em; text-transform:uppercase; margin-top:4px; }
.cat-opener-subs { margin-top:10px; display:flex; flex-wrap:wrap; gap:7px; }
.cat-opener-sub { font-size:12px; padding:4px 12px; border:1px solid; opacity:.75; border-radius:999px; letter-spacing:.03em; }
.cat-opener-hls { display:flex; flex-wrap:wrap; gap:10px; }
.cat-opener-hl { font-size:14px; font-weight:600; padding:8px 16px; border-radius:999px;
  border:1.5px solid var(--cat-accent); }

/* ── 4e de couverture ───────────────────────────────────────────────── */
.cat-back { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px; padding:48px; text-align:center; }
.cat-back-rule { width:90px; height:6px; background:var(--cat-accent); }
.cat-back-title { font-family:var(--cat-font-h); font-weight:900; font-size:32px; text-transform:uppercase; }
.cat-back-text { font-size:13px; opacity:.85; white-space:pre-wrap; max-width:70%; line-height:1.6; }
`
