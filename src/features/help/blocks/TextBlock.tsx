import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useHelpStore } from '../help.store'
import { highlightNode } from '../highlightText'

interface TextBlockProps {
  md: string
}

const HIGHLIGHTED_TAGS = ['p', 'li', 'strong', 'em', 'a', 'code', 'h1', 'h2', 'h3', 'h4', 'td', 'th'] as const

type Tag = (typeof HIGHLIGHTED_TAGS)[number]

export function TextBlock({ md }: TextBlockProps) {
  const query = useHelpStore((s) => s.searchQuery)

  const components = Object.fromEntries(
    HIGHLIGHTED_TAGS.map((tag) => [
      tag,
      ({ node: _node, children, ...rest }: { node?: unknown; children?: React.ReactNode; [k: string]: unknown }) => {
        const Tag = tag as Tag
        return <Tag {...rest}>{highlightNode(children, query)}</Tag>
      },
    ]),
  )

  return (
    <div className="prose prose-invert prose-sm max-w-none
      prose-p:text-white/70 prose-p:leading-relaxed
      prose-strong:text-white/90
      prose-code:text-indigo-300 prose-code:bg-white/5 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:hidden prose-code:after:hidden
      prose-ul:text-white/70 prose-li:my-0.5
      prose-a:text-indigo-400 hover:prose-a:text-indigo-300">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {md}
      </ReactMarkdown>
    </div>
  )
}
