import { Sun, Moon, Monitor } from 'lucide-react'
import { useThemeStore, type ThemePref } from '@/stores/theme.store'
import { useTranslation, type TranslationKey } from '@/lib/i18n'

const NEXT: Record<ThemePref, ThemePref> = { dark: 'light', light: 'system', system: 'dark' }
const LABELS: Record<ThemePref, TranslationKey> = {
  dark: 'theme.dark',
  light: 'theme.light',
  system: 'theme.system',
}
const ACTION: Record<ThemePref, TranslationKey> = {
  dark: 'theme.action.toLight',
  light: 'theme.action.toSystem',
  system: 'theme.action.toDark',
}

interface ThemeToggleProps {
  /** Classes du bouton — surcharger pour coller au style des boutons voisins */
  className?: string
  /** Classes de l'icône (taille) */
  iconClassName?: string
}

export function ThemeToggle({
  className = 'p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10',
  iconClassName = 'w-4 h-4',
}: ThemeToggleProps) {
  const themePref = useThemeStore((s) => s.themePref)
  const setThemePref = useThemeStore((s) => s.setThemePref)
  const { t } = useTranslation()
  const Icon = themePref === 'light' ? Sun : themePref === 'dark' ? Moon : Monitor
  return (
    <button
      onClick={() => setThemePref(NEXT[themePref])}
      className={`transition-colors ${className}`}
      title={t('theme.hint', { current: t(LABELS[themePref]), action: t(ACTION[themePref]) })}
      aria-label={t('theme.aria')}
    >
      <Icon className={iconClassName} aria-hidden="true" />
    </button>
  )
}
