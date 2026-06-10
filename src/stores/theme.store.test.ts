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
})
