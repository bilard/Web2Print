import { useState, useEffect, useRef } from 'react'
import { Play, Square, Save, Trash2, Download, Circle, Sun, Box } from 'lucide-react'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { startObjectAnimation } from '@/features/animation3d/useAnimation3D'
import { useCanvasRecorder } from '@/features/animation3d/useCanvasRecorder'
import type { Animation3DConfig, Animation3DPreset } from '@/features/animation3d/types'
import { PRESETS, DEFAULT_ANIMATION_CONFIG } from '@/features/animation3d/types'

import type { CanvasObjectProps } from '@/stores/editor.store'

interface Controller {
  stop: () => void
}

function findObjectById(objs: CanvasObjectProps[], id: string): CanvasObjectProps | null {
  for (const o of objs) {
    if (o.id === id) return o
    if (o.children) {
      const sub = findObjectById(o.children, id)
      if (sub) return sub
    }
  }
  return null
}

export function Animation3DPanel() {
  const selectedId = useEditorStore((s) => s.selectedObjectId)
  const canvasObjects = useEditorStore((s) => s.canvasObjects)
  const updateObject = useEditorStore((s) => s.updateObject)
  const particlesActive = useUIStore((s) => s.particlesOverlayActive)
  const setParticlesActive = useUIStore((s) => s.setParticlesOverlayActive)
  const setFlip3D = useUIStore((s) => s.setFlip3D)
  const setRelief3D = useUIStore((s) => s.setRelief3D)
  const reliefConfig = useUIStore((s) => s.relief3DConfig)
  const updateReliefConfig = useUIStore((s) => s.updateRelief3DConfig)
  const updateReliefLighting = useUIStore((s) => s.updateReliefLighting)
  const autoPlayAnimations = useUIStore((s) => s.autoPlayAnimations)
  const setAutoPlayAnimations = useUIStore((s) => s.setAutoPlayAnimations)
  const [config, setConfig] = useState<Animation3DConfig>(DEFAULT_ANIMATION_CONFIG)
  const [playing, setPlaying] = useState(false)
  const ctrlRef = useRef<Controller | null>(null)
  const recorder = useCanvasRecorder()

  // Selected object from store (for persisted animation3D config)
  const selectedObj = selectedId ? findObjectById(canvasObjects, selectedId) : null
  const persistedAnimation = selectedObj?.animation3D ?? null

  // When selection changes, load the saved config (if any) into the panel
  useEffect(() => {
    if (persistedAnimation) setConfig(persistedAnimation)
  }, [selectedId, persistedAnimation?.preset])

  // Stop animation when selection changes
  useEffect(() => {
    return () => {
      ctrlRef.current?.stop()
      ctrlRef.current = null
      setPlaying(false)
    }
  }, [selectedId])

  const fObj = selectedId && globalFabricCanvas
    ? globalFabricCanvas.getObjects().find((o: any) => o.data?.id === selectedId)
    : null

  const handleStart = () => {
    if (config.preset === 'particles') {
      setParticlesActive(true)
      setPlaying(true)
      return
    }
    if (config.preset === 'flip3D') {
      setFlip3D(true, { duration: config.duration, loop: config.loop, intensity: config.intensity })
      setPlaying(true)
      return
    }
    if (config.preset === 'relief3D') {
      setRelief3D(true)
      setPlaying(true)
      return
    }
    if (!fObj || !globalFabricCanvas) return
    ctrlRef.current?.stop()
    ctrlRef.current = startObjectAnimation(fObj, globalFabricCanvas, config)
    setPlaying(true)
  }

  const handleStop = () => {
    ctrlRef.current?.stop()
    ctrlRef.current = null
    setParticlesActive(false)
    setFlip3D(false)
    setRelief3D(false)
    setPlaying(false)
  }

  const handlePersist = () => {
    if (!selectedId) return
    updateObject(selectedId, { animation3D: config })
  }

  const handleClearPersist = () => {
    if (!selectedId) return
    updateObject(selectedId, { animation3D: null })
  }

  const handleExportWebM = async () => {
    if (!globalFabricCanvas) return
    const lower = (globalFabricCanvas as any).lowerCanvasEl as HTMLCanvasElement | undefined
    if (!lower) return

    // Start animation first so the first recorded frame is mid-motion
    if (!playing) handleStart()
    // Record one full cycle + small tail
    const totalMs = Math.max(2000, config.duration * 1000 + 500)
    recorder.start(lower, 30, 8_000_000)
    setTimeout(async () => {
      await recorder.stopAndDownload(`web2print-${config.preset}-${Date.now()}.webm`)
      handleStop()
    }, totalMs)
  }

  const updatePreset = (preset: Animation3DPreset) => {
    if (playing) {
      ctrlRef.current?.stop()
      const next = { ...config, preset }
      setConfig(next)
      if (fObj && globalFabricCanvas) {
        ctrlRef.current = startObjectAnimation(fObj, globalFabricCanvas, next)
      }
    } else {
      setConfig({ ...config, preset })
    }
  }

  if (!selectedId && config.preset !== 'particles') {
    return (
      <div className="px-3 py-4 text-xs text-white/45 space-y-3">
        <p>Sélectionnez un objet du canvas pour appliquer une animation 3D retail.</p>
        <button
          onClick={() => setConfig({ ...config, preset: 'particles' })}
          className="text-[11px] text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
        >
          Ou : tester les particules Three.js sans objet →
        </button>
      </div>
    )
  }

  return (
    <div className="px-3 py-3 space-y-3">
      {/* Auto-play toggle */}
      <label className="flex items-center justify-between gap-2 text-[11px] text-white/70 cursor-pointer rounded-md border border-white/10 bg-white/5 px-2 py-1.5">
        <span>Auto-play animations persistées</span>
        <input
          type="checkbox"
          checked={autoPlayAnimations}
          onChange={(e) => setAutoPlayAnimations(e.target.checked)}
          className="accent-indigo-500"
        />
      </label>

      {/* Presets grid 2 cols */}
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((p) => {
          const active = config.preset === p.id
          return (
            <button
              key={p.id}
              onClick={() => updatePreset(p.id)}
              className={`text-left rounded-md border px-2 py-2 transition ${
                active
                  ? 'border-indigo-500 bg-indigo-500/15 text-white'
                  : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'
              }`}
            >
              <div className="text-base leading-none">{p.emoji}</div>
              <div className="mt-1 text-[11px] font-semibold leading-tight">{p.label}</div>
              <div className="mt-0.5 text-[10px] text-white/45 leading-tight">{p.description}</div>
            </button>
          )
        })}
      </div>

      {/* Duration */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-white/60">
          <span>Durée par cycle</span>
          <span className="tabular-nums text-white/80">{config.duration.toFixed(1)}s</span>
        </div>
        <input
          type="range"
          min={0.5}
          max={8}
          step={0.1}
          value={config.duration}
          onChange={(e) => setConfig({ ...config, duration: Number(e.target.value) })}
          className="w-full accent-indigo-500"
        />
      </div>

      {/* Intensity */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-white/60">
          <span>Intensité</span>
          <span className="tabular-nums text-white/80">{config.intensity.toFixed(1)}×</span>
        </div>
        <input
          type="range"
          min={0.3}
          max={2.5}
          step={0.1}
          value={config.intensity}
          onChange={(e) => setConfig({ ...config, intensity: Number(e.target.value) })}
          className="w-full accent-indigo-500"
        />
      </div>

      {/* Loop */}
      <label className="flex items-center gap-2 text-[11px] text-white/70 cursor-pointer">
        <input
          type="checkbox"
          checked={config.loop}
          onChange={(e) => setConfig({ ...config, loop: e.target.checked })}
          className="accent-indigo-500"
        />
        Boucler l'animation
      </label>

      {/* Slide direction (only for slideEntrance / slideVertical) */}
      {(config.preset === 'slideEntrance' || config.preset === 'slideVertical') && (
        <div className="flex gap-2">
          {(config.preset === 'slideEntrance' ? ['left', 'right'] : ['top', 'bottom']).map((dir) => (
            <button
              key={dir}
              onClick={() => setConfig({ ...config, direction: dir as any })}
              className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] ${
                config.direction === dir
                  ? 'border-indigo-500 bg-indigo-500/15 text-white'
                  : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              {dir === 'left' && '← Gauche'}
              {dir === 'right' && 'Droite →'}
              {dir === 'top' && '↑ Haut'}
              {dir === 'bottom' && 'Bas ↓'}
            </button>
          ))}
        </div>
      )}

      {/* Relief 3D dedicated controls (only when preset selected) */}
      {config.preset === 'relief3D' && (
        <div className="rounded-md border border-indigo-500/30 bg-indigo-500/5 p-2.5 space-y-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-300">
            <Box className="w-3.5 h-3.5" />
            <span>Géométrie 3D</span>
          </div>

          <Slider
            label="Profondeur"
            value={reliefConfig.depth}
            min={5} max={120} step={1}
            unit="px"
            onChange={(depth) => updateReliefConfig({ depth })}
          />
          <Slider
            label="Biseau"
            value={reliefConfig.bevel}
            min={0} max={20} step={0.5}
            unit="px"
            onChange={(bevel) => updateReliefConfig({ bevel })}
          />
          <Slider
            label="Rotation X"
            value={reliefConfig.rotX}
            min={-45} max={45} step={1}
            unit="°"
            onChange={(rotX) => updateReliefConfig({ rotX })}
          />
          <Slider
            label="Rotation Y"
            value={reliefConfig.rotY}
            min={-90} max={90} step={1}
            unit="°"
            onChange={(rotY) => updateReliefConfig({ rotY })}
          />
          <label className="flex items-center gap-2 text-[11px] text-white/70 cursor-pointer">
            <input
              type="checkbox"
              checked={reliefConfig.autoRotate}
              onChange={(e) => updateReliefConfig({ autoRotate: e.target.checked })}
              className="accent-indigo-500"
            />
            Rotation auto Y
          </label>

          <div className="border-t border-white/10 pt-2 space-y-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
              <Sun className="w-3.5 h-3.5" />
              <span>Éclairage manuel</span>
            </div>

            {/* Directional light */}
            <div className="space-y-2 rounded bg-white/5 p-2">
              <div className="text-[10px] uppercase tracking-wider text-white/50">Lumière directionnelle</div>
              <Slider
                label="Intensité"
                value={reliefConfig.lighting.directionalIntensity}
                min={0} max={3} step={0.05}
                unit="×"
                onChange={(directionalIntensity) => updateReliefLighting({ directionalIntensity })}
              />
              <ColorRow
                label="Couleur"
                value={reliefConfig.lighting.directionalColor}
                onChange={(directionalColor) => updateReliefLighting({ directionalColor })}
              />
              <Slider
                label="Position X"
                value={reliefConfig.lighting.dirPosX}
                min={-5} max={5} step={0.1}
                onChange={(dirPosX) => updateReliefLighting({ dirPosX })}
              />
              <Slider
                label="Position Y"
                value={reliefConfig.lighting.dirPosY}
                min={-5} max={5} step={0.1}
                onChange={(dirPosY) => updateReliefLighting({ dirPosY })}
              />
              <Slider
                label="Position Z"
                value={reliefConfig.lighting.dirPosZ}
                min={1} max={10} step={0.1}
                onChange={(dirPosZ) => updateReliefLighting({ dirPosZ })}
              />
            </div>

            {/* Ambient light */}
            <div className="space-y-2 rounded bg-white/5 p-2">
              <div className="text-[10px] uppercase tracking-wider text-white/50">Lumière ambiante</div>
              <Slider
                label="Intensité"
                value={reliefConfig.lighting.ambientIntensity}
                min={0} max={2} step={0.05}
                unit="×"
                onChange={(ambientIntensity) => updateReliefLighting({ ambientIntensity })}
              />
              <ColorRow
                label="Couleur"
                value={reliefConfig.lighting.ambientColor}
                onChange={(ambientColor) => updateReliefLighting({ ambientColor })}
              />
            </div>
          </div>

          <p className="text-[10px] text-white/40 leading-tight pt-1">
            Astuce : cliquer-glisser sur l'overlay 3D pour orienter le mesh à la souris.
          </p>
        </div>
      )}

      {/* Play / Stop */}
      <div className="flex gap-2 pt-1">
        {!playing ? (
          <button
            onClick={handleStart}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] font-semibold py-2 transition"
          >
            <Play className="w-3.5 h-3.5" />
            Lancer l'animation
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-red-500/90 hover:bg-red-500 text-white text-[12px] font-semibold py-2 transition"
          >
            <Square className="w-3.5 h-3.5" />
            Arrêter
          </button>
        )}
      </div>

      {/* Persistence (Firestore via auto-save) */}
      {selectedId && (
        <div className="flex gap-2 pt-1 border-t border-white/10">
          <button
            onClick={handlePersist}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 text-[11px] font-semibold py-1.5 transition"
            title="Sauvegarder l'animation sur l'objet — sera réappliquée à l'ouverture du projet"
          >
            <Save className="w-3 h-3" />
            Appliquer
          </button>
          {persistedAnimation && (
            <button
              onClick={handleClearPersist}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 text-[11px] font-semibold py-1.5 px-3 transition"
              title="Retirer l'animation persistante"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {persistedAnimation && (
        <div className="text-[10.5px] text-emerald-300/80 leading-tight border-t border-emerald-500/15 pt-2">
          ✓ Animation <b>{PRESETS.find((p) => p.id === persistedAnimation.preset)?.label}</b> persistée sur l'objet.
        </div>
      )}

      {/* Export WebM */}
      <div className="pt-1 border-t border-white/10">
        <button
          onClick={handleExportWebM}
          disabled={recorder.recording}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 text-[11px] font-semibold py-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
          title="Enregistre un cycle complet de l'animation en WebM via MediaRecorder"
        >
          {recorder.recording ? (
            <>
              <Circle className="w-3 h-3 fill-red-500 text-red-500 animate-pulse" />
              Enregistrement {(recorder.durationMs / 1000).toFixed(1)}s
            </>
          ) : (
            <>
              <Download className="w-3 h-3" />
              Exporter en WebM
            </>
          )}
        </button>
        <div className="text-[10px] text-white/40 mt-1 text-center">
          Capture {(Math.max(2, config.duration + 0.5)).toFixed(1)}s à 30 fps · VP9 8 Mbps
        </div>
      </div>

      {config.preset === 'particles' && (
        <div className="text-[10.5px] text-white/45 leading-tight border-t border-white/10 pt-2">
          {particlesActive
            ? 'Particules Three.js actives en overlay du canvas. Cliquez Arrêter pour stopper.'
            : 'Particules rendues en overlay Three.js au-dessus du canvas. Cliquez Lancer pour démarrer.'}
        </div>
      )}
    </div>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (v: number) => void
}

function Slider({ label, value, min, max, step, unit, onChange }: SliderProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10.5px] text-white/60">
        <span>{label}</span>
        <span className="tabular-nums text-white/80">
          {Number.isInteger(step) ? value.toFixed(0) : value.toFixed(2)}
          {unit ?? ''}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500"
      />
    </div>
  )
}

interface ColorRowProps {
  label: string
  value: string
  onChange: (v: string) => void
}

function ColorRow({ label, value, onChange }: ColorRowProps) {
  return (
    <div className="flex items-center justify-between gap-2 text-[10.5px] text-white/60">
      <span>{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-5 w-7 rounded border border-white/20 bg-transparent cursor-pointer"
        />
        <span className="tabular-nums text-white/70 font-mono text-[10px]">{value.toUpperCase()}</span>
      </div>
    </div>
  )
}
