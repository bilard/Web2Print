import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Plus, AudioLines, ArrowUp, StopCircle } from 'lucide-react'
import { toast } from 'sonner'
import { ModelBadge } from './ModelBadge'
import { AttachmentMenu } from './AttachmentMenu'
import { AttachmentChips } from './AttachmentChips'
import {
  fileToAttachment,
  captureScreenshot,
  type ChatAttachment,
} from './attachments'
import { useSpeechRecognition } from './useSpeechRecognition'

export interface ComposerSubmitPayload {
  text: string
  attachments: ChatAttachment[]
}

interface ChatComposerProps {
  onSubmit: (payload: ComposerSubmitPayload) => void
  onStop?: () => void
  isLoading?: boolean
  placeholder?: string
  prefill?: string
  prefillNonce?: number
}

const ACCEPT_FILES = 'image/png,image/jpeg,image/webp,image/gif,text/*,.md,.csv,.json,.log'

export function ChatComposer({
  onSubmit,
  onStop,
  isLoading = false,
  placeholder = 'Comment puis-je vous aider ?',
  prefill,
  prefillNonce,
}: ChatComposerProps) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // On mémorise la "base" de texte présente quand la dictée a démarré pour
  // appondre les segments interim sans dupliquer.
  const speechBaseRef = useRef<string>('')

  const speech = useSpeechRecognition({
    lang: 'fr-FR',
    onResult: (transcript, isFinal) => {
      const sep =
        speechBaseRef.current && !speechBaseRef.current.endsWith(' ') ? ' ' : ''
      const next = speechBaseRef.current + sep + transcript
      setValue(next)
      autoresizeRef()
      if (isFinal) {
        speechBaseRef.current = next
      }
    },
  })

  const autoresizeRef = () => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`
  }

  useEffect(() => {
    if (prefill === undefined) return
    setValue(prefill)
    speechBaseRef.current = prefill
    requestAnimationFrame(() => {
      const ta = taRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(prefill.length, prefill.length)
      autoresizeRef()
    })
  }, [prefill, prefillNonce])

  const handlePickFiles = () => fileInputRef.current?.click()

  const handleFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // permet de re-sélectionner le même fichier
    for (const f of files) {
      try {
        const att = await fileToAttachment(f)
        setAttachments((prev) => [...prev, att])
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    }
  }

  const handleScreenshot = async () => {
    try {
      const att = await captureScreenshot()
      setAttachments((prev) => [...prev, att])
    } catch (err) {
      // L'utilisateur peut annuler le partage d'écran (NotAllowedError)
      const msg = err instanceof Error ? err.message : String(err)
      if (!/NotAllowed|cancel/i.test(msg)) toast.error(`Capture impossible : ${msg}`)
    }
  }

  const submit = () => {
    const trimmed = value.trim()
    if ((!trimmed && attachments.length === 0) || isLoading) return
    if (speech.listening) speech.stop()
    onSubmit({ text: trimmed, attachments })
    setValue('')
    setAttachments([])
    speechBaseRef.current = ''
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const toggleVoice = () => {
    if (!speech.supported) {
      toast.error('Reconnaissance vocale non supportée par ce navigateur.')
      return
    }
    if (speech.listening) {
      speech.stop()
    } else {
      speechBaseRef.current = value
      speech.start()
    }
  }

  useEffect(() => {
    if (speech.error) toast.error(speech.error)
  }, [speech.error])

  const canSubmit = (value.trim().length > 0 || attachments.length > 0) && !isLoading

  return (
    <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-2xl shadow-lg shadow-black/20 px-4 pt-3 pb-2.5">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT_FILES}
        onChange={handleFilesChange}
        className="hidden"
      />
      <AttachmentChips
        attachments={attachments}
        onRemove={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
      />
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          speechBaseRef.current = e.target.value
          autoresizeRef()
        }}
        onKeyDown={handleKey}
        placeholder={speech.listening ? 'Dictée en cours…' : placeholder}
        rows={1}
        className="w-full bg-transparent text-white placeholder:text-white/30 resize-none outline-none text-[14.5px] leading-[1.55] min-h-[28px] max-h-[240px]"
      />
      <div className="flex items-center justify-between mt-2">
        <div className="relative flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            title="Joindre un fichier"
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
              menuOpen
                ? 'bg-white/[0.08] text-white'
                : 'text-white/55 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Plus className={`w-4 h-4 transition-transform ${menuOpen ? 'rotate-45' : ''}`} />
          </button>
          <AttachmentMenu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            onPickFiles={handlePickFiles}
            onScreenshot={handleScreenshot}
          />
        </div>
        <div className="flex items-center gap-2">
          <ModelBadge pulsing={isLoading} />
          {isLoading ? (
            <button
              type="button"
              onClick={onStop}
              title="Arrêter"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-white/80 transition-colors"
            >
              <StopCircle className="w-4 h-4" />
            </button>
          ) : canSubmit ? (
            <button
              type="button"
              onClick={submit}
              title="Envoyer (Entrée)"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-violet-500 hover:bg-violet-400 text-white transition-colors"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleVoice}
              title={speech.listening ? 'Arrêter la dictée' : 'Saisie vocale'}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
                speech.listening
                  ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                  : 'text-white/55 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              {speech.listening ? (
                <span className="relative flex items-center justify-center">
                  <span className="absolute w-3 h-3 rounded-full bg-rose-400 animate-ping opacity-60" />
                  <span className="relative w-2.5 h-2.5 rounded-full bg-rose-400" />
                </span>
              ) : (
                <AudioLines className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
