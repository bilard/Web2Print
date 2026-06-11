/**
 * Propriétés hors-défaut à inclure dans TOUTE sérialisation Fabric (sauvegarde
 * projet, historique undo, navigation de pages, éléments maîtres).
 *
 * `perPixelTargetFind` est posé par l'import SVG/PDF (sélection au pixel
 * dessiné) : sans sérialisation, il disparaît à la réouverture du projet et
 * les paths au cadre englobant (contour de carte, marques de coupe) captent à
 * nouveau tous les clics du canvas.
 */
export const FABRIC_SERIALIZED_PROPS = ['data', 'perPixelTargetFind']
