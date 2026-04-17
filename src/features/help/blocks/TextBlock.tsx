import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface TextBlockProps {
  md: string
}

export function TextBlock({ md }: TextBlockProps) {
  return (
    <div className="prose prose-invert prose-sm max-w-none
      prose-p:text-white/70 prose-p:leading-relaxed
      prose-strong:text-white/90
      prose-code:text-indigo-300 prose-code:bg-white/5 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:hidden prose-code:after:hidden
      prose-ul:text-white/70 prose-li:my-0.5
      prose-a:text-indigo-400 hover:prose-a:text-indigo-300">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
    </div>
  )
}
