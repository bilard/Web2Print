import type { CatalogRenderCtx } from './catalogCss'
import { mergedPageStyle } from './catalogCss'

interface Props { ctx: CatalogRenderCtx; variant: 'cover' | 'back' }

export function CoverPage({ ctx, variant }: Props) {
  const { plan } = ctx
  const ps = mergedPageStyle(plan.pageStyle)
  const img = variant === 'cover' ? ctx.coverImageUrl : ctx.backCoverImageUrl
  // Assombrissement réglable du visuel (haut léger → bas plus marqué, lisibilité du titre).
  const o = Math.min(80, Math.max(0, ps.coverOverlay)) / 100
  const style = img
    ? { backgroundImage: `linear-gradient(rgba(0,0,0,${(o * 0.27).toFixed(3)}), rgba(0,0,0,${o.toFixed(3)})), url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center', color: '#fff' }
    : { background: plan.theme.headerBg, color: plan.theme.headerInk }
  if (variant === 'back') {
    return (
      <div className="cat-back" style={style}>
        {ps.showBackRule && <div className="cat-back-rule" />}
        <div className="cat-back-title">{plan.backCover.title}</div>
        {plan.backCover.text && <div className="cat-back-text">{plan.backCover.text}</div>}
      </div>
    )
  }
  return (
    <div className="cat-cover" style={style}>
      <div className="cat-cover-panel" style={img ? undefined : { background: 'none' }}>
        {ps.showCoverBaseline && plan.cover.baseline && <div className="cat-cover-band">{plan.cover.baseline}</div>}
        <h1 className="cat-cover-title">{plan.cover.title}</h1>
        {ps.showCoverSubtitle && plan.cover.subtitle && <div className="cat-cover-sub">{plan.cover.subtitle}</div>}
        {ps.showCoverRule && <div className="cat-cover-rule" />}
      </div>
    </div>
  )
}
