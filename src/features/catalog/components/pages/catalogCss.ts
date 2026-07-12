// src/features/catalog/components/pages/catalogCss.ts
// CSS partagé des pages du catalogue (aperçu React + capture html2canvas).
// 1 mm = 96/25.4 px CSS → une page A4 portrait fait 794×1123 px.
import type React from 'react'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFieldKey, CustomFieldMap } from '@/features/retail-promo/promoTypes'
import { FONTS_HREF } from '@/features/retail-promo/RetailPromoCard'
import { DEFAULT_CARD_STYLE, DEFAULT_PAGE_STYLE, GRID_DIMS, type CatalogCardStyle, type CatalogFormat, type CatalogGrid, type CatalogPageStyle, type CatalogPlan, type CatalogTheme } from '../../catalogTypes'

const PX_PER_MM = 96 / 25.4

export function pagePx(format: CatalogFormat): { w: number; h: number } {
  return { w: Math.round(format.widthMm * PX_PER_MM), h: Math.round(format.heightMm * PX_PER_MM) }
}

/**
 * Dimensions (px) d'une cellule de grille (mêmes marges que le rendu : header ~64,
 * footer ~40, padding grille 36, gaps 14). Source UNIQUE pour l'échelle typo
 * (`typoFit`) ET l'aspect de l'aperçu de fiche en disposition libre (pour que la
 * carte éditée ait la MÊME forme que la cellule imprimée → placement fidèle).
 */
export function cellDims(format: CatalogFormat, grid: CatalogGrid): { w: number; h: number } {
  const [C, R] = GRID_DIMS[grid]
  return cellDimsFor(format, C, R)
}

/** Variante colonnes × rangées EXPLICITES — pages étirées (« N produits/page »
 *  avec grandes cartes : rangées réelles > nominal). */
export function cellDimsFor(format: CatalogFormat, cols: number, rows: number): { w: number; h: number } {
  const { w, h } = pagePx(format)
  return { w: (w - 64 - 14 * (cols - 1)) / cols, h: (h - 140 - 14 * (rows - 1)) / rows }
}

/**
 * Facteur d'échelle typo (`--cat-fit`) d'une cellule : racine du rapport d'aires
 * vs la cellule de référence (A4 portrait grille 6), borné. SOURCE UNIQUE utilisée
 * par le rendu des pages ET l'aperçu de fiche → badges/texte au même ratio.
 */
export function cellFit(format: CatalogFormat, grid: CatalogGrid): number {
  const [C, R] = GRID_DIMS[grid]
  return cellFitFor(format, C, R)
}

/** Variante colonnes × rangées EXPLICITES (pages étirées). */
export function cellFitFor(format: CatalogFormat, cols: number, rows: number): number {
  const { w, h } = cellDimsFor(format, cols, rows)
  return Math.min(1.45, Math.max(0.85, Math.sqrt((w * h) / (358 * 318))))
}

/** Contexte de rendu passé à toutes les pages (une seule prop drill, pas de store dans le rendu). */
export interface CatalogRenderCtx {
  plan: CatalogPlan
  format: CatalogFormat
  rowsById: Map<string, MergeRow>
  columns: MergeColumn[]
  fieldMap: Partial<Record<PromoFieldKey, string>>
  customFields: CustomFieldMap
  catalogName: string
  totalPages: number
  coverImageUrl: string | null
  backCoverImageUrl: string | null
  /** univers → couleur cyclique (palette du chemin de fer) — utilisé si pageStyle.chapterColors. */
  universeColors?: Map<string, string>
  /** Double-clic sur une fiche produit → édition de la data (Aperçu seulement ; absent à l'export). */
  onEditRow?: (rowId: string) => void
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

/**
 * Variables du style cosmétique des fiches : seuls les écarts au défaut sont
 * émis (le CSS retombe sur le thème via var(…, fallback)). React ignore les
 * clés à valeur undefined. Le style persisté peut être PARTIEL (anciens
 * documents/modèles) → fusion systématique avec les défauts. Une fin de
 * dégradé transforme la couleur de l'objet en linear-gradient (le `theme`
 * fournit la couleur de base héritée).
 */
export function cardStyleVars(style: CatalogCardStyle | undefined, theme: CatalogTheme): React.CSSProperties {
  if (!style) return {}
  const s: CatalogCardStyle = { ...DEFAULT_CARD_STYLE, ...style }
  const bg = (c1: string, c2: string, inherited: string): string | undefined =>
    c2 ? `linear-gradient(${s.gradientAngle}deg, ${c1 || inherited}, ${c2})` : (c1 || undefined)
  const font = (f: string): string | undefined => (f ? `'${f}', sans-serif` : undefined)
  return {
    '--cat-s-name': s.nameScale !== 1 ? String(s.nameScale) : undefined,
    '--cat-s-desc': s.descScale !== 1 ? String(s.descScale) : undefined,
    '--cat-s-price': s.priceScale !== 1 ? String(s.priceScale) : undefined,
    '--cat-s-brand': s.brandScale !== 1 ? String(s.brandScale) : undefined,
    '--cat-s-ref': s.refScale !== 1 ? String(s.refScale) : undefined,
    '--cat-s-unit': s.unitScale !== 1 ? String(s.unitScale) : undefined,
    '--cat-s-promo': s.promoScale !== 1 ? String(s.promoScale) : undefined,
    '--cat-s-sticker': s.stickerScale !== 1 ? String(s.stickerScale) : undefined,
    '--cat-s-vedette': s.vedetteScale !== 1 ? String(s.vedetteScale) : undefined,
    '--cat-s-details': s.detailsScale !== 1 ? String(s.detailsScale) : undefined,
    '--cat-s-kicker': s.kickerScale !== 1 ? String(s.kickerScale) : undefined,
    '--cat-font-name': font(s.nameFont),
    '--cat-font-desc': font(s.descFont),
    '--cat-font-price': font(s.priceFont),
    '--cat-font-brand': font(s.brandFont),
    '--cat-font-ref': font(s.refFont),
    '--cat-font-unit': font(s.unitFont),
    '--cat-font-promo': font(s.promoFont),
    '--cat-font-sticker': font(s.stickerFont),
    '--cat-font-vedette': font(s.vedetteFont),
    '--cat-font-details': font(s.detailsFont),
    '--cat-font-kicker': font(s.kickerFont),
    '--cat-promo-bg': bg(s.promoBg, s.promoBg2, theme.accent),
    '--cat-sticker-bg': bg(s.stickerBg, s.stickerBg2, theme.accent),
    '--cat-price-bg': bg(s.priceBg, s.priceBg2, theme.accent),
    '--cat-was-bg': bg(s.wasBg, s.wasBg2, theme.headerBg),
    '--cat-kicker-bg': bg(s.kickerBg, s.kickerBg2, theme.headerBg),
    '--cat-vedette-bg': bg(s.vedetteBg, s.vedetteBg2, theme.accent),
    // Cadre + nom de la fiche vedette : couleur UNIE (border-color n'accepte pas de dégradé).
    '--cat-vedette-ink': s.vedetteBg || undefined,
    '--cat-vedette-price-bg': bg(s.vedettePriceBg, s.vedettePriceBg2, theme.accent),
    '--cat-card-bg': s.cardBg || undefined,
    '--cat-price-ink': s.priceInk || undefined,
    '--cat-vedette-price-ink': s.vedettePriceInk || undefined,
    '--cat-name-ink': s.nameColor || undefined,
    // Textes des badges ('' = blanc / encre d'en-tête selon l'objet).
    '--cat-promo-ink': s.promoInk || undefined,
    '--cat-sticker-ink': s.stickerInk || undefined,
    '--cat-kicker-ink': s.kickerInk || undefined,
    '--cat-was-ink': s.wasInk || undefined,
    '--cat-vedette-txt': s.vedetteTxtInk || undefined,
    // Textes de contenu : la couleur choisie ANNULE aussi l'atténuation par
    // défaut (opacity), sinon elle serait rendue délavée.
    '--cat-brand-ink': s.brandColor || undefined,
    '--cat-desc-ink': s.descColor || undefined,
    '--cat-desc-op': s.descColor ? '1' : undefined,
    '--cat-ref-ink': s.refColor || undefined,
    '--cat-ref-op': s.refColor ? '1' : undefined,
    '--cat-unit-ink': s.unitColor || undefined,
    '--cat-unit-op': s.unitColor ? '1' : undefined,
    '--cat-details-ink': s.detailsColor || undefined,
    '--cat-details-op': s.detailsColor ? '1' : undefined,
    '--cat-details-bg': s.detailsBg || undefined,
    '--cat-cell-radius': s.radius !== 6 ? `${s.radius}px` : undefined,
    '--cat-img-share': s.imageShare !== 40 ? `${s.imageShare}%` : undefined,
    '--cat-img-pad': s.imagePad !== 12 ? `${s.imagePad}px` : undefined,
  } as React.CSSProperties
}

/** Style de page persisté (possiblement PARTIEL) fusionné avec les défauts. */
export function mergedPageStyle(style: CatalogPageStyle | undefined): CatalogPageStyle {
  return { ...DEFAULT_PAGE_STYLE, ...style }
}

/** Variables CSS du style des éléments de page — seuls les écarts au défaut sont émis. */
export function pageStyleVars(style: CatalogPageStyle | undefined): React.CSSProperties {
  if (!style) return {}
  const s = mergedPageStyle(style)
  return {
    '--cat-p-head': s.headerScale !== 1 ? String(s.headerScale) : undefined,
    '--cat-p-folio': s.folioScale !== 1 ? String(s.folioScale) : undefined,
    '--cat-p-opener': s.openerTitleScale !== 1 ? String(s.openerTitleScale) : undefined,
    '--cat-p-cover': s.coverTitleScale !== 1 ? String(s.coverTitleScale) : undefined,
    '--cat-p-back': s.backScale !== 1 ? String(s.backScale) : undefined,
  } as React.CSSProperties
}

export function formatPrice(n: number | null): string {
  if (n == null) return ''
  return `${n.toFixed(2).replace('.', ',')} €`
}

/** Facteur d'échelle typo de la page (posé par ProductGridPage selon grille × format). */
const F = 'var(--cat-fit,1)'

export const CATALOG_CSS = `
.cat-page * { margin:0; padding:0; box-sizing:border-box; }
.cat-page { position:relative; overflow:hidden; background:var(--cat-bg,#fff); color:var(--cat-ink,#111827);
  font-family:var(--cat-font-b,'Inter',sans-serif); display:flex; flex-direction:column; }

/* ── Header : bandeau plein + liseré accent ─────────────────────────── */
.cat-head { flex:none; background:var(--cat-head-bg,#111827); color:var(--cat-head-ink,#fff);
  padding:16px 32px 14px; display:flex; align-items:baseline; gap:12px; border-bottom:4px solid var(--cat-accent); }
.cat-head--recto { justify-content:flex-end; } /* page impaire (recto) : taxonomie au bord droit */
.cat-head-univers { font-family:var(--cat-font-h); font-weight:800; font-size:calc(20px * var(--cat-p-head,1)); text-transform:uppercase; letter-spacing:.1em; }
.cat-head-crumb { font-size:calc(12px * var(--cat-p-head,1)); opacity:.85; text-transform:uppercase; letter-spacing:.06em; }
.cat-head-sep { opacity:.5; }

/* ── Footer : folio en pastille accent ──────────────────────────────── */
.cat-foot { flex:none; margin-top:auto; padding:0 32px 14px; display:flex; align-items:center; justify-content:space-between; font-size:10px; }
.cat-foot--verso { flex-direction:row-reverse; } /* page paire (verso) : folio au bord gauche */
.cat-foot-name { text-transform:uppercase; letter-spacing:.14em; opacity:.55; font-weight:600; }
.cat-foot-folio { background:var(--cat-accent); color:#fff; font-family:var(--cat-font-h); font-weight:800;
  font-size:calc(12px * var(--cat-p-folio,1)); padding:5px 12px; border-radius:3px; }

/* ── Grille produits : cartes pleines, séparées par filets ──────────── */
.cat-grid { flex:1; display:grid; gap:14px; padding:20px 32px 16px; min-height:0; }
/* Bandeau de SECTION (sous-famille) : casse la page au début de chaque groupe */
.cat-group-band { display:flex; align-items:center; gap:10px;
  background:var(--cat-kicker-bg,var(--cat-head-bg)); color:var(--cat-kicker-ink,var(--cat-head-ink));
  font-family:var(--cat-font-h); font-weight:800; font-size:calc(11px * ${F});
  letter-spacing:.16em; text-transform:uppercase;
  padding:calc(5px * ${F}) 14px; border-radius:4px; }
.cat-group-band::after { content:''; flex:1; height:2px; background:var(--cat-accent); opacity:.6; border-radius:1px; }
.cat-cell { position:relative; display:flex; flex-direction:column; min-height:0; background:var(--cat-card-bg,#fff);
  border:1px solid rgba(17,24,39,.10); border-bottom:3px solid var(--cat-accent);
  border-radius:var(--cat-cell-radius,6px); overflow:hidden; }
/* ── Disposition LIBRE : objets positionnés en % (le concepteur les place) ── */
.cat-free { position:relative; overflow:hidden; }
.cat-free .cat-obj { position:absolute; }
/* Neutralise le positionnement intrinsèque des objets qui étaient absolus dans le flux */
.cat-free .cat-cell-promo, .cat-free .cat-cell-kicker, .cat-free .cat-price-sticker, .cat-free .cat-cell-vedette {
  position:static; top:auto; left:auto; right:auto; bottom:auto; display:inline-flex; }
/* La cartouche promo reste un BANDEAU (remplit sa boîte, pleine largeur par
   défaut) — inline-flex la réduisait à la largeur du texte, design ≠ auto. */
.cat-free .cat-cell-promo { display:block; width:100%; }
.cat-free .cat-cell-img-in { position:static; top:auto; left:auto; right:auto; bottom:auto; width:100%; height:100%; }
.cat-free .cat-obj[data-object-id="image"] { background:linear-gradient(180deg,#fafbfc 0%,#eef1f4 100%); }
.cat-free .cat-cell-body { display:contents; }
/* ── GRAMMAIRE DE FORMES (moteur créatif v2) : chaque descripteur CardShape a son
   rendu CSS déterministe — data-attrs posés par ProductCell, identiques aperçu /
   pages / export. ── */
/* Coins des fiches */
.cat-cell[data-sh-corner="rounded"] { border-radius:16px; }
.cat-cell[data-sh-corner="bevel"] { border-radius:0; border-bottom:none;
  clip-path:polygon(0 0, 100% 0, 100% calc(100% - 26px), calc(100% - 26px) 100%, 0 100%); }
/* Chip sous-famille à ENCOCHE (coin bas-droit coupé, façon flyer promo) */
.cat-cell[data-sh-chip="notch"] .cat-cell-kicker { border-radius:0;
  clip-path:polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 13px) 100%, 0 100%); padding-right:18px; }
.cat-cell[data-sh-chip="underline"] .cat-cell-kicker { background:none; color:var(--cat-ink);
  border-radius:0; padding-left:0; box-shadow:inset 0 -3px 0 var(--cat-kicker-bg,var(--cat-accent)); }
.cat-cell[data-sh-chip="plain"] .cat-cell-kicker { background:none; color:var(--cat-ink); padding-left:0; }
/* Prix NU (texte bold sans badge, façon maquettes minimalistes) */
.cat-cell[data-sh-price="bare"] .cat-cell-tag { background:none !important; box-shadow:none; transform:none; padding:0; }
.cat-cell[data-sh-price="bare"] .cat-cell-price { color:var(--cat-price-ink,var(--cat-ink)); text-shadow:none; }
.cat-cell[data-sh-price="bare"] .cat-cell-was { background:none !important; color:var(--cat-ink); opacity:.5; padding:0; transform:none; }
/* Prix PASTILLE arrondie */
.cat-cell[data-sh-price="pill"] .cat-cell-tag { border-radius:999px; transform:none; padding-left:18px; padding-right:18px; }
/* Sticker rectangle / étoile (rond = défaut) */
.cat-cell[data-sh-sticker="rect"] .cat-price-sticker { border-radius:10px; aspect-ratio:auto; padding:8px 14px; }
.cat-cell[data-sh-sticker="star"] .cat-price-sticker { border-radius:0;
  clip-path:polygon(50% 0%,61% 12%,76% 6%,79% 22%,95% 25%,88% 39%,100% 50%,88% 61%,95% 75%,79% 78%,76% 94%,61% 88%,50% 100%,39% 88%,24% 94%,21% 78%,5% 75%,12% 61%,0% 50%,12% 39%,5% 25%,21% 22%,24% 6%,39% 12%); }
/* Image AMPLIFIÉE : déborde de sa boîte avec ombre portée (détouré mis en avant) */
.cat-cell[data-sh-image="overflow"] .cat-cell-img-in { overflow:visible; }
.cat-cell[data-sh-image="overflow"] .cat-cell-img-in img { transform:scale(1.16); filter:drop-shadow(0 10px 18px rgba(0,0,0,.28)); }
.cat-cell[data-sh-image="overflow"] .cat-obj[data-object-id="image"] { overflow:visible !important; background:none; }
/* Ombre portée des fiches */
.cat-cell[data-sh-shadow] { box-shadow:0 10px 26px rgba(0,0,0,.22); }

/* Paragraphe PAR BLOC (barre du header de l'aperçu) — data-attrs posés par
   ProductCell : alignement (le contenu devient bloc pour que text-align porte)
   + gras/italique/souligné FORCÉS par-dessus les défauts du template. */
.cat-free .cat-obj[data-ta] > * { display:block; width:100%; }
.cat-free .cat-obj[data-ta="l"] { text-align:left; }
.cat-free .cat-obj[data-ta="c"] { text-align:center; }
.cat-free .cat-obj[data-ta="r"] { text-align:right; }
.cat-free .cat-obj[data-ta="j"] { text-align:justify; }
.cat-free .cat-obj[data-b], .cat-free .cat-obj[data-b] * { font-weight:700 !important; }
.cat-free .cat-obj[data-i], .cat-free .cat-obj[data-i] * { font-style:italic !important; }
.cat-free .cat-obj[data-u] > * { text-decoration:underline; }

.cat-cell-img { position:relative; flex:1; min-height:0; display:flex; align-items:center; justify-content:center;
  background:linear-gradient(180deg,#fafbfc 0%,#eef1f4 100%); padding:12px; }
/* L'image REMPLIT sa zone (upscale contain) via un cadre absolu — boîte définie,
   fiable aussi à l'export html2canvas (les % dans du flex y sont mal résolus). */
.cat-cell-img-in { position:absolute; top:var(--cat-img-pad,12px); left:var(--cat-img-pad,12px); right:var(--cat-img-pad,12px); bottom:var(--cat-img-pad,12px); }
.cat-cell-img-in img { width:100%; height:100%; object-fit:contain; }
/* Sticker rond de remise (écart barré/vente) — en haut à droite du bloc image */
.cat-price-sticker { position:absolute; top:8px; right:8px; width:calc(46px * var(--cat-s-sticker,1) * ${F}); height:calc(46px * var(--cat-s-sticker,1) * ${F}); border-radius:999px;
  background:var(--cat-sticker-bg,var(--cat-accent)); color:var(--cat-sticker-ink,#fff); display:flex; align-items:center; justify-content:center;
  font-family:var(--cat-font-sticker,var(--cat-font-h)); font-weight:800; font-size:calc(13px * var(--cat-s-sticker,1) * ${F});
  box-shadow:0 3px 10px rgba(0,0,0,.18); }
.cat-featured .cat-price-sticker { top:54px; }
.cat-cell-img-ph { font-size:11px; color:#94a3b8; }
.cat-cell-kicker { position:absolute; top:0; left:0; background:var(--cat-kicker-bg,var(--cat-head-bg)); color:var(--cat-kicker-ink,var(--cat-head-ink));
  font-family:var(--cat-font-kicker,var(--cat-font-h)); font-weight:700; font-size:calc(9px * var(--cat-s-kicker,1) * ${F}); letter-spacing:.12em; text-transform:uppercase;
  padding:calc(4px * var(--cat-s-kicker,1)) calc(10px * var(--cat-s-kicker,1)); border-radius:0 0 6px 0; }
/* Cartouche promo (« Top affaire », « -30% »…) : bandeau accent AU-DESSUS de l'image */
.cat-cell-promo { flex:none; background:var(--cat-promo-bg,var(--cat-accent)); color:var(--cat-promo-ink,#fff); font-family:var(--cat-font-promo,var(--cat-font-h)); font-weight:800;
  font-size:calc(11px * var(--cat-s-promo,1) * ${F}); letter-spacing:.14em; text-transform:uppercase; text-align:center; padding:6px 10px; }
.cat-has-promo .cat-cell-kicker { top:26px; }
.cat-cell-body { flex:none; padding:8px 12px 10px; display:flex; flex-direction:column; gap:2px; }
.cat-cell-brand { font-size:calc(10px * var(--cat-s-brand,1) * ${F}); font-family:var(--cat-font-brand,var(--cat-font-b));
  text-transform:uppercase; letter-spacing:.12em; color:var(--cat-brand-ink,var(--cat-accent)); font-weight:800; }
.cat-cell-name { font-family:var(--cat-font-name,var(--cat-font-h)); font-weight:700; font-size:calc(15px * var(--cat-s-name,1) * ${F}); line-height:1.2;
  text-transform:uppercase; color:var(--cat-name-ink,inherit);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.cat-cell-desc { font-family:var(--cat-font-desc,var(--cat-font-b)); font-size:calc(11px * var(--cat-s-desc,1) * ${F}); color:var(--cat-desc-ink,inherit); opacity:var(--cat-desc-op,.7); line-height:1.35; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.cat-cell-details { display:flex; flex-direction:column; gap:1px; margin-top:4px;
  background:var(--cat-details-bg,rgba(127,127,127,.06)); border-radius:4px; padding:3px 7px;
  font-family:var(--cat-font-details,var(--cat-font-b)); font-size:calc(9px * var(--cat-s-details,1) * ${F});
  color:var(--cat-details-ink,inherit); opacity:var(--cat-details-op,.75); line-height:1.3; }
.cat-cell-details span { display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
/* Tableau des spécifications sur 2 COLONNES de paires nom/valeur (gain de place
   vertical par fiche) : zèbre par rangée, filets discrets — couleurs héritées de
   la zone détails (thème par fiche respecté). */
.cat-cell-specs-wrap { margin-top:2px; }
.cat-cell-specs-title { font-weight:700; text-transform:uppercase; letter-spacing:.06em; font-size:.95em; }
.cat-cell-specs { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); column-gap:8px; margin-top:2px; }
.cat-spec-pair { display:flex; justify-content:space-between; align-items:baseline; gap:6px;
  padding:1px 5px; line-height:1.3; border-top:1px solid rgba(127,127,127,.22); min-width:0; }
.cat-spec-pair:nth-child(-n+2) { border-top:none; }
/* Zèbre par RANGÉE (2 paires par rangée) : rangées paires ombrées. */
.cat-spec-pair:nth-child(4n+3), .cat-spec-pair:nth-child(4n+4) { background:rgba(127,127,127,.07); }
.cat-spec-n { font-weight:600; word-break:break-word; }
.cat-spec-v { text-align:right; word-break:break-word; }
/* Cartes compactes (md, grilles denses) : bloc détails à HAUTEUR BORNÉE → coupe
   nette (ellipsis), jamais de débordement, réf/prix toujours visibles en bas. */
.cat-md .cat-cell-details { max-height:5em; overflow:hidden; }
.cat-md .cat-cell-details span { -webkit-line-clamp:2; }
/* Habillage du bloc détails en disposition libre : fond neutre = bloc net, lisible,
   et hauteur bornée (remplit son .cat-obj à hauteur définie) → se coupe proprement,
   jamais de débordement hors carte. */
.cat-free .cat-obj[data-object-id="details"] { overflow:hidden; }
/* En disposition libre, les TEXTES NE SONT JAMAIS COUPÉS : aucun clamp (description
   et champs détails en hauteur naturelle) — c'est le placement des boîtes qui
   organise la place, et l'utilisateur peut les déplacer/agrandir. Une hauteur
   posée explicitement (poignées) reste respectée via l'overflow du .cat-obj. */
.cat-free .cat-cell-details { background:var(--cat-details-bg,rgba(127,127,127,.08)); border-radius:4px; padding:4px 6px; margin-top:0; height:100%; max-height:none; overflow:hidden; }
/* pre-line : les valeurs multi-lignes (Avantages « • … » séparés par \n) se
   rendent en LIGNES lisibles au lieu d'un pavé aux retours écrasés. */
.cat-free .cat-cell-details span { -webkit-line-clamp:unset; display:block; overflow:visible; white-space:pre-line; }
.cat-free .cat-cell-desc { -webkit-line-clamp:unset; display:block; overflow:visible; }
/* Textes INLINE (réf, marque, prix) passés en block : un span inline s'aligne sur
   la LIGNE DE BASE de la police héritée (plus grande) → il descend dans sa boîte
   et casse l'alignement des liaisons/soudures. En block, le texte colle au haut. */
.cat-free .cat-cell-refcode, .cat-free .cat-cell-brand, .cat-free .cat-cell-pricebox { display:block; }
.cat-cell-refcode { font-size:calc(9px * var(--cat-s-ref,1) * ${F}); font-family:var(--cat-font-ref,var(--cat-font-b)); color:var(--cat-ref-ink,inherit); opacity:var(--cat-ref-op,.55); letter-spacing:.08em; text-transform:uppercase; }
.cat-cell-row { display:flex; align-items:flex-end; justify-content:space-between; margin-top:6px; gap:10px; }
.cat-cell-meta { display:flex; flex-direction:column; gap:3px; min-width:0; padding-bottom:2px; }
.cat-cell-pricebox { text-align:right; }
.cat-cell-unit { display:block; font-size:calc(9px * var(--cat-s-unit,1) * ${F}); font-family:var(--cat-font-unit,var(--cat-font-b)); color:var(--cat-unit-ink,inherit); opacity:var(--cat-unit-op,.6); letter-spacing:.08em; text-transform:uppercase; }
/* Étiquette prix : bloc barré (bandeau sombre) solidaire du badge prix accent */
/* Inclinaisons décoratives (étiquette prix, sticker) : PLUS RIEN en dur ici —
   portées par la rotation PAR BLOC (r du layout, défauts −2°/+8°) pour que le
   réglage « Rotation » affiche la réalité (0° = parfaitement droit). */
.cat-cell-tag { display:inline-flex; flex-direction:column; align-items:flex-end; }
.cat-cell-was { display:inline-block; background:var(--cat-was-bg,var(--cat-head-bg)); color:var(--cat-was-ink,var(--cat-head-ink)); font-size:calc(10px * var(--cat-s-price,1) * ${F});
  font-family:var(--cat-font-price,var(--cat-font-b)); font-weight:700; text-decoration:line-through; padding:3px 9px 2px; border-radius:4px 4px 0 0; white-space:nowrap; }
.cat-cell-price { display:inline-block; background:var(--cat-price-bg,var(--cat-accent)); color:var(--cat-price-ink,#fff); font-family:var(--cat-font-price,var(--cat-font-h));
  font-weight:800; font-size:calc(18px * var(--cat-s-price,1) * ${F}); line-height:1; padding:6px 10px 5px; border-radius:4px; white-space:nowrap; }
.cat-cell-was + .cat-cell-price { border-radius:4px 0 4px 4px; }

/* Tailles graduées (span issu du packing : prix élevé/vedette = carte plus grande) */
.cat-lg .cat-cell-name { font-size:calc(17px * var(--cat-s-name,1) * ${F}); }
.cat-lg .cat-cell-desc { font-size:calc(11px * var(--cat-s-desc,1) * ${F}); -webkit-line-clamp:3; }
.cat-lg .cat-cell-price { font-size:calc(22px * var(--cat-s-price,1) * ${F}); }
.cat-xl .cat-cell-name { font-size:calc(26px * var(--cat-s-name,1) * ${F}); -webkit-line-clamp:3; }
.cat-xl .cat-cell-desc { font-size:calc(13px * var(--cat-s-desc,1) * ${F}); -webkit-line-clamp:5; }
.cat-xl .cat-cell-price { font-size:calc(34px * var(--cat-s-price,1) * ${F}); padding:10px 16px 9px; }
.cat-xl .cat-cell-kicker { font-size:calc(11px * var(--cat-s-kicker,1) * ${F}); padding:calc(6px * var(--cat-s-kicker,1)) calc(13px * var(--cat-s-kicker,1)); }
.cat-xl .cat-cell-brand { font-size:calc(12px * var(--cat-s-brand,1) * ${F}); }
.cat-xl .cat-cell-body { padding:14px 18px 16px; gap:4px; }
.cat-xl .cat-cell-promo { font-size:calc(14px * var(--cat-s-promo,1) * ${F}); padding:8px 12px; }
.cat-xl.cat-has-promo .cat-cell-kicker { top:33px; }
.cat-xl .cat-cell-refcode { font-size:calc(11px * var(--cat-s-ref,1) * ${F}); }
.cat-xl .cat-cell-unit { font-size:calc(11px * var(--cat-s-unit,1) * ${F}); }
.cat-xl .cat-cell-was { font-size:calc(14px * var(--cat-s-price,1) * ${F}); padding:4px 12px 3px; }
.cat-xl .cat-price-sticker { width:calc(68px * var(--cat-s-sticker,1) * ${F}); height:calc(68px * var(--cat-s-sticker,1) * ${F}); font-size:calc(19px * var(--cat-s-sticker,1) * ${F}); }

/* Layout HORIZONTAL (image gauche pleine hauteur / contenu droite) : cartes
   larges (2×1) et cartes standard des grilles denses 6-8/page — zéro vide */
.cat-hz { display:grid; grid-template-columns:var(--cat-img-share,40%) 1fr; grid-template-rows:auto minmax(0,1fr); }
.cat-hz .cat-cell-promo { grid-row:1; grid-column:1 / -1; }
.cat-hz .cat-cell-img { grid-row:2; grid-column:1; height:100%; }
.cat-hz .cat-cell-body { grid-row:2; grid-column:2; min-width:0; display:flex; flex-direction:column; justify-content:center; padding:10px 14px; gap:3px; }
.cat-hz .cat-cell-row { margin-top:10px; }
/* Typo boost réservé aux VRAIES cartes larges (2 colonnes) */
.cat-hz.cat-lg .cat-cell-body { padding:12px 18px; }
.cat-hz.cat-lg .cat-cell-row { margin-top:14px; }
.cat-hz.cat-lg .cat-cell-name { font-size:calc(22px * var(--cat-s-name,1) * ${F}); -webkit-line-clamp:3; }
.cat-hz.cat-lg .cat-cell-desc { -webkit-line-clamp:4; font-size:calc(12px * var(--cat-s-desc,1) * ${F}); }
.cat-hz.cat-lg .cat-cell-brand { font-size:calc(12px * var(--cat-s-brand,1) * ${F}); }
.cat-hz.cat-lg .cat-cell-refcode { font-size:calc(10px * var(--cat-s-ref,1) * ${F}); }
.cat-hz.cat-lg .cat-cell-unit { font-size:calc(10px * var(--cat-s-unit,1) * ${F}); }
.cat-hz.cat-lg .cat-cell-price { font-size:calc(28px * var(--cat-s-price,1) * ${F}); padding:9px 15px 8px; }
.cat-hz.cat-lg .cat-cell-was { font-size:calc(13px * var(--cat-s-price,1) * ${F}); }
/* Cartes compactes horizontales : sticker réduit, en bas de l'image (le kicker occupe le haut) */
.cat-hz.cat-md .cat-price-sticker { width:calc(34px * var(--cat-s-sticker,1) * ${F}); height:calc(34px * var(--cat-s-sticker,1) * ${F}); font-size:calc(10px * var(--cat-s-sticker,1) * ${F}); top:auto; bottom:6px; right:6px; }
.cat-hz.cat-md .cat-cell-img-in { top:var(--cat-img-pad,8px); left:var(--cat-img-pad,8px); right:var(--cat-img-pad,8px); bottom:var(--cat-img-pad,8px); }

/* Vedette : mise en avant AU SEIN de la page — cadre accent + ruban en coin.
   Personnalisable (Style des fiches) : couleur/dégradé, taille, police, texte. */
.cat-featured { border:2px solid var(--cat-vedette-ink,var(--cat-accent)); border-bottom:6px solid var(--cat-vedette-ink,var(--cat-accent));
  box-shadow:0 6px 20px rgba(0,0,0,.12); }
.cat-featured .cat-cell-name { color:var(--cat-vedette-ink,var(--cat-accent)); }
.cat-featured .cat-cell-price { background:var(--cat-vedette-price-bg,var(--cat-price-bg,var(--cat-accent)));
  color:var(--cat-vedette-price-ink,var(--cat-price-ink,#fff)); }
.cat-cell-vedette { position:absolute; top:16px; right:-34px; transform:rotate(45deg); z-index:1;
  background:var(--cat-vedette-bg,var(--cat-accent)); color:var(--cat-vedette-txt,#fff); font-family:var(--cat-font-vedette,var(--cat-font-h)); font-weight:800;
  font-size:calc(10px * var(--cat-s-vedette,1) * ${F}); letter-spacing:.16em; text-transform:uppercase;
  padding:calc(5px * var(--cat-s-vedette,1) * ${F}) 42px; }
.cat-xl .cat-cell-vedette { top:22px; right:-30px; font-size:calc(12px * var(--cat-s-vedette,1) * ${F}); }

/* ── Couverture ─────────────────────────────────────────────────────── */
.cat-cover { flex:1; display:flex; flex-direction:column; justify-content:flex-end; padding:0;
  background-size:cover; background-position:center; position:relative; }
.cat-cover-panel { padding:40px 48px 48px; background:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,.28) 22%,rgba(0,0,0,.45) 100%); }
.cat-cover-band { align-self:flex-start; display:inline-block; background:var(--cat-accent); color:#fff; padding:10px 22px;
  border-radius:4px; font-family:var(--cat-font-h); font-weight:800; letter-spacing:.16em; text-transform:uppercase; font-size:calc(13px * var(--cat-p-cover,1)); margin-bottom:20px; transform:rotate(-2deg); }
.cat-cover-title { font-family:var(--cat-font-h); font-weight:900; font-size:calc(64px * var(--cat-p-cover,1)); line-height:1; text-transform:uppercase; }
.cat-cover-sub { font-family:var(--cat-font-h); font-size:calc(24px * var(--cat-p-cover,1)); font-weight:700; margin-top:14px; opacity:.95; text-transform:uppercase; letter-spacing:.04em; }
.cat-cover-rule { width:120px; height:6px; background:var(--cat-accent); margin-top:24px; }
/* ── Couverture ARCHÉTYPE « panel » (éditorial, moteur créatif) : bande latérale
   sombre + pastille baseline verticale + grand panneau accent chevauchant la
   photo + bandeau infos bas — composition façon maquettes print. ── */
.cat-coverp { flex:1; position:relative; overflow:hidden; }
.cat-coverp-spine { position:absolute; left:0; top:0; bottom:0; width:13%; background:var(--cat-head-bg);
  display:flex; justify-content:center; padding-top:6%; }
.cat-coverp-chip { writing-mode:vertical-rl; transform:rotate(180deg); background:var(--cat-accent); color:var(--cat-ink);
  font-family:var(--cat-font-h); font-weight:800; font-size:20px; letter-spacing:.12em; text-transform:uppercase;
  padding:26px 10px; border-radius:2px; max-height:46%; overflow:hidden; }
.cat-coverp-panel { position:absolute; left:32%; right:10%; top:44%; bottom:14%; background:var(--cat-accent);
  color:var(--cat-ink); padding:7% 6%; display:flex; flex-direction:column; justify-content:flex-start; box-shadow:0 18px 60px rgba(0,0,0,.18); }
.cat-coverp-title { font-family:var(--cat-font-h); font-weight:900; font-size:calc(56px * var(--cat-p-cover,1)); line-height:1.02; }
.cat-coverp-sub { font-family:var(--cat-font-b); font-size:calc(17px * var(--cat-p-cover,1)); margin-top:18px; opacity:.85; max-width:34ch; }
.cat-coverp-foot { position:absolute; left:0; right:0; bottom:0; height:14%; background:var(--cat-bg); color:var(--cat-ink);
  display:flex; align-items:center; justify-content:space-between; padding:0 6% 0 17%; }
.cat-coverp-foot-info { font-family:var(--cat-font-h); font-weight:700; font-size:16px; letter-spacing:.06em; text-transform:uppercase; opacity:.8; }
.cat-coverp-foot-chip { background:var(--cat-head-bg); color:var(--cat-head-ink); font-family:var(--cat-font-h);
  font-weight:700; font-size:15px; padding:10px 26px; letter-spacing:.08em; }
/* ── Couverture ARCHÉTYPE « poster » : titre géant centré sur la photo. ── */
.cat-coverz { justify-content:center; }
.cat-coverz-in { padding:8%; display:flex; flex-direction:column; align-items:center; text-align:center; gap:18px; }
.cat-coverz-title { font-family:var(--cat-font-h); font-weight:900; font-size:calc(92px * var(--cat-p-cover,1)); line-height:.96; text-transform:uppercase; }

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
  font-size:calc(300px * var(--cat-p-opener,1)); line-height:1; color:currentColor; opacity:.22; letter-spacing:-.05em; }
.cat-opener-chip { position:relative; align-self:flex-start; background:var(--cat-accent); color:#fff;
  font-family:var(--cat-font-h); font-weight:800; font-size:13px; letter-spacing:.24em; text-transform:uppercase;
  padding:8px 18px; border-radius:3px; transform:rotate(-2deg); }
.cat-opener-kicker { position:relative; margin-top:26px; font-family:var(--cat-font-h); font-size:14px; letter-spacing:.28em; text-transform:uppercase; font-weight:800; opacity:.75; }
.cat-opener-title { position:relative; font-family:var(--cat-font-h); font-weight:900; font-size:calc(74px * var(--cat-p-opener,1)); line-height:.98;
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
.cat-back-title { font-family:var(--cat-font-h); font-weight:900; font-size:calc(32px * var(--cat-p-back,1)); text-transform:uppercase; }
.cat-back-text { font-size:calc(13px * var(--cat-p-back,1)); opacity:.85; white-space:pre-wrap; max-width:70%; line-height:1.6; }
`
