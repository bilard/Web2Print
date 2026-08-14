// Largeur en PIXELS d'un conteneur, suivie au redimensionnement.
//
// ⚠⚠ `react-grid-layout` exige une largeur en pixels, et depuis l'ossature à trois volets ce
// n'est PLUS celle de l'écran : les volets Filtres / Visualisations / Champs en prennent près
// de 750 px. Mesurer l'écran ferait déborder la grille sous les volets, silencieusement.
//
// ⚠ Le repli n'est pas zéro : une grille de largeur nulle empile toutes les tuiles en colonne
// pendant la frame qui précède la première mesure. Mieux vaut une largeur plausible.
import { useEffect, useRef, useState } from 'react'

const FALLBACK_WIDTH = 1200

export function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(FALLBACK_WIDTH)

  useEffect(() => {
    const el = ref.current
    // ⚠ Le conteneur mesuré doit être monté dans TOUS les cas : un `ref` porté par une
    // branche conditionnelle resterait `null`, et cet effet (déps `[]`) ne re-tenterait
    // jamais — la largeur resterait figée au repli toute la session.
    if (!el) return
    setWidth(el.clientWidth || FALLBACK_WIDTH)
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ⚠ Tuple FIGÉ (`as const`) : sans lui, l'inférence rendrait un tableau union et le `ref`
  // déstructuré ne serait plus typé pour un `<div ref={…}>`.
  return [ref, width] as const
}
