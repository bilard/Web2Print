import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IText, Textbox, Canvas } from 'fabric'
import { useTextboxToggle } from './useTextboxToggle'

describe('useTextboxToggle', () => {
  let canvas: Canvas
  let textbox: Textbox

  beforeEach(() => {
    // Mock requestAnimationFrame to prevent jsdom render issues
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => {
      cb(0)
      return 0
    }))

    // Create a test canvas
    const el = document.createElement('canvas')
    el.width = 800
    el.height = 600
    canvas = new Canvas(el, { width: 800, height: 600, renderOnAddRemove: false })

    // Create a test Textbox with stored originalWidth
    textbox = new Textbox('Hello World', {
      left: 100,
      top: 100,
      width: 200,
      fontSize: 16,
      fill: 'black',
    })
    const anyTextbox = textbox as unknown as { data?: Record<string, unknown> }
    anyTextbox.data = { originalWidth: 200 }

    canvas.add(textbox)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    canvas.dispose()
  })

  it('toggles Textbox to IText on enter edit mode', () => {
    const { toggleToEditMode } = useTextboxToggle(canvas)
    const itext = toggleToEditMode(textbox)

    expect(itext instanceof IText).toBe(true)
    expect(itext instanceof Textbox).toBe(false)
    expect(itext.text).toBe('Hello World')
    expect(canvas.getActiveObject()).toBe(itext)
  })

  it('preserves originalWidth when converting to IText', () => {
    const { toggleToEditMode } = useTextboxToggle(canvas)
    const itext = toggleToEditMode(textbox)
    const anyItext = itext as unknown as { data?: Record<string, unknown> }

    expect(anyItext.data?.originalWidth).toBe(200)
  })

  it('toggles IText back to Textbox on exit edit mode', () => {
    const { toggleToEditMode, toggleToReadMode } = useTextboxToggle(canvas)
    const itext = toggleToEditMode(textbox)
    const newTextbox = toggleToReadMode(itext)

    expect(newTextbox instanceof Textbox).toBe(true)
    expect(newTextbox.text).toBe('Hello World')
    expect((newTextbox as Textbox).width).toBe(200)
    expect(canvas.getActiveObject()).toBe(newTextbox)
  })

  it('preserves text modifications during edit cycle', () => {
    const { toggleToEditMode, toggleToReadMode } = useTextboxToggle(canvas)
    const itext = toggleToEditMode(textbox)

    // Simulate text modification
    itext.text = 'Modified Text'

    const newTextbox = toggleToReadMode(itext)
    expect(newTextbox.text).toBe('Modified Text')
  })

  it('preserves styles during edit cycle', () => {
    const styledTextbox = new Textbox('Styled', {
      left: 100,
      top: 100,
      width: 150,
      fill: 'red',
      fontSize: 20,
    })
    canvas.add(styledTextbox)

    const { toggleToEditMode, toggleToReadMode } = useTextboxToggle(canvas)
    const itext = toggleToEditMode(styledTextbox)
    const result = toggleToReadMode(itext)

    expect((result as Textbox).fill).toBe('red')
    expect(result.fontSize).toBe(20)
  })
})
