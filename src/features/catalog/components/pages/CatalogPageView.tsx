import { useEffect, type CSSProperties } from 'react'
import type { CatalogPageDescriptor } from '../../catalogTypes'
import { CATALOG_CSS, cardStyleVars, ensureCatalogFonts, mergedPageStyle, pagePx, pageStyleVars, themeVars, type CatalogRenderCtx } from './catalogCss'
import { CatalogHeader } from './CatalogHeader'
import { CatalogFooter } from './CatalogFooter'
import { CoverPage } from './CoverPage'
import { TocPage } from './TocPage'
import { OpenerPage } from './OpenerPage'
import { ProductGridPage } from './ProductGridPage'

interface Props { page: CatalogPageDescriptor; ctx: CatalogRenderCtx }

export function CatalogPageView({ page, ctx }: Props) {
  useEffect(() => { ensureCatalogFonts() }, [])
  const { w, h } = pagePx(ctx.format)
  const ps = mergedPageStyle(ctx.plan.pageStyle)
  const chrome = page.kind === 'products' || page.kind === 'toc' || page.kind === 'opener'
  // « Couleurs par chapitre » : bandeau + affiche d'ouverture prennent la couleur
  // de l'univers (même palette que le chemin de fer) au lieu du bandeau du thème.
  const chapterColor = ps.chapterColors && (page.kind === 'products' || page.kind === 'opener')
    ? ctx.universeColors?.get(page.nodeId)
    : undefined
  return (
    <div className="cat-page" style={{
      width: w, height: h, ...themeVars(ctx.plan.theme), ...cardStyleVars(ctx.plan.cardStyle, ctx.plan.theme), ...pageStyleVars(ctx.plan.pageStyle),
      ...(chapterColor ? ({ '--cat-head-bg': chapterColor, '--cat-head-ink': '#fff' } as CSSProperties) : {}),
    }}>
      <style>{CATALOG_CSS}</style>
      {page.kind === 'products' && ps.showHeader && <CatalogHeader breadcrumb={page.breadcrumb} pageNumber={page.pageNumber} />}
      {page.kind === 'cover' && <CoverPage ctx={ctx} variant="cover" />}
      {page.kind === 'back-cover' && <CoverPage ctx={ctx} variant="back" />}
      {page.kind === 'toc' && <TocPage ctx={ctx} entries={page.entries} first={page.pageNumber === 2} />}
      {page.kind === 'opener' && (
        <OpenerPage label={page.label} catalogName={ctx.catalogName} pageStyle={ps}
          index={page.index} productCount={page.productCount} families={page.families} highlights={page.highlights} />
      )}
      {page.kind === 'products' && <ProductGridPage ctx={ctx} grid={page.grid} slots={page.slots} />}
      {chrome && ps.showFooter && (
        <CatalogFooter pageNumber={page.pageNumber} totalPages={ctx.totalPages} catalogName={ctx.catalogName} showName={ps.showFooterName} />
      )}
    </div>
  )
}
