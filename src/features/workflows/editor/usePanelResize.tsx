// src/features/workflows/editor/usePanelResize.tsx
import { useCallback, useEffect, useRef, useState } from 'react'

interface PanelState {
  height: number
  collapsed: boolean
}

interface UsePanelResizeOptions {
  /** Clé localStorage pour persister height + collapsed entre sessions. */
  storageKey: string
  /** Hauteur initiale (px) si rien en localStorage. */
  defaultHeight: number
  /** Hauteur min en px. Empêche de dragger en-dessous (le collapse couvre 0). */
  minHeight?: number
  /** Hauteur max exprimée en `vh` (% de la fenêtre). */
  maxHeightVh?: number
}

/**
 * Stocke et restaure la hauteur + l'état replié d'un panneau bas. Hauteur
 * recadrée à chaque mount pour absorber un viewport plus petit qu'à l'écriture.
 */
export function usePanelResize({
  storageKey,
  defaultHeight,
  minHeight = 96,
  maxHeightVh = 75,
}: UsePanelResizeOptions) {
  const [state, setState] = useState<PanelState>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PanelState>
        const h = typeof parsed.height === 'number' ? parsed.height : defaultHeight
        return { height: h, collapsed: !!parsed.collapsed }
      }
    } catch {
      // localStorage indispo (mode privé strict, etc.) — on retombe sur défaut
    }
    return { height: defaultHeight, collapsed: false }
  })

  // Recadrage initial : si la fenêtre a rétréci entre deux sessions, on
  // re-clamp à 75vh pour éviter qu'un panneau bouffe tout l'écran.
  useEffect(() => {
    const max = (window.innerHeight * maxHeightVh) / 100
    if (state.height > max) {
      setState((s) => ({ ...s, height: Math.max(minHeight, max) }))
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      // ignore
    }
  }, [storageKey, state])

  const setHeight = useCallback((h: number) => {
    setState((s) => ({ ...s, height: h }))
  }, [])

  const toggleCollapsed = useCallback(() => {
    setState((s) => ({ ...s, collapsed: !s.collapsed }))
  }, [])

  return { ...state, setHeight, toggleCollapsed, minHeight, maxHeightVh }
}

interface ResizeHandleProps {
  height: number
  onChange: (next: number) => void
  minHeight: number
  maxHeightVh: number
}

/**
 * Poignée de drag horizontal posée sur le bord supérieur d'un panneau bas.
 * Drag vers le haut = agrandit, vers le bas = rétrécit. Clamp [min, maxVh%].
 */
export function PanelResizeHandle({ height, onChange, minHeight, maxHeightVh }: ResizeHandleProps) {
  const draggingRef = useRef(false)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startY = e.clientY
      const startHeight = height
      draggingRef.current = true
      document.body.style.cursor = 'ns-resize'
      // Empêche la sélection de texte pendant le drag
      document.body.style.userSelect = 'none'

      const onMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return
        const dy = startY - ev.clientY // drag vers le haut = dy > 0 = agrandit
        const max = (window.innerHeight * maxHeightVh) / 100
        const next = Math.max(minHeight, Math.min(max, startHeight + dy))
        onChange(next)
      }
      const onUp = () => {
        draggingRef.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [height, onChange, minHeight, maxHeightVh],
  )

  return (
    <div
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Redimensionner le panneau"
      className="h-1.5 -mt-1 absolute inset-x-0 top-0 cursor-ns-resize hover:bg-indigo-500/30 active:bg-indigo-500/50 transition-colors z-20"
    />
  )
}
