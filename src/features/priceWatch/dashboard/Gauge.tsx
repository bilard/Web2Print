// Compteur rond façon tableau de bord (arc 270°, gap en bas comme un compte-tours).
// L'arc sert au COUP D'ŒIL ; le NOMBRE au centre porte la vérité (skill dataviz).
// `value` 0..1 remplit l'arc ; `children` = contenu central (grand chiffre + label).
import type { ReactNode } from 'react'
import { useAnimatedValue } from './AnimatedNumber'

const START = 135 // départ bas-gauche (repère SVG, y vers le bas)
const SWEEP = 270

function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const p = (deg: number): [number, number] => {
    const a = (deg * Math.PI) / 180
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  }
  const [x1, y1] = p(fromDeg)
  const [x2, y2] = p(toDeg)
  const large = toDeg - fromDeg > 180 ? 1 : 0
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

export function Gauge({ value, color = '#818cf8', size = 104, children }: {
  value: number
  color?: string
  size?: number
  children: ReactNode
}) {
  const target = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  const v = useAnimatedValue(target, 900) // l'arc « balaie » vers la nouvelle valeur
  const stroke = 7
  const r = (size - stroke) / 2
  const c = size / 2
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <path d={arcPath(c, c, r, START, START + SWEEP)} fill="none" stroke="currentColor"
          className="text-white/[0.08]" strokeWidth={stroke} strokeLinecap="round" />
        {v > 0 && (
          <path d={arcPath(c, c, r, START, START + SWEEP * v)} fill="none" stroke={color}
            strokeWidth={stroke} strokeLinecap="round" />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none px-2">
        {children}
      </div>
    </div>
  )
}
