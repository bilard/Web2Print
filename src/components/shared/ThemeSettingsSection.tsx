import { useThemeStore, type ThemePref } from '@/stores/theme.store'

const OPTIONS = [
  ['light', 'Clair'],
  ['dark', 'Sombre'],
  ['system', 'Système'],
] as const satisfies ReadonlyArray<readonly [ThemePref, string]>

export function ThemeSettingsSection() {
  const themePref = useThemeStore((s) => s.themePref)
  const setThemePref = useThemeStore((s) => s.setThemePref)
  return (
    <div className="bg-white/[0.03] rounded-xl p-4 space-y-2">
      <h3 className="text-sm font-medium text-white/80">Apparence</h3>
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
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
