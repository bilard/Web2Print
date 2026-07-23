import { useEffect, useState } from 'react'

/** `true` quand l'appareil est en PAYSAGE. Piloté par l'orientation (pas la largeur) :
 *  sur iPhone le breakpoint `lg` (1024px) ne se déclenche jamais en paysage (~844px).
 *  Sert à densifier les listes (plus de lignes quand il y a de la place verticale). */
export function useOrientation(): boolean {
  const [landscape, setLandscape] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(orientation: landscape)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)')
    const on = () => setLandscape(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return landscape
}
