import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, RotateCw, Loader2, AlertTriangle, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import type { AspectFormat } from './types'
import type { Composition } from './promptToComposition'
import type { StyleConfig } from './promptToStyleConfig'

interface Props {
  aspect: AspectFormat
  /** Mode design-reveal (canvas) : SVG capturé à animer. */
  svg?: string
  /** Mode multi-scene (standalone) : composition générée par Gemini. */
  composition?: Composition
  brand?: string
  caption?: string
  prompt?: string
  styleConfig?: StyleConfig
  autoPlay?: boolean
  className?: string
  /** Dimensions exactes (canvas source) — si fournies, override la taille du bucket */
  width?: number
  height?: number
  /** Limite CSS de la hauteur du container (ex. `'60vh'`). Quand fournie, le
   *  ratio est préservé via `aspect-ratio` mais la largeur s'adapte pour rentrer
   *  dans la hauteur disponible — utile pour les portraits (9:16) qui sinon
   *  débordent du viewport et masquent les boutons d'action en dessous. */
  maxHeight?: string
}

interface NativeSize {
  width: number
  height: number
}

const NATIVE_SIZE: Record<AspectFormat, NativeSize> = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 },
}

interface GsapTimelineLike {
  play(): void
  pause(): void
  seek(t: number): void
  time(): number
  duration(): number
  progress(): number
  isActive(): boolean
  paused(): boolean
  restart(): void
  eventCallback(type: 'onUpdate' | 'onComplete', cb: (() => void) | null): void
}

interface IframeWindow extends Window {
  __timelines?: Record<string, GsapTimelineLike>
}

export function HyperframesPlayer({
  aspect,
  svg,
  composition,
  brand,
  caption,
  prompt,
  styleConfig,
  autoPlay = true,
  className,
  width,
  height,
  maxHeight,
}: Props) {
  // Si la composition source a des dims exactes (canvas), on les utilise pour
  // que la preview ait le RATIO EXACT du document — sinon fallback bucket.
  const native = width && height ? { width, height } : NATIVE_SIZE[aspect]
  // Mode multi-scene si composition fournie (standalone Gemini-driven),
  // sinon design-reveal sur SVG capturé (mode canvas).
  const isMultiScene = !!composition
  const compositionId = isMultiScene ? `multi-scene-${aspect}` : `design-reveal-${aspect}`
  const templateUrl = `/hf-templates/${compositionId}/index.html`

  const containerRef = useRef<HTMLDivElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const timelineRef = useRef<GsapTimelineLike | null>(null)
  const rafRef = useRef<number | null>(null)

  const [srcDoc, setSrcDoc] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [renderToken, setRenderToken] = useState(0)
  // Zoom utilisateur (multiplie le fit-scale) + pan + état espace pour pan-mode
  // façon Photoshop/Figma. `userZoom = 1` ⇒ vidéo fitée au container ; `effective=1`
  // (pixel-perfect) ⇒ 100 %. Tabulations de raccourcis :
  //   • Molette / pinch  → zoom centré curseur
  //   • Bouton "Fit"     → fit container (userZoom=1, pan reset)
  //   • Bouton "100 %"   → pixel-perfect (effectiveScale=1)
  //   • Bouton +/-       → zoom 25 % par cran
  //   • Barre d'espace + drag → pan, comme un viewer standard
  const [userZoom, setUserZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  /** Mode "Fit" : le container occupe toute la place disponible (flex-1) au
   *  lieu d'être contraint par son aspect-ratio nominal. Le scale interne
   *  produit ensuite le letterboxing (style YouTube/Vimeo). Désactivé au clic
   *  "100 %" qui restaure le ratio nominal pour avoir un référentiel pixel-perfect. */
  const [fillContainer, setFillContainer] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const ZOOM_MIN = 0.1
  const ZOOM_MAX = 16
  const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))

  const variables = useMemo<Record<string, unknown>>(() => {
    if (isMultiScene) {
      return {
        composition,
        brand: brand || undefined,
        prompt: prompt || undefined,
      }
    }
    return {
      svg: svg ?? '',
      brand: brand || undefined,
      caption: caption || undefined,
      prompt: prompt || undefined,
      styleConfig: styleConfig || undefined,
      svgUrl: '',
    }
  }, [isMultiScene, composition, svg, brand, caption, prompt, styleConfig])

  useEffect(() => {
    let cancelled = false
    setFetchError(null)
    setReady(false)
    setSrcDoc(null)

    // L'iframe utilise srcDoc \u2192 la base URL devient `about:srcdoc` et les
    // <script src="./mockups.js"> du template ne peuvent PAS se r\u00e9soudre.
    // On fetch le HTML + les scripts auxiliaires s\u00e9par\u00e9ment puis on les inline
    // dans le srcDoc. Liste des scripts attendus selon le composition-id.
    const baseDir = templateUrl.replace(/\/index\.html$/, '')
    const auxScriptFiles = isMultiScene ? ['mockups.js'] : []

    const fetchText = (url: string): Promise<string> =>
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`)
        return r.text()
      })

    Promise.all([
      fetchText(templateUrl),
      ...auxScriptFiles.map((f) => fetchText(`${baseDir}/${f}`)),
    ])
      .then(([html, ...auxScripts]) => {
        if (cancelled) return
        const safeVars = JSON.stringify(variables)
          .replace(/</g, '\\u003c')
          .replace(/>/g, '\\u003e')
          .replace(/&/g, '\\u0026')
          .replace(/[\u2028\u2029]/g, (c) => (c === '\u2028' ? '\\u2028' : '\\u2029'))
        const varsInjection = `<script>window.__hyperframes = window.__hyperframes || {}; window.__hyperframes.getVariables = function () { return ${safeVars}; };<\/script>`

        // Inline les scripts auxiliaires en rempla\u00e7ant les balises <script src="./X.js">
        // par leur contenu, et drop les r\u00e9f\u00e9rences restantes.
        let inlinedHtml = html
        auxScriptFiles.forEach((file, i) => {
          const content = auxScripts[i]
          const pattern = new RegExp(
            `<script\\b[^>]*\\bsrc=["']\\./${file.replace(/\./g, '\\.')}["'][^>]*></script>`,
            'g',
          )
          inlinedHtml = inlinedHtml.replace(pattern, `<script>${content}<\/script>`)
        })

        // Patch runtime des dimensions du template si width/height fournis
        // (canvas source). Reproduit le patch serveur c\u00f4t\u00e9 preview pour que
        // l'iframe utilise EXACTEMENT le ratio du canvas source.
        if (width && height) {
          const wMatch = inlinedHtml.match(/data-width="(\d+)"/)
          const hMatch = inlinedHtml.match(/data-height="(\d+)"/)
          if (wMatch && hMatch) {
            const oldW = wMatch[1]
            const oldH = hMatch[1]
            const newW = String(Math.round(width))
            const newH = String(Math.round(height))
            inlinedHtml = inlinedHtml
              .replace(
                /(<meta\s+name="viewport"\s+content="width=)\d+(\s*,\s*height=)\d+("\s*\/?>)/,
                `$1${newW}$2${newH}$3`,
              )
              .replace(/data-width="\d+"/g, `data-width="${newW}"`)
              .replace(/data-height="\d+"/g, `data-height="${newH}"`)
              .split(`width: ${oldW}px`).join(`width: ${newW}px`)
            inlinedHtml = inlinedHtml.split(`height: ${oldH}px`).join(`height: ${newH}px`)
          }
        }

        const next = inlinedHtml.includes('</head>')
          ? inlinedHtml.replace('</head>', `${varsInjection}\n</head>`)
          : `${varsInjection}\n${inlinedHtml}`
        setSrcDoc(next)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        setFetchError(`Impossible de charger ${templateUrl} : ${msg}`)
      })
    return () => {
      cancelled = true
    }
  }, [templateUrl, variables, renderToken, isMultiScene, width, height])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const compute = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w <= 0 || h <= 0) return
      const next = Math.min(w / native.width, h / native.height)
      if (next > 0 && Number.isFinite(next)) setScale(next)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [native.width, native.height])

  // Zoom via molette / pinch trackpad. Listener natif non-passif (preventDefault
  // du scroll). Le pinch macOS arrive en `wheel ctrlKey=true`, déjà géré.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08
      setUserZoom((z) => clampZoom(z * factor))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Barre d'espace = pan-mode (curseur grab/grabbing). Ignoré si focus sur input.
  useEffect(() => {
    const isEditable = (t: EventTarget | null): boolean => {
      if (!(t instanceof HTMLElement)) return false
      const tag = t.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isEditable(e.target)) return
      e.preventDefault()
      setSpaceHeld(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      setSpaceHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // Pan autorisé soit en mode espace, soit dès que le contenu dépasse le container.
  const panEnabled = spaceHeld || userZoom > 1

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !panEnabled) return
    setIsDragging(true)
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
  }
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragRef.current) return
    setPan({
      x: dragRef.current.panX + (e.clientX - dragRef.current.x),
      y: dragRef.current.panY + (e.clientY - dragRef.current.y),
    })
  }
  const handleMouseUp = () => {
    setIsDragging(false)
    dragRef.current = null
  }
  const handleZoomIn = () => setUserZoom((z) => clampZoom(z * 1.25))
  const handleZoomOut = () => setUserZoom((z) => clampZoom(z / 1.25))
  const handleFit = () => {
    setFillContainer(true)
    setUserZoom(1)
    setPan({ x: 0, y: 0 })
  }
  // Pixel-perfect = effectiveScale === 1 ⇒ userZoom = 1 / scale.
  // On sort du mode fill pour retrouver le ratio nominal — sinon "100 %" n'a
  // pas de référentiel stable quand le container peut prendre n'importe quelle
  // forme.
  const handleHundred = () => {
    setFillContainer(false)
    if (scale > 0) {
      setUserZoom(clampZoom(1 / scale))
      setPan({ x: 0, y: 0 })
    }
  }
  const effectivePct = Math.round(scale * userZoom * 100)

  const handleLoad = () => {
    const iframe = iframeRef.current
    if (!iframe) return
    const start = performance.now()
    const tryAttach = () => {
      const win = iframe.contentWindow as IframeWindow | null
      const tl = win?.__timelines?.[compositionId]
      if (tl) {
        timelineRef.current = tl
        setDuration(tl.duration())
        setReady(true)
        if (autoPlay) {
          tl.seek(0)
          tl.play()
          setPlaying(true)
        }
        startTracking()
        return
      }
      if (performance.now() - start > 5000) {
        setFetchError('Timeline Annimation introuvable après 5s')
        return
      }
      window.setTimeout(tryAttach, 50)
    }
    tryAttach()
  }

  const startTracking = () => {
    if (rafRef.current !== null) return
    const tick = () => {
      const tl = timelineRef.current
      if (tl) {
        const t = tl.time()
        const d = tl.duration() || 1
        setProgress(t / d)
        setDuration(d)
        const stillPlaying = !tl.paused() && tl.isActive()
        setPlaying(stillPlaying)
        if (!stillPlaying && t >= d - 0.001) {
          // boucle de preview
          tl.seek(0)
          tl.play()
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    timelineRef.current = null
  }, [])

  const handleTogglePlay = () => {
    const tl = timelineRef.current
    if (!tl) return
    if (tl.paused()) {
      if (tl.time() >= tl.duration() - 0.001) tl.seek(0)
      tl.play()
      setPlaying(true)
    } else {
      tl.pause()
      setPlaying(false)
    }
  }

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const tl = timelineRef.current
    if (!tl) return
    const ratio = Number(e.target.value) / 1000
    tl.pause()
    tl.seek(ratio * tl.duration())
    setProgress(ratio)
    setPlaying(false)
  }

  const handleReplay = () => {
    const tl = timelineRef.current
    if (!tl) {
      setRenderToken((n) => n + 1)
      return
    }
    tl.seek(0)
    tl.play()
    setPlaying(true)
  }

  const effectiveScale = scale * userZoom
  const cursor = isDragging
    ? 'grabbing'
    : spaceHeld
    ? 'grab'
    : panEnabled
    ? 'grab'
    : 'default'

  return (
    <div className={`flex flex-col gap-2 min-h-0 ${fillContainer ? 'flex-1 h-full' : ''} ${className ?? ''}`}>
      <div
        ref={containerRef}
        className={`relative bg-black rounded-xl border border-white/10 overflow-hidden flex items-center justify-center select-none ${
          fillContainer ? 'flex-1 min-h-0 w-full' : maxHeight ? 'mx-auto block' : 'w-full'
        }`}
        style={
          fillContainer
            ? { cursor, touchAction: 'none' as const }
            : maxHeight
            ? {
                // Avec maxHeight, on fige la HEIGHT et on laisse aspect-ratio
                // calculer la width. Ainsi un portrait 9:16 ne déborde plus du
                // viewport — la largeur s'ajuste pour rentrer dans la hauteur
                // disponible (cf. capture utilisateur où le player faisait
                // 1246×1920 et masquait les boutons sous le scroll).
                height: maxHeight,
                aspectRatio: `${native.width} / ${native.height}`,
                maxWidth: '100%',
                cursor,
                touchAction: 'none' as const,
              }
            : { aspectRatio: `${native.width} / ${native.height}`, cursor, touchAction: 'none' as const }
        }
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {fetchError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <p className="text-xs text-amber-200/80 max-w-xs break-words">{fetchError}</p>
          </div>
        )}

        {!fetchError && !ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
          </div>
        )}

        {srcDoc && !fetchError && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: native.width,
              height: native.height,
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${effectiveScale})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 60ms linear',
            }}
          >
            <iframe
              ref={iframeRef}
              key={renderToken}
              srcDoc={srcDoc}
              onLoad={handleLoad}
              title="Annimation preview"
              sandbox="allow-scripts allow-same-origin"
              style={{
                width: native.width,
                height: native.height,
                border: 0,
                display: 'block',
                pointerEvents: 'none',
              }}
            />
          </div>
        )}

        {/* Contrôles zoom overlay (standards viewer : Fit · 100% · - % +) */}
        {srcDoc && !fetchError && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-lg p-1 border border-white/10 text-[10px] font-mono">
            <button
              type="button"
              onClick={handleFit}
              className={`flex items-center gap-1 px-2 h-6 rounded ${
                fillContainer
                  ? 'bg-indigo-500/30 text-white border border-indigo-400/50'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
              title="Adapter à la fenêtre (occupe tout l'espace disponible)"
            >
              <Maximize2 className="w-3 h-3" />
              <span>Fit</span>
            </button>
            <button
              type="button"
              onClick={handleHundred}
              className={`px-2 h-6 rounded ${
                !fillContainer && Math.abs(effectivePct - 100) < 1
                  ? 'bg-indigo-500/30 text-white border border-indigo-400/50'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
              title="Taille réelle (pixel-perfect)"
            >
              100 %
            </button>
            <div className="w-px h-4 bg-white/15 mx-0.5" />
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={userZoom <= ZOOM_MIN + 0.001}
              className="flex items-center justify-center w-6 h-6 rounded text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30"
              aria-label="Zoom arrière"
              title="Zoom arrière"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-white/60 tabular-nums px-1 min-w-[36px] text-center">
              {effectivePct}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={userZoom >= ZOOM_MAX - 0.001}
              className="flex items-center justify-center w-6 h-6 rounded text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30"
              aria-label="Zoom avant"
              title="Zoom avant"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Hint pan via espace */}
        {spaceHeld && srcDoc && !fetchError && (
          <div className="absolute bottom-2 left-2 px-2 py-1 bg-indigo-500/20 backdrop-blur-sm border border-indigo-400/40 rounded text-[10px] text-indigo-200 font-mono pointer-events-none">
            ⎵ Pan
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px] text-white/50 font-mono tabular-nums">
        <button
          type="button"
          onClick={handleTogglePlay}
          disabled={!ready}
          className="flex items-center justify-center w-7 h-7 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-white disabled:opacity-40"
          aria-label={playing ? 'Pause' : 'Lecture'}
        >
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={handleReplay}
          disabled={!ready && !fetchError}
          className="flex items-center justify-center w-7 h-7 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-white disabled:opacity-40"
          aria-label="Rejouer"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          onChange={handleScrub}
          disabled={!ready}
          className="flex-1 accent-indigo-500 h-1 cursor-pointer disabled:opacity-40"
        />
        <span className="tabular-nums">
          {(progress * duration).toFixed(1)}s / {duration.toFixed(1)}s
        </span>
      </div>
    </div>
  )
}
