import { useCallback, useRef, useState } from 'react'
import { generateText, type ChatMessage as RouterChatMessage } from './ai/chatRouter'
import type { ChatMessageData } from './ChatMessage'
import {
  composePromptWithTextAttachments,
  imageDataUrisFrom,
  type ChatAttachment,
} from './attachments'

const SYSTEM_PROMPT =
  'Tu es un assistant IA utile, précis et concis intégré à DesignStudio Web2Print. ' +
  "Réponds en français par défaut, en suivant la langue de l'utilisateur si elle diffère. " +
  'Utilise du markdown (titres, listes, blocs de code) pour structurer tes réponses.'

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export interface UseChatResult {
  messages: ChatMessageData[]
  isLoading: boolean
  send: (input: { text: string; attachments?: ChatAttachment[] }) => Promise<void>
  reset: () => void
  stop: () => void
}

/**
 * Gère l'état d'une conversation : append user → call generateText → append
 * assistant. Pas de persistance pour l'instant : refresh = nouvelle conversation.
 */
export function useChat(): UseChatResult {
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef<{ aborted: boolean } | null>(null)

  const send = useCallback(
    async (input: { text: string; attachments?: ChatAttachment[] }) => {
      const attachments = input.attachments ?? []
      const userMsg: ChatMessageData = {
        id: uid(),
        role: 'user',
        content: input.text,
        attachments: attachments.length > 0 ? attachments : undefined,
      }
      const placeholderId = uid()
      const placeholder: ChatMessageData = {
        id: placeholderId,
        role: 'assistant',
        content: '',
        status: 'streaming',
      }
      const nextMessages = [...messages, userMsg]
      setMessages([...nextMessages, placeholder])
      setIsLoading(true)

      const tracker = { aborted: false }
      abortRef.current = tracker

      const routerMessages: RouterChatMessage[] = nextMessages.map((m) => {
        const atts = m.attachments ?? []
        const promptText = m.role === 'user'
          ? composePromptWithTextAttachments(m.content, atts)
          : m.content
        const imgs = m.role === 'user' ? imageDataUrisFrom(atts) : []
        return {
          role: m.role,
          content: promptText,
          ...(imgs.length > 0 ? { imageDataUris: imgs } : {}),
        }
      })

      const fallbacks: { provider: string; error: string }[] = []
      try {
        const result = await generateText({
          messages: routerMessages,
          system: SYSTEM_PROMPT,
          onProviderFailed: ({ provider, error }) => {
            // On garde le message complet (peut être long, JSON, multi-ligne).
            // L'affichage côté UI gère le wrap/scroll.
            fallbacks.push({ provider, error: error.message || String(error) })
          },
        })
        if (tracker.aborted) return
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId
              ? {
                  ...m,
                  content: result.text,
                  status: 'done',
                  provider: result.provider,
                  model: result.model,
                  fallbacks: fallbacks.length > 0 ? fallbacks : undefined,
                }
              : m,
          ),
        )
      } catch (err) {
        if (tracker.aborted) return
        const msg = err instanceof Error ? err.message : String(err)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId ? { ...m, status: 'error', error: msg } : m,
          ),
        )
      } finally {
        if (!tracker.aborted) setIsLoading(false)
        abortRef.current = null
      }
    },
    [messages],
  )

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.aborted = true
      abortRef.current = null
    }
    setMessages((prev) => prev.filter((m) => !(m.role === 'assistant' && !m.content)))
    setIsLoading(false)
  }, [])

  const reset = useCallback(() => {
    setMessages([])
    setIsLoading(false)
    abortRef.current = null
  }, [])

  return { messages, isLoading, send, reset, stop }
}
