import type { CatalogRenderCtx } from './catalogCss'

interface Props { ctx: CatalogRenderCtx; variant: 'cover' | 'back' }

export function CoverPage({ ctx, variant }: Props) {
  const { plan } = ctx
  const img = variant === 'cover' ? ctx.coverImageUrl : ctx.backCoverImageUrl
  const style = img
    ? { backgroundImage: `linear-gradient(rgba(0,0,0,.15), rgba(0,0,0,.55)), url(${img})`, color: '#fff' }
    : { background: plan.theme.headerBg, color: plan.theme.headerInk }
  if (variant === 'back') {
    return (
      <div className="cat-back" style={style}>
        <div className="cat-back-rule" />
        <div className="cat-back-title">{plan.backCover.title}</div>
        {plan.backCover.text && <div className="cat-back-text">{plan.backCover.text}</div>}
      </div>
    )
  }
  return (
    <div className="cat-cover" style={style}>
      <div className="cat-cover-panel" style={img ? undefined : { background: 'none' }}>
        {plan.cover.baseline && <div className="cat-cover-band">{plan.cover.baseline}</div>}
        <h1 className="cat-cover-title">{plan.cover.title}</h1>
        {plan.cover.subtitle && <div className="cat-cover-sub">{plan.cover.subtitle}</div>}
        <div className="cat-cover-rule" />
      </div>
    </div>
  )
}
