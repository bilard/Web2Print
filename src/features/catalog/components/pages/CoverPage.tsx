import type { CatalogRenderCtx } from './catalogCss'
import { mergedPageStyle } from './catalogCss'
import { CatalogLogo } from './CatalogLogo'

interface Props { ctx: CatalogRenderCtx; variant: 'cover' | 'back' }

/** Le nom du catalogue est-il déjà porté par le logo de marque ? (casse/accents ignorés) */
function sameAsBrand(catalogName: string, brandName?: string): boolean {
  const norm = (v: string) => v.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return !!brandName?.trim() && norm(catalogName) === norm(brandName)
}

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
        <CatalogLogo plan={plan} logoUrl={ctx.logoUrl} place="cover" />
        {ps.showBackRule && <div className="cat-back-rule" />}
        <div className="cat-back-title">{plan.backCover.title}</div>
        {plan.backCover.text && <div className="cat-back-text">{plan.backCover.text}</div>}
      </div>
    )
  }
  // ARCHÉTYPE « panel » (éditorial) : photo NON assombrie + bande latérale sombre
  // (baseline verticale sur pastille accent) + grand panneau accent chevauchant
  // + bandeau infos bas — composition du moteur créatif (inspiration).
  if ((plan.cover.layout ?? 'classic') === 'panel') {
    const photo = img ? { backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: plan.theme.headerBg }
    return (
      <div className="cat-coverp" style={photo}>
        <div className="cat-coverp-spine">
          {ps.showCoverBaseline && plan.cover.baseline && <div className="cat-coverp-chip">{plan.cover.baseline}</div>}
        </div>
        <div className="cat-coverp-panel">
          <CatalogLogo plan={plan} logoUrl={ctx.logoUrl} place="cover" />
          <h1 className="cat-coverp-title">{plan.cover.title}</h1>
          {ps.showCoverSubtitle && plan.cover.subtitle && <div className="cat-coverp-sub">{plan.cover.subtitle}</div>}
        </div>
        <div className="cat-coverp-foot">
          {/* Le nom du catalogue n'est répété en pied QUE s'il diffère du logo :
              « DISTRILAND » composé en logo puis redit en bas faisait doublon. */}
          <div className="cat-coverp-foot-info">{sameAsBrand(ctx.catalogName, plan.brandName) ? '' : ctx.catalogName}</div>
          <div className="cat-coverp-foot-chip">{new Date().getFullYear()}</div>
        </div>
      </div>
    )
  }
  // ARCHÉTYPE « poster » : photo pleine page, titre GÉANT centré, minimal.
  if (plan.cover.layout === 'poster') {
    return (
      <div className="cat-cover cat-coverz" style={style}>
        <div className="cat-coverz-in">
          <CatalogLogo plan={plan} logoUrl={ctx.logoUrl} place="cover" />
          {ps.showCoverBaseline && plan.cover.baseline && <div className="cat-cover-band">{plan.cover.baseline}</div>}
          <h1 className="cat-coverz-title">{plan.cover.title}</h1>
          {ps.showCoverSubtitle && plan.cover.subtitle && <div className="cat-cover-sub">{plan.cover.subtitle}</div>}
        </div>
      </div>
    )
  }
  return (
    <div className="cat-cover" style={style}>
      <div className="cat-cover-panel" style={img ? undefined : { background: 'none' }}>
        <CatalogLogo plan={plan} logoUrl={ctx.logoUrl} place="cover" />
        {ps.showCoverBaseline && plan.cover.baseline && <div className="cat-cover-band">{plan.cover.baseline}</div>}
        <h1 className="cat-cover-title">{plan.cover.title}</h1>
        {ps.showCoverSubtitle && plan.cover.subtitle && <div className="cat-cover-sub">{plan.cover.subtitle}</div>}
        {ps.showCoverRule && <div className="cat-cover-rule" />}
      </div>
    </div>
  )
}
