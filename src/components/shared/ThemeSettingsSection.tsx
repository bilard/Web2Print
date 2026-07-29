import { useThemeStore, type ThemePref } from '@/stores/theme.store'
import { useTranslation, type TranslationKey } from '@/lib/i18n'

const OPTIONS = [
  ['light', 'theme.pref.light'],
  ['dark', 'theme.pref.dark'],
  ['system', 'theme.pref.system'],
] as const satisfies ReadonlyArray<readonly [ThemePref, TranslationKey]>

export function ThemeSettingsSection() {
  const { t } = useTranslation()
  const themePref = useThemeStore((s) => s.themePref)
  const setThemePref = useThemeStore((s) => s.setThemePref)
  return (
    <div className="bg-white/[0.03] rounded-xl p-4 space-y-2">
      <h3 className="text-sm font-medium text-white/80">{t('settings.appearance')}</h3>
      <div className="flex gap-2">
        {OPTIONS.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setThemePref(value)}
            aria-pressed={themePref === value}
            className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
              themePref === value
                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                : 'border-white/10 text-white/50 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            {t(label)}
          </button>
        ))}
      </div>
    </div>
  )
}
