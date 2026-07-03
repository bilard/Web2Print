import { useEffect } from 'react'
import type { CatalogPageDescriptor } from '../../catalogTypes'
import { CATALOG_CSS, cardStyleVars, ensureCatalogFonts, pagePx, themeVars, type CatalogRenderCtx } from './catalogCss'
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
  const chrome = page.kind === 'products' || page.kind === 'toc' || page.kind === 'opener'
  return (
    <div className="cat-page" style={{ width: w, height: h, ...themeVars(ctx.plan.theme), ...cardStyleVars(ctx.plan.cardStyle, ctx.plan.theme) }}>
      <style>{CATALOG_CSS}</style>
      {page.kind === 'products' && <CatalogHeader breadcrumb={page.breadcrumb} />}
      {page.kind === 'cover' && <CoverPage ctx={ctx} variant="cover" />}
      {page.kind === 'back-cover' && <CoverPage ctx={ctx} variant="back" />}
      {page.kind === 'toc' && <TocPage ctx={ctx} entries={page.entries} first={page.pageNumber === 2} />}
      {page.kind === 'opener' && (
        <OpenerPage label={page.label} catalogName={ctx.catalogName}
          index={page.index} productCount={page.productCount} families={page.families} highlights={page.highlights} />
      )}
      {page.kind === 'products' && <ProductGridPage ctx={ctx} grid={page.grid} slots={page.slots} />}
      {chrome && <CatalogFooter pageNumber={page.pageNumber} totalPages={ctx.totalPages} catalogName={ctx.catalogName} />}
    </div>
  )
}
