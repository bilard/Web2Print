import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

const MARK_CLASS =
  'bg-yellow-300 text-black font-semibold rounded px-0.5 ring-1 ring-yellow-200/60 shadow-[0_0_8px_rgba(253,224,71,0.6)]'

/**
 * Walk un arbre React et wrappe chaque occurrence de `query` dans un <mark>.
 * Sûr sur les chaînes ; pour les éléments, recurse dans leurs children.
 * Idempotent — on saute les <mark> existants pour éviter le double wrap.
 */
export function highlightNode(node: ReactNode, query: string): ReactNode {
  const q = query.trim()
  if (!q) return node
  return walk(node, q.toLowerCase())
}

function walk(node: ReactNode, q: string): ReactNode {
  if (typeof node === 'string') return highlightString(node, q)
  if (typeof node === 'number') return node
  if (node === null || node === undefined || typeof node === 'boolean') return node
  if (Array.isArray(node)) {
    return node.map((child, i) => <Fragment key={i}>{walk(child, q)}</Fragment>)
  }
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode; className?: string }>
    // skip nested marks (déjà surlignés)
    if (el.type === 'mark') return el
    const children = el.props.children
    if (children === undefined) return el
    return cloneElement(el, undefined, walk(children, q))
  }
  return node
}

function highlightString(text: string, q: string): ReactNode {
  const lower = text.toLowerCase()
  const parts: ReactNode[] = []
  let last = 0
  let i = lower.indexOf(q, last)
  let key = 0
  while (i !== -1) {
    if (i > last) parts.push(text.slice(last, i))
    parts.push(
      <mark key={key++} className={MARK_CLASS}>
        {text.slice(i, i + q.length)}
      </mark>,
    )
    last = i + q.length
    i = lower.indexOf(q, last)
  }
  if (last === 0) return text
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function Fragment({ children }: { children: ReactNode }) {
  return <>{Children.toArray(children)}</>
}
