// src/features/priceWatch/dashboard/Sparkline.tsx
// Mini-courbe SVG pour les tuiles KPI. < 2 points → rien (pas de pic trompeur).
export function Sparkline({ values, color = '#818cf8', width = 60, height = 16 }: {
  values: number[]; color?: string; width?: number; height?: number
}) {
  if (values.length < 2) return <span className="inline-block" style={{ width, height }} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const xy = (v: number, i: number): [number, number] => [
    (i / (values.length - 1)) * width,
    height - ((v - min) / range) * (height - 2) - 1,
  ]
  const points = values.map((v, i) => xy(v, i).join(',')).join(' ')
  const [lx, ly] = xy(values[values.length - 1], values.length - 1)
  return (
    <svg width={width} height={height} className="block">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
      <circle cx={lx} cy={ly} r={1.7} fill={color} />
    </svg>
  )
}
