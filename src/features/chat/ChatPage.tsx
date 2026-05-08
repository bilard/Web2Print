import { useState } from 'react'
import { MessageSquarePlus } from 'lucide-react'
import { useChat } from './useChat'
import { ChatComposer } from './ChatComposer'
import { ChatMessageList } from './ChatMessageList'
import { PromptLibraryPanel } from './prompts/PromptLibraryPanel'
import { usePrompts } from './prompts/usePrompts'
import { CATEGORY_META, PROMPT_CATEGORIES, type Prompt } from './prompts/types'

export function ChatPage() {
  const { messages, isLoading, send, reset, stop } = useChat()
  const { prompts, recordUse } = usePrompts()
  const [prefill, setPrefill] = useState<{ text: string; nonce: number }>({ text: '', nonce: 0 })
  const isEmpty = messages.length === 0

  const seedPrompt = (prompt: string) => {
    setPrefill((p) => ({ text: prompt, nonce: p.nonce + 1 }))
  }

  const handlePickPrompt = (p: Prompt) => {
    seedPrompt(p.content)
    void recordUse(p.id)
  }

  const handlePickCategory = (categoryId: typeof PROMPT_CATEGORIES[number]) => {
    const top = prompts
      .filter((p) => p.category === categoryId)
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
        return b.usageCount - a.usageCount
      })[0]
    if (top) handlePickPrompt(top)
  }

  return (
    <div className="flex-1 h-full flex bg-[#0f0f0f] overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        {!isEmpty && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-2 text-[13px] text-white/60">
              <span>{messages.filter((m) => m.role === 'user').length} message{messages.filter((m) => m.role === 'user').length > 1 ? 's' : ''}</span>
            </div>
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1.5 text-[12px] text-white/50 hover:text-violet-300 hover:bg-white/[0.04] px-2.5 py-1.5 rounded-md transition-colors"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Nouvelle conversation
            </button>
          </div>
        )}

        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8 lg:px-12">
            <div className="w-full max-w-3xl">
              <h1 className="text-[28px] font-semibold text-white/90 text-center mb-8 tracking-tight">
                Comment puis-je vous aider&nbsp;?
              </h1>
              <ChatComposer
                onSubmit={send}
                onStop={stop}
                isLoading={isLoading}
                prefill={prefill.text}
                prefillNonce={prefill.nonce}
              />
              <div className="mt-4 flex items-center justify-center flex-wrap gap-2">
                {PROMPT_CATEGORIES.filter((c) => c !== 'custom').map((c) => {
                  const meta = CATEGORY_META[c]
                  const Icon = meta.icon
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handlePickCategory(c)}
                      className="flex items-center gap-1.5 text-[12.5px] text-white/70 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-white/20 rounded-full px-3 py-1.5 transition-colors"
                    >
                      <Icon className="w-3.5 h-3.5 opacity-70" />
                      {meta.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <>
            <ChatMessageList messages={messages} />
            <div className="shrink-0 px-4 pb-4">
              <div className="max-w-3xl mx-auto">
                <ChatComposer
                  onSubmit={send}
                  onStop={stop}
                  isLoading={isLoading}
                  prefill={prefill.text}
                  prefillNonce={prefill.nonce}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{ width: 345 }} className="shrink-0">
        <PromptLibraryPanel onPick={handlePickPrompt} />
      </div>
    </div>
  )
}

export default ChatPage
