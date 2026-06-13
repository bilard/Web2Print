import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useHelpStore } from './help.store'

describe('help.store', () => {
  beforeEach(() => {
    useHelpStore.getState().setHighlightTarget(null)
    useHelpStore.setState({
      open: false,
      currentSectionId: null,
      highlightTarget: null,
      activeContext: null,
      followContext: false,
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

  it('openDrawer jumps to the active context article (images → dam)', () => {
    useHelpStore.getState().setActiveContext('images')
    useHelpStore.getState().openDrawer()
    expect(useHelpStore.getState().currentSectionId).toBe('dam')
  })

  it('toggleDrawer re-syncs to the context article when opening', () => {
    // L'utilisateur avait lu un autre article puis fermé le panneau…
    useHelpStore.setState({ currentSectionId: 'dam', open: false })
    useHelpStore.getState().setActiveContext('data')
    useHelpStore.getState().toggleDrawer()
    expect(useHelpStore.getState().open).toBe(true)
    expect(useHelpStore.getState().currentSectionId).toBe('pim')
  })

  it('openDrawer keeps the selection when no context is set', () => {
    useHelpStore.setState({ currentSectionId: 'editor', open: false })
    useHelpStore.getState().setActiveContext(null)
    useHelpStore.getState().openDrawer()
    expect(useHelpStore.getState().currentSectionId).toBe('editor')
  })

  it('live-refreshes the article when the module changes while following context', () => {
    useHelpStore.getState().setActiveContext('images')
    useHelpStore.getState().openDrawer() // affiche « dam », followContext = true
    expect(useHelpStore.getState().currentSectionId).toBe('dam')
    // L'utilisateur passe au module PIM sans fermer l'aide → l'article suit en live.
    useHelpStore.getState().setActiveContext('data')
    expect(useHelpStore.getState().currentSectionId).toBe('pim')
  })

  it('stops following context once the user picks an article manually', () => {
    useHelpStore.getState().setActiveContext('images')
    useHelpStore.getState().openDrawer()
    useHelpStore.getState().goToSection('export') // choix explicite
    useHelpStore.getState().setActiveContext('data') // change de module…
    // …mais on ne l'arrache pas de l'article qu'il lit.
    expect(useHelpStore.getState().currentSectionId).toBe('export')
    expect(useHelpStore.getState().activeContext).toBe('data')
  })

  it('does not change the article when the drawer is closed', () => {
    useHelpStore.setState({ currentSectionId: 'dam', open: false, followContext: true })
    useHelpStore.getState().setActiveContext('data')
    expect(useHelpStore.getState().currentSectionId).toBe('dam')
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
