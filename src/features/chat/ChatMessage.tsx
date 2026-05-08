import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Loader2, AlertCircle, AlertTriangle, ChevronDown, ChevronRight, Copy, Check, FileText } from 'lucide-react'
import { ResponseProviderBadge } from './ModelBadge'
import type { ChatAttachment } from './attachments'

const PROVIDER_DISPLAY: Record<string, string> = {
  claude: 'Claude (Anthropic)',
  gemini: 'Gemini (Google)',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  kimi: 'Kimi',
  openrouter: 'OpenRouter',
}

function tryPrettyJson(s: string): string {
  // Si l'erreur ressemble à "providerName 429: {...}", extrait et reformate le JSON.
  const m = s.match(/^([^:]+):\s*(\{[\s\S]*\})\s*$/)
  if (m) {
    try {
      return `${m[1]}:\n${JSON.stringify(JSON.parse(m[2]), null, 2)}`
    } catch {
      /* JSON invalide → garde tel quel */
    }
  }
  return s
}

interface FallbackBadgeProps {
  provider: string
  error: string
}

function FallbackBadge({ provider, error }: FallbackBadgeProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const isLong = error.length > 120
  const displayed = expanded ? tryPrettyJson(error) : error

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(error)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="text-[10.5px] text-amber-300/80 bg-amber-500/[0.06] border border-amber-500/20 rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => isLong && setExpanded((v) => !v)}
        className={`w-full flex items-start gap-1.5 px-2 py-1 text-left ${isLong ? 'hover:bg-amber-500/[0.04] cursor-pointer' : 'cursor-default'}`}
      >
        <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
        <span className="font-medium shrink-0">
          {PROVIDER_DISPLAY[provider] ?? provider}
        </span>
        <span className="text-amber-200/60 shrink-0">a échoué&nbsp;:</span>
        <span className={`text-amber-200/60 flex-1 min-w-0 ${expanded || !isLong ? 'whitespace-pre-wrap break-all' : 'truncate'}`}>
          {expanded ? '' : error}
        </span>
        {isLong && (
          <span className="shrink-0 text-amber-300/70">
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </span>
        )}
      </button>
      {expanded && (
        <div className="border-t border-amber-500/15 bg-black/20">
          <pre className="px-2 py-1.5 text-[10px] font-mono text-amber-100/80 whitespace-pre-wrap break-all max-h-[260px] overflow-y-auto">
            {displayed}
          </pre>
          <div className="flex justify-end px-2 py-1 border-t border-amber-500/15">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 text-[10px] text-amber-200/60 hover:text-amber-100 transition-colors"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copié' : 'Copier'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export interface ChatMessageData {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Provider et modèle ayant répondu (pour les messages assistant). */
  provider?: string
  model?: string
  /** État de la génération pour les messages assistant. */
  status?: 'streaming' | 'done' | 'error'
  /** Message d'erreur si status === 'error'. */
  error?: string
  /** Providers de la cascade qui ont échoué AVANT celui qui a répondu. */
  fallbacks?: { provider: string; error: string }[]
  /** Pièces jointes (uniquement messages user). */
  attachments?: ChatAttachment[]
}

interface ChatMessageProps {
  message: ChatMessageData
}

const MARKDOWN_CLASSES =
  'prose prose-invert prose-sm max-w-none ' +
  'prose-p:text-white/80 prose-p:leading-relaxed prose-p:my-2 ' +
  'prose-headings:text-white prose-headings:font-semibold ' +
  'prose-strong:text-white ' +
  'prose-code:text-indigo-300 prose-code:bg-white/[0.06] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:hidden prose-code:after:hidden ' +
  'prose-pre:bg-[#0d0d0d] prose-pre:border prose-pre:border-white/10 ' +
  'prose-ul:text-white/80 prose-ol:text-white/80 prose-li:my-0.5 ' +
  'prose-a:text-indigo-400 hover:prose-a:text-indigo-300 ' +
  'prose-hr:border-white/10 prose-blockquote:text-white/60 prose-blockquote:border-l-white/20'

export function ChatMessage({ message }: ChatMessageProps) {
  if (message.role === 'user') {
    const atts = message.attachments ?? []
    const images = atts.filter((a) => a.kind === 'image' && a.dataUri)
    const texts = atts.filter((a) => a.kind === 'text')
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] flex flex-col items-end gap-1.5">
          {images.length > 0 && (
            <div className="flex flex-wrap gap-1.5 justify-end">
              {images.map((a) => (
                <img
                  key={a.id}
                  src={a.dataUri}
                  alt={a.name}
                  className="max-h-48 max-w-[260px] rounded-xl border border-white/10 object-cover"
                />
              ))}
            </div>
          )}
          {texts.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-end">
              {texts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-1.5 text-[11px] text-white/65 bg-white/[0.04] border border-white/10 rounded-md px-2 py-1"
                  title={`${a.name} (${a.size} octets)`}
                >
                  <FileText className="w-3 h-3" />
                  <span className="truncate max-w-[200px]">{a.name}</span>
                </div>
              ))}
            </div>
          )}
          {message.content && (
            <div className="bg-indigo-500/15 border border-indigo-500/25 text-white/90 rounded-2xl px-4 py-2.5 text-[14px] whitespace-pre-wrap">
              {message.content}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Assistant
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] flex flex-col">
        {message.status === 'streaming' && !message.content && (
          <div className="flex items-center gap-2 text-white/50 text-[13px] py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Réflexion en cours…</span>
          </div>
        )}
        {message.status === 'error' ? (
          <div className="flex items-start gap-2 text-rose-300 bg-rose-500/[0.08] border border-rose-500/25 rounded-xl px-3 py-2.5 text-[13px]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium mb-0.5">Échec du provider</p>
              <p className="text-rose-200/80 break-words">{message.error}</p>
            </div>
          </div>
        ) : (
          message.content && (
            <div className={MARKDOWN_CLASSES}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          )
        )}
        {message.fallbacks && message.fallbacks.length > 0 && message.status === 'done' && (
          <div className="flex flex-col gap-1 mt-2">
            {message.fallbacks.map((f, i) => (
              <FallbackBadge key={`${f.provider}-${i}`} provider={f.provider} error={f.error} />
            ))}
          </div>
        )}
        {message.status === 'done' && message.provider && message.model && (
          <ResponseProviderBadge provider={message.provider} model={message.model} />
        )}
      </div>
    </div>
  )
}
