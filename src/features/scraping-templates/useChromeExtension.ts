import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Détecte la présence de l'extension Web2Print Capture et fournit les
 * primitives de contrôle (ouvrir un onglet, synchroniser les tags, capter
 * les événements de capture).
 *
 * L'ID de l'extension est lu depuis VITE_CHROME_EXTENSION_ID (env Vite).
 * Si absent ou si l'extension ne répond pas, `isAvailable` reste false et
 * tous les appels sont des no-ops (fallback iframe reste actif).
 */

export interface CaptureMessage {
  type: 'capture'
  selectors: string[]
  attr: string | null
  tag: string
  text: string
  mode?: string
}

export interface Tag {
  selector: string
  label: string
}

interface ExtensionAPI {
  isAvailable: boolean
  openAndCapture: (url: string, tags: Tag[]) => void
  syncTags: (tags: Tag[]) => void
  setActiveSelector: (selector: string | null) => void
  setMode: (mode: 'off' | 'single' | 'multiple') => void
  closeCaptureTab: () => void
  lastCapture: CaptureMessage | null
  tabOpen: boolean
}

// Fenêtre étendue Chrome runtime (seulement dans les navigateurs Chromium).
interface ChromeRuntime {
  sendMessage: (id: string, msg: unknown, cb: (resp: unknown) => void) => void
  connect: (id: string, opts: { name: string }) => ChromePort
  lastError?: { message: string }
}
interface ChromePort {
  postMessage: (msg: unknown) => void
  onMessage: { addListener: (cb: (msg: unknown) => void) => void }
  onDisconnect: { addListener: (cb: () => void) => void }
  disconnect: () => void
}

const EXT_ID = import.meta.env.VITE_CHROME_EXTENSION_ID as string | undefined

function getChromeRuntime(): ChromeRuntime | null {
  const win = window as unknown as { chrome?: { runtime?: ChromeRuntime } }
  return win.chrome?.runtime ?? null
}

export function useChromeExtension(): ExtensionAPI {
  const [isAvailable, setIsAvailable] = useState(false)
  const [lastCapture, setLastCapture] = useState<CaptureMessage | null>(null)
  const [tabOpen, setTabOpen] = useState(false)
  const portRef = useRef<ChromePort | null>(null)

  const disconnectPort = useCallback(() => {
    portRef.current?.disconnect()
    portRef.current = null
    setTabOpen(false)
  }, [])

  const connectPort = useCallback(() => {
    if (portRef.current) return
    const runtime = getChromeRuntime()
    if (!runtime || !EXT_ID) return
    try {
      const port = runtime.connect(EXT_ID, { name: 'w2p-capture' })
      port.onMessage.addListener((msg) => {
        const m = msg as { type?: string } & Record<string, unknown>
        if (m?.type === 'ready') setTabOpen(true)
        else if (m?.type === 'tab-closed') setTabOpen(false)
        else if (m?.type === 'capture') setLastCapture(m as unknown as CaptureMessage)
        else if (m?.type === 'error') console.warn('[useChromeExtension]', m.message)
      })
      port.onDisconnect.addListener(() => {
        portRef.current = null
        setTabOpen(false)
      })
      portRef.current = port
    } catch (err) {
      console.warn('[useChromeExtension] connect failed', err)
    }
  }, [])

  // Détection au montage (ping) — avec retry toutes 5s si pas dispo.
  useEffect(() => {
    const runtime = getChromeRuntime()
    if (!runtime || !EXT_ID) {
      setIsAvailable(false)
      return
    }
    let cancelled = false
    const ping = () => {
      runtime.sendMessage(EXT_ID!, { type: 'ping' }, (resp) => {
        if (cancelled) return
        const r = resp as { type?: string } | undefined
        if (r?.type === 'pong') {
          setIsAvailable(true)
          connectPort()
        } else {
          setIsAvailable(false)
        }
      })
    }
    ping()
    const interval = window.setInterval(() => {
      if (!portRef.current) ping()
    }, 5000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      disconnectPort()
    }
  }, [connectPort, disconnectPort])

  const openAndCapture = useCallback((url: string, tags: Tag[]) => {
    connectPort()
    portRef.current?.postMessage({ type: 'open-and-capture', url, templateTags: tags })
  }, [connectPort])

  const syncTags = useCallback((tags: Tag[]) => {
    portRef.current?.postMessage({ type: 'set-persistent-tags', tags })
  }, [])

  const setActiveSelector = useCallback((selector: string | null) => {
    portRef.current?.postMessage({ type: 'set-active-selector', selector })
  }, [])

  const setMode = useCallback((mode: 'off' | 'single' | 'multiple') => {
    portRef.current?.postMessage({ type: 'set-mode', mode })
  }, [])

  const closeCaptureTab = useCallback(() => {
    portRef.current?.postMessage({ type: 'close-tab' })
  }, [])

  return {
    isAvailable,
    openAndCapture,
    syncTags,
    setActiveSelector,
    setMode,
    closeCaptureTab,
    lastCapture,
    tabOpen,
  }
}
