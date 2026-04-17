import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useHelpStore } from './help.store'

describe('help.store', () => {
  beforeEach(() => {
    useHelpStore.getState().setHighlightTarget(null)
    useHelpStore.setState({
      open: false,
      currentSectionId: null,
      highlightTarget: null,
    })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens and closes the drawer', () => {
    useHelpStore.getState().openDrawer()
    expect(useHelpStore.getState().open).toBe(true)

    useHelpStore.getState().closeDrawer()
    expect(useHelpStore.getState().open).toBe(false)
  })

  it('goToSection opens drawer and sets currentSectionId', () => {
    useHelpStore.getState().goToSection('editor')
    const { open, currentSectionId } = useHelpStore.getState()
    expect(open).toBe(true)
    expect(currentSectionId).toBe('editor')
  })

  it('setHighlightTarget stores the id', () => {
    useHelpStore.getState().setHighlightTarget('toolbar.text')
    expect(useHelpStore.getState().highlightTarget).toBe('toolbar.text')
  })

  it('setHighlightTarget auto-resets after 3 seconds', () => {
    useHelpStore.getState().setHighlightTarget('toolbar.text')
    expect(useHelpStore.getState().highlightTarget).toBe('toolbar.text')

    vi.advanceTimersByTime(3000)
    expect(useHelpStore.getState().highlightTarget).toBe(null)
  })

  it('setHighlightTarget(null) cancels pending reset', () => {
    useHelpStore.getState().setHighlightTarget('toolbar.text')
    expect(vi.getTimerCount()).toBe(1)

    useHelpStore.getState().setHighlightTarget(null)
    expect(vi.getTimerCount()).toBe(0)
    expect(useHelpStore.getState().highlightTarget).toBe(null)
  })

  it('a new target cancels previous timeout', () => {
    useHelpStore.getState().setHighlightTarget('a')
    vi.advanceTimersByTime(1500)
    useHelpStore.getState().setHighlightTarget('b')
    vi.advanceTimersByTime(1500)
    expect(useHelpStore.getState().highlightTarget).toBe('b')
    vi.advanceTimersByTime(1500)
    expect(useHelpStore.getState().highlightTarget).toBe(null)
  })
})
