// src/features/priceWatch/dashboard/AnimatedNumber.tsx
// Comptage animé : quand la valeur change (nouveau rapport/méta via onSnapshot), le nombre
// « roule » de l'ancienne à la nouvelle valeur (~700 ms, easing), pour VOIR la donnée évoluer.
// rAF uniquement pendant la transition → aucun coût au repos. Timestamp fourni par rAF
// (pas de Date.now()).
import { useEffect, useRef, useState } from 'react'

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

/** Interpole en douceur vers `target` à chaque changement. Renvoie la valeur courante animée. */
export function useAnimatedValue(target: number, durationMs = 700): number {
  const [val, setVal] = useState(target)
  const fromRef = useRef(target)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const from = fromRef.current
    if (from === target || !Number.isFinite(target)) { fromRef.current = target; setVal(target); return }
    let start: number | null = null
    const step = (ts: number) => {
      if (start == null) start = ts
      const t = Math.min(1, (ts - start) / durationMs)
      setVal(from + (target - from) * easeOutCubic(t))
      if (t < 1) rafRef.current = requestAnimationFrame(step)
      else { fromRef.current = target; setVal(target) }
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      fromRef.current = target // reprise propre si la cible rechange en cours d'anim
    }
  }, [target, durationMs])

  return val
}

/** Nombre animé formaté. `flash` (défaut true) : léger halo à chaque changement de valeur. */
export function AnimatedNumber({ value, format, className, flash = true }: {
  value: number
  format?: (n: number) => string
  className?: string
  flash?: boolean
}) {
  const animated = useAnimatedValue(value)
  const prevRef = useRef(value)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    if (prevRef.current !== value) {
      prevRef.current = value
      if (flash) { setPulse(true); const id = setTimeout(() => setPulse(false), 650); return () => clearTimeout(id) }
    }
  }, [value, flash])

  const text = format ? format(animated) : Math.round(animated).toLocaleString('fr-FR')
  return (
    <span className={`${className ?? ''} inline-block origin-left transition-transform duration-300 ${pulse ? 'scale-[1.06]' : ''}`}>
      {text}
    </span>
  )
}
