/// <reference path="../../types/fabric.d.ts" />
import { IText, Textbox } from 'fabric'
import type { Canvas, FabricObject } from 'fabric'

/**
 * Hook to toggle a Textbox between editable (IText) and read-only (Textbox) modes.
 *
 * On double-click: Textbox → IText (editable, no wrapping constraint)
 * On blur: IText → Textbox (re-wrapped with original width)
 *
 * The originalWidth is stored in obj.data and used to re-apply wrapping when exiting edit mode.
 */
export function useTextboxToggle(canvas: Canvas) {
  const toggleToEditMode = (textbox: Textbox): IText => {
    // Store original width from data or current width
    const originalWidth =
      ((textbox.data as Record<string, unknown> | undefined)?.originalWidth as number | undefined) ??
      textbox.width

    // Create IText from Textbox
    const itext = new IText(textbox.text ?? '', {
      left: textbox.left,
      top: textbox.top,
      fontSize: textbox.fontSize,
      fontFamily: textbox.fontFamily,
      fontWeight: textbox.fontWeight,
      fontStyle: textbox.fontStyle,
      fill: textbox.fill,
      stroke: textbox.stroke,
      strokeWidth: textbox.strokeWidth,
      opacity: textbox.opacity,
      scaleX: textbox.scaleX,
      scaleY: textbox.scaleY,
      angle: textbox.angle,
      // Copy rich text styles if they exist
      styles: (textbox as unknown as { styles?: Record<number, Record<number, Record<string, unknown>>> }).styles,
    })

    // Copy metadata
    const anyItext = itext as FabricObject & { data?: Record<string, unknown> }
    anyItext.data = {
      ...(textbox.data ?? {}),
      originalWidth,
    }

    // Replace in canvas
    const idx = canvas.getObjects().indexOf(textbox)
    if (idx >= 0) {
      const objs = canvas.getObjects()
      canvas.clear()
      objs[idx] = itext
      objs.forEach((obj) => canvas.add(obj))
      canvas.setActiveObject(itext)
      itext.selectAll()
      canvas.renderAll()
    }

    return itext
  }

  const toggleToReadMode = (itext: IText): Textbox => {
    const originalWidth =
      ((itext.data as Record<string, unknown> | undefined)?.originalWidth as number | undefined) ??
      itext.width

    // Create Textbox from IText
    const textbox = new Textbox(itext.text ?? '', {
      left: itext.left,
      top: itext.top,
      width: originalWidth,
      fontSize: itext.fontSize,
      fontFamily: itext.fontFamily,
      fontWeight: itext.fontWeight,
      fontStyle: itext.fontStyle,
      fill: itext.fill,
      stroke: itext.stroke,
      strokeWidth: itext.strokeWidth,
      opacity: itext.opacity,
      scaleX: itext.scaleX,
      scaleY: itext.scaleY,
      angle: itext.angle,
      // Copy rich text styles if they exist
      styles: (itext as unknown as { styles?: Record<number, Record<number, Record<string, unknown>>> }).styles,
    })

    // Copy metadata
    const anyTextbox = textbox as FabricObject & { data?: Record<string, unknown> }
    anyTextbox.data = {
      ...(itext.data ?? {}),
    }

    // Replace in canvas
    const idx = canvas.getObjects().indexOf(itext)
    if (idx >= 0) {
      const objs = canvas.getObjects()
      canvas.clear()
      objs[idx] = textbox
      objs.forEach((obj) => canvas.add(obj))
      canvas.setActiveObject(textbox)
      canvas.renderAll()
    }

    return textbox
  }

  return { toggleToEditMode, toggleToReadMode }
}
