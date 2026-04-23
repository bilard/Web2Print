/**
 * Scaling mm → px pour les objets Fabric issus de parseSvgToFabric.
 *
 * Pourquoi pas juste `scaleX *= scale; scaleY *= scale` ?
 *   Les objets texte (Textbox en particulier) ont des propriétés intrinsèques
 *   `fontSize` et `width` qui participent au flow du texte. Quand l'utilisateur
 *   drag le handle latéral d'un Textbox, Fabric change directement `width` et
 *   appelle `initDimensions()` qui reflow avec la `fontSize` actuelle — si
 *   celle-ci est restée en mm (petite valeur), le texte reflow en minuscule.
 *   → pour les textes, on scale les propriétés INTRINSÈQUES (fontSize, width,
 *     styles char-level) et on garde scaleX/scaleY = 1.
 *   → pour les autres objets (Rect, Image, Path…), scaleX/Y est la convention
 *     Fabric standard et le redimensionnement utilisateur l'attend.
 */

import { FabricObject, Group, FabricText, IText, Textbox } from 'fabric'

function isTextObject(obj: FabricObject): obj is FabricText {
  return obj instanceof Textbox || obj instanceof IText || obj instanceof FabricText
}

type StyleMap = Record<number, Record<number, Record<string, unknown>>>

/** Scale tous les fontSize à l'intérieur d'un style map char-level d'un Textbox. */
function scaleTextboxStyles(styles: unknown, scale: number): void {
  if (!styles || typeof styles !== 'object') return
  const map = styles as StyleMap
  for (const lineKey of Object.keys(map)) {
    const lineStyles = map[Number(lineKey)]
    if (!lineStyles || typeof lineStyles !== 'object') continue
    for (const charKey of Object.keys(lineStyles)) {
      const charStyle = lineStyles[Number(charKey)]
      if (!charStyle || typeof charStyle !== 'object') continue
      if (typeof charStyle.fontSize === 'number') {
        charStyle.fontSize = (charStyle.fontSize as number) * scale
      }
    }
  }
}

function scaleTextIntrinsic(obj: FabricText, scale: number): void {
  const newLeft = (obj.left ?? 0) * scale
  const newTop = (obj.top ?? 0) * scale
  const newFontSize = (obj.fontSize ?? 16) * scale

  const update: Record<string, unknown> = {
    left: newLeft,
    top: newTop,
    fontSize: newFontSize,
    scaleX: 1,
    scaleY: 1,
  }

  // Width n'a de sens que pour Textbox (IText/Text la recalculent dynamiquement).
  if (obj instanceof Textbox) {
    update.width = (obj.width ?? 0) * scale
  }

  // Espacement de caractères si défini en unités SVG/mm
  if (typeof obj.charSpacing === 'number' && obj.charSpacing !== 0) {
    update.charSpacing = (obj.charSpacing as number) * scale
  }

  // Épaisseur de stroke — rare sur nos textes mais on scale pour cohérence
  if (typeof obj.strokeWidth === 'number' && obj.strokeWidth > 0) {
    update.strokeWidth = (obj.strokeWidth as number) * scale
  }

  // Styles char-level
  const anyObj = obj as FabricText & { styles?: StyleMap }
  if (anyObj.styles) {
    scaleTextboxStyles(anyObj.styles, scale)
  }

  obj.set(update)

  // Force le re-flow avec les nouvelles dimensions (Textbox seulement).
  if (obj instanceof Textbox) {
    // initDimensions() est typé interne mais exposé sur le prototype Textbox
    const initDim = (obj as unknown as { initDimensions?: () => void }).initDimensions
    if (typeof initDim === 'function') initDim.call(obj)
  }
}

function scaleGenericObject(obj: FabricObject, scale: number): void {
  obj.left = (obj.left ?? 0) * scale
  obj.top = (obj.top ?? 0) * scale
  obj.scaleX = (obj.scaleX ?? 1) * scale
  obj.scaleY = (obj.scaleY ?? 1) * scale
}

export function scaleObjectForCanvas(obj: FabricObject, scale: number): void {
  if (isTextObject(obj)) {
    scaleTextIntrinsic(obj, scale)
  } else if (obj instanceof Group) {
    // Un groupe peut contenir des textes. On scale le groupe globalement pour
    // préserver la hiérarchie de transformations, MAIS on doit aussi scaler
    // les fontSize intrinsèques des textes enfants pour survivre à un
    // détachement/édition futur. Approche pragmatique : scale les enfants
    // textes intrinsèquement, scale le groupe via scaleX/Y.
    const children = (obj as Group & { _objects?: FabricObject[] })._objects ?? []
    for (const child of children) {
      if (isTextObject(child)) {
        // On touche seulement aux propriétés intrinsèques ; la position du child
        // dans le groupe est relative et sera gérée par le scaling du groupe.
        const c = child as FabricText & { styles?: StyleMap }
        child.set({ fontSize: (child.fontSize ?? 16) * scale })
        if (child instanceof Textbox) child.set({ width: (child.width ?? 0) * scale })
        if (c.styles) scaleTextboxStyles(c.styles, scale)
      }
    }
    scaleGenericObject(obj, scale)
  } else {
    scaleGenericObject(obj, scale)
  }
  obj.setCoords()
}
