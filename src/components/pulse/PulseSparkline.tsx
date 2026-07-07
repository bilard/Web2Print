import { useId } from 'react'

interface PulseSparklineProps {
  values: number[]
  /** Hauteur du tracé en unités de viewBox (largeur fixée à 100). */
  height?: number
  stroke?: string
  /** Remplit l'aire sous la courbe avec un dégradé de `stroke`. */
  area?: boolean
  strokeWidth?: number
  /** Point lumineux sur la dernière valeur (effet « moniteur cardiaque »). */
  leadingDot?: boolean
  className?: string
  ariaLabel?: string
}

/** Sparkline SVG responsive (ligne + aire optionnelle). Base des tracés de Pulse. */
export function PulseSparkline({
  values,
  height = 32,
  stroke = 'var(--pulse-accent)',
  area = false,
  strokeWidth = 2,
  leadingDot = false,
  className,
  ariaLabel,
}: PulseSparklineProps) {
  const gid = useId().replace(/:/g, '')
  const W = 100
  const n = values.length
  const max = Math.max(1, ...values)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const pad = strokeWidth
  const x = (i: number) => (n <= 1 ? W : (i / (n - 1)) * W)
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2)

  const pts = values.map((v, i) => [x(i), y(v)] as const)
  const line = pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(2)},${py.toFixed(2)}`).join(' ')
  const areaPath = `${line} L${W},${height} L0,${height} Z`
  const last = pts[pts.length - 1]

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.34" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && n > 1 && <path d={areaPath} fill={`url(#fill-${gid})`} stroke="none" />}
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {leadingDot && last && (
        <>
          <circle cx={last[0]} cy={last[1]} r={5} fill={stroke} opacity="0.25" className="pulse-live-dot" />
          <circle cx={last[0]} cy={last[1]} r={2.6} fill={stroke} vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
  )
}
