// L'étage central de l'écran : rail de vues · canevas · trois volets.
//
// ⚠⚠ La grille exige une largeur en PIXELS, et ce n'est plus celle de l'écran depuis que les
// volets en prennent près de 750. C'est donc le canevas — et lui seul — qui est mesuré, et
// il livre sa largeur au rendu de la grille (`canvas(width)`).
//
// ⚠ En consultation, ni rail ni volets : la seule vue disponible est déjà celle qu'on
// regarde, et les zones de dépôt n'ont pas d'objet sans geste d'édition. L'écran rend alors
// tout l'espace aux chiffres.
import type { ReactNode } from 'react'
import { BiViewRail } from './BiViewRail'
import { useMeasuredWidth } from '../hooks/useMeasuredWidth'

export function BiWorkspace({ editing, crossbar, canvas, panels, captureRef, sourceRail }: {
  editing: boolean
  /** Volet « Source » : le jeu de données sur lequel porte le tableau. Édition seulement —
   *  ce choix écrit dans le document. */
  sourceRail?: ReactNode
  /** Zone à capturer pour l'export image/PDF : le canevas AVEC son bandeau de filtres — un
   *  visuel exporté sans ses filtres se lit comme un total. */
  captureRef?: React.Ref<HTMLDivElement>
  /** Bandeau des filtres actifs, au-dessus du canevas. Absent = pas de barre. */
  crossbar?: ReactNode
  /** Rendu de la grille, à la largeur MESURÉE du canevas. */
  canvas: (width: number) => ReactNode
  /** Les trois volets, montés par le tableau de bord qui possède leur état. */
  panels: ReactNode
}) {
  const [ref, width] = useMeasuredWidth()

  return (
    <div className="flex-1 min-h-0 flex">
      {editing && <BiViewRail />}
      {/* ⚠ Le volet reste visible en CONSULTATION : on y change de suivi ou de base sans
          rien modifier au document (aperçu). Seul le changement de NATURE du jeu de données
          — qui rebâtit les tuiles — demande le mode Édition. */}
      {sourceRail}

      <div ref={captureRef} className="flex-1 min-w-0 flex flex-col bg-background">
        {crossbar}
        {/* ⚠ `data-bi-scroll` : l'export image DÉPLIE ce conteneur le temps de la capture.
            Sans lui, un tableau plus haut que l'écran sortirait coupé — un extrait lu comme
            s'il était le tout, exactement ce que le classeur refuse déjà. */}
        <div data-bi-scroll className="flex-1 min-h-0 overflow-auto p-3">
          {/* ⚠ Le conteneur mesuré est SANS marge intérieure, et monté dans tous les cas :
              une marge fausserait la largeur transmise à la grille (`clientWidth` la compte,
              `contentRect` non), et un `ref` sur une branche conditionnelle resterait `null`. */}
          <div ref={ref}>{canvas(width)}</div>
        </div>
      </div>

      {editing && panels}
    </div>
  )
}
