import type { TocEntry } from '../../catalogTypes'
import type { CatalogRenderCtx } from './catalogCss'

interface Props { ctx: CatalogRenderCtx; entries: TocEntry[]; first: boolean }

export function TocPage({ ctx, entries, first }: Props) {
  return (
    <div className="cat-toc">
      {first && <h2 className="cat-toc-title">{ctx.plan.tocTitle}</h2>}
      {entries.map((e) => (
        <div key={e.nodeId} className={`cat-toc-entry lvl${e.level}`}>
          <span>{e.label}</span>
          <span className="cat-toc-dots" />
          <span className="cat-toc-num">{e.pageNumber}</span>
        </div>
      ))}
    </div>
  )
}
