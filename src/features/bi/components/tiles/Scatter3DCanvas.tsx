// Le canevas WebGL du nuage 3D et son info-bulle. Chargé À LA DEMANDE (`React.lazy` côté
// `Scatter3DTile`) : three.js pèse quelques centaines de kilo-octets, et un tableau de bord
// qui ne porte aucune tuile 3D ne doit pas les télécharger.
//
// ⚠⚠ Deux réveils, pas un. Le rendu est à la demande (cf. `scatter3dScene`), donc rien ne
// rattraperait un canevas monté à 0 × 0 — onglet masqué, tuile encore non mesurée par
// `react-grid-layout` — qui resterait VIDE pour toujours. Le `ResizeObserver` couvre le
// redimensionnement d'une tuile (que `window.resize` ne voit pas), `visibilitychange` couvre
// le retour d'un onglet masqué.
import { useEffect, useRef, useState } from 'react'
import { Scatter3DScene, type Scatter3DTheme } from './scatter3dScene'
import type { Scatter3DModel } from './scatter3dData'

interface Hover { index: number; x: number; y: number }

export default function Scatter3DCanvas({ model, theme, axisLabels, formatAt }: {
  model: Scatter3DModel
  theme: Scatter3DTheme
  axisLabels: readonly [string, string, string]
  /** Valeur brute formatée dans l'unité de l'axe (euros, pourcentage…). */
  formatAt: (axis: 0 | 1 | 2, value: number) => string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<Scatter3DScene | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  // ⚠ Lues par l'effet de création SANS y figurer en dépendance : une scène refaite (bascule
  // de thème) doit reposer le contenu COURANT, pas celui du montage.
  const modelRef = useRef(model)
  const labelsRef = useRef(axisLabels)
  modelRef.current = model
  labelsRef.current = axisLabels

  // ⚠⚠ La scène ne se refait QUE si le thème change. Un filtre posé sur la page change
  // `model` : reconstruire alors la scène entière recréerait un contexte WebGL (le
  // navigateur en plafonne le nombre) et ramènerait la caméra à son angle d'origine au
  // milieu d'une exploration. Le contenu se remplace en place, par les deux effets suivants.
  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!canvas || !host) return
    const scene = new Scatter3DScene({ canvas, theme })
    sceneRef.current = scene
    scene.setAxisLabels(labelsRef.current)
    scene.setPoints(modelRef.current.points)
    const fit = () => scene.resize(host.clientWidth, host.clientHeight)
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(host)
    // ⚠ Un canevas monté pendant que l'onglet est masqué n'a rien pu dessiner : on redemande
    // une image au retour, sinon la tuile reste blanche jusqu'au premier geste de souris.
    const wake = () => { if (!document.hidden) fit() }
    document.addEventListener('visibilitychange', wake)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', wake)
      scene.dispose()
      sceneRef.current = null
    }
  }, [theme])

  useEffect(() => { sceneRef.current?.setPoints(model.points) }, [model])
  useEffect(() => { sceneRef.current?.setAxisLabels(axisLabels) }, [axisLabels])

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const host = hostRef.current
    const scene = sceneRef.current
    if (!host || !scene) return
    const box = host.getBoundingClientRect()
    const x = e.clientX - box.left
    const y = e.clientY - box.top
    const index = scene.pick(x, y, box.width, box.height)
    setHover(index === null ? null : { index, x, y })
  }

  const point = hover ? model.points[hover.index] : null

  return (
    <div
      ref={hostRef} className="relative h-full w-full touch-none"
      onPointerMove={onMove} onPointerLeave={() => setHover(null)}
    >
      <canvas ref={canvasRef} className="block h-full w-full cursor-grab active:cursor-grabbing" />
      {point && hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-white/10 bg-surface-2
            px-2 py-1.5 text-[11px] leading-snug shadow-lg"
          /* ⚠ Décalé sous le curseur : posée dessus, l'info-bulle masquerait le point même
             qu'on interroge, et le survol suivant partirait d'elle. */
          style={{ left: Math.min(hover.x + 12, 9999), top: hover.y + 12, maxWidth: '60%' }}
        >
          {point.label && <p className="font-medium text-white">{point.label}</p>}
          {([0, 1, 2] as const).map((axis) => (
            <p key={axis} className="text-white/60">
              {axisLabels[axis]} : <span className="text-white/85">
                {formatAt(axis, axis === 0 ? point.x : axis === 1 ? point.y : point.z)}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
