import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Hook minimal autour de Web Speech API (window.SpeechRecognition |
 * webkitSpeechRecognition). Disponible dans Chrome/Edge desktop et la plupart
 * des navigateurs Chromium-based.
 *
 * Usage : `const { supported, listening, transcript, start, stop } = ...`
 * Appelle `start()` pour démarrer ; chaque résultat met à jour `transcript`
 * (concaténation finale + interim). Appelle `stop()` ou laisse tomber le
 * silence — le navigateur arrête tout seul après quelques secondes.
 */

// Types Chrome Web Speech (non couverts par TypeScript par défaut)
interface ChromeSpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: ChromeSpeechRecognitionEvent) => void) | null
  onerror: ((event: ChromeSpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}
interface ChromeSpeechRecognitionEvent extends Event {
  resultIndex: number
  results: ChromeSpeechRecognitionResultList
}
interface ChromeSpeechRecognitionResultList {
  length: number
  [index: number]: ChromeSpeechRecognitionResult
}
interface ChromeSpeechRecognitionResult {
  isFinal: boolean
  [index: number]: { transcript: string }
}
interface ChromeSpeechRecognitionErrorEvent extends Event {
  error: string
  message?: string
}
type SpeechRecognitionCtor = new () => ChromeSpeechRecognition

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export interface UseSpeechRecognitionOptions {
  lang?: string
  /** Appelé à chaque résultat (final OU interim). Le second argument indique
   *  si le résultat est définitif. Permet à l'UI de construire le texte
   *  en additionnant manuellement plutôt que de tout remplacer. */
  onResult?: (transcript: string, isFinal: boolean) => void
}

export function useSpeechRecognition(opts: UseSpeechRecognitionOptions = {}) {
  const { lang = 'fr-FR', onResult } = opts
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<ChromeSpeechRecognition | null>(null)
  const onResultRef = useRef(onResult)

  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  useEffect(() => {
    setSupported(getCtor() !== null)
  }, [])

  const start = useCallback(() => {
    setError(null)
    const Ctor = getCtor()
    if (!Ctor) {
      setError('Reconnaissance vocale non supportée par ce navigateur.')
      return
    }
    if (recRef.current) {
      try {
        recRef.current.abort()
      } catch {
        /* ignore */
      }
    }
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = lang
    rec.onresult = (event) => {
      // Émet uniquement les segments NOUVEAUX (depuis resultIndex)
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        const text = r[0]?.transcript ?? ''
        if (r.isFinal) final += text
        else interim += text
      }
      if (final) onResultRef.current?.(final, true)
      if (interim) onResultRef.current?.(interim, false)
    }
    rec.onerror = (event) => {
      // "no-speech" est commun et n'est pas une vraie erreur fatale
      if (event.error === 'no-speech' || event.error === 'aborted') return
      setError(event.message || `Erreur SpeechRecognition: ${event.error}`)
    }
    rec.onend = () => setListening(false)
    try {
      rec.start()
      recRef.current = rec
      setListening(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setListening(false)
    }
  }, [lang])

  const stop = useCallback(() => {
    if (recRef.current) {
      try {
        recRef.current.stop()
      } catch {
        /* ignore */
      }
    }
  }, [])

  // Cleanup à l'unmount
  useEffect(() => {
    return () => {
      if (recRef.current) {
        try {
          recRef.current.abort()
        } catch {
          /* ignore */
        }
      }
    }
  }, [])

  return { supported, listening, error, start, stop }
}
