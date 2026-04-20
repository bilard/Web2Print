import '@/types/fabric'
import { useEffect } from 'react'
import { IText, Textbox } from 'fabric'
import type { Canvas, FabricObject } from 'fabric'
import { useTextboxToggle } from './useTextboxToggle'

/**
 * Hook that integrates useTextboxToggle into canvas event handlers.
 *
 * On double-click a Textbox: converts to IText (editable mode)
 * On text:editing:exited: converts back to Textbox (read-only wrapped mode)
 */
export function useTextEditMode(fabricRef: React.MutableRefObject<Canvas | null>) {
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    const { toggleToEditMode, toggleToReadMode } = useTextboxToggle(canvas)

    // Enter edit mode on double-click of a Textbox
    const handleDoubleClick = (e: any) => {
      const target = e.target as FabricObject | undefined
      if (!target) return

      // Check if it's a Textbox by type to avoid instanceof issues
      const isTextbox = target.type === 'textbox' || (target instanceof Textbox)
      if (isTextbox) {
        toggleToEditMode(target as Textbox)
      }
    }

    // Exit edit mode when text editing is finished
    const handleTextEditingExited = (e: any) => {
      const target = e.target as FabricObject | undefined
      if (!target) return

      // Check if it's an IText that was originally a Textbox
      const isIText = target.type === 'i-text' || (target instanceof IText)
      if (isIText) {
        const data = (target as any).data as Record<string, unknown> | undefined
        // Only convert back if this was originally a Textbox (has originalWidth)
        if (data?.originalWidth !== undefined) {
          toggleToReadMode(target as IText)
        }
      }
    }

    canvas.on('object:dblclick' as any, handleDoubleClick)
    canvas.on('text:editing:exited' as any, handleTextEditingExited)

    return () => {
      canvas.off('object:dblclick' as any, handleDoubleClick)
      canvas.off('text:editing:exited' as any, handleTextEditingExited)
    }
  }, [fabricRef])
}
