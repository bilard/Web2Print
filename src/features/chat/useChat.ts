import { useCallback, useEffect, useRef, useState } from 'react'
import { generateText, type ChatMessage as RouterChatMessage } from './ai/chatRouter'
import type { ChatMessageData } from './ChatMessage'
import {
  composePromptWithTextAttachments,
  imageDataUrisFrom,
  type ChatAttachment,
} from './attachments'
import { generateImage, type ReferenceImage } from '@/features/briefs/ai/geminiImageClient'

const SYSTEM_PROMPT =
  'Tu es un assistant IA utile, précis et concis intégré à DesignStudio Web2Print. ' +
  "Réponds en français par défaut, en suivant la langue de l'utilisateur si elle diffère. " +
  'Utilise du markdown (titres, listes, blocs de code) pour structurer tes réponses.'

/** Plafond du contexte envoyé au LLM. Au-delà, on ne garde que les MAX_HISTORY
 *  derniers messages — au-delà de ~30 tours, le coût input devient quadratique
 *  (chaque réponse est re-renvoyée à chaque message suivant) sans bénéfice
 *  observable côté qualité. L'UI continue d'afficher tout l'historique. */
const MAX_HISTORY_MESSAGES = 30

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export type SendMode = 'text' | 'image'

export interface SendInput {
  text: string
  attachments?: ChatAttachment[]
  /** 'image' route vers Nano Banana au lieu du LLM textuel. Défaut : 'text'. */
  mode?: SendMode
}

export interface UseChatResult {
  messages: ChatMessageData[]
  isLoading: boolean
  send: (input: SendInput) => Promise<void>
  reset: () => void
  stop: () => void
}

async function attachmentsToReferenceImages(atts: ChatAttachment[]): Promise<ReferenceImage[]> {
  const refs: ReferenceImage[] = []
  for (const a of atts) {
    if (a.kind !== 'image' || !a.dataUri) continue
    const m = /^data:([^;]+);base64,(.+)$/.exec(a.dataUri)
    if (!m) continue
    refs.push({ mimeType: m[1], data: m[2], label: a.name })
  }
  return refs
}

/**
 * Gère l'état d'une conversation : append user → call generateText → append
 * assistant. Pas de persistance pour l'instant : refresh = nouvelle conversation.
 */
export function useChat(): UseChatResult {
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef<{ aborted: boolean } | null>(null)
  // Snapshot lu au moment du send (évite de mettre `messages` dans les deps de
  // useCallback, ce qui invaliderait la fonction à chaque message).
  const messagesRef = useRef<ChatMessageData[]>(messages)
  useEffect(() => { messagesRef.current = messages }, [messages])

  const send = useCallback(
    async (input: SendInput) => {
      const attachments = input.attachments ?? []
      const mode: SendMode = input.mode ?? 'text'
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
      const nextMessages = [...messagesRef.current, userMsg]
      setMessages([...nextMessages, placeholder])
      setIsLoading(true)

      const tracker = { aborted: false }
      abortRef.current = tracker

      // Branche image → Nano Banana (Gemini). Les pièces jointes image servent
      // de références visuelles ; le texte = prompt de génération.
      if (mode === 'image') {
        try {
          if (!input.text.trim()) {
            throw new Error("Décrivez l'image à générer dans le composer.")
          }
          const refs = await attachmentsToReferenceImages(attachments)
          // Préfixe explicite : sans ça, Nano Banana retombe en mode conversation
          // sur les prompts ambigus (ex: "chat" → "How can I help you today?").
          const prompt = refs.length > 0
            ? `Edit this image: ${input.text}`
            : `Generate an image: ${input.text}`
          const { blob, mimeType } = await generateImage(prompt, refs)
          if (tracker.aborted) {
            // Pas de leak : on n'a pas créé de blob URL avant d'avoir confirmé.
            return
          }
          // blob: URL plutôt que data:base64 — Chrome bloque la navigation top-frame
          // sur les data URIs longues, donc l'ouverture en grand échouait.
          const objectUrl = URL.createObjectURL(blob)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId
                ? {
                    ...m,
                    content: '',
                    status: 'done',
                    provider: 'gemini',
                    model: 'gemini-3.1-flash-image-preview',
                    imageDataUri: objectUrl,
                    imageMimeType: mimeType,
                    imagePrompt: input.text,
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
        return
      }

      // Branche texte → cascade LLM standard.
      // Borne le contexte envoyé au LLM aux MAX_HISTORY derniers messages —
      // l'UI conserve l'intégralité, mais on ne fait pas exploser les tokens.
      const trimmed = nextMessages.slice(-MAX_HISTORY_MESSAGES)
      const routerMessages: RouterChatMessage[] = trimmed.map((m) => {
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
    [],
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
    // Révoque les blob URLs (images Nano Banana) pour libérer la mémoire.
    for (const m of messagesRef.current) {
      const url = m.imageDataUri
      if (url && url.startsWith('blob:')) URL.revokeObjectURL(url)
    }
    setMessages([])
    setIsLoading(false)
    abortRef.current = null
  }, [])

  return { messages, isLoading, send, reset, stop }
}
