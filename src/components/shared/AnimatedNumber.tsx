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
    // ⚠⚠ Onglet MASQUÉ : `requestAnimationFrame` ne bat pas. Lancer l'animation y figerait
    // le nombre à mi-course — un chiffre FAUX affiché pour toujours, sans rien qui le dise.
    // Relevé en prod sur le module BI : un KPI resté à 60 156 entre son ancien total et sa
    // vraie valeur filtrée. Onglet caché = pas d'animation, la cible directement.
    if (typeof document !== 'undefined' && document.hidden) {
      fromRef.current = target; setVal(target); return
    }
    let start: number | null = null
    const step = (ts: number) => {
      if (start == null) start = ts
      const t = Math.min(1, (ts - start) / durationMs)
      setVal(from + (target - from) * easeOutCubic(t))
      if (t < 1) rafRef.current = requestAnimationFrame(step)
      else { fromRef.current = target; setVal(target) }
    }
    rafRef.current = requestAnimationFrame(step)
    // ⚠⚠ Filet : l'onglet peut passer en arrière-plan APRÈS le départ, et les frames
    // s'arrêtent alors en cours de route. Les timers, eux, sont ralentis mais jamais gelés :
    // celui-ci pose la cible quoi qu'il arrive. Au repos il ne coûte rien (même valeur).
    const guard = setTimeout(() => { fromRef.current = target; setVal(target) }, durationMs + 250)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      clearTimeout(guard)
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
