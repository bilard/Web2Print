import { describe, it, expect, beforeEach, vi } from 'vitest'

// matchMedia n'existe pas en jsdom — mock avant l'import du store.
const matchMediaMock = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
})
vi.stubGlobal('matchMedia', matchMediaMock)

const { useThemeStore, initialThemePref } = await import('./theme.store')

describe('theme.store', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = 'dark'
    useThemeStore.getState().setThemePref('dark')
  })

  it('défaut = dark sans préférence enregistrée', () => {
    localStorage.clear()
    expect(initialThemePref()).toBe('dark')
  })

  it('setThemePref(light) pose html.light, retire html.dark et persiste', () => {
    useThemeStore.getState().setThemePref('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('themePref')).toBe('light')
    expect(useThemeStore.getState().resolvedTheme).toBe('light')
  })

  it('system résout via matchMedia (mock → dark)', () => {
    useThemeStore.getState().setThemePref('system')
    expect(useThemeStore.getState().resolvedTheme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('ignore une valeur corrompue en localStorage', () => {
    localStorage.setItem('themePref', 'banana')
    expect(initialThemePref()).toBe('dark')
  })

  it('retourne dark si localStorage.getItem throw (Safari privé)', () => {
    // NB : le setup de test remplace localStorage par un objet en mémoire
    // (src/test/setup.ts) qui n'hérite pas de Storage.prototype → on spy
    // directement l'instance, sinon le mock ne serait jamais invoqué.
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    try {
      expect(initialThemePref()).toBe('dark')
    } finally {
      spy.mockRestore()
    }
  })
})
